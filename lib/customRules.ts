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

/** How long the admin has to reply to a request with a price, and the customer to pay a quote. */
export const ADMIN_REPLY_MINUTES = 60;
export const CUSTOMER_PAY_HOURS = 6;
/** Both sides get a reminder this long before their deadline. */
export const REMIND_BEFORE_MINUTES = 30;

// A quote lives CUSTOMER_PAY_HOURS, but never past the point where we could no longer make the cake in time.
export function quoteExpiresAt(now: Date, dueAt: Date, preparationMinutes: number): Date {
  const pay = now.getTime() + CUSTOMER_PAY_HOURS * 3600_000;
  const latest = dueAt.getTime() - preparationMinutes * 60_000;
  return new Date(Math.min(pay, latest));
}

const IST = 330 * 60_000; // India has no daylight saving: always UTC+5:30

/**
 * When the admin must reply to a request that arrives `now`: ADMIN_REPLY_MINUTES later, counted from
 * the shop's opening (`from`, "HH:MM" IST) when it arrives outside opening hours, so a request at
 * 11 pm isn't closed while everyone sleeps.
 */
export function adminReplyBy(now: Date, from: string, until: string, minutes = ADMIN_REPLY_MINUTES): Date {
  const local = new Date(now.getTime() + IST); // its UTC fields read as the IST wall clock
  const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const at = local.getUTCHours() * 60 + local.getUTCMinutes(), open = toMinutes(from), close = toMinutes(until);
  let start = now.getTime();
  if (at < open || at >= close) {
    const day = local.getUTCDate() + (at >= close ? 1 : 0);
    start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), day, Math.floor(open / 60), open % 60) - IST;
  }
  return new Date(start + minutes * 60_000);
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
