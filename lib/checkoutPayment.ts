import "server-only";
import { Prisma } from "@prisma/client";
import type { PaymentProof } from "./checkout";
import { db } from "./db";
import { formatINR } from "./format";
import { log } from "./log";
import { createRazorpayOrder, IntentRecord, refund } from "./razorpay";

/**
 * Bind a Razorpay order to a checkout attempt, so the payment that comes back
 * can be matched to this basket at this price and no other.
 *
 * The binding lives in `CheckoutAttempt.response` until the order replaces it.
 * Asking again with the same key and amount hands back the same Razorpay order;
 * a changed amount makes a new one; a changed basket is refused. An attempt that
 * has already become an order is never touched: the caller replays it instead.
 */
export async function openPaymentIntent(
  key: string,
  hash: string,
  amountPaise: number,
): Promise<
  | { kind: "ok"; record: IntentRecord }
  | { kind: "conflict" }
  | { kind: "completed" }
  | { kind: "unavailable" }
> {
  // ponytail: no lock, two concurrent intents can make two Razorpay orders; the last stored wins and the client guards double clicks.
  const previous = await db.checkoutAttempt.findUnique({ where: { id: key } });
  if (previous?.status === "completed") return { kind: "completed" };
  if (previous && previous.payloadHash !== hash) return { kind: "conflict" };

  const stored = IntentRecord.safeParse(previous?.response);
  if (stored.success && stored.data.amountPaise === amountPaise) {
    return { kind: "ok", record: stored.data };
  }

  const razorpayOrderId = await createRazorpayOrder(amountPaise, key);
  if (!razorpayOrderId) return { kind: "unavailable" };

  const record: IntentRecord = { razorpayOrderId, amountPaise };
  if (!previous) {
    try {
      await db.checkoutAttempt.create({
        data: {
          id: key,
          payloadHash: hash,
          status: "processing",
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
          response: record,
        },
      });
      return { kind: "ok", record };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
      // A row appeared while Razorpay was being called: read it and apply the same rules.
      const raced = await db.checkoutAttempt.findUnique({ where: { id: key } });
      if (!raced) throw error;
      if (raced.status === "completed") return { kind: "completed" };
      if (raced.payloadHash !== hash) return { kind: "conflict" };
    }
  }

  // Never write over an attempt that became an order while Razorpay was being called.
  const { count } = await db.checkoutAttempt.updateMany({
    where: { id: key, status: { not: "completed" } },
    data: { status: "processing", lastError: null, response: record },
  });
  return count === 0 ? { kind: "completed" } : { kind: "ok", record };
}

/**
 * Turn a failed order into a refunded payment. Call it only once the proof's
 * signature has been verified: from then on the customer has paid, so every
 * answer that is not a success must give the money back or say plainly that it
 * could not.
 *
 * Nothing is refunded when an order already holds the payment, whatever the
 * response says: the order exists and the money is spent. After a refund the
 * attempt is marked `refunded:<paymentId>`, so the same proof arriving again
 * is answered as refunded without a second Razorpay call, which would be
 * refused as already refunded and read as a failure.
 */
export async function refundUnlessOk(
  res: Response,
  key: string,
  proof: PaymentProof,
): Promise<Response> {
  if (res.ok) return res;

  const paymentId = proof.razorpayPaymentId;
  const marker = `refunded:${paymentId}`;
  let attempt;
  try {
    const held = await db.order.findFirst({
      where: { razorpayPaymentId: paymentId },
      select: { id: true },
    });
    if (held) return res;
    attempt = await db.checkoutAttempt.findUnique({ where: { id: key } });
  } catch (error) {
    // Without knowing whether an order holds the payment, refunding it could give the cake away.
    log("error", "refund_lookup_failed", { paymentId, error: String(error) });
    return res;
  }

  // ponytail: no lock, two simultaneous failures of one proof can both reach Razorpay; the second is refused and reads as unrefunded.
  const already = attempt?.lastError === marker;
  const done = already || (await refund(paymentId));
  if (done && !already) {
    try {
      await db.checkoutAttempt.updateMany({
        where: { id: key, status: { not: "completed" } },
        data: { status: "failed", lastError: marker, response: Prisma.DbNull },
      });
    } catch (error) {
      // The money is back; a lost marker only costs a second, refused, refund call on a retry.
      log("error", "refund_record_failed", { paymentId, error: String(error) });
    }
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.error === "string" ? ` ${body.error}` : "";
  const record = IntentRecord.safeParse(attempt?.response);
  const amount = record.success ? ` of ${formatINR(record.data.amountPaise)}` : "";
  const error = done
    ? `We couldn't place the order, so your payment${amount} has been refunded.${reason}`
    : `We couldn't place the order and couldn't refund your payment automatically. Contact us with payment ${paymentId}.${reason}`;
  const requestId = res.headers.get("x-request-id");
  return Response.json(
    { ...body, refunded: done, error },
    { status: res.status, headers: requestId ? { "x-request-id": requestId } : undefined },
  );
}
