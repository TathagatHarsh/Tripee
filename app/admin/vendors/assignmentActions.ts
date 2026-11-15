"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { lockAssignments } from "@/lib/assignment";
import { RADIUS_KM } from "@/lib/assignmentRules";
const Rules = z.object({
  id: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  serviceRadiusKm: z.coerce.number().min(RADIUS_KM.min).max(RADIUS_KM.max),
  maxConcurrentOrders: z.coerce.number().int().min(0).max(10000),
  commissionBps: z.coerce.number().int().min(0).max(10000),
  assignmentFeePaise: z.coerce.number().int().min(0).max(10000000),
  isAcceptingOrders: z.boolean(),
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
