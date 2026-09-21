import type { CatalogCategory } from "@prisma/client";
import {
  COVERAGES, DELIVERY_OPTIONS, FILLINGS, FINISHES, FROSTINGS, PLACEMENTS,
  SHAPES, SIZES, SPONGES, TOPPINGS, type Option,
} from "./catalog";
import {
  buildSnapshot, type BakeryInfo, type CatalogRow, type CatalogSnapshot,
  type DeliveryZoneInfo, type PricingSettingsSnapshot,
} from "./catalogSnapshot";
import type {
  DeliverySlot, Filling, Finish, Frosting, SizeBand, Sponge, Topping,
} from "./schema";

/**
 * The catalogue as it shipped: every price and every line of copy this product
 * charged and displayed before the bakery could edit any of it.
 *
 * Two jobs, and only two:
 *
 *   1. The seed's input. prisma/seed.ts writes these rows, so the first day of
 *      the admin portal prices exactly what the day before it did.
 *   2. The floor. A deployment with no DATABASE_URL still has to let somebody
 *      design a cake and see a price — lib/db.ts has always taken that position
 *      — and a missing row must never become a missing price.
 *
 * It is NOT a second catalogue. Once a database is reachable its rows win, per
 * option, in `snapshotFrom`. The one thing defaults keep doing at runtime is
 * filling a gap: an option the code can render but the table has no row for
 * falls back to what it always cost, because charging nothing for pistachio
 * because somebody deleted a row is worse than being briefly out of date.
 *
 * The prices below were moved here verbatim from lib/pricing.ts, and the copy
 * is read straight off lib/catalog.ts rather than retyped, so nothing here was
 * transcribed by hand and nothing can disagree with what shipped.
 */

const RUPEES = (n: number) => Math.round(n * 100);

const BASE_BY_SIZE: Record<SizeBand, number> = {
  "0.5kg": RUPEES(650),
  "1kg": RUPEES(1200),
  "1.5kg": RUPEES(1700),
  "2kg": RUPEES(2200),
  "3kg": RUPEES(3200),
  "5kg": RUPEES(5200),
};

const SIZE_MULTIPLIER: Record<SizeBand, number> = {
  "0.5kg": 0.7, "1kg": 1, "1.5kg": 1.3,
  "2kg": 1.6, "3kg": 2.1, "5kg": 3,
};

const SPONGE_DELTA: Record<Sponge, number> = {
  vanilla: 0,
  marble: 0,
  funfetti: RUPEES(50),
  "red-velvet": RUPEES(150),
  butterscotch: RUPEES(100),
  coffee: RUPEES(100),
  lemon: RUPEES(100),
  pineapple: RUPEES(100),
  carrot: RUPEES(150),
  coconut: RUPEES(120),
  mango: RUPEES(200),        // seasonal
  saffron: RUPEES(320),      // grams of it, and the grams are the price
  "belgian-chocolate": RUPEES(250),
  pistachio: RUPEES(350),
};

const FILLING_DELTA: Record<Filling, number> = {
  none: 0,
  "strawberry-jam": RUPEES(80),
  "cookie-crumb": RUPEES(90),
  "vanilla-custard": RUPEES(110),
  "lemon-curd": RUPEES(130),
  "pineapple-crush": RUPEES(120),
  "cherry-compote": RUPEES(170),
  "raspberry-compote": RUPEES(160),
  "blueberry-compote": RUPEES(190),
  "chocolate-mousse": RUPEES(150),
  "salted-caramel": RUPEES(150),
  rabri: RUPEES(220),
  "biscoff-spread": RUPEES(240),
  nutella: RUPEES(200),
  "hazelnut-praline": RUPEES(260),
  "pistachio-cream": RUPEES(320),
  "fresh-fruit": RUPEES(180),
};

const FROSTING_DELTA: Record<Frosting, number> = {
  "whipped-cream": 0,
  "american-buttercream": RUPEES(100),
  "cream-cheese": RUPEES(200),
  "swiss-meringue": RUPEES(250),
  "milk-ganache": RUPEES(180),
  "dark-ganache": RUPEES(200),
  "white-ganache": RUPEES(220),
  fondant: RUPEES(500),
  "mirror-glaze": RUPEES(450),
};

const FINISH_LABOUR: Record<Finish, number> = {
  smooth: 0,
  rustic: 0,
  combed: RUPEES(80),
  ombre: RUPEES(150),
  ruffle: RUPEES(250),
  rosette: RUPEES(200),
};

const TOPPING_UNIT: Record<Topping, number> = {
  sprinkles: RUPEES(30),
  "chocolate-curl": RUPEES(60),
  "white-chocolate-curl": RUPEES(70),
  "biscoff-crumb": RUPEES(90),
  "butterscotch-crunch": RUPEES(90),
  "caramel-shard": RUPEES(100),
  "pineapple-chunk": RUPEES(120),
  "almond-sliver": RUPEES(130),
  "biscoff-biscuit": RUPEES(160),
  truffle: RUPEES(180),
  cherry: RUPEES(210),
  blueberry: RUPEES(230),
  "pistachio-nut": RUPEES(240),
  "rasmalai-disc": RUPEES(280),
  "chocolate-shard": RUPEES(90),
  "pistachio-crumb": RUPEES(100),
  oreo: RUPEES(80),
  "meringue-kiss": RUPEES(110),
  strawberry: RUPEES(150),
  "mixed-berry": RUPEES(250),
  ferrero: RUPEES(200),
  macaron: RUPEES(280),
  "edible-flower": RUPEES(300),
  "gold-leaf": RUPEES(450),
};

const DELIVERY_FEE: Record<DeliverySlot, number> = {
  pickup: 0,
  standard: RUPEES(60),
  "same-day": RUPEES(120),
  "express-4hr": RUPEES(250),
  midnight: RUPEES(300),
};

/**
 * Structural charges and the tax rate — the prices that attach to no pickable
 * option. Lifted from the body of priceCake, where they were literals.
 */
export const DEFAULT_SETTINGS: PricingSettingsSnapshot = {
  tierSurchargePaise: RUPEES(400),
  layerSurchargePaise: RUPEES(120),
  messagePipingPaise: RUPEES(80),
  dripPaise: RUPEES(120),
  sugarFreePaise: RUPEES(250),
  gstRate: 0.18,
  // No minimum is what this product shipped with, and a minimum nobody set is
  // not one to invent on their behalf.
  minOrderPaise: 0,
};

/**
 * What each delivery slot promises. Moved verbatim out of lib/delivery's SLOTS.
 *
 * The window and the note are sentences rather than fields because that is what
 * a bakery actually means: "order by 18:00 the previous day" is a cutoff, a
 * reason and a consequence at once, and splitting it into a time column would
 * lose the half that makes it useful.
 */
const DEFAULT_SLOT_INFO: Record<
  DeliverySlot,
  { leadHours: number; window: string; note: string; dailyCapacity: number; cutoffHours: number }
> = {
  standard: {
    leadHours: 48,
    window: "10:00–20:00, day after tomorrow",
    note: "Baked fresh the morning of delivery.",
    dailyCapacity: 20,
    cutoffHours: 48,
  },
  "same-day": {
    leadHours: 12,
    window: "Order before 11:00, arrives 18:00–21:00",
    note: "Limited to designs we can decorate in a single shift.",
    dailyCapacity: 6,
    cutoffHours: 12,
  },
  "express-4hr": {
    leadHours: 4,
    window: "Within 4 hours of confirmation",
    note: "Dedicated rider. Available 09:00–19:00.",
    dailyCapacity: 3,
    cutoffHours: 4,
  },
  midnight: {
    leadHours: 24,
    window: "23:30–00:30",
    note: "Rider calls on arrival. Order by 18:00 the previous day.",
    dailyCapacity: 4,
    cutoffHours: 24,
  },
  pickup: {
    leadHours: 24,
    window: "Collect 10:00–21:00",
    note: "Jubilee Hills counter. Bring the order reference.",
    dailyCapacity: 25,
    cutoffHours: 24,
  },
};

/**
 * Hyderabad service zones, moved verbatim out of lib/delivery's ZONES.
 *
 * Express stops at the core because a rider cannot make a four-hour window
 * across the city, and the extended zone takes only what survives the trip.
 * These are refusals the bakery should be able to revise as it hires riders,
 * which is the whole reason they are rows now.
 */
export const DEFAULT_ZONES: DeliveryZoneInfo[] = [
  {
    id: "core",
    name: "Hyderabad core",
    pincodeFrom: 500001,
    pincodeTo: 500099,
    extraHours: 0,
    slots: ["standard", "same-day", "express-4hr", "midnight", "pickup"],
  },
  {
    id: "outer",
    name: "Hyderabad outer",
    pincodeFrom: 500100,
    pincodeTo: 500999,
    extraHours: 2,
    slots: ["standard", "same-day", "midnight", "pickup"],
  },
  {
    id: "extended",
    name: "Ranga Reddy / Medchal",
    pincodeFrom: 501001,
    pincodeTo: 502999,
    extraHours: 6,
    slots: ["standard", "pickup"],
  },
];

/**
 * The letterhead, as it stood before any of it was editable.
 *
 * The FSSAI licence still reads from the environment as its default, because
 * lib/docket's position on inventing a registration number has not changed:
 * unset means the line does not print. The database can now hold a real one.
 */
export const DEFAULT_BAKERY: BakeryInfo = {
  name: "Makemycake",
  phone: "+91 90000 00000",
  email: "orders@makemycake.example",
  address: "Road No. 36, Jubilee Hills, Hyderabad 500033",
  hours: "Tue–Sun 10:00–21:00. Closed Mondays.",
  fssaiLicence: process.env.NEXT_PUBLIC_FSSAI_LICENCE ?? "",
};

/** Basis points, for the row the seed writes. 0.18 -> 1800. */
export const DEFAULT_GST_BASIS_POINTS = Math.round(DEFAULT_SETTINGS.gstRate * 10_000);

/**
 * Display order is the order the arrays are already written in — that sequence
 * is a decision somebody made (vanilla first, gold leaf last), and the admin
 * inherits it rather than a re-sort by name or price.
 */
function toRows<T extends string>(
  category: CatalogCategory,
  options: readonly (Option<T> & { short?: string })[],
  priceFor: (value: T) => number,
  multiplierFor?: (value: T) => number,
): CatalogRow[] {
  return options.map((o, i) => ({
    category,
    value: o.value,
    name: o.name,
    blurb: o.blurb,
    ...(o.short === undefined ? {} : { shortName: o.short }),
    ...(o.swatch === undefined ? {} : { swatch: o.swatch }),
    ...(o.glyph === undefined ? {} : { glyph: o.glyph }),
    priceInputPaise: priceFor(o.value),
    ...(multiplierFor === undefined ? {} : { multiplier: multiplierFor(o.value) }),
    isAvailable: true,
    sortOrder: i,
  }));
}

/** Free by construction: shape, coverage and placement change no price. */
const free = () => 0;

export const DEFAULT_ROWS: CatalogRow[] = [
  ...toRows("shape", SHAPES, free),
  ...toRows("size", SIZES, (v) => BASE_BY_SIZE[v], (v) => SIZE_MULTIPLIER[v]),
  ...toRows("sponge", SPONGES, (v) => SPONGE_DELTA[v]),
  ...toRows("filling", FILLINGS, (v) => FILLING_DELTA[v]),
  ...toRows("frosting", FROSTINGS, (v) => FROSTING_DELTA[v]),
  ...toRows("coverage", COVERAGES, free),
  ...toRows("finish", FINISHES, (v) => FINISH_LABOUR[v]),
  ...toRows("topping", TOPPINGS, (v) => TOPPING_UNIT[v]),
  ...toRows("placement", PLACEMENTS, free),
  // Delivery rows carry their timing as well as their fee: the slot a customer
  // picks and the promise attached to it are the same row, read two ways.
  ...toRows("delivery", DELIVERY_OPTIONS, (v) => DELIVERY_FEE[v]).map((r) => {
    const info = DEFAULT_SLOT_INFO[r.value as DeliverySlot];
    return {
      ...r,
      leadHours: info.leadHours,
      slotWindow: info.window,
      slotNote: info.note,
      dailyCapacity: info.dailyCapacity,
      cutoffHours: info.cutoffHours,
    };
  }),
];

/** What the product priced and promised before any of this was editable. */
export const DEFAULT_SNAPSHOT: CatalogSnapshot = buildSnapshot(
  DEFAULT_ROWS,
  DEFAULT_SETTINGS,
  DEFAULT_ZONES,
  DEFAULT_BAKERY,
);

/**
 * Database rows over shipped defaults, one option at a time.
 *
 * Per option rather than all-or-nothing: a table missing a single row should
 * cost that one option its edits, not send the whole catalogue back to what it
 * shipped as. `isAvailable` comes through as written, so withdrawing an option
 * works; only absence falls back.
 */
export function snapshotFrom(
  rows: CatalogRow[],
  settings: PricingSettingsSnapshot,
  zones?: DeliveryZoneInfo[],
  bakery?: BakeryInfo,
): CatalogSnapshot {
  const key = (r: { category: CatalogCategory; value: string }) =>
    `${r.category}:${r.value}`;

  const merged = new Map(DEFAULT_ROWS.map((r) => [key(r), r]));
  for (const r of rows) merged.set(key(r), r);

  /*
   * Zones fall back wholesale rather than per row, unlike options. An option
   * the table is missing is a gap to paper over; a zone table that is empty is
   * a bakery that has not set one up yet, and quoting "we do not deliver
   * anywhere" to every customer would be worse than quoting the map this
   * product shipped with. Once there is one zone, that set is the answer —
   * including for a pincode it deliberately excludes.
   */
  return buildSnapshot(
    [...merged.values()],
    settings,
    zones && zones.length > 0 ? zones : DEFAULT_ZONES,
    bakery ?? DEFAULT_BAKERY,
  );
}
