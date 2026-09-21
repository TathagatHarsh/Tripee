import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { GUEST_ORDER_COOKIE, requirementFor } from "@/lib/roles";

/**
 * Two jobs, and neither of them is the authorisation.
 *
 * ## What this replaced, twice
 *
 * First HTTP Basic with one shared password per staff area — no way to tell one
 * baker from another, no way to revoke a single person. Then Supabase Auth. Now
 * Clerk. The thing worth noticing is how little moved each time: the rules live
 * in lib/roles.ts, the enforcement lives in the pages and actions, and this file
 * has never been more than a doorman.
 *
 * ## Job one: run Clerk on every request
 *
 * `clerkMiddleware()` is what makes `auth()` work anywhere downstream — it reads
 * and verifies the session and attaches it to the request. Without it, every
 * `auth()` call in the app throws. That is why the matcher below is broad where
 * the old one was narrow: this is no longer only a gate, it is the thing that
 * makes identity available at all.
 *
 * It is cheap for a guest. There is no session cookie to verify, so nothing
 * leaves the machine and the builder stays exactly as light as it was.
 *
 * ## Job two: turn a guest away early
 *
 * A request with no session cannot possibly pass a role check, so it is sent to
 * the sign-in page here rather than after a database round-trip.
 *
 * ## What this file deliberately does not do
 *
 * It does not check roles. A role lives in Postgres, reaching Postgres from a
 * proxy means shipping Prisma into it, and — the reason that actually matters —
 * a gate that runs *before* a route is a gate that can be routed around: this is
 * the shape of CVE-2025-29927, where a crafted header persuaded Next to skip
 * middleware entirely. Clerk's own documentation says the same thing in its own
 * words: protect access as close to the resource as possible, in the code that
 * reads or mutates the data.
 *
 * So the real check runs inside the thing being protected, every time:
 * `requireAdmin()` in app/admin/layout.tsx, `requireKitchen()` in
 * app/kitchen/page.tsx, and one at the top of every Server Action either portal
 * can invoke. Delete this file and the portals are still shut; they would only
 * get uglier for the people who belong there.
 *
 * `createRouteMatcher` is deprecated in Clerk 7, and it would have been the
 * wrong tool anyway: lib/roles' `requirementFor` is already the single list of
 * which paths need what, read by this file and by every guard alike. Two lists
 * would be one list and a bug.
 */
/**
 * Whether this deployment has an identity provider at all.
 *
 * Read per request rather than at module load, because a module instance
 * outlives a key rotation on a warm serverless runtime.
 */
function configured(): boolean {
  // Both. `clerkMiddleware` verifies sessions server-side, so it needs the
  // secret key as well as the publishable one — with only the first it throws
  // `Missing secretKey` on the very first request, which is the same outage
  // this function exists to prevent.
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

/**
 * The gate when Clerk is not configured.
 *
 * `clerkMiddleware()` throws on a missing publishable key, and because the
 * matcher below has to be broad — it is what makes `auth()` work anywhere — an
 * unconfigured deployment would answer 500 for **every page on the site**,
 * shopfront and builder included. That is a worse failure than the one it is
 * warning about: lib/db.ts has always held that a deployment missing a
 * dependency should still let somebody design a cake and say plainly what they
 * cannot do, and a staff credential is no reason to take the shop down.
 *
 * So the split is the same as it has always been. Public paths are waved
 * through untouched. Guarded ones get the 503 the Basic Auth gate used to give,
 * naming the variable to set.
 */
function unconfigured(req: NextRequest) {
  if (!requirementFor(req.nextUrl.pathname)) return NextResponse.next();

  return new NextResponse(
    "This deployment has no Clerk instance attached, so nobody can sign in.\n"
    + "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.\n",
    { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

/**
 * One order's own tracking page, which a guest may legitimately reach.
 *
 * `/orders` is guarded at CUSTOMER and stays that way — it answers "every order
 * on this account", which is a question only a session can ask. But a single
 * order beneath it has a second legitimate viewer: somebody who checked out
 * without an account and holds the signed cookie /api/orders gave them. Turning
 * them away here would send them to a sign-in page for an order they placed
 * precisely because they did not want an account.
 *
 * **This exempts them from the doorman, not from the door.** No signature is
 * checked here and nothing is decided here — this file is not where
 * authorisation lives, for the reason set out at length above. All it asks is
 * whether the request carries a tracking cookie at all, which is the cheapest
 * possible "might this be a guest". The page does the real work:
 * app/orders/[ref] verifies the HMAC and pushes the references it names into
 * the `where` clause, or calls `requireRole` and redirects exactly as this
 * middleware used to. Forging the cookie's presence buys a page render and a
 * refusal, and no row is read on the way.
 *
 * Asking for the cookie rather than letting every `/orders/<ref>` through keeps
 * a stranger's refusal where it was: a 307 from the edge, before React renders
 * anything. Without that check the refusal still happened, but as a streamed
 * client-side redirect behind a 200 — a weaker answer and a page render for
 * anybody who types an order URL.
 */
const GUEST_TRACKABLE = /^\/orders\/[^/]+\/?$/;

const withClerk = clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  const need = requirementFor(pathname);
  if (!need) return NextResponse.next();

  // Both come off the *awaited* auth object, not off `auth` itself.
  const { userId, redirectToSignIn } = await auth();
  if (userId) return NextResponse.next();

  if (GUEST_TRACKABLE.test(pathname) && req.cookies.has(GUEST_ORDER_COOKIE)) {
    return NextResponse.next();
  }

  /*
   * `redirectToSignIn` rather than a hand-built URL: Clerk owns where its
   * sign-in page lives and how the return trip is encoded, and duplicating
   * either here is how the two drift apart. `returnBackUrl` is a path inside
   * this app, taken from the matcher rather than from anything a visitor typed.
   */
  return redirectToSignIn({ returnBackUrl: req.nextUrl.pathname });
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return configured() ? withClerk(req, event) : unconfigured(req);
}

/**
 * Broad on purpose, and broader than the gate needs.
 *
 * Clerk's middleware is what makes `auth()` available to Server Components and
 * Route Handlers, so it has to run for any route that might ask who is signed
 * in — including `/api/orders`, which attaches an order to its customer. The
 * pattern is Clerk's documented default: everything except Next's internals and
 * static assets.
 *
 * The *gate* stays narrow regardless: `requirementFor` above returns null for
 * every public path, so a guest opening the builder is waved straight through.
 */
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
