import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROWS, DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, snapshotFrom,
} from "@/lib/catalogDefaults";
import type { CatalogRow, CatalogSnapshot } from "@/lib/catalogSnapshot";
import {
  asBasketBody, CheckoutRequest, MAX_CAKES, MAX_QTY, nameOk, normalizeName,
  normalizePhone, phoneOk, refForAttempt, reviewBasket, withdrawnOptions,
} from "@/lib/checkout";
import { priceCake } from "@/lib/pricing";
import { DEFAULT_CAKE, type CakeConfig } from "@/lib/schema";

/**
 * What the till refuses, and what it charges.
 *
 * These are the rules app/api/orders enforces, tested where they actually live.
 * The route handler needs a database, a session and a request; every decision
 * it makes is in lib/checkout, which needs none of the three — which is the
 * reason that module is its own file rather than three hundred lines inside the
 * handler.
 *
 * The catalogue is built in memory from the shipped defaults, so "the bakery
 * withdrew the filling" and "the bakery put the price up" are a line of fixture
 * each rather than a migration.
 */

const cake = (patch: Partial<CakeConfig> = {}): CakeConfig => ({ ...DEFAULT_CAKE, pincode: "500081", ...patch });

/** The shipped catalogue with some rows edited, as an admin would edit them. */
function catalogWith(edit: (row: CatalogRow) => CatalogRow): CatalogSnapshot {
  return snapshotFrom(DEFAULT_ROWS.map(edit), DEFAULT_SETTINGS);
}

const withdraw = (category: string, value: string) =>
  catalogWith((r) =>
    r.category === category && r.value === value ? { ...r, isAvailable: false } : r,
  );

const reprice = (category: string, value: string, paise: number) =>
  catalogWith((r) =>
    r.category === category && r.value === value ? { ...r, priceInputPaise: paise } : r,
  );

const one = (config: CakeConfig, qty = 1, quotedTotalPaise?: number) => [
  { config: { ...config, pincode: config.pincode ?? "500081" }, qty, ...(quotedTotalPaise === undefined ? {} : { quotedTotalPaise }) },
];

/* -------------------------------------------------------- the request shape */

describe("the checkout request", () => {
  const base = {
    customerName: "Aryu",
    customerPhone: "9876543210",
    items: [{ config: { ...DEFAULT_CAKE, pincode: "500081" }, qty: 1 }],
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    fulfillment: { method: "delivery", slot: "standard", recipientName: "Aryu", addressLine1: "12 Test Street", city: "Hyderabad", state: "Telangana", pincode: "500081", requestedDate: "2030-01-01", requestedWindow: "10:00–20:00" },
  };

  it("accepts a basket of one cake", () => {
    expect(CheckoutRequest.safeParse(base).success).toBe(true);
  });

  it("defaults a missing quantity to one rather than to nothing", () => {
    const parsed = CheckoutRequest.safeParse({ ...base, items: [{ config: DEFAULT_CAKE }] });
    expect(parsed.success && parsed.data.items[0].qty).toBe(1);
  });

  it("rejects a configuration that is not a cake", () => {
    for (const config of [null, {}, "chocolate", { ...DEFAULT_CAKE, version: 2 }]) {
      expect(
        CheckoutRequest.safeParse({ ...base, items: [{ config, qty: 1 }] }).success,
        JSON.stringify(config),
      ).toBe(false);
    }
  });

  it("rejects an option the schema has never heard of", () => {
    // A value the pickers cannot render and the kitchen cannot bake. The Zod
    // enums are the closed list; the catalogue only decides price and stock.
    for (const patch of [
      { sponge: "unicorn" },
      { size: "17kg" },
      { frosting: "" },
      { delivery: "teleport" },
      { toppings: [{ kind: "gravel", placement: "crown", density: 3 }] },
    ]) {
      expect(
        CheckoutRequest.safeParse({
          ...base,
          items: [{ config: { ...DEFAULT_CAKE, ...patch }, qty: 1 }],
        }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });

  it("rejects every shape of impossible quantity", () => {
    for (const qty of [
      0, -1, -99, 2.5, MAX_QTY + 1, 1e9, Number.NaN, Number.POSITIVE_INFINITY,
    ]) {
      expect(
        CheckoutRequest.safeParse({ ...base, items: [{ config: DEFAULT_CAKE, qty }] }).success,
        String(qty),
      ).toBe(false);
    }
  });

  it("refuses a basket bigger than one order can carry", () => {
    const lines = Array.from({ length: 5 }, () => ({ config: DEFAULT_CAKE, qty: MAX_QTY }));
    expect(lines.reduce((n, l) => n + l.qty, 0)).toBeGreaterThan(MAX_CAKES);
    expect(CheckoutRequest.safeParse({ ...base, items: lines }).success).toBe(false);
  });

  it("refuses an empty basket", () => {
    expect(CheckoutRequest.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  /*
   * §30, as a parse rather than as a promise. The handler never reads these
   * fields, and this is the stronger statement: they do not survive validation,
   * so there is no `body.status` for a later edit to accidentally start using.
   */
  it("drops every field a client is not allowed to decide", () => {
    const parsed = CheckoutRequest.safeParse({
      ...base,
      userId: "user_somebodyelse",
      status: "delivered",
      paymentStatus: "paid",
      totalPaise: 1,
      payablePaise: 1,
      priceBreakdown: { total: 1 },
      vendorId: "vendor_mine",
      currentAssignmentId: "va_1",
      leadHours: 0,
    });

    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {}).sort()).toEqual([
      "customerName",
      "customerPhone",
      "fulfillment",
      "idempotencyKey",
      "items",
    ]);
  });

  it("reads the builder's one-cake body as a basket of one", () => {
    const parsed = CheckoutRequest.safeParse(
      asBasketBody({
        fulfillment: base.fulfillment,
        idempotencyKey: base.idempotencyKey,
        config: DEFAULT_CAKE,
        clientTotal: 160480,
        customerName: "Aryu",
        customerPhone: "9876543210",
        designSlug: "abcdefg",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0].qty).toBe(1);
    expect(parsed.data.items[0].quotedTotalPaise).toBe(160480);
    expect(parsed.data.designSlug).toBe("abcdefg");
  });

  it("leaves a basket body alone", () => {
    const body = { ...base };
    expect(asBasketBody(body)).toBe(body);
  });
});

/* ------------------------------------------------------------ the customer */

describe("customer details", () => {
  it("takes an Indian mobile number however somebody writes it", () => {
    for (const raw of [
      "9876543210", "98765 43210", "98765-43210",
      "+919876543210", "+91 98765 43210", "919876543210", "09876543210",
      "6123456789", "7123456789", "8123456789",
    ]) {
      expect(phoneOk(raw), raw).toBe(true);
    }
  });

  it("refuses what nobody can be rung on", () => {
    for (const raw of [
      "", "   ", "123", "1234567890", "5123456789", "98765432101",
      "abcdefghij", "+1 415 555 0123", "+91987654321",
    ]) {
      expect(phoneOk(raw), JSON.stringify(raw)).toBe(false);
    }
  });

  it("wants a name the kitchen can put on a docket", () => {
    expect(nameOk("Aryu")).toBe(true);
    expect(nameOk("  Jo  ")).toBe(true);
    expect(nameOk("A")).toBe(false);
    expect(nameOk("  ")).toBe(false);
    expect(nameOk(undefined)).toBe(false);
  });

  it("normalises rather than storing what was typed", () => {
    expect(normalizePhone(" +91 98765-43210 ")).toBe("+919876543210");
    expect(normalizeName("  Aryu  ")).toBe("Aryu");
    // Bounded, so a name field cannot be used to write an essay into a row.
    expect(normalizeName("x".repeat(500))).toHaveLength(80);
  });
});

/* --------------------------------------------------------- what it charges */

describe("the server's price is the only price", () => {
  it("prices from the catalogue and not from what the client claimed", () => {
    const review = reviewBasket(one(DEFAULT_CAKE, 1), DEFAULT_SNAPSHOT);
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    const server = priceCake(DEFAULT_CAKE, DEFAULT_SNAPSHOT);
    expect(review.quotes[0].price.total).toBe(priceCake({...DEFAULT_CAKE, delivery:"pickup"}, DEFAULT_SNAPSHOT).total);
    expect(review.totalPaise).toBe(server.total);
    expect(review.subtotalPaise).toBe(server.subtotal);
    expect(review.gstPaise).toBe(server.gst);
  });

  it("multiplies by the quantity the basket asked for", () => {
    const review = reviewBasket(one(DEFAULT_CAKE, 3), DEFAULT_SNAPSHOT);
    expect(review.ok && review.totalPaise).toBe(
      priceCake({...DEFAULT_CAKE,delivery:"pickup"}, DEFAULT_SNAPSHOT).total * 3 + Math.round(DEFAULT_SNAPSHOT.price.deliveryFee.standard * (1 + DEFAULT_SNAPSHOT.settings.gstRate)),
    );
  });

  it("ignores a quote that agrees, and refuses one that does not", () => {
    const honest = priceCake({...DEFAULT_CAKE,delivery:"pickup"}, DEFAULT_SNAPSHOT).total;

    expect(reviewBasket(one(DEFAULT_CAKE, 1, honest), DEFAULT_SNAPSHOT).ok).toBe(true);

    // The number a tampered client would like to pay.
    const cheeky = reviewBasket(one(DEFAULT_CAKE, 1, 100), DEFAULT_SNAPSHOT);
    expect(cheeky.ok).toBe(false);
    if (cheeky.ok) return;
    expect(cheeky.problem.code).toBe("price_changed");
    expect(cheeky.problem.currentPaise).toBe(honest);
    // And the claim never becomes the price: there is no quote to charge.
    expect(cheeky.problem.quotedPaise).toBe(100);
  });

  it("stops a basket the bakery repriced under, rather than charging the new number", () => {
    const quoted = priceCake({...DEFAULT_CAKE,delivery:"pickup"}, DEFAULT_SNAPSHOT).total;

    // The owner puts american buttercream up while the cart sits in a browser.
    // The customer is still looking at the old total.
    const dearer = reprice("frosting", "american-buttercream", 40_000);
    const review = reviewBasket(one(DEFAULT_CAKE, 1, quoted), dearer);

    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("price_changed");
    expect(review.problem.status).toBe(409);
    expect(review.problem.currentPaise ?? 0).toBeGreaterThan(quoted);
    expect(review.problem.message).toMatch(/review your order/i);
  });

  it("carries the frozen lines the order will store", () => {
    const review = reviewBasket(
      one(cake({ message: "Happy Birthday Amma" }), 1),
      DEFAULT_SNAPSHOT,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    const { price } = review.quotes[0];
    expect(price.lines.length).toBeGreaterThan(1);
    expect(price.lines.some((l) => l.label === "Message piping")).toBe(true);
    // Every line is an integer number of paise, and they add up to the subtotal.
    for (const l of price.lines) expect(Number.isInteger(l.amount)).toBe(true);
    expect(price.lines.reduce((n, l) => n + l.amount, 0)).toBe(price.subtotal);
    expect(price.subtotal + price.gst).toBe(price.total);
    expect(price.payable).toBe(price.total);
  });
});

/* ------------------------------------------------------------ availability */

describe("options the bakery has withdrawn", () => {
  it("finds the withdrawn option on a cake that names it", () => {
    const found = withdrawnOptions(cake({ sponge: "red-velvet" }), withdraw("sponge", "red-velvet"));

    expect(found).toHaveLength(1);
    expect(found[0].category).toBe("sponge");
    expect(found[0].value).toBe("red-velvet");
    // Named in the bakery's own words, so a refusal reads as English.
    expect(found[0].name).toBeTruthy();
  });

  it("looks at toppings and placements too", () => {
    const found = withdrawnOptions(
      cake({ toppings: [{ kind: "gold-leaf", placement: "crown", density: 2 }] }),
      withdraw("topping", "gold-leaf"),
    );
    expect(found.map((o) => o.value)).toEqual(["gold-leaf"]);
  });

  it("says nothing about a cake made entirely of what is on offer", () => {
    expect(withdrawnOptions(DEFAULT_CAKE, DEFAULT_SNAPSHOT)).toEqual([]);
  });

  it("refuses the order rather than quietly baking it", () => {
    const review = reviewBasket(one(cake({ filling: "nutella" }), 1), withdraw("filling", "nutella"));

    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("option_unavailable");
    expect(review.problem.status).toBe(409);
    expect(review.problem.options?.[0].value).toBe("nutella");
  });

  /*
   * §22, and the distinction the whole feature turns on. Withdrawing an option
   * stops the next sale; it must not reach backwards into an order that already
   * names it. The proof is that the catalogue still prices the withdrawn cake —
   * which is what the docket, the tracking page and the admin's detail all do
   * when they read an old order back.
   */
  it("still prices a cake that was ordered before the option went", () => {
    const gone = withdraw("sponge", "red-velvet");
    const old = cake({ sponge: "red-velvet" });

    expect(priceCake(old, gone).total).toBe(priceCake(old, DEFAULT_SNAPSHOT).total);
    expect(priceCake(old, gone).lines.some((l) => /red velvet/i.test(l.label))).toBe(true);
  });

  it("does not refuse an order over a gap in the catalogue", () => {
    // A row missing entirely is a catalogue problem, not a withdrawal, and
    // failing somebody's order over it is the wrong direction to fail in.
    const sparse = snapshotFrom(
      DEFAULT_ROWS.filter((r) => !(r.category === "sponge" && r.value === "vanilla")),
      DEFAULT_SETTINGS,
    );
    expect(withdrawnOptions(cake({ sponge: "vanilla" }), sparse)).toEqual([]);
  });
});

/* --------------------------------------------------------------- delivery */

describe("delivery", () => {
  it("takes a slot the zone can actually serve", () => {
    const review = reviewBasket(
      one(cake({ delivery: "standard", pincode: "500081" }), 1),
      DEFAULT_SNAPSHOT,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.quotes[0].slot.available).toBe(true);
    // The lead time frozen onto the order includes the zone's rider time.
    expect(review.quotes[0].slot.effectiveLeadHours).toBeGreaterThan(0);
  });

  it("refuses a pincode the bakery does not reach", () => {
    const review = reviewBasket(
      one(cake({ delivery: "standard", pincode: "560001" }), 1),
      DEFAULT_SNAPSHOT,
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("delivery_unavailable");
    expect(review.problem.message).toMatch(/pincode/i);
  });

  it("refuses a slot that is not offered where the cake is going", () => {
    /* A zone that takes standard and nothing else — the far edge of the map,
       where the rider cannot make an express window. */
    const narrow: CatalogSnapshot = {
      ...DEFAULT_SNAPSHOT,
      zones: [
        {
          id: "z",
          name: "Far edge",
          pincodeFrom: 500_000,
          pincodeTo: 500_999,
          extraHours: 6,
          slots: ["standard"],
        },
      ],
    };

    const review = reviewBasket(
      one(cake({ delivery: "express-4hr", pincode: "500081" }), 1),
      narrow,
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("delivery_unavailable");
  });

  it("refuses delivery without a pincode at checkout", () => {
    const result = reviewBasket([{config: {...DEFAULT_CAKE, pincode: undefined}, qty:1}], DEFAULT_SNAPSHOT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.code).toBe("delivery_unavailable");
  });
});

/* ---------------------------------------------------------- other refusals */

describe("rules and minimums", () => {
  it("refuses a cake the kitchen cannot build", () => {
    // Whipped cream cannot hold two tiers — lib/rules, unchanged.
    const review = reviewBasket(
      one(cake({ frosting: "whipped-cream", tiers: 2, size: "2kg" }), 1),
      DEFAULT_SNAPSHOT,
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("not_buildable");
    expect(review.problem.status).toBe(422);
    expect(review.problem.violations?.some((v) => v.severity === "block")).toBe(true);
  });

  it("enforces the minimum the bakery set, and is inert when it has not", () => {
    expect(DEFAULT_SNAPSHOT.settings.minOrderPaise).toBe(0);
    expect(reviewBasket(one(DEFAULT_CAKE, 1), DEFAULT_SNAPSHOT).ok).toBe(true);

    const floor: CatalogSnapshot = {
      ...DEFAULT_SNAPSHOT,
      settings: { ...DEFAULT_SNAPSHOT.settings, minOrderPaise: 500_000 },
    };
    const review = reviewBasket(one(DEFAULT_CAKE, 1), floor);
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("below_minimum");

    // Measured over the basket, so four small cakes clear a floor one does not.
    expect(reviewBasket(one(DEFAULT_CAKE, 4), floor).ok).toBe(true);
  });

  it("names which cake in the basket was the problem", () => {
    const review = reviewBasket(
      [
        { config: cake(), qty: 1 },
        { config: cake({ coverage: "naked", hasDrip: true }), qty: 1 },
      ],
      DEFAULT_SNAPSHOT,
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.index).toBe(1);
  });

  it("never puts an enum value or a field path in front of a customer", () => {
    const reviews = [
      reviewBasket(one(cake({ filling: "nutella" }), 1), withdraw("filling", "nutella")),
      reviewBasket(
        one(cake({ frosting: "whipped-cream", tiers: 2, size: "2kg" }), 1),
        DEFAULT_SNAPSHOT,
      ),
      reviewBasket(one(cake({ pincode: "560001" }), 1), DEFAULT_SNAPSHOT),
      reviewBasket(one(DEFAULT_CAKE, 1, 1), DEFAULT_SNAPSHOT),
    ];

    for (const r of reviews) {
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.problem.message).not.toMatch(/prisma|undefined|\bnull\b|paise|\bat \//i);
      expect(r.problem.message.length).toBeGreaterThan(10);
    }
  });
});

/* ------------------------------------------------------------- references */

describe("the reference a checkout attempt produces", () => {
  it("looks exactly like every other order reference", async () => {
    const ref = await refForAttempt("f47ac10b-58cc-4372-a567-0e02b2c3d479", 0, 0);
    expect(ref).toMatch(/^MC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("is the same every time the same attempt is sent — which is the whole point", async () => {
    const key = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    expect(await refForAttempt(key, 0, 0)).toBe(await refForAttempt(key, 0, 0));
    expect(await refForAttempt(key, 2, 1)).toBe(await refForAttempt(key, 2, 1));
  });

  it("differs by key, by position in the basket, and by attempt", async () => {
    const refs = await Promise.all([
      refForAttempt("key-one-aaaaaaaa", 0, 0),
      refForAttempt("key-two-bbbbbbbb", 0, 0),
      refForAttempt("key-one-aaaaaaaa", 1, 0),
      refForAttempt("key-one-aaaaaaaa", 0, 1),
    ]);

    expect(new Set(refs).size).toBe(4);
  });

  it("spreads over the alphabet rather than clustering", async () => {
    const refs = await Promise.all(
      Array.from({ length: 200 }, (_, i) => refForAttempt(`key-${i}-padding`, 0, 0)),
    );
    // 200 distinct keys, 200 distinct references: no accidental truncation to a
    // handful of values, which is how a derived reference would go wrong.
    expect(new Set(refs).size).toBe(200);
  });
});
