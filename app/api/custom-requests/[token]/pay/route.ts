import { after } from "next/server";
import { callerKey, CROSS_SITE_MESSAGE, crossSite, LIMITS, rateLimit, tooMany } from "@/lib/apiGuard";
import { PaymentProof } from "@/lib/checkout";
import { payCustomRequest } from "@/lib/customRequests";
import { db } from "@/lib/db";
import { rememberGuestOrders } from "@/lib/guestOrders";
import { log } from "@/lib/log";
import { dispatchPendingNotifications } from "@/lib/notifications";
import { fetchPayment, paymentsEnabled, verifySignature } from "@/lib/razorpay";

const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status });

/** Confirms a payment for a quote. The Razorpay webhook does the same through recoverPayment if this never arrives. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (crossSite(req)) return fail(CROSS_SITE_MESSAGE, 403);
  const limit = rateLimit("custom-payment", callerKey(req), LIMITS.orders);
  if (!limit.ok) return tooMany(limit, "payment attempts");
  // Without the key secret every signature would check against an empty key.
  if (!paymentsEnabled()) return fail("Payments are not enabled.", 404);

  const proof = PaymentProof.safeParse(await req.json().catch(() => null));
  if (!proof.success || !verifySignature(proof.data)) return fail("We couldn't verify that payment.", 400);
  const payment = proof.data;
  const { token } = await ctx.params;
  const r = await db.customRequest.findUnique({ where: { token }, select: { id: true } });
  if (!r) return fail("Not found", 404);

  // As /api/orders: an authorised but uncaptured payment is not money yet. The webhook finishes it once captured.
  const captured = await fetchPayment(payment.razorpayPaymentId);
  if (!captured || captured.status !== "captured")
    return fail("Your payment is still being verified. Please don't pay again; we'll confirm on WhatsApp.", 503, { pending: true });
  if (captured.order_id !== payment.razorpayOrderId || captured.amount_refunded !== 0)
    return fail(`This payment cannot be used for this quote. Contact us with payment ${payment.razorpayPaymentId}.`, 409);

  let result;
  try {
    result = await payCustomRequest(r.id, payment);
  } catch (error) {
    log("error", "custom_payment_failed", { id: r.id, paymentId: payment.razorpayPaymentId, error: String(error) });
    return fail("Something went wrong on our side. Your payment is safe; please press Pay again to finish.", 500, { retry: true });
  }
  if (result.kind === "refunded") return fail("This quote is no longer available, so your payment is being refunded.", 409, { refunded: true });
  if (result.kind === "unmatched") return fail(`This payment cannot be used for this quote. Contact us with payment ${payment.razorpayPaymentId}.`, 409);

  // Paid here, or by the webhook a moment earlier: either way this browser may now open the order.
  const orderRef = result.kind === "paid" ? result.orderRef
    : (await db.order.findUnique({ where: { razorpayPaymentId: payment.razorpayPaymentId }, select: { ref: true } }))?.ref;
  if (!orderRef) return fail("Something went wrong on our side. Your payment is safe; please press Pay again to finish.", 500, { retry: true });
  await rememberGuestOrders([orderRef]);
  after(() => dispatchPendingNotifications(5).catch(() => log("error", "notification_dispatch_failed", { orderRef })));
  return Response.json({ orderRef });
}
