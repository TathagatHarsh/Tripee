import type { VendorOrderStatus } from "@prisma/client";
import { db } from "./db";
import {
  AssignmentConflict,
  manualAssignment,
  moveFulfillment,
  respondToAssignment,
} from "./assignment";
import { canVendorTransition } from "./vendors";
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
