"use server";
import { lockAssignments } from "@/lib/assignment";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import type { CatalogCategory, OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/catalogData";
import { CATEGORY_META } from "@/lib/adminNav";
import { VALUES_BY_CATEGORY } from "@/lib/catalogSnapshot";
import { db, hasDatabase } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { applyStatusTransition } from "@/lib/orderTransition";
import { assignOrderToVendor } from "@/lib/vendorTransition";
import { STATUS_LABEL } from "@/lib/orders";
import {
  discard, hasImageStore, ImageError, MAX_UPLOAD_BYTES, NO_IMAGE_STORE_MESSAGE,
  optimize, store,
} from "@/lib/storage";

/**
 * Every write the admin portal can make.
 *
 * Server Actions rather than route handlers, for two reasons that both matter:
 * lib/catalogData's invalidation is `updateTag`, which Next only permits inside
 * an action and which is what hands the person who just saved a price the new
 * number instead of the cached old one; and proxy.ts's matcher covers
 * `/admin/:path*`, which includes the POST an action makes back to the page it
 * lives on — so a request with no session at all is turned away before it
 * arrives here. That is a convenience, not the gate; the gate is below.
 *
 * The forms constrain what can be submitted and none of that is trusted here.
 * A price is re-parsed, the category is re-checked against the Zod enums, and
 * an option naming something the renderer has never heard of is refused: the
 * table would take that string happily and the picker would break on it.
 *
 * ## Every one of these starts with requireAdmin()
 *
 * Not because the layout forgot to — app/admin/layout.tsx guards the pages —
 * but because a layout does not run for an action. A Server Action is a POST to
 * an endpoint whose id is in the page's own payload, and anybody who has ever
 * loaded /admin has that id; nothing about invoking it re-renders the tree that
 * checked the role. So the check is here, first, on each one, and the apparent
 * duplication is the only thing standing between a signed-in customer with the
 * dev tools open and the price of every cake in the shop.
 *
 * `requireAdmin()` refuses by throwing a redirect, which is why it is always the
 * first statement and never inside a `try` — a catch would swallow the refusal
 * and carry on into the write.
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
  /*
   * The photo's description, and the one field here that is allowed to be
   * empty. Empty means "nobody has written one", and the render falls back to
   * the option's own name rather than shipping an empty `alt=""` — which would
   * tell a screen reader the image is decorative when it is the whole point of
   * the card.
   */
  imageAlt: z.string().trim().max(160),
});

export interface ActionResult {
  ok: boolean;
  message: string;
}

const NO_DB: ActionResult = {
  ok: false,
  message: "This deployment has no database, so nothing can be saved.",
};

/**
 * Every catalogue surface, invalidated together.
 *
 * The catalogue used to have one page. It now has an overview, four group
 * lists, an editor per option and a delivery page, and an option that appears
 * on three of them must not show yesterday's price on two.
 *
 * `revalidateCatalog()` is the important one and is a *tag*, which reaches the
 * customer's builder, the presets page and the kitchen alike — see
 * lib/catalogData on why a tag rather than a list of paths that goes stale.
 * These `revalidatePath` calls are the admin's own rendered pages, which are
 * `force-dynamic` anyway; they are here so a page held in the client router
 * cache is not shown back to the person who just edited it.
 */
function revalidateCatalogPages(): void {
  revalidateCatalog();
  revalidatePath("/admin/catalog");
  for (const g of ["cakes", "ingredients", "addons", "pricing"]) {
    revalidatePath(`/admin/catalog/${g}`);
  }
  revalidatePath("/admin/delivery");
}

/**
 * Record that a price moved, in the same transaction that moved it.
 *
 * The two writes are one operation or they are a lie: a price updated without
 * its history row leaves the table claiming the option has always cost this,
 * and a history row written without the update claims a change that did not
 * happen. `db.$transaction` is what makes "the price changed" and "somebody
 * changed the price" the same fact — the same reasoning lib/orderTransition
 * applies to a status move and its OrderEvent.
 *
 * Returns the previous price, or null when the option is gone or the number is
 * unchanged. A no-op save is deliberately not recorded: an owner who opens the
 * price editor, looks at it and presses Save has not changed a price, and a
 * history full of "₹250 → ₹250" is a history nobody reads.
 *
 * **Nothing here touches an order.** OrderItem rows froze their amounts when
 * each order was placed and no query in this file joins one to a catalogue row.
 * That is the property §15 asks to be preserved and it is preserved by there
 * being no code that could break it, rather than by care.
 */
async function repriceWithHistory(
  id: string,
  toPaise: number,
  actorId: string,
): Promise<{ from: number; name: string; category: CatalogCategory; value: string } | null> {
  return db.$transaction(async (tx) => {
    /* Lock the option before reading its old price. Two admins repricing the
       same row now serialize, so the second history entry starts at the first
       admin's committed value instead of recording a stale branch. */
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalog-price:${id}`}))`;
    const current = await tx.catalogOption.findUnique({
      where: { id },
      select: { priceInputPaise: true, name: true, category: true, value: true },
    });
    if (!current || current.priceInputPaise === toPaise) return null;

    await tx.catalogOption.update({ where: { id }, data: { priceInputPaise: toPaise } });
    await tx.catalogPriceChange.create({
      data: {
        optionId: id,
        fromPaise: current.priceInputPaise,
        toPaise,
        actorId,
      },
    });
    return {
      from: current.priceInputPaise,
      name: current.name,
      category: current.category,
      value: current.value,
    };
  });
}

export async function saveOption(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const parsed = OptionEdit.safeParse({
    id: form.get("id"),
    category: form.get("category"),
    value: form.get("value"),
    name: form.get("name"),
    blurb: form.get("blurb"),
    imageAlt: form.get("imageAlt") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const { id, category, value, name, blurb, imageAlt } = parsed.data;

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
      /*
       * The price is deliberately not in this update any more.
       *
       * It used to be — one form saved the name, the blurb and the price
       * together. Two things made that wrong once there was a history table.
       * A price change now has to be recorded with an actor inside a
       * transaction (see `repriceWithHistory`), and §14 asks that it be
       * confirmed out loud rather than saved alongside a typo fix in a blurb.
       * So repricing is `saveOptionPrice` below, and this action is everything
       * about an option that is not money.
       */
      data: { name, blurb, imageAlt: imageAlt || null },
    });
  } catch {
    return { ok: false, message: "That option no longer exists. Reload the page." };
  }

  revalidateCatalogPages();
  revalidatePath(optionPath(category as CatalogCategory, value));
  return { ok: true, message: `${name} saved.` };
}

/** The editor's own URL, for revalidating the page an action was fired from. */
function optionPath(category: CatalogCategory, value: string): string {
  return `/admin/catalog/option/${category}/${value}`;
}

/**
 * Withdraw an option, or bring it back.
 *
 * Deliberately not a delete. A design or an order naming this option has to go
 * on rendering and pricing for as long as it exists, and lib/catalogDefaults
 * would silently backfill a deleted row anyway — so the honest control is the
 * one that says "not right now" without touching the past.
 */
export async function setAvailability(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  const next = String(form.get("next") ?? "") === "true";
  if (!id) return { ok: false, message: "That option no longer exists. Reload the page." };

  /*
   * Returns an ActionResult now, where it used to return void.
   *
   * The old version was a plain form POST that re-rendered the page, and the
   * page showing the new state was the entire feedback. §24 asks for a save
   * state on every modification, and a toggle whose only acknowledgement is
   * that the page happened to come back different is the case that rule exists
   * for — when the write fails, an unchanged toggle looks exactly like a
   * toggle that was never pressed.
   */
  let row: { name: string; category: CatalogCategory; value: string };
  try {
    row = await db.catalogOption.update({
      where: { id },
      data: { isAvailable: next },
      select: { name: true, category: true, value: true },
    });
  } catch {
    return { ok: false, message: "That option no longer exists. Reload the page." };
  }
  const name = row.name;

  revalidateCatalogPages();
  /* The option's own editor too, which shows this switch twice — see the note
     in `saveOptionPrice` about what the router's client cache does otherwise. */
  revalidatePath(optionPath(row.category, row.value));
  return {
    ok: true,
    message: next
      ? `${name} is available again.`
      : `${name} is withdrawn. Cakes that already name it are unaffected.`,
  };
}

/**
 * Withdraw or restore several options at once.
 *
 * §22 asks for bulk actions "if practical with the existing architecture, and
 * not complicated bulk editing unless it is genuinely useful". Availability is
 * the one that clears that bar: a supplier misses a delivery and six toppings
 * are off for the day, which is six round trips through the single toggle and
 * six chances to miss one. Bulk *editing* — names, blurbs, prices in a grid —
 * is not here, because a price is a decision made one option at a time and §14
 * asks for each one to be confirmed.
 *
 * `updateMany` rather than a loop of updates: one statement, so the six either
 * all move or none do, and no partial state to explain.
 */
export async function setAvailabilityBulk(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const ids = form.getAll("ids").map(String).filter(Boolean);
  const next = String(form.get("next") ?? "") === "true";

  if (ids.length === 0) {
    return { ok: false, message: "Nothing was selected." };
  }
  /* A ceiling, because this list comes off a request and `updateMany` with an
     unbounded `in` is a statement somebody else gets to size. No category has
     more than 24 rows, so 200 is far past any honest use. */
  if (ids.length > 200) {
    return { ok: false, message: "That is more options than this page can hold." };
  }

  const { count } = await db.catalogOption.updateMany({
    where: { id: { in: ids } },
    data: { isAvailable: next },
  });

  if (count === 0) {
    return { ok: false, message: "None of those options exist any more. Reload the page." };
  }

  revalidateCatalogPages();
  const noun = count === 1 ? "option" : "options";
  return {
    ok: true,
    message: next
      ? `${count} ${noun} available again.`
      : `${count} ${noun} withdrawn. Cakes that already name them are unaffected.`,
  };
}

/* ------------------------------------------------------------------ price */

/**
 * Change one option's price, and write down that it changed.
 *
 * Separate from `saveOption` for the reason given there, and separate from
 * `saveSettings` because these are two different kinds of number: this one is
 * what a choice costs, that one is what a formula charges.
 *
 * The message names both numbers. §14 asks for the change to be confirmed
 * before it is made — which the client does, in a dialog quoting the old and
 * new prices — and the acknowledgement afterwards says the same two numbers
 * back, because "Saved." on a price is the one save where an owner wants to see
 * that the number that landed is the number they typed.
 */
export async function saveOptionPrice(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That option no longer exists. Reload the page." };

  const parsed = RupeeAmount.safeParse(form.get("price"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That is not a price." };
  }

  const moved = await repriceWithHistory(id, parsed.data, viewer.profile.id);

  if (!moved) {
    /*
     * Null covers two cases and they get two answers. An unchanged price is
     * not a failure — the owner asked for the number it already is — so this
     * reports success and says nothing happened, rather than showing a red
     * toast for a save that was simply unnecessary.
     */
    const still = await db.catalogOption.findUnique({
      where: { id },
      select: { name: true },
    });
    return still
      ? { ok: true, message: `${still.name} is already ${formatINR(parsed.data)}.` }
      : { ok: false, message: "That option no longer exists. Reload the page." };
  }

  revalidateCatalogPages();
  /*
   * And the editor this was fired from, which `revalidateCatalogPages` does
   * not cover: it revalidates the overview, the four group lists and the
   * delivery page, none of which is this option's own page.
   *
   * Found in the browser rather than by reading the code. The price on screen
   * updated — a Server Action returns the re-rendered tree for the route it was
   * called on — but the price *history* panel beneath it went on saying "No
   * changes recorded" over a change that had just been written, because the
   * router served that segment from its client-side cache. Which is the exact
   * failure §24 is about: the save worked and the page said it had not.
   */
  revalidatePath(optionPath(moved.category, moved.value));
  return {
    ok: true,
    message: `${moved.name}: ${formatINR(moved.from)} → ${formatINR(parsed.data)}. `
      + "Orders already placed keep the price they were quoted.",
  };
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
  await requireAdmin();
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
  dailyCapacity: z.string().trim()
    .refine((s) => /^\d+$/.test(s), "Daily capacity is a whole number.")
    .transform(Number)
    .refine((n) => n > 0 && n <= 10_000, "Daily capacity must be between 1 and 10,000."),
  cutoffHours: z.string().trim()
    .refine((s) => /^\d+$/.test(s), "Cutoff is a whole number of hours.")
    .transform(Number)
    .refine((n) => n <= 24 * 90, "That cutoff is more than three months."),
});

export async function saveDeliverySlot(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const parsed = SlotEdit.safeParse({
    id: form.get("id"),
    priceInputPaise: form.get("fee"),
    leadHours: form.get("leadHours"),
    slotWindow: form.get("slotWindow"),
    slotNote: form.get("slotNote"),
    dailyCapacity: form.get("dailyCapacity"),
    cutoffHours: form.get("cutoffHours"),
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
  await requireAdmin();
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

  const isActive = form.get("isActive") === "on";
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('delivery-zones'))`;
      if (isActive) {
        const overlap = await tx.deliveryZone.findFirst({
          where: {
            id: { not: id },
            isActive: true,
            pincodeFrom: { lte: parsed.data.pincodeTo },
            pincodeTo: { gte: parsed.data.pincodeFrom },
          },
          select: { name: true, pincodeFrom: true, pincodeTo: true },
        });
        if (overlap) throw new Error(`ZONE_OVERLAP:${overlap.name}:${overlap.pincodeFrom}-${overlap.pincodeTo}`);
      }
      await tx.deliveryZone.update({ where: { id }, data: { ...parsed.data, isActive } });
    });
  } catch {
    const overlap = await db.deliveryZone.findFirst({
      where: {
        id: { not: id }, isActive: true,
        pincodeFrom: { lte: parsed.data.pincodeTo },
        pincodeTo: { gte: parsed.data.pincodeFrom },
      },
    });
    if (isActive && overlap) return { ok: false, message: `This range overlaps ${overlap.name} (${overlap.pincodeFrom}–${overlap.pincodeTo}).` };
    return { ok: false, message: "That zone could not be saved. Reload and try again." };
  }

  revalidateCatalog();
  revalidatePath("/admin/delivery");
  return { ok: true, message: `${parsed.data.name} saved.` };
}

export async function addZone(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
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

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('delivery-zones'))`;
      const overlap = await tx.deliveryZone.findFirst({
        where: {
          isActive: true,
          pincodeFrom: { lte: parsed.data.pincodeTo },
          pincodeTo: { gte: parsed.data.pincodeFrom },
        },
        select: { name: true, pincodeFrom: true, pincodeTo: true },
      });
      if (overlap) throw new Error("ZONE_OVERLAP");
      const last = await tx.deliveryZone.findFirst({ orderBy: { sortOrder: "desc" } });
      await tx.deliveryZone.create({ data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    });
  } catch {
    const overlap = await db.deliveryZone.findFirst({
      where: {
        isActive: true,
        pincodeFrom: { lte: parsed.data.pincodeTo },
        pincodeTo: { gte: parsed.data.pincodeFrom },
      },
    });
    if (overlap) return { ok: false, message: `This range overlaps ${overlap.name} (${overlap.pincodeFrom}–${overlap.pincodeTo}).` };
    return { ok: false, message: "That zone could not be added. Reload and try again." };
  }

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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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

/**
 * Move one order along, from the order's own page.
 *
 * The kitchen board has always been able to do this and still is. What was
 * missing is that an owner looking at one order — on the phone to the customer
 * whose cake it is — had to leave for /kitchen and find that order again in a
 * list of two hundred to confirm it. Same rules, same recording, second place
 * to ask for it.
 *
 * `requireAdmin` rather than `requireKitchen`, unlike the board's action: this
 * is the owner's portal, and a baker who should be moving dockets has the board
 * for exactly that. It is the first statement and never inside a `try`, for the
 * reason at the top of this file — a layout does not run for an action.
 *
 * The transition itself is lib/orderTransition's, shared with the board, so
 * lib/orders' state machine stays the only thing that decides what is legal.
 * It returns false both for a move that was never legal and for one that lost a
 * race to another screen; either way nothing was written, and either way the
 * honest answer is to say so and let the re-render show the real state.
 */
export async function advanceOrderStatus(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const ref = String(form.get("ref") ?? "");
  const to = String(form.get("to") ?? "") as OrderStatus;
  if (!ref || !to) return { ok: false, message: "That move is missing an order or a status." };

  const reason = String(form.get("reason") ?? "").trim() || null;
  const moved = await applyStatusTransition(ref, to, viewer.profile.id, reason);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${ref}`);

  return moved
    ? { ok: true, message: `Moved to ${STATUS_LABEL[to].toLowerCase()}.` }
    : {
      ok: false,
      message:
        "That move is no longer available — this order has already changed. "
        + "Reload to see where it is.",
    };
}

/* ------------------------------------------------------------------ photos */

/**
 * Put a photograph on a catalogue option.
 *
 * ## The order of operations, which is the whole design
 *
 * Optimize, then store, then update the row, then delete the file that was
 * there before. Every other order loses something:
 *
 *   - deleting the old file first means a failed upload leaves the option with
 *     no photograph and no way back to the one it had;
 *   - updating the row before the upload finishes points the customer's
 *     catalogue at a URL that does not exist yet;
 *   - not deleting at all leaves a store that grows every time somebody
 *     re-crops an image, which is the state most upload features ship in.
 *
 * So the row is only pointed at bytes that are already stored, and the previous
 * bytes are only removed once nothing refers to them. `discard` cannot fail the
 * request — see lib/storage on why housekeeping is not the owner's problem.
 *
 * ## Why the file is not sent to the client's own upload URL
 *
 * Vercel Blob supports client uploads, which would keep the bytes off the
 * server entirely and is the faster path for large files. It is not used here
 * because the re-encode in lib/storage is the security boundary: a client
 * upload puts whatever bytes the browser sent into a public CDN URL under this
 * application's domain, and "the file is validated afterwards" is not a
 * boundary. 8MB through a server action is well inside the limit and the images
 * are small.
 */
export async function uploadOptionPhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;
  if (!hasImageStore()) return { ok: false, message: NO_IMAGE_STORE_MESSAGE };

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That option no longer exists. Reload the page." };

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No photo was attached. Choose a file and try again." };
  }
  /*
   * Checked here as well as inside `optimize`, because this one can be answered
   * without reading 8MB into memory first: `File.size` is known from the
   * multipart headers. The check inside `optimize` is the one that counts —
   * this is the one that is cheap.
   */
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. `
        + `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    };
  }

  const option = await db.catalogOption.findUnique({
    where: { id },
    select: { category: true, value: true, name: true, imageUrl: true },
  });
  if (!option) return { ok: false, message: "That option no longer exists. Reload the page." };

  /*
   * The crop box, as four fractions the cropper computed. Parsed defensively
   * and dropped entirely on anything unexpected: an unparseable crop means the
   * whole photograph is centre-cropped to 4:3, which is a reasonable picture,
   * whereas refusing the upload would fail an operation that can plainly
   * succeed. lib/storage clamps the numbers again regardless.
   */
  let crop: { x: number; y: number; width: number; height: number } | undefined;
  const raw = form.get("crop");
  if (typeof raw === "string" && raw) {
    try {
      const c = JSON.parse(raw) as Record<string, unknown>;
      if (["x", "y", "width", "height"].every((k) => typeof c[k] === "number")) {
        crop = c as unknown as typeof crop;
      }
    } catch {
      /* Intentionally ignored — see above. */
    }
  }

  let url: string;
  try {
    const bytes = await optimize(Buffer.from(await file.arrayBuffer()), crop);
    url = await store(bytes, option.category, option.value);
  } catch (e) {
    /*
     * An ImageError is written for the person holding the phone that took the
     * photo, so it is shown as-is. Anything else is a Blob outage or a bug, and
     * its message is not for an owner — that one is logged and replaced.
     */
    if (e instanceof ImageError) return { ok: false, message: e.message };
    console.error("photo_upload_failed", option.category, option.value, e);
    return {
      ok: false,
      message: "Couldn't upload this photo. Nothing has changed — try again in a moment.",
    };
  }

  try {
    await db.catalogOption.update({ where: { id }, data: { imageUrl: url } });
  } catch {
    /* The row went away between the read and the write. The bytes are already
       stored and now belong to nothing, so they go back. */
    await discard(url);
    return { ok: false, message: "That option no longer exists. Reload the page." };
  }

  await discard(option.imageUrl);

  revalidateCatalogPages();
  revalidatePath(optionPath(option.category, option.value));
  return { ok: true, message: `Photo updated for ${option.name}.` };
}

/**
 * Take the photograph off an option.
 *
 * Destructive, and §26 asks for a confirmation on it — which the client does.
 * There is no undo: the bytes are deleted from the store rather than orphaned,
 * because keeping every removed photograph forever to support an undo nobody
 * has asked for is a storage bill and a privacy surface.
 *
 * The row is cleared before the file is deleted, in that order for the reason
 * the upload gives in reverse: if the delete succeeded and the row update
 * failed, the catalogue would point every customer at a 404. This way the worst
 * case is a file nobody references.
 */
export async function removeOptionPhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That option no longer exists. Reload the page." };

  const option = await db.catalogOption.findUnique({
    where: { id },
    select: { category: true, value: true, name: true, imageUrl: true },
  });
  if (!option) return { ok: false, message: "That option no longer exists. Reload the page." };
  if (!option.imageUrl) return { ok: true, message: `${option.name} has no photo.` };

  try {
    await db.catalogOption.update({ where: { id }, data: { imageUrl: null } });
  } catch {
    return { ok: false, message: "That didn't save. The photo has not been removed." };
  }

  await discard(option.imageUrl);

  revalidateCatalogPages();
  revalidatePath(optionPath(option.category, option.value));
  return { ok: true, message: `Photo removed from ${option.name}.` };
}

/* ------------------------------------------------------- option copy, extras */

/**
 * The pill-sized name, for the five topping placements.
 *
 * A field that exists on one category out of ten, which is why it is its own
 * action rather than another optional key on `saveOption`: an action whose
 * validation depends on which category it was handed is an action with two
 * behaviours and one name. `updateMany` scoped to `placement` is what stops
 * this being pointed at a sponge and giving it a short name nothing reads —
 * the same guard `saveDeliverySlot` uses.
 */
export async function saveShortName(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  const shortName = String(form.get("shortName") ?? "").trim();

  if (!id) return { ok: false, message: "That option no longer exists. Reload the page." };
  if (shortName.length === 0) return { ok: false, message: "The short name cannot be empty." };
  if (shortName.length > 16) {
    return { ok: false, message: "That will not fit the strip over the cake. Sixteen characters." };
  }

  const { count } = await db.catalogOption.updateMany({
    where: { id, category: "placement" },
    data: { shortName },
  });
  if (count === 0) return { ok: false, message: "That option no longer exists. Reload the page." };

  revalidateCatalogPages();
  revalidatePath(optionPath("placement", String(form.get("value") ?? "")));
  return { ok: true, message: "Short name saved." };
}

/**
 * Reorder the options in a category.
 *
 * `sortOrder` is what the customer's picker is ordered by, and until now it was
 * only ever set by the seed — so the bakery could change what a filling costs
 * and not which one a customer sees first, which is a merchandising decision
 * and arguably the more valuable of the two.
 *
 * One `$transaction` of `update`s rather than `updateMany`, because each row
 * gets a different number. Bounded by the ids the page submitted, and every one
 * of them re-checked against the category — a reorder that could be pointed at
 * another category could silently reshuffle the entire menu.
 */
export async function saveOrder(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const category = String(form.get("category") ?? "") as CatalogCategory;
  if (!(category in CATEGORY_META)) {
    return { ok: false, message: "That is not a category." };
  }

  const ids = form.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false, message: "Nothing to reorder." };
  if (ids.length > 200) return { ok: false, message: "That is more options than a category holds." };

  /* Only rows that are genuinely in this category are touched, and the order
     submitted is applied to the rows that survive that filter. */
  const rows = await db.catalogOption.findMany({
    where: { id: { in: ids }, category },
    select: { id: true },
  });
  const known = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => known.has(id));
  if (ordered.length === 0) {
    return { ok: false, message: "None of those options are in this category." };
  }

  const writes: Prisma.PrismaPromise<unknown>[] = ordered.map((id, i) =>
    db.catalogOption.update({ where: { id }, data: { sortOrder: i } }),
  );
  await db.$transaction(writes);

  revalidateCatalogPages();
  return { ok: true, message: `${CATEGORY_META[category].plural} reordered.` };
}

/* ----------------------------------------------------------------- vendors */

/**
 * The partner bakeries, and who bakes what.
 *
 * Everything below starts with `requireAdmin()` for the reason at the top of
 * this file, and one of them — `linkVendorUser` — needs a second paragraph of
 * justification because it writes a `role`, which nothing else on a request path
 * in this product is allowed to do. See its own note.
 */

const VendorEdit = z.object({
  name: z.string().trim().min(1, "A bakery needs a name.").max(80),
  /*
   * All three optional, and empty becomes null rather than "". A partner who has
   * only ever given a phone number is a real partner, and a required field is
   * how a made-up address ends up on a docket. Null and "" would both mean "not
   * given" and the difference between them is a bug waiting for whoever writes
   * the next `if (vendor.email)` — the same position prisma/schema.prisma takes
   * on `CatalogOption.imageUrl`.
   */
  phone: z.string().trim().max(40).transform((s) => s || null),
  email: z.string().trim().max(120).transform((s) => s || null),
  address: z.string().trim().max(300).transform((s) => s || null),
});

function readVendorEdit(form: FormData) {
  return VendorEdit.safeParse({
    name: form.get("name"),
    phone: form.get("phone"),
    email: form.get("email"),
    address: form.get("address"),
  });
}

/** Every surface that names a vendor, invalidated together. */
function revalidateVendors(id?: string): void {
  revalidatePath("/admin/vendors");
  if (id) revalidatePath(`/admin/vendors/${id}`);
  revalidatePath("/admin/orders");
}

export async function addVendor(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const parsed = readVendorEdit(form);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const vendor = await db.vendor.create({ data: parsed.data, select: { id: true, name: true } });

  revalidateVendors(vendor.id);
  return { ok: true, message: `${vendor.name} added.` };
}

export async function saveVendor(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That form is missing a vendor." };

  const parsed = readVendorEdit(form);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  await db.vendor.update({ where: { id }, data: parsed.data });

  revalidateVendors(id);
  return { ok: true, message: "Vendor saved." };
}

/**
 * Stop sending a bakery work, without erasing that they ever did any.
 *
 * `CatalogOption.isAvailable`'s reasoning, applied to a company: a vendor that
 * has ever held an order is part of that order's history, and deleting the row
 * would leave the history pointing at nothing. The database enforces it rather
 * than trusting this — the foreign keys on VendorOrder and UserProfile are
 * RESTRICT, so there is no delete action here to write.
 *
 * Deactivating does **not** touch the orders they are already holding. A bakery
 * halfway through a cake is still halfway through it, and silently withdrawing
 * live assignments would tell the office an order was unassigned while somebody
 * was baking it. What it does is take them out of the picker and shut their
 * dashboard — see lib/auth's `requireVendor` — which is the office's cue to
 * reassign whatever they still hold, deliberately and one at a time.
 */
export async function setVendorActive(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  const isActive = form.get("isActive") === "true";
  if (!id) return { ok: false, message: "That form is missing a vendor." };

  const vendor = await db.$transaction(async tx => {
    await lockAssignments(tx);
    return tx.vendor.update({ where: { id }, data: { isActive }, select: { name: true } });
  });

  revalidateVendors(id);
  return {
    ok: true,
    message: isActive
      ? `${vendor.name} can be given orders again.`
      : `${vendor.name} deactivated. Orders they already hold are untouched.`,
  };
}

/* ------------------------------------------------------------- assignment */

/**
 * Hand an order to a bakery.
 *
 * The write itself is lib/vendorTransition's, which is where the race lives —
 * two owners assigning the same order a second apart is the case it exists for,
 * and this action's only job is to decide who is allowed to ask.
 *
 * Nothing here touches `Order.status`. The customer's order and the vendor's
 * fulfilment are two state machines on purpose; assigning a bakery is not a
 * promise to the customer and must not move their tracker.
 */
export async function assignVendor(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const ref = String(form.get("ref") ?? "");
  const vendorId = String(form.get("vendorId") ?? "");
  if (!ref) return { ok: false, message: "That form is missing an order." };
  if (!vendorId) return { ok: false, message: "Pick a bakery first." };

  const outcome = await assignOrderToVendor(ref, vendorId, viewer.profile.id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${ref}`);
  revalidatePath("/admin/vendors");

  switch (outcome) {
    case "assigned":
      return { ok: true, message: "Order assigned." };
    case "no_order":
      return { ok: false, message: "There is no order with that reference." };
    case "no_vendor":
      return {
        ok: false,
        message: "That bakery is no longer active, so it cannot be given orders.",
      };
    case "ineligible":
      return {
        ok: false,
        message: "Only confirmed, active orders can be assigned to a bakery.",
      };
    case "raced":
      return {
        ok: false,
        message:
          "That assignment is no longer available — this order has changed hands "
          + "since this page loaded. Reload to see who has it.",
      };
  }
}

/* ---------------------------------------------------------- vendor users */

/**
 * Make a signed-in person a vendor's login.
 *
 * ## Why a screen exists for this when `npm run role` refuses to be one
 *
 * scripts/role.ts is emphatic that roles are not granted through a browser, and
 * it is right about the role it is guarding: an endpoint that can grant ADMIN
 * is one bug away from anybody granting themselves ADMIN. That argument is about
 * *escalation*, and this is the one grant that has none in it. VENDOR reaches no
 * admin page, no kitchen board, no catalogue and no other bakery — it reaches
 * exactly the orders an owner has already chosen to hand over. The dangerous
 * direction, a vendor promoting themselves, remains impossible because nothing
 * a vendor can invoke writes a role at all.
 *
 * So the three things that make this safe are worth stating as rules rather than
 * as care:
 *
 *   1. **The role is a literal.** `role: "VENDOR"` is written in this file. No
 *      value from the form reaches that column, so there is no payload that
 *      could make this grant anything else — the same property lib/auth's
 *      `loadProfile` has by never writing `role` at all.
 *   2. **Staff are refused.** A profile already holding ADMIN or KITCHEN is
 *      turned away, so this form cannot be used to quietly demote the owner or
 *      re-rank a baker. Those still go through the command.
 *   3. **It cannot invent an account.** The person must have signed in at least
 *      once, which is what created the Clerk account and the UserProfile row.
 *      This only ever re-ranks a row a real sign-in already produced — exactly
 *      the order of operations scripts/role.ts documents.
 */
export async function linkVendorUser(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const vendorId = String(form.get("vendorId") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!vendorId) return { ok: false, message: "That form is missing a vendor." };
  if (!email) return { ok: false, message: "Which account? Enter the email they sign in with." };

  const vendor = await db.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });
  if (!vendor) return { ok: false, message: "That bakery no longer exists." };

  /* Addresses live at Clerk, not here — this database holds a role and a name.
     The same lookup scripts/role.ts does, and it fails the same three ways. */
  const clerk = await clerkClient();
  const { data: found } = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });

  if (found.length === 0) {
    return {
      ok: false,
      message:
        `Nobody has signed in on ${email} yet. They need to sign in once first — `
        + "that is what creates the account this links to.",
    };
  }
  if (found.length > 1) {
    return { ok: false, message: `${email} matches more than one account. Use the command instead.` };
  }

  const profile = await db.userProfile.findUnique({
    where: { id: found[0].id },
    select: { id: true, role: true, vendorId: true },
  });

  if (!profile) {
    return {
      ok: false,
      message:
        "That account exists but has never opened the shop, so it has no profile "
        + "yet. Ask them to sign in once, then link it.",
    };
  }
  if (profile.role === "ADMIN" || profile.role === "KITCHEN") {
    return {
      ok: false,
      message:
        "That account is staff here. Changing a staff role is `npm run role`, not "
        + "this form.",
    };
  }

  await db.userProfile.update({
    // Never from the form. See rule 1 above.
    where: { id: profile.id },
    data: { role: "VENDOR", vendorId },
  });

  revalidateVendors(vendorId);
  return { ok: true, message: `${email} now signs in as ${vendor.name}.` };
}

/**
 * Take a vendor login back to being an ordinary account.
 *
 * Only ever moves VENDOR → CUSTOMER, and refuses anything else, so this cannot
 * become a way to strip somebody's staff role from a browser. Their assignment
 * history is untouched: the rows name the *vendor*, not the login, and who
 * baked a cake does not change because somebody left the bakery.
 */
export async function unlinkVendorUser(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const profileId = String(form.get("profileId") ?? "");
  if (!profileId) return { ok: false, message: "That form is missing an account." };

  const profile = await db.userProfile.findUnique({
    where: { id: profileId },
    select: { role: true, vendorId: true },
  });
  if (!profile) return { ok: false, message: "That account no longer exists." };
  if (profile.role !== "VENDOR") {
    return { ok: false, message: "That account is not a vendor login, so there is nothing to undo." };
  }

  await db.userProfile.update({
    where: { id: profileId },
    data: { role: "CUSTOMER", vendorId: null },
  });

  revalidateVendors(profile.vendorId ?? undefined);
  return { ok: true, message: "That account can no longer open the bakery portal." };
}
