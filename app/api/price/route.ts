import {
  callerKey,
  CROSS_SITE_MESSAGE,
  crossSite,
  LIMITS,
  rateLimit,
  tooMany,
} from "@/lib/apiGuard";
import { cakeBySlug, cakesBySlug } from "@/lib/cakeData";
import {
  CakeChoices,
  configForVariant,
  sellable,
  variantLabel,
} from "@/lib/cakes";
import {
  CATALOG_UNAVAILABLE_MESSAGE,
  tryCatalogSnapshot,
} from "@/lib/catalogData";
import { CakeConfig } from "@/lib/schema";
import { priceCake, priceProduct } from "@/lib/pricing";
import { validateCake } from "@/lib/rules";
import { QuoteRequest, reviewBasket } from "@/lib/checkout";
import { db, hasDatabase } from "@/lib/db";
import { scheduleVerdict, requestedDayRange } from "@/lib/scheduling";

/**
 * The authoritative price. The client runs the same functions for the live
 * estimate, but this is the number that counts — and now for a second reason:
 * the client prices from a page it loaded some minutes ago, and this prices
 * from the database as it is at this moment.
 *
 * Two kinds of question, because there are two kinds of cake:
 *
 *   `{ cakeSlug, variantId, choices }` — a cake from the shop. The price is read
 *   off the CakeVariant row here; nothing in the body sets it, and the variant
 *   is looked up *within* the cake the slug names, so an id borrowed from a
 *   cheaper cake finds nothing. A slug or a variant that is withdrawn or deleted
 *   gets a 409 rather than a price, which is what the basket renders as "no
 *   longer available".
 *
 *   `{ config }` — a cake from the 3D builder, priced from its parts. The shape
 *   this route has always taken, unchanged.
 */
export async function POST(req: Request) {
  if (crossSite(req)) {
    return Response.json(
      { error: CROSS_SITE_MESSAGE, code: "cross_site" },
      { status: 403 },
    );
  }

  const limit = rateLimit("price", callerKey(req), LIMITS.price);
  if (!limit.ok) return tooMany(limit, "price checks");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const b = (body ?? {}) as {
    config?: unknown;
    cakeSlug?: unknown;
    variantId?: unknown;
    choices?: unknown;
    items?: unknown;
  };

  const catalog = await tryCatalogSnapshot();
  if (!catalog) {
    return Response.json(
      { error: CATALOG_UNAVAILABLE_MESSAGE, code: "catalog_unavailable" },
      { status: 503 },
    );
  }

  if (Array.isArray(b.items)) {
    const parsed = QuoteRequest.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "That quote couldn't be read.", code: "invalid_request" },
        { status: 400 },
      );
    }
    const fulfillment = parsed.data.fulfillment;
    const schedule = scheduleVerdict(
      fulfillment.requestedDate,
      catalog.slots[fulfillment.slot],
    );
    if (!schedule.ok) {
      return Response.json(
        { error: schedule.message, code: "schedule_unavailable" },
        { status: 422 },
      );
    }
    const items = parsed.data.items.map((item) =>
      item.cakeSlug
        ? {
            ...item,
            choices: {
              ...item.choices!,
              delivery: fulfillment.slot,
              pincode:
                fulfillment.method === "delivery"
                  ? fulfillment.pincode
                  : undefined,
            },
          }
        : item,
    );
    const cakes = await cakesBySlug(
      items
        .map((item) => item.cakeSlug)
        .filter((slug): slug is string => Boolean(slug)),
    );
    const review = reviewBasket(items, catalog, cakes);
    if (!review.ok) {
      const { status, ...problem } = review.problem;
      return Response.json({ error: problem.message, ...problem }, { status });
    }
    // Advisory preview only. Placement repeats these checks inside its capacity lock.
    if (hasDatabase()) {
      try {
        const [blackout, booked] = await Promise.all([
          db.fulfillmentBlackout.findUnique({
            where: {
              date_method: {
                date: new Date(`${fulfillment.requestedDate}T00:00:00Z`),
                method: fulfillment.method,
              },
            },
          }),
          db.orderCake.count({
            where: {
              order: {
                requestedFor: requestedDayRange(schedule.requestedFor),
                deliverySlot: fulfillment.slot,
                status: { not: "cancelled" },
              },
            },
          }),
        ]);
        const capacity = catalog.slots[fulfillment.slot].dailyCapacity;
        const requested = items.reduce((sum, item) => sum + item.qty, 0);
        if (blackout || (capacity > 0 && booked + requested > capacity)) {
          return Response.json(
            {
              error:
                blackout?.reason ||
                "That date and slot is fully booked. Choose another.",
              code: "capacity_unavailable",
            },
            { status: 409 },
          );
        }
      } catch {
        return Response.json(
          {
            error: "We couldn't verify bakery availability. Please try again.",
            code: "availability_unverified",
          },
          { status: 503 },
        );
      }
    }
    return Response.json({
      quote: {
        each: review.quotes.map((quote) => quote.price.total * quote.qty),
        productSubtotalPaise: review.productSubtotalPaise,
        deliveryFeePaise: review.deliveryFeePaise,
        subtotalPaise: review.subtotalPaise,
        gstPaise: review.gstPaise,
        totalPaise: review.totalPaise,
      },
    });
  }

  /* ── A cake from the shop ─────────────────────────────────────────────── */
  if (typeof b.cakeSlug === "string") {
    const choices = CakeChoices.safeParse(b.choices);
    if (!choices.success) {
      return Response.json(
        { error: "Invalid delivery choices" },
        { status: 400 },
      );
    }

    /* `cakeBySlug` returns nothing for a withdrawn cake as well as for one that
       never existed, and both get this answer — telling them apart would tell
       somebody holding a URL which cakes used to be on sale. */
    const cake = await cakeBySlug(b.cakeSlug);
    if (!cake) {
      return Response.json(
        {
          error: "That cake is no longer available.",
          code: "cake_unavailable",
        },
        { status: 409 },
      );
    }

    /* Among this cake's variants and only the ones on sale — `reviewBasket`'s
       rule, so the estimate this route answers with and the price the order is
       written at cannot come from different sets of rows. */
    const variant = sellable(cake).find((v) => v.id === b.variantId);
    if (!variant) {
      return Response.json(
        {
          error: "That size or sponge is no longer available.",
          code: "cake_unavailable",
        },
        { status: 409 },
      );
    }

    const config = configForVariant(cake, variant, choices.data);
    return Response.json({
      price: priceProduct(
        {
          name: `${cake.name} · ${variantLabel(variant)}`,
          pricePaise: variant.pricePaise,
        },
        choices.data,
        catalog,
      ),
      violations: config ? validateCake(config) : [],
    });
  }

  /* ── A cake from the builder ──────────────────────────────────────────── */
  const parsed = CakeConfig.safeParse(b.config);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid cake configuration" },
      { status: 400 },
    );
  }

  return Response.json({
    price: priceCake(parsed.data, catalog),
    violations: validateCake(parsed.data),
  });
}
