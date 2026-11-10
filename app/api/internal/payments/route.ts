import { reconcilePayments } from "@/lib/paymentRecovery";
import { reconcileRefunds } from "@/lib/refunds";
export const maxDuration = 60;
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WORKER_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not authorised" }, { status: 401 });
  const [payments, refunds] = await Promise.all([reconcilePayments(), reconcileRefunds()]);
  return Response.json({ payments, refunds });
}
