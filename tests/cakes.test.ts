import { describe, expect, it } from "vitest";
import type { CakeCategory } from "@prisma/client";
import {
  CAKE_CATEGORIES, categoryById, categoryBySlug, cheapestVariant, configForVariant,
  DEFAULT_CHOICES, eggTypesOffered, findVariant, fromPricePaise, hasBothEggTypes,
  hasEggless, isBuyable, sellable, sizeName, sizesOffered, SLUG, slugify, variantLabel,
  type CakeProductView, type CakeVariantView,
} from "@/lib/cakes";
import { SIZES } from "@/lib/catalog";
import { DEFAULT_ROWS, DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, snapshotFrom } from "@/lib/catalogDefaults";
import type { CatalogRow, CatalogSnapshot } from "@/lib/catalogSnapshot";
import { allergenLineForOffer } from "@/lib/allergens";
import { lineId } from "@/lib/cart";
import { reviewBasket, type BasketItem } from "@/lib/checkout";
import { priceProduct } from "@/lib/pricing";
import { PRESETS } from "@/lib/presets";
import { DEFAULT_CAKE } from "@/lib/schema";
import { categoryForConfig } from "@/lib/shop";
import { productionSpecFromConfig } from "@/lib/productionSpec";

/**
 * Sellable cakes: what they cost, who may sell them, and what an order keeps.
 *
 * Everything here runs without a database. The rules that decide money are in
 * lib/pricing and lib/checkout, both of which take their inputs as arguments
 * precisely so they can be exercised like this — a product is an object, a
 * catalogue is built in memory from the shipped defaults, and "the bakery put
 * the price up" is one line of fixture rather than a migration.
 *
 * The two things NOT tested here, and where they are instead: `requireAdmin` on
 * every write in app/admin/cakes/actions (tests/auth covers `allows` and the
 * role ladder itself), and the actual SQL of the migration, which is checked by
 * applying it to a scratch database rather than by a unit test.
 */

/** One buyable version. Cheap to spell, because most tests want several. */
const variant = (patch: Partial<CakeVariantView> = {}): CakeVariantView => ({
  id: "var_1",
  sizeBand: "1.5kg",
  eggType: "eggless",
  pricePaise: 79900,
  isAvailable: true,
  ...patch,
});

/** A cake the shop sells, as the database would hand it over. */
const product = (patch: Partial<CakeProductView> = {}): CakeProductView => ({
  id: "cake_1",
  slug: "chocolate-truffle",
  name: "Chocolate Truffle",
  description: "Belgian sponge, dark ganache, truffles on top.",
  category: "chocolate",
  variants: [variant()],
  imageUrl: "/presets/chocolate-truffle.webp",
  imageAlt: null,
  gallery: [],
  config: DEFAULT_CAKE,
  productionSpec: productionSpecFromConfig(DEFAULT_CAKE),
  isAvailable: true,
  isFeatured: false,
  sortOrder: 0,
  updatedAt: 0,
  ...patch,
});

/** A cake sold in four sizes and both sponges — the §5 example, priced. */
const fourSizes = (patch: Partial<CakeProductView> = {}): CakeProductView =>
  product({
    slug: "pineapple-delight",
    name: "Pineapple Delight",
    variants: [
      variant({ id: "v_05_egg", sizeBand: "0.5kg", eggType: "egg", pricePaise: 149900 }),
      variant({ id: "v_05_no", sizeBand: "0.5kg", eggType: "eggless", pricePaise: 159900 }),
      variant({ id: "v_1_no", sizeBand: "1kg", eggType: "eggless", pricePaise: 209900 }),
      variant({ id: "v_15_no", sizeBand: "1.5kg", eggType: "eggless", pricePaise: 270598 }),
      variant({ id: "v_2_no", sizeBand: "2kg", eggType: "eggless", pricePaise: 349900 }),
    ],
    ...patch,
  });

/** What the cake itself costs, as `priceProduct` wants it. */
const priced = (p: CakeProductView, v: CakeVariantView) => ({
  name: p.name,
  pricePaise: v.pricePaise,
});

const shelf = (...items: CakeProductView[]) => new Map(items.map((c) => [c.slug, c]));

/** The shipped catalogue with some rows edited, as an admin would edit them. */
function catalogWith(edit: (row: CatalogRow) => CatalogRow): CatalogSnapshot {
  return snapshotFrom(DEFAULT_ROWS.map(edit), DEFAULT_SETTINGS);
}

/* ────────────────────────────────────────────────────────────── categories */

describe("categories", () => {
  it("covers every member of the Prisma enum", () => {
    /* `categoryById` returns non-null by construction. If a sixth member is
       ever added to CakeCategory without a line in CAKE_CATEGORIES, this is
       where it is found rather than as an undefined on a customer's page. */
    const ids: CakeCategory[] = ["chocolate", "fruit", "cheesecake", "nut_caramel", "classic"];
    for (const id of ids) expect(categoryById(id)?.name).toBeTruthy();
    expect(CAKE_CATEGORIES).toHaveLength(ids.length);
  });

  it("keeps the URL slugs the old storefront used", () => {
    /* Somebody bookmarked /shop?category=nut-caramel before this phase. */
    for (const slug of ["chocolate", "fruit", "cheesecake", "nut-caramel", "classic"]) {
      expect(categoryBySlug(slug)).toBeDefined();
    }
  });

  it("files every shipped preset into exactly one family", () => {
    for (const p of PRESETS) {
      const id = categoryForConfig(p.config);
      expect(categoryById(id)).toBeDefined();
    }
  });
});

/* ──────────────────────────────────────────────────────────────── the slug */

describe("slugify", () => {
  it("turns a cake's name into its address", () => {
    expect(slugify("Chocolate Truffle")).toBe("chocolate-truffle");
    expect(slugify("Lotus Biscoff  ")).toBe("lotus-biscoff");
    expect(slugify("Red Velvet & Cream")).toBe("red-velvet-cream");
  });

  it("never produces something the router would choke on", () => {
    for (const raw of ["Chocolate Truffle", "  --Hello--  ", "Café Crème", "2kg Cake"]) {
      const s = slugify(raw);
      expect(SLUG.test(s)).toBe(true);
    }
  });

  it("gives back nothing for a name with nothing in it", () => {
    /* The form refuses that rather than inventing "cake-1". */
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});

/* ────────────────────────────────────────────────────────── rupees → paise */

describe("price entry", () => {
  /*
   * `RupeeAmount` lives in a "use server" module and cannot be imported into a
   * test without pulling next/headers in with it, so the arithmetic it performs
   * is asserted here directly. It is one expression — `Math.round(Number(s) *
   * 100)` — and what matters is that it is exact for the values an owner types.
   */
  const toPaise = (s: string) => Math.round(Number(s) * 100);

  it("stores ₹799 as 79900 paise", () => {
    expect(toPaise("799")).toBe(79900);
  });

  it("handles the two-decimal cases without float drift", () => {
    expect(toPaise("849.50")).toBe(84950);
    expect(toPaise("1099.99")).toBe(109999);
    /* 10.10 * 100 is 1009.9999999999999 in IEEE 754. Rounding is what makes it
       1010 rather than 1009, which is the entire reason money is not a float. */
    expect(toPaise("10.10")).toBe(1010);
  });

  it("never yields a fractional paise", () => {
    for (const s of ["1", "1.1", "1.11", "999999.99"]) {
      expect(Number.isInteger(toPaise(s))).toBe(true);
    }
  });
});

/* ─────────────────────────────────────────────────────────────── the price */

describe("priceProduct", () => {
  it("charges what the bakery typed for the chosen version, plus GST", () => {
    const p = priceProduct(
      { name: "Chocolate Truffle", pricePaise: 79900 },
      { delivery: "pickup" },
      DEFAULT_SNAPSHOT,
    );
    /* Pickup is free in the shipped defaults, so the subtotal is the cake. */
    expect(p.subtotal).toBe(79900);
    expect(p.gst).toBe(Math.round(79900 * DEFAULT_SNAPSHOT.settings.gstRate));
    expect(p.total).toBe(p.subtotal + p.gst);
  });

  it("does not move when a filling is repriced", () => {
    /* The whole point of the product table. Ganache goes up 400% and a shop
       cake costs exactly what the owner set. */
    const dearer = catalogWith((r) =>
      r.category === "frosting" && r.value === "dark-ganache"
        ? { ...r, priceInputPaise: r.priceInputPaise * 5 }
        : r,
    );
    const cake = { name: "Chocolate Truffle", pricePaise: 79900 };
    const before = priceProduct(cake, { delivery: "pickup" }, DEFAULT_SNAPSHOT);
    const after = priceProduct(cake, { delivery: "pickup" }, dearer);
    expect(after.total).toBe(before.total);
  });

  it("leaves delivery out of per-cake pricing so it can be charged once per order", () => {
    const withFee = catalogWith((r) =>
      r.category === "delivery" && r.value === "express-4hr"
        ? { ...r, priceInputPaise: 25000 }
        : r,
    );
    const p = priceProduct(
      { name: "Chocolate Truffle", pricePaise: 79900 },
      { delivery: "express-4hr" },
      withFee,
    );
    expect(p.lines.some((l) => l.kind === "delivery")).toBe(false);
    expect(p.subtotal).toBe(79900);
  });

  it("charges piping only when there is a message", () => {
    const cake = { name: "Chocolate Truffle", pricePaise: 79900 };
    const plain = priceProduct(cake, { delivery: "pickup" }, DEFAULT_SNAPSHOT);
    const piped = priceProduct(
      cake,
      { delivery: "pickup", message: "Happy Birthday" },
      DEFAULT_SNAPSHOT,
    );
    expect(piped.subtotal - plain.subtotal).toBe(DEFAULT_SNAPSHOT.settings.messagePipingPaise);
    /* Whitespace is not a message. */
    const blank = priceProduct(cake, { delivery: "pickup", message: "   " }, DEFAULT_SNAPSHOT);
    expect(blank.subtotal).toBe(plain.subtotal);
  });

  it("keeps every figure an integer number of paise", () => {
    const p = priceProduct(
      { name: "Chocolate Truffle", pricePaise: 84950 },
      { delivery: "pickup" },
      DEFAULT_SNAPSHOT,
    );
    for (const n of [p.subtotal, p.gst, p.total, p.payable, ...p.lines.map((l) => l.amount)]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});

/* ──────────────────────────────────────────────────────────────── variants */

describe("what a cake offers", () => {
  it("lists its sizes by weight and not alphabetically", () => {
    /* "1.5kg" sorts before "1kg" as a string and after it as a cake. */
    expect(sizesOffered(fourSizes())).toEqual(["0.5kg", "1kg", "1.5kg", "2kg"]);
  });

  it("scopes the sponge question to the size already chosen", () => {
    const cake = fourSizes();
    /* 0.5 kg is sold both ways; every larger size is eggless only. §6. */
    expect(eggTypesOffered(cake, "0.5kg")).toEqual(["egg", "eggless"]);
    expect(eggTypesOffered(cake, "2kg")).toEqual(["eggless"]);
  });

  it("quotes from the cheapest version on sale", () => {
    expect(fromPricePaise(fourSizes())).toBe(149900);
    expect(cheapestVariant(fourSizes())?.id).toBe("v_05_egg");
  });

  it("ignores a withdrawn version entirely", () => {
    const cake = fourSizes({
      variants: [
        variant({ id: "cheap_but_off", sizeBand: "0.5kg", eggType: "egg", pricePaise: 10000, isAvailable: false }),
        variant({ id: "on", sizeBand: "1kg", eggType: "eggless", pricePaise: 209900 }),
      ],
    });
    expect(fromPricePaise(cake)).toBe(209900);
    expect(sizesOffered(cake)).toEqual(["1kg"]);
    expect(findVariant(cake, "0.5kg", "egg")).toBeUndefined();
  });

  it("treats a withdrawn cake as having nothing on sale", () => {
    const cake = fourSizes({ isAvailable: false });
    expect(sellable(cake)).toEqual([]);
    expect(isBuyable(cake)).toBe(false);
    expect(fromPricePaise(cake)).toBeNull();
  });

  it("answers the card's two questions", () => {
    /* §7: the badge is gone, and this is what may replace it — only where the
       bakery has actually configured both. */
    expect(hasBothEggTypes(fourSizes())).toBe(true);
    expect(hasBothEggTypes(product())).toBe(false);
    /* The shop's eggless chip. §29 keeps the filter; the predicate changed. */
    expect(hasEggless(product())).toBe(true);
    expect(hasEggless(product({ variants: [variant({ eggType: "egg" })] }))).toBe(false);
  });

  it("names a version the way every screen prints it", () => {
    expect(variantLabel({ sizeBand: "1.5kg", eggType: "eggless" })).toBe("1.5 kg · Eggless");
    expect(variantLabel({ sizeBand: "2kg", eggType: "egg" })).toBe("2 kg · With egg");
  });
});

/* ───────────────────────────────────────────────── the cart's line identity */

describe("cart line identity", () => {
  const choices = { delivery: "standard" } as const;

  it("keeps two sizes of one cake apart", () => {
    /* §9, and the failure it prevents: without the variant in the key these
       two collapse into one line of two, charged at the first one's price. */
    expect(lineId("pineapple-delight", "v_1_no", choices)).not.toBe(
      lineId("pineapple-delight", "v_15_no", choices),
    );
  });

  it("keeps egg and eggless of one size apart", () => {
    expect(lineId("pineapple-delight", "v_05_egg", choices)).not.toBe(
      lineId("pineapple-delight", "v_05_no", choices),
    );
  });

  it("merges the identical version ordered the same way", () => {
    expect(lineId("pineapple-delight", "v_1_no", choices)).toBe(
      lineId("pineapple-delight", "v_1_no", { delivery: "standard" }),
    );
  });

  it("still separates the same version with a different message", () => {
    expect(lineId("pineapple-delight", "v_1_no", choices)).not.toBe(
      lineId("pineapple-delight", "v_1_no", { ...choices, message: "Hi" }),
    );
  });
});

/* ────────────────────────────────────────────────────────────── the config */

describe("configForVariant", () => {
  it("uses the cake's own recipe when it has one", () => {
    const preset = PRESETS[0];
    const c = configForVariant(
      { config: preset.config },
      { sizeBand: preset.config.size, eggType: preset.config.eggless ? "eggless" : "egg" },
      DEFAULT_CHOICES,
    );
    expect(c?.sponge).toBe(preset.config.sponge);
    expect(c?.frosting).toBe(preset.config.frosting);
    expect(c?.toppings).toEqual(preset.config.toppings);
  });

  it("never fabricates a recipe for a cake an owner added", () => {
    const c = configForVariant(
      { config: null },
      { sizeBand: "2kg", eggType: "eggless" },
      DEFAULT_CHOICES,
    );
    expect(c).toBeNull();
  });

  it("lets the chosen version win over the stored recipe", () => {
    /* The seeded recipe was rendered at 1.5 kg and eggless. A customer buying
       the 3 kg with egg has to get a 3 kg cake with egg in it baked. */
    const c = configForVariant(
      { config: { ...DEFAULT_CAKE, size: "0.5kg", eggless: true } },
      { sizeBand: "3kg", eggType: "egg" },
      DEFAULT_CHOICES,
    );
    expect(c?.size).toBe("3kg");
    expect(c?.eggless).toBe(false);
  });

  it("drops an empty message rather than writing one", () => {
    /* `message: ""` would print a blank plaque on the docket. */
    const v = { sizeBand: "1kg", eggType: "eggless" } as const;
    const c = configForVariant({ config: DEFAULT_CAKE }, v, { delivery: "standard", message: "   " });
    expect(c && "message" in c).toBe(false);
    const piped = configForVariant({ config: DEFAULT_CAKE }, v, { delivery: "standard", message: " Hi " });
    expect(piped?.message).toBe("Hi");
  });
});

/* ──────────────────────────────────────────────────────── size and display */

describe("size", () => {
  it("reads its label from the one list that has it", () => {
    for (const s of SIZES) expect(sizeName(s.value)).toBe(s.name);
  });
});

/* ───────────────────────────────────────────────── the till, for shop cakes */

const line = (patch: Partial<BasketItem> = {}): BasketItem => ({
  cakeSlug: "chocolate-truffle",
  variantId: "var_1",
  choices: { delivery: "standard", pincode: "500081" },
  qty: 1,
  ...patch,
});

describe("reviewBasket, for a cake from the shop", () => {
  it("prices from the variant row and not from anything the browser sent", () => {
    const cake = product({ variants: [variant({ pricePaise: 50000 })] });
    const review = reviewBasket([line()], DEFAULT_SNAPSHOT, shelf(cake));
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.quotes[0].price.lines[0].amount).toBe(50000);
  });

  it("names the version on the line the order freezes", () => {
    /* What lands on the OrderItem row and therefore on the docket, the
       customer's summary and the admin's order page. §21. */
    const review = reviewBasket([line()], DEFAULT_SNAPSHOT, shelf(product()));
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.quotes[0].price.lines[0]).toMatchObject({
      label: "Chocolate Truffle · 1.5 kg · Eggless",
      kind: "base",
    });
  });

  it("writes the chosen size and sponge into the config the kitchen bakes from", () => {
    const cake = fourSizes();
    const review = reviewBasket(
      [line({ cakeSlug: "pineapple-delight", variantId: "v_05_egg" })],
      DEFAULT_SNAPSHOT,
      shelf(cake),
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.quotes[0].config?.size).toBe("0.5kg");
    expect(review.quotes[0].config?.eggless).toBe(false);
  });

  it("charges each version its own price", () => {
    const cake = fourSizes();
    const at = (variantId: string) => {
      const r = reviewBasket(
        [line({ cakeSlug: "pineapple-delight", variantId })],
        DEFAULT_SNAPSHOT,
        shelf(cake),
      );
      return r.ok ? r.quotes[0].price.lines[0].amount : null;
    };
    expect(at("v_05_egg")).toBe(149900);
    expect(at("v_15_no")).toBe(270598);
    expect(at("v_2_no")).toBe(349900);
  });

  it("freezes the cake's identity onto the quote the order is written from", () => {
    const cake = product({ id: "cake_9", name: "Chocolate Truffle", imageUrl: "/x.webp" });
    const review = reviewBasket([line()], DEFAULT_SNAPSHOT, shelf(cake));
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    /* The plain name, not the variant label — `Order.cakeName` has to stay the
       cake's own name for `cakeDisplayName` and the vendor's ticket. */
    expect(review.quotes[0].product?.name).toBe("Chocolate Truffle");
    expect(review.quotes[0].product?.id).toBe("cake_9");
    expect(review.quotes[0].product?.variant.sizeBand).toBe("1.5kg");
  });

  it("refuses a cake that is not on the shelf", () => {
    const review = reviewBasket([line()], DEFAULT_SNAPSHOT, shelf());
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("cake_unavailable");
    expect(review.problem.status).toBe(409);
  });

  it("refuses a cake that has been withdrawn", () => {
    const review = reviewBasket(
      [line()],
      DEFAULT_SNAPSHOT,
      shelf(product({ isAvailable: false })),
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("cake_unavailable");
  });

  it("refuses a version withdrawn while the basket sat in a browser", () => {
    /* §30. The cake is still on sale; the 1.5 kg is not. */
    const review = reviewBasket(
      [line()],
      DEFAULT_SNAPSHOT,
      shelf(product({ variants: [variant({ isAvailable: false })] })),
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("cake_unavailable");
    expect(review.problem.status).toBe(409);
    /* Named as the size and not as the cake, so the fix is obvious. */
    expect(review.problem.message).toContain("size or sponge");
  });

  it("refuses a version id that has been deleted", () => {
    const review = reviewBasket(
      [line({ variantId: "var_gone" })],
      DEFAULT_SNAPSHOT,
      shelf(product()),
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("cake_unavailable");
  });

  it("refuses a variant borrowed from a different, cheaper cake", () => {
    /*
     * §31's "customers must not be able to change variant IDs to manipulate
     * prices", asserted rather than promised. The lookup is scoped to the cake
     * the slug names, so a real id belonging to a 0.5 kg elsewhere is simply
     * not in this cake's list — there is no cross-product table to fool.
     */
    const cheap = fourSizes();
    const dear = product({ slug: "chocolate-truffle", variants: [variant({ pricePaise: 500000 })] });
    const review = reviewBasket(
      [line({ cakeSlug: "chocolate-truffle", variantId: "v_05_egg" })],
      DEFAULT_SNAPSHOT,
      shelf(dear, cheap),
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("cake_unavailable");
  });

  it("stops the order when the price has moved since the customer was quoted", () => {
    const cake = product();
    const quoted = priceProduct(
      priced(cake, cake.variants[0]),
      { delivery: "standard" },
      DEFAULT_SNAPSHOT,
    ).total;
    /* The bakery reprices that exact version while the basket sits in a
       browser. The id is unchanged, which is the case a naive check misses. */
    const dearer = shelf(product({ variants: [variant({ pricePaise: 89900 })] }));
    const review = reviewBasket([line({ quotedTotalPaise: quoted })], DEFAULT_SNAPSHOT, dearer);
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("price_changed");
    expect(review.problem.quotedPaise).toBe(quoted);
    expect(review.problem.currentPaise).toBeGreaterThan(quoted);
  });

  it("never lets the quoted number become the price", () => {
    /* A hand-written POST claiming the cake costs ₹1. It is compared, and the
       disagreement stops the order — it is never adopted. */
    const review = reviewBasket(
      [line({ quotedTotalPaise: 100 })],
      DEFAULT_SNAPSHOT,
      shelf(product()),
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("price_changed");
    expect(review.problem.currentPaise).not.toBe(100);
  });

  it("refuses a delivery slot the bakery has withdrawn", () => {
    const withdrawn = catalogWith((r) =>
      r.category === "delivery" && r.value === "midnight" ? { ...r, isAvailable: false } : r,
    );
    const review = reviewBasket(
      [line({ choices: { delivery: "midnight" } })],
      withdrawn,
      shelf(product()),
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.problem.code).toBe("option_unavailable");
  });

  it("does not refuse a shop cake because one of its ingredients was withdrawn", () => {
    /*
     * A shop cake's availability is one column the owner sets. Withdrawing
     * pistachio cream at /admin/catalog must not silently kill three products
     * with a message that names a filling — see the note in `reviewBasket`.
     */
    const cake = product({ config: { ...DEFAULT_CAKE, filling: "pistachio-cream" } });
    const withdrawn = catalogWith((r) =>
      r.category === "filling" && r.value === "pistachio-cream"
        ? { ...r, isAvailable: false }
        : r,
    );
    const review = reviewBasket([line()], withdrawn, shelf(cake));
    expect(review.ok).toBe(true);
  });

  it("multiplies the basket total by the quantity", () => {
    const cake = product();
    const each = priceProduct(
      priced(cake, cake.variants[0]),
      { delivery: "standard" },
      DEFAULT_SNAPSHOT,
    ).total;
    const review = reviewBasket([line({ qty: 3 })], DEFAULT_SNAPSHOT, shelf(cake));
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.deliveryFeePaise).toBe(DEFAULT_SNAPSHOT.price.deliveryFee.standard);
    expect(review.totalPaise).toBe(each * 3 + Math.round(DEFAULT_SNAPSHOT.price.deliveryFee.standard * (1 + DEFAULT_SNAPSHOT.settings.gstRate)));
  });

  it("prices two versions of one cake as two separate lines", () => {
    /* The basket half of §9: two lines, two prices, one request. */
    const cake = fourSizes();
    const review = reviewBasket(
      [
        line({ cakeSlug: "pineapple-delight", variantId: "v_05_egg" }),
        line({ cakeSlug: "pineapple-delight", variantId: "v_2_no" }),
      ],
      DEFAULT_SNAPSHOT,
      shelf(cake),
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.quotes).toHaveLength(2);
    expect(review.quotes[0].price.lines[0].amount).toBe(149900);
    expect(review.quotes[1].price.lines[0].amount).toBe(349900);
  });

  it("leaves the builder's own path alone", () => {
    /* A cake with a config and no slug is still priced from its parts, with no
       product frozen onto it. Nothing about the 3D builder changed. */
    const review = reviewBasket(
      [{ config: {...DEFAULT_CAKE, pincode:"500081"}, qty: 1 }],
      DEFAULT_SNAPSHOT,
      shelf(product()),
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.quotes[0].product).toBeUndefined();
    expect(review.quotes[0].price.lines[0].kind).toBe("base");
    expect(review.quotes[0].price.lines[0].label).toContain("base");
  });
});

/* ────────────────────────────────────────────────────── old orders, frozen */

describe("an order already placed", () => {
  it("keeps the price it was quoted when the cake is repriced", () => {
    /*
     * The property §20 is about, asserted as arithmetic rather than as a
     * promise. An order's total is `price.total` computed at the moment it is
     * written; nothing reads the variant again afterwards, and there is no code
     * path from `saveCake` to the Order table at all.
     */
    const cake = product();
    const atOrderTime = reviewBasket([line()], DEFAULT_SNAPSHOT, shelf(cake));
    expect(atOrderTime.ok).toBe(true);
    if (!atOrderTime.ok) return;
    const frozen = atOrderTime.quotes[0].price;

    /* The admin puts that version up to ₹899. */
    const after = priceProduct(
      { name: cake.name, pricePaise: 89900 },
      { delivery: "standard" },
      DEFAULT_SNAPSHOT,
    );

    /* The frozen breakdown is a value, not a view of the row. */
    expect(frozen.lines[0].amount).toBe(79900);
    expect(after.lines[0].amount).toBe(89900);
    expect(frozen.total).not.toBe(after.total);
  });

  it("keeps the size and sponge it was bought at when the variant is deleted", () => {
    /*
     * §20 and §34 together. The order's config carries the variant, so deleting
     * the row it came from cannot reach it — which is why a variant may be
     * deleted outright while a cake may only be withdrawn.
     */
    const review = reviewBasket([line()], DEFAULT_SNAPSHOT, shelf(product()));
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    const frozenConfig = review.quotes[0].config;

    /* The owner clears that cell. The value already taken is unaffected. */
    const stripped = product({ variants: [] });
    expect(frozenConfig?.size).toBe("1.5kg");
    expect(frozenConfig?.eggless).toBe(true);
    expect(sellable(stripped)).toEqual([]);
  });

  it("still names the cake after it has been renamed", () => {
    /* `Order.cakeName` is a copy. The quote carries it; nothing joins back. */
    const review = reviewBasket(
      [line()],
      DEFAULT_SNAPSHOT,
      shelf(product({ name: "Chocolate Truffle" })),
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    const frozenName = review.quotes[0].product?.name;

    /* The owner renames it. The value already taken is unaffected — this is
       the whole reason it is a column rather than a join. */
    const renamed = product({ name: "Death by Chocolate" });
    expect(frozenName).toBe("Chocolate Truffle");
    expect(renamed.name).not.toBe(frozenName);
  });
});

/* ────────────────────────────────────────────────────────────── allergens */

describe("the allergen line on a cake page", () => {
  /* A pineapple sponge: wheat, milk, and egg unless the eggless recipe. */
  const recipe = { ...DEFAULT_CAKE, sponge: "pineapple" as const, eggless: true };

  it("says eggless when that is the only way it is sold", () => {
    expect(allergenLineForOffer(recipe, ["eggless"])).toContain("EGGLESS");
    expect(allergenLineForOffer(recipe, ["eggless"])).not.toContain("Egg");
  });

  it("says it contains egg when that is the only way it is sold", () => {
    /* The stored recipe says eggless and the bakery only sells the egg
       version — the *offer* wins, because that is what can be bought. */
    const line = allergenLineForOffer(recipe, ["egg"]);
    expect(line).toContain("CONTAINS EGG");
    expect(line).toContain("Egg");
  });

  it("never claims eggless for a cake sold both ways", () => {
    /*
     * The bug this function exists for: the stored recipe is eggless, so
     * `allergenLine` printed "EGGLESS" on a page whose picker offers "With
     * egg". An allergen statement that is wrong for half the cakes sold under
     * a name is the one failure worth designing against.
     */
    const line = allergenLineForOffer(recipe, ["egg", "eggless"]);
    expect(line).not.toContain("EGGLESS");
    expect(line).toContain("Egg only in the with-egg version.");
    /* The allergens common to both are still listed. */
    expect(line).toContain("Milk");
    expect(line).toContain("Wheat (gluten)");
  });
});
