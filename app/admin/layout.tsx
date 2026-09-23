import { PortalAlerts } from "@/components/assignment/PortalAlerts";
import type { Metadata } from "next";
import { getViewerEmail, requireAdmin } from "@/lib/auth";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { db, hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/Shell";
import { GlobalSearch } from "@/components/admin/Filters";
import { ToastProvider } from "@/components/admin/Toast";

/**
 * The admin shell.
 *
 * Deliberately **not** the same paper the customer sees, which is a reversal of
 * what this file used to say and worth recording rather than quietly editing
 * out. The old note argued that "this is the same document from the other side
 * of the counter, and a bakery that recognises its own product in the tool is a
 * bakery that trusts what the tool tells it" — cream paper, mono everywhere,
 * hairline rules, no radius, six text links in a header row.
 *
 * It was a good argument about brand and the wrong one about work. The portal
 * is not a document; it is where somebody reconciles a week of orders, finds a
 * customer by half a phone number and decides what a filling costs. Three
 * things the carbon-copy palette refuses to have are three things a back office
 * needs: a colour that means "this went wrong", a bold weight to separate a
 * table header from a cell, and a nav with room to show that Orders and Kitchen
 * are one job while Cakes and Ingredients are another. So the shop keeps its
 * stationery and the tool gets Inter, a grey canvas, a navy sidebar and one
 * terracotta accent — three products, one brand, which is what §1 and §46 ask
 * for. The palette is in app/globals.css under `a-`; every class in this
 * subtree is namespaced so the two cannot leak into each other.
 *
 * The kitchen board is the third of the three and is a peer rather than a child:
 * /kitchen is where a shift works, and it is linked from the sidebar but not
 * nested under it. ADMIN outranks KITCHEN — see lib/roles' ROLE_RANK — so the
 * link is always live, because the person who reprices the menu is also the
 * person who moves a docket when the counter is busy.
 *
 * ## The gate
 *
 * `requireAdmin()` here rather than only in proxy.ts, and this is the gate that
 * counts. A layout runs for this page and every page nested under it, on the
 * server, on every request, and — unlike a proxy — there is no header anybody
 * can send that skips it. proxy.ts turns guests away early and keeps the
 * session cookie fresh; this decides.
 *
 * It does NOT cover the writes. A Server Action posts to the route it lives on
 * but does not re-run its layout, so every action in ./actions.ts carries its
 * own `requireAdmin()`. Two lines of apparent duplication, and removing either
 * one opens something.
 */

export const metadata: Metadata = {
  title: "Admin — Makemycake",
  robots: { index: false, follow: false },
};

/**
 * `force-dynamic`, on the layout rather than on each page.
 *
 * The header shows live counts of orders that need somebody, so a cached shell
 * is a shell with yesterday's numbers on the bell. Every page under here was
 * already dynamic for its own reasons; declaring it once at the top means a new
 * page cannot forget to.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // First statement, and never inside a try: this refuses by throwing.
  const viewer = await requireAdmin();

  const email = await getViewerEmail();

  /*
   * The two real numbers behind the bell, and the bakery's own name for the
   * wordmark. Read here so every page in the portal shares one query rather
   * than each one counting for itself.
   *
   * §28 asks that notifications be real backend events and not invented ones.
   * These are counts of rows: orders still at `draft` — which lib/orders calls
   * "Awaiting our call", meaning nobody has rung the customer — and open orders
   * past the window they were quoted, where the window is the order's own
   * frozen `leadHours` and not a guess.
   *
   * The overdue count cannot be a `count()` with a WHERE clause, because the
   * comparison is against `createdAt + leadHours * interval`, which is
   * per-row arithmetic Prisma's query builder cannot express. Raw SQL rather
   * than pulling every open order into memory to filter it — and nothing a
   * customer typed is interpolated; the only parameter is a timestamp this file
   * computed.
   */
  const [bakery, alerts] = await Promise.all([
    getCatalogSnapshot().then((c) => c.bakery.name),
    loadAlerts(),
  ]);

  return (
    /*
     * ToastProvider wraps the whole subtree, so any client component under any
     * page can announce a save without threading a prop down to it. Its live
     * region renders empty from first paint, which is what makes announcements
     * actually work — see components/admin/Toast.
     */
    <ToastProvider>
      <AdminShell
        email={email}
        bakeryName={bakery}
        alerts={alerts}
        search={<GlobalSearch />}
      >
        <PortalAlerts role="admin" userId={viewer.userId} />
        {children}
      </AdminShell>
    </ToastProvider>
  );
}

async function loadAlerts(): Promise<{ awaiting: number; overdue: number }> {
  /* A deployment with no database still renders the portal — lib/db has always
     held that line — so the bell reports nothing rather than throwing. */
  if (!hasDatabase()) return { awaiting: 0, overdue: 0 };

  try {
    const [awaiting, overdue] = await Promise.all([
      db.order.count({ where: { status: "draft" } }),
      db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "Order"
        WHERE status IN ('draft', 'confirmed', 'in_kitchen', 'out_for_delivery')
          AND "createdAt" + ("leadHours" * interval '1 hour') < ${new Date()}`,
    ]);

    return { awaiting, overdue: Number(overdue[0]?.n ?? 0) };
  } catch (e) {
    /* A bell that cannot be counted is not a reason to fail the page it sits
       on, but it is a reason to say so somewhere an operator will find it. */
    console.error("admin_alerts_failed", e);
    return { awaiting: 0, overdue: 0 };
  }
}
