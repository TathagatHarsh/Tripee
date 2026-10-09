import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type TemplateComponent = Record<string, unknown>;
export type WhatsAppMessage =
  | { type: "template"; name: "order_offer" | "admin_new_order" | "order_update"; components: TemplateComponent[] }
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: { id: string; title: string }[] };

const GRAPH = "https://graph.facebook.com/v23.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Digits-only international form Meta expects (no "+"); bare Indian numbers get the 91 prefix. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function adminNumbers(): string[] {
  const numbers = (process.env.WHATSAPP_ADMIN_NUMBERS ?? "").split(",").map(normalizePhone);
  return [...new Set(numbers.filter((n): n is string => n !== null))];
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://makeyourcakes.com").replace(/\/+$/, "");
}

const hmac = (data: string) => createHmac("sha256", process.env.WHATSAPP_APP_SECRET ?? "").update(data);

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checks Meta's `x-hub-signature-256` header against the raw request body. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!process.env.WHATSAPP_APP_SECRET || !header) return false;
  return safeEqual(header, `sha256=${hmac(rawBody).digest("hex")}`);
}

export function photoSignature(orderId: string): string {
  return hmac(`photo:${orderId}`).digest("base64url").slice(0, 22);
}

export function photoUrl(orderId: string): string {
  return `${siteUrl()}/api/whatsapp/photo/${orderId}?s=${photoSignature(orderId)}`;
}

/** Fails closed: with no app secret every signature is rejected, including one minted with the empty key. */
export function verifyPhotoSignature(orderId: string, s: string | null): boolean {
  if (!process.env.WHATSAPP_APP_SECRET || !s) return false;
  return safeEqual(s, photoSignature(orderId));
}

function payload(to: string, message: WhatsAppMessage) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (message.type) {
    case "text":
      return { ...base, type: "text", text: { body: message.body, preview_url: false } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.body },
          action: { buttons: message.buttons.map(({ id, title }) => ({ type: "reply", reply: { id, title } })) },
        },
      };
    case "template":
      return { ...base, type: "template", template: { name: message.name, language: { code: "en" }, components: message.components } };
  }
}

/** Throws `whatsapp_<status>[_<metaCode>]` when Meta rejects the message. */
export async function sendWhatsApp(to: string, message: WhatsAppMessage): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("whatsapp_not_configured");
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload(to, message)),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return;
  const code = await res.json().then((j: { error?: { code?: number } }) => j?.error?.code, () => undefined);
  throw new Error(`whatsapp_${res.status}${code === undefined ? "" : `_${code}`}`);
}
