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

const header = (orderId: string): TemplateComponent => ({
  type: "header",
  parameters: [{ type: "image", image: { link: photoUrl(orderId) } }],
});

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

export function updateMessage(ref: string, text: string): WhatsAppMessage {
  return { type: "template", name: "order_update", components: [body(cleanParam(ref), cleanParam(text, 400))] };
}

export function acceptedMessage(ref: string, assignmentId: string): WhatsAppMessage {
  return {
    type: "buttons",
    body: `${ref} is yours. Tap each step as you go.`,
    buttons: [
      { id: `start:${assignmentId}`, title: "Started" },
      { id: `ready:${assignmentId}`, title: "Ready" },
      { id: `handover:${assignmentId}`, title: "Handed over" },
    ],
  };
}

export function textMessage(body: string): WhatsAppMessage {
  return { type: "text", body };
}

/** Writes one idempotent whatsapp outbox row per unique valid number; returns rows written (0 when WhatsApp is off). */
export async function queueWhatsApp(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
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
