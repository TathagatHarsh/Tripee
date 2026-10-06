import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentProof } from "./checkout";
import { log } from "./log";

/**
 * Razorpay over plain fetch: create an order, check a payment signature, refund.
 *
 * The secret is read here and nowhere else, and each function reads the
 * environment when it is called rather than at import, so a deployment without
 * keys simply takes no payment instead of failing to start.
 */

const API = "https://api.razorpay.com/v1";

/** What `CheckoutAttempt.response` holds between creating the intent and the order. */
export const IntentRecord = z.object({
  razorpayOrderId: z.string(),
  amountPaise: z.number().int().positive(),
});
export type IntentRecord = z.infer<typeof IntentRecord>;

export function paymentsEnabled(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function keyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export function isTestKey(): boolean {
  return keyId().startsWith("rzp_test_");
}

/** Razorpay signs `order_id|payment_id` with the key secret; anything else is forged. */
export function verifySignature(proof: PaymentProof): boolean {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(`${proof.razorpayOrderId}|${proof.razorpayPaymentId}`)
    .digest("hex");
  const given = Buffer.from(proof.razorpaySignature);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** True only when the proof is for the order this attempt created, at today's total. */
export function paymentMatches(
  attemptResponse: unknown,
  proof: PaymentProof,
  totalPaise: number,
): boolean {
  const intent = IntentRecord.safeParse(attemptResponse);
  return (
    intent.success &&
    intent.data.razorpayOrderId === proof.razorpayOrderId &&
    intent.data.amountPaise === totalPaise
  );
}

async function post(path: string, body: unknown): Promise<Response> {
  const auth = Buffer.from(
    `${keyId()}:${process.env.RAZORPAY_KEY_SECRET ?? ""}`,
  ).toString("base64");
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The Razorpay order id, or null when Razorpay could not be reached or refused. */
export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
): Promise<string | null> {
  try {
    const res = await post("/orders", { amount: amountPaise, currency: "INR", receipt });
    if (!res.ok) {
      log("error", "razorpay_order_failed", { status: res.status, receipt });
      return null;
    }
    const { id } = (await res.json()) as { id?: unknown };
    if (typeof id === "string" && id) return id;
    log("error", "razorpay_order_failed", { reason: "no id in reply", receipt });
    return null;
  } catch (error) {
    log("error", "razorpay_order_failed", { error: String(error), receipt });
    return null;
  }
}

/** Full refund of one payment. */
export async function refund(paymentId: string): Promise<boolean> {
  try {
    const res = await post(`/payments/${paymentId}/refund`, {});
    if (res.ok) return true;
    log("error", "refund_failed", { status: res.status, paymentId });
  } catch (error) {
    log("error", "refund_failed", { error: String(error), paymentId });
  }
  return false;
}
