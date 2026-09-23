import { describe, expect, it, vi } from "vitest";
import type { Vendor } from "@prisma/client";
vi.mock("server-only", () => ({}));
import {
  earnings,
  haversine,
  pointFrom,
  sortCandidates,
  vendorEligible,
} from "../lib/assignmentRules";
import { getDistanceMatrix } from "../lib/mapping";
const v = {
  isActive: true,
  isAcceptingOrders: true,
  latitude: 17.43,
  longitude: 78.4,
  maxConcurrentOrders: 2,
  unavailableUntil: null,
  fulfillsAllProducts: false,
  supportedProductIds: ["cake"],
} as Vendor;
describe("assignment ranking and eligibility", () => {
  it("prefers road distance or configured travel time with stable ties", () => {
    const rows = [
      { vendorId: "a", distanceKm: 2, estimatedMinutes: 20, source: "osrm" },
      { vendorId: "b", distanceKm: 3, estimatedMinutes: 10, source: "osrm" },
    ];
    expect(sortCandidates(rows, "distance")[0].vendorId).toBe("a");
    expect(sortCandidates(rows, "time")[0].vendorId).toBe("b");
    expect(rows[0].vendorId).toBe("a");
  });
  it("excludes unavailable, inactive, full and unsupported bakeries", () => {
    expect(vendorEligible(v, ["cake"], 1)).toBe(true);
    for (const overrides of [
      { isActive: false },
      { isAcceptingOrders: false },
      { latitude: null },
      { unavailableUntil: new Date(Date.now() + 100000) },
    ])
      expect(vendorEligible({ ...v, ...overrides }, ["cake"], 0)).toBe(false);
    expect(vendorEligible(v, ["cake"], 2)).toBe(false);
    expect(vendorEligible(v, ["other"], 0)).toBe(false);
    expect(vendorEligible(v, [null], 0)).toBe(false);
  });
  it("rejects invalid coordinates and keeps legitimate zero coordinates", () => {
    expect(pointFrom({ latitude: 0, longitude: 0 })).toEqual({
      lat: 0,
      lng: 0,
    });
    expect(pointFrom({ lat: NaN, lng: 0 })).toBeNull();
    expect(pointFrom({ lat: 91, lng: 2 })).toBeNull();
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111.195,
      2,
    );
  });
  it("uses marked Haversine fallback only on provider failure, excludes known unreachable roads", async () => {
    const p = { lat: 17.4, lng: 78.4 },
      q = { lat: 17.41, lng: 78.41 };
    const failed = await getDistanceMatrix([p], q, {
      matrix: async () => {
        throw Error("timeout");
      },
    });
    expect(failed[0]?.source).toBe("haversine_estimate");
    expect(
      await getDistanceMatrix([p], q, { matrix: async () => [null] }),
    ).toEqual([null]);
  });
});
describe("server earnings in integer paise", () => {
  it("freezes commission and fees and excludes taxes and delivery by taking product subtotal", () => {
    expect(earnings(100000, 2000, 5000)).toEqual({
      commissionPaise: 20000,
      feePaise: 5000,
      vendorEarningPaise: 75000,
    });
    expect(earnings(101, 1500, 0).vendorEarningPaise).toBe(86);
    expect(earnings(100, 2000, 1000).vendorEarningPaise).toBe(0);
    expect(() => earnings(100, 10001, 0)).toThrow();
    expect(() => earnings(-100, 2000, 0)).toThrow();
  });
});
