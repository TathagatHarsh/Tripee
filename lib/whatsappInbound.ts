import "server-only";
import type { AssignmentStatus, OrderStatus, VendorOrderStatus } from "@prisma/client";
import { AssignmentConflict, moveFulfillment, respondToAssignment } from "./assignment";
import { customerReply, declineOffer, NOT_WAITING, recordQuote } from "./customRequests";
import { parseQuoteReply } from "./customRules";
import { db } from "./db";
import { log } from "./log";
import { handOver, vendorDeliveryMove } from "./vendorTransition";
import { VENDOR_STATUS_LABEL } from "./vendors";
import { adminNumbers, normalizePhone, sendWhatsApp } from "./whatsapp";
import { acceptedMessage, handedOverMessage, queueWhatsApp, rupees, textMessage } from "./whatsappMessages";

export type InboundAction = "accept" | "reject" | "start" | "ready" | "handover" | "deliver";
export interface ParsedInbound { action: InboundAction; assignmentId?: string; ref?: string }

const WORDS: Record<string, InboundAction> = {
  accept: "accept", yes: "accept", ok: "accept", okay: "accept",
  reject: "reject", no: "reject",
  start: "start", started: "start", "order started": "start", "start order": "start",
  ready: "ready", "order ready": "ready",
  "handed over": "handover", handover: "handover", "picked up": "handover", done: "handover", "ready for collection": "handover",
  delivered: "deliver", "order delivered": "deliver", collected: "deliver", "order collected": "deliver",
};

export function parseInbound(input: { text?: string | null; payload?: string | null }): ParsedInbound | null {
  const button = /^(accept|reject|start|ready|handover|deliver):(\S+)$/.exec(input.payload ?? "");
  if (button) return { action: button[1] as InboundAction, assignmentId: button[2] };
  const text = (input.text ?? "").toLowerCase();
  const ref = /\bmc-[a-z0-9]+\b/i.exec(text)?.[0];
  const words = text.replace(/\bmc-[a-z0-9]+\b/gi, " ").replace(/\s+/g, " ").replace(/[^a-z ]/g, "").replace(/ +/g, " ").trim();
  const action = WORDS[words];
  if (!action) return null;
  return ref ? { action, ref: ref.toUpperCase() } : { action };
}

export interface OpenRow { id: string; orderId: string; ref: string; assignmentStatus: AssignmentStatus; status: VendorOrderStatus; orderStatus: OrderStatus; pickup: boolean }

const STEP_FROM: Record<Exclude<InboundAction, "accept" | "reject">, VendorOrderStatus> = { start: "accepted", ready: "in_preparation", handover: "ready", deliver: "handed_over" };
const fits = (action: InboundAction, r: OpenRow) =>
  action === "accept" || action === "reject" ? r.assignmentStatus === "OFFERED"
  : r.assignmentStatus === "ACCEPTED" && r.status === STEP_FROM[action] && (action !== "deliver" || r.orderStatus === "out_for_delivery");

export function pickTarget(action: InboundAction, rows: OpenRow[], ref?: string):
  { kind: "one"; row: OpenRow } | { kind: "none" } | { kind: "many"; refs: string[] } {
  const hits = rows.filter((r) => (!ref || r.ref === ref) && fits(action, r));
  if (hits.length === 0) return { kind: "none" };
  return hits.length === 1 ? { kind: "one", row: hits[0] } : { kind: "many", refs: hits.map((r) => r.ref) };
}

export interface InboundMessage { id: string; from: string; text?: string | null; payload?: string | null }

const DONE_WORD: Record<InboundAction, string> = { accept: "accepted", reject: "rejected", start: "started", ready: "ready", handover: "handed over", deliver: "delivered" };
const REPLY_WORD: Record<InboundAction, string> = { accept: "accept", reject: "reject", start: "started", ready: "ready", handover: "handed over", deliver: "delivered" };
const MOVE_TO = { start: "in_preparation", ready: "ready" } as const;
const NOT_POSSIBLE = (ref: string) => `That step isn't possible for ${ref} right now.`;

async function say(to: string, body: string) {
  try {
    await sendWhatsApp(to, textMessage(body));
  } catch (error) {
    log("error", "whatsapp_reply_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

const CR_REF = /\bcr-[a-z0-9]+\b/i;

/** A bakery's price, or its "Can't do it", for a custom request. False when the message is not about one. */
async function customVendorReply(msg: InboundMessage, from: string, vendorId: string): Promise<boolean> {
  const declineId = /^cq_no:(\S+)$/.exec(msg.payload ?? "")?.[1];
  const text = (msg.text ?? "").toLowerCase();
  const typedRef = CR_REF.exec(text)?.[0].toUpperCase();
  const typedDecline = typedRef && ["cant do it", "no"].includes(text.replace(CR_REF, " ").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim());
  const quote = declineId || typedDecline ? null : parseQuoteReply(msg.text ?? "");
  if (!declineId && !typedDecline && !quote) return false;
  const action = quote ? "quote" : "cq_no";
  const commandKey = `${msg.id}:${from}`;
  const saved = await db.whatsAppCommand.findUnique({ where: { key: commandKey } });
  if (saved && saved.vendorId !== vendorId) return true;

  let target: { id: string; ref: string } | null = null;
  if (saved?.orderRef && saved.action === action) target = await db.customRequest.findUnique({ where: { ref: saved.orderRef }, select: { id: true, ref: true } });
  else if (!quote) target = await db.customRequest.findUnique({ where: declineId ? { id: declineId } : { ref: typedRef! }, select: { id: true, ref: true } });
  else {
    const ref = quote.kind === "quote" ? quote.ref : undefined;
    const open = await db.customRequest.findMany({ where: { status: "awaiting_quote", vendorId, ...(ref ? { ref } : {}) }, select: { id: true, ref: true }, orderBy: { ref: "asc" } });
    if (open.length === 0) {
      // A bakery this request already moved on from is told so; any other number falls through to orders.
      const late = quote.kind === "quote" && await db.customRequest.findFirst({ where: { triedVendorIds: { has: vendorId }, ...(ref ? { ref } : {}) }, select: { id: true, ref: true }, orderBy: { createdAt: "desc" } });
      if (!late) return false;
      target = late;
    } else if (quote.kind === "out_of_range") {
      await say(from, "Please send the price in rupees, e.g. 1800.");
      return true;
    } else if (open.length > 1) {
      await say(from, `Which request? Reply *${rupees(quote.paise)} ${open[0].ref}*. Open: ${open.map((r) => r.ref).join(", ")}`);
      return true;
    } else target = open[0];
  }
  if (!target) {
    await say(from, NOT_WAITING);
    return true;
  }
  if (!saved)
    await db.whatsAppCommand.upsert({ where: { key: commandKey }, update: {}, create: { key: commandKey, vendorId, orderRef: target.ref, action, pickup: false } });

  let body: string;
  if (quote?.kind === "quote") {
    const res = await recordQuote(vendorId, target.id, quote.paise);
    body = res.ok ? `✅ Quote ₹${rupees(quote.paise)} sent for ${target.ref}. We'll tell you if the customer pays.` : res.message;
  } else body = (await declineOffer(vendorId, target.id)).message;
  await queueWhatsApp(db, { customRequestId: target.id, vendorId, kind: "custom_request", to: [from], dedupeKey: `wa-reply:${msg.id}`, message: textMessage(body) });
  return true;
}

export async function handleInbound(msg: InboundMessage): Promise<void> {
  const from = normalizePhone(msg.from);
  if (!from) return;
  const vendors = (await db.vendor.findMany({ where: { isActive: true, phone: { not: null } }, select: { id: true, phone: true } }))
    .filter((v) => normalizePhone(v.phone) === from);
  if (vendors.length === 0 && (await customerReply(from, msg.text ?? null, msg.payload ?? null, msg.id))) return;
  if (vendors.length === 0)
    return say(from, adminNumbers().includes(from)
      ? "This number only sends updates. Use the admin page to act on orders."
      : "This number is for MakeYourCakes bakery partners. For your order, use the link in your confirmation.");
  if (vendors.length > 1) return say(from, "This number is linked to more than one bakery. Please contact the admin.");
  const vendorId = vendors[0].id;
  // A re-delivered webhook (same message id) was already answered: no action, no second reply.
  if (await db.notificationOutbox.findUnique({ where: { dedupeKey: `wa-reply:${msg.id}:${from}` }, select: { id: true } })) return;
  if (await customVendorReply(msg, from, vendorId)) return;
  // A bakery's own custom cake: its "Not for me" button is unambiguous.
  if (msg.payload?.startsWith("cq_decline:") && (await customerReply(from, msg.text ?? null, msg.payload, msg.id))) return;

  const parsed = parseInbound(msg);
  if (!parsed) return say(from, "Reply with: accept, reject, started, ready or handed over. Add the order number if you have more than one, e.g. started MC-1234.");
  let { action } = parsed;
  const { assignmentId, ref } = parsed;
  const commandKey = `${msg.id}:${from}`;
  const saved = await db.whatsAppCommand.findUnique({ where: { key: commandKey } });
  if (saved && saved.vendorId !== vendorId) return;

  // out_for_delivery too: after the handover the bakery still marks the cake delivered.
  const rows: OpenRow[] = (await db.vendorOrder.findMany({
    where: { vendorId, currentFor: { status: { in: ["confirmed", "in_kitchen", "out_for_delivery"] } } },
    select: { id: true, orderId: true, status: true, assignmentStatus: true, order: { select: { ref: true, status: true, fulfillmentMethod: true } } },
  })).map(({ order, ...r }) => ({ ...r, ref: order.ref, orderStatus: order.status, pickup: order.fulfillmentMethod === "pickup" }))
    .sort((a, b) => a.ref.localeCompare(b.ref));
  const target = pickTarget(action, assignmentId ? rows.filter((r) => r.id === assignmentId) : rows, ref);
  const unavailable = assignmentId && !rows.some(r => r.id === assignmentId)
    ? "That order isn't waiting on you any more."
    : target.kind === "none" ? `Nothing to mark ${DONE_WORD[action]} right now.`
    : target.kind === "many" ? `Which order? Reply *${REPLY_WORD[action]} ${target.refs[0]}* or tap the button on that order. Open: ${target.refs.join(", ")}`
    : null;
  const row = target.kind === "one" && !unavailable ? target.row : null;
  const command = saved ?? await db.whatsAppCommand.upsert({
    where: { key: commandKey }, update: {},
    create: { key: commandKey, vendorId, assignmentId: row?.id ?? null, orderId: row?.orderId ?? null,
      orderRef: row?.ref ?? null, pickup: row?.pickup ?? false, action, reply: unavailable },
  });
  if (command.vendorId !== vendorId) return;
  if (!command.assignmentId || !command.orderId || !command.orderRef) return say(from, command.reply ?? "That message has already been handled. Send a new message to act on an order.");
  action = command.action as InboundAction;
  const { assignmentId: id, orderId, orderRef, pickup } = command;
  let message;
  try {
    if (action === "accept" || action === "reject") {
      const res = await respondToAssignment(vendorId, orderRef, id, action === "accept" ? "ACCEPTED" : "REJECTED", action === "reject" ? "Rejected on WhatsApp" : undefined);
      message = !res.ok ? textMessage(res.message) : action === "accept" ? acceptedMessage(orderRef, id, pickup) : textMessage(`Okay, ${orderRef} has been passed on.`);
    } else if (action === "handover") {
      message = (await handOver(vendorId, orderRef, id, null)) ? handedOverMessage(orderRef, id, pickup) : textMessage(NOT_POSSIBLE(orderRef));
    } else if (action === "deliver") {
      message = textMessage((await vendorDeliveryMove(vendorId, orderRef, id, "delivered", null))
        ? `✅ ${orderRef}: ${pickup ? "collected" : "delivered"}. Thank you!`
        : NOT_POSSIBLE(orderRef));
    } else {
      const to = MOVE_TO[action];
      message = textMessage((await moveFulfillment(vendorId, orderRef, to, id)) ? `✅ ${orderRef}: ${VENDOR_STATUS_LABEL[to]}` : NOT_POSSIBLE(orderRef));
    }
  } catch (error) {
    if (!(error instanceof AssignmentConflict)) throw error;
    message = textMessage(error.message);
  }
  await queueWhatsApp(db, { orderId, vendorId, kind: "status_changed", to: [from], dedupeKey: `wa-reply:${msg.id}`, message });
}
