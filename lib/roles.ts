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
 * OWNER is deliberately absent: today it would carry exactly ADMIN's powers,
 * and a role that grants nothing new is one more thing to reason about at every
 * call site. Adding it is one value in the Prisma enum and one line here.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  CUSTOMER: 0,
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
 * What each protected area requires — the one list proxy.ts, the layouts, the
 * pages and the server actions all read. Two lists would be one list and a bug.
 */
export const GUARDED: ReadonlyArray<{ prefix: string; need: UserRole }> = [
  { prefix: "/admin", need: "ADMIN" },
  { prefix: "/kitchen", need: "KITCHEN" },
  { prefix: "/account", need: "CUSTOMER" },
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
