"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revalidateCatalog } from "@/lib/catalogData";
import { VALUES_BY_CATEGORY } from "@/lib/catalogSnapshot";
import { db, hasDatabase } from "@/lib/db";

/**
 * Every write the admin portal can make.
 *
 * Server Actions rather than route handlers, for two reasons that both matter:
 * lib/catalogData's invalidation is `updateTag`, which Next only permits inside
 * an action and which is what hands the person who just saved a price the new
 * number instead of the cached old one; and proxy.ts's matcher covers
 * `/admin/:path*`, which includes the POST an action makes back to the page it
 * lives on — so the gate applies to the write, not only to the view.
 *
 * The forms constrain what can be submitted and none of that is trusted here.
 * A price is re-parsed, the category is re-checked against the Zod enums, and
 * an option naming something the renderer has never heard of is refused: the
 * table would take that string happily and the picker would break on it.
 */

/** Rupees on screen, paise in the database. */
const RupeeAmount = z
  .string()
  .trim()
  .refine((s) => s.length > 0, "Enter a price.")
  .refine((s) => /^\d+(\.\d{1,2})?$/.test(s), "Use digits, and at most two decimals.")
  .transform((s) => Math.round(Number(s) * 100))
  .refine((paise) => Number.isSafeInteger(paise), "That number is too large.");

const OptionEdit = z.object({
  id: z.string().min(1),
  category: z.enum(Object.keys(VALUES_BY_CATEGORY) as [string, ...string[]]),
  value: z.string().min(1),
  name: z.string().trim().min(1, "An option needs a name.").max(60),
  blurb: z.string().trim().min(1, "An option needs a line of description.").max(200),
  priceInputPaise: RupeeAmount,
});

export interface ActionResult {
  ok: boolean;
  message: string;
}

const NO_DB: ActionResult = {
  ok: false,
  message: "This deployment has no database, so nothing can be saved.",
};

export async function saveOption(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const parsed = OptionEdit.safeParse({
    id: form.get("id"),
    category: form.get("category"),
    value: form.get("value"),
    name: form.get("name"),
    blurb: form.get("blurb"),
    priceInputPaise: form.get("price"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const { id, category, value, name, blurb, priceInputPaise } = parsed.data;

  /*
   * The category/value pair has to name something lib/schema.ts knows, because
   * a price is only half of an option: the other half is a mesh, an allergen
   * row and whatever rules apply to it, and none of those can be typed into
   * this form. Refusing here keeps the table describing the product rather than
   * something the product cannot bake.
   */
  const allowed = VALUES_BY_CATEGORY[category as keyof typeof VALUES_BY_CATEGORY];
  if (!allowed.includes(value)) {
    return { ok: false, message: `${value} is not a ${category} this kitchen can make.` };
  }

  try {
    await db.catalogOption.update({
      where: { id },
      data: { name, blurb, priceInputPaise },
    });
  } catch {
    return { ok: false, message: "That option no longer exists. Reload the page." };
  }

  revalidateCatalog();
  revalidatePath("/admin/catalog");
  return { ok: true, message: `${name} saved.` };
}

/**
 * Withdraw an option, or bring it back.
 *
 * Deliberately not a delete. A design or an order naming this option has to go
 * on rendering and pricing for as long as it exists, and lib/catalogDefaults
 * would silently backfill a deleted row anyway — so the honest control is the
 * one that says "not right now" without touching the past.
 */
export async function setAvailability(form: FormData): Promise<void> {
  if (!hasDatabase()) return;

  const id = String(form.get("id") ?? "");
  const next = String(form.get("next") ?? "") === "true";
  if (!id) return;

  await db.catalogOption.update({ where: { id }, data: { isAvailable: next } });

  revalidateCatalog();
  revalidatePath("/admin/catalog");
}

const Settings = z.object({
  tierSurchargePaise: RupeeAmount,
  layerSurchargePaise: RupeeAmount,
  messagePipingPaise: RupeeAmount,
  dripPaise: RupeeAmount,
  sugarFreePaise: RupeeAmount,
  gstBasisPoints: z
    .string()
    .trim()
    .refine((s) => /^\d+(\.\d{1,2})?$/.test(s), "Use a percentage, like 18.")
    .transform((s) => Math.round(Number(s) * 100))
    .refine((bp) => bp <= 10_000, "A tax rate over 100% is not a tax rate."),
});

export async function saveSettings(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const parsed = Settings.safeParse({
    tierSurchargePaise: form.get("tier"),
    layerSurchargePaise: form.get("layer"),
    messagePipingPaise: form.get("message"),
    dripPaise: form.get("drip"),
    sugarFreePaise: form.get("sugarFree"),
    gstBasisPoints: form.get("gst"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  await db.pricingSettings.update({ where: { id: "singleton" }, data: parsed.data });

  revalidateCatalog();
  revalidatePath("/admin/catalog");
  return { ok: true, message: "Charges saved." };
}
