import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROWS, DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, snapshotFrom,
} from "@/lib/catalogDefaults";
import type { CatalogRow } from "@/lib/catalogSnapshot";
import {
  Coverage, DeliverySlot, Filling, Finish, Frosting, Shape, SizeBand, Sponge,
  Topping, ToppingPlacement,
} from "@/lib/schema";

/**
 * The catalogue moved into the database, and the failure that move makes
 * possible is a missing row: `spongeDelta["pistachio"]` coming back undefined
 * turns a price into NaN, and NaN reaches a customer as a blank total or an
 * order the kitchen cannot read. lib/schema.ts's Zod enums are what the code
 * can actually render, so they are what the defaults have to cover — exactly,
 * with nothing missing and nothing invented.
 */

const CATEGORY_ENUM = {
  shape: Shape,
  size: SizeBand,
  sponge: Sponge,
  filling: Filling,
  frosting: Frosting,
  coverage: Coverage,
  finish: Finish,
  topping: Topping,
  placement: ToppingPlacement,
  delivery: DeliverySlot,
} as const;

describe("catalogue defaults", () => {
  for (const [category, zodEnum] of Object.entries(CATEGORY_ENUM)) {
    it(`covers every ${category} the schema allows, exactly once`, () => {
      const rows = DEFAULT_ROWS.filter((r) => r.category === category);
      const values = rows.map((r) => r.value).sort();
      const allowed = [...zodEnum.options].sort();

      expect(values).toEqual(allowed);
      expect(new Set(values).size).toBe(values.length);
    });
  }

  it("prices every option as a non-negative integer number of paise", () => {
    for (const r of DEFAULT_ROWS) {
      expect(Number.isInteger(r.priceInputPaise), `${r.category}:${r.value}`).toBe(true);
      expect(r.priceInputPaise, `${r.category}:${r.value}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every size a multiplier, and nothing else one", () => {
    for (const r of DEFAULT_ROWS) {
      if (r.category === "size") expect(r.multiplier, r.value).toBeGreaterThan(0);
      else expect(r.multiplier, `${r.category}:${r.value}`).toBeUndefined();
    }
  });

  it("leaves no price table entry undefined", () => {
    const { price } = DEFAULT_SNAPSHOT;
    const table = {
      baseBySize: SizeBand, multiplierBySize: SizeBand, spongeDelta: Sponge,
      fillingDelta: Filling, frostingDelta: Frosting, finishLabour: Finish,
      toppingUnit: Topping, deliveryFee: DeliverySlot,
    } as const;

    for (const [name, zodEnum] of Object.entries(table)) {
      for (const value of zodEnum.options) {
        const got = (price[name as keyof typeof price] as Record<string, number>)[value];
        expect(got, `${name}.${value}`).toBeTypeOf("number");
        expect(Number.isNaN(got), `${name}.${value}`).toBe(false);
      }
    }
  });

  it("orders each category by the order it was authored in", () => {
    const sponges = DEFAULT_SNAPSHOT.byCategory.sponge;
    expect(sponges[0].value).toBe("vanilla");
    expect(sponges.map((s) => s.sortOrder)).toEqual(sponges.map((_, i) => i));
  });
});

describe("snapshotFrom", () => {
  const row = (over: Partial<CatalogRow>): CatalogRow => ({
    category: "filling", value: "rabri", name: "Rabri", blurb: "…",
    priceInputPaise: 22000, isAvailable: true, sortOrder: 11, ...over,
  });

  it("lets a database row win over the shipped price", () => {
    const s = snapshotFrom([row({ priceInputPaise: 99900 })], DEFAULT_SETTINGS);
    expect(s.price.fillingDelta.rabri).toBe(99900);
  });

  it("falls back to the shipped price for an option with no row", () => {
    // The table holds one filling; every other option must still have a price.
    const s = snapshotFrom([row({})], DEFAULT_SETTINGS);
    expect(s.price.fillingDelta.nutella).toBe(DEFAULT_SNAPSHOT.price.fillingDelta.nutella);
    expect(s.price.spongeDelta.pistachio).toBe(DEFAULT_SNAPSHOT.price.spongeDelta.pistachio);
    expect(s.byCategory.topping).toHaveLength(DEFAULT_SNAPSHOT.byCategory.topping.length);
  });

  it("carries availability through, so withdrawing an option works", () => {
    const s = snapshotFrom([row({ isAvailable: false })], DEFAULT_SETTINGS);
    const rabri = s.byCategory.filling.find((f) => f.value === "rabri");

    expect(rabri?.isAvailable).toBe(false);
    // Withdrawn, not deleted: it still prices, because an order already holding
    // it still has to render.
    expect(s.price.fillingDelta.rabri).toBe(22000);
  });
});
