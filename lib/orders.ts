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
