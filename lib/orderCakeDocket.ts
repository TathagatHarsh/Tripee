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
  if (spec.dietaryClaims.length) lines.push(`Dietary claims: ${spec.dietaryClaims.join(", ")}`);

  if (config) {
    lines.push("", "VISUAL CONFIGURATION", renderSpecSheet({ ...config, message: message || undefined }, catalog, { omitPrice: true }));
  }
  return lines.join("\n");
}
