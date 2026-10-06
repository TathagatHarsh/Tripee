import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { createRazorpayOrder, IntentRecord } from "./razorpay";

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
