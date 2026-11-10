import "server-only";
import { db } from "./db";
import { requestRefund } from "./razorpay";
import { log } from "./log";

/** Persist before sending; a timeout retries the same gateway idempotency key. */
export async function durableRefund(paymentId: string): Promise<boolean> {
  try {
    const operation = await db.refundOperation.upsert({ where: { paymentId }, update: {}, create: { paymentId } });
    if (operation.status === "processed") {
      await db.order.updateMany({ where: { razorpayPaymentId: paymentId, status: "cancelled", paymentStatus: "paid" }, data: { paymentStatus: "refunded" } });
      await db.checkoutAttempt.updateMany({ where: { lastError: `refunding:${paymentId}` }, data: { lastError: `refunded:${paymentId}` } });
      return true;
    }
    const result = await requestRefund(paymentId, operation.refundId);
    await db.refundOperation.updateMany({ where: { paymentId, status: { not: "processed" } }, data: {
      refundId: result.id, status: result.status, lastError: null,
      nextCheckAt: new Date(Date.now() + 60_000),
    } });
    if (result.status === "processed") {
      await db.order.updateMany({ where: { razorpayPaymentId: paymentId, status: "cancelled", paymentStatus: "paid" }, data: { paymentStatus: "refunded" } });
      await db.checkoutAttempt.updateMany({ where: { lastError: `refunding:${paymentId}` }, data: { lastError: `refunded:${paymentId}` } });
    }
    return result.status === "processed";
  } catch (error) {
    log("error", "refund_pending_retry", { paymentId, error: String(error) });
    await db.refundOperation.updateMany({ where: { paymentId, status: { not: "processed" } }, data: { lastError: String(error).slice(0, 500), nextCheckAt: new Date(Date.now() + 60_000) } }).catch(() => {});
    return false;
  }
}

/**
 * Null when no refund of this payment was ever recorded. A row that is not `failed`
 * (pending, or a request that errored) is retried by reconcileRefunds, so the money is on its way.
 */
export async function refundOperationStatus(paymentId: string): Promise<string | null> {
  return (await db.refundOperation.findUnique({ where: { paymentId }, select: { status: true } }))?.status ?? null;
}

export async function reconcileRefunds() {
  // Also recover a crash between the cancellation commit and the first refund call.
  const cancelled = await db.$queryRaw<{ razorpayPaymentId: string }[]>`
    SELECT o."razorpayPaymentId" FROM "Order" o
    LEFT JOIN "RefundOperation" r ON r."paymentId" = o."razorpayPaymentId"
    WHERE o."status" = 'cancelled' AND o."paymentStatus" = 'paid'
      AND o."razorpayPaymentId" IS NOT NULL AND (r."paymentId" IS NULL OR r."status" = 'processed')
    ORDER BY o."updatedAt" ASC LIMIT 5`;

  for (const order of cancelled) await db.refundOperation.upsert({ where: { paymentId: order.razorpayPaymentId! }, update: {}, create: { paymentId: order.razorpayPaymentId! } });
  const interrupted = await db.$queryRaw<{ lastError: string }[]>`
    SELECT c."lastError" FROM "CheckoutAttempt" c
    LEFT JOIN "RefundOperation" r ON r."paymentId" = substring(c."lastError" from 11)
    WHERE c."lastError" LIKE 'refunding:%' AND (r."paymentId" IS NULL OR r."status" = 'processed')
    ORDER BY c."updatedAt" ASC LIMIT 5`;

  for (const attempt of interrupted) {
    const paymentId = attempt.lastError!.slice("refunding:".length);
    await db.refundOperation.upsert({ where: { paymentId }, update: {}, create: { paymentId } });
  }
  // Repair local records even if the process died after recording gateway settlement.
  for (const order of cancelled) {
    const settled = await db.refundOperation.findUnique({ where: { paymentId: order.razorpayPaymentId! } });
    if (settled?.status === "processed") await durableRefund(settled.paymentId);
  }
  for (const attempt of interrupted) {
    const settled = await db.refundOperation.findUnique({ where: { paymentId: attempt.lastError!.slice("refunding:".length) } });
    if (settled?.status === "processed") await durableRefund(settled.paymentId);
  }
  const pending = await db.refundOperation.findMany({ where: { status: { notIn: ["processed", "failed"] }, nextCheckAt: { lte: new Date() } }, take: 3, orderBy: { nextCheckAt: "asc" } });
  for (const operation of pending) {
    const claimed = await db.refundOperation.updateMany({ where: { paymentId: operation.paymentId, nextCheckAt: operation.nextCheckAt }, data: { nextCheckAt: new Date(Date.now() + 120_000) } });
    if (claimed.count) await durableRefund(operation.paymentId);
  }
  return { checked: pending.length };
}
