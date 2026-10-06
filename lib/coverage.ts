import { haversine, type Point } from "./assignmentRules";

export type CoverageVendor = {
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
  isActive: boolean;
  isAcceptingOrders: boolean;
};

/**
 * Whether some bakery that can take work today has this pin inside its
 * delivery radius. Straight-line on purpose: checkout needs a fast yes or no,
 * and road distance stays the assignment engine's job. The pincode zones
 * (lib/delivery) are checked separately; an order needs both.
 */
export function coversPoint(vendors: CoverageVendor[], point: Point): boolean {
  return vendors.some(
    (v) =>
      v.isActive &&
      v.isAcceptingOrders &&
      v.latitude !== null &&
      v.longitude !== null &&
      haversine({ lat: v.latitude, lng: v.longitude }, point) <= v.serviceRadiusKm,
  );
}

/** coversPoint against the live vendor list. Server only. */
export async function isCovered(point: Point): Promise<boolean> {
  const { db } = await import("./db");
  const vendors = await db.vendor.findMany({
    where: { isActive: true, isAcceptingOrders: true },
    select: { latitude: true, longitude: true, serviceRadiusKm: true, isActive: true, isAcceptingOrders: true },
  });
  return coversPoint(vendors, point);
}
