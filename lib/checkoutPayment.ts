import "server-only";
import { Prisma } from "@prisma/client";
import type { PaymentProof } from "./checkout";
import { CREATED, responseFor } from "./checkoutValidate";
import { db } from "./db";
import { formatINR } from "./format";
import { rememberGuestOrders } from "./guestOrders";
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

export type RefundOutcome = "refunded" | "already_refunded" | "held" | "failed";

/**
 * Give one verified payment back, after making sure it can no longer buy an
 * order. Call it only once the proof's signature has been checked.
 *
 * The payment is claimed before the refund: whichever attempt still binds the
 * proof's Razorpay order is cleared under the same advisory lock `createOrder`
 * takes, whatever key the failing request carried. Without that, a refunded
 * proof could still be spent by confirming on the key that holds the binding.
 * The binding is not restored when the refund fails: the customer is told to
 * contact us rather than being left able to buy an order with money that may
 * already be on its way back.
 *
 * `held` means an order already owns the payment, so nothing is touched. The
 * attempt is marked `refunding:<id>` by the claim and `refunded:<id>` once
 * Razorpay accepts the refund, so only a finished refund is ever reported as
 * done on a retry. Never throws: a failed lookup is `failed` and refunds nothing.
 */
export async function refundPayment(
  proof: PaymentProof,
): Promise<{ outcome: RefundOutcome; amountPaise: number | null }> {
  const paymentId = proof.razorpayPaymentId;
  const refunding = `refunding:${paymentId}`;
  const refunded = `refunded:${paymentId}`;
  const holds = { where: { razorpayPaymentId: paymentId }, select: { id: true } };
  let claimedId: string | null = null;
  let amountPaise: number | null = null;

  try {
    const bound = await db.checkoutAttempt.findFirst({
      where: { response: { path: ["razorpayOrderId"], equals: proof.razorpayOrderId } },
      select: { id: true },
    });
    if (bound) {
      const claim = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`checkout:${bound.id}`}))`;
        if (await tx.order.findFirst(holds)) return "held" as const;
        const now = await tx.checkoutAttempt.findUnique({ where: { id: bound.id } });
        const record = IntentRecord.safeParse(now?.response);
        if (
          !now || now.status === "completed" ||
          !record.success || record.data.razorpayOrderId !== proof.razorpayOrderId
        ) {
          return null; // changed since the first read: nothing left to clear
        }
        await tx.checkoutAttempt.update({
          where: { id: bound.id },
          data: { status: "failed", lastError: refunding, response: Prisma.DbNull },
        });
        return record.data.amountPaise;
      });
      if (claim === "held") return { outcome: "held", amountPaise: null };
      if (claim !== null) {
        claimedId = bound.id;
        amountPaise = claim;
      }
    } else {
      if (await db.order.findFirst(holds)) return { outcome: "held", amountPaise: null };
      const marked = await db.checkoutAttempt.findMany({
        where: { lastError: { in: [refunded, refunding] } },
        select: { id: true, lastError: true },
      });
      if (marked.some((a) => a.lastError === refunded)) {
        return { outcome: "already_refunded", amountPaise: null };
      }
      // An earlier refund of this payment failed: try again, and finish the marker when it works.
      claimedId = marked[0]?.id ?? null;
    }
  } catch (error) {
    // Without knowing whether an order holds the payment, refunding it could give the cake away.
    log("error", "refund_lookup_failed", { paymentId, error: String(error) });
    return { outcome: "failed", amountPaise: null };
  }

  // ponytail: two simultaneous requests for one proof can both reach Razorpay; the second is refused and reads as unrefunded.
  if (!(await refund(paymentId))) return { outcome: "failed", amountPaise };
  if (claimedId) {
    try {
      await db.checkoutAttempt.updateMany({
        where: { id: claimedId, lastError: refunding },
        data: { lastError: refunded },
      });
    } catch (error) {
      // The money is back; the attempt stays `refunding`, so a retry asks Razorpay again and is refused.
      log("error", "refund_record_failed", { paymentId, error: String(error) });
    }
  }
  return { outcome: "refunded", amountPaise };
}

/**
 * Give a cancelled order's payment back, once the cancel has committed. Every
 * failure is logged and swallowed: a Razorpay outage must not undo or fail a
 * cancel, and the order simply stays `paid` so staff can see it was not refunded.
 * Only one caller sees a cancel move the order, so this runs once per order.
 */
export async function refundCancelledOrder(ref: string): Promise<void> {
  let paymentId: string;
  try {
    const order = await db.order.findUnique({
      where: { ref },
      select: { paymentStatus: true, razorpayPaymentId: true },
    });
    if (order?.paymentStatus !== "paid" || !order.razorpayPaymentId) return;
    paymentId = order.razorpayPaymentId;
  } catch (error) {
    log("error", "refund_cancelled_lookup_failed", { ref, error: String(error) });
    return;
  }

  if (!(await refund(paymentId))) return; // `refund` has logged why
  try {
    await db.order.updateMany({
      where: { ref, paymentStatus: "paid" },
      data: { paymentStatus: "refunded" },
    });
  } catch (error) {
    // The money is back but the order still reads `paid`; staff must not refund it again.
    log("error", "refund_cancelled_record_failed", { ref, paymentId, error: String(error) });
  }
}

/**
 * Turn a failed order into a refunded payment, and say so. A response that is
 * not a success has already cost the customer their money, so it is replaced by
 * one that reports the refund or tells them to contact us. A payment an order
 * already holds is answered with that order, as a replay: whatever this request
 * got wrong, the customer has their cake. Only if that order can't be read does
 * the original response stand.
 */
export async function refundUnlessOk(res: Response, proof: PaymentProof): Promise<Response> {
  if (res.ok) return res;

  const { outcome, amountPaise } = await refundPayment(proof);
  const requestId = res.headers.get("x-request-id");
  const headers = requestId ? { "x-request-id": requestId } : undefined;
  if (outcome === "held") {
    const order = await db.order
      .findUnique({ where: { razorpayPaymentId: proof.razorpayPaymentId }, select: CREATED })
      .catch(() => null);
    if (!order) return res;
    await rememberGuestOrders([order.ref]);
    return Response.json({ ...responseFor(order), duplicate: true }, { headers });
  }

  const done = outcome !== "failed";
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.error === "string" ? ` ${body.error}` : "";
  const amount = amountPaise === null ? "" : ` of ${formatINR(amountPaise)}`;
  const error = done
    ? `We couldn't place the order, so your payment${amount} has been refunded.${reason}`
    : `We couldn't place the order and couldn't refund your payment automatically. Contact us with payment ${proof.razorpayPaymentId}.${reason}`;
  return Response.json({ ...body, refunded: done, error }, { status: res.status, headers });
}
