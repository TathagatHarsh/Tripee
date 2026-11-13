import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const ok = (v: unknown) => ({ findMany: async () => v, findUnique: async () => v });
  return {
    rules: vi.fn(),
    ok,
  };
});

vi.mock("next/cache", () => ({ unstable_cache: (f: unknown) => f, updateTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  hasDatabase: () => true,
  db: {
    catalogOption: m.ok([]),
    pricingSettings: m.ok(null),
    deliveryZone: m.ok([]),
    bakerySettings: m.ok(null),
    deliverySettings: { findUnique: m.rules },
  },
}));

import { getCatalogSnapshot, readDeliverySettings } from "@/lib/catalogData";
import { DEFAULT_DELIVERY_RULES } from "@/lib/deliveryRules";

describe("catalogue load when the DeliverySettings table is missing", () => {
  it("falls back to the default rules instead of failing the catalogue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    m.rules.mockRejectedValue(Object.assign(new Error('The table `public.DeliverySettings` does not exist'), { code: 'P2021' }));
    const s = await getCatalogSnapshot();
    // Outside production a failed load also yields defaults, so prove the read was tolerated, not the load failed.
    expect(warn).toHaveBeenCalledWith("delivery_settings_unreadable", expect.any(Error));
    expect(s.deliveryRules).toEqual(DEFAULT_DELIVERY_RULES);
  });

  it("rethrows any other error, so the load fails rather than caching the defaults", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    m.rules.mockRejectedValue(Object.assign(new Error("connection reset"), { code: "P1017" }));
    await expect(readDeliverySettings()).rejects.toThrow("connection reset");
    // Outside production getCatalogSnapshot turns a failed load into the dev defaults; the failure is what's logged.
    await getCatalogSnapshot();
    expect(err).toHaveBeenCalledWith("catalog_read_failed", expect.objectContaining({ message: "connection reset" }));
  });
});
