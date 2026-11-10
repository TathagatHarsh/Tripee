import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { recoverPayment } from "@/lib/paymentRecovery";
import { log } from "@/lib/log";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook unavailable" }, { status: 503 });
  const raw = await req.text();
  const supplied = Buffer.from(req.headers.get("x-razorpay-signature") ?? "");
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const event = z.object({ event: z.string(), payload: z.unknown() }).parse(JSON.parse(raw));
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payload = z.object({ payment: z.object({ entity: z.object({ id: z.string().regex(/^pay_[A-Za-z0-9]+$/) }) }) }).parse(event.payload);
      await recoverPayment(payload.payment.entity.id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    log("error", "razorpay_webhook_failed", { error: String(error) });
    return Response.json({ error: "Recovery failed; retry required" }, { status: 503 });
  }
}
