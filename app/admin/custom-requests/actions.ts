"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { cancelCustomRequest } from "@/lib/customRequests";

export async function cancelCustomRequestAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await cancelCustomRequest(id);
  revalidatePath("/admin/custom-requests");
}
