import { getCatalogSnapshot } from "@/lib/catalogData";
import { db } from "@/lib/db";
import { migrateConfig } from "@/lib/schema";

/**
 * One order, read once, for the two pages that show it.
 *
 * The screen version and the printed version answer the same question and so
 * need the same row: the frozen items, the events, the design it came from, and
 * the catalogue the sheet is regenerated against. Keeping the query here means
 * the include list has one definition — a print docket quietly missing the
 * events the detail page includes is the kind of drift a second copy invites.
 *
 * No authorization here, deliberately. Both callers are pages under
 * app/admin/layout.tsx, whose `requireAdmin()` runs on the server for every
 * request to anything nested beneath it; a check in a data helper would read as
 * though it were the gate when it is not. The gate is the layout, and for
 * writes it is the action.
 *
 * The vendor assignments are included here rather than fetched separately for
 * the same reason everything else is: one order, one query, one include list.
 * The print docket does not render them — see app/admin/orders/[ref]/print —
 * which is deliberate and not an oversight: which partner bakery made a cake is
 * the shop's business and not something to put on a sheet that travels with it.
 */
export async function getOrderDetail(ref: string) {
  const [order, catalog] = await Promise.all([
    db.order.findUnique({
      where: { ref },
      include: {
        items: { orderBy: { position: "asc" } },
        cakes: { orderBy: { position: "asc" } },
        notifications: { orderBy: { createdAt: "desc" } },
        design: { select: { slug: true } },
        // Oldest first, which is the order a history is read in. The actor's
        // name rather than their id: a timeline saying "Priya" is useful and one
        // saying "user_2abc…" is noise. Null when the account has since gone,
        // which the FK's SET NULL allows on purpose.
        events: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { name: true } } },
        },
        /*
         * Every bakery this order has ever been offered to, newest first, and
         * the vendor's name with each — an assignment history reading
         * "cmf3x… rejected" tells nobody anything.
         *
         * The whole list rather than only the live one, because the live one is
         * not the interesting part when somebody has just said no: choosing who
         * to try next means reading why the last one refused. The order's
         * `currentAssignment` pointer says which of these is in force, so the
         * page never has to work that out by sorting.
         */
        assignments: {
          orderBy: { assignedAt: "desc" },
          include: {
            vendor: { select: { id: true, name: true } },
            assignedBy: { select: { name: true } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
        currentAssignment: { include: { vendor: { select: { id: true, name: true } } } },
      },
    }),
    getCatalogSnapshot(),
  ]);

  if (!order) return null;

  /*
   * A stored config that no longer validates is a real state, not an error:
   * lib/schema's migrateConfig returns null for one, and both pages say so in
   * words rather than crashing. Everything that matters operationally — who
   * ordered it, what they paid, where it is — lives in columns and survives it.
   */
  return {
    order,
    catalog,
    config: migrateConfig(order.config),
    cakes: order.cakes.map((cake) => ({ ...cake, config: migrateConfig(cake.config) })),
  };
}
