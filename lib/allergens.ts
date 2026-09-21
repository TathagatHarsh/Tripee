import type { CakeConfig, Filling, Frosting, Sponge, Topping } from "./schema";

/**
 * Allergens are derived from the config, never typed by hand — a manual field
 * goes stale the moment someone edits a recipe.
 */
export type Allergen =
  | "Milk"
  | "Wheat (gluten)"
  | "Egg"
  | "Soy"
  | "Tree nuts (almond)"
  | "Tree nuts (hazelnut)"
  | "Tree nuts (pistachio)"
  | "Tree nuts (walnut)"
  | "Coconut"
  | "Peanut";

interface Source {
  always: Allergen[];
  /** Present unless the eggless recipe is chosen. */
  eggUnlessEggless?: boolean;
  /** Inherently contains egg — no eggless version of this component exists. */
  eggAlways?: boolean;
}

const SPONGE_ALLERGENS: Record<Sponge, Source> = {
  vanilla: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  "belgian-chocolate": { always: ["Wheat (gluten)", "Milk", "Soy"], eggUnlessEggless: true },
  "red-velvet": { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  butterscotch: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  coffee: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  lemon: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  pineapple: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  mango: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  saffron: { always: ["Wheat (gluten)", "Milk"], eggUnlessEggless: true },
  carrot: { always: ["Wheat (gluten)", "Milk", "Tree nuts (walnut)"], eggUnlessEggless: true },
  pistachio: { always: ["Wheat (gluten)", "Milk", "Tree nuts (pistachio)"], eggUnlessEggless: true },
  coconut: { always: ["Wheat (gluten)", "Milk", "Coconut"], eggUnlessEggless: true },
  marble: { always: ["Wheat (gluten)", "Milk", "Soy"], eggUnlessEggless: true },
  funfetti: { always: ["Wheat (gluten)", "Milk", "Soy"], eggUnlessEggless: true },
};

const FILLING_ALLERGENS: Record<Filling, Source> = {
  none: { always: [] },
  "strawberry-jam": { always: [] },
  "raspberry-compote": { always: [] },
  "cherry-compote": { always: [] },
  "blueberry-compote": { always: [] },
  "pineapple-crush": { always: [] },
  "lemon-curd": { always: ["Milk"], eggUnlessEggless: true },
  "vanilla-custard": { always: ["Milk"], eggUnlessEggless: true },
  // Reduced milk and nothing else. The pistachio a rabri is usually finished with
  // is a topping, and declaring it here would put tree nuts on a cake that never
  // had any.
  rabri: { always: ["Milk"] },
  "chocolate-mousse": { always: ["Milk", "Soy"] },
  "salted-caramel": { always: ["Milk"] },
  // Lotus biscuits are wheat, soy and vegetable fat — no dairy, which surprises
  // people. Declared as it is rather than as it is assumed to be.
  "biscoff-spread": { always: ["Wheat (gluten)", "Soy"] },
  nutella: { always: ["Milk", "Soy", "Tree nuts (hazelnut)"] },
  "hazelnut-praline": { always: ["Milk", "Tree nuts (hazelnut)"] },
  "pistachio-cream": { always: ["Milk", "Tree nuts (pistachio)"], eggUnlessEggless: true },
  "cookie-crumb": { always: ["Wheat (gluten)", "Soy"] },
  "fresh-fruit": { always: [] },
};

const FROSTING_ALLERGENS: Record<Frosting, Source> = {
  "whipped-cream": { always: ["Milk"] },
  "american-buttercream": { always: ["Milk"] },
  "swiss-meringue": { always: ["Milk"], eggUnlessEggless: true },
  "cream-cheese": { always: ["Milk"] },
  "dark-ganache": { always: ["Milk", "Soy"] },
  "milk-ganache": { always: ["Milk", "Soy"] },
  "white-ganache": { always: ["Milk", "Soy"] },
  fondant: { always: [] },
  "mirror-glaze": { always: ["Milk"] },
};

const TOPPING_ALLERGENS: Record<Topping, Source> = {
  strawberry: { always: [] },
  "mixed-berry": { always: [] },
  blueberry: { always: [] },
  cherry: { always: [] },
  "pineapple-chunk": { always: [] },
  "chocolate-shard": { always: ["Milk", "Soy"] },
  "chocolate-curl": { always: ["Milk", "Soy"] },
  "white-chocolate-curl": { always: ["Milk", "Soy"] },
  truffle: { always: ["Milk", "Soy"] },
  "caramel-shard": { always: ["Milk"] },
  "butterscotch-crunch": { always: ["Milk"] },
  "biscoff-biscuit": { always: ["Wheat (gluten)", "Soy"] },
  "biscoff-crumb": { always: ["Wheat (gluten)", "Soy"] },
  macaron: { always: ["Tree nuts (almond)"], eggAlways: true },
  "meringue-kiss": { always: [], eggAlways: true },
  "rasmalai-disc": { always: ["Milk"] },
  "gold-leaf": { always: [] },
  sprinkles: { always: ["Soy"] },
  "pistachio-crumb": { always: ["Tree nuts (pistachio)"] },
  "pistachio-nut": { always: ["Tree nuts (pistachio)"] },
  "almond-sliver": { always: ["Tree nuts (almond)"] },
  "edible-flower": { always: [] },
  oreo: { always: ["Wheat (gluten)", "Soy"] },
  ferrero: { always: ["Milk", "Soy", "Wheat (gluten)", "Tree nuts (hazelnut)"] },
};

export interface AllergenReport {
  allergens: Allergen[];
  eggless: boolean;
  /** Set when the customer asked for eggless but a topping inherently has egg. */
  egglessCaveat: string | null;
}

export function deriveAllergens(c: CakeConfig): AllergenReport {
  const set = new Set<Allergen>();
  let inherentEgg = false;
  let recipeEgg = false;

  const sources: Source[] = [
    SPONGE_ALLERGENS[c.sponge],
    FILLING_ALLERGENS[c.filling],
    FROSTING_ALLERGENS[c.frosting],
    ...c.toppings.map(t => TOPPING_ALLERGENS[t.kind]),
  ];

  // The drip is chocolate.
  if (c.hasDrip) { set.add("Milk"); set.add("Soy"); }

  for (const s of sources) {
    for (const a of s.always) set.add(a);
    if (s.eggAlways) inherentEgg = true;
    if (s.eggUnlessEggless && !c.eggless) recipeEgg = true;
  }

  if (inherentEgg || recipeEgg) set.add("Egg");

  const egglessCaveat =
    c.eggless && inherentEgg
      ? "The cake itself is eggless, but the meringue-based toppings you picked contain egg white."
      : null;

  return {
    allergens: [...set].sort(),
    eggless: c.eggless,
    egglessCaveat,
  };
}

export function allergenLine(c: CakeConfig): string {
  const { allergens, eggless } = deriveAllergens(c);
  const diet = eggless ? "EGGLESS" : "CONTAINS EGG";
  if (allergens.length === 0) return diet;
  return `${diet} · CONTAINS: ${allergens.join(", ")}`;
}

/**
 * The allergen line for a cake the shopper has not chosen a version of yet.
 *
 * ## Why `allergenLine` alone stopped being enough
 *
 * It reads `config.eggless`, and a shop cake's stored recipe is now only one of
 * the ways that cake can be baked. A cake sold both with egg and without has a
 * `config` that says eggless, so the product page printed "EGGLESS" over a
 * picker offering "With egg" — a contradiction on the one line of the page that
 * exists for people who have to be careful about what they eat.
 *
 * The docket, the order and the kitchen are unaffected and always were: those
 * read the config the order froze, which carries the variant the customer
 * actually bought. This is only about the page that shows a cake before anyone
 * has decided.
 *
 * ## What it says, and why it errs the way it does
 *
 * One offered sponge is the old behaviour exactly. Two is the new case, and it
 * lists the union of both versions' allergens with egg called out as
 * conditional rather than dropped — an allergen statement that omits something
 * present in half the cakes sold under that name is the one failure mode worth
 * designing against, and "Egg only in the with-egg version" is both safe and
 * true.
 */
export function allergenLineForOffer(
  c: CakeConfig,
  /** Which sponges the bakery actually sells this cake as. */
  eggTypes: readonly ("egg" | "eggless")[],
): string {
  const hasEgg = eggTypes.includes("egg");
  const hasEggless = eggTypes.includes("eggless");

  /* One sponge, or none configured at all — the old line, against the version
     that is genuinely on sale rather than against whatever the recipe says. */
  if (!hasEgg || !hasEggless) {
    return allergenLine({ ...c, eggless: !hasEgg });
  }

  /* Both. The union, which is the with-egg version's list — `eggUnlessEggless`
     only ever adds "Egg" — with the conditional said out loud. */
  const { allergens } = deriveAllergens({ ...c, eggless: false });
  const rest = allergens.filter((a) => a !== "Egg");
  const contains = rest.length > 0 ? `CONTAINS: ${rest.join(", ")} · ` : "";
  return `${contains}Egg only in the with-egg version.`;
}
