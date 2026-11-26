// Pure rules for WhatsApp-quoted custom cakes. Browser-safe: no node:crypto, no DB.
import type { CustomRequestStatus } from "@prisma/client";
import { z } from "zod";
import { inHyderabad } from "./location";

export const CUSTOM_SIZES_KG: readonly number[] = [0.5, 1, 1.5, 2, 3, 4, 5];
export const QUOTE_MIN_PAISE = 10_000;
export const QUOTE_MAX_PAISE = 10_000_000;

export type QuoteReply = { kind: "quote"; paise: number; ref?: string } | { kind: "out_of_range" };

export function parseQuoteReply(text: string): QuoteReply | null {
  let s = text.toLowerCase();
  const ref = s.match(/\bcr-[a-z0-9]+\b/)?.[0];
  if (ref) s = s.replace(ref, "");
  // "Rs.1,200/- only" and "₹1200.00" are how prices are written here: whole rupees only.
  s = s.replace(/₹|rs\.?|inr|only|\/-|\/=|,|\s/g, "").replace(/\.0{1,2}$/, "");
  if (!/^\d+$/.test(s)) return null;
  const paise = Number(s) * 100;
  if (paise < QUOTE_MIN_PAISE || paise > QUOTE_MAX_PAISE) return { kind: "out_of_range" };
  return ref ? { kind: "quote", paise, ref: ref.toUpperCase() } : { kind: "quote", paise };
}

// A quote lives 24h, but never past the point where we could no longer make the cake in time.
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
  no_bakery: ["quoted", "cancelled"], // an admin can still quote it, or close it
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

// Light phone check for the browser; the server stores the number via indianMobile (lib/whatsapp.ts), which is authoritative.
const mobileLike = (raw: string) => /^[6-9]\d{9}$/.test(raw.replace(/\D/g, "").replace(/^(?:0{0,2}91|0)(?=\d{10}$)/, ""));

export const CustomRequestInput = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().refine(mobileLike, "Enter a 10-digit mobile number"),
  sizeKg: z.number().refine((n) => CUSTOM_SIZES_KG.includes(n), "Choose a size"),
  budgetRupees: z.number().int().min(100).max(100_000).optional(),
  flavour: z.string().trim().min(1).max(60),
  cakeMessage: z.string().trim().max(60).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueWindow: z.string().min(1).max(20),
  address: z.object({
    lat: z.number(), lng: z.number(), address: z.string(), locality: z.string().optional(),
    source: z.enum(["map", "current_location"]).optional(),
    city: z.string(), state: z.string(), pincode: z.string().regex(/^\d{6}$/), placeId: z.string(),
  }).refine(inHyderabad, "We only deliver in Hyderabad"),
  consent: z.literal(true),
});
export type CustomRequestInput = z.infer<typeof CustomRequestInput>;
/** What is stored: the picked window collapses to its end, `dueAt`. */
export type NewCustomRequest = Omit<CustomRequestInput, "dueDate" | "dueWindow"> & { dueAt: string };
