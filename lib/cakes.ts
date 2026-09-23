import { z } from "zod";
import type { CakeCategory, EggType } from "@prisma/client";
import { SIZES } from "./catalog";
import { WEIGHT_KG } from "./servings";
import { type CakeConfig, type DeliverySlot, type SizeBand } from "./schema";
import type { ProductionSpec } from "./productionSpec";

/**
 * What a cake the shop sells *is*, away from the database.
 *
 * Pure and isomorphic, deliberately: no `lib/db`, no `next/cache`, no
 * `server-only`. The storefront's cards, the basket and the admin's form all
 * need the type and the category names, and half of those are client
 * components — the same split lib/catalogSnapshot.ts and lib/catalogData.ts
 * already make, and for the same reason. Everything that touches Postgres is in
 * lib/cakeData.ts next door.
 *
 * ## Why there is a product table at all
 *
 * prisma/schema.prisma's note on CakeProduct gives the long version. The short
 * one: with the 3D builder switched off (lib/flags), the shop is the product,
 * and the twenty-one cakes it sold were `lib/presets.ts` — hardcoded configs,
 * priced by running the builder's option arithmetic over them, photographed by
 * a script. A bakery could not change a name, a price or a photograph without a
 * developer. This is the replacement; lib/presets is now its seed input.
 */

/* ────────────────────────────────────────────────────────────── categories */

export interface CakeCategoryInfo {
  /** The Prisma enum member. `nut_caramel`, because Postgres dislikes hyphens. */
  id: CakeCategory;
  /** What the URL says: /shop?category=nut-caramel. */
  slug: string;
  name: string;
  /** One line for the category card and the collection header. */
  blurb: string;
}

/**
 * The five flavour families, and the only place their words are written.
 *
 * These are the same five lib/shop derived from every preset's configuration,
 * with the same names and blurbs — a customer who bookmarked
 * `/shop?category=nut-caramel` before this phase lands on the same shelf after
 * it. What changed is that a cake's membership is now a column an owner sets
 * rather than a predicate run against its frosting, which is the point: a
 * bakery can file a cake where it belongs commercially, and a cake with no
 * config at all (one added from /admin/cakes) can still have a category.
 */
export const CAKE_CATEGORIES: CakeCategoryInfo[] = [
  {
    id: "chocolate",
    slug: "chocolate",
    name: "Chocolate Cakes",
    blurb: "Belgian sponge, ganache, mousse between every layer.",
  },
  {
    id: "fruit",
    slug: "fruit",
    name: "Fruit & Berry",
    blurb: "Compotes and crushed fruit, folded in rather than piled on.",
  },
  {
    id: "cheesecake",
    slug: "cheesecake",
    name: "Cheesecake & Cream",
    blurb: "Cream cheese frosting, set soft and scraped smooth.",
  },
  {
    id: "nut_caramel",
    slug: "nut-caramel",
    name: "Nut & Caramel",
    blurb: "Pistachio, Biscoff, butterscotch, salted caramel.",
  },
  {
    id: "classic",
    slug: "classic",
    name: "Classics",
    blurb: "Red velvet, vanilla, the cakes nobody has to be sold on.",
  },
];

/**
 * The eggless chip, which is not a category and is kept anyway.
 *
 * It has now started doing something. It used to filter on
 * `CakeProduct.isEggless` — a column that was true of every row, under a blurb
 * that admitted as much. A cake is sold as egg, as eggless, or as both, so the
 * chip means "cakes I can have without egg" and is answered by asking whether
 * any eggless variant of a cake is on sale. See `hasEggless`.
 */
export const EGGLESS_SLUG = "eggless";

export const EGGLESS_CATEGORY = {
  slug: EGGLESS_SLUG,
  name: "Eggless",
  blurb: "Everything here can be baked without egg.",
} as const;

export function categoryBySlug(slug: string): CakeCategoryInfo | undefined {
  return CAKE_CATEGORIES.find((c) => c.slug === slug);
}

export function categoryById(id: CakeCategory): CakeCategoryInfo {
  /* Non-null by construction: the list above covers every member of the enum,
     and a sixth member added to the schema fails the test in tests/cakes. */
  return CAKE_CATEGORIES.find((c) => c.id === id)!;
}

/* ───────────────────────────────────────────────────────────── the product */

/**
 * One cake, as every screen outside the admin's form reads it.
 *
 * A plain object rather than the Prisma row, for two reasons that both bite.
 * It is written into Next's Data Cache, which serialises — so `Date` objects
 * are out, and the timestamp the admin table wants is milliseconds. And it
 * crosses into client components, where the Prisma types have no business.
 */
export interface CakeProductView {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: CakeCategory;
  /**
   * Every version of this cake, available or not, cheapest first.
   *
   * Withdrawn ones are carried rather than filtered, because the two readers
   * want different halves: the admin's grid has to show a 2 kg the owner has
   * taken off sale, and the storefront has to *disable* it rather than pretend
   * it never existed. `sellable` below is the storefront's filter and is the
   * only thing any customer-facing screen should be reading.
   *
   * There is deliberately no `pricePaise`, `sizeBand` or `isEggless` on this
   * interface any more. Those columns still exist on the row as a derived
   * summary — see prisma/schema.prisma — and leaving them off the view is what
   * makes "the variant is the price" a compile error to violate rather than a
   * convention to remember.
   */
  variants: CakeVariantView[];
  /** The photograph on the card. Null draws a cake mark instead. */
  imageUrl: string | null;
  imageAlt: string | null;
  /** The extra photographs, in display order. Empty for most cakes. */
  gallery: CakeImageView[];
  /** The recipe, when this cake has one. Null for an owner-added cake. */
  config: CakeConfig | null;
  productionSpec: ProductionSpec | null;
  /** Admin-only diagnostics, excluded from public catalogue responses. */
  productionIssues?: string[];
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  /** Epoch milliseconds — see the note above on serialisation. */
  updatedAt: number;
}

/** One buyable version of a cake. A `CakeVariant` row, serialisable. */
export interface CakeVariantView {
  id: string;
  sizeBand: SizeBand;
  eggType: EggType;
  /** Paise, before GST and delivery. See lib/pricing's `priceProduct`. */
  pricePaise: number;
  isAvailable: boolean;
}

export interface CakeImageView {
  id: string;
  url: string;
  alt: string | null;
}

/* ───────────────────────────────────────────────────────────── the variants */

/** Both, in the order they are offered. Egg first, because it is the default sponge. */
export const EGG_TYPES: readonly EggType[] = ["egg", "eggless"] as const;

/** What a customer is shown. Never "EGG"/"EGGLESS" from the enum. */
export const EGG_LABEL: Record<EggType, string> = {
  egg: "With egg",
  eggless: "Eggless",
};

/**
 * The versions of this cake somebody can actually buy, cheapest first.
 *
 * A withdrawn *cake* has none, which matters: `listCakes` already filters those
 * out of the storefront, but the basket and the admin both hold cakes that came
 * from elsewhere, and a variant of a cake that is off the shelf is not for sale
 * however available its own flag says it is.
 */
export function sellable(product: CakeProductView): CakeVariantView[] {
  if (!product.isAvailable) return [];
  return product.variants.filter((v) => v.isAvailable);
}

/** Whether there is anything to sell. A cake with no priced variant is not. */
export function isBuyable(product: CakeProductView): boolean {
  return sellable(product).length > 0;
}

/**
 * The cheapest thing this cake can be bought for, in paise, or null.
 *
 * The "From ₹1,499" on a card. Pre-GST and pre-delivery like every other price
 * in this application — the card runs it through `priceProduct` before printing
 * it, exactly as it did when there was one price per cake.
 */
export function fromPricePaise(product: CakeProductView): number | null {
  const options = sellable(product);
  if (options.length === 0) return null;
  return Math.min(...options.map((v) => v.pricePaise));
}

/** The variant a "From ₹X" refers to: the cheapest one on sale. */
export function cheapestVariant(product: CakeProductView): CakeVariantView | undefined {
  return sellable(product)[0];
}

export function variantById(
  product: CakeProductView,
  id: string,
): CakeVariantView | undefined {
  return product.variants.find((v) => v.id === id);
}

/** The sizes this cake is sold in, smallest first, with no duplicates. */
export function sizesOffered(product: CakeProductView): SizeBand[] {
  const seen = new Set<SizeBand>();
  for (const v of sellable(product)) seen.add(v.sizeBand);
  return [...seen].sort(byWeight);
}

/**
 * The sponge types this cake is sold in — within one size, when one is chosen.
 *
 * Scoped, because "does this cake come eggless" and "does the 2 kg come
 * eggless" are different questions and the second is the one a customer who has
 * picked a size is asking. §6: when only one is supported, only one is shown.
 */
export function eggTypesOffered(
  product: CakeProductView,
  size?: SizeBand,
): EggType[] {
  const within = sellable(product).filter((v) => size === undefined || v.sizeBand === size);
  return EGG_TYPES.filter((e) => within.some((v) => v.eggType === e));
}

/** Whether this cake can be had without egg at all. The shop's eggless chip. */
export function hasEggless(product: CakeProductView): boolean {
  return sellable(product).some((v) => v.eggType === "eggless");
}

/** Whether both sponges are offered — the card's "Egg & eggless available". */
export function hasBothEggTypes(product: CakeProductView): boolean {
  return eggTypesOffered(product).length === 2;
}

/** The exact variant for a pair, if it is on sale. */
export function findVariant(
  product: CakeProductView,
  size: SizeBand,
  eggType: EggType,
): CakeVariantView | undefined {
  return sellable(product).find((v) => v.sizeBand === size && v.eggType === eggType);
}

/**
 * Weight order, not alphabetical and not the enum's.
 *
 * "0.5kg" < "1kg" < "1.5kg" is false as strings — "1.5kg" sorts before "1kg"
 * and both sort before "0.5kg" only by accident. lib/servings already knows what
 * each band weighs, so the comparison asks it.
 */
function byWeight(a: SizeBand, b: SizeBand): number {
  return WEIGHT_KG[a] - WEIGHT_KG[b];
}

/** Cheapest first, then by weight, then egg before eggless. A stable display order. */
export function sortVariants(variants: readonly CakeVariantView[]): CakeVariantView[] {
  return [...variants].sort(
    (a, b) =>
      byWeight(a.sizeBand, b.sizeBand) ||
      EGG_TYPES.indexOf(a.eggType) - EGG_TYPES.indexOf(b.eggType),
  );
}

/** "1.5 kg · Eggless" — one line naming a variant, used wherever one is listed. */
export function variantLabel(v: Pick<CakeVariantView, "sizeBand" | "eggType">): string {
  return `${sizeName(v.sizeBand)} · ${EGG_LABEL[v.eggType]}`;
}

/* ──────────────────────────────────────────────────────────────── the size */

/**
 * "1.5 kg", and "8in", from the one list that has them.
 *
 * lib/catalog's SIZES has carried both since long before this table, so the
 * product stores the band and the words are looked up. A `weightLabel` column
 * was in the first draft of the schema and came out again: two fields for one
 * fact is two fields that disagree by Thursday.
 */
export function sizeName(band: SizeBand): string {
  return SIZES.find((s) => s.value === band)?.name ?? band;
}

/** "8in", the diameter half of the size's blurb. */
export function sizeDiameter(band: SizeBand): string {
  return SIZES.find((s) => s.value === band)?.blurb.split(" · ")[0] ?? "";
}

/* ─────────────────────────────────────────────────────────── the customer */

/**
 * Everything a shopper decides about a cake that is already on the shelf.
 *
 * Three fields, and the list is short on purpose. The storefront used to offer
 * the size and the sponge as well, because a shop "product" was a `CakeConfig`
 * and those were two of its fields — which meant a cake's price moved with a
 * control the bakery had never priced. Size is now a property of the product
 * (two sizes are two cakes, as every cake shop's own site lists them) and the
 * sponge is the recipe. What is left is genuinely the customer's: what to pipe
 * on it, when they want it, and where it is going.
 */
export const CakeChoices = z.object({
  /** Piped on the cake. Charged as labour — see PricingSettings. */
  message: z.string().trim().max(60).optional(),
  delivery: z.enum(["standard", "same-day", "express-4hr", "midnight", "pickup"]),
  pincode: z.string().regex(/^\d{6}$/).optional(),
});

export type CakeChoices = z.infer<typeof CakeChoices>;

export const DEFAULT_CHOICES: CakeChoices = { delivery: "standard" };

/**
 * The cake as the kitchen has to bake it.
 *
 * ## Why an order still carries a CakeConfig
 *
 * Because everything downstream of an order already speaks one: the docket, the
 * kitchen board, `deriveAllergens`, `deriveServings`, `deriveHandling` and
 * `Order.config` itself, which is NOT NULL and has been since the first
 * migration. Writing shop orders in some second shape would have meant a second
 * docket, a second allergen derivation and a board that could render two kinds
 * of row — for no gain, since the config is *derived* here and never typed by
 * anybody.
 *
 * ## This is also where the variant becomes a fact about the order
 *
 * The chosen variant's `sizeBand` and `eggType` are written onto the config,
 * which is what freezes them: `Order.config` is a snapshot, so the docket the
 * kitchen bakes from says 1.5 kg and eggless because that is what was bought,
 * and repricing or deleting that variant tomorrow cannot reach it. No new
 * column on Order was needed for any of this, and no historical order changed
 * shape — an order placed before variants existed carries exactly the same
 * fields, filled in from the product instead.
 *
 * ## The two cases
 *
 * A seeded cake has its real recipe in `config` — the exact object lib/presets
 * held — so a Chocolate Truffle ordered from the shop hands the kitchen the
 * same docket it always did: Belgian chocolate sponge, chocolate mousse, dark
 * ganache, the lot.
 *
 * A product without a visual CakeConfig returns null. Its explicit production
 * specification remains the kitchen authority; no vanilla recipe is invented.
 *
 * The choices are layered on last, and only where they are real: an empty
 * message is dropped rather than written as `""`, which would print a blank
 * plaque on the docket.
 */
export function configForVariant(
  product: Pick<CakeProductView, "config">,
  variant: Pick<CakeVariantView, "sizeBand" | "eggType">,
  choices: CakeChoices,
): CakeConfig | null {
  const eggless = variant.eggType === "eggless";
  if (!product.config) return null;

  const base: CakeConfig = product.config;

  const message = choices.message?.trim();

  const out: CakeConfig = {
    ...base,
    /* The variant's size and sponge win over whatever the stored config says,
       so that a customer picking 2 kg gets a 2 kg cake baked rather than the
       1.5 kg the seeded recipe happened to be rendered at. */
    size: variant.sizeBand,
    eggless,
    delivery: choices.delivery as DeliverySlot,
  };

  /* Deleted rather than set to undefined: `JSON.stringify` drops an undefined
     value but `Object.keys` does not, and lib/cart's `lineId` canonicalises
     over the keys. Two identical cakes must produce one line. */
  delete out.message;
  delete out.pincode;
  if (message) out.message = message;
  if (choices.pincode) out.pincode = choices.pincode;

  return out;
}

/* ────────────────────────────────────────────────────────────────── slugs */

/**
 * A URL-safe name for a cake the admin has just typed.
 *
 * Offered as a default in the form and editable there, because a slug is an
 * address: "Chocolate Truffle" should land on /cakes/chocolate-truffle, and an
 * owner who later renames the cake should not silently break every link to it.
 * Empty in, empty out — the form refuses that rather than inventing "cake-1".
 */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Whether a slug is one this application will route to. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
