import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT } from "@/lib/catalogDefaults";
import { renderOrderCakeDocket, type OrderCakeDocketInput } from "@/lib/orderCakeDocket";
import { DEFAULT_CAKE } from "@/lib/schema";

const cake: OrderCakeDocketInput = {
  cakeName: "Frozen chocolate cake",
  variantLabel: "2 kg · Eggless",
  message: "Happy birthday Amma",
  config: null,
  allergens: ["Milk", "Peanut"],
  productionSpec: {
    version: 1,
    ingredients: ["Frozen cocoa recipe", "Roasted peanuts"],
    allergens: ["Milk", "Peanut"],
    dietaryClaims: ["Eggless"],
    kitchenInstructions: "Bake the frozen cocoa recipe and finish with peanuts.",
    preparationNotes: "Keep chilled until collection.",
    allergenStatementReviewed: true,
  },
};

describe("the frozen cake docket", () => {
  it("prints an authored cake without a visual config, including its message and production record", () => {
    const text = renderOrderCakeDocket(cake, DEFAULT_SNAPSHOT);
    for (const expected of [cake.cakeName!, cake.variantLabel!, cake.message!, "Frozen cocoa recipe", "Roasted peanuts", "Bake the frozen cocoa recipe", "Keep chilled until collection.", "Frozen allergens: Milk, Peanut", "Dietary claims: Eggless"])
      expect(text).toContain(expected);
    expect(text).not.toContain("VISUAL CONFIGURATION");
  });

  it("uses the structured message in both sections and suppresses recalculated prices", () => {
    const text = renderOrderCakeDocket({ ...cake, config: { ...DEFAULT_CAKE, message: "Stale visual message" } }, DEFAULT_SNAPSHOT);
    expect(text).toContain("VISUAL CONFIGURATION");
    expect(text).toContain("Shape");
    expect(text).not.toContain("Stale visual message");
    expect(text).not.toContain("PRICE\n");
    expect(text).not.toContain("TOTAL");
    expect(text.match(/Happy birthday Amma/g)).toHaveLength(2);
  });

  it("falls back to a legacy config message when the structured message is absent", () => {
    const text = renderOrderCakeDocket({ ...cake, message: null, config: { ...DEFAULT_CAKE, message: "Legacy greeting" } }, DEFAULT_SNAPSHOT);
    expect(text.match(/Legacy greeting/g)).toHaveLength(2);
  });

  it("refuses missing or invalid frozen production records even when a visual recipe is valid", () => {
    for (const productionSpec of [null, {}, { ...cake.productionSpec as object, allergenStatementReviewed: false }]) {
      const text = renderOrderCakeDocket({ ...cake, config: DEFAULT_CAKE, productionSpec }, DEFAULT_SNAPSHOT);
      expect(text).toContain("ERROR: Frozen production specification is missing or invalid.");
      expect(text).toContain("Do not bake");
      expect(text).not.toContain("VISUAL CONFIGURATION");
      expect(text).not.toContain("vanilla");
    }
  });
});
