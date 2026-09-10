/*
 * Every function here reads the database on behalf of one signed-in person, so
 * `server-only` is the compile-time guarantee that none of it can be pulled into
 * a client bundle by an import somebody adds later — the same marker lib/auth.ts
 * carries, for the same reason. Type-only imports of `OrderCardData` are erased
 * and stay legal, which is how components/orders/OrderCard takes its props.
 */
import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { db } from "@/lib/db";
import { PHASE, type OrderPhase } from "@/lib/orders";
import { migrateConfig } from "@/lib/schema";

/**
 * One customer's orders, and one of them in full.
 *
 * ## The authorisation is the `where` clause
 *
 * Every query in this file is filtered on `userId` in the database, not in the
 * page. That is deliberate and it is the difference between a hidden order and
 * an unreadable one: a page that fetches an order by reference and then decides
 * whether to render it has already read somebody else's customer name, phone
 * number and address into the process that serves the response, and one
 * refactor — an early return moved, a `notFound()` swapped for a banner — turns
 * that into a disclosure. Asking for "this reference, belonging to me" cannot.
 *
 * `findFirst` rather than `findUnique`, because `ref` alone is the unique key
 * and adding `userId` to the selector is what makes it a filter. A reference
 * that exists but belongs to another account comes back null and the page
 * answers 404 — the same answer as a reference that was never minted, which is
 * also the right one: whether MC-4471 exists is not a customer's business.
 *
 * Guest orders have `userId = null` and so are invisible here by the same
 * clause, which is correct rather than incidental. Nobody is signed in as null,
 * and an order placed without an account is tracked by its reference on paper —
 * see app/api/orders/route.ts, where signing in is a convenience and never a
 * condition of buying a cake.
 *
 * The role is not consulted anywhere in this file. An admin reading their own
 * orders here sees their own orders; the whole order book is /admin/orders,
 * behind `requireAdmin()`, and giving this surface a second privileged mode
 * would be a second authorisation to keep in step with the first.
 */

/** The statuses behind each tab, read off the one phase table. */
export function statusesIn(phase: OrderPhase): OrderStatus[] {
  return (Object.keys(PHASE) as OrderStatus[]).filter((s) => PHASE[s] === phase);
}

/**
 * The card needs the cake's own configuration to name it and draw it, and
 * nothing else the row happens to carry. Named so the list query and the count
 * queries cannot drift apart.
 */
const CARD_FIELDS = {
  ref: true,
  status: true,
  createdAt: true,
  totalPaise: true,
  leadHours: true,
  deliverySlot: true,
  config: true,
  servesMin: true,
  servesMax: true,
} satisfies Prisma.OrderSelect;

export interface OrderCardData {
  ref: string;
  status: OrderStatus;
  createdAt: Date;
  totalPaise: number;
  leadHours: number;
  deliverySlot: string;
  servesMin: number;
  servesMax: number;
  /** Null when the stored configuration no longer validates. */
  config: ReturnType<typeof migrateConfig>;
}

/**
 * The list, filtered and searched in Postgres rather than in the page.
 *
 * Search covers the reference and the frozen price lines, which is what a
 * customer actually has to hand: the reference from the confirmation, or the
 * flavour they remember choosing — "pistachio" finds the order whose docket has
 * a pistachio line on it. It deliberately does not search the config JSON,
 * because that would mean matching enum values like `red-velvet` against words
 * a person types, and the price lines already carry the bakery's own wording.
 */
export async function listOrders(
  userId: string,
  { q, phase, take = 50 }: { q?: string; phase?: OrderPhase; take?: number } = {},
): Promise<OrderCardData[]> {
  const search = q?.trim();

  const rows = await db.order.findMany({
    where: {
      userId,
      ...(phase ? { status: { in: statusesIn(phase) } } : {}),
      ...(search
        ? {
            OR: [
              { ref: { contains: search, mode: "insensitive" } },
              { items: { some: { label: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: CARD_FIELDS,
  });

  return rows.map((r) => ({ ...r, config: migrateConfig(r.config) }));
}

/** How many orders sit behind each tab, for the counts beside the labels. */
export async function countByPhase(userId: string): Promise<Record<OrderPhase | "all", number>> {
  const grouped = await db.order.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });

  const counts = { all: 0, active: 0, delivered: 0, cancelled: 0 };
  for (const g of grouped) {
    counts[PHASE[g.status]] += g._count._all;
    counts.all += g._count._all;
  }
  return counts;
}

/**
 * One order of the viewer's own, with everything the tracking page shows.
 *
 * The catalogue comes along because the page reads the delivery window and the
 * bakery's own contact details off it — the same snapshot the builder and the
 * kitchen price against, so a customer is never told a window the bakery has
 * since changed.
 */
export async function getOrder(userId: string, ref: string) {
  const [order, catalog] = await Promise.all([
    db.order.findFirst({
      where: { ref, userId },
      include: {
        items: { orderBy: { position: "asc" } },
        /*
         * Oldest first, which is the order a history reads in. No actor: which
         * member of staff moved a docket is the bakery's business, and the
         * admin's own detail page already shows it to the people it concerns.
         */
        events: {
          orderBy: { createdAt: "asc" },
          select: { toStatus: true, fromStatus: true, createdAt: true },
        },
        design: { select: { slug: true } },
      },
    }),
    getCatalogSnapshot(),
  ]);

  if (!order) return null;

  // A stored config that no longer validates is a real state, not a crash: the
  // status, the money and the delivery all live in columns and survive it.
  return { order, catalog, config: migrateConfig(order.config) };
}
