import { haversine, type Point } from "./assignmentRules";
import { inHyderabad } from "./location";

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

/**
 * `SERVICE_AREA=hyderabad` treats every pin in the city as deliverable,
 * whatever bakeries are mapped: for demos and launch, before bakery locations
 * and radii are filled in. Unset, coverage comes from the bakeries alone.
 *
 * ponytail: one hard-coded city box; a list of areas if the shop leaves
 * Hyderabad.
 */
export function serviceAreaCovers(point: Point, area: string | undefined): boolean {
  return area === "hyderabad" && inHyderabad(point);
}

/** The service area, else coversPoint against the live vendor list. Server only. */
export async function isCovered(point: Point): Promise<boolean> {
  if (serviceAreaCovers(point, process.env.SERVICE_AREA)) return true;
  const { db } = await import("./db");
  const vendors = await db.vendor.findMany({
    where: { isActive: true, isAcceptingOrders: true },
    select: { latitude: true, longitude: true, serviceRadiusKm: true, isActive: true, isAcceptingOrders: true },
  });
  return coversPoint(vendors, point);
}
