import type { OrderStatus } from "@prisma/client";

/**
 * A docket moves forward, or it is cancelled. Nothing moves backwards: a cake
 * that has left the kitchen cannot be un-baked, and a board people trust is one
 * where a row never quietly regresses.
 *
 * `prisma/schema.prisma` has always described this sequence and nothing ever
 * enforced it, because until now nothing changed a status at all — every order
 * ever placed sat at `draft` forever.
 *
 * The import is type-only, so this file stays runtime-free like the rest of
 * lib/ while the schema remains the single source of truth for the names.
 */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_kitchen", "cancelled"],
  in_kitchen: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

/**
 * The form is not the only thing that can ask for a transition, so this is
 * checked again on the server before anything is written.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUS[from]?.includes(to) ?? false;
}

/** Terminal states. Useful for splitting a board into work and history. */
export function isClosed(status: OrderStatus): boolean {
  return NEXT_STATUS[status].length === 0;
}

/** What the board calls each state, in the bakery's voice rather than the enum's. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Awaiting our call",
  confirmed: "Confirmed",
  in_kitchen: "In the kitchen",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * The label on the button that moves a docket *to* this state — an instruction
 * to whoever is holding the phone, not a noun.
 */
export const ACTION_LABEL: Record<OrderStatus, string> = {
  draft: "Reopen",
  confirmed: "Confirm",
  in_kitchen: "Start baking",
  out_for_delivery: "Send out",
  delivered: "Mark delivered",
  cancelled: "Cancel",
};

/** One line on an order's history, ready to render. */
export interface TimelineEntry {
  label: string;
  at: Date;
  /** The staff member who made the move, when the row still names one. */
  actorName: string | null;
}

/**
 * What happened to this order, oldest first.
 *
 * "Order placed" is derived from the order's own `createdAt` rather than stored
 * as an event, because every order that has ever existed already carries that
 * timestamp — recording it a second time would only create a way for the two to
 * disagree, and would leave every order placed before OrderEvent existed with a
 * timeline that started nowhere.
 *
 * Everything after it is a row somebody's click actually wrote. Nothing is
 * inferred: an order confirmed and delivered before this table existed shows
 * one line, not the five a plausible-looking history would have invented for
 * it. A thin timeline is the truth about what was recorded, and a bakery
 * reading it can tell the difference between "this did not happen" and "we did
 * not write it down" — a fabricated one takes that away.
 *
 * Sorted here rather than trusted from the caller for the same reason the rest
 * of this file is pure: the query orders these already, and a function that
 * quietly depends on that is one refactor away from rendering history out of
 * sequence.
 */
export function buildTimeline(
  createdAt: Date,
  events: { toStatus: OrderStatus; createdAt: Date; actorName: string | null }[],
): TimelineEntry[] {
  return [
    { label: "Order placed", at: createdAt, actorName: null },
    ...events
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({
        label: STATUS_LABEL[e.toStatus],
        at: e.createdAt,
        actorName: e.actorName,
      })),
  ];
}

/* ------------------------------------------------------ the customer's view */

/**
 * The forward path a docket takes, derived rather than restated.
 *
 * Walked out of NEXT_STATUS itself, starting at the state every order is
 * created in and taking the one move at each step that is not a cancellation.
 * A second hardcoded list would be the "do not hardcode statuses in two places"
 * mistake in its purest form: add `packed` between the kitchen and the road and
 * this picks it up, while a literal array would keep drawing a five-step
 * tracker for a six-step process and nothing would fail.
 *
 * The `includes` guard is not defensive theatre — it is what stops a cycle
 * added to NEXT_STATUS from hanging the render of every order page.
 */
export const HAPPY_PATH: OrderStatus[] = (() => {
  const path: OrderStatus[] = ["draft"];
  for (;;) {
    const next = NEXT_STATUS[path[path.length - 1]!]?.find((s) => s !== "cancelled");
    if (!next || path.includes(next)) return path;
    path.push(next);
  }
})();

/**
 * The same six states, said to the person who ordered the cake.
 *
 * STATUS_LABEL above is the bakery's voice, written for a board the kitchen
 * reads: "Awaiting our call" is an instruction to staff. A customer needs the
 * other half of that sentence — what has happened, and what happens next — so
 * each state carries a note as well as a name.
 *
 * A Record rather than a function with a switch, for the reason STATUS_LABEL is
 * one: a status added to the Prisma enum fails the build here instead of
 * rendering a step with no name on somebody's tracker.
 */
export const CUSTOMER_STATUS: Record<OrderStatus, { label: string; note: string }> = {
  draft: {
    label: "Order placed",
    note: "We have your order. The bakery rings the number on it to confirm the details.",
  },
  confirmed: {
    label: "Order confirmed",
    note: "Confirmed and booked into the kitchen's day.",
  },
  in_kitchen: {
    label: "In the kitchen",
    note: "Your cake is being baked and finished by hand.",
  },
  out_for_delivery: {
    label: "Out for delivery",
    note: "It has left the kitchen and is on its way to you.",
  },
  delivered: {
    label: "Delivered",
    note: "Delivered. We hope it was a good one.",
  },
  cancelled: {
    label: "Cancelled",
    note: "This order was cancelled, and nothing will be baked or charged against it.",
  },
};

/**
 * The two states a pickup order does not have.
 *
 * Nothing is delivered to somebody collecting from the counter, and telling
 * them their cake is "out for delivery" is a claim about a rider who was never
 * dispatched. The state machine is untouched — `out_for_delivery` is still the
 * status, still the same row, still moved by the same button — this only
 * changes the two words printed over it when the slot the customer chose was
 * `pickup`. Every other state reads the same either way.
 */
const PICKUP_STATUS: Partial<Record<OrderStatus, { label: string; note: string }>> = {
  out_for_delivery: {
    label: "Ready to collect",
    note: "Boxed and waiting at the counter. Bring the order reference.",
  },
  delivered: {
    label: "Collected",
    note: "Collected from the counter. We hope it was a good one.",
  },
};

export function customerStatus(
  status: OrderStatus,
  pickup = false,
): { label: string; note: string } {
  return (pickup ? PICKUP_STATUS[status] : undefined) ?? CUSTOMER_STATUS[status];
}

/**
 * The three buckets an order list can be filtered into.
 *
 * A Record for the exhaustiveness again, rather than `status === "cancelled" ?
 * … : isClosed(status) ? …`, which would silently sort a seventh status into
 * "active" and put a refunded order on the tab marked as still coming.
 */
export type OrderPhase = "active" | "delivered" | "cancelled";

export const PHASE: Record<OrderStatus, OrderPhase> = {
  draft: "active",
  confirmed: "active",
  in_kitchen: "active",
  out_for_delivery: "active",
  delivered: "delivered",
  cancelled: "cancelled",
};

/** One node on the tracker, and one row of the timeline. They are the same list. */
export interface ProgressStep {
  status: OrderStatus;
  label: string;
  note: string;
  /**
   * `done` happened, `current` is where it is, `upcoming` has not happened yet,
   * and `stopped` is a step a cancelled order will now never reach.
   */
  state: "done" | "current" | "upcoming" | "stopped";
  /**
   * When it happened, or null.
   *
   * Null on a step that has not happened — and also on one that plainly did but
   * was never written down, which is every status change made before OrderEvent
   * existed. See `buildTimeline` above: a plausible timestamp invented for it
   * would turn a record into a story.
   */
  at: Date | null;
}

/**
 * Where this order is, as the customer's tracker and timeline both need it.
 *
 * One function for both, because two would be two answers to "has it left the
 * kitchen" and the horizontal tracker disagreeing with the vertical timeline
 * underneath it is precisely the bug that makes a tracking page untrustworthy.
 *
 * Everything is derived from the order's own `status` column and its recorded
 * events. Nothing is inferred from elapsed time: an order that is late is still
 * `in_kitchen` until somebody says otherwise, and guessing on the customer's
 * screen would be the one lie this page cannot afford.
 */
export function buildProgress(
  order: { status: OrderStatus; createdAt: Date; deliverySlot?: string },
  events: { toStatus: OrderStatus; fromStatus: OrderStatus | null; createdAt: Date }[],
): ProgressStep[] {
  const pickup = order.deliverySlot === "pickup";
  const sorted = events
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  /** The first time this order entered a state, if the move was recorded. */
  const at = (s: OrderStatus): Date | null =>
    s === "draft"
      ? order.createdAt
      : sorted.find((e) => e.toStatus === s)?.createdAt ?? null;

  const cancelled = order.status === "cancelled";
  const cancelEvent = cancelled
    ? sorted.find((e) => e.toStatus === "cancelled")
    : undefined;

  /*
   * How far it actually got. For a live order that is its own status. For a
   * cancelled one it is the state it was cancelled *from*, which the event row
   * kept on purpose — without it a cancelled order would show as abandoned at
   * "placed" even when the cake was already baked.
   */
  const reached = HAPPY_PATH.indexOf(
    (cancelled ? cancelEvent?.fromStatus ?? "draft" : order.status),
  );

  /*
   * A finished order has no "happening now". `delivered` is the end of the road
   * and its node is a tick, not the pulsing dot that means somebody is working
   * on it — a customer looking at a delivered cake should not be told the
   * delivery is in progress. `isClosed` is the same predicate the kitchen board
   * splits work from history by.
   */
  const finished = isClosed(order.status);

  const steps: ProgressStep[] = HAPPY_PATH.map((status, i) => ({
    status,
    ...customerStatus(status, pickup),
    state:
      i < reached ? "done"
      : i === reached ? (finished ? "done" : "current")
      : cancelled ? "stopped"
      : "upcoming",
    at: at(status),
  }));

  return cancelled
    ? [...steps, {
        status: "cancelled" as OrderStatus,
        ...customerStatus("cancelled", pickup),
        state: "current",
        at: at("cancelled"),
      }]
    : steps;
}

/**
 * When this order is due, from the lead time frozen onto it.
 *
 * The same arithmetic the admin detail page and the new-order notification have
 * always done, said once. `leadHours` already includes whatever the delivery
 * zone adds — app/api/orders writes `slot.effectiveLeadHours` — so this needs no
 * catalogue and no pincode, which is what lets a list of orders compute it
 * without a lookup per row.
 *
 * It is a promise made when the order was taken, not a prediction refreshed
 * since. Nothing here consults the clock: an order past its window is late, and
 * quietly sliding the estimate forward is how a tracking page stops being worth
 * looking at.
 */
export function dueAt(order: { createdAt: Date; leadHours: number }): Date {
  return new Date(order.createdAt.getTime() + order.leadHours * 3600_000);
}
