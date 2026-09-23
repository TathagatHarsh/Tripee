"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { lockAssignments } from "@/lib/assignment";
const Rules = z.object({
  id: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  serviceRadiusKm: z.coerce.number().positive().max(500),
  maxConcurrentOrders: z.coerce.number().int().min(0).max(10000),
  commissionBps: z.coerce.number().int().min(0).max(10000),
  assignmentFeePaise: z.coerce.number().int().min(0).max(10000000),
  isAcceptingOrders: z.boolean(),
  fulfillsAllProducts: z.boolean(),
  supportedProductIds: z.array(z.string()).max(1000),
  unavailableUntil: z.coerce.date().nullable(),
});
export async function saveAssignmentRules(
  _previous: { ok: boolean; message: string } | undefined,
  form: FormData,
) {
  await requireAdmin();
  const data = Rules.safeParse({
    ...Object.fromEntries(form),
    isAcceptingOrders: form.get("isAcceptingOrders") === "on",
    fulfillsAllProducts: form.get("fulfillsAllProducts") === "on",
    supportedProductIds: String(form.get("supportedProductIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    unavailableUntil: form.get("unavailableUntil")
      ? `${form.get("unavailableUntil")}Z`
      : null,
  });
  if (!data.success || !form.get("latitude") || !form.get("longitude"))
    return {
      ok: false,
      message: "Check coordinates, radius, capacity and commission values.",
    };
  const { id, ...rules } = data.data;
  const products = await db.cakeProduct.count({
    where: { id: { in: [...new Set(rules.supportedProductIds)] } },
  });
  if (products !== new Set(rules.supportedProductIds).size)
    return { ok: false, message: "One or more product IDs do not exist." };
  await db.$transaction(async (tx) => {
    await lockAssignments(tx);
    await tx.vendor.update({ where: { id }, data: rules });
  });
  revalidatePath(`/admin/vendors/${id}`);
  revalidatePath("/vendor");
  return {
    ok: true,
    message:
      "Assignment rules saved. Existing earnings snapshots stay unchanged.",
  };
}
