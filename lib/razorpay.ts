import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentProof } from "./checkout";
import { log } from "./log";

/**
 * Razorpay over plain fetch: create an order, check a payment signature, refund.
 *
 * The secret is read here and nowhere else, and each function reads the
 * environment when it is called rather than at import, so missing keys can fail checkout closed without preventing startup.
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

/** Unpaid checkout must be an explicit operator decision. */
export function offlinePaymentsEnabled(): boolean {
  return process.env.PAYMENT_MODE === "offline" && !process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_KEY_SECRET;
}

export async function fetchPayment(paymentId: string) {
  try {
    const auth = Buffer.from(`${keyId()}:${process.env.RAZORPAY_KEY_SECRET ?? ""}`).toString("base64");
    const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const parsed = z.object({ id: z.string(), order_id: z.string(), status: z.string(),
      amount: z.number().int().positive(), currency: z.string(), amount_refunded: z.number().int().nonnegative(),
    }).safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** New production charges require the recovery endpoints' secrets as well. */
export function paymentCheckoutAvailable(): boolean {
  return paymentsEnabled() && (process.env.NODE_ENV !== "production" ||
    Boolean(process.env.RAZORPAY_WEBHOOK_SECRET && process.env.PAYMENT_WORKER_SECRET));
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
    // A hung Razorpay must not hang a cancel or a confirm: an abort is caught as any other failure.
    signal: AbortSignal.timeout(10_000),
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

export async function gatewayGet(path: string): Promise<unknown> {
  const auth = Buffer.from(`${keyId()}:${process.env.RAZORPAY_KEY_SECRET ?? ""}`).toString("base64");
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Basic ${auth}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Razorpay HTTP ${response.status}`);
  return response.json();
}

export async function requestRefund(paymentId: string, refundId: string | null) {
  const schema = z.object({ id: z.string().startsWith("rfnd_"), payment_id: z.string(), status: z.enum(["pending", "processed", "failed"]) });
  let body: unknown;
  if (refundId) body = await gatewayGet(`/refunds/${encodeURIComponent(refundId)}`);
  else {
    const auth = Buffer.from(`${keyId()}:${process.env.RAZORPAY_KEY_SECRET ?? ""}`).toString("base64");
    const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", "X-Refund-Idempotency": `tripee-full-${paymentId}` },
      body: JSON.stringify({ speed: "normal" }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Razorpay refund HTTP ${response.status}`);
    body = await response.json();
  }
  const result = schema.parse(body);
  if (result.payment_id !== paymentId) throw new Error("Refund payment mismatch");
  return result;
}
