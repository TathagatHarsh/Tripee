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

import { getCatalogSnapshot } from "@/lib/catalogData";
import { DEFAULT_DELIVERY_RULES } from "@/lib/deliveryRules";

describe("catalogue load when the DeliverySettings table is missing", () => {
  it("falls back to the default rules instead of failing the catalogue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    m.rules.mockRejectedValue(new Error('relation "DeliverySettings" does not exist'));
    const s = await getCatalogSnapshot();
    // Outside production a failed load also yields defaults, so prove the read was tolerated, not the load failed.
    expect(warn).toHaveBeenCalledWith("delivery_settings_unreadable", expect.any(Error));
    expect(s.deliveryRules).toEqual(DEFAULT_DELIVERY_RULES);
  });
});
