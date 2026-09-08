import { getViewer } from "@/lib/auth";

/**
 * The viewer's own role, and nothing else.
 *
 * This exists for one caller — components/AccountMenu — and for one reason: the
 * role is a column in Postgres, readable only on the server, and the account
 * menu is a client component because the homepage it sits on is statically
 * prerendered. Reading the session during the render of `/` would take that
 * prerender away from a page whose first screen is a 3D hero. So the role comes
 * over the wire instead, on the first open of the menu.
 *
 * ## What it is not
 *
 * It is not a second role system and it is not an authorisation. It calls
 * `getViewer()` — the same function `requireRole` calls, reading the same row —
 * and hands back the one field the browser needs in order to decide **what to
 * draw**. Every door is still shut by the thing behind it: `requireAdmin()` in
 * app/admin/layout.tsx, `requireKitchen()` in app/kitchen/page.tsx, and a guard
 * at the top of every server action either portal can invoke. A response from
 * here that said ADMIN to a customer would change the menu and open nothing.
 *
 * It also cannot be used to *set* a role. There is no POST, no body, and no
 * argument anywhere on this path that could carry one.
 *
 * ## Only ever about the caller
 *
 * There is no `?user=` and there never should be. The subject of this endpoint
 * is whoever holds the session on the request, which is the only person whose
 * role is theirs to know. A guest gets `null`, which is the honest answer and
 * also the one that draws the fewest rows.
 */

/*
 * `auth()` reads the request, so this could never be prerendered anyway — but
 * said out loud rather than inferred, the way app/account/page.tsx says it.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();

  return Response.json(
    { role: viewer?.profile.role ?? null },
    {
      headers: {
        /*
         * The one header on this route that is load-bearing.
         *
         * Next will not cache a dynamic route handler, but Next is not the only
         * thing between this and a browser. A CDN or a corporate proxy holding
         * one person's role and replaying it to the next visitor is a privilege
         * leak with no request in the logs to explain it. `private` bars the
         * shared caches, `no-store` bars the rest.
         */
        "cache-control": "private, no-store",
      },
    },
  );
}
