import { deriveAllergens } from "./allergens";
import { resolveSlot } from "./delivery";
import { docketAmount, formatIST, titleCase } from "./format";
import { priceCake, type PriceBreakdown, type PriceLine } from "./pricing";
import { seedFrom } from "./seed";
import type { CakeConfig } from "./schema";
import { DIAMETER_IN, deriveHandling, deriveServings, WEIGHT_KG } from "./servings";

/**
 * A food business's FSSAI licence number is a regulatory identifier. Inventing
 * one and printing it on a public order docket would be a straightforward lie
 * about a registration that does not exist, so there is no default: set
 * NEXT_PUBLIC_FSSAI_LICENCE to the real number and the line appears.
 */
export const FSSAI_LICENCE = process.env.NEXT_PUBLIC_FSSAI_LICENCE ?? "";

/**
 * A preview reference, stable for a given config so the docket doesn't flicker
 * a new number on every keystroke. The real reference is minted server-side.
 */
export function previewRef(c: CakeConfig): string {
  return "MC-" + (1000 + (seedFrom(c) % 9000)).toString();
}

/** One slab of the cut cake, bottom to top. Mirrors `slabStack` in the 3D. */
export interface CakeLayer {
  type: "sponge" | "filling";
  flavor: string;
}

/**
 * The cake read the way it is built, not the way it is configured: sponge,
 * filling, sponge. `layers` counts the sponge slabs, so the filling sits in the
 * n-1 gaps between them — the same stack `slabStack` extrudes for the section
 * view. A cake with no filling has nothing but frosting scrape in the gaps, so
 * the gaps go unlisted rather than being named after something you did not order.
 */
export function deriveLayers(c: CakeConfig): CakeLayer[] {
  const sponge = titleCase(c.sponge);
  const filling = c.filling === "none" ? null : titleCase(c.filling);
  const out: CakeLayer[] = [];
  for (let i = 0; i < c.layers; i++) {
    if (i > 0 && filling) out.push({ type: "filling", flavor: filling });
    out.push({ type: "sponge", flavor: sponge });
  }
  return out;
}

export interface DocketRow {
  key: string;
  label: string;
  value: string;
  /** Paise, when this row also carries a price. */
  delta?: number;
}

export interface DocketModel {
  ref: string;
  createdAt: string;
  rows: DocketRow[];
  price: PriceBreakdown;
  diet: { eggless: boolean; sugarFree: boolean; contains: string[]; caveat: string | null };
  handling: { storage: string; serveAt: string; bestBefore: string };
  delivery: { slot: string; leadTime: string; window: string; pincode: string | null };
  servings: string;
  fssai: string;
}

/** The live docket beside the canvas — short rows, price deltas attached. */
export function buildDocket(
  c: CakeConfig,
  opts: { ref?: string; createdAt?: Date } = {},
): DocketModel {
  const price = priceCake(c);
  const allergens = deriveAllergens(c);
  const handling = deriveHandling(c);
  const slot = resolveSlot(c.delivery, c.pincode);
  const servings = deriveServings(c);

  /**
   * A price line, matched by prefix *and* by kind.
   *
   * Prefix alone was wrong in a way that is hard to see and impossible to
   * defend on a document a customer is asked to trust: the sponge row asked for
   * a line starting "Vanilla" and the filling line "Vanilla Custard filling"
   * answers to that too, so which price landed against which row came down to
   * the order the pricing engine happened to push them in. The kinds are
   * already distinct in lib/pricing.ts — sponge and filling are both
   * `modifier`, but structure is `labour`, delivery is `delivery` — so pinning
   * the kind removes the cross-category collisions outright, and consuming each
   * line at most once removes the rest: two Chocolate Shard toppings at
   * different placements used to both report the first one's price.
   */
  const used = new Set<number>();
  const byLabel = (needle: string, kind?: PriceLine["kind"]) => {
    const n = needle.toLowerCase();
    const i = price.lines.findIndex(
      (l, idx) =>
        !used.has(idx) &&
        (kind === undefined || l.kind === kind) &&
        l.label.toLowerCase().startsWith(n),
    );
    if (i === -1) return undefined;
    used.add(i);
    return price.lines[i].amount;
  };

  const rows: DocketRow[] = [
    {
      key: "shape",
      label: "SHAPE",
      value: titleCase(c.shape).toUpperCase(),
    },
    {
      key: "size",
      label: "SIZE",
      value: `${c.size.toUpperCase()} / ${DIAMETER_IN[c.size]}IN`,
    },
    {
      key: "tiers",
      label: "TIERS",
      value: String(c.tiers),
      delta: c.tiers > 1 ? byLabel(`${c.tiers}-tier`, "labour") : undefined,
    },
    {
      key: "sponge",
      label: "SPONGE",
      value: titleCase(c.sponge).toUpperCase(),
      delta: byLabel(titleCase(c.sponge), "modifier") ?? 0,
    },
    {
      key: "layers",
      label: "LAYERS",
      value: String(c.layers),
      delta: c.layers > 3 ? byLabel(`${c.layers} sponge`, "modifier") : undefined,
    },
    {
      key: "filling",
      label: "FILL",
      value: titleCase(c.filling).toUpperCase(),
      delta: c.filling === "none" ? undefined : byLabel(titleCase(c.filling), "modifier") ?? 0,
    },
    {
      key: "frosting",
      label: "FROST",
      value: titleCase(c.frosting).toUpperCase(),
      delta: byLabel(titleCase(c.frosting), "modifier") ?? 0,
    },
    {
      key: "coverage",
      label: "COVER",
      value: titleCase(c.coverage).toUpperCase(),
    },
    {
      key: "finish",
      label: "FINISH",
      value: titleCase(c.finish).toUpperCase(),
      delta: byLabel(titleCase(c.finish), "labour") ?? 0,
    },
  ];

  if (c.hasDrip) {
    rows.push({ key: "drip", label: "DRIP", value: "YES", delta: byLabel("Drip", "modifier") });
  }

  for (const t of c.toppings) {
    rows.push({
      key: `topping-${t.kind}`,
      label: "TOP",
      value: `${titleCase(t.kind).toUpperCase()} ×${t.density}`,
      delta: byLabel(titleCase(t.kind), "modifier"),
    });
  }

  if (c.message?.trim()) {
    rows.push({
      key: "message",
      label: "MSG",
      value: `"${c.message.trim().toUpperCase()}"`,
      delta: byLabel("Message piping", "labour"),
    });
  }

  if (c.sugarFree) {
    rows.push({
      key: "sugarfree",
      label: "DIET",
      value: "SUGAR-FREE",
      delta: byLabel("Sugar-free", "modifier"),
    });
  }

  rows.push({
    key: "delivery",
    label: "DELIV",
    value: slot.name.toUpperCase(),
    delta: byLabel(titleCase(c.delivery), "delivery"),
  });

  return {
    ref: opts.ref ?? previewRef(c),
    createdAt: formatIST(opts.createdAt ?? new Date()),
    rows,
    price,
    diet: {
      eggless: c.eggless,
      sugarFree: c.sugarFree,
      contains: allergens.allergens,
      caveat: allergens.egglessCaveat,
    },
    handling: {
      storage: handling.storage,
      serveAt: handling.serveAt,
      bestBefore: handling.bestBefore,
    },
    delivery: {
      slot: slot.name,
      leadTime: `${slot.effectiveLeadHours} hours`,
      window: slot.window,
      pincode: c.pincode ?? null,
    },
    servings: servings.min === servings.max
      ? `${servings.max}`
      : `${servings.min}–${servings.max}`,
    fssai: FSSAI_LICENCE,
  };
}

/**
 * The full spec sheet — the thing a kitchen actually works from. Rendered as
 * monospace text so it is identical in the terminal, the browser and the PDF.
 */
export function renderSpecSheet(
  c: CakeConfig,
  opts: { ref?: string; createdAt?: Date; width?: number } = {},
): string {
  const w = opts.width ?? 62;
  const d = buildDocket(c, opts);
  const out: string[] = [];

  const rule = (ch = "─") => ch.repeat(w);
  const kv = (k: string, v: string) => `  ${k.padEnd(19)}${v}`;
  const money = (k: string, paise: number) => {
    const amt = docketAmount(paise);
    return `  ${k.padEnd(w - 4 - amt.length)}${amt}`;
  };

  out.push("MAKEMYCAKE — ORDER DOCKET");
  out.push(rule("═"));
  out.push(kv("Order ref", d.ref));
  out.push(kv("Created", d.createdAt));
  out.push("");

  out.push("CAKE");
  out.push(kv("Shape", `${titleCase(c.shape)}, ${c.tiers} tier${c.tiers > 1 ? "s" : ""}`));
  out.push(kv("Weight", `${WEIGHT_KG[c.size]} kg (${DIAMETER_IN[c.size]}in)`));
  out.push(kv("Serves", `${d.servings}  ${deriveServings(c).basis}`));
  out.push(kv("Sponge", `${titleCase(c.sponge)}, ${c.layers} layers`));
  out.push(kv("Filling", titleCase(c.filling)));
  out.push(kv("Frosting", `${titleCase(c.frosting)}, ${titleCase(c.coverage)} coverage, ${titleCase(c.finish)}`));
  out.push(kv("Frosting colour", c.frostingColor.toUpperCase()));
  if (c.hasDrip) {
    out.push(kv("Drip", `Yes${c.dripColor ? `, ${c.dripColor.toUpperCase()}` : ""}`));
  }
  if (c.toppings.length === 0) {
    out.push(kv("Toppings", "None"));
  } else {
    for (const t of c.toppings) {
      out.push(kv(
        "Topping",
        `${titleCase(t.kind)}, ${titleCase(t.placement)}, density ${t.density}/5`,
      ));
    }
  }
  out.push(kv("Message", c.message?.trim() ? `"${c.message.trim()}"` : "None"));
  out.push("");

  out.push("DIET");
  out.push(kv("Eggless", c.eggless ? "Yes" : "No"));
  out.push(kv("Sugar-free", c.sugarFree ? "Yes" : "No"));
  out.push(kv("Contains", d.diet.contains.length ? d.diet.contains.join(", ") : "No declared allergens"));
  if (d.diet.caveat) out.push(kv("Note", d.diet.caveat));
  out.push("");

  out.push("HANDLING");
  out.push(kv("Storage", d.handling.storage));
  out.push(kv("Serve at", d.handling.serveAt));
  out.push(kv("Best before", d.handling.bestBefore));
  out.push("");

  out.push("DELIVERY");
  out.push(kv("Slot", d.delivery.slot));
  out.push(kv("Lead time", d.delivery.leadTime));
  out.push(kv("Window", d.delivery.window));
  out.push(kv("Pincode", d.delivery.pincode ?? "Not set"));
  out.push("");

  out.push("PRICE");
  for (const l of d.price.lines) out.push(money(l.label, l.amount));
  out.push("  " + rule("─").slice(2));
  out.push(money("Subtotal", d.price.subtotal));
  out.push(money(`GST @ ${Math.round(d.price.gstRate * 100)}%`, d.price.gst));
  out.push("  " + rule("─").slice(2));
  out.push(money("TOTAL", d.price.total));
  if (d.fssai) {
    out.push("");
    out.push(`FSSAI Lic. No. ${d.fssai}`);
  }

  return out.join("\n");
}
