import type { Vendor } from "@prisma/client";
export type Point = { lat: number; lng: number };
export type RouteEstimate = {
  distanceKm: number;
  estimatedMinutes: number;
  source: string;
};
export function pointFrom(value: unknown): Point | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const lat = p.latitude ?? p.lat,
    lng = p.longitude ?? p.lng;
  return typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
export function haversine(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function earnings(
  subtotal: number,
  commissionBps: number,
  feePaise: number,
) {
  if (
    ![subtotal, commissionBps, feePaise].every(Number.isSafeInteger) ||
    subtotal < 0 ||
    commissionBps < 0 ||
    commissionBps > 10000 ||
    feePaise < 0
  )
    throw new Error("Invalid earnings rule");
  const commissionPaise = Math.round((subtotal * commissionBps) / 10000);
  const fee = Math.min(feePaise, subtotal - commissionPaise);
  return {
    commissionPaise,
    feePaise: fee,
    vendorEarningPaise: subtotal - commissionPaise - fee,
  };
}
export function vendorEligible(
  v: Vendor,
  products: (string | null)[],
  load: number,
  now = new Date(),
  requireLocation = true,
) {
  return (
    v.isActive &&
    v.isAcceptingOrders &&
    (!requireLocation || !!pointFrom(v)) &&
    (!v.unavailableUntil || v.unavailableUntil <= now) &&
    load < v.maxConcurrentOrders &&
    (v.fulfillsAllProducts ||
      (products.length > 0 &&
        products.every(
          (id) => id !== null && v.supportedProductIds.includes(id),
        )))
  );
}
export function sortCandidates<T extends RouteEstimate & { vendorId: string }>(
  rows: T[],
  strategy: "distance" | "time",
) {
  return [...rows].sort(
    (a, b) =>
      (strategy === "time"
        ? a.estimatedMinutes - b.estimatedMinutes
        : a.distanceKm - b.distanceKm) ||
      a.distanceKm - b.distanceKm ||
      a.vendorId.localeCompare(b.vendorId),
  );
}
