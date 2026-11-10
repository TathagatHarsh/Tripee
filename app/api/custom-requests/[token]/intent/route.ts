import { callerKey, CROSS_SITE_MESSAGE, crossSite, LIMITS, rateLimit, tooMany } from "@/lib/apiGuard";
import { openPaymentIntent } from "@/lib/checkoutPayment";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { keyId, paymentCheckoutAvailable } from "@/lib/razorpay";

const fail = (error: string, status: number) => Response.json({ error }, { status });
const GONE = "This quote is no longer available";

/** Binds a Razorpay order to a live quote. Nothing is charged here. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (crossSite(req)) return fail(CROSS_SITE_MESSAGE, 403);
  const limit = rateLimit("custom-payment", callerKey(req), LIMITS.orders);
  if (!limit.ok) return tooMany(limit, "payment attempts");
  if (!paymentCheckoutAvailable()) return fail("Payments are unavailable right now. Nothing was charged. Please try again.", 502);

  const { token } = await ctx.params;
  const r = await db.customRequest.findUnique({ where: { token }, select: { id: true, status: true, quotePaise: true, quoteExpiresAt: true } });
  if (!r) return fail("Not found", 404);
  if (r.status !== "quoted" || !r.quotePaise || !r.quoteExpiresAt || r.quoteExpiresAt <= new Date()) return fail(GONE, 409);

  const key = `custom:${r.id}`;
  try {
    const intent = await openPaymentIntent(key, key, r.quotePaise);
    if (intent.kind === "ok") return Response.json({ razorpayOrderId: intent.record.razorpayOrderId, amountPaise: intent.record.amountPaise, keyId: keyId() });
    if (intent.kind !== "unavailable") return fail(GONE, 409);
  } catch (error) {
    log("error", "custom_payment_intent_failed", { id: r.id, error: String(error) });
  }
  return fail("Payments are unavailable right now. Nothing was charged. Please try again.", 502);
}
