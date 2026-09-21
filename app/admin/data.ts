import "server-only";
import { Prisma, type OrderStatus, type VendorOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { dueAt } from "@/lib/orders";
import {
  attentionFor, byLoad, deliveryCounts, matchesDeliveryState, startOfISTDay,
  type AttentionReason, type DeliveryCounts, type DeliveryDay, type DeliveryState,
  type VendorLoad,
} from "@/lib/ops";
import { VENDOR_OPEN } from "@/lib/vendors";

/**
 * The operations dashboard's reads, in one place and in a fixed number of them.
 *
 * `server-only` for app/orders/data.ts's reason: none of this may be pulled into
 * a client bundle by an import somebody adds later.
 *
 * **No authorisation here, deliberately, and for the same reason
 * app/admin/orders/[ref]/data.ts states.** The only caller is a page under
 * app/admin/layout.tsx, whose `requireAdmin()` runs on the server for every
 * request to anything nested beneath it. A check in a data helper would read as
 * though it were the gate when it is not.
 *
 * ## The query budget
 *
 * Five queries, and none of them grows with the number of vendors or the number
 * of orders a vendor holds. The two that could have been an N+1 are the vendor
 * workload — which is one `groupBy` over `(vendorId, status)` joined to the
 * vendor list in memory, rather than a count per bakery — and "has this order
 * ever been assigned", which is a `_count` on the include rather than a second
 * read per row.
 *
 * Nothing here loads history. The order list is scoped to orders that are still
 * open, which is the only set an operations screen can act on; the order book is
 * /admin/orders and is paged.
 */

/** The statuses an operations screen can still do something about. */
const LIVE: OrderStatus[] = ["draft", "confirmed", "in_kitchen", "out_for_delivery"];

/** One row of the operational order list. */
export interface OpsRow {
  ref: string;
  status: OrderStatus;
  createdAt: Date;
  leadHours: number;
  deliverySlot: string;
  /** The area the cake goes to. There is no street address on an order — it is
      taken on the confirmation call — so this is the whole of the destination
      the database holds, and it is frozen on the order rather than read off the
      customer's profile. */
  pincode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  totalPaise: number;
  /** The live assignment, or null when no bakery holds this. */
  vendorId: string | null;
  vendorName: string | null;
  vendorStatus: VendorOrderStatus | null;
  due: Date;
  attention: AttentionReason[];
}

/**
 * The columns every operational row is built from, named once.
 *
 * Shared by `opsSnapshot` and `deliverySnapshot` so the dashboard and the
 * delivery board cannot come to disagree about what an order is. A select list
 * rather than a bare `findMany`, for app/vendor/data.ts's reason: a column added
 * to Order tomorrow does not silently appear on a screen nobody chose to put it
 * on.
 */
const OPS_SELECT = {
  ref: true, status: true, createdAt: true, leadHours: true, deliverySlot: true,
  pincode: true, customerName: true, customerPhone: true, totalPaise: true,
  currentAssignment: {
    select: { status: true, assignedAt: true, vendorId: true, vendor: { select: { name: true } } },
  },
  /* "Has a bakery ever had this", without a second query per order. It is
     what separates an order nobody has got to from one that was declined
     — see lib/ops' `hadPriorAssignment`. */
  _count: { select: { assignments: true } },
} satisfies Prisma.OrderSelect;

type OpsSelected = Prisma.OrderGetPayload<{ select: typeof OPS_SELECT }>;

/** One database row, as the rules and the screens both need it. */
function toOpsRow(o: OpsSelected, now: Date): OpsRow {
  const due = dueAt(o);
  const a = o.currentAssignment;
  return {
    ref: o.ref,
    status: o.status,
    createdAt: o.createdAt,
    leadHours: o.leadHours,
    deliverySlot: o.deliverySlot,
    pincode: o.pincode,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    totalPaise: o.totalPaise,
    vendorId: a?.vendorId ?? null,
    vendorName: a?.vendor.name ?? null,
    vendorStatus: a?.status ?? null,
    due,
    attention: attentionFor(
      {
        status: o.status,
        dueAt: due,
        assignmentStatus: a?.status ?? null,
        assignedAt: a?.assignedAt ?? null,
        hadPriorAssignment: o._count.assignments > 0,
      },
      now,
    ),
  };
}

export interface OpsSnapshot {
  rows: OpsRow[];
  /** Live assignments, counted per vendor state. */
  vendorState: Record<VendorOrderStatus, number>;
  /** Live orders with no bakery holding them, excluding unconfirmed drafts. */
  unassigned: number;
  load: VendorLoad[];
}

const ZERO_STATE = (): Record<VendorOrderStatus, number> => ({
  assigned: 0, accepted: 0, rejected: 0, in_preparation: 0,
  ready: 0, handed_over: 0, withdrawn: 0,
});

/**
 * Every bakery, and what each is holding right now.
 *
 * Its own function because two pages ask the same question — the dashboard's
 * workload panel and /admin/vendors — and a second copy of this `groupBy` is a
 * second chance for the two screens to disagree about how many orders somebody
 * has. Two queries, neither of which grows with the number of bakeries.
 *
 * Inactive vendors are included. They cannot be given new work, but one that was
 * deactivated while still holding orders is exactly the row the office needs to
 * see — `byLoad` sorts them to the bottom rather than hiding them.
 */
export async function vendorLoads(): Promise<VendorLoad[]> {
  const [rows, vendors] = await Promise.all([
    /* One row per (bakery, state) rather than a count query per bakery. Live
       assignments only — see the note on `currentFor` below. */
    db.vendorOrder.groupBy({
      by: ["vendorId", "status"],
      where: { status: { in: VENDOR_OPEN }, currentFor: { isNot: null } },
      _count: { _all: true },
    }),
    db.vendor.findMany({ select: { id: true, name: true, isActive: true } }),
  ]);

  const byVendor = new Map<string, VendorLoad>(
    vendors.map((v) => [v.id, { ...v, assigned: 0, accepted: 0, inPreparation: 0, ready: 0 }]),
  );

  for (const g of rows) {
    const v = byVendor.get(g.vendorId);
    if (!v) continue;
    const n = g._count._all;
    if (g.status === "assigned") v.assigned = n;
    else if (g.status === "accepted") v.accepted = n;
    else if (g.status === "in_preparation") v.inPreparation = n;
    else if (g.status === "ready") v.ready = n;
  }

  return [...byVendor.values()].sort(byLoad);
}

/**
 * Everything the dashboard's operational half needs, as of `now`.
 *
 * `now` is passed in rather than read here so the page stamps one instant and
 * every derived figure on it agrees — a snapshot that read the clock five times
 * could show an order as overdue in one panel and due-soon in another.
 */
export async function opsSnapshot(now: Date): Promise<OpsSnapshot> {
  const [orders, liveByState, unassigned, load] = await Promise.all([
    db.order.findMany({
      where: { status: { in: LIVE } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: OPS_SELECT,
    }),

    /*
     * Live assignments only. `currentFor` is Order's back-relation to the
     * pointer, so `isNot: null` means "this row is the one its order is
     * actually on" — counting every VendorOrder instead would add every
     * withdrawn and declined row a busy order has accumulated.
     */
    db.vendorOrder.groupBy({
      by: ["status"],
      where: { currentFor: { isNot: null } },
      _count: { _all: true },
    }),

    db.order.count({
      where: { status: { in: ["confirmed", "in_kitchen"] }, currentAssignmentId: null },
    }),

    vendorLoads(),
  ]);

  const vendorState = ZERO_STATE();
  for (const g of liveByState) vendorState[g.status] = g._count._all;

  const rows = orders.map((o) => toOpsRow(o, now));
  rows.sort((x, y) => x.due.getTime() - y.due.getTime());

  return { rows, vendorState, unassigned, load };
}

/* ------------------------------------------------------- the delivery board */

/**
 * The delivery day's reads.
 *
 * A second entry point rather than a flag on `opsSnapshot`, because the two
 * scope orders by genuinely different questions and cannot share one query.
 * `opsSnapshot` asks "what is still open" — it is the dashboard's backlog and it
 * has no date in it. This asks "what is due on this day", which includes orders
 * that are **finished**: §7 wants a Delivered filter, and a delivered order is
 * invisible to `LIVE`. Bolting a date onto the other function would have made
 * the dashboard's backlog date-scoped too.
 *
 * ## Why the day window is raw SQL
 *
 * There is no delivery-date column. The due instant is `createdAt + leadHours`
 * per row — see lib/orders' `dueAt`, and app/admin/page.tsx on why it is derived
 * rather than stored — and Prisma's query builder cannot express a comparison
 * against a computed expression. So the window narrows to a set of ids in
 * Postgres and Prisma takes it from there, which is exactly the arrangement
 * app/admin/orders' `due=late` filter already uses.
 *
 * **The narrowing is in the database, which is the point.** §29 forbids fetching
 * all historical orders and aggregating in the browser; a day's deliveries come
 * back as a day's deliveries, not as the order book filtered in memory.
 *
 * Cancelled orders are excluded in that same WHERE, so a cancelled cake can
 * never appear as an active delivery — §26 — and is not merely hidden later.
 *
 * ## The bounds, and what LIMIT truncates
 *
 * `today` and `tomorrow` are closed windows and cannot overflow at any volume
 * this bakery will see. `past` and `upcoming` are open-ended, so the ordering is
 * what decides which 300 survive: `past` reads newest-first, `upcoming`
 * soonest-first, and in both cases the truncated tail is the end nobody is
 * working today.
 */
const BOARD_LIMIT = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The real instants an IST delivery day covers. Null is open-ended. */
function windowFor(day: DeliveryDay, now: Date): { from: Date | null; to: Date | null } {
  const start = startOfISTDay(now);
  const plus = (n: number) => new Date(start.getTime() + n * DAY_MS);

  switch (day) {
    case "past": return { from: null, to: start };
    case "today": return { from: start, to: plus(1) };
    case "tomorrow": return { from: plus(1), to: plus(2) };
    case "upcoming": return { from: plus(2), to: null };
  }
}

export interface DeliveryFilters {
  day: DeliveryDay;
  state: DeliveryState;
  /** A vendor id, `"none"` for orders no bakery holds, or null for any. */
  vendor: string | null;
  /** A `DeliverySlot` value, or null for any. */
  slot: string | null;
}

export interface DeliverySnapshot {
  /** What survived every filter, soonest due first. */
  rows: OpsRow[];
  /**
   * Counted over the whole day, **before** the state, vendor and slot filters.
   *
   * Deliberately: a count that shrank as you filtered would be a count of what
   * you are already looking at, and the chips beside it would all read the size
   * of their own result. These are the day, which is what somebody is deciding
   * against.
   */
  counts: DeliveryCounts;
  /** Which bakeries have work on this day, for the chips. Never invented. */
  vendors: { id: string; name: string; n: number }[];
  /** Which slots are actually in use on this day. */
  slots: { slot: string; n: number }[];
  /** Orders on this day that no bakery holds. */
  unassigned: number;
}

export async function deliverySnapshot(
  now: Date,
  { day, state, vendor, slot }: DeliveryFilters,
): Promise<DeliverySnapshot> {
  const { from, to } = windowFor(day, now);

  /* The computed due instant, written once so the WHERE and the ORDER BY cannot
     drift into measuring two different things. */
  const due = Prisma.sql`("createdAt" + ("leadHours" * interval '1 hour'))`;

  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order"
    WHERE status <> 'cancelled'
      ${from ? Prisma.sql`AND ${due} >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND ${due} < ${to}` : Prisma.empty}
    ORDER BY ${due} ${day === "past" ? Prisma.sql`DESC` : Prisma.sql`ASC`}
    LIMIT ${BOARD_LIMIT}`;

  if (ids.length === 0) {
    return {
      rows: [],
      counts: deliveryCounts([]),
      vendors: [],
      slots: [],
      unassigned: 0,
    };
  }

  const orders = await db.order.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: OPS_SELECT,
  });

  /* Sorted here rather than trusted from the `in`, which does not preserve the
     id order the window query chose. `past` reads backwards, so the whole day
     starts with the delivery that was missed most recently. */
  const all = orders
    .map((o) => toOpsRow(o, now))
    .sort((x, y) =>
      day === "past"
        ? y.due.getTime() - x.due.getTime()
        : x.due.getTime() - y.due.getTime());

  /*
   * The facets come off the unfiltered day, so picking a bakery does not delete
   * every other bakery's chip and strand somebody inside one filter.
   */
  const vendorFacet = new Map<string, { id: string; name: string; n: number }>();
  const slotFacet = new Map<string, number>();
  for (const r of all) {
    if (r.vendorId && r.vendorName) {
      const v = vendorFacet.get(r.vendorId) ?? { id: r.vendorId, name: r.vendorName, n: 0 };
      v.n++;
      vendorFacet.set(r.vendorId, v);
    }
    slotFacet.set(r.deliverySlot, (slotFacet.get(r.deliverySlot) ?? 0) + 1);
  }

  /*
   * In memory, and only these three. The day is already a day — bounded by the
   * window above — so narrowing it further costs a pass over a few dozen rows,
   * and two of these cannot be a database filter at all: "ready" is a fact about
   * the *vendor* machine crossed with the order's own status, and "needs
   * attention" is lib/ops' rules against the clock. Expressing either in SQL
   * would be a second copy of a rule that is already written down and tested.
   */
  const rows = all.filter(
    (r) =>
      matchesDeliveryState(r, state)
      && (vendor === null
        || (vendor === "none" ? r.vendorId === null : r.vendorId === vendor))
      && (slot === null || r.deliverySlot === slot),
  );

  return {
    rows,
    counts: deliveryCounts(all),
    vendors: [...vendorFacet.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    slots: [...slotFacet.entries()]
      .map(([s, n]) => ({ slot: s, n }))
      .sort((a, b) => b.n - a.n || a.slot.localeCompare(b.slot)),
    unassigned: all.filter((r) => r.vendorId === null).length,
  };
}
