"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminQuote, cancelCustomRequest } from "@/lib/customRequests";

export type QuoteActionResult = { ok: boolean; message: string };

/** The admin prices a request for a bakery they pick; the customer gets the normal Pay-now quote. */
export async function adminQuoteAction(_prev: QuoteActionResult | undefined, formData: FormData): Promise<QuoteActionResult> {
  await requireAdmin();
  const rupees = Number(formData.get("price"));
  const res = await adminQuote(String(formData.get("id") ?? ""), String(formData.get("vendorId") ?? ""), Math.round(rupees * 100));
  revalidatePath("/admin/custom-requests");
  return res.ok ? { ok: true, message: `Quote sent: the customer pays ₹${(res.quotePaise / 100).toLocaleString("en-IN")}.` } : res;
}

export async function cancelCustomRequestAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await cancelCustomRequest(id);
  revalidatePath("/admin/custom-requests");
}
