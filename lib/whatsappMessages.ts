import "server-only";
import type { NotificationKind, Prisma } from "@prisma/client";
import { outboxCreate } from "./notifications";
import { normalizePhone, photoUrl, whatsappConfigured, type TemplateComponent, type WhatsAppMessage } from "./whatsapp";

export interface OrderFacts {
  orderId: string;
  ref: string;
  totalPaise: number;
  dueAt: Date | null;
  area: string;
  cake: string;
  customerName?: string | null;
}

/** Meta rejects template parameters that are empty or contain newlines, tabs or runs of spaces. */
export function cleanParam(value: string | null | undefined, max = 120): string {
  const flat = (value ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "-";
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function rupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

const DUE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "Sat 10 Oct, 4:00 pm" in IST, assembled from parts so ICU punctuation differences can't change the shape. */
export function formatDue(at: Date | null): string {
  if (!at) return "not set";
  const p = Object.fromEntries(DUE_FORMAT.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

const imageHeader = (link: string): TemplateComponent => ({
  type: "header",
  parameters: [{ type: "image", image: { link } }],
});

const header = (orderId: string): TemplateComponent => imageHeader(photoUrl(orderId));

const body = (...texts: string[]): TemplateComponent => ({
  type: "body",
  parameters: texts.map((text) => ({ type: "text", text })),
});

const quickReply = (index: number, payload: string): TemplateComponent => ({
  type: "button",
  sub_type: "quick_reply",
  index: String(index),
  parameters: [{ type: "payload", payload }],
});

export function offerMessage(
  f: OrderFacts,
  o: { assignmentId: string; distanceKm: number | null; earningPaise: number | null; replyMinutes: number },
): WhatsAppMessage {
  return {
    type: "template",
    name: "order_offer",
    components: [
      header(f.orderId),
      body(
        cleanParam(f.ref),
        cleanParam(f.cake),
        cleanParam(formatDue(f.dueAt)),
        cleanParam(f.area),
        cleanParam(o.distanceKm === null ? "?" : o.distanceKm.toFixed(1)),
        cleanParam(o.earningPaise === null ? "" : rupees(o.earningPaise)),
        cleanParam(String(o.replyMinutes)),
      ),
      quickReply(0, `accept:${o.assignmentId}`),
      quickReply(1, `reject:${o.assignmentId}`),
    ],
  };
}

export function adminNewOrderMessage(f: OrderFacts): WhatsAppMessage {
  return {
    type: "template",
    name: "admin_new_order",
    components: [
      header(f.orderId),
      body(cleanParam(f.ref), cleanParam(rupees(f.totalPaise)), cleanParam(f.cake), cleanParam(formatDue(f.dueAt)), cleanParam(f.area)),
    ],
  };
}

/* The customer's four messages: confirmed, out for delivery, delivered and, only if it happens, cancelled. Wording in docs/WHATSAPP.md. */
const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "there";

export function customerConfirmedMessage(f: OrderFacts): WhatsAppMessage {
  return {
    type: "template",
    name: "customer_order_confirmed",
    components: [
      header(f.orderId),
      body(cleanParam(firstName(f.customerName)), cleanParam(f.cake), cleanParam(formatDue(f.dueAt)), cleanParam(f.area), cleanParam(f.ref), cleanParam(rupees(f.totalPaise))),
    ],
  };
}

export function customerOutForDeliveryMessage(f: OrderFacts): WhatsAppMessage {
  return {
    type: "template",
    name: "customer_out_for_delivery",
    components: [header(f.orderId), body(cleanParam(firstName(f.customerName)), cleanParam(f.cake), cleanParam(f.area), cleanParam(formatDue(f.dueAt)), cleanParam(f.ref))],
  };
}

export function customerDeliveredMessage(f: OrderFacts): WhatsAppMessage {
  return { type: "template", name: "customer_order_delivered", components: [header(f.orderId), body(cleanParam(firstName(f.customerName)), cleanParam(f.ref))] };
}

/** No photo: a cancelled cake isn't one to show. The staff reason never reaches the customer. */
export function customerCancelledMessage(o: { ref: string; customerName?: string | null }, noBakery: boolean): WhatsAppMessage {
  const why = noBakery
    ? "No partner bakery near you could make it in time."
    : "If you didn't ask for this, please write to hello@makeyourcakes.com and we'll sort it out.";
  return { type: "template", name: "customer_order_cancelled", components: [body(cleanParam(firstName(o.customerName)), cleanParam(o.ref), why)] };
}

export function updateMessage(ref: string, text: string): WhatsAppMessage {
  return { type: "template", name: "order_update", components: [body(cleanParam(ref), cleanParam(text, 400))] };
}

/** To a bakery: the customer's reference photo and spec, area only, asking for a price. */
export function customOfferMessage(r: {
  id: string;
  ref: string;
  sizeKg: string;
  flavour: string;
  cakeMessage: string | null;
  dueAt: Date;
  area: string;
  budgetPaise: number | null;
}): WhatsAppMessage {
  return {
    type: "template",
    name: "custom_offer",
    components: [
      header(r.id),
      body(
        cleanParam(r.ref),
        cleanParam(`${r.sizeKg} kg`),
        cleanParam(r.flavour),
        cleanParam(r.cakeMessage),
        cleanParam(formatDue(r.dueAt)),
        cleanParam(r.area),
        cleanParam(r.budgetPaise === null ? "no budget given" : `₹${rupees(r.budgetPaise)}`),
      ),
      quickReply(0, `cq_no:${r.id}`),
    ],
  };
}

/** To the customer: the quoted price and a pay link; the bakery is never named. */
export function customQuoteMessage(r: {
  id: string;
  ref: string;
  token: string;
  sizeKg: string;
  dueAt: Date;
  quotePaise: number;
}): WhatsAppMessage {
  return {
    type: "template",
    name: "custom_quote",
    components: [
      header(r.id),
      body(cleanParam(r.ref), cleanParam(`${r.sizeKg} kg`), cleanParam(formatDue(r.dueAt)), cleanParam(rupees(r.quotePaise))),
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: r.token }] },
      quickReply(1, `cq_decline:${r.id}`),
    ],
  };
}

type ButtonsMessage = Extract<WhatsAppMessage, { type: "buttons" }>;

/** The portal's wording: for a pickup, handing over is the cake waiting at the counter. */
export function acceptedMessage(ref: string, assignmentId: string, pickup = false): ButtonsMessage {
  return {
    type: "buttons",
    body: `${ref} is yours. Tap each step as you go.`,
    buttons: [
      { id: `start:${assignmentId}`, title: "Started" },
      { id: `ready:${assignmentId}`, title: "Ready" },
      { id: `handover:${assignmentId}`, title: pickup ? "Ready for collection" : "Handed over" },
    ],
  };
}

/** After the handover the bakery still owns the order: it marks the cake delivered, or collected. */
export function handedOverMessage(ref: string, assignmentId: string, pickup: boolean): ButtonsMessage {
  const [state, button] = pickup ? ["ready for collection", "Collected"] : ["out for delivery", "Delivered"];
  return {
    type: "buttons",
    body: `✅ ${ref}: ${state}. Tap ${button} when the customer has the cake.`,
    buttons: [{ id: `deliver:${assignmentId}`, title: button }],
  };
}

export function textMessage(body: string): WhatsAppMessage {
  return { type: "text", body };
}

/** Writes one idempotent whatsapp outbox row per unique valid number; returns rows written (0 when WhatsApp is off). */
export async function queueWhatsApp(
  tx: Prisma.TransactionClient,
  input: {
    orderId?: string | null;
    customRequestId?: string | null;
    vendorId?: string | null;
    kind: NotificationKind;
    to: (string | null | undefined)[];
    dedupeKey: string;
    message: WhatsAppMessage;
  },
): Promise<number> {
  if (!whatsappConfigured()) return 0;
  const numbers = [...new Set(input.to.map(normalizePhone).filter((n): n is string => n !== null))];
  for (const destination of numbers) {
    const dedupeKey = `${input.dedupeKey}:${destination}`;
    await tx.notificationOutbox.upsert({
      where: { dedupeKey },
      update: {},
      create: outboxCreate({
        orderId: input.orderId,
        customRequestId: input.customRequestId,
        vendorId: input.vendorId,
        kind: input.kind,
        channel: "whatsapp",
        destination,
        payload: input.message as unknown as Prisma.InputJsonValue,
        dedupeKey,
      }),
    });
  }
  return numbers.length;
}
