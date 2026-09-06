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

/* ---------------------------------------------------------------- delivery */

const SlotEdit = z.object({
  id: z.string().min(1),
  priceInputPaise: RupeeAmount,
  leadHours: z
    .string()
    .trim()
    .refine((s) => /^\d+$/.test(s), "Lead time is a whole number of hours.")
    .transform(Number)
    .refine((h) => h <= 24 * 90, "That is more than three months."),
  slotWindow: z.string().trim().min(1, "Say when it arrives.").max(120),
  slotNote: z.string().trim().max(200),
});

export async function saveDeliverySlot(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const parsed = SlotEdit.safeParse({
    id: form.get("id"),
    priceInputPaise: form.get("fee"),
    leadHours: form.get("leadHours"),
    slotWindow: form.get("slotWindow"),
    slotNote: form.get("slotNote"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const { id, ...data } = parsed.data;
  try {
    // Scoped to the delivery category so this action cannot be pointed at a
    // sponge and give it a lead time it has no meaning for.
    const { count } = await db.catalogOption.updateMany({
      where: { id, category: "delivery" },
      data,
    });
    if (count === 0) return { ok: false, message: "That slot no longer exists. Reload the page." };
  } catch {
    return { ok: false, message: "That didn't save." };
  }

  revalidateCatalog();
  revalidatePath("/admin/delivery");
  return { ok: true, message: "Slot saved." };
}

const Pincode = z
  .string()
  .trim()
  .refine((s) => /^\d{6}$/.test(s), "A pincode is six digits.")
  .transform(Number);

const ZoneEdit = z
  .object({
    name: z.string().trim().min(1, "A zone needs a name.").max(60),
    pincodeFrom: Pincode,
    pincodeTo: Pincode,
    extraHours: z
      .string()
      .trim()
      .refine((s) => /^\d+$/.test(s), "Extra time is a whole number of hours.")
      .transform(Number)
      .refine((h) => h <= 24 * 14, "That is more than a fortnight of rider time."),
    slots: z
      .array(z.string())
      .min(1, "A zone with no slots delivers nothing — deactivate it instead."),
  })
  .refine((v) => v.pincodeFrom <= v.pincodeTo, {
    message: "That range starts after it ends.",
    path: ["pincodeTo"],
  });

/** Only slots the schema knows, so a zone cannot offer one nothing can render. */
function readSlots(form: FormData): string[] {
  const allowed = new Set(VALUES_BY_CATEGORY.delivery);
  return form.getAll("slots").map(String).filter((s) => allowed.has(s));
}

export async function saveZone(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That zone no longer exists. Reload the page." };

  const parsed = ZoneEdit.safeParse({
    name: form.get("name"),
    pincodeFrom: form.get("pincodeFrom"),
    pincodeTo: form.get("pincodeTo"),
    extraHours: form.get("extraHours"),
    slots: readSlots(form),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  try {
    await db.deliveryZone.update({
      where: { id },
      data: { ...parsed.data, isActive: form.get("isActive") === "on" },
    });
  } catch {
    return { ok: false, message: "That zone no longer exists. Reload the page." };
  }

  revalidateCatalog();
  revalidatePath("/admin/delivery");
  return { ok: true, message: `${parsed.data.name} saved.` };
}

export async function addZone(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const parsed = ZoneEdit.safeParse({
    name: form.get("name"),
    pincodeFrom: form.get("pincodeFrom"),
    pincodeTo: form.get("pincodeTo"),
    extraHours: form.get("extraHours"),
    slots: readSlots(form),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const last = await db.deliveryZone.findFirst({ orderBy: { sortOrder: "desc" } });
  await db.deliveryZone.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateCatalog();
  revalidatePath("/admin/delivery");
  return { ok: true, message: `${parsed.data.name} added.` };
}

/**
 * Zones are the one thing here that can genuinely be deleted.
 *
 * Nothing historical depends on one: an order froze its own leadHours when it
 * was placed, so removing the zone that produced that number changes no past
 * order and no past docket. Deactivating is still the softer move and the page
 * offers it first — this exists for a zone drawn by mistake.
 */
export async function deleteZone(form: FormData): Promise<void> {
  if (!hasDatabase()) return;
  const id = String(form.get("id") ?? "");
  if (!id) return;

  await db.deliveryZone.delete({ where: { id } }).catch(() => {});
  revalidateCatalog();
  revalidatePath("/admin/delivery");
}

export async function saveMinOrder(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const parsed = RupeeAmount.safeParse(form.get("minOrder"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  await db.pricingSettings.update({
    where: { id: "singleton" },
    data: { minOrderPaise: parsed.data },
  });

  revalidateCatalog();
  revalidatePath("/admin/delivery");
  return { ok: true, message: parsed.data === 0 ? "Minimum removed." : "Minimum saved." };
}

/* -------------------------------------------------------------- the bakery */

const Bakery = z.object({
  name: z.string().trim().min(1, "The bakery needs a name.").max(80),
  phone: z.string().trim().min(1, "A number customers can ring.").max(40),
  email: z.string().trim().email("That is not an email address.").max(120),
  address: z.string().trim().min(1, "Where the counter is.").max(200),
  hours: z.string().trim().min(1, "When the counter is open.").max(200),
  /*
   * Deliberately unvalidated beyond a length, and deliberately allowed to be
   * empty. An FSSAI number is a real registration; a format check here would
   * only teach somebody the shape of a plausible fake, and empty already means
   * "print no line" rather than "print nothing yet".
   */
  fssaiLicence: z.string().trim().max(40),
  orderNotifyEmail: z
    .string()
    .trim()
    .max(120)
    .refine(
      (s) => s === "" || z.string().email().safeParse(s).success,
      "That is not an email address.",
    ),
});

export async function saveBakery(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  if (!hasDatabase()) return NO_DB;

  const parsed = Bakery.safeParse({
    name: form.get("name"),
    phone: form.get("phone"),
    email: form.get("email"),
    address: form.get("address"),
    hours: form.get("hours"),
    fssaiLicence: form.get("fssaiLicence"),
    orderNotifyEmail: form.get("orderNotifyEmail"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const { orderNotifyEmail, ...rest } = parsed.data;
  await db.bakerySettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...rest, orderNotifyEmail: orderNotifyEmail || null },
    update: { ...rest, orderNotifyEmail: orderNotifyEmail || null },
  });

  revalidateCatalog();
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}
