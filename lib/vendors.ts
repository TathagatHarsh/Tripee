import type { OrderStatus, VendorOrderStatus } from "@prisma/client";

/**
 * What a vendor may do with an order they have been handed, and nothing else.
 *
 * The second state machine in this product, and it is the same shape as the
 * first on purpose: lib/orders.ts holds the customer's order sequence and this
 * holds the vendor's, both as a `Record` of what may follow what, both walked
 * by a `can…Transition` that the server calls before anything is written.
 * Anybody who has read one can read the other.
 *
 * Separate from lib/orders rather than folded into it, because they answer
 * different questions about the same docket. `Order.status` is what the
 * customer is told — placed, confirmed, in the kitchen, on the road. This is
 * what a partner bakery has actually done with it. An order can be `confirmed`
 * to the customer while its vendor has not answered the phone yet, and the day
 * those two are one column is the day a customer's tracking page starts
 * reporting an internal handover.
 *
 * Pure, with a type-only import, for lib/roles' reason: these rules are the part
 * of Phase 2 that can be settled without a database, a session or a browser, and
 * tests/vendors.test.ts settles them as a table. What a unit test cannot prove
 * is that the rules are wired into the writes — that is lib/vendorTransition,
 * which is the only thing in the product that moves one of these.
 */

/**
 * The moves a **vendor** may make. `withdrawn` appears nowhere on the right-hand
 * side, which is the whole of the admin/vendor split: withdrawing an assignment
 * is the office taking work back, and a vendor posting `to=withdrawn` at this
 * machine is refused by the same check that refuses baking a rejected order.
 *
 * `rejected`, `handed_over` and `withdrawn` are terminal. A rejection in
 * particular does not reopen: §"REJECTION" is explicit that the vendor cannot
 * keep modifying an assignment they refused, and the route back is the admin
 * assigning somebody else, which is a new row rather than this one thawing.
 */
export const VENDOR_NEXT: Record<VendorOrderStatus, VendorOrderStatus[]> = {
  assigned: ["accepted", "rejected"],
  accepted: ["in_preparation"],
  in_preparation: ["ready"],
  ready: ["handed_over"],
  rejected: [],
  handed_over: [],
  withdrawn: [],
};

/**
 * The buttons are drawn from the same map, and the server asks again anyway —
 * a dashboard open on a phone in a bakery since this morning is a dashboard
 * whose buttons describe a state the office may have changed since.
 */
export function canVendorTransition(from: VendorOrderStatus, to: VendorOrderStatus): boolean {
  return VENDOR_NEXT[from]?.includes(to) ?? false;
}

/** Nothing further for the vendor to do. Splits their board into work and history. */
export function isVendorFinished(status: VendorOrderStatus): boolean {
  return VENDOR_NEXT[status].length === 0;
}

/**
 * Whether reaching this status hands the order back to the office.
 *
 * `Order.currentAssignmentId` is cleared on exactly these two, so the order
 * reads as unassigned and the admin can give it to somebody else. It is
 * deliberately **not** cleared on `handed_over`: a finished order still has a
 * vendor, and showing "Unassigned" the moment the cake is collected would erase
 * the only record of who made it.
 */
export function releasesOrder(status: VendorOrderStatus): boolean {
  return status === "rejected" || status === "withdrawn";
}

/**
 * The one place a bakery's progress moves the customer's order, and the six
 * places it deliberately does not.
 *
 * The two machines stay separate — everything above this line is about that —
 * but they are not unrelated, and refusing to connect them at all has a cost a
 * customer pays: a cake genuinely being baked at a partner bakery while the
 * tracking page still says "Confirmed and booked into the kitchen's day".
 * `in_kitchen` is not a claim about *whose* kitchen, and `CUSTOMER_STATUS`
 * already words it as "Your cake is being baked and finished by hand", which is
 * exactly what has started happening. So that one edge is wired, and it is the
 * only one that can be stated truthfully.
 *
 * The nulls are the design, not gaps waiting to be filled:
 *
 *   - `assigned` / `accepted` — which bakery has agreed to make a cake is an
 *     internal handover. The customer was told "confirmed" and nothing about
 *     their order has changed since. §"VENDOR INFORMATION" is explicit.
 *   - `ready` / `handed_over` — there is no `ready` on OrderStatus and the next
 *     state is `out_for_delivery`, which would claim a rider who has not been
 *     dispatched. The office dispatches, and the office moves that one.
 *   - `rejected` / `withdrawn` — a decline and a reassignment must be invisible
 *     to the customer, who keeps the coherent status they already had. Moving
 *     the order here would leak the churn onto their timeline.
 *
 * A `Record` rather than a function with a switch, for STATUS_LABEL's reason: a
 * status added to the Prisma enum fails the build here, which is the right place
 * to be asked whether it moves the customer's order. `null` is a decision
 * somebody wrote down, and the compiler will not accept a missing key as one.
 *
 * **This map does not authorise anything.** It names a destination;
 * lib/orderTransition's `canTransition` still decides whether the order may go
 * there from where it actually is, and a `draft` order whose vendor starts
 * baking simply does not move — see lib/vendorTransition, which treats that
 * refusal as normal rather than as a failure.
 */
export const ORDER_STATUS_FOR_VENDOR: Record<VendorOrderStatus, OrderStatus | null> = {
  assigned: null,
  accepted: null,
  in_preparation: "in_kitchen",
  ready: null,
  handed_over: null,
  rejected: null,
  withdrawn: null,
};

/**
 * Which timestamp column a status stamps when it is reached.
 *
 * This is what buys VendorOrder its seven nullable timestamps at a cost of two
 * lines rather than seven: the transition writes `{ status: to, [STAMP[to]]:
 * now }` and `assignmentHistory` below reads the same map back. A status added
 * to the Prisma enum fails the build here, which is the correct place to find
 * out that it has nowhere to record itself.
 *
 * `assigned` maps to `assignedAt`, which the row already defaults — it is in the
 * map so the history renderer needs no special case for the first line.
 */
export const STAMP = {
  assigned: "assignedAt",
  accepted: "acceptedAt",
  rejected: "rejectedAt",
  in_preparation: "startedAt",
  ready: "readyAt",
  handed_over: "handedOverAt",
  withdrawn: "withdrawnAt",
} as const satisfies Record<VendorOrderStatus, string>;

export type StampColumn = (typeof STAMP)[VendorOrderStatus];

/** What each state is called on a screen, in the bakery's own words. */
export const VENDOR_STATUS_LABEL: Record<VendorOrderStatus, string> = {
  assigned: "Awaiting your answer",
  accepted: "Accepted",
  rejected: "Declined",
  in_preparation: "In preparation",
  ready: "Ready",
  handed_over: "Handed over",
  withdrawn: "Taken back",
};

/**
 * The label on the button that moves an assignment *to* this state — an
 * instruction to whoever is reading it, not a noun. lib/orders' ACTION_LABEL is
 * the same idea for the other machine.
 */
export const VENDOR_ACTION_LABEL: Record<VendorOrderStatus, string> = {
  assigned: "Assign",
  accepted: "Accept order",
  rejected: "Decline order",
  in_preparation: "Start preparation",
  ready: "Mark ready",
  handed_over: "Mark handed over",
  withdrawn: "Take back",
};

/** How an assignment reads on the admin's history, which is written in the past tense. */
export const VENDOR_EVENT_LABEL: Record<VendorOrderStatus, string> = {
  assigned: "Assigned",
  accepted: "Accepted",
  rejected: "Declined",
  in_preparation: "Started preparation",
  ready: "Ready",
  handed_over: "Handed over",
  withdrawn: "Taken back by the office",
};

/**
 * The states in which a vendor still has the order in their hands.
 *
 * Derived from the machine rather than listed, for lib/orders' HAPPY_PATH
 * reason: a state added between `ready` and `handed_over` joins this list with
 * no edit here, while a hardcoded array would silently drop it off every
 * dashboard count and out of every query that asks "what is outstanding".
 */
export const VENDOR_OPEN: VendorOrderStatus[] = (
  Object.keys(VENDOR_NEXT) as VendorOrderStatus[]
).filter((s) => !isVendorFinished(s));

/**
 * The vendor's dashboard, as four counts.
 *
 * One per open state rather than a summary, because each one is a different
 * thing to do: answer it, start it, finish it, hand it over. A single "8 open"
 * would tell a bakery how busy they are and not what to pick up next.
 */
export const VENDOR_BUCKET: { status: VendorOrderStatus; label: string; note: string }[] = [
  { status: "assigned", label: "To answer", note: "Waiting on you to accept or decline." },
  { status: "accepted", label: "Accepted", note: "Agreed, not started yet." },
  { status: "in_preparation", label: "Preparing", note: "Being made now." },
  { status: "ready", label: "Ready", note: "Finished, waiting for collection." },
];

/* ------------------------------------------------------------- the history */

/** One line of an assignment's history, ready to render. */
export interface AssignmentEntry {
  label: string;
  at: Date;
}

/**
 * What happened to one assignment, oldest first, read off its own columns.
 *
 * There is no VendorOrderEvent table and this is why there does not need to be:
 * every transition stamps exactly one timestamp, so the row carries its own
 * sequence. lib/orders' `buildTimeline` does the same job from a child table;
 * this one needs no join and cannot drift from the status it belongs to.
 *
 * Nothing is inferred. An assignment that was accepted before this column
 * existed would show no "Accepted" line rather than one dated from `updatedAt`,
 * which is migration 6's position about the moves nobody wrote down — though in
 * practice no such row can exist, since the table and the columns shipped
 * together.
 *
 * Sorted here rather than trusted from the column order, because `rejectedAt`
 * is declared above `startedAt` and an assignment cannot be both.
 */
export function assignmentHistory(
  row: Partial<Record<StampColumn, Date | null>>,
): AssignmentEntry[] {
  return (Object.keys(STAMP) as VendorOrderStatus[])
    .map((status) => ({ label: VENDOR_EVENT_LABEL[status], at: row[STAMP[status]] ?? null }))
    .filter((e): e is AssignmentEntry => e.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* -------------------------------------------------------------- the fences */

/**
 * Whether this vendor may touch this assignment at all.
 *
 * The **second** of two fences, and it is deliberately not the first. Every
 * query a vendor surface makes carries `vendorId` in its WHERE — see
 * lib/vendorTransition — so another vendor's assignment is not found rather
 * than found and refused. This exists because "the query was scoped" is a
 * property of code somebody can edit, and a rule stated as a function is a rule
 * a test can hold to.
 *
 * `null` for the row is the case that matters: it is what a scoped lookup
 * returns when Vendor A types Vendor B's order reference into the URL bar, and
 * it has to read as a refusal rather than as a crash.
 */
export function mayVendorAct(
  assignment: { vendorId: string; status: VendorOrderStatus } | null,
  vendorId: string,
  to: VendorOrderStatus,
): boolean {
  if (!assignment) return false;
  /*
   * A missing id is not a match for a missing id. `requireVendor` cannot produce
   * an empty `vendorId` — it returns a row read by primary key — so this guard
   * is for the bug that has not been written yet, and it is the same reasoning
   * lib/roles' `allows` gives for `if (!role) return false`: `"" === ""` is true
   * by luck rather than by intent, and luck is not a security control.
   */
  if (!vendorId || !assignment.vendorId) return false;
  if (assignment.vendorId !== vendorId) return false;
  return canVendorTransition(assignment.status, to);
}

/**
 * The colour each state carries, in the admin palette's own vocabulary.
 *
 * Here rather than in components/admin/ui.tsx so that the admin's fulfilment
 * panel and the vendor's own dashboard cannot drift into disagreeing about what
 * "ready" looks like. The values are the `BadgeTone` names that `StatusBadge`
 * takes; a plain string union rather than that type, so this file keeps its
 * one type-only import and stays testable without React.
 *
 * `assigned` is amber because it is the only state waiting on somebody, and
 * `withdrawn` is plain rather than red: the office taking an order back is not
 * a failure, and colouring it like one would make a reassignment read as a
 * complaint about the bakery it was taken from.
 */
export const VENDOR_STATUS_TONE: Record<
  VendorOrderStatus,
  "plain" | "good" | "warn" | "bad" | "accent"
> = {
  assigned: "warn",
  accepted: "accent",
  rejected: "bad",
  in_preparation: "accent",
  ready: "good",
  handed_over: "good",
  withdrawn: "plain",
};

/* ──────────────────────────────────────────────────────── the kitchen board */

/**
 * The board's columns, in the order a cake moves through them.
 *
 * `VENDOR_BUCKET` above is the same four statuses as a row of counts; this is
 * the same four as places a card sits, with the words a baker reads rather than
 * the words the schema uses. Both are derived from the one state machine and
 * neither invents a status — §25's rule, and the reason there is no "collected"
 * column here even though it would look tidy: `handed_over` is terminal, and a
 * column of cards that can never move is a column nobody clears.
 *
 * The label is the state ("Making"); the `verb` is what the button under the
 * card says ("Mark ready"). Keeping them apart is the whole point of §8 — a
 * worker should never have to read a status and work out the verb from it.
 */
export const VENDOR_COLUMNS: {
  status: VendorOrderStatus;
  /** The column heading. One or two words, read across a bench. */
  label: string;
  /** What the cards in it are waiting for. */
  note: string;
  /** Nothing in this column, said plainly. */
  empty: string;
}[] = [
  {
    status: "assigned",
    label: "New orders",
    note: "Accept or decline these.",
    empty: "No new orders.",
  },
  {
    status: "accepted",
    label: "Accepted",
    note: "Yours. Not started yet.",
    empty: "Nothing waiting to start.",
  },
  {
    status: "in_preparation",
    label: "Making",
    note: "Being made now.",
    empty: "Nothing on the bench.",
  },
  {
    status: "ready",
    label: "Ready",
    note: "Boxed, waiting to be collected.",
    empty: "Nothing boxed yet.",
  },
];

/* ─────────────────────────────────────────────────────────── why they said no */

/**
 * The reasons a bakery declines, as a short closed list.
 *
 * §12 asks for these, and the reason to offer them rather than only a box is
 * not tidiness: an empty textarea at 6am on a phone gets "no" typed into it,
 * and "no" is the one answer that tells the office nothing about who to try
 * next. A tapped reason is one thumb and is still true.
 *
 * `id` is what the radio posts and is never stored as an id. The *sentence* is
 * what goes into `VendorOrder.rejectionReason`, because that column is read by
 * a person on the admin's order page and a column of `too_busy` would need a
 * lookup table in a second place to be read at all. See composeRejection.
 *
 * "Other" carries no sentence of its own — it is the case where only the typed
 * note says anything, so prefixing it with a stock phrase would be padding.
 */
export const REJECTION_REASONS: { id: string; label: string; sentence: string }[] = [
  { id: "out_of_stock", label: "Out of stock", sentence: "Out of stock." },
  { id: "unavailable", label: "Bakery unavailable", sentence: "Bakery unavailable." },
  { id: "ingredients", label: "Ingredient unavailable", sentence: "Ingredient unavailable." },
  { id: "busy", label: "Too busy", sentence: "Too busy to take this on." },
  { id: "cannot_make", label: "Outside operational capacity", sentence: "Outside operational capacity." },
  { id: "ingredient", label: "Product unavailable", sentence: "Product unavailable." },
  { id: "timing", label: "Delivery timing issue", sentence: "The delivery timing does not work." },
  { id: "other", label: "Other", sentence: "" },
];

/**
 * One sentence for the office, out of a tapped reason and an optional note.
 *
 * Returns null when there is nothing to say, which is deliberate: declining
 * without a reason is allowed (§12 says the note is optional, and a required
 * field would only produce "no" in a box), and a null here stores null rather
 * than an empty string pretending to be an answer.
 *
 * The note is trimmed and capped by the caller before it arrives — see
 * app/vendor/actions.ts, which is the trust boundary. This function composes;
 * it does not sanitise.
 */
export function composeRejection(reasonId: string, note: string | null): string | null {
  const stock = REJECTION_REASONS.find((r) => r.id === reasonId)?.sentence ?? "";
  const parts = [stock, note ?? ""].map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/* ────────────────────────────────────────────────────────────── how long left */

/**
 * How urgent a cake is, as four bands rather than a number.
 *
 * §9 asks for visual urgency on an approaching deadline, and bands rather than
 * a raw countdown because the decision a baker makes is "do I start this now",
 * which has four answers and not a hundred and eighty.
 *
 * `late` is judged against the window the customer was quoted — lib/orders'
 * `dueAt`, which is placed-at plus the lead hours that slot promised — and is
 * the same arithmetic the admin's order book and the delivery board use. There
 * is no second definition of late in this product.
 */
export type DueUrgency = "late" | "urgent" | "soon" | "later";

const HOUR_MS = 60 * 60 * 1000;

export function dueUrgency(due: Date, now: Date): DueUrgency {
  const left = due.getTime() - now.getTime();
  if (left < 0) return "late";
  if (left < 3 * HOUR_MS) return "urgent";
  if (left < 12 * HOUR_MS) return "soon";
  return "later";
}

/**
 * The same gap in words. "Due in 2 hours", and never a time it invents.
 *
 * Rounded down, which is the safe direction: a cake 119 minutes out reads "Due
 * in 1 hour", not "2 hours", and a baker who starts on the pessimistic reading
 * is never late because of this label. Minutes under the hour, hours under the
 * day, days above it — and "tomorrow" only when the arithmetic actually says
 * one day, never as a softer word for "soon".
 */
export function dueLabel(due: Date, now: Date): string {
  const left = due.getTime() - now.getTime();
  if (left < 0) return "Past delivery window";

  const minutes = Math.floor(left / 60_000);
  if (minutes < 1) return "Due now";
  if (minutes < 60) return `Due in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

  const hours = Math.floor(left / HOUR_MS);
  if (hours < 24) return `Due in ${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.floor(left / (24 * HOUR_MS));
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

/** The badge colour each band carries. Never the only signal: the words say it too. */
export const DUE_TONE: Record<DueUrgency, "plain" | "good" | "warn" | "bad" | "accent"> = {
  late: "bad",
  urgent: "bad",
  soon: "warn",
  later: "plain",
};
