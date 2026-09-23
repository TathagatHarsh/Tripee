import { z } from "zod";
import { deriveAllergens, type Allergen } from "./allergens";
import type { CakeConfig } from "./schema";

export const ALLERGENS = [
  "Milk",
  "Wheat (gluten)",
  "Egg",
  "Soy",
  "Tree nuts (almond)",
  "Tree nuts (hazelnut)",
  "Tree nuts (pistachio)",
  "Tree nuts (walnut)",
  "Coconut",
  "Peanut",
] as const satisfies readonly Allergen[];

export const ProductionSpec = z.object({
  version: z.literal(1),
  ingredients: z.array(z.string().trim().min(1).max(120)).min(1).max(80),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  dietaryClaims: z.array(z.string().trim().min(1).max(80)).max(20),
  kitchenInstructions: z.string().trim().min(10).max(4_000),
  preparationNotes: z.string().trim().max(2_000).optional(),
  allergenStatementReviewed: z.literal(true),
});

export type ProductionSpec = z.infer<typeof ProductionSpec>;

export function parseProductionSpec(raw: unknown): ProductionSpec | null {
  const parsed = ProductionSpec.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Maintenance helper: a stored record, or a missing record reconstructed from its recipe.
 *
 * Seeded cakes were on sale before `productionSpec` existed. The column is
 * filled by a later seed pass, but a shop that has not been re-seeded still
 * holds valid `CakeConfig` rows. Invalid authored specifications are never replaced. An
 * owner-added cake with neither record stays unsellable.
 */
export function resolveProductionSpec(
  raw: unknown,
  config: CakeConfig | null,
): ProductionSpec | null {
  return parseProductionSpec(raw) ?? (raw == null && config ? productionSpecFromConfig(config) : null);
}

/**
 * Seeded cakes already have a precise CakeConfig. Convert that known recipe to
 * an explicit production record. Stored specs still win when they parse.
 */
export function productionSpecFromConfig(config: CakeConfig): ProductionSpec {
  const report = deriveAllergens(config);
  const ingredients = [
    `${config.sponge} sponge`,
    ...(config.filling === "none" ? [] : [config.filling]),
    config.frosting,
    ...(config.hasDrip ? ["chocolate drip"] : []),
    ...config.toppings.map((t) => t.kind),
  ];

  return {
    version: 1,
    ingredients: [...new Set(ingredients)],
    allergens: report.allergens,
    dietaryClaims: [config.eggless ? "Eggless sponge" : "Contains egg"],
    kitchenInstructions:
      `Prepare the saved ${config.sponge} recipe with ${config.filling} filling and `
      + `${config.frosting} frosting. Follow the frozen cake configuration for finish and toppings.`,
    preparationNotes: report.egglessCaveat ?? undefined,
    allergenStatementReviewed: true,
  };
}

export function allergensForVariant(
  spec: ProductionSpec,
  eggType: "egg" | "eggless",
): Allergen[] {
  const set = new Set<Allergen>(spec.allergens);
  if (eggType === "egg") set.add("Egg");
  return [...set].sort();
}

