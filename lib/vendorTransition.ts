import type { OrderStatus, Prisma, VendorOrderStatus } from "@prisma/client";
import { db } from "./db";
import { canTransition } from "./orders";
import { outboxCreate } from "./notifications";
import {
  canVendorTransition, mayVendorAct, ORDER_STATUS_FOR_VENDOR, releasesOrder, STAMP,
} from "./vendors";

/**
 * The only two things in the product that write a vendor assignment.
 *
 * The sibling of lib/orderTransition.ts, and deliberately the same shape: read,
 * check the rules against the pure machine in lib/vendors, then write
 * *conditionally on nothing having changed since the read*. Every paragraph of
 * that file's reasoning about races applies here and is not repeated; what
 * follows is only what is different about a vendor.
 *
 * ## Two rows, one lock, one order of acquisition
 *
 * An assignment is two facts: the VendorOrder row's own status, and whether
 * `Order.currentAssignmentId` still points at it. A move can change both, and
 * so can an assignment, which means these two functions can collide — an owner
 * reassigning at the moment a vendor declines is a Tuesday afternoon, not a
 * thought experiment.
 *
 * `Order.currentAssignmentId` is the lock. It is one column with a UNIQUE index
 * on it, so a compare-and-swap against the value that was just read has exactly
 * one winner and Postgres does the serialising. That is the whole reason the
 * pointer exists rather than "the newest assignment that is not rejected" —
 * see prisma/schema.prisma on the column.
 *
 * **Both functions take the Order row before the VendorOrder row.** Not a
 * stylistic preference: the reverse order in one of them and the same order in
 * the other is a deadlock, each transaction holding the row the other is
 * waiting for. Postgres would detect it and abort one, which is safe and also a
 * raw database error in a log instead of the honest "somebody got there first"
 * these return. A fixed acquisition order means the loser simply waits and then
 * finds its WHERE no longer matches.
 *
 * ## What is written to the *order*, and what is not
 *
 * Almost nothing, and that is still the position. Vendor fulfilment is a second
 * state machine beside the customer's, not a driver of it — a cake being ready
 * at a partner bakery is not the same claim as "out for delivery", and the board
 * and the tracking page stay answerable to `applyStatusTransition`.
 *
 * The single exception is a bakery *starting* a cake, which is the one vendor
 * move that is also a true statement about the customer's order: `in_kitchen`
 * does not claim whose kitchen. lib/vendors' `ORDER_STATUS_FOR_VENDOR` holds
 * that mapping and the six deliberate nulls beside it, with the reasoning.
 *
 * Crucially this is **not a second way to set a status**. It calls the same
 * `applyStatusTransition` the kitchen board and the admin portal call, so the
 * move is validated by `canTransition`, compare-and-swapped against a concurrent
 * write, and recorded as an OrderEvent exactly as a staff move is. A vendor
 * cannot reach a status the order's own rules forbid, and cannot reach any
 * status at all except the one this map names.
 *
 * It runs **after** the assignment's transaction has committed, not inside it.
 * The two are independent machines and the vendor's move is authoritative about
 * itself: if the order cannot legally follow — it is still `draft` because the
 * office has not rung the customer, or already past the kitchen, or cancelled —
 * the assignment still moved, and `applyStatusTransition` declines and logs.
 * That refusal is a normal outcome here rather than a failure.
 */

/** Thrown inside a transaction to roll it back. Never leaves this file. */
class Raced extends Error {}

/* -------------------------------------------------------- the vendor's move */

/**
 * A partner bakery moves their own assignment along.
 *
 * `vendorId` comes from lib/auth's `requireVendor`, which reads it off the
 * signed-in person's profile row — there is no argument anywhere in the product
 * that lets a request name a vendor. It appears **twice** below, in the read and
 * again in the write's WHERE, and the duplication is deliberate: the read being
 * scoped is a property of this function's code, and the write being scoped is a
 * property that survives somebody editing it.
 *
 * The lookup is by order reference because that is what a vendor has in front of
 * them, and it takes the newest of that vendor's rows for the order — a bakery
 * that was given an order, declined it, and was later given it again has two,
 * and the live one is the recent one. The older row cannot be moved by accident
 * regardless: `rejected` and `withdrawn` have no outgoing edges in
 * lib/vendors' VENDOR_NEXT, so a stale row fails the rules check before any
 * transaction opens.
 *
 * That same fact is why there is no separate "is this still the order's current
 * assignment" check. The only ways a row stops being current are rejection and
 * withdrawal, and both are terminal for a vendor, so "this vendor may move it"
 * and "this row is the live one" are the same condition asked once.
 *
 * @returns true if this call is the one that moved it.
 */
export async function applyVendorTransition(
  vendorId: string,
  orderRef: string,
  to: VendorOrderStatus,
  reason: string | null = null,
): Promise<boolean> {
  const assignment = await db.vendorOrder.findFirst({
    // The fence. Another vendor's assignment is not found rather than found and
    // refused — nothing about another bakery's work reaches this process.
    where: { vendorId, order: { ref: orderRef } },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      vendorId: true,
      status: true,
      orderId: true,
      order: { select: { status: true, currentAssignmentId: true } },
    },
  });

  if (!mayVendorAct(assignment, vendorId, to)) {
    console.warn("rejected_vendor_transition", {
      orderRef,
      vendorId,
      to,
      why: !assignment ? "not_theirs" : "illegal",
      from: assignment?.status,
    });
    return false;
  }

  const from = assignment!.status;
  const orderId = assignment!.orderId;
  const id = assignment!.id;
  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string; currentAssignmentId: string | null }>>`
        SELECT status::text, "currentAssignmentId"
        FROM "Order"
        WHERE id = ${orderId}
        FOR UPDATE
      `;
      const customer = locked[0];
      if (
        !customer
        || customer.currentAssignmentId !== id
        || (customer.status !== "confirmed" && customer.status !== "in_kitchen")
      ) throw new Raced();

      /*
       * The Order row first — see the note at the top of this file about why the
       * order of these two writes is fixed rather than incidental.
       *
       * Zero rows here is not a failure. It means the office had already moved
       * this order on, in which case the status CAS below is the one that will
       * refuse; clearing a pointer that no longer names this assignment would
       * simply have been a no-op anyway.
       */
      if (releasesOrder(to)) {
        await tx.order.updateMany({
          where: { id: orderId, currentAssignmentId: id },
          data: { currentAssignmentId: null },
        });
      }

      const data = {
        status: to,
        [STAMP[to]]: now,
        /* Only ever written alongside a rejection, and only when one was given.
           A reason on any other row would be a sentence with no event attached
           to it. */
        ...(to === "rejected" && reason ? { rejectionReason: reason } : {}),
      } as Prisma.VendorOrderUpdateManyMutationInput;

      const { count } = await tx.vendorOrder.updateMany({
        // `status: from` is the compare-and-swap; `vendorId` is the fence again.
        where: { id, vendorId, status: from },
        data,
      });

      // Somebody moved this between the read and here — the office withdrawing
      // it, or the same bakery double-tapping a button on a phone. Thrown rather
      // than returned, because the pointer above may already have been cleared
      // and a transaction is the only thing that can take that back.
      if (count === 0) throw new Raced();

      await tx.vendorOrderEvent.create({
        data: {
          vendorOrderId: id,
          fromStatus: from,
          toStatus: to,
          reason: to === "rejected" ? reason : null,
        },
      });

      const next = ORDER_STATUS_FOR_VENDOR[to];
      if (next) {
        if (!canTransition(customer.status as OrderStatus, next)) {
          throw new Raced();
        }
        await tx.order.update({ where: { id: orderId }, data: { status: next } });
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus: customer.status as OrderStatus,
            toStatus: next,
            actorId: null,
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof Raced) {
      console.warn("rejected_vendor_transition", { orderRef, vendorId, from, to, why: "raced" });
      return false;
    }
    throw e;
  }

  /*
   * The assignment moved. Now the customer's order, if this move is also a true
   * statement about it — which is to say, if the bakery has just started baking.
   * See the note at the top of this file, and lib/vendors'
   * ORDER_STATUS_FOR_VENDOR for why every other move maps to null.
   *
   * Not awaited inside the transaction above, and not allowed to fail this call
   * either. The vendor's move is committed and is authoritative about itself; a
   * database that dies between the two writes must not report a move that landed
   * as one that did not, because the bakery's only recourse would be to press the
   * button again and the order would then be a step behind with nobody looking
   * for it. Logged loudly instead — this is the one case an operator has to
   * reconcile by hand, and `applyStatusTransition` has already logged its own
   * ordinary refusals at a lower level.
   */
  return true;
}

/* ------------------------------------------------------- the office's move */

export type AssignOutcome = "assigned" | "no_order" | "no_vendor" | "ineligible" | "raced";

/**
 * Hand an order to a bakery, taking it off whoever had it.
 *
 * One function for assigning and reassigning, because they are one operation
 * with one race. A first assignment is the case where there was nobody to take
 * it off.
 *
 * ## Why the previous assignment is withdrawn rather than overwritten
 *
 * It stays, with its own row, its own timestamps and — if it was declined — the
 * reason the bakery gave. That is the entire purpose of VendorOrder being a
 * table rather than a column: the office choosing who to try next is reading
 * why the last one said no. `withdrawn` is how a *live* assignment leaves,
 * since recording it as a rejection would put words in a vendor's mouth.
 *
 * ## Why the new row is created before the lock is taken
 *
 * The compare-and-swap needs an id to swap *to*, and the id is the row's. So the
 * row is created first and the swap immediately after, inside one transaction:
 * if the swap finds the pointer already changed, the whole thing rolls back and
 * no orphan assignment is left behind for an order that was given to somebody
 * else a moment earlier.
 *
 * An inactive vendor is refused here and not only in the picker. A deactivated
 * bakery is one the shop has stopped sending work to, and a stale dropdown in a
 * tab somebody left open is exactly how it would get sent some anyway.
 */
export async function assignOrderToVendor(
  orderRef: string,
  vendorId: string,
  actorId: string | null,
): Promise<AssignOutcome> {
  const [order, vendor] = await Promise.all([
    db.order.findUnique({
      where: { ref: orderRef },
      select: { id: true, status: true, currentAssignmentId: true },
    }),
    db.vendor.findFirst({
      where: { id: vendorId, isActive: true },
      select: { id: true, email: true, phone: true },
    }),
  ]);

  if (!order) return "no_order";
  if (!vendor) return "no_vendor";
  if (order.status !== "confirmed" && order.status !== "in_kitchen") return "ineligible";

  const now = new Date();
  const incumbent = order.currentAssignmentId;

  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.vendorOrder.create({
        data: {
          orderId: order.id,
          vendorId,
          assignedAt: now,
          /* From the server session, never from the form. The same rule
             lib/orderTransition applies to an OrderEvent's actor. */
          assignedById: actorId,
        },
        select: { id: true },
      });

      /*
       * The lock, and the only thing standing between two owners at two screens
       * and two bakeries baking one cake. Matching on the pointer as it was read
       * rather than on the row's id alone is what makes it a compare-and-swap;
       * `updateMany` because `update` takes only a unique selector and cannot
       * express the second condition.
       */
      const { count } = await tx.order.updateMany({
        where: {
          id: order.id,
          currentAssignmentId: incumbent,
          status: { in: ["confirmed", "in_kitchen"] },
        },
        data: { currentAssignmentId: created.id },
      });

      if (count === 0) throw new Raced();

      await tx.vendorOrderEvent.create({
        data: {
          vendorOrderId: created.id,
          fromStatus: null,
          toStatus: "assigned",
          actorId,
        },
      });

      await tx.notificationOutbox.create({
        data: outboxCreate({
          orderId: order.id,
          vendorId,
          kind: "vendor_assigned",
          destination: vendor.email ?? vendor.phone,
          dedupeKey: `order:${order.id}:assignment:${created.id}`,
          payload: { ref: orderRef, assignmentId: created.id },
        }),
      });

      /*
       * Won the lock, so the incumbent was still live a moment ago and is this
       * transaction's to close. Taken second, after the Order row, for the
       * deadlock reason at the top of this file.
       *
       * `handedOverAt` is not cleared if it was set: an order taken back off a
       * bakery that had already handed it over reads "handed over 15:40, taken
       * back 16:10", which is what happened.
       */
      if (incumbent) {
        const previous = await tx.vendorOrder.findUnique({
          where: { id: incumbent },
          select: { status: true },
        });
        await tx.vendorOrder.update({
          where: { id: incumbent },
          data: { status: "withdrawn", withdrawnAt: now },
        });
        await tx.vendorOrderEvent.create({
          data: {
            vendorOrderId: incumbent,
            fromStatus: previous?.status ?? null,
            toStatus: "withdrawn",
            actorId,
            reason: "Reassigned by the office",
          },
        });
      }

      return "assigned" as const;
    });
  } catch (e) {
    if (e instanceof Raced) {
      console.warn("rejected_vendor_assignment", { orderRef, vendorId, why: "raced" });
      return "raced";
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ reading */

/**
 * Which moves to draw on a vendor's screen.
 *
 * Re-exported from the pure machine rather than restated, so the buttons and the
 * server's refusal are asking the same question of the same map.
 */
export function vendorMoves(from: VendorOrderStatus): VendorOrderStatus[] {
  return (["accepted", "rejected", "in_preparation", "ready", "handed_over"] as const).filter(
    (to) => canVendorTransition(from, to),
  );
}
