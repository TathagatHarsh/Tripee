import { dispatchPendingNotifications } from "@/lib/notifications";

export async function POST(req: Request) {
  const secret = process.env.NOTIFICATION_WORKER_SECRET;
  const supplied = req.headers.get("authorization");
  if (!secret || supplied !== `Bearer ${secret}`) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }

  return Response.json(await dispatchPendingNotifications());
}

