import { isCovered } from "@/lib/coverage";
import type { Receipt } from "@/lib/orderReceipt";
import type { Prisma } from "@prisma/client";
import { cakesBySlug } from "@/lib/cakeData";
import {
  CATALOG_UNAVAILABLE_MESSAGE,
  tryCatalogSnapshot,
} from "@/lib/catalogData";
import {
  asBasketBody,
  CheckoutRequest,
  type BasketReview,
  nameOk,
  normalizeName,
  normalizePhone,
  phoneOk,
  reviewBasket,
  checkoutIntent,
} from "@/lib/checkout";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { log } from "@/lib/log";
import { scheduleVerdict } from "@/lib/scheduling";

/**
 * Everything a checkout request has to get past before money or an order is
 * involved. `/api/orders` and `/api/payments/intent` both run it, so the two
 * cannot disagree about what a valid basket is. Next route files may only export
 * handlers, which is why this lives here rather than in the route.
 */

export const CREATED = {
  id: true,
  ref: true,
  totalPaise: true,
  productSubtotalPaise: true,
  deliveryFeePaise: true,
  customerName: true,
  customerPhone: true,
  deliverySlot: true,
  leadHours: true,
  requestedFor: true,
  requestedWindow: true,
  fulfillmentMethod: true,
  addressLine1: true,
  addressLine2: true,
  landmark: true,
  city: true,
  state: true,
  pincode: true,
  deliveryLocation: true,
  cakes: { orderBy: { position: "asc" }, select: { cakeName: true, variantLabel: true } },
  dueAt: true,
  createdAt: true,
  paymentStatus: true,
  razorpayPaymentId: true,
} satisfies Prisma.OrderSelect;

export type CreatedOrder = Prisma.OrderGetPayload<{ select: typeof CREATED }>;
export type SuccessfulReview = Extract<BasketReview, { ok: true }>;

export async function payloadHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function responseFor(order: CreatedOrder) {
  const subtotal = order.productSubtotalPaise + order.deliveryFeePaise;
  const items: { name: string; variant: string; qty: number }[] = [];
  for (const cake of order.cakes) {
    const name = cake.cakeName ?? "Cake";
    const variant = cake.variantLabel ?? "";
    const item = items.find(item => item.name === name && item.variant === variant);
    if (item) item.qty++;
    else items.push({ name, variant, qty: 1 });
  }
  return {
    order: {
      ref: order.ref, totalPaise: order.totalPaise,
      date: order.requestedFor ? new Date(order.requestedFor.getTime() + 19800000).toISOString().slice(0, 10) : null,
      window: order.requestedWindow ?? "",
      method: order.fulfillmentMethod,
      address: order.fulfillmentMethod === "pickup" ? "Bakery pickup" : (
        order.deliveryLocation && typeof order.deliveryLocation === "object" &&
        "formattedAddress" in order.deliveryLocation && typeof order.deliveryLocation.formattedAddress === "string"
          ? order.deliveryLocation.formattedAddress
          : [order.addressLine1, order.addressLine2, order.landmark, order.city, order.state, order.pincode].filter(Boolean).join(", ")
      ),
      items,
      payment: order.paymentStatus === "paid" && order.razorpayPaymentId
        ? { id: order.razorpayPaymentId, paise: order.totalPaise }
        : null,
    } satisfies Receipt,
    orders: [{ ref: order.ref, totalPaise: order.totalPaise }],
    orderId: order.ref,
    totalPaise: order.totalPaise,
    subtotalPaise: subtotal,
    gstPaise: order.totalPaise - subtotal,
    productSubtotalPaise: order.productSubtotalPaise,
    deliveryFeePaise: order.deliveryFeePaise,
  };
}

export type Checked = {
  body: CheckoutRequest;
  hash: string;
  customerName: string;
  customerPhone: string;
  review: SuccessfulReview;
  requestedFor: Date;
};

export type Validation =
  | { kind: "problem"; response: Response }
  | { kind: "replay"; order: CreatedOrder }
  | { kind: "checked"; checked: Checked };

/**
 * `raw` is the parsed JSON body; the cross-site check, rate limit and JSON
 * parsing stay in each route. `traceId` only labels the 400 and the log line,
 * so a route that has one passes it and the response header does not change.
 */
export async function validateCheckout(
  raw: unknown,
  traceId: string = crypto.randomUUID(),
): Promise<Validation> {
  const problem = (response: Response): Validation => ({ kind: "problem", response });

  if (!hasDatabase()) {
    return problem(
      Response.json({ error: NO_DATABASE_MESSAGE }, { status: 503 }),
    );
  }

  const parsed = CheckoutRequest.safeParse(asBasketBody(raw));
  if (!parsed.success) {
    return problem(
      Response.json(
        { error: "That order couldn't be read.", code: "invalid_request" },
        { status: 400, headers: { "x-request-id": traceId } },
      ),
    );
  }

  const body = parsed.data;
  const customerName = normalizeName(body.customerName);
  const customerPhone = normalizePhone(body.customerPhone);
  if (!nameOk(customerName)) {
    return problem(
      Response.json(
        { error: "We need a name for the order.", field: "customerName" },
        { status: 400 },
      ),
    );
  }
  if (!phoneOk(customerPhone)) {
    return problem(
      Response.json(
        {
          error: "We need a 10-digit mobile number to confirm the order.",
          field: "customerPhone",
        },
        { status: 400 },
      ),
    );
  }

  // Recover a committed order before checking mutable prices, availability or time.
  // The transaction repeats this check under a lock for concurrent first requests.
  const hash = await payloadHash(checkoutIntent(body));
  try {
    const previous = await db.checkoutAttempt.findUnique({
      where: { id: body.idempotencyKey },
      include: { order: { select: CREATED } },
    });
    if (previous && previous.payloadHash !== hash) {
      return problem(
        Response.json(
          {
            error: "This checkout attempt belongs to different order details.",
            code: "idempotency_conflict",
          },
          { status: 409 },
        ),
      );
    }
    if (previous?.status === "completed" && previous.order) {
      return { kind: "replay", order: previous.order };
    }
  } catch (error) {
    log("error", "checkout_recovery_failed", { traceId, error: String(error) });
    return problem(
      Response.json(
        {
          error:
            "We couldn't verify this checkout attempt. Please retry with the same details.",
          code: "recovery_unavailable",
        },
        { status: 503 },
      ),
    );
  }

  const catalog = await tryCatalogSnapshot();
  if (!catalog) {
    return problem(
      Response.json(
        { error: CATALOG_UNAVAILABLE_MESSAGE, code: "catalog_unavailable" },
        { status: 503 },
      ),
    );
  }

  const slotInfo = catalog.slots[body.fulfillment.slot];
  const schedule = scheduleVerdict(body.fulfillment.requestedDate, slotInfo);
  if (!schedule.ok) {
    return problem(
      Response.json(
        {
          error: schedule.message,
          code: "schedule_unavailable",
          field: "requestedDate",
        },
        { status: 422 },
      ),
    );
  }

  const items = body.items.map((item) => {
    if (item.cakeSlug) {
      return {
        ...item,
        choices: {
          ...item.choices!,
          delivery: body.fulfillment.slot,
          pincode:
            body.fulfillment.method === "delivery"
              ? body.fulfillment.pincode
              : undefined,
        },
      };
    }
    if (!item.config) return item;
    const config = {
      ...item.config,
      delivery: body.fulfillment.slot,
      pincode:
        body.fulfillment.method === "delivery"
          ? body.fulfillment.pincode
          : undefined,
    };
    if (body.fulfillment.method === "pickup") delete config.pincode;
    return { ...item, config };
  });

  const cakes = await cakesBySlug(
    items
      .map((item) => item.cakeSlug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  const review = reviewBasket(items, catalog, cakes);
  if (!review.ok) {
    const { status, ...rest } = review.problem;
    return problem(
      Response.json({ error: rest.message, ...rest }, { status }),
    );
  }

  if (
    body.quotedOrderTotalPaise !== undefined &&
    body.quotedOrderTotalPaise !== review.totalPaise
  ) {
    return problem(
      Response.json(
        {
          error:
            "The order total has changed. Review the updated price before placing your order.",
          code: "price_changed",
        },
        { status: 409 },
      ),
    );
  }

  const slot = review.quotes[0]?.slot;
  if (!slot?.available) {
    return problem(
      Response.json(
        {
          error: "That fulfillment slot is not available.",
          code: "delivery_unavailable",
        },
        { status: 422 },
      ),
    );
  }
  /* The pincode zone says we deliver to the area; this says a bakery actually
     reaches the pin. Without it an order can be taken that nobody can make. */
  const pin = body.fulfillment.location;
  if (body.fulfillment.method === "delivery" && pin && !(await isCovered(pin))) {
    return problem(
      Response.json(
        { error: "We don't deliver here yet.", code: "not_serviceable" },
        { status: 422 },
      ),
    );
  }

  return {
    kind: "checked",
    checked: {
      body,
      hash,
      customerName,
      customerPhone,
      review,
      requestedFor: schedule.requestedFor,
    },
  };
}
