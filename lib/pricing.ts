import type { CakeConfig } from "./schema";

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

const RUPEES = (n: number) => Math.round(n * 100);

const BASE_BY_SIZE: Record<CakeConfig["size"], number> = {
  "0.5kg": RUPEES(650),
  "1kg":   RUPEES(1200),
  "1.5kg": RUPEES(1700),
  "2kg":   RUPEES(2200),
  "3kg":   RUPEES(3200),
  "5kg":   RUPEES(5200),
};

const SPONGE_DELTA: Record<CakeConfig["sponge"], number> = {
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

const FILLING_DELTA: Record<CakeConfig["filling"], number> = {
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

const FROSTING_DELTA: Record<CakeConfig["frosting"], number> = {
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

const FINISH_LABOUR: Record<CakeConfig["finish"], number> = {
  smooth: 0,
  rustic: 0,
  combed: RUPEES(80),
  ombre: RUPEES(150),
  ruffle: RUPEES(250),
  rosette: RUPEES(200),
};

const TOPPING_UNIT: Record<string, number> = {
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

const DELIVERY_FEE: Record<CakeConfig["delivery"], number> = {
  pickup: 0,
  standard: RUPEES(60),
  "same-day": RUPEES(120),
  "express-4hr": RUPEES(250),
  midnight: RUPEES(300),
};

const SIZE_MULTIPLIER: Record<CakeConfig["size"], number> = {
  "0.5kg": 0.7, "1kg": 1, "1.5kg": 1.3,
  "2kg": 1.6, "3kg": 2.1, "5kg": 3,
};

export function priceCake(c: CakeConfig): PriceBreakdown {
  const lines: PriceLine[] = [];
  const mult = SIZE_MULTIPLIER[c.size];

  lines.push({
    label: `${c.size} ${c.shape} base`,
    amount: BASE_BY_SIZE[c.size],
    kind: "base",
  });

  if (SPONGE_DELTA[c.sponge]) {
    lines.push({
      label: label(c.sponge) + " sponge",
      amount: Math.round(SPONGE_DELTA[c.sponge] * mult),
      kind: "modifier",
    });
  }

  if (FILLING_DELTA[c.filling]) {
    lines.push({
      label: label(c.filling) + " filling",
      amount: Math.round(FILLING_DELTA[c.filling] * mult),
      kind: "modifier",
    });
  }

  if (FROSTING_DELTA[c.frosting]) {
    lines.push({
      label: label(c.frosting),
      amount: Math.round(FROSTING_DELTA[c.frosting] * mult),
      kind: "modifier",
    });
  }

  // Tiers are structural work: dowels, boards, extra assembly.
  if (c.tiers > 1) {
    lines.push({
      label: `${c.tiers}-tier structure`,
      amount: RUPEES(400) * (c.tiers - 1),
      kind: "labour",
    });
  }

  if (c.layers > 3) {
    lines.push({
      label: `${c.layers} sponge layers`,
      amount: RUPEES(120) * (c.layers - 3),
      kind: "modifier",
    });
  }

  if (FINISH_LABOUR[c.finish]) {
    lines.push({
      label: label(c.finish) + " finish",
      amount: Math.round(FINISH_LABOUR[c.finish] * mult),
      kind: "labour",
    });
  }

  if (c.hasDrip) {
    lines.push({ label: "Drip", amount: RUPEES(120), kind: "modifier" });
  }

  for (const t of c.toppings) {
    const unit = TOPPING_UNIT[t.kind] ?? RUPEES(100);
    // density 1..5 → 0.6x .. 1.8x
    const densityFactor = 0.6 + (t.density - 1) * 0.3;
    lines.push({
      label: `${label(t.kind)} (${label(t.placement)})`,
      amount: Math.round(unit * densityFactor * mult),
      kind: "modifier",
    });
  }

  if (c.message?.trim()) {
    lines.push({ label: "Message piping", amount: RUPEES(80), kind: "labour" });
  }

  if (c.sugarFree) {
    lines.push({ label: "Sugar-free preparation", amount: RUPEES(250), kind: "modifier" });
  }

  if (DELIVERY_FEE[c.delivery]) {
    lines.push({
      label: label(c.delivery) + " delivery",
      amount: DELIVERY_FEE[c.delivery],
      kind: "delivery",
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const gstRate = 0.18;
  const gst = Math.round(subtotal * gstRate);
  const total = subtotal + gst;

  return { lines, subtotal, gstRate, gst, total, payable: total, currency: "INR" };
}

/** Price deltas for a single option swatch, so the UI can print `+₹200` on it. */
export function deltaFor(
  c: CakeConfig,
  patch: Partial<CakeConfig>,
): number {
  return priceCake({ ...c, ...patch }).total - priceCake(c).total;
}

export function label(s: string) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
