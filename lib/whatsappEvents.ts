import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { adminNumbers, normalizePhone, siteUrl, whatsappConfigured } from "./whatsapp";
import { adminNewOrderMessage, offerMessage, queueWhatsApp, updateMessage, type OrderFacts } from "./whatsappMessages";

type Tx = Prisma.TransactionClient;
const CAP = 120; // Meta template parameter cap applied by cleanParam in whatsappMessages

export async function loadOrderFacts(tx: Tx, orderId: string): Promise<OrderFacts> {
  const o = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { cakeProduct: { select: { name: true } }, cakes: { orderBy: { position: "asc" }, select: { cakeName: true, sizeBand: true, eggType: true, message: true, config: true, cakeProduct: { select: { name: true } } } } },
  });
  const line = (c: { cakeName: string | null; sizeBand?: string | null; eggType?: string | null; config: unknown; cakeProduct: { name: string } | null }) => {
    const cfg = c.config as { size?: unknown; eggless?: unknown } | null;
    const size = c.sizeBand ?? (typeof cfg?.size === "string" ? cfg.size : null);
    const egg = c.eggType ?? (typeof cfg?.eggless === "boolean" ? (cfg.eggless ? "eggless" : "egg") : null);
    return [c.cakeName ?? c.cakeProduct?.name ?? "Cake", size, egg].filter(Boolean).join(" · ");
  };
  const list = (o.cakes.length ? o.cakes : [o]).map(line).join(" + ");
  const msg = o.cakes.map((c) => c.message?.replace(/\s+/g, " ").trim()).find(Boolean);
  const suffix = msg ? ` · message "${msg}"` : "";
  // The customer's message must survive the template cap: shorten the cake list, never the message.
  const cake = list.length + suffix.length > CAP ? `${list.slice(0, Math.max(0, CAP - suffix.length - 1))}…${suffix}` : list + suffix;
  return {
    orderId, ref: o.ref, totalPaise: o.totalPaise, dueAt: o.dueAt ?? o.requestedFor, cake,
    area: [o.addressLine2, o.city, o.pincode].filter(Boolean).join(", "),
  };
}

const ref = async (tx: Tx, orderId: string) => (await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { ref: true } })).ref;
const tellAdmin = (tx: Tx, orderId: string, vendorId: string | null | undefined, dedupeKey: string, orderRef: string, text: string) =>
  queueWhatsApp(tx, { orderId, vendorId, kind: "status_changed", to: adminNumbers(), dedupeKey, message: updateMessage(orderRef, text) });

export async function whatsappAssignmentEvent(tx: Tx, e: { orderId: string; assignmentId: string; eventId: string; name: string; reason?: string | null }) {
  if (!whatsappConfigured()) return;
  const row = await tx.vendorOrder.findUniqueOrThrow({ where: { id: e.assignmentId }, include: { vendor: { select: { name: true, phone: true } } } });
  const v = row.vendor.name, key = `wa:event:${e.eventId}`;
  const text = ({
    offered: `Offered to ${v} (${row.distanceKm === null ? "?" : row.distanceKm.toFixed(1)} km)${normalizePhone(row.vendor.phone) ? "" : " - no WhatsApp number on file"}`,
    accepted: `${v} accepted`,
    rejected: `${v} rejected: ${e.reason ?? "no reason"}`,
    expired: `${v} did not reply in time`,
    reassigned: `Taken from ${v} and reassigned`,
    in_preparation: `${v} started preparing`,
    ready: `${v} marked it ready`,
    handed_over: `${v} handed it over`,
  } as Record<string, string>)[e.name] ?? `${v}: ${e.name.replaceAll("_", " ")}`;
  if (e.name === "offered") {
    const facts = await loadOrderFacts(tx, e.orderId);
    const replyMinutes = row.offeredAt && row.expiresAt ? Math.round((row.expiresAt.getTime() - row.offeredAt.getTime()) / 60000) : Math.round(Number(process.env.ASSIGNMENT_RESPONSE_SECONDS ?? 900) / 60);
    await queueWhatsApp(tx, { orderId: e.orderId, vendorId: row.vendorId, kind: "vendor_assigned", to: [row.vendor.phone], dedupeKey: `${key}:vendor`, message: offerMessage(facts, { assignmentId: e.assignmentId, distanceKm: row.distanceKm, earningPaise: row.vendorEarningPaise, replyMinutes }) });
    return void (await tellAdmin(tx, e.orderId, row.vendorId, `${key}:admin`, facts.ref, text));
  }
  const orderRef = await ref(tx, e.orderId);
  await tellAdmin(tx, e.orderId, row.vendorId, `${key}:admin`, orderRef, text);
  if (e.name === "reassigned")
    await queueWhatsApp(tx, { orderId: e.orderId, vendorId: row.vendorId, kind: "status_changed", to: [row.vendor.phone], dedupeKey: `${key}:vendor`, message: updateMessage(orderRef, "Taken back by MakeYourCakes. Please stop work on this order.") });
}

export async function whatsappNoBakery(tx: Tx, orderId: string, dedupeKey: string) {
  if (!whatsappConfigured()) return;
  const r = await ref(tx, orderId);
  await tellAdmin(tx, orderId, null, dedupeKey, r, `⚠️ No vendor can take this order. Assign it at ${siteUrl()}/admin/orders/${r}`);
}

/**
 * What the customer is told at each step. It goes in the approved `order_update`
 * template, which reads "Update on cake order {{1}}: {{2}}. If you have any
 * questions about this order, please contact the MakeYourCakes team." — so no
 * full stop at the end, and nothing here may contain a line break.
 */
export function customerUpdateText(step: OrderStatus | "placed", pickup: boolean, cake?: string): string | null {
  switch (step) {
    case "placed":
      return `We have received your order${cake ? ` for ${cake}` : ""}. We will call you shortly to confirm it before we start baking`;
    case "confirmed":
      return "Your order is confirmed. We will bake it fresh for your chosen date";
    case "in_kitchen":
      return "Your cake is being baked now";
    case "out_for_delivery":
      return pickup ? "Your cake is ready to collect from the bakery" : "Your cake is out for delivery and on its way to you";
    case "delivered":
      return `${pickup ? "Collected" : "Delivered"}. Thank you for ordering from MakeYourCakes, we hope you love it`;
    case "cancelled":
      return "Your order has been cancelled. If you paid anything for it, the full amount will be refunded";
    default:
      return null;
  }
}

export async function whatsappNewOrder(tx: Tx, orderId: string) {
  if (!whatsappConfigured()) return;
  const facts = await loadOrderFacts(tx, orderId);
  await queueWhatsApp(tx, { orderId, kind: "new_order", to: adminNumbers(), dedupeKey: `wa:order:${orderId}:new`, message: adminNewOrderMessage(facts) });
  /* The customer hears from us at every step, starting now. */
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { customerPhone: true, fulfillmentMethod: true } });
  await queueWhatsApp(tx, { orderId, kind: "new_order", to: [o.customerPhone], dedupeKey: `wa:order:${orderId}:placed:customer`, message: updateMessage(facts.ref, customerUpdateText("placed", o.fulfillmentMethod === "pickup", facts.cake)!) });
}

const STATUS_TEXT: Partial<Record<OrderStatus, string>> = { confirmed: "Confirmed", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };

export async function whatsappOrderStatus(tx: Tx, e: { orderId: string; to: OrderStatus; vendorId?: string | null; vendorPhone?: string | null; reason?: string | null }) {
  if (!whatsappConfigured()) return;
  const o = await tx.order.findUniqueOrThrow({ where: { id: e.orderId }, select: { ref: true, customerPhone: true, fulfillmentMethod: true } });
  const r = o.ref, cancelled = e.to === "cancelled", key = `wa:order:${e.orderId}:${e.to}`;
  const kind = cancelled ? "order_cancelled" : "status_changed";
  const label = STATUS_TEXT[e.to];
  if (label) {
    await queueWhatsApp(tx, { orderId: e.orderId, vendorId: e.vendorId, kind, to: adminNumbers(), dedupeKey: key, message: updateMessage(r, label + (cancelled && e.reason ? `: ${e.reason}` : "")) });
    if (cancelled && e.vendorPhone)
      await queueWhatsApp(tx, { orderId: e.orderId, vendorId: e.vendorId, kind: "order_cancelled", to: [e.vendorPhone], dedupeKey: `${key}:vendor`, message: updateMessage(r, "Cancelled. Please stop work on this order.") });
  }
  /* The customer's own update. The staff cancel reason is internal, so it stays out of this one. */
  const text = customerUpdateText(e.to, o.fulfillmentMethod === "pickup");
  if (text)
    await queueWhatsApp(tx, { orderId: e.orderId, vendorId: e.vendorId, kind, to: [o.customerPhone], dedupeKey: `${key}:customer`, message: updateMessage(r, text) });
}
