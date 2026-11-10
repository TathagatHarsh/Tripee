import "server-only";
import type { CustomRequest, Prisma, Vendor } from "@prisma/client";
import { vendorBlockers } from "./assignment";
import { haversine, pointFrom } from "./assignmentRules";
import { meetsDeadline } from "./inventoryRules";

/** Nearest bakery that can take this request. Straight-line distance only: a quote is not a route promise. */
export async function nextBakery(tx: Prisma.TransactionClient, request: CustomRequest): Promise<{ vendor: Vendor; distanceKm: number } | null> {
  const dest = pointFrom(request.address);
  if (!dest) return null;
  const now = new Date();
  let best: { vendor: Vendor; distanceKm: number } | null = null;
  for (const vendor of await tx.vendor.findMany({ where: { id: { notIn: request.triedVendorIds } } })) {
    const origin = pointFrom(vendor);
    if (!origin) continue;
    const distanceKm = haversine(origin, dest);
    if (distanceKm > vendor.serviceRadiusKm || (best && distanceKm >= best.distanceKm)) continue;
    if ((await vendorBlockers(tx, vendor, now)).length) continue;
    if (!meetsDeadline(request.dueAt, vendor.preparationMinutes, (distanceKm / 20) * 60, now)) continue;
    best = { vendor, distanceKm };
  }
  return best;
}
