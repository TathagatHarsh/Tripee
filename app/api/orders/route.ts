import { Prisma } from "@prisma/client";
import {
  callerKey, CROSS_SITE_MESSAGE, crossSite, LIMITS, rateLimit, tooMany,
} from "@/lib/apiGuard";
import { getViewer } from "@/lib/auth";
import { cakesBySlug } from "@/lib/cakeData";
import { CATALOG_UNAVAILABLE_MESSAGE, tryCatalogSnapshot } from "@/lib/catalogData";
import {
  asBasketBody, CheckoutRequest, type BasketReview, type ItemQuote, nameOk,
  normalizeName, normalizePhone, phoneOk, refForAttempt, reviewBasket,
} from "@/lib/checkout";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { rememberGuestOrders } from "@/lib/guestOrders";
import { log, requestId } from "@/lib/log";
import { dispatchPendingNotifications, outboxCreate } from "@/lib/notifications";
import { allergensForVariant, productionSpecFromConfig } from "@/lib/productionSpec";
import { scheduleVerdict } from "@/lib/scheduling";
import { deriveServings, servingsForSize } from "@/lib/servings";

const CREATED = {
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
  dueAt: true,
  createdAt: true,
} satisfies Prisma.OrderSelect;

type CreatedOrder = Prisma.OrderGetPayload<{ select: typeof CREATED }>;
type SuccessfulReview = Extract<BasketReview, { ok: true }>;

class PayloadMismatch extends Error {}
class CapacityUnavailable extends Error {}
class ReferenceUnavailable extends Error {}

async function payloadHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function responseFor(order: CreatedOrder, review: SuccessfulReview) {
  return {
    order: { ref: order.ref, totalPaise: order.totalPaise },
    orders: [{ ref: order.ref, totalPaise: order.totalPaise }],
    orderId: order.ref,
    totalPaise: order.totalPaise,
    subtotalPaise: review.subtotalPaise,
    gstPaise: review.gstPaise,
    productSubtotalPaise: order.productSubtotalPaise,
    deliveryFeePaise: order.deliveryFeePaise,
  };
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  if (crossSite(req)) {
    return Response.json(
      { error: CROSS_SITE_MESSAGE, code: "cross_site" },
      { status: 403, headers: { "x-request-id": traceId } },
    );
  }

  const limit = rateLimit("orders", callerKey(req), LIMITS.orders);
  if (!limit.ok) return tooMany(limit, "order attempts");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (!hasDatabase()) {
    return Response.json({ error: NO_DATABASE_MESSAGE }, { status: 503 });
  }

  const parsed = CheckoutRequest.safeParse(asBasketBody(raw));
  if (!parsed.success) {
    return Response.json(
      { error: "That order couldn't be read.", code: "invalid_request" },
      { status: 400, headers: { "x-request-id": traceId } },
    );
  }

  const body = parsed.data;
  const customerName = normalizeName(body.customerName);
  const customerPhone = normalizePhone(body.customerPhone);
  if (!nameOk(customerName)) {
    return Response.json(
      { error: "We need a name for the order.", field: "customerName" },
      { status: 400 },
    );
  }
  if (!phoneOk(customerPhone)) {
    return Response.json(
      { error: "We need a 10-digit mobile number to confirm the order.", field: "customerPhone" },
      { status: 400 },
    );
  }

  const catalog = await tryCatalogSnapshot();
  if (!catalog) {
    return Response.json(
      { error: CATALOG_UNAVAILABLE_MESSAGE, code: "catalog_unavailable" },
      { status: 503 },
    );
  }

  const slotInfo = catalog.slots[body.fulfillment.slot];
  const schedule = scheduleVerdict(body.fulfillment.requestedDate, slotInfo);
  if (!schedule.ok) {
    return Response.json(
      { error: schedule.message, code: "schedule_unavailable", field: "requestedDate" },
      { status: 422 },
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
            body.fulfillment.method === "delivery" ? body.fulfillment.pincode : undefined,
        },
      };
    }
    if (!item.config) return item;
    const config = {
      ...item.config,
      delivery: body.fulfillment.slot,
      pincode:
        body.fulfillment.method === "delivery" ? body.fulfillment.pincode : undefined,
    };
    if (body.fulfillment.method === "pickup") delete config.pincode;
    return { ...item, config };
  });

  const cakes = await cakesBySlug(
    items.map((item) => item.cakeSlug).filter((slug): slug is string => Boolean(slug)),
  );
  const review = reviewBasket(items, catalog, cakes);
  if (!review.ok) {
    const { status, ...problem } = review.problem;
    return Response.json({ error: problem.message, ...problem }, { status });
  }

  const slot = review.quotes[0]?.slot;
  if (!slot?.available) {
    return Response.json(
      { error: "That fulfillment slot is not available.", code: "delivery_unavailable" },
      { status: 422 },
    );
  }

  const viewer = await getViewer();
  const [design, bakery] = await Promise.all([
    body.designSlug ? db.design.findUnique({ where: { slug: body.designSlug } }) : null,
    db.bakerySettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const hash = await payloadHash({
    items,
    customerName,
    customerPhone,
    fulfillment: body.fulfillment,
    designSlug: body.designSlug ?? null,
  });

  let result: { order: CreatedOrder; replay: boolean };
  try {
    result = await createOrder({
      idempotencyKey: body.idempotencyKey,
      payloadHash: hash,
      quotes: review.quotes,
      review,
      fulfillment: body.fulfillment,
      customerName,
      customerPhone,
      userId: viewer?.profile.id ?? null,
      designId: design?.id ?? null,
      requestedFor: schedule.requestedFor,
      notificationDestination: bakery?.orderNotifyEmail ?? null,
    });
  } catch (error) {
    if (error instanceof PayloadMismatch) {
      return Response.json(
        {
          error: "This checkout attempt belongs to a different basket. Reload checkout and try again.",
          code: "idempotency_conflict",
        },
        { status: 409 },
      );
    }
    if (error instanceof CapacityUnavailable) {
      return Response.json(
        { error: error.message, code: "capacity_unavailable", field: "requestedDate" },
        { status: 409 },
      );
    }
    if (error instanceof ReferenceUnavailable) {
      return Response.json(
        { error: "We couldn't allocate an order reference. Please try again.", code: "ref_exhausted" },
        { status: 503 },
      );
    }
    log("error", "order_create_failed", { traceId, error: String(error) });
    return Response.json(
      {
        error: "We couldn't place that order. Nothing has been charged — please try again.",
        code: "server_error",
      },
      { status: 500, headers: { "x-request-id": traceId } },
    );
  }

  await rememberGuestOrders([result.order.ref]);
  if (!result.replay) {
    await dispatchPendingNotifications(5).catch((error) => {
      log("error", "notification_dispatch_failed", {
        traceId,
        orderRef: result.order.ref,
        error: String(error),
      });
    });
  }

  return Response.json(
    { ...responseFor(result.order, review), duplicate: result.replay },
    {
      status: result.replay ? 200 : 201,
      headers: { "x-request-id": traceId },
    },
  );
}

interface CreateInput {
  idempotencyKey: string;
  payloadHash: string;
  quotes: ItemQuote[];
  review: SuccessfulReview;
  fulfillment: CheckoutRequest["fulfillment"];
  customerName: string;
  customerPhone: string;
  userId: string | null;
  designId: string | null;
  requestedFor: Date;
  notificationDestination: string | null;
}

async function createOrder(input: CreateInput): Promise<{ order: CreatedOrder; replay: boolean }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${input.idempotencyKey}`}))`;

    const previous = await tx.checkoutAttempt.findUnique({
      where: { id: input.idempotencyKey },
      include: { order: { select: CREATED } },
    });
    if (previous && previous.payloadHash !== input.payloadHash) throw new PayloadMismatch();
    if (previous?.status === "completed" && previous.order) {
      return { order: previous.order, replay: true };
    }

    await tx.checkoutAttempt.upsert({
      where: { id: input.idempotencyKey },
      create: {
        id: input.idempotencyKey,
        payloadHash: input.payloadHash,
        status: "processing",
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
      update: { status: "processing", lastError: null },
    });

    const capacityKey = `${input.fulfillment.requestedDate}:${input.fulfillment.slot}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${capacityKey}`}))`;

    const blackoutDate = new Date(`${input.fulfillment.requestedDate}T00:00:00.000Z`);
    const blackout = await tx.fulfillmentBlackout.findUnique({
      where: {
        date_method: { date: blackoutDate, method: input.fulfillment.method },
      },
    });
    if (blackout) {
      throw new CapacityUnavailable(blackout.reason || "The bakery is closed on that date.");
    }

    const dayStart = new Date(`${input.fulfillment.requestedDate}T00:00:00+05:30`);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const capacity = input.quotes[0]?.slot.dailyCapacity ?? 0;
    if (capacity > 0) {
      const alreadyBooked = await tx.orderCake.count({
        where: {
          order: {
            requestedFor: { gte: dayStart, lt: dayEnd },
            deliverySlot: input.fulfillment.slot,
            status: { not: "cancelled" },
          },
        },
      });
      const requested = input.quotes.reduce((sum, quote) => sum + quote.qty, 0);
      if (alreadyBooked + requested > capacity) {
        throw new CapacityUnavailable(
          "That slot has reached its cake capacity. Choose another date or slot.",
        );
      }
    }

    let ref: string | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = await refForAttempt(input.idempotencyKey, 0, attempt);
      const taken = await tx.order.findUnique({
        where: { ref: candidate },
        select: { id: true },
      });
      if (!taken) {
        ref = candidate;
        break;
      }
    }
    if (!ref) throw new ReferenceUnavailable();

    const jobs = input.quotes.flatMap((quote) =>
      Array.from({ length: quote.qty }, () => quote),
    );
    const cakeRows = jobs.map((job, position) => {
      const config = job.config;
      const production = job.product
        ? job.product.productionSpec
        : productionSpecFromConfig(config!);
      const servings = config
        ? deriveServings(config)
        : servingsForSize(job.product!.variant.sizeBand);
      const allergens = job.product
        ? allergensForVariant(production, job.product.variant.eggType)
        : production.allergens;

      return {
        position,
        config: config === null ? Prisma.JsonNull : asJson(config),
        priceBreakdown: asJson(job.price),
        totalPaise: job.price.total,
        cakeProductId: job.product?.id ?? null,
        cakeName: job.product?.name ?? null,
        cakeImageUrl: job.product?.imageUrl ?? null,
        variantLabel: job.product?.variant
          ? `${job.product.variant.sizeBand} · ${job.product.variant.eggType === "eggless" ? "Eggless" : "With egg"}`
          : null,
        allergens,
        servesMin: servings.min,
        servesMax: servings.max,
        productionSpec: asJson(production),
      };
    });

    const aggregateLines = jobs.flatMap((job, cakeIndex) =>
      job.price.lines.map((line) => ({
        label: jobs.length > 1 ? `Cake ${cakeIndex + 1}: ${line.label}` : line.label,
        kind: line.kind,
        amountPaise: line.amount,
      })),
    );
    if (input.review.deliveryFeePaise > 0) {
      aggregateLines.push({
        label: `${input.quotes[0].slot.name} delivery`,
        kind: "delivery",
        amountPaise: input.review.deliveryFeePaise,
      });
    }

    const breakdown = {
      lines: aggregateLines.map((line) => ({
        label: line.label,
        kind: line.kind,
        amount: line.amountPaise,
      })),
      subtotal: input.review.subtotalPaise,
      gstRate: input.quotes[0].price.gstRate,
      gst: input.review.gstPaise,
      total: input.review.totalPaise,
      payable: input.review.totalPaise,
      currency: "INR",
    };

    const firstCake = cakeRows[0];
    const order = await tx.order.create({
      select: CREATED,
      data: {
        ref,
        config: firstCake.config,
        priceBreakdown: asJson(breakdown),
        totalPaise: input.review.totalPaise,
        productSubtotalPaise: input.review.productSubtotalPaise,
        deliveryFeePaise: input.review.deliveryFeePaise,
        payablePaise: input.review.totalPaise,
        status: "draft",
        userId: input.userId,
        paymentStatus: "none",
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        recipientName: input.fulfillment.recipientName,
        fulfillmentMethod: input.fulfillment.method,
        addressLine1:
          input.fulfillment.method === "delivery" ? input.fulfillment.addressLine1 : null,
        addressLine2:
          input.fulfillment.method === "delivery" ? input.fulfillment.addressLine2 : null,
        landmark:
          input.fulfillment.method === "delivery" ? input.fulfillment.landmark : null,
        city: input.fulfillment.method === "delivery" ? input.fulfillment.city : null,
        state: input.fulfillment.method === "delivery" ? input.fulfillment.state : null,
        pincode:
          input.fulfillment.method === "delivery" ? input.fulfillment.pincode : null,
        deliverySlot: input.fulfillment.slot,
        leadHours: input.quotes[0].slot.effectiveLeadHours,
        requestedFor: input.requestedFor,
        requestedWindow: input.fulfillment.requestedWindow,
        deliveryInstructions: input.fulfillment.deliveryInstructions || null,
        customerNotes: input.fulfillment.customerNotes || null,
        occasion: input.fulfillment.occasion || null,
        deliveryZoneIdSnapshot:
          input.fulfillment.method === "delivery" ? input.quotes[0].slot.zoneId : null,
        deliveryZoneNameSnapshot:
          input.fulfillment.method === "delivery" ? input.quotes[0].slot.zoneName : null,
        allergens: [...new Set(cakeRows.flatMap((cake) => cake.allergens))].sort(),
        servesMin: cakeRows.reduce((sum, cake) => sum + cake.servesMin, 0),
        servesMax: cakeRows.reduce((sum, cake) => sum + cake.servesMax, 0),
        designId: input.designId,
        cakeProductId: firstCake.cakeProductId,
        cakeName: cakeRows.length === 1 ? firstCake.cakeName : `${cakeRows.length} cakes`,
        cakeImageUrl: cakeRows.length === 1 ? firstCake.cakeImageUrl : null,
        cakes: { create: cakeRows },
        items: {
          create: aggregateLines.map((line, position) => ({ ...line, position })),
        },
      },
    });

    const response = responseFor(order, input.review);
    await tx.checkoutAttempt.update({
      where: { id: input.idempotencyKey },
      data: {
        status: "completed",
        orderId: order.id,
        response: asJson(response),
      },
    });
    await tx.notificationOutbox.create({
      data: outboxCreate({
        orderId: order.id,
        kind: "new_order",
        destination: input.notificationDestination,
        dedupeKey: `order:${order.id}:new`,
        payload: {
          ref: order.ref,
          totalPaise: order.totalPaise,
          requestedFor: order.requestedFor?.toISOString() ?? null,
          slot: order.deliverySlot,
        },
      }),
    });

    return { order, replay: false };
  }, { timeout: 30_000 });
}
