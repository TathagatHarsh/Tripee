import type { OrderStatus, VendorOrderStatus } from "@prisma/client";
import { isClosed } from "./orders";
import { isVendorFinished } from "./vendors";

/**
 * What the office needs chasing, as a rule rather than a query.
 *
 * The third pure module in this product, and it is pure for lib/orders' and
 * lib/vendors' reason: "is this order stuck" is a decision, and a decision
 * written as a function is one tests/ops.test.ts can hold to a table. The
 * queries that feed it live in app/admin/data.ts; nothing here touches a
 * database, a session or a clock it was not handed.
 *
 * ## Why this is visibility and never an action
 *
 * Nothing in this file moves anything. An order that is late is still
 * `in_kitchen` until somebody says otherwise — §5 of the brief is explicit that
 * the dashboard must not "silently change customer order status simply because
 * something appears late", and lib/orders has always taken the same position
 * about not inferring state from elapsed time. What is late is a phone call, not
 * a transition.
 *
 * ## The thresholds
 *
 * There were none in the product before this file: the only time-derived fact
 * anywhere was `dueAt`, which is the promise the customer was quoted rather than
 * a rule about staleness. So these are new, they are deliberately conservative,
 * and they are constants in one object precisely so that changing "how long may
 * a bakery sit on an order before we ring them" is an edit to one line rather
 * than a hunt through a page component.
 *
 * They are hours because every other duration in this product is hours —
 * `Order.leadHours`, `CatalogOption.leadHours`, `DeliveryZone.extraHours`.
 */
export const OPS = {
  /**
   * How long a bakery may leave an assignment unanswered before the office
   * should chase it. Two hours is short enough to matter on a same-day cake and
   * long enough not to flag every order placed while a bakery is mid-bake.
   */
  vendorAnswerHours: 2,
  /**
   * How close to its promised window an order may get, without the cake being
   * ready, before it wants somebody's attention.
   */
  readyByHours: 4,
} as const;

/* ------------------------------------------------------------ the IST day */

/**
 * IST has no daylight saving, so the offset is a constant and this is exact.
 *
 * Here rather than in app/admin/page.tsx, where it used to live privately, so
 * the dashboard and the delivery-day view cannot disagree about when "today"
 * starts. The server runs in UTC; a bakery in Hyderabad does not.
 */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function startOfISTDay(at: Date): Date {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

/** Whether two instants fall on the same calendar day in Hyderabad. */
export function isSameISTDay(a: Date, b: Date): boolean {
  return startOfISTDay(a).getTime() === startOfISTDay(b).getTime();
}

/**
 * How many calendar days apart two instants are, in Hyderabad. 0 is today, 1 is
 * tomorrow, -1 was yesterday.
 *
 * Exact rather than approximate, and only because IST has no daylight saving:
 * two IST midnights are always 86,400,000 ms apart, so the division cannot land
 * between two days the way it would in a zone that springs forward. `Math.round`
 * is belt-and-braces against float drift on a very distant date, not a fudge.
 *
 * This is the whole of §8's timezone requirement in one function. A delivery due
 * at 22:00 IST is 16:30 UTC *the same day*, but one due at 02:00 IST is 20:30
 * UTC the **previous** day — so a server comparing UTC dates would file a
 * midnight-slot cake under yesterday and tell the office it was missed. Every
 * day bucket on the delivery board goes through here.
 */
export function istDayOffset(at: Date, now: Date): number {
  return Math.round(
    (startOfISTDay(at).getTime() - startOfISTDay(now).getTime()) / 86_400_000,
  );
}

/* ------------------------------------------------------- the delivery board */

/**
 * Which day's run an order belongs to.
 *
 * Four buckets rather than a date picker, because they are the four questions
 * actually asked in front of a van: what is going out now, what has to be made
 * by tomorrow morning, what is coming, and what did we miss. A date picker
 * answers a fifth question nobody asks standing up.
 *
 * `past` is not "history". A delivery whose day has gone and which is not
 * delivered is the worst thing on this screen and has to have somewhere to be —
 * see `attentionFor`'s `overdue`, which is the same fact said about one order.
 */
export type DeliveryDay = "today" | "tomorrow" | "upcoming" | "past";

export const DELIVERY_DAY_LABEL: Record<DeliveryDay, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  upcoming: "Upcoming",
  past: "Earlier",
};

export function deliveryDayOf(due: Date, now: Date): DeliveryDay {
  const d = istDayOffset(due, now);
  return d < 0 ? "past" : d === 0 ? "today" : d === 1 ? "tomorrow" : "upcoming";
}

/**
 * Whether the cake physically exists.
 *
 * `ready` and `handed_over` are the two vendor states that mean a bakery has
 * finished baking, and `handed_over` counts because a cake does not stop
 * existing when it is collected. Read off the **vendor** machine rather than
 * `Order.status`, which is the customer's lifecycle and says nothing about
 * whether anything has been baked. The two are separate machines and this is the
 * one that knows.
 *
 * Null — no bakery holds this — is not ready, which is the honest answer rather
 * than an unknown: nobody is making it.
 */
export function isCakeReady(vendorStatus: VendorOrderStatus | null): boolean {
  return vendorStatus === "ready" || vendorStatus === "handed_over";
}

/**
 * The ways somebody narrows a delivery day, and four of them partition it.
 *
 * `ready` and `not_ready` split everything that has **not left yet**;
 * `out_for_delivery` and `delivered` are the two that have. So every order on
 * the board is in exactly one of those four, which is what makes the counts add
 * up to the total and what stops "ready" quietly including a cake delivered last
 * Tuesday.
 *
 * `attention` cuts across all four rather than being a fifth bucket, because an
 * order can be out for delivery *and* past its window. It is the same
 * `attentionFor` list the dashboard reads, not a second rule.
 */
export type DeliveryState =
  | "all"
  | "ready"
  | "not_ready"
  | "out_for_delivery"
  | "delivered"
  | "attention";

export const DELIVERY_STATE_LABEL: Record<DeliveryState, string> = {
  all: "All deliveries",
  ready: "Ready",
  not_ready: "Not ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  attention: "Needs attention",
};

/** Everything the delivery filters need off a row, and nothing else. */
export interface DeliveryView {
  status: OrderStatus;
  vendorStatus: VendorOrderStatus | null;
  attention: AttentionReason[];
}

/** Whether this order has left the bakery, by the customer's own lifecycle. */
function dispatched(status: OrderStatus): boolean {
  return status === "out_for_delivery" || status === "delivered";
}

export function matchesDeliveryState(row: DeliveryView, state: DeliveryState): boolean {
  switch (state) {
    case "all": return true;
    case "ready": return !dispatched(row.status) && isCakeReady(row.vendorStatus);
    case "not_ready": return !dispatched(row.status) && !isCakeReady(row.vendorStatus);
    case "out_for_delivery": return row.status === "out_for_delivery";
    case "delivered": return row.status === "delivered";
    case "attention": return row.attention.length > 0;
  }
}

/**
 * The day at a glance, counted in one pass.
 *
 * §12's six figures. `preparing` is the one that is not a slice of the partition
 * above and says so: it counts orders a bakery is actively working on — accepted
 * or in preparation — which overlaps `notReady` and deliberately excludes the
 * ones nobody has been given. "Three not ready" and "three being made" are very
 * different mornings, and the gap between them is what `attention` is for.
 */
export interface DeliveryCounts {
  total: number;
  ready: number;
  notReady: number;
  preparing: number;
  outForDelivery: number;
  delivered: number;
  attention: number;
}

export function deliveryCounts(rows: DeliveryView[]): DeliveryCounts {
  const c: DeliveryCounts = {
    total: rows.length,
    ready: 0, notReady: 0, preparing: 0, outForDelivery: 0, delivered: 0, attention: 0,
  };

  for (const r of rows) {
    if (matchesDeliveryState(r, "ready")) c.ready++;
    if (matchesDeliveryState(r, "not_ready")) c.notReady++;
    if (r.status === "out_for_delivery") c.outForDelivery++;
    if (r.status === "delivered") c.delivered++;
    if (r.attention.length > 0) c.attention++;
    if (r.vendorStatus === "accepted" || r.vendorStatus === "in_preparation") c.preparing++;
  }

  return c;
}

/**
 * Why one order is on the attention list.
 *
 * An array rather than a single worst-reason, because an order can genuinely be
 * two things at once — declined by a bakery *and* due in an hour — and the
 * office needs both facts to decide what to do. `RANK` below is what sorts them
 * when only one badge fits.
 */
export type AttentionReason =
  /** Past the window the customer was quoted, and not finished. */
  | "overdue"
  /** Nobody is making this: no live assignment, and the order is live. */
  | "unassigned"
  /** A bakery said no and nobody has been given it since. */
  | "declined"
  /** Handed to a bakery that has not answered within `vendorAnswerHours`. */
  | "awaiting_vendor"
  /** Due within `readyByHours` and the cake is not ready yet. */
  | "due_soon";

/**
 * Worst first. `overdue` outranks everything because the promise is already
 * broken; `unassigned` is next because it is the one with nobody working on it.
 */
export const RANK: AttentionReason[] = [
  "overdue",
  "unassigned",
  "declined",
  "awaiting_vendor",
  "due_soon",
];

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  overdue: "Past its window",
  unassigned: "No bakery",
  declined: "Declined, not reassigned",
  awaiting_vendor: "Waiting on the bakery",
  due_soon: "Due soon, not ready",
};

export const ATTENTION_NOTE: Record<AttentionReason, string> = {
  overdue: "The customer was promised a time and it has gone. Ring them.",
  unassigned: "Nobody is making this cake. Assign a bakery.",
  declined: "The bakery that had it said no. Give it to somebody else.",
  awaiting_vendor: "Handed over but not accepted yet. Ring the bakery.",
  due_soon: "The window is close and the cake is not ready.",
};

export const ATTENTION_TONE: Record<AttentionReason, "warn" | "bad"> = {
  overdue: "bad",
  unassigned: "bad",
  declined: "bad",
  awaiting_vendor: "warn",
  due_soon: "warn",
};

/** Everything the rules below need, and nothing else. */
export interface OpsOrder {
  status: OrderStatus;
  /** From lib/orders' `dueAt` — the promise, computed once by the caller. */
  dueAt: Date;
  /** The live assignment's status, or null when no bakery holds this. */
  assignmentStatus: VendorOrderStatus | null;
  /** When the live assignment was handed over, or null. */
  assignedAt: Date | null;
  /**
   * Whether this order has ever been handed to a bakery.
   *
   * The whole of the difference between "never assigned" and "assigned and
   * declined", which are the same `null` pointer and two different jobs: one is
   * an order nobody has got to yet, the other is one a bakery has actively
   * refused. Conflating them would bury the refusals in the backlog.
   */
  hadPriorAssignment: boolean;
}

/**
 * What is wrong with this order, if anything.
 *
 * `now` is an argument rather than read from the clock, which is what makes
 * every rule here a table in a test rather than something that can only be
 * observed at the right moment of an afternoon.
 *
 * A closed order — delivered or cancelled — is never on this list. That is the
 * first line and it is load-bearing: a cancelled order is permanently past its
 * window, and without this it would sit at the top of the attention list
 * forever, which is exactly how people learn to stop reading one.
 */
export function attentionFor(o: OpsOrder, now: Date): AttentionReason[] {
  if (isClosed(o.status)) return [];

  const reasons: AttentionReason[] = [];
  const msLeft = o.dueAt.getTime() - now.getTime();

  if (msLeft < 0) reasons.push("overdue");

  /*
   * No bakery holds it. `draft` is excluded on purpose: an order the office has
   * not yet rung the customer about is not late to be assigned, it is simply
   * not confirmed, and flagging every new order as "no bakery" would make the
   * list a duplicate of the inbox.
   */
  if (o.assignmentStatus === null && o.status !== "draft") {
    reasons.push(o.hadPriorAssignment ? "declined" : "unassigned");
  }

  if (
    o.assignmentStatus === "assigned"
    && o.assignedAt !== null
    && now.getTime() - o.assignedAt.getTime() > OPS.vendorAnswerHours * 3600_000
  ) {
    reasons.push("awaiting_vendor");
  }

  /*
   * Close to the window with no cake ready. Only when it is not already overdue
   * — saying "due soon" about something that is late is noise on top of the
   * reason that actually matters — and only when the bakery has not finished,
   * since `ready` and `handed_over` mean the cake exists.
   */
  if (
    msLeft >= 0
    && msLeft < OPS.readyByHours * 3600_000
    && !(o.assignmentStatus !== null && isVendorFinished(o.assignmentStatus))
    && o.assignmentStatus !== "ready"
  ) {
    reasons.push("due_soon");
  }

  return reasons.sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b));
}

/** The one badge to draw when only one fits. Null for an order that is fine. */
export function worstAttention(reasons: AttentionReason[]): AttentionReason | null {
  return reasons.length === 0 ? null : reasons[0]!;
}

/* ------------------------------------------------------- vendor workload */

/**
 * One bakery's open work, counted per state.
 *
 * Counts rather than a capacity model, and deliberately: there is no capacity
 * field on Vendor and §6 of the brief says not to invent one. "Four open, one
 * waiting on them" is a fact the database holds; "78% utilised" would be a
 * number this product cannot honestly produce.
 */
export interface VendorLoad {
  id: string;
  name: string;
  isActive: boolean;
  assigned: number;
  accepted: number;
  inPreparation: number;
  ready: number;
}

/** Everything still in that bakery's hands. */
export function openTotal(v: VendorLoad): number {
  return v.assigned + v.accepted + v.inPreparation + v.ready;
}

/**
 * Busiest first, and a bakery waiting on nobody sorts below one that is.
 *
 * The office reads this to answer "who can take the next order", so the two
 * things that matter are how much somebody is holding and whether any of it is
 * unanswered. Inactive bakeries sink regardless — they cannot be given work.
 */
export function byLoad(a: VendorLoad, b: VendorLoad): number {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  return openTotal(b) - openTotal(a) || b.assigned - a.assigned || a.name.localeCompare(b.name);
}
