// Pure rules for WhatsApp-quoted custom cakes. Browser-safe: no node:crypto, no DB.
import type { CustomRequestStatus } from "@prisma/client";

export const CUSTOM_SIZES_KG: readonly number[] = [0.5, 1, 1.5, 2, 3, 4, 5];
export const MAX_BAKERIES = 3;
export const QUOTE_MIN_PAISE = 10_000;
export const QUOTE_MAX_PAISE = 10_000_000;

export type QuoteReply = { kind: "quote"; paise: number; ref?: string } | { kind: "out_of_range" };

export function parseQuoteReply(text: string): QuoteReply | null {
  let s = text.toLowerCase();
  const ref = s.match(/\bcr-[a-z0-9]+\b/)?.[0];
  if (ref) s = s.replace(ref, "");
  s = s.replace(/₹|rs\.?|inr|,|\s/g, "");
  if (!/^\d+$/.test(s)) return null;
  const paise = Number(s) * 100;
  if (paise < QUOTE_MIN_PAISE || paise > QUOTE_MAX_PAISE) return { kind: "out_of_range" };
  return ref ? { kind: "quote", paise, ref: ref.toUpperCase() } : { kind: "quote", paise };
}

// Vendor price plus margin, rounded up to the next whole 10 rupees (1000 paise).
export function customerPricePaise(vendorPaise: number, marginPct: number): number {
  return Math.ceil((vendorPaise * (100 + marginPct)) / 100_000) * 1000;
}

export function customOfferMinutes(): number {
  const minutes = Number(process.env.CUSTOM_OFFER_MINUTES ?? 60);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) throw new Error("Invalid custom offer window");
  return minutes;
}

// A quote lives 24h, but never past the point where the bakery could no longer prepare it.
export function quoteExpiresAt(now: Date, dueAt: Date, preparationMinutes: number): Date {
  const day = now.getTime() + 24 * 3600_000;
  const latest = dueAt.getTime() - preparationMinutes * 60_000;
  return new Date(Math.min(day, latest));
}

const MOVES: Record<CustomRequestStatus, readonly CustomRequestStatus[]> = {
  awaiting_quote: ["quoted", "no_bakery", "cancelled"],
  quoted: ["paid", "declined", "expired", "cancelled"],
  paid: [],
  declined: [],
  expired: [],
  no_bakery: [],
  cancelled: [],
};
export function canMoveCustom(from: CustomRequestStatus, to: CustomRequestStatus): boolean {
  return MOVES[from].includes(to);
}

export function newCustomRef(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "CR-" + Array.from(bytes, (b) => alphabet[b & 31]).join("");
}

export function newCustomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}
