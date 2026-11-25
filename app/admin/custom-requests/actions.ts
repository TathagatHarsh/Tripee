"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { checkCustomRequest } from "@/lib/customRequestCheck";
import { adminQuote, cancelCustomRequest, createAdminQuote, type AdminPrice } from "@/lib/customRequests";
import { CustomRequestInput } from "@/lib/customRules";
import { log } from "@/lib/log";
import { dispatchPendingNotifications } from "@/lib/notifications";
import { ACCEPTED_TYPES, ImageError, MAX_UPLOAD_BYTES } from "@/lib/storage";

/** Send what these actions queued now, not when the notifications pinger next runs (which may be many minutes). */
const sendNow = () => after(() => dispatchPendingNotifications(10).catch((error) => log("error", "notification_dispatch_failed", { error: String(error) })));

export type QuoteActionResult = { ok: boolean; message: string; ref?: string };

/** "total" is what the customer pays in all; anything else is the bakery's price. */
function priceFrom(formData: FormData): AdminPrice {
  const paise = Math.round(Number(formData.get("price")) * 100);
  return formData.get("kind") === "total" ? { totalPaise: paise } : { vendorPaise: paise };
}

const sent = (quotePaise: number, vendorPaise?: number) =>
  `Quote sent: the customer pays ₹${(quotePaise / 100).toLocaleString("en-IN")}`
  + (vendorPaise ? `; the bakery gets ₹${(vendorPaise / 100).toLocaleString("en-IN")}.` : ".");

/** The admin prices a request for a bakery they pick; the customer gets the normal Pay-now quote. */
export async function adminQuoteAction(_prev: QuoteActionResult | undefined, formData: FormData): Promise<QuoteActionResult> {
  await requireAdmin();
  const res = await adminQuote(String(formData.get("id") ?? ""), String(formData.get("vendorId") ?? ""), priceFrom(formData));
  if (res.ok) sendNow();
  revalidatePath("/admin/custom-requests");
  return res.ok ? { ok: true, message: sent(res.quotePaise, res.vendorPaise) } : res;
}

/** A customer who phoned: their request is saved and quoted in one go, without offering it to bakeries. */
export async function newQuoteAction(_prev: QuoteActionResult | undefined, formData: FormData): Promise<QuoteActionResult> {
  await requireAdmin();
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("data"))); } catch { return { ok: false, message: "Fill in the customer's details." }; }
  const parsed = CustomRequestInput.safeParse(raw);
  if (!parsed.success) {
    const [field, errors] = Object.entries(parsed.error.flatten().fieldErrors)[0] ?? [];
    return { ok: false, message: field ? `Check ${field}: ${errors?.[0]}` : "Check the customer's details." };
  }
  const photo = formData.get("photo");
  const file = photo instanceof File && photo.size > 0 ? photo : null;
  if (file && file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "That photo is too large (4MB at most)." };
  if (file && !(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: "Use a JPEG, PNG or WebP photo." };
  const check = await checkCustomRequest(parsed.data);
  if (!check.ok) return { ok: false, message: check.message };
  const { dueDate: _d, dueWindow: _w, ...rest } = parsed.data;
  try {
    const res = await createAdminQuote({ ...rest, dueAt: check.dueAt.toISOString() }, file && Buffer.from(await file.arrayBuffer()), String(formData.get("vendorId") ?? ""), priceFrom(formData));
    if (res.ok) sendNow();
    revalidatePath("/admin/custom-requests");
    return res.ok ? { ok: true, message: `${res.ref}: ${sent(res.quotePaise, res.vendorPaise)}`, ref: res.ref } : res;
  } catch (error) {
    return { ok: false, message: error instanceof ImageError ? error.message : "Couldn't save the request. Please try again." };
  }
}

export async function cancelCustomRequestAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id && (await cancelCustomRequest(id))) sendNow();
  revalidatePath("/admin/custom-requests");
}
