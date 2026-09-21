import { CAKE_CATEGORIES, type CakeCategoryInfo } from "./cakes";
import { entryFor, type CatalogSnapshot } from "./catalogSnapshot";
import { cakeTitle } from "./docket";
import { PRESETS, type Preset } from "./presets";
import type { CakeConfig } from "./schema";

/**
 * The presets, and how to read an order that was placed from one.
 *
 * ## What this file used to be, and why it is smaller
 *
 * It used to be the storefront's catalogue: `PRODUCTS` was `lib/presets` with a
 * photograph path and some derived categories bolted on, and /shop, the product
 * pages, the homepage and every card read it. That was honest while the builder
 * was the product and a "product" was a `CakeConfig` — its own note said so at
 * length — but it left the bakery unable to change a name, a price or a
 * photograph without a deploy.
 *
 * Sellable cakes are now CakeProduct rows; lib/cakeData reads them and nothing
 * on the storefront comes through here any more. What is left is the two jobs
 * that genuinely still need the old list, and both of them are about the past:
 *
 *   · **Categorising the seed.** `prisma/seedCakes` has to file twenty-one
 *     presets into five families, and the predicates that already knew how are
 *     below. They run once, offline, against a config — after which the
 *     category is a column an owner can change.
 *
 *   · **Reading orders placed before the product table existed.** Seventy-odd
 *     of them, carrying a `CakeConfig` and no product id, whose photograph and
 *     name can only be recovered by asking which preset has this design. See
 *     `productForConfig`.
 *
 * This is exactly the relationship lib/catalogDefaults.ts has with
 * CatalogOption: the seed's input and a reader for history, never a second
 * catalogue. Nothing here is read to decide what is on sale or what it costs.
 */

/* ─────────────────────────────────────────────────────── seed categorisation */

const CHOCOLATE_SPONGES = new Set(["belgian-chocolate", "marble"]);
const CHOCOLATE_FROSTINGS = new Set(["dark-ganache", "milk-ganache", "white-ganache"]);
const CHOCOLATE_FILLINGS = new Set([
  "chocolate-mousse", "nutella", "hazelnut-praline", "cookie-crumb",
]);
const FRUIT_FILLINGS = new Set([
  "strawberry-jam", "raspberry-compote", "cherry-compote", "blueberry-compote",
  "pineapple-crush", "lemon-curd", "fresh-fruit",
]);
const NUT_CARAMEL = new Set([
  "salted-caramel", "biscoff-spread", "pistachio-cream", "hazelnut-praline",
]);

/**
 * Which family a preset belongs to, asked of the cake itself.
 *
 * A shop this size normally sorts by occasion, and nothing in this repository
 * records which cake suits which occasion — assigning them would have been
 * inventing product data and printing it as fact. What the configs *do* record
 * is flavour, so the families are the ones those actually form.
 *
 * Ordered, and the order is the tie-break: a cake can be chocolate *and* nut,
 * and the first match wins. That was invisible when a cake could appear under
 * several chips and matters now that `CakeProduct.category` is one column —
 * so it is stated rather than left to `Array.filter`. Anything unmatched is a
 * classic, which is what "red velvet, vanilla, the cakes nobody has to be sold
 * on" means.
 */
const MATCHERS: { id: CakeCategoryInfo["id"]; match: (c: CakeConfig) => boolean }[] = [
  {
    id: "chocolate",
    match: (c) =>
      CHOCOLATE_SPONGES.has(c.sponge) ||
      CHOCOLATE_FROSTINGS.has(c.frosting) ||
      CHOCOLATE_FILLINGS.has(c.filling),
  },
  { id: "fruit", match: (c) => FRUIT_FILLINGS.has(c.filling) },
  { id: "cheesecake", match: (c) => c.frosting === "cream-cheese" },
  {
    id: "nut_caramel",
    match: (c) =>
      NUT_CARAMEL.has(c.filling) ||
      c.sponge === "pistachio" ||
      c.sponge === "butterscotch",
  },
  { id: "classic", match: (c) => c.sponge === "red-velvet" || c.sponge === "vanilla" },
];

/** The family a preset's own configuration puts it in. Seed-time only. */
export function categoryForConfig(config: CakeConfig): CakeCategoryInfo["id"] {
  return MATCHERS.find((m) => m.match(config))?.id ?? "classic";
}

/** Re-exported so a caller that has one of these does not need two imports. */
export { CAKE_CATEGORIES };

/* ─────────────────────────────────────────────────────────── legacy orders */

export interface LegacyProduct extends Preset {
  /** `public/presets/<slug>.webp`, shot by scripts/shoot-presets. */
  image: string;
}

/** The twenty-one, with their committed photographs. Not a catalogue. */
export const LEGACY_PRODUCTS: LegacyProduct[] = PRESETS.map((p) => ({
  ...p,
  image: `/presets/${p.slug}.webp`,
}));

/**
 * The preset an old order was placed from, or none.
 *
 * Orders written before this phase store a `CakeConfig` and no product id —
 * /api/orders wrote the cake rather than a reference to a row, which is what
 * let a builder cake and a shop cake be the same kind of order. So the way back
 * to the photograph is to ask which preset has this *design*.
 *
 * New orders do not need this: they carry `cakeName` and `cakeImageUrl` frozen
 * on the row, which is both more accurate and immune to a preset being edited.
 * This is the reader for the seventy-odd that came first, and it stays.
 *
 * ## Why the comparison ignores five fields
 *
 * Those five are what the old shop let a customer change on a product: size,
 * egg, the message piped on top, the delivery slot and the pincode. None of
 * them changes what the cake looks like in the photograph — a 2 kg Chocolate
 * Truffle is the same cake as the 1.5 kg one, one tier wider. Everything that
 * *is* the design has to match exactly.
 *
 * The consequence is the useful one in both directions: an order placed from
 * the old shop finds its own product, and a cake somebody built option by
 * option finds one only if they rebuilt that design exactly — in which case the
 * photograph is honestly a picture of it. Anything else falls back to the drawn
 * mark, which is what components/orders/CakeThumb does.
 */
const DESIGN_FIELDS = [
  "shape", "sponge", "filling", "frosting", "coverage", "finish",
  "frostingColor", "hasDrip", "dripColor", "tiers", "layers",
] as const;

export function productForConfig(config: CakeConfig | null): LegacyProduct | undefined {
  if (!config) return undefined;
  return LEGACY_PRODUCTS.find((p) => {
    for (const f of DESIGN_FIELDS) if (p.config[f] !== config[f]) return false;
    /* Toppings are an array of objects, and order matters to nobody but
       JSON.stringify — so they are compared as a sorted, normalised string. */
    return toppingKey(p.config) === toppingKey(config);
  });
}

function toppingKey(c: CakeConfig): string {
  return c.toppings
    .map((t) => `${t.kind}:${t.placement}:${t.density}`)
    .sort()
    .join("|");
}

/**
 * What to call the cake on an order.
 *
 * Three answers, in the order of how much they can be trusted.
 *
 * `frozen` is the name the customer actually bought, copied onto the order when
 * it was placed (`Order.cakeName`). It wins outright, and it is the only one of
 * the three that still says "Chocolate Truffle" after the cake has been renamed
 * or deleted. Every order placed from the shop since this phase has one.
 *
 * A matching preset is the fallback for the orders that came before it — see
 * `productForConfig`.
 *
 * `cakeTitle` names a cake by its parts ("Belgian Chocolate, 1.5 kg"), which is
 * the docket's voice and the right one for a cake somebody built themselves and
 * that has no name to use.
 */
export function cakeDisplayName(
  config: CakeConfig | null,
  catalog: CatalogSnapshot,
  frozen?: string | null,
): string {
  if (frozen) return frozen;
  if (!config) return "Custom cake";
  return productForConfig(config)?.name ?? cakeTitle(config, catalog);
}

/** The chosen size, in the bakery's own words — "1.5 kg", not "1.5kg". */
export function sizeLabel(config: CakeConfig | null, catalog: CatalogSnapshot): string | null {
  if (!config) return null;
  return entryFor(catalog, "size", config.size)?.name ?? config.size;
}
