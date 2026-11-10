import "server-only";
import { z } from "zod";
import { db } from "./db";
import { fetchPayment, gatewayGet, IntentRecord } from "./razorpay";
import { placeCheckout } from "./placeOrder";
import { refundPayment } from "./checkoutPayment";
import { startAssignment } from "./assignment";
import { payCustomRequest } from "./customRequests";
import { log } from "./log";

/** Both webhooks and polling fetch authoritative payment data before fulfilling. */
export async function recoverPayment(paymentId: string) {
  const payment = await fetchPayment(paymentId);
  if (!payment || payment.id !== paymentId) throw new Error("Payment verification unavailable");
  if (payment.status !== "captured" || payment.amount_refunded !== 0 || payment.currency !== "INR") return;
  const gatewayOrder = z.object({ id: z.string(), receipt: z.string(), amount: z.number(), currency: z.string() }).parse(await gatewayGet(`/orders/${encodeURIComponent(payment.order_id)}`));
  if (gatewayOrder.id !== payment.order_id || gatewayOrder.amount !== payment.amount || gatewayOrder.currency !== "INR") throw new Error("Payment order mismatch");
  const proof = { razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id, razorpaySignature: "" };
  if (gatewayOrder.receipt.startsWith("custom:")) {
    const result = await payCustomRequest(gatewayOrder.receipt.slice("custom:".length), proof);
    // The receipt proves this Razorpay order was made for that quote, so a payment it can't use
    // (a late or second one after a refund cleared the binding) goes back; `held` protects one an order owns.
    const refund = result.kind === "unmatched" ? (await refundPayment(proof)).outcome : null;
    // Throwing makes the webhook answer 503, so Razorpay redelivers and the refund is tried again.
    if (result.kind === "refund_failed" || refund === "failed") throw new Error("Custom payment refund failed; retry required");
    return;
  }
  const recovery = await db.paymentRecovery.findUnique({ where: { id: gatewayOrder.receipt } });
  if (!recovery) throw new Error("Payment has no saved checkout; manual reconciliation required");
  // Covers a process dying after Razorpay creates the order but before its ID is saved.
  await db.checkoutAttempt.upsert({ where: { id: recovery.id }, update: {}, create: {
    id: recovery.id, payloadHash: recovery.payloadHash, expiresAt: new Date(Date.now() + 30 * 86400000),
    response: { razorpayOrderId: payment.order_id, amountPaise: payment.amount },
  } });
  const bound = await db.checkoutAttempt.findUnique({ where: { id: recovery.id } });
  const intent = IntentRecord.safeParse(bound?.response);
  if (intent.success && intent.data.razorpayOrderId === payment.order_id && intent.data.amountPaise !== payment.amount) {
    await refundPayment(proof);
    await db.paymentRecovery.updateMany({ where: { id: recovery.id, status: { not: "completed" } }, data: { status: "refund_required", lastError: "Captured amount differs from saved intent" } });
    return;
  }
  const response = await placeCheckout(recovery.request, proof, `recovery:${payment.id}`, recovery.userId);
  if (response.ok) {
    const body = await response.json();
    await db.paymentRecovery.update({ where: { id: recovery.id }, data: { status: "completed", lastError: null } });
    await startAssignment(body.order.ref).catch(() => {});
  } else if (response.status < 500) {
    const result = await refundPayment(proof);
    const latest = await db.checkoutAttempt.findUnique({ where: { id: recovery.id } });
    const nextIntent = IntentRecord.safeParse(latest?.response);
    const newerIntent = nextIntent.success && nextIntent.data.razorpayOrderId !== payment.order_id;
    await db.paymentRecovery.updateMany({ where: { id: recovery.id, status: { not: "completed" } }, data: {
      status: result.outcome === "held" ? "completed" : newerIntent ? "pending" : "refund_required",
      lastError: (await response.text()).slice(0, 500),
    } });
  } else throw new Error(`Order recovery HTTP ${response.status}`);
}

export async function reconcilePayments() {
  const pending = await db.paymentRecovery.findMany({ where: { status: "pending", nextCheckAt: { lte: new Date() } }, take: 1, orderBy: { nextCheckAt: "asc" } });
  for (const recovery of pending) {
    const claimed = await db.paymentRecovery.updateMany({ where: { id: recovery.id, nextCheckAt: recovery.nextCheckAt }, data: { nextCheckAt: new Date(Date.now() + 5 * 60_000) } });
    if (!claimed.count) continue;
    try {
      const attempt = await db.checkoutAttempt.findUnique({ where: { id: recovery.id } });
      if (attempt?.status === "completed") {
        await db.paymentRecovery.update({ where: { id: recovery.id }, data: { status: "completed" } });
        continue;
      }
      const intent = IntentRecord.safeParse(attempt?.response);
      if (!intent.success) continue; // A signed webhook can recover an unsaved gateway order ID.
      const result = z.object({ items: z.array(z.object({ id: z.string(), status: z.string() })) }).parse(await gatewayGet(`/orders/${encodeURIComponent(intent.data.razorpayOrderId)}/payments`));
      for (const payment of result.items.filter(p => p.status === "captured")) await recoverPayment(payment.id);
    } catch (error) {
      log("error", "payment_recovery_failed", { attemptId: recovery.id, error: String(error) });
      await db.paymentRecovery.update({ where: { id: recovery.id }, data: { lastError: String(error).slice(0, 500) } });
    }
  }
  return { checked: pending.length };
}
