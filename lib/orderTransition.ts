import type { OrderStatus } from "@prisma/client";
import { db } from "./db";
import { outboxCreate } from "./notifications";
import { canTransition } from "./orders";

/**
 * The authoritative aggregate transition. Customer status, due-time freezing,
 * vendor withdrawal, histories, and notifications commit together.
 */
export async function applyStatusTransition(
  ref: string,
  to: OrderStatus,
  actorId: string | null,
  reason?: string | null,
): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { ref },
    select: {
      id: true,
      status: true,
      leadHours: true,
      requestedFor: true,
      currentAssignmentId: true,
      currentAssignment: {
        select: {
          id: true,
          status: true,
          vendorId: true,
          vendor: { select: { email: true, phone: true } },
        },
      },
    },
  });
  if (!order) return false;
  if (!canTransition(order.status, to)) return false;

  const now = new Date();
  const minimumDue = new Date(now.getTime() + order.leadHours * 3_600_000);
  const dueAt =
    order.requestedFor ?? minimumDue;

  return db.$transaction(async (tx) => {
    const data = {
      status: to,
      ...(to === "confirmed" ? { confirmedAt: now, dueAt } : {}),
      ...(to === "cancelled"
        ? {
            cancellationReason: reason?.trim().slice(0, 500) || "Cancelled by staff",
            currentAssignmentId: null,
          }
        : {}),
    };
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data,
    });
    if (changed.count !== 1) return false;

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: to,
        actorId,
      },
    });

    if (to === "cancelled" && order.currentAssignment) {
      const assignment = order.currentAssignment;
      await tx.vendorOrder.update({
        where: { id: assignment.id },
        data: { status: "withdrawn", withdrawnAt: now },
      });
      await tx.vendorOrderEvent.create({
        data: {
          vendorOrderId: assignment.id,
          fromStatus: assignment.status,
          toStatus: "withdrawn",
          actorId,
          reason: reason?.trim().slice(0, 500) || "Customer order cancelled",
        },
      });
      await tx.notificationOutbox.create({
        data: outboxCreate({
          orderId: order.id,
          vendorId: assignment.vendorId,
          kind: "order_cancelled",
          destination: assignment.vendor.email ?? assignment.vendor.phone,
          dedupeKey: `order:${order.id}:cancelled:vendor:${assignment.vendorId}`,
          payload: { ref, reason: reason?.trim() || "Cancelled by staff" },
        }),
      });
    }

    await tx.notificationOutbox.create({
      data: outboxCreate({
        orderId: order.id,
        kind: to === "cancelled" ? "order_cancelled" : "status_changed",
        dedupeKey: `order:${order.id}:status:${to}`,
        payload: {
          ref,
          from: order.status,
          to,
          dueAt: to === "confirmed" ? dueAt.toISOString() : null,
        },
      }),
    });

    return true;
  });
}
