import { z } from "zod";
import type { CatalogCategory } from "@prisma/client";
import {
  CakeChoices,
  configForVariant,
  sellable,
  variantLabel,
  type CakeProductView,
  type CakeVariantView,
} from "./cakes";
import { entryFor, type CatalogSnapshot } from "./catalogSnapshot";
import { resolveSlot, type ResolvedSlot } from "./delivery";
import { priceCake, priceProduct, type PriceBreakdown } from "./pricing";
import { validateCake, type RuleViolation } from "./rules";
import { CakeConfig, DeliverySlot } from "./schema";
import { parseProductionSpec } from "./productionSpec";
import { slugFromBytes } from "./share";

/**
 * What a basket has to survive before it becomes orders.
 *
 * ## Why this file exists at all
 *
 * Every rule here was already enforced *somewhere* — the phone regex in
 * app/api/orders and again, copied character for character, in two forms; the
 * quantity clamp in lib/cart and nowhere on the server; the availability flag in
 * the pickers and nowhere at the till. A rule written twice is a rule that is
 * one edit away from being two different rules, and the half that matters is
 * always the server's. So the checks live here, once, and the server is the
 * caller that decides.
 *
 * Pure and isomorphic on purpose: no database, no session, no `next/headers`,
 * no `node:` import. The route handler runs it to accept or refuse an order and
 * the checkout form runs the same functions to stop somebody pressing a button
 * the server is going to turn down. They cannot disagree, because there is only
 * one of each.
 *
 * ## What it deliberately does not do
 *
 * It does not touch money the client sent. `quotedTotalPaise` below is not a
 * price — it is the customer's *claim* about the price they were shown, and the
 * only thing done with it is comparison against a total this module computes
 * from the server's own catalogue. A claim that disagrees stops the order; it
 * never becomes the amount charged. See `reviewBasket`.
 */

/* --------------------------------------------------------------- quantity */

/**
 * Cap per line, and the only quantity rule in the product.
 *
 * It lived in lib/cart.ts, which is `"use client"` — so the server could not
 * read it without pulling zustand into a route handler, and consequently did
 * not enforce it at all. It is here now and lib/cart re-exports it, so the
 * spinner in the basket and the refusal at the till are the same number.
 */
export const MAX_QTY = 5;

/**
 * How many cakes one checkout may carry, across every line.
 *
 * Not a business rule and not presented as one — it is the size limit on a
 * request, so that a hand-written POST cannot ask this handler to open a
 * transaction over ten thousand rows. Four full lines is already more cake than
 * the shop has ever been asked for in one go, and a customer who genuinely
 * wants more is a phone call to the bakery rather than a silent refusal.
 */
export const MAX_CAKES = 20;

/* ------------------------------------------------------------ the customer */

/**
 * Indian mobile numbers, with or without +91 / 0 / 91 in front.
 *
 * The single copy. app/api/orders, app/checkout and app/build/review all had
 * this literal written out, which is three places for one rule and two chances
 * for a form to accept what the server refuses.
 */
export const PHONE = /^(?:\+?91|0)?[6-9]\d{9}$/;

/** Spaces and dashes are how people write a number, not part of it. */
export function normalizePhone(raw: string | undefined | null): string {
  return (raw ?? "").replace(/[\s-]/g, "");
}

/** Trimmed, and bounded so a name cannot be used to write an essay into a row. */
export function normalizeName(raw: string | undefined | null): string {
  return (raw ?? "").trim().slice(0, 80);
}

export function nameOk(raw: string | undefined | null): boolean {
  return normalizeName(raw).length >= 2;
}

export function phoneOk(raw: string | undefined | null): boolean {
  return PHONE.test(normalizePhone(raw));
}

/* ---------------------------------------------------------- the request */

export const CheckoutItem = z
  .object({
    /**
     * The cake this line is, said one of two ways.
     *
     * `cakeSlug` is the shop: a name the server looks up in CakeProduct, whose
     * price, availability and recipe are then read from the row rather than from
     * anything the browser sent. `config` is the 3D builder, which posts an
     * assembly nobody has a row for — the shape app/build/review has always sent
     * and which still works unchanged.
     *
     * Exactly one, enforced by the refinement below. A body carrying both would
     * have two answers to "what is being bought" and no rule about which wins.
     */
    cakeSlug: z.string().max(80).optional(),
    /**
     * Which version of that cake: a `CakeVariant` id.
     *
     * A reference and not a description, for the reason `cakeSlug` is one. The
     * server looks the row up under the cake the slug names and reads the size,
     * the sponge and the price off it — so a body claiming a variant belongs to a
     * cheaper cake finds nothing, and a body claiming a price has nowhere to put
     * one. An id that has been deleted or withdrawn since the basket was filled
     * gets a refusal naming the problem; see `reviewBasket`.
     */
    variantId: z.string().max(60).optional(),
    /** The shop line's own choices. Ignored on a builder line, which has a config. */
    choices: CakeChoices.optional(),
    config: CakeConfig.optional(),
    /*
     * `.int()` is doing more work than it looks. It is what refuses 2.5, and also
     * what refuses Infinity — which is not an integer — while `z.number()` itself
     * refuses NaN. A JSON body cannot literally carry either, but a client that
     * computes a quantity and sends the result can, and this is the boundary.
     */
    qty: z.number().int().min(1).max(MAX_QTY).default(1),
    /**
     * What this cake was quoted at, in paise, as the customer saw it.
     *
     * Advisory in one direction only: it can stop an order, and it can never set
     * a price. See `reviewBasket`, which compares it against the server's own
     * arithmetic and refuses the basket if the catalogue has moved underneath it.
     */
    quotedTotalPaise: z.number().int().nonnegative().optional(),
  })
  .refine((i) => Boolean(i.cakeSlug) !== Boolean(i.config), {
    message: "A line names a cake or carries a configuration, not both.",
  })
  .refine((i) => !i.cakeSlug || i.choices !== undefined, {
    message: "A cake from the shop needs a delivery slot.",
    path: ["choices"],
  })
  .refine((i) => !i.cakeSlug || Boolean(i.variantId), {
    message: "A cake from the shop needs a size and a sponge.",
    path: ["variantId"],
  });

export type BasketItem = z.infer<typeof CheckoutItem>;

export const FulfillmentInput = z
  .object({
    method: z.enum(["delivery", "pickup"]),
    slot: DeliverySlot,
    recipientName: z.string().trim().min(2).max(80),
    contactEmail: z.string().trim().email().max(254).optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        placeId: z.string().max(300),
      })
      .optional(),
    addressLine1: z.string().trim().max(160).optional(),
    addressLine2: z.string().trim().max(160).optional(),
    landmark: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    pincode: z.string().trim().optional(),
    requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requestedWindow: z.string().trim().min(1).max(120),
    deliveryInstructions: z.string().trim().max(500).optional(),
    customerNotes: z.string().trim().max(1_000).optional(),
    occasion: z.string().trim().max(80).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.method === "pickup" && f.slot !== "pickup") {
      ctx.addIssue({
        code: "custom",
        message: "Pickup must use the pickup slot.",
        path: ["slot"],
      });
    }
    if (f.method === "delivery") {
      if (f.slot === "pickup") {
        ctx.addIssue({
          code: "custom",
          message: "Delivery needs a delivery slot.",
          path: ["slot"],
        });
      }
      if (!/^\d{6}$/.test(f.pincode ?? "")) {
        ctx.addIssue({
          code: "custom",
          message: "Delivery needs a six-digit pincode.",
          path: ["pincode"],
        });
      }
      if (
        (f.addressLine1?.length ?? 0) < 3 ||
        (f.city?.length ?? 0) < 2 ||
        (f.state?.length ?? 0) < 2
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Delivery needs a complete address.",
          path: ["addressLine1"],
        });
      }
    }
  });

export const QuoteRequest = z
  .object({
    items: z.array(CheckoutItem).min(1),
    fulfillment: z
      .object({
        method: z.enum(["delivery", "pickup"]),
        slot: DeliverySlot,
        pincode: z.string().trim().optional(),
        requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .superRefine((f, ctx) => {
        if (f.method === "pickup" && f.slot !== "pickup") {
          ctx.addIssue({
            code: "custom",
            message: "Pickup must use the pickup slot.",
            path: ["slot"],
          });
        }
        if (
          f.method === "delivery" &&
          (f.slot === "pickup" || !/^\d{6}$/.test(f.pincode ?? ""))
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Delivery needs a delivery slot and pincode.",
            path: ["pincode"],
          });
        }
      }),
  })
  .refine((r) => r.items.reduce((n, i) => n + i.qty, 0) <= MAX_CAKES, {
    message: `A single order can carry at most ${MAX_CAKES} cakes.`,
    path: ["items"],
  });

export const CheckoutRequest = z
  .object({
    items: z.array(CheckoutItem).min(1),
    customerName: z.string(),
    customerPhone: z.string(),
    quotedOrderTotalPaise: z.number().int().nonnegative().optional(),
    fulfillment: FulfillmentInput,
    /**
     * One checkout attempt, named by the browser that is attempting it.
     *
     * Not a secret and not an authorisation — it is a label that survives a
     * double-click, a refresh and a retry after a timeout, so the server can
     * recognise the second copy of one intention. See `refForAttempt`.
     */
    idempotencyKey: z.string().uuid(),
    designSlug: z.string().max(64).optional(),
  })
  .superRefine((r, ctx) => {
    for (const [index, item] of r.items.entries()) {
      const chosen = item.choices?.delivery ?? item.config?.delivery;
      if (chosen && chosen !== r.fulfillment.slot) {
        ctx.addIssue({
          code: "custom",
          message: "Every cake must use the order's fulfillment slot.",
          path: ["items", index, "choices", "delivery"],
        });
      }
    }
  })
  .refine((r) => r.items.reduce((n, i) => n + i.qty, 0) <= MAX_CAKES, {
    message: `A single order can carry at most ${MAX_CAKES} cakes.`,
    path: ["items"],
  });

export type CheckoutRequest = z.infer<typeof CheckoutRequest>;

/**
 * The one-cake body this route has always taken, read as a basket of one.
 *
 * app/build/review posts `{ config, clientTotal }` and has since long before
 * there was a cart. Rather than keep two shapes alive in the handler, the old
 * one is translated here and everything downstream sees a basket.
 */
export function asBasketBody(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const b = body as Record<string, unknown>;
  if (b.items !== undefined || b.config === undefined) return b;

  const { config, clientTotal, ...rest } = b;
  return {
    ...rest,
    items: [
      {
        config,
        qty: 1,
        ...(typeof clientTotal === "number"
          ? { quotedTotalPaise: clientTotal }
          : {}),
      },
    ],
  };
}

/* ------------------------------------------------------------ availability */

/** Every catalogue option one cake names, category by category. */
function chosenOptions(c: CakeConfig): [CatalogCategory, string][] {
  return [
    ["shape", c.shape],
    ["size", c.size],
    ["sponge", c.sponge],
    ["filling", c.filling],
    ["frosting", c.frosting],
    ["coverage", c.coverage],
    ["finish", c.finish],
    ["delivery", c.delivery],
    ...c.toppings.flatMap(
      (t) =>
        [
          ["topping", t.kind],
          ["placement", t.placement],
        ] as [CatalogCategory, string][],
    ),
  ];
}

export interface WithdrawnOption {
  category: CatalogCategory;
  value: string;
  /** The bakery's own wording, so the refusal names a filling and not an enum. */
  name: string;
}

/**
 * The options on this cake the bakery has withdrawn.
 *
 * The half of `isAvailable` that was never enforced. The pickers have always
 * filtered on it — see `offered` in lib/catalogSnapshot — but a config can
 * reach the server from a cart that has been sitting in a browser for a
 * fortnight, from a shared link, or from curl, and none of those went through a
 * picker. Withdrawing a filling has to mean it cannot be *ordered*, not merely
 * that it is hard to click.
 *
 * **Only new orders.** Nothing in this function is used to read an order back:
 * `entryFor` is deliberately the unfiltered lookup, and the docket, the
 * tracking page and the admin's detail all keep using it, so an order placed
 * last month naming a filling withdrawn this morning still renders, still
 * prices and still prints. That distinction is the whole point — withdrawing an
 * option must not rewrite history, only stop the next sale.
 *
 * A value with no row at all is treated as available rather than withdrawn.
 * `snapshotFrom` backfills every missing option from the shipped defaults so it
 * cannot happen in practice, and refusing somebody's order over a gap in the
 * catalogue would be the wrong direction to fail in.
 */
export function withdrawnOptions(
  c: CakeConfig,
  catalog: CatalogSnapshot,
): WithdrawnOption[] {
  const out: WithdrawnOption[] = [];
  const seen = new Set<string>();

  for (const [category, value] of chosenOptions(c)) {
    const key = `${category}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = entryFor(catalog, category, value);
    if (entry && !entry.isAvailable)
      out.push({ category, value, name: entry.name });
  }

  return out;
}

/* ----------------------------------------------------------- the verdict */

/** One cake, priced and checked against the catalogue as it is right now. */
export interface ItemQuote {
  config: CakeConfig | null;
  qty: number;
  price: PriceBreakdown;
  slot: ResolvedSlot;
  /**
   * The shop cake this was bought from, read from the database by the caller
   * and never from the request. Undefined for a cake built in the 3D builder.
   *
   * What gets frozen onto the order — see `Order.cakeProductId` and the two
   * snapshot columns beside it. The id is a link; the name and the photograph
   * are copies, so that renaming or deleting the cake cannot rewrite or break
   * an order that already exists.
   */
  product?: {
    id: string;
    name: string;
    imageUrl: string | null;
    productionSpec: NonNullable<CakeProductView["productionSpec"]>;
    /** The version bought, for anything that wants it structurally. */
    variant: CakeVariantView;
  };
}

function withoutShipment(price: PriceBreakdown): PriceBreakdown {
  const lines = price.lines.filter((line) => line.kind !== "delivery");
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const gst = Math.round(subtotal * price.gstRate);
  const total = subtotal + gst;
  return { ...price, lines, subtotal, gst, total, payable: total };
}

/**
 * Why a basket was refused, in terms a customer can act on.
 *
 * `status` travels with the reason rather than being decided at the call site,
 * so "the catalogue moved" stays a 409 wherever it is answered from and a
 * caller cannot quietly downgrade a refusal into a 200.
 */
export interface CheckoutProblem {
  code:
    | "not_buildable"
    | "option_unavailable"
    /**
     * The shop cake — or the exact size and sponge asked for — is withdrawn,
     * deleted, or was never on sale.
     *
     * One code for both, because from the basket they are the same fact and the
     * same fix: the line has to change before the order can go through. The
     * *message* distinguishes them, which is the half a customer acts on.
     */
    | "cake_unavailable"
    | "delivery_unavailable"
    | "price_changed"
    | "below_minimum";
  status: 409 | 422;
  /** Plain language. No enum values, no field paths, no exception text. */
  message: string;
  /** Which cake, when the basket has more than one. Zero-based. */
  index?: number;
  violations?: RuleViolation[];
  options?: WithdrawnOption[];
  /** For `price_changed` — what the customer was shown, and what it is now. */
  quotedPaise?: number;
  currentPaise?: number;
}

export type BasketReview =
  | {
      ok: true;
      quotes: ItemQuote[];
      totalPaise: number;
      subtotalPaise: number;
      gstPaise: number;
      productSubtotalPaise: number;
      deliveryFeePaise: number;
    }
  | { ok: false; problem: CheckoutProblem };

/**
 * Everything that has to be true before a basket becomes orders.
 *
 * The order of the checks is the order a customer would want to hear them in:
 * a cake that cannot be built at all, then an option the bakery has stopped
 * offering, then a slot that cannot reach them, then a price that has moved
 * since they were quoted. Each stops at the first failure rather than
 * accumulating a list, because every one of them sends somebody back to the
 * same place — the basket — and four reasons at once is not four times as
 * useful as the first one.
 *
 * ## The price check is the point of this function
 *
 * A cart survives in a browser for weeks and the bakery can reprice a filling
 * in the meantime. The old handler priced against the live catalogue and wrote
 * whatever came out, so somebody could be shown ₹1,299 on the button and be
 * committed to ₹1,499 by pressing it — silently, with the correct number
 * arriving only on the confirmation screen. Comparing the quote the customer
 * was actually shown against today's arithmetic is what turns that into a
 * question they get asked.
 *
 * The comparison is one-directional about trust: `quotedTotalPaise` can refuse
 * an order and can never become one. The money written to the row is
 * `price.total` below, computed here from the catalogue the server is holding.
 */
export function reviewBasket(
  items: readonly BasketItem[],
  catalog: CatalogSnapshot,
  /**
   * The shop cakes this basket names, looked up by the *caller* from the
   * database — `cakesBySlug` in lib/cakeData, or the cakes a page already
   * loaded. Passed in for the reason lib/pricing passes the catalogue in: this
   * module is isomorphic, the checkout form runs it in a browser where the list
   * can be a moment stale, and the route handler runs it on the server where an
   * order is priced for real. A function that looked the cake up for itself
   * would be one refactor away from pricing an order off whatever the client
   * happened to be holding.
   *
   * A slug missing from this map is a cake that is not for sale — withdrawn,
   * deleted, or never real. All three get the same refusal, because from the
   * outside they are the same fact and distinguishing them would tell somebody
   * with a URL which cakes used to exist.
   */
  cakes: ReadonlyMap<string, CakeProductView> = new Map(),
): BasketReview {
  const quotes: ItemQuote[] = [];

  for (const [index, item] of items.entries()) {
    const { qty } = item;

    /*
     * The one place a shop line becomes a real cake, and the whole of §11's
     * "receive the identifier, fetch the product, verify, price server-side".
     *
     * Nothing the browser sent about this cake survives the lookup: not its
     * name, not its price, not whether it is on sale. The request carries a
     * slug and three choices, and everything else below is read off the row.
     */
    let cake: CakeProductView | undefined;
    let variant: CakeVariantView | undefined;
    let config: CakeConfig | null;

    if (item.cakeSlug) {
      const found = cakes.get(item.cakeSlug);
      if (!found || !found.isAvailable) {
        return {
          ok: false,
          problem: {
            code: "cake_unavailable",
            status: 409,
            index,
            message:
              "One of the cakes in your basket is no longer available. " +
              "Please remove it and choose another.",
          },
        };
      }

      /*
       * The variant, looked up *within this cake* and only among the ones on
       * sale, which is the whole of §31's "a customer must not be able to change
       * a variant id to manipulate the price".
       *
       * `sellable` scopes the search to `found.variants`, so an id belonging to
       * a different cake simply is not in the list — there is no cross-product
       * lookup to fool. And because the price is then read off the row this
       * search returned, the request has no way to express a price at all: the
       * only field it carries about money is `quotedTotalPaise`, which can
       * refuse the order and can never set one.
       *
       * A withdrawn or deleted variant lands here too, and is refused with a
       * message that says which part of the line has gone rather than implying
       * the whole cake has.
       */
      const picked = sellable(found).find((v) => v.id === item.variantId);
      if (!picked) {
        return {
          ok: false,
          problem: {
            code: "cake_unavailable",
            status: 409,
            index,
            message:
              `The size or sponge you chose for ${found.name} isn't available any more. ` +
              "Open it again and pick from what's on the shelf.",
          },
        };
      }

      cake = found;
      variant = picked;
      if (!parseProductionSpec(found.productionSpec)) {
        return {
          ok: false,
          problem: {
            code: "cake_unavailable",
            status: 409,
            index,
            message: `${found.name} is temporarily unavailable while its kitchen specification is reviewed.`,
          },
        };
      }
      config = configForVariant(
        found,
        picked,
        item.choices ?? { delivery: "standard" },
      );
    } else if (item.config) {
      /* The builder's path, unchanged: an assembly with no row behind it. */
      config = item.config;
    } else {
      /*
       * Neither a cake nor a configuration.
       *
       * The Zod refinement on `Item` above already refuses this, and
       * app/api/orders parses before it calls — so reaching here means a caller
       * that skipped validation. Refused rather than asserted with a `!`,
       * because this function decides money and the alternative to a refusal is
       * `validateCake(undefined)` throwing somewhere less obvious.
       */
      return {
        ok: false,
        problem: {
          code: "cake_unavailable",
          status: 409,
          index,
          message: "One of the items in your basket isn't a cake we can price.",
        },
      };
    }

    const violations = config ? validateCake(config) : [];
    if (violations.some((v) => v.severity === "block")) {
      return {
        ok: false,
        problem: {
          code: "not_buildable",
          status: 422,
          index,
          violations,
          message:
            "One of these cakes can't be built as configured. Open it in the basket to see why.",
        },
      };
    }

    /*
     * Which options this line is checked against, and why a shop cake is
     * checked against fewer.
     *
     * A builder cake is an assembly of options, so every one it names has to
     * still be on offer — that is what `withdrawnOptions` is for and it is
     * unchanged. A shop cake is not: its price no longer comes from its parts,
     * and whether it is for sale is one column an owner sets on the cake
     * itself. Running the full check on it would mean withdrawing pistachio
     * cream silently killing three products, with a refusal that names a
     * filling rather than the cake — an owner would have no way to see the
     * connection and no way to override it.
     *
     * The delivery slot is the exception and stays checked in both cases,
     * because it is genuinely still a catalogue option the shop offers: taking
     * midnight delivery off the menu has to stop somebody ordering it.
     */
    const deliveryChoice = item.choices?.delivery ?? config?.delivery;
    if (!deliveryChoice) {
      return {
        ok: false,
        problem: {
          code: "delivery_unavailable",
          status: 422,
          index,
          message: "Choose pickup or a delivery slot.",
        },
      };
    }
    const withdrawn = cake
      ? entryFor(catalog, "delivery", deliveryChoice)?.isAvailable
        ? []
        : [
            {
              category: "delivery" as const,
              value: deliveryChoice,
              name: deliveryChoice,
            },
          ]
      : withdrawnOptions(config!, catalog);
    if (withdrawn.length > 0) {
      const names = withdrawn.map((o) => o.name).join(", ");
      return {
        ok: false,
        problem: {
          code: "option_unavailable",
          status: 409,
          index,
          options: withdrawn,
          message:
            withdrawn.length === 1
              ? `${names} is no longer available. Please review your cart and pick something else.`
              : `These are no longer available: ${names}. Please review your cart.`,
        },
      };
    }

    const pincode = item.choices?.pincode ?? config?.pincode;
    const slot = resolveSlot(deliveryChoice, pincode, catalog);
    if (!slot.available) {
      return {
        ok: false,
        problem: {
          code: "delivery_unavailable",
          status: 422,
          index,
          message:
            slot.unavailableReason ??
            "That delivery slot isn't available for this pincode.",
        },
      };
    }

    /*
     * The authoritative price, and the fork that matters.
     *
     * A shop cake is priced from the *variant row* — what the bakery typed into
     * that cell of the grid at /admin/cakes — plus delivery, piping and GST. A
     * builder cake is priced from its parts. Both produce the same
     * `PriceBreakdown`, which is what freezes onto the order. See lib/pricing on
     * why these are two functions and not one.
     */
    const price =
      cake && variant
        ? priceProduct(
            /*
             * The variant's price, and a label that names what was bought.
             *
             * `priceProduct` takes a name and an amount and has not changed:
             * the amount is the row's, exactly as it used to be the product
             * row's, and this is the one line in the application that decides
             * which row that is. The label is what lands on the `OrderItem` and
             * on the docket, so it reads "Pineapple Delight · 1.5 kg · Eggless"
             * rather than leaving the kitchen to infer the size from a config
             * dump. `Order.cakeName` stays the plain name — see below.
             */
            {
              name: `${cake.name} · ${variantLabel(variant)}`,
              pricePaise: variant.pricePaise,
            },
            item.choices ?? { delivery: deliveryChoice },
            catalog,
          )
        : withoutShipment(priceCake(config!, catalog));

    if (
      item.quotedTotalPaise !== undefined &&
      item.quotedTotalPaise !== price.total
    ) {
      return {
        ok: false,
        problem: {
          code: "price_changed",
          status: 409,
          index,
          quotedPaise: item.quotedTotalPaise,
          currentPaise: price.total,
          message:
            "Your cake options or pricing have changed since you added them. " +
            "Please review your order before continuing.",
        },
      };
    }

    quotes.push({
      config,
      qty,
      price,
      slot,
      ...(cake && variant && cake.productionSpec
        ? {
            product: {
              id: cake.id,
              name: cake.name,
              imageUrl: cake.imageUrl,
              productionSpec: cake.productionSpec,
              variant,
            },
          }
        : {}),
    });
  }

  const slots = new Set(quotes.map((q) => q.slot.slot));
  if (slots.size !== 1) {
    return {
      ok: false,
      problem: {
        code: "delivery_unavailable",
        status: 422,
        message:
          "Every cake in one order must use the same pickup or delivery slot.",
      },
    };
  }

  const slotValue = quotes[0]?.slot.slot;
  const productSubtotalPaise = quotes.reduce(
    (n, q) => n + q.price.subtotal * q.qty,
    0,
  );
  const deliveryFeePaise = slotValue
    ? (catalog.price.deliveryFee[slotValue] ?? 0)
    : 0;
  const subtotalPaise = productSubtotalPaise + deliveryFeePaise;
  const gstPaise = Math.round(subtotalPaise * catalog.settings.gstRate);
  const totalPaise = subtotalPaise + gstPaise;

  /*
   * The minimum the bakery set, finally enforced.
   *
   * `PricingSettings.minOrderPaise` has been editable at /admin/delivery since
   * the portal shipped and was read by precisely nothing, so an owner could set
   * a floor and watch orders come in under it. It ships as 0, so switching this
   * on changes nothing for a bakery that never set one.
   *
   * Measured against the whole basket rather than each cake, and before GST, as
   * the column's own note says. One order is one cake in this schema, but a
   * customer checking out three of them has placed one order in the sense they
   * mean — refusing a ₹200 cake in a ₹900 basket would be a rule about our
   * table layout wearing the clothes of a rule about the kitchen.
   */
  const minimum = catalog.settings.minOrderPaise;
  if (minimum > 0 && subtotalPaise < minimum) {
    return {
      ok: false,
      problem: {
        code: "below_minimum",
        status: 422,
        message:
          `The kitchen's smallest order is ₹${Math.round(minimum / 100)} before GST. ` +
          "Please add a little more to the basket.",
      },
    };
  }

  return {
    ok: true,
    quotes,
    totalPaise,
    subtotalPaise,
    gstPaise,
    productSubtotalPaise,
    deliveryFeePaise,
  };
}

/* ------------------------------------------------------------- references */

/**
 * The order reference this checkout attempt will produce, every time it is sent.
 *
 * ## Why the reference is derived rather than drawn
 *
 * Duplicate orders are the failure this phase most has to prevent, and a
 * disabled button does not prevent them: a refresh mid-request, a retried POST
 * after a timeout, a flaky connection and a second tap on a phone that did not
 * repaint all send the same intention twice, and a handler that mints a fresh
 * random reference each time happily writes it twice.
 *
 * The fix wants a unique constraint over "this checkout attempt", and
 * `Order.ref` is already unique. So rather than adding a column and a migration
 * to a production database — which §32 asks to avoid, and which would leave the
 * protection switched off until somebody ran it — the reference *is* the
 * constraint: it is a digest of the browser's idempotency key and the cake's
 * position in the basket, so the second send computes the references the first
 * one already took and collides with itself. See app/api/orders/route.ts, which
 * reads that collision as "this is the same order" rather than "mint another".
 *
 * `attempt` exists because two unrelated keys can, rarely, digest to the same
 * six characters. The handler detects that by checking whether the order
 * sitting on the reference is actually this customer's, and asks for the next
 * attempt when it is not — which is deterministic too, so a replay walks the
 * same short sequence and lands on the same row.
 *
 * SHA-256 and no secret, deliberately. A reference is public by design — it is
 * read back down a phone line — and is never an authorisation for anything, so
 * there is nothing here for a key to protect. What guards a guest's order is
 * lib/guestOrders, not the unguessability of six characters.
 *
 * Web Crypto rather than `node:crypto`, so this module stays importable from a
 * browser bundle alongside the rest of the file.
 */
export async function refForAttempt(
  idempotencyKey: string,
  index: number,
  attempt: number,
): Promise<string> {
  const message = `${idempotencyKey}:${index}:${attempt}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  return "MC-" + slugFromBytes(new Uint8Array(digest)).toUpperCase();
}

/** Order identity excludes mutable quote estimates and server-owned window prose. */
export function checkoutIntent(
  body: Pick<
    CheckoutRequest,
    "items" | "customerName" | "customerPhone" | "fulfillment"
  > & { designSlug?: string },
) {
  const { requestedWindow: _window, ...fulfillment } = body.fulfillment;
  void _window;
  return {
    items: body.items.map(({ quotedTotalPaise: _quote, ...item }) => {
      void _quote;
      return item;
    }),
    customerName: normalizeName(body.customerName),
    customerPhone: normalizePhone(body.customerPhone),
    fulfillment,
    designSlug: body.designSlug ?? null,
  };
}
