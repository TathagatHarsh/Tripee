import {
  COVERAGES, DELIVERY_OPTIONS, DRIP_PALETTE, FILLINGS, FINISHES, FROSTINGS,
  FROSTING_PALETTE, PLACEMENTS, SHAPES, SIZES, SPONGES, STEPS, TOPPINGS,
} from "@/lib/catalog";
import { resolveSlot } from "@/lib/delivery";
import { formatINR } from "@/lib/format";
import { priceCake } from "@/lib/pricing";
import { validateCake, type RuleViolation } from "@/lib/rules";
import type { CakeConfig, DeliverySlot, SizeBand } from "@/lib/schema";
import { DIAMETER_IN, deriveServings } from "@/lib/servings";

/**
 * The one cake the film specifies, held for all seven chapters.
 *
 * It is a custom build rather than one of the 21 presets, and the reason is the
 * cut face in CH7: dark crumb inside, ivory shell outside, deep red band
 * between. That contrast is the only thing that makes a section read on a
 * paper-coloured page with no darkness anywhere in the frame — a vanilla sponge
 * under cream cheese is beige on beige and the last chapter has nothing to show.
 *
 * Both hexes are looked up by name rather than typed, so the swatch the film
 * describes and the swatch the builder would render stay the same swatch.
 */
const IVORY = FROSTING_PALETTE.find(p => p.name === "Ivory")!.hex;
const DARK_CHOCOLATE = DRIP_PALETTE.find(p => p.name === "Dark chocolate")!.hex;

export const FILM_CAKE: CakeConfig = {
  version: 1,
  /*
   * Square, because the cake in the film is square.
   *
   * This page's whole argument is that the ticket and the cake are the same
   * object, so when the two disagree it is the ticket that gets corrected — and
   * the correction costs one word here because every price, serving count and
   * docket line downstream is derived rather than written down.
   */
  shape: "square",
  size: "1.5kg",
  tiers: 1,
  layers: 3,
  sponge: "belgian-chocolate",
  filling: "cherry-compote",
  frosting: "swiss-meringue",
  coverage: "full",
  finish: "combed",
  frostingColor: IVORY,
  hasDrip: true,
  dripColor: DARK_CHOCOLATE,
  toppings: [
    { kind: "chocolate-shard", placement: "crown", density: 3 },
    { kind: "cherry", placement: "top-ring", density: 2 },
  ],
  eggless: true,
  sugarFree: false,
  delivery: "standard",
  pincode: "500033",
};

/** Ticket No. on the intake sheet. */
export const TICKET_NO = "7412";

const name = <T extends string>(list: { value: T; name: string }[], v: T) =>
  list.find(o => o.value === v)!.name;

const upper = (s: string) => s.toUpperCase();

function servingsRange(size: SizeBand): string {
  const s = deriveServings({ ...FILM_CAKE, size });
  return `${s.min}–${s.max}`;
}

/**
 * The nine ticket lines — one per step in lib/catalog.ts STEPS, in STEPS order,
 * with every value read out of the catalogue rather than written here. A label
 * typed by hand is a label that goes stale the first time somebody renames a
 * filling, and this page's entire argument is that the ticket and the cake are
 * the same object.
 */
export interface TicketLine {
  /** STEPS slug — also the chapter's hook for the active-line marker. */
  slug: string;
  label: string;
  value: string;
  /** CH5 appends the drip onto the line CH4 already printed. */
  appended?: string;
  /**
   * How many options this one was chosen from.
   *
   * Without it every line reads as a fact about a cake that already exists —
   * SPONGE ⋯ BELGIAN CHOCOLATE — and the reader watches a documentary about
   * somebody else's order. "1 OF 14" is what turns the same line into a
   * decision they could have made differently.
   */
  choices?: number;
}

const c = FILM_CAKE;

const TOPPING_VALUE = c.toppings
  .map(t => `${upper(name(TOPPINGS, t.kind))}, ${upper(name(PLACEMENTS, t.placement))}, ${t.density}/5`)
  .join(" · ");

const VALUES: Record<string, string> = {
  shape: upper(name(SHAPES, c.shape)),
  size: `${upper(name(SIZES, c.size))} · ${DIAMETER_IN[c.size]} IN · SERVES ${servingsRange(c.size)}`,
  sponge: `${upper(name(SPONGES, c.sponge))} · ${c.layers} LAYERS`,
  filling: upper(name(FILLINGS, c.filling)),
  frosting: `${upper(name(FROSTINGS, c.frosting))} · ${upper(name(COVERAGES, c.coverage))} COVERAGE`,
  finish: `${upper(FROSTING_PALETTE.find(p => p.hex === c.frostingColor)!.name)} · ${upper(name(FINISHES, c.finish))}`,
  toppings: TOPPING_VALUE,
  message: c.message?.trim() ? `"${upper(c.message.trim())}"` : "— NONE",
  review: formatINR(priceCake(c).total),
};

const DRIP_SUFFIX = ` · ${upper(DRIP_PALETTE.find(d => d.hex === c.dripColor)!.name)} DRIP`;

/** Counted from the arrays, so a new sponge changes the ticket by itself. */
const CHOICES: Record<string, number> = {
  shape: SHAPES.length,
  size: SIZES.length,
  sponge: SPONGES.length,
  filling: FILLINGS.length,
  frosting: FROSTINGS.length,
  finish: FINISHES.length,
  toppings: TOPPINGS.length,
};

export const TICKET_LINES: TicketLine[] = STEPS.map(s => ({
  slug: s.slug,
  label: upper(s.title),
  value: VALUES[s.slug],
  appended: s.slug === "finish" ? DRIP_SUFFIX : undefined,
  choices: CHOICES[s.slug],
}));

/**
 * What the cake costs at the end of each chapter.
 *
 * The band under the film is titled "the price is on the ticket from the first
 * tap", and the film used to print a single figure in chapter seven of seven —
 * arguing the opposite of the claim directly beneath it. So the ticket carries a
 * running total instead, priced from the cake as specified SO FAR: everything
 * not yet chosen sits at its base state, which is what a kitchen would quote you
 * mid-conversation.
 *
 * It only ever goes up, and it lands on exactly the total the docket prints.
 */
const BARE: CakeConfig = {
  ...FILM_CAKE,
  filling: "none",
  frosting: "whipped-cream",
  finish: "smooth",
  hasDrip: false,
  toppings: [],
};

const STAGES: CakeConfig[] = [
  BARE,                                                             // CH1 shape+size+sponge
  { ...BARE, filling: c.filling },                                  // CH2 filling
  { ...BARE, filling: c.filling, frosting: c.frosting },            // CH3 frosting
  { ...BARE, filling: c.filling, frosting: c.frosting, finish: c.finish },
  { ...BARE, filling: c.filling, frosting: c.frosting, finish: c.finish, hasDrip: true },
  { ...c },                                                          // CH6 toppings on
  { ...c },                                                          // CH7 the docket total
];

export const CHAPTER_TOTALS: string[] = STAGES.map(s => formatINR(priceCake(s).total));

export const FILM_TOTAL = VALUES.review;

/** Every step with its written one-line hint, for "NINE CHOICES. ONE CAKE." */
export const NINE_STEPS = STEPS.map(s => ({
  label: upper(s.title),
  hint: s.hint,
}));

/**
 * The six sizes, with the diameter a bakery speaks in and the servings derived
 * at 100g rather than asserted. Nothing here is a "from ₹" figure: the whole
 * promise of the product is an itemised price from the first tap.
 */
export const SIZE_TABLE = SIZES.map(s => ({
  label: upper(s.name),
  diameter: `${DIAMETER_IN[s.value]} IN`,
  serves: servingsRange(s.value),
  total: formatINR(priceCake({ ...c, size: s.value }).total),
}));

/**
 * The five slots with their real windows, and the fee read back out of the
 * pricing engine rather than copied off it — DELIVERY_FEE is private to
 * lib/pricing, and a second copy of it here would drift on the first price change.
 */
export const DELIVERY_TABLE = DELIVERY_OPTIONS.map(o => {
  const line = priceCake({ ...c, delivery: o.value }).lines.find(l => l.kind === "delivery");
  const slot = resolveSlot(o.value);
  return {
    label: upper(o.name),
    window: slot.window,
    lead: `${slot.leadHours} HR`,
    note: slot.note,
    fee: line ? formatINR(line.amount) : "NO FEE",
  };
});

/**
 * The three zones, probed through lib/delivery rather than restated. Express
 * genuinely stops at the core zone and the table has to say so — over-promising
 * coverage on a page whose model is "we call to confirm" is the one lie that
 * gets found out on the phone.
 */
const ZONE_PROBES: { pincode: string; range: string }[] = [
  { pincode: "500033", range: "500001–500099" },
  { pincode: "500500", range: "500100–500999" },
  { pincode: "501500", range: "501001–502999" },
];

export const ZONE_TABLE = ZONE_PROBES.map(z => {
  const slots = DELIVERY_OPTIONS
    .filter(o => resolveSlot(o.value, z.pincode).available)
    .map(o => upper(o.name));
  const standard = resolveSlot("standard", z.pincode);
  return {
    name: upper(standard.zoneName ?? ""),
    range: z.range,
    lead: `${standard.effectiveLeadHours} HR`,
    slots: slots.join(" · "),
  };
});

/**
 * "WHAT WE DON'T DO", built by tripping every rule in lib/rules.ts and reading
 * the message it returns. Twelve sentences the kitchen already wrote once; a
 * hand-written list beside them would be a thirteenth kitchen with its own
 * opinions.
 */
const TRIPS: Partial<CakeConfig>[] = [
  { frosting: "whipped-cream", tiers: 2, size: "1.5kg", delivery: "pickup" },
  { tiers: 2, size: "1kg" },
  { tiers: 3, size: "2kg" },
  { coverage: "naked", hasDrip: true },
  { frosting: "fondant", finish: "combed" },
  { frosting: "mirror-glaze", finish: "combed" },
  { coverage: "naked", frosting: "fondant" },
  { frosting: "whipped-cream", delivery: "standard" },
  { toppings: [{ kind: "edible-flower", placement: "top-scatter", density: 2 }], delivery: "midnight" },
  {
    toppings: [
      { kind: "cherry", placement: "top-ring", density: 2 },
      { kind: "truffle", placement: "crown", density: 2 },
      { kind: "oreo", placement: "base-border", density: 2 },
      { kind: "sprinkles", placement: "top-scatter", density: 2 },
    ],
  },
  { message: "A VERY LONG MESSAGE INDEED FOR IT", size: "0.5kg" },
  { sugarFree: true, frosting: "fondant" },
];

export const HOUSE_RULES: { id: string; severity: RuleViolation["severity"]; message: string }[] = (() => {
  const seen = new Map<string, RuleViolation>();
  for (const patch of TRIPS) {
    for (const v of validateCake({ ...c, ...patch })) {
      if (!seen.has(v.id)) seen.set(v.id, v);
    }
  }
  return [...seen.values()].map(v => ({ id: v.id, severity: v.severity, message: v.message }));
})();

/** Slots a pincode can actually have, for the intake's one-tap fix. */
export function slotsFor(pincode: string): DeliverySlot[] {
  return DELIVERY_OPTIONS.filter(o => resolveSlot(o.value, pincode).available).map(o => o.value);
}
