import { after } from "next/server";
import { z } from "zod";
import { callerKey, CROSS_SITE_MESSAGE, crossSite, LIMITS, rateLimit, tooMany } from "@/lib/apiGuard";
import { getViewer } from "@/lib/auth";
import { PaymentProof } from "@/lib/checkout";
import { refundUnlessOk } from "@/lib/checkoutPayment";
import { db } from "@/lib/db";
import { rememberGuestOrders } from "@/lib/guestOrders";
import { log, requestId } from "@/lib/log";
import { IntentRecord, paymentsEnabled, offlinePaymentsEnabled, fetchPayment, verifySignature } from "@/lib/razorpay";
import { placeCheckout } from "@/lib/placeOrder";
import { startAssignment } from "@/lib/assignment";
import { dispatchPendingNotifications } from "@/lib/notifications";

async function place(raw: unknown, payment: PaymentProof | null, traceId: string) {
  const viewer = await getViewer();
  const response = await placeCheckout(raw, payment, traceId, viewer?.profile.id ?? null);
  if (response.ok) {
    const receipt = await response.clone().json();
    await rememberGuestOrders([receipt.order.ref]);
    after(async () => {
      await startAssignment(receipt.order.ref).catch(() => log("error", "assignment_pending_retry", { orderRef: receipt.order.ref }));
      await dispatchPendingNotifications(5).catch(() => log("error", "notification_dispatch_failed", { traceId }));
    });
  }
  return response;
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

  if (!paymentsEnabled()) {
    if (offlinePaymentsEnabled()) return place(raw, null, traceId);
    return Response.json({ error: "Checkout is temporarily unavailable. Please try again later.", code: "payment_unavailable" }, { status: 503 });
  }

  const paid = PaidRequest.safeParse(raw);
  if (!paid.success) {
    return Response.json(
      { error: "Payment is required to place this order.", code: "payment_required" },
      { status: 402 },
    );
  }
  const { payment } = paid.data;
  if (!verifySignature(payment)) {
    return Response.json(
      { error: "We couldn't verify that payment.", code: "payment_invalid" },
      { status: 400 },
    );
  }

  const captured = await fetchPayment(payment.razorpayPaymentId);
  if (captured && captured.id === payment.razorpayPaymentId && captured.order_id === payment.razorpayOrderId &&
      captured.currency === "INR" && captured.amount_refunded === captured.amount) {
    return Response.json({ error: "This payment has been refunded. You can start a new payment for this order.", code: "payment_refunded", refunded: true }, { status: 409 });
  }
  if (!captured || captured.status !== "captured") {
    return Response.json({ error: "Your payment is still being verified. Keep this checkout open and retry; do not pay again.", code: "payment_pending" }, { status: 503 });
  }
  const attempt = await db.checkoutAttempt.findUnique({ where: { id: paid.data.idempotencyKey } });
  const intent = IntentRecord.safeParse(attempt?.response);
  if (captured.id !== payment.razorpayPaymentId || captured.order_id !== payment.razorpayOrderId ||
      captured.currency !== "INR" || captured.amount_refunded !== 0 ||
      (intent.success && captured.amount !== intent.data.amountPaise)) {
    return Response.json({ error: "This payment cannot be used for this order. Contact support with your payment ID.", code: "payment_unusable" }, { status: 409 });
  }

  // From here the customer has paid: whatever goes wrong, including a throw, ends in a refund.
  let res: Response;
  try {
    res = await place(raw, payment, traceId);
  } catch (error) {
    log("error", "order_place_failed", { traceId, error: String(error) });
    res = Response.json({ error: "Something went wrong on our side; please try again.", code: "server_error" }, { status: 500 });
  }
  return refundUnlessOk(res, payment);
}

const PaidRequest = z.object({ idempotencyKey: z.string().uuid(), payment: PaymentProof });
