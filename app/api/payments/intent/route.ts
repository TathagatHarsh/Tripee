import {
  callerKey,
  CROSS_SITE_MESSAGE,
  crossSite,
  LIMITS,
  rateLimit,
  tooMany,
} from "@/lib/apiGuard";
import { openPaymentIntent } from "@/lib/checkoutPayment";
import {
  type CreatedOrder,
  responseFor,
  validateCheckout,
} from "@/lib/checkoutValidate";
import { rememberGuestOrders } from "@/lib/guestOrders";
import { log, requestId } from "@/lib/log";
import { keyId, paymentsEnabled } from "@/lib/razorpay";

async function replayResponse(order: CreatedOrder, traceId: string) {
  await rememberGuestOrders([order.ref]);
  return Response.json(
    { ...responseFor(order), duplicate: true },
    { headers: { "x-request-id": traceId } },
  );
}

const conflict = () =>
  Response.json(
    {
      error:
        "This checkout attempt belongs to a different basket. Reload checkout and try again.",
      code: "idempotency_conflict",
    },
    { status: 409 },
  );

const unavailable = () =>
  Response.json(
    {
      error:
        "Payments are unavailable right now. Nothing was charged. Please try again.",
      code: "payment_unavailable",
    },
    { status: 502 },
  );

/**
 * Step one of paying: check the basket exactly as /api/orders would, then bind a
 * Razorpay order to this checkout attempt at today's total. Nothing is charged
 * and no order exists until the browser comes back to /api/orders with a payment.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) {
    return Response.json(
      { error: "Payments are not enabled.", code: "payments_disabled" },
      { status: 404 },
    );
  }

  const traceId = requestId(req);
  if (crossSite(req)) {
    return Response.json(
      { error: CROSS_SITE_MESSAGE, code: "cross_site" },
      { status: 403, headers: { "x-request-id": traceId } },
    );
  }

  const limit = rateLimit("payment-intent", callerKey(req), LIMITS.orders);
  if (!limit.ok) return tooMany(limit, "payment attempts");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const validated = await validateCheckout(raw, traceId);
  if (validated.kind === "problem") return validated.response;
  if (validated.kind === "replay") return replayResponse(validated.order, traceId);

  const { body, hash, review } = validated.checked;
  let intent: Awaited<ReturnType<typeof openPaymentIntent>>;
  try {
    intent = await openPaymentIntent(body.idempotencyKey, hash, review.totalPaise);
  } catch (error) {
    log("error", "payment_intent_failed", { traceId, error: String(error) });
    return unavailable();
  }
  if (intent.kind === "conflict") return conflict();
  if (intent.kind === "unavailable") return unavailable();
  if (intent.kind === "completed") {
    // The order was placed since validation read the attempt: answer as a replay.
    const again = await validateCheckout(raw, traceId);
    if (again.kind === "replay") return replayResponse(again.order, traceId);
    return again.kind === "problem" ? again.response : conflict();
  }
  return Response.json({
    keyId: keyId(),
    razorpayOrderId: intent.record.razorpayOrderId,
    amountPaise: intent.record.amountPaise,
  });
}
