import type { OrderStatus } from "@prisma/client";
import { db } from "./db";
import { canTransition } from "./orders";

/**
 * Move one order along, and record that it moved.
 *
 * Both staff surfaces come through here — app/kitchen's board and the admin
 * portal's order detail. Two call sites rather than two implementations: the
 * sequence a docket follows is lib/orders' `canTransition` and nothing else
 * validates it, so there is no second state machine to drift out of step with
 * the first.
 *
 * ## Why the write is conditional
 *
 * Reading the status, deciding the move is legal, and then writing it
 * unconditionally is a race with a real cost. Two people at two screens — the
 * counter tablet and the office — can both read `draft`, both be told
 * "confirming a draft is legal", and both write. The second write would
 * silently overwrite the first and, worse, both would record an event, leaving
 * a history claiming the same order was confirmed twice from the same state.
 *
 * So the update is a compare-and-swap: it matches on the id *and* on the status
 * that was just read, which `db.order.update` cannot express (it takes only a
 * unique selector) and `updateMany` can. If anybody moved this order in
 * between, the WHERE matches nothing, `count` is 0, and this returns false
 * having written nothing at all — no status change and no event. Postgres
 * serialises the row-level UPDATE itself, so exactly one of two concurrent
 * callers can win, and the loser is told it lost rather than reporting success.
 *
 * The event is created inside the same transaction as the update, after the
 * count is known, so a row in OrderEvent always means the move landed.
 *
 * `actorId` comes from the caller's authenticated session, never from a form
 * field — see the `requireKitchen()` / `requireAdmin()` calls at the top of the
 * two actions. A null actor is allowed for a move made by no signed-in person,
 * which is not something either surface can currently produce.
 *
 * @returns true if this call is the one that moved the order.
 */
export async function applyStatusTransition(
  ref: string,
  to: OrderStatus,
  actorId: string | null,
): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { ref },
    select: { id: true, status: true },
  });
  if (!order) {
    console.warn("rejected_status_transition", { ref, to, why: "no_such_order" });
    return false;
  }

  // The only business rule, asked once, of the same map the buttons were drawn
  // from. An illegal move stops here without opening a transaction.
  if (!canTransition(order.status, to)) {
    console.warn("rejected_status_transition", { ref, from: order.status, to, why: "illegal" });
    return false;
  }

  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: to },
    });

    // Somebody else got there first. Nothing written, nothing recorded.
    if (count === 0) {
      /*
       * Logged apart from an illegal move, because they are different events
       * with the same outcome: one is a button that should not have existed,
       * the other is two people working the same order a second apart. Reading
       * a run of these is how you find out the second is happening.
       */
      console.warn("rejected_status_transition", { ref, from: order.status, to, why: "raced" });
      return false;
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: to,
        actorId,
      },
    });

    return true;
  });
}
