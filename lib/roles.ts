import type { UserRole } from "@prisma/client";

/**
 * The authorisation rules, with nothing else attached.
 *
 * Separate from lib/auth.ts on purpose, and the separation is load-bearing
 * twice over. proxy.ts needs to know which paths are guarded and cannot import
 * a module that pulls in Prisma and `server-only`. And these are the only part
 * of authorisation that can be tested without a database, a session and a
 * request — so the whole guest/customer/kitchen/admin matrix is settled in
 * tests/auth.test.ts against pure functions rather than against mocks.
 *
 * The `UserRole` import is type-only, so this file has no runtime dependency at
 * all while the Prisma enum stays the single source of the names.
 */

/**
 * Roles are ordered, so authorisation is one comparison rather than a set of
 * memberships. Ordered because the bakery is: whoever reprices the menu is also
 * the person who moves a docket when the counter is busy, which is why §15
 * wants ADMIN admitted to the kitchen. A rank says that once, instead of every
 * kitchen check having to remember to also let admins through.
 *
 * The day a role is genuinely *sideways* rather than higher — a rider who sees
 * addresses but not prices — this stops being a rank and becomes a capability
 * set, and it should be replaced rather than bent.
 *
 * **That day arrived with VENDOR, and the answer was to bend it exactly once
 * rather than replace it.** A partner bakery is sideways in the strong sense:
 * an ADMIN is not a vendor and must not inherit a vendor's orders, because
 * there is no bakery for an owner's account to belong to — `vendorId` is null
 * on every row that is not a vendor, so "the admin's vendor dashboard" is not a
 * thing that could be rendered. A KITCHEN baker is not a vendor either. So
 * VENDOR sits on this ladder at the customer's rung and `allows` below refuses
 * to let anything *into* it, which is one special case in one function with one
 * reason, rather than a rewrite of every call site in the product.
 *
 * The customer's rung specifically, and not a rung of its own, because of where
 * a refusal lands. `requireRole` sends a denied request to /account, which is
 * itself guarded at CUSTOMER — a VENDOR that did not clear that bar would be
 * refused from the page it was refused to, about twice a second. Every rank
 * this build can name clears /account, and VENDOR has to keep that true. It is
 * also simply correct: a vendor user is a signed-in person and their account
 * page is theirs.
 *
 * OWNER is deliberately absent: today it would carry exactly ADMIN's powers,
 * and a role that grants nothing new is one more thing to reason about at every
 * call site. Adding it is one value in the Prisma enum and one line here.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  CUSTOMER: 0,
  /* Not "a junior baker". See above: this rung is about which refusal page they
     can be sent to, and `allows` is what stops it meaning anything more. */
  VENDOR: 0,
  KITCHEN: 1,
  ADMIN: 2,
};

/**
 * The entire authorisation decision.
 *
 * `null` is "not signed in", spelled out rather than left to
 * `ROLE_RANK[undefined!]` producing `NaN` — `NaN >= n` is false by luck rather
 * than by intent, and luck is not a security control. An unrecognised string is
 * refused for the same reason: a token or a row naming a role this build cannot
 * rank is not evidence of anything.
 */
export function allows(role: UserRole | null | undefined, need: UserRole): boolean {
  if (!role) return false;
  /*
   * The one place the ladder is not a ladder. Nothing outranks its way into a
   * vendor's dashboard: an ADMIN has no `vendorId` and a KITCHEN baker is not a
   * partner bakery, so admitting either would mean a screen scoped to a vendor
   * that has no vendor to scope to. An exact match in this direction only —
   * `allows("VENDOR", "CUSTOMER")` stays true, which is what keeps the refusal
   * page reachable; see ROLE_RANK above.
   *
   * Written as `need === "VENDOR"` rather than as a set of capabilities because
   * one sideways role is one special case, and a capability system built for it
   * would be four times the code to express the same four answers. The second
   * sideways role is where this stops being true, and it should be replaced
   * then rather than gaining a second clause here.
   */
  if (need === "VENDOR") return role === "VENDOR";
  const held = ROLE_RANK[role];
  if (held === undefined) return false;
  return held >= ROLE_RANK[need];
}

/**
 * The four outcomes a guard can reach, which is not the same as a boolean.
 *
 * `allows` answers "does this rank clear that bar". A guard has to answer more
 * than that, because a request can also arrive with no session at all, or with
 * a valid session whose role could not be read — no DATABASE_URL on the
 * deployment, a database that did not answer, or a row naming a role this build
 * cannot rank. None of those is a refusal, and collapsing them into `false` is
 * what put a redirect loop into production: a signed-in person was sent to
 * sign in, came back with the same unreadable role, and went round again about
 * twice a second.
 *
 * The distinction that matters is which outcomes may redirect. `sign-in` and
 * `denied` are answers to the visitor and have somewhere useful to send them.
 * `unavailable` is not about the visitor at all, and has nowhere to send them
 * that does not come straight back — see lib/auth's `requireRole`.
 *
 * An unrecognised role is `unavailable` rather than `denied` for that same
 * reason: `denied` routes to /account, which is itself guarded, so a role this
 * build cannot rank would be refused from the page it was refused to. Every
 * rank this build *can* name clears /account, so `denied` never targets the
 * page it sends people to.
 */
export type Verdict = "sign-in" | "unavailable" | "denied" | "allow";

export function verdictFor(
  signedIn: boolean,
  role: UserRole | null | undefined,
  need: UserRole,
): Verdict {
  if (!signedIn) return "sign-in";
  if (!role) return "unavailable";
  // The same guard, for the same reason, as `allows` above: a role this build
  // cannot rank is not evidence of anything.
  if (ROLE_RANK[role] === undefined) return "unavailable";
  return allows(role, need) ? "allow" : "denied";
}

/**
 * Where somebody with this role belongs after they sign in.
 *
 * The three portals in this product answer three different jobs, and landing
 * every non-owner on /account was the one place that arrangement leaked. A
 * partner bakery signing in was shown the *customer's* order history, which they
 * could technically open — ROLE_RANK puts VENDOR on the customer's rung,
 * deliberately, see the note there — and which has nothing of theirs on it. A
 * baker was shown the same.
 *
 * Keyed on the role somebody **holds**, which is the other direction from
 * lib/auth's `areaFor`: that one is keyed on the role a page **needs**, to decide
 * where Clerk should return somebody to after refusing them. Same four
 * destinations, opposite questions, so they are not the same function.
 *
 * CUSTOMER is the fallback rather than a case, because it is also the right
 * answer for a role this build cannot rank: /account is the only one of the four
 * that every rank can open, so it is the one destination that can never bounce
 * somebody straight back out. The same property `verdictFor`'s `denied` relies
 * on.
 */
export function homeFor(role: UserRole | null | undefined): string {
  return role === "ADMIN" ? "/admin"
    : role === "KITCHEN" ? "/kitchen"
    : role === "VENDOR" ? "/vendor"
    : "/account";
}

/**
 * The cookie a guest's order tracking is carried in.
 *
 * Here rather than in lib/guestOrders — which is where everything else about it
 * lives — because proxy.ts needs the *name* and cannot import that module: the
 * proxy runs on the Edge runtime and lib/guestOrders pulls in `node:crypto` and
 * `next/headers`. This file is already the dependency-free one the proxy and
 * the app share, for exactly that reason.
 *
 * The name and nothing else. The proxy reads it only to decide whether a
 * request might be a guest's, and so should be allowed to reach the page that
 * can actually check it. Verifying the signature is lib/guestOrders' job and
 * happens inside the page — see the note on GUEST_TRACKABLE in proxy.ts.
 */
export const GUEST_ORDER_COOKIE = "mmc_orders";

/**
 * What each protected area requires — the one list proxy.ts, the layouts, the
 * pages and the server actions all read. Two lists would be one list and a bug.
 */
export const GUARDED: ReadonlyArray<{ prefix: string; need: UserRole }> = [
  { prefix: "/admin", need: "ADMIN" },
  { prefix: "/kitchen", need: "KITCHEN" },
  { prefix: "/account", need: "CUSTOMER" },
  /*
   * Orders are their own area rather than a section of /account, because a
   * returning customer comes back for one thing and it is not their profile.
   * Same rank as /account: it is the customer's own history, and nothing in it
   * is readable without a session — the pages under it query on the viewer's
   * own id, so an order that is not yours is not found rather than refused.
   */
  { prefix: "/orders", need: "CUSTOMER" },
  /*
   * The partner bakeries' own portal. Its own prefix rather than a section of
   * /admin, because the two have opposite audiences: /admin is the whole shop
   * and this is one company's worth of it. Guarded at VENDOR, which `allows`
   * gives to VENDOR alone — an owner opening this would find a dashboard with
   * no bakery behind it, and a baker has no business in it at all.
   */
  { prefix: "/vendor", need: "VENDOR" },
];

/**
 * The rank a path demands, or null if it is public.
 *
 * Exact segment matching, not `startsWith(prefix)` on its own: `/administrate`
 * is not `/admin`, and more to the point `/admin@evil.com` and `//evil.com`
 * must not read as guarded paths, because this same predicate is what decides
 * whether a `?next=` parameter is safe to redirect somebody to.
 */
export function requirementFor(pathname: string): UserRole | null {
  const hit = GUARDED.find(
    (g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`),
  );
  return hit?.need ?? null;
}

/**
 * A `?next=` value that is safe to send a browser to after signing in.
 *
 * A whitelist by construction rather than a blocklist of tricks: the only
 * destinations that survive are paths inside the three areas that ask people to
 * sign in, which is also the only reason anybody is on the login page. Anything
 * else — an absolute URL, a protocol-relative `//host`, a path nobody is
 * redirected from — becomes the default. Query strings ride along, since
 * `/admin/orders?status=draft` is a real place to be sent back to.
 */
export function safeNext(raw: string | undefined, fallback = "/account"): string {
  if (!raw) return fallback;
  const path = raw.split("?")[0] ?? "";
  return requirementFor(path) ? raw : fallback;
}
