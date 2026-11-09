import type { CatalogSnapshot } from "./catalogSnapshot";
import { renderSpecSheet } from "./docket";
import { parseProductionSpec } from "./productionSpec";
import { migrateConfig } from "./schema";

export interface OrderCakeDocketInput {
  cakeName: string | null;
  variantLabel: string | null;
  message?: string | null;
  config: unknown;
  productionSpec: unknown;
  allergens: string[];
}

/** Kitchen instructions come from the frozen order, never a current product recipe. */
export function renderOrderCakeDocket(
  cake: OrderCakeDocketInput,
  catalog: CatalogSnapshot,
): string {
  const config = migrateConfig(cake.config);
  const message = (cake.message ?? config?.message)?.trim();
  const spec = parseProductionSpec(cake.productionSpec);
  const lines = [
    `Cake: ${cake.cakeName ?? "Custom cake"}`,
    `Variant: ${cake.variantLabel ?? "See visual configuration"}`,
    `Message: ${message ? JSON.stringify(message) : "None"}`,
    `Frozen allergens: ${cake.allergens.length ? cake.allergens.join(", ") : "No declared allergens"}`,
    "",
  ];

  if (!spec) {
    lines.push("ERROR: Frozen production specification is missing or invalid. Do not bake until the bakery verifies it.");
    return lines.join("\n");
  }

  lines.push(
    "FROZEN PRODUCTION SPECIFICATION",
    "Ingredients:",
    ...spec.ingredients.map((ingredient) => `- ${ingredient}`),
    "Kitchen instructions:",
    spec.kitchenInstructions,
  );
  if (spec.preparationNotes) lines.push("Preparation notes:", spec.preparationNotes);
  const claims = dietaryClaimsFor(spec.dietaryClaims, config ? config.eggless : !cake.allergens.includes("Egg"));
  if (claims.length) lines.push(`Dietary claims: ${claims.join(", ")}`);

  if (config) {
    lines.push("", "VISUAL CONFIGURATION", renderSpecSheet({ ...config, message: message || undefined }, catalog, { omitPrice: true }));
  }
  return lines.join("\n");
}

/**
 * The spec is the product's recipe record, frozen as-is, so a cake sold both
 * ways carries the recipe's egg claim whichever version was bought. The frozen
 * config (or, without one, the frozen allergens) is the variant actually sold:
 * swap a contradicting egg claim for the true one.
 */
function dietaryClaimsFor(claims: string[], eggless: boolean): string[] {
  const contradicts = eggless ? /contains egg|with egg/i : /eggless|egg[- ]free|no egg/i;
  const kept = claims.filter((c) => !contradicts.test(c));
  return kept.length === claims.length ? claims : [...kept, eggless ? "Eggless" : "Contains egg"];
}
