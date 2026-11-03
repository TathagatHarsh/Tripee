import type { VendorOrderStatus } from "@prisma/client";
import { db } from "./db";
import {
  AssignmentConflict,
  manualAssignment,
  moveFulfillment,
  respondToAssignment,
} from "./assignment";
import { applyStatusTransition } from "./orderTransition";
import { canVendorTransition, VENDOR_DELIVERY_NEXT } from "./vendors";
export async function applyVendorTransition(
  vendorId: string,
  ref: string,
  to: VendorOrderStatus,
  reason: string | null = null,
  assignmentId?: string,
  actorId?: string,
): Promise<boolean> {
  try {
    if (to === "accepted" || to === "rejected") {
      // Require the exact offer id. A stale form must never accept a newer offer.
      if (!assignmentId) return false;
      return (
        await respondToAssignment(
          vendorId,
          ref,
          assignmentId,
          to === "accepted" ? "ACCEPTED" : "REJECTED",
          reason ?? undefined,
          actorId,
        )
      ).ok;
    }
    return await moveFulfillment(vendorId, ref, to, assignmentId, actorId);
  } catch (error) {
    if (error instanceof AssignmentConflict) return false;
    throw error;
  }
}
/* Handing over is the cake leaving the bakery, which the customer reads as out
   for delivery (ready to collect, for a pickup). A second transaction: if it
   loses a race, vendorDeliveryMove can still send the order out by hand. The
   portal and WhatsApp both come through here so the two cannot drift apart. */
export async function handOver(
  vendorId: string,
  ref: string,
  assignmentId: string,
  actorId: string | null,
): Promise<boolean> {
  const moved = await applyVendorTransition(vendorId, ref, "handed_over", null, assignmentId, actorId ?? undefined);
  if (moved) await applyStatusTransition(ref, "out_for_delivery", actorId);
  return moved;
}
/**
 * The two delivery moves, which are the customer's Order moving rather than the
 * bakery's assignment. The order must be held by this bakery, through this
 * exact assignment, already handed over; lib/orderTransition then re-checks the
 * state machine inside its own lock.
 */
export async function vendorDeliveryMove(
  vendorId: string,
  ref: string,
  assignmentId: string,
  to: "out_for_delivery" | "delivered",
  actorId: string | null,
): Promise<boolean> {
  const order = await db.order.findFirst({
    where: { ref, currentAssignment: { id: assignmentId, vendorId, status: "handed_over" } },
    select: { status: true },
  });
  return !!order && VENDOR_DELIVERY_NEXT[order.status] === to && applyStatusTransition(ref, to, actorId);
}
export type AssignOutcome =
  | "assigned"
  | "no_order"
  | "no_vendor"
  | "ineligible"
  | "raced";
export async function assignOrderToVendor(
  ref: string,
  vendorId: string,
  actorId: string | null,
): Promise<AssignOutcome> {
  if (!(await db.order.findUnique({ where: { ref }, select: { id: true } })))
    return "no_order";
  if (
    !(await db.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    }))
  )
    return "no_vendor";
  try {
    await manualAssignment(ref, vendorId, actorId);
    return "assigned";
  } catch (error) {
    if (error instanceof AssignmentConflict) return "ineligible";
    throw error;
  }
}
export function vendorMoves(from: VendorOrderStatus): VendorOrderStatus[] {
  return (
    ["accepted", "rejected", "in_preparation", "ready", "handed_over"] as const
  ).filter((to) => canVendorTransition(from, to));
}
