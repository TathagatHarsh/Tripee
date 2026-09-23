import { customerStatus } from "@/lib/orders";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { holdsGuestOrder } from "@/lib/guestOrders";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const guest = await holdsGuestOrder(ref);
  const viewer = guest ? null : await getViewer();
  if (!guest && !viewer)
    return Response.json({ error: "Order not found" }, { status: 404 });
  const order = await db.order.findFirst({
    where: { ref, ...(guest ? {} : { userId: viewer!.profile.id }) },
    select: { status: true, fulfillmentMethod: true },
  });
  if (!order)
    return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json({ status: order.status, ...customerStatus(order.status, order.fulfillmentMethod === 'pickup') });
}
