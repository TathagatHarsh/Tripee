import type { CatalogSnapshot } from "./catalogSnapshot";
import type { CakeConfig } from "./schema";

/**
 * The pricing engine: a pure function of a cake and a catalogue.
 *
 * The prices themselves used to be constants in this file, which meant the
 * bakery could not change what a filling cost without a deploy. They now live
 * in CatalogOption, and this takes the catalogue as an argument.
 *
 * Explicitly an argument, rather than something this module reads for itself.
 * The tempting version keeps `priceCake(config)` and looks the catalogue up
 * internally — but the same function runs in a browser, where the catalogue
 * arrives over the wire and can be a moment stale, and on the server, where an
 * order is priced for real. One function with two hidden sources is a single
 * refactor away from pricing an order off whatever the client happened to be
 * holding. Passing the catalogue in makes each caller say which one it means,
 * and leaves no global for a server path to read by accident.
 *
 * Who passes what:
 *   - server (app/api/*, app/kitchen) — `await getCatalogSnapshot()`, the
 *     database's answer, and the only one that decides money;
 *   - client (the builder) — the hydrated store, for the running estimate.
 *
 * The estimate is advisory and app/api/orders re-prices before writing, which
 * is the arrangement that was already here.
 */

export interface PriceLine {
  label: string;      // shown to the customer, plain language
  amount: number;     // paise, integer — never use floats for money
  kind: "base" | "modifier" | "labour" | "delivery" | "discount";
}

export interface PriceBreakdown {
  lines: PriceLine[];
  subtotal: number;
  gstRate: number;    // 0.18 for bakery products
  gst: number;
  total: number;
  /** Split out now so a payment gateway can slot in later without a refactor. */
  payable: number;
  currency: "INR";
}

export function priceCake(c: CakeConfig, catalog: CatalogSnapshot): PriceBreakdown {
  const { price, settings } = catalog;
  const lines: PriceLine[] = [];

  /*
   * Every lookup below is `?? 0`, and none of them should ever fire:
   * snapshotFrom backfills any option the table is missing from the shipped
   * defaults, and CakeConfig is Zod-validated, so the key is always a real enum
   * member. The guard is here because the alternative to a wrong number is NaN,
   * and NaN spreads — it would reach the customer as a blank total and the
   * kitchen as an unreadable docket, with nothing naming the cause.
   */
  const mult = price.multiplierBySize[c.size] ?? 1;

  lines.push({
    label: `${c.size} ${c.shape} base`,
    amount: price.baseBySize[c.size] ?? 0,
    kind: "base",
  });

  const spongeDelta = price.spongeDelta[c.sponge] ?? 0;
  if (spongeDelta) {
    lines.push({
      label: label(c.sponge) + " sponge",
      amount: Math.round(spongeDelta * mult),
      kind: "modifier",
    });
  }

  const fillingDelta = price.fillingDelta[c.filling] ?? 0;
  if (fillingDelta) {
    lines.push({
      label: label(c.filling) + " filling",
      amount: Math.round(fillingDelta * mult),
      kind: "modifier",
    });
  }

  const frostingDelta = price.frostingDelta[c.frosting] ?? 0;
  if (frostingDelta) {
    lines.push({
      label: label(c.frosting),
      amount: Math.round(frostingDelta * mult),
      kind: "modifier",
    });
  }

  // Tiers are structural work: dowels, boards, extra assembly.
  if (c.tiers > 1) {
    lines.push({
      label: `${c.tiers}-tier structure`,
      amount: settings.tierSurchargePaise * (c.tiers - 1),
      kind: "labour",
    });
  }

  if (c.layers > 3) {
    lines.push({
      label: `${c.layers} sponge layers`,
      amount: settings.layerSurchargePaise * (c.layers - 3),
      kind: "modifier",
    });
  }

  const finishLabour = price.finishLabour[c.finish] ?? 0;
  if (finishLabour) {
    lines.push({
      label: label(c.finish) + " finish",
      amount: Math.round(finishLabour * mult),
      kind: "labour",
    });
  }

  if (c.hasDrip) {
    lines.push({ label: "Drip", amount: settings.dripPaise, kind: "modifier" });
  }

  for (const t of c.toppings) {
    const unit = price.toppingUnit[t.kind] ?? 0;
    // density 1..5 → 0.6x .. 1.8x
    const densityFactor = 0.6 + (t.density - 1) * 0.3;
    lines.push({
      label: `${label(t.kind)} (${label(t.placement)})`,
      amount: Math.round(unit * densityFactor * mult),
      kind: "modifier",
    });
  }

  if (c.message?.trim()) {
    lines.push({
      label: "Message piping",
      amount: settings.messagePipingPaise,
      kind: "labour",
    });
  }

  if (c.sugarFree) {
    lines.push({
      label: "Sugar-free preparation",
      amount: settings.sugarFreePaise,
      kind: "modifier",
    });
  }

  const deliveryFee = price.deliveryFee[c.delivery] ?? 0;
  if (deliveryFee) {
    lines.push({
      label: label(c.delivery) + " delivery",
      amount: deliveryFee,
      kind: "delivery",
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const gstRate = settings.gstRate;
  const gst = Math.round(subtotal * gstRate);
  const total = subtotal + gst;

  return { lines, subtotal, gstRate, gst, total, payable: total, currency: "INR" };
}

/** Price deltas for a single option swatch, so the UI can print `+₹200` on it. */
export function deltaFor(
  c: CakeConfig,
  patch: Partial<CakeConfig>,
  catalog: CatalogSnapshot,
): number {
  return priceCake({ ...c, ...patch }, catalog).total - priceCake(c, catalog).total;
}

export function label(s: string) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
