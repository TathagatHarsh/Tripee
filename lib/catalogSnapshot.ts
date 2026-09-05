import type { CatalogCategory } from "@prisma/client";
import {
  Coverage, DeliverySlot as DeliverySlotEnum, Filling as FillingEnum,
  Finish as FinishEnum, Frosting as FrostingEnum, Shape, SizeBand as SizeBandEnum,
  Sponge as SpongeEnum, Topping as ToppingEnum, ToppingPlacement,
} from "./schema";
import type {
  DeliverySlot, Filling, Finish, Frosting, SizeBand, Sponge, Topping,
} from "./schema";

/**
 * The catalogue as the application reads it, however it was loaded.
 *
 * One shape for two sources — the database in production, lib/catalogDefaults
 * when there is no database — so nothing downstream has to know which it got.
 * The pricing engine, the pickers and the admin table all consume this.
 *
 * The CatalogCategory import is type-only, so this file stays usable in the
 * browser bundle: the enum is erased at compile time exactly as OrderStatus is
 * in lib/orders.ts.
 */

/** One option row, minus the database's own bookkeeping (id, timestamps). */
export interface CatalogEntry {
  value: string;
  name: string;
  blurb: string;
  /** Placements only — the pill-sized name. */
  shortName?: string;
  swatch?: string;
  glyph?: string;
  /** Paise. A base price for a size, a delta for everything else. */
  priceInputPaise: number;
  /** Sizes only — how much this size scales every other option's delta. */
  multiplier?: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface CatalogRow extends CatalogEntry {
  category: CatalogCategory;
}

/**
 * Price lookups keyed by option value.
 *
 * Built once when a snapshot is made rather than derived per call, because
 * priceCake runs on every tap of the builder — buildDocket is called from
 * BuilderShell, which wraps all nine steps — and a `.find()` per option per
 * keystroke is work for nothing when the answer cannot change between renders.
 */
export interface PriceTables {
  baseBySize: Record<SizeBand, number>;
  multiplierBySize: Record<SizeBand, number>;
  spongeDelta: Record<Sponge, number>;
  fillingDelta: Record<Filling, number>;
  frostingDelta: Record<Frosting, number>;
  finishLabour: Record<Finish, number>;
  toppingUnit: Record<Topping, number>;
  deliveryFee: Record<DeliverySlot, number>;
}

/** The charges that are formulas rather than options. */
export interface PricingSettingsSnapshot {
  tierSurchargePaise: number;
  layerSurchargePaise: number;
  messagePipingPaise: number;
  dripPaise: number;
  sugarFreePaise: number;
  /** A fraction, not basis points: the engine's own output reports 0.18. */
  gstRate: number;
}

export interface CatalogSnapshot {
  /** Ordered by sortOrder. What a picker renders, unavailable rows included. */
  byCategory: Record<CatalogCategory, CatalogEntry[]>;
  price: PriceTables;
  settings: PricingSettingsSnapshot;
}

export const CATEGORIES: CatalogCategory[] = [
  "shape", "size", "sponge", "filling", "frosting",
  "coverage", "finish", "topping", "placement", "delivery",
];

/**
 * What each category is allowed to name.
 *
 * The database will accept any string in `value`, and a row naming an option
 * the code cannot render is a broken picker — a shape with no geometry, a
 * topping with no mesh or allergen entry. Postgres cannot check that, so the
 * admin write path does, against the same Zod enums the rest of the product
 * validates against. This is also the list the admin UI shows: the bakery
 * chooses what an option costs, not which options can exist.
 */
export const VALUES_BY_CATEGORY: Record<CatalogCategory, readonly string[]> = {
  shape: Shape.options,
  size: SizeBandEnum.options,
  sponge: SpongeEnum.options,
  filling: FillingEnum.options,
  frosting: FrostingEnum.options,
  coverage: Coverage.options,
  finish: FinishEnum.options,
  topping: ToppingEnum.options,
  placement: ToppingPlacement.options,
  delivery: DeliverySlotEnum.options,
};

function priceIndex<K extends string>(entries: CatalogEntry[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const e of entries) out[e.value as K] = e.priceInputPaise;
  return out;
}

/**
 * Assemble a snapshot from rows.
 *
 * Pure, and deliberately knows nothing about defaults — lib/catalogDefaults is
 * what layers database rows over the shipped values, and it imports this. The
 * dependency runs one way so the two cannot form a cycle.
 */
export function buildSnapshot(
  rows: CatalogRow[],
  settings: PricingSettingsSnapshot,
): CatalogSnapshot {
  const byCategory = {} as Record<CatalogCategory, CatalogEntry[]>;
  for (const c of CATEGORIES) byCategory[c] = [];
  for (const r of rows) byCategory[r.category]?.push(r);
  for (const c of CATEGORIES) byCategory[c].sort((a, b) => a.sortOrder - b.sortOrder);

  const sizes = byCategory.size;
  const multiplierBySize = {} as Record<SizeBand, number>;
  // A size carrying no multiplier scales nothing, rather than scaling to zero.
  for (const s of sizes) multiplierBySize[s.value as SizeBand] = s.multiplier ?? 1;

  return {
    byCategory,
    price: {
      baseBySize: priceIndex<SizeBand>(sizes),
      multiplierBySize,
      spongeDelta: priceIndex<Sponge>(byCategory.sponge),
      fillingDelta: priceIndex<Filling>(byCategory.filling),
      frostingDelta: priceIndex<Frosting>(byCategory.frosting),
      finishLabour: priceIndex<Finish>(byCategory.finish),
      toppingUnit: priceIndex<Topping>(byCategory.topping),
      deliveryFee: priceIndex<DeliverySlot>(byCategory.delivery),
    },
    settings,
  };
}

/** Available options only — what a customer may pick from now. */
export function offered(
  snapshot: CatalogSnapshot,
  category: CatalogCategory,
): CatalogEntry[] {
  return snapshot.byCategory[category].filter((e) => e.isAvailable);
}

/**
 * What a picker shows: everything on offer, plus whatever is already chosen.
 *
 * The second half matters. Withdrawing a filling has to stop new customers
 * choosing it without reaching into designs that already name it — and somebody
 * halfway through building a cake, or opening a link a friend sent, is holding
 * exactly such a design. Dropping it from the grid would show them a step with
 * nothing selected and silently misrepresent their own cake back to them. It
 * stays visible, stays selected, and stays priced; it simply is not something
 * anyone else can newly pick.
 *
 * The cast is safe by construction: values are checked against lib/schema's
 * enums when the admin writes them, and snapshotFrom backfills anything the
 * table is missing, so every value here is a real member of T.
 */
export function offeredOrSelected<T extends string>(
  snapshot: CatalogSnapshot,
  category: CatalogCategory,
  current: T,
): (CatalogEntry & { value: T })[] {
  return snapshot.byCategory[category].filter(
    (e) => e.isAvailable || e.value === current,
  ) as (CatalogEntry & { value: T })[];
}

/**
 * One option by value, available or not.
 *
 * A saved design naming a withdrawn filling still has to render its own docket,
 * so lookups are deliberately not filtered — `offered` is for pickers, this is
 * for reading back what somebody already chose.
 */
export function entryFor(
  snapshot: CatalogSnapshot,
  category: CatalogCategory,
  value: string,
): CatalogEntry | undefined {
  return snapshot.byCategory[category].find((e) => e.value === value);
}
