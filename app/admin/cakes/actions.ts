"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type CakeCategory, type EggType } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revalidateCakes } from "@/lib/cakeData";
import { CAKE_CATEGORIES, EGG_TYPES, SLUG, slugify } from "@/lib/cakes";
import { db, hasDatabase } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { SizeBand } from "@/lib/schema";
import { SIZES } from "@/lib/catalog";
import { ProductionSpec } from "@/lib/productionSpec";
import {
  type Crop, discard, hasImageStore, ImageError, MAX_UPLOAD_BYTES,
  NO_IMAGE_STORE_MESSAGE, optimize, store,
} from "@/lib/storage";
import type { ActionResult } from "@/app/admin/actions";

/**
 * Every write the cake portal can make.
 *
 * ## Every one of these starts with requireAdmin()
 *
 * Not because app/admin/layout.tsx forgot to — it guards the pages — but
 * because a layout does not run for an action. A Server Action is a POST to an
 * endpoint whose id is in the page's own payload, and anybody who has ever
 * loaded /admin has that id; nothing about invoking it re-renders the tree that
 * checked the role. So the check is here, first, on each one, and the apparent
 * duplication is the only thing standing between a signed-in customer with the
 * dev tools open and the price of every cake in the shop.
 *
 * `requireAdmin()` refuses by throwing a redirect, which is why it is always the
 * first statement and never inside a `try` — a catch would swallow the refusal
 * and carry on into the write. KITCHEN and VENDOR are refused by the same call:
 * `allows` treats VENDOR as an exact match in both directions, so a partner
 * bakery signing in cannot reach any of this, and KITCHEN ranks below ADMIN.
 *
 * ## Server Actions rather than route handlers
 *
 * Two reasons that both matter. lib/cakeData's invalidation is `updateTag`,
 * which Next only permits inside an action and which is what hands the person
 * who just saved a price the new number instead of the cached old one. And
 * proxy.ts's matcher covers `/admin/:path*`, which includes the POST an action
 * makes back to the page it lives on — so a request with no session is turned
 * away before it arrives here. That is a convenience, not the gate; the gate is
 * `requireAdmin`.
 *
 * ## Nothing here touches an order
 *
 * Not one query in this file reads or writes the Order table. That is what
 * makes §11 and §12's promise structural rather than careful: an order froze
 * its price, its cake's name and its cake's photograph at the moment it was
 * placed, and there is no code path from this file that could change any of
 * them. Repricing a cake changes what the *next* customer pays.
 */

/** Rupees on screen, paise in the database. The same parser /admin/catalog uses. */
const RupeeAmount = z
  .string()
  .trim()
  .refine((s) => s.length > 0, "Enter a price.")
  .refine((s) => /^\d+(\.\d{1,2})?$/.test(s), "Use digits, and at most two decimals.")
  .transform((s) => Math.round(Number(s) * 100))
  .refine((paise) => Number.isSafeInteger(paise), "That number is too large.")
  .refine((paise) => paise > 0, "A cake cannot be free.");

const CATEGORY_IDS = CAKE_CATEGORIES.map((c) => c.id) as [CakeCategory, ...CakeCategory[]];

/** Six weight bands, so a grid can be at most six rows by two columns. */
const SIZE_COUNT = SIZES.length;

const EGG_IDS = EGG_TYPES as unknown as [EggType, ...EggType[]];

/**
 * One cell of the admin's price grid.
 *
 * The grid is posted as a single JSON field rather than a hundred form inputs
 * named `price:1.5kg:egg`. Twelve cells with two controls each is twenty-four
 * names to build, parse and keep in step on both sides, and a name is not a
 * type — whereas this is one `FormData` entry and one Zod schema, and the schema
 * is the parser.
 *
 * Which does not make it trusted. `JSON.parse` on a string from a request is the
 * least trustworthy input in this file, so every field below is re-validated:
 * the size against the Zod enum lib/schema owns, the sponge against the Prisma
 * enum, and the price re-parsed from its string by the same `RupeeAmount` the
 * rest of the form uses. A Server Action is an HTTP endpoint.
 */
const VariantInput = z.object({
  sizeBand: SizeBand,
  eggType: z.enum(EGG_IDS),
  price: RupeeAmount,
  isAvailable: z.boolean(),
});

const VariantList = z
  .array(VariantInput)
  .max(SIZE_COUNT * EGG_IDS.length, "That is more versions than there are cells.")
  .refine(
    (rows) => new Set(rows.map((r) => `${r.sizeBand}:${r.eggType}`)).size === rows.length,
    "A cake cannot have two prices for the same size and sponge.",
  );

/**
 * What the three summary columns on CakeProduct should say, given the variants.
 *
 * They are not an authority — prisma/schema.prisma says so at length — and this
 * is the single function that writes them, which is what keeps "not an
 * authority" from meaning "quietly wrong". The cheapest version on sale decides
 * the price and the size; the sponge column says whether an eggless one exists.
 *
 * A cake with nothing on sale falls back to the whole list rather than to zero:
 * `pricePaise` is NOT NULL and a withdrawn cake priced at ₹0 would read, to
 * anything that ever looked, as free.
 */
function summarise(
  rows: readonly { sizeBand: string; eggType: EggType; price: number; isAvailable: boolean }[],
): { pricePaise: number; sizeBand: string; isEggless: boolean } | null {
  if (rows.length === 0) return null;
  const live = rows.filter((r) => r.isAvailable);
  const pool = live.length > 0 ? live : rows;
  const cheapest = pool.reduce((a, b) => (a.price <= b.price ? a : b));
  return {
    pricePaise: cheapest.price,
    sizeBand: cheapest.sizeBand,
    isEggless: pool.some((r) => r.eggType === "eggless"),
  };
}

/** Read the grid off the form, or say what is wrong with it. */
function parseVariants(form: FormData):
  | { ok: true; rows: z.infer<typeof VariantList> }
  | { ok: false; message: string } {
  const raw = form.get("variants");
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" && raw ? raw : "[]");
  } catch {
    return { ok: false, message: "The sizes and prices could not be read. Reload the page." };
  }

  const rows = VariantList.safeParse(parsed);
  if (!rows.success) {
    return { ok: false, message: rows.error.issues[0]?.message ?? "Check the sizes and prices." };
  }
  if (rows.data.length === 0) {
    return {
      ok: false,
      message: "A cake needs at least one size with a price — that is what a customer buys.",
    };
  }
  return { ok: true, rows: rows.data };
}

/**
 * What a cake is allowed to be, checked here and not only in the form.
 *
 * The form constrains what can be submitted and none of it is trusted: the
 * category is re-checked against the Prisma enum, the size against the Zod enum
 * lib/schema owns, and the price is re-parsed from the string. A Server Action
 * is an HTTP endpoint, and the browser is not the only thing that can call it.
 */
const CakeInput = z.object({
  name: z.string().trim().min(1, "A cake needs a name.").max(80),
  slug: z
    .string()
    .trim()
    .min(1, "A cake needs a web address.")
    .max(60)
    .refine((s) => SLUG.test(s), "Use lowercase letters, numbers and hyphens."),
  description: z
    .string()
    .trim()
    .min(1, "Write a line about this cake — it goes on the card and the page.")
    .max(600),
  category: z.enum(CATEGORY_IDS),
  /* No price, no size and no sponge. All three are `CakeVariant` now and arrive
     through `parseVariants`; leaving them on this schema would be two places a
     cake's price could come from, which is exactly what §19 forbids. */
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  sortOrder: z
    .string()
    .trim()
    .refine((s) => /^-?\d+$/.test(s), "Display order is a whole number.")
    .transform(Number)
    .refine((n) => Math.abs(n) <= 100_000, "That is a very large number."),
  /*
   * The photo's description, and the one field allowed to be empty. Empty means
   * "nobody has written one", and the render falls back to the cake's own name
   * rather than shipping an empty `alt=""` — which would tell a screen reader
   * the image is decorative when it is the whole point of the card.
   */
  imageAlt: z.string().trim().max(160),
});

const NO_DB: ActionResult = {
  ok: false,
  message: "This deployment has no database, so nothing can be saved.",
};

/**
 * Every surface a cake appears on, invalidated together.
 *
 * `revalidateCakes()` is the important one and is a *tag*, which reaches the
 * shop, the homepage, the 404's suggestions, every product page, the basket and
 * the checkout at once — see lib/cakeData on why a tag rather than a list of
 * paths that goes stale. The `revalidatePath` calls are the admin's own pages,
 * which are `force-dynamic` anyway; they are here so a page held in the client
 * router cache is not shown back to the person who just edited it.
 */
function revalidateEverywhere(id?: string): void {
  revalidateCakes();
  revalidatePath("/admin/cakes");
  if (id) revalidatePath(`/admin/cakes/${id}`);
}

/** Read the form once, so create and update cannot disagree about a field. */
function parse(form: FormData) {
  return CakeInput.safeParse({
    name: form.get("name"),
    /* An empty slug field means "name it after the cake", which is what an
       owner who never touched the field intends. */
    slug: String(form.get("slug") ?? "").trim() || slugify(String(form.get("name") ?? "")),
    description: form.get("description"),
    category: form.get("category"),
    /* An unchecked checkbox sends nothing at all, which is how a boolean is
       read off a form: present means on. */
    isAvailable: form.get("isAvailable") === "on",
    isFeatured: form.get("isFeatured") === "on",
    sortOrder: String(form.get("sortOrder") ?? "0").trim() || "0",
    imageAlt: form.get("imageAlt") ?? "",
  });
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseProduction(form: FormData) {
  return ProductionSpec.safeParse({
    version: 1,
    ingredients: lines(form.get("ingredients")),
    allergens: form.getAll("allergens").map(String),
    dietaryClaims: lines(form.get("dietaryClaims")),
    kitchenInstructions: form.get("kitchenInstructions"),
    preparationNotes: String(form.get("preparationNotes") ?? "").trim() || undefined,
    allergenStatementReviewed: form.get("allergenStatementReviewed") === "on",
  });
}

/** The one Prisma error worth translating into a sentence an owner can act on. */
function slugTaken(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/* ───────────────────────────────────────────────────────────────── create */

export interface CreateResult extends ActionResult {
  /** Set on success, so the form can send the owner to the editor. */
  id?: string;
}

export async function createCake(
  _prev: CreateResult | undefined,
  form: FormData,
): Promise<CreateResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const parsed = parse(form);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const variants = parseVariants(form);
  if (!variants.ok) return { ok: false, message: variants.message };

  const production = parseProduction(form);
  if (!production.success) {
    return {
      ok: false,
      message:
        "Complete the production specification and confirm the allergen review before this cake can be saved.",
    };
  }

  const { imageAlt, ...rest } = parsed.data;
  /* Non-null: `parseVariants` refuses an empty grid, so there is always at
     least one row to summarise. */
  const summary = summarise(variants.rows)!;

  let id: string;
  try {
    const row = await db.cakeProduct.create({
      data: {
        ...rest,
        ...summary,
        primaryImageAlt: imageAlt || null,
        productionSpec: production.data as Prisma.InputJsonValue,
        /* The cake and everything buyable about it in one insert, so a cake with
           no sizes at all cannot exist even for the length of a transaction. */
        variants: {
          create: variants.rows.map((v) => ({
            sizeBand: v.sizeBand,
            eggType: v.eggType,
            pricePaise: v.price,
            isAvailable: v.isAvailable,
          })),
        },
        /* A visual CakeConfig remains optional. The production specification
           above is the kitchen and food-safety authority. */
      },
      select: { id: true, name: true },
    });
    id = row.id;
  } catch (e) {
    if (slugTaken(e)) {
      return { ok: false, message: "Another cake already uses that web address." };
    }
    console.error("cake_create_failed", e);
    return { ok: false, message: "That didn't save. Try again in a moment." };
  }

  revalidateEverywhere(id);
  return { ok: true, id, message: `${parsed.data.name} added. Add a photo next.` };
}

/* ───────────────────────────────────────────────────────────────── update */

export async function saveCake(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  const parsed = parse(form);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't save." };
  }

  const variants = parseVariants(form);
  if (!variants.ok) return { ok: false, message: variants.message };

  const production = parseProduction(form);
  if (!production.success) {
    return {
      ok: false,
      message:
        "Complete the production specification and confirm the allergen review before this cake can be sold.",
    };
  }

  const { imageAlt, ...rest } = parsed.data;
  const summary = summarise(variants.rows)!;

  /* Read first, so the acknowledgement can name a price that actually moved.
     §14's "confirm a price change out loud" — the dialog quotes both numbers
     before the save, and this says them back afterwards. */
  const before = await db.cakeProduct.findUnique({
    where: { id },
    select: { pricePaise: true, variants: { select: { sizeBand: true, eggType: true } } },
  });
  if (!before) return { ok: false, message: "That cake no longer exists. Reload the page." };

  /*
   * The grid, written as the whole truth about this cake's versions.
   *
   * A cell the owner cleared is a variant that should stop existing, and the
   * honest way to say "these are the versions" is to delete what is not in the
   * list and upsert what is. Nothing downstream is harmed by the delete: an
   * order freezes its size, its sponge and its price onto its own row and holds
   * no reference to a variant, so removing one cannot reach a single order.
   * That is also why there is no withdrawal-instead-of-delete rule here as
   * there is for the cake itself.
   *
   * Upsert rather than "delete all and recreate", because the unique key is the
   * variant's identity and a basket in somebody's browser is holding its `id`:
   * recreating a row the owner did not touch would silently invalidate every
   * cart line naming it and hand those customers a "no longer available" for a
   * cake that is still on sale.
   *
   * One transaction, so a save that fails halfway cannot leave a cake with the
   * old 2 kg deleted and the new one not yet written.
   */
  const keep = new Set(variants.rows.map((v) => `${v.sizeBand}:${v.eggType}`));

  try {
    await db.$transaction([
      db.cakeProduct.update({
        where: { id },
        data: {
          ...rest,
          ...summary,
          primaryImageAlt: imageAlt || null,
          productionSpec: production.data as Prisma.InputJsonValue,
        },
      }),
      ...before.variants
        .filter((v) => !keep.has(`${v.sizeBand}:${v.eggType}`))
        .map((v) =>
          db.cakeVariant.delete({
            where: {
              cakeId_sizeBand_eggType: { cakeId: id, sizeBand: v.sizeBand, eggType: v.eggType },
            },
          }),
        ),
      ...variants.rows.map((v) =>
        db.cakeVariant.upsert({
          where: {
            cakeId_sizeBand_eggType: { cakeId: id, sizeBand: v.sizeBand, eggType: v.eggType },
          },
          create: {
            cakeId: id,
            sizeBand: v.sizeBand,
            eggType: v.eggType,
            pricePaise: v.price,
            isAvailable: v.isAvailable,
          },
          update: { pricePaise: v.price, isAvailable: v.isAvailable },
        }),
      ),
    ]);
  } catch (e) {
    if (slugTaken(e)) {
      return { ok: false, message: "Another cake already uses that web address." };
    }
    console.error("cake_save_failed", e);
    return { ok: false, message: "That didn't save. Try again in a moment." };
  }

  revalidateEverywhere(id);

  const moved = before.pricePaise !== summary.pricePaise;
  return {
    ok: true,
    message: moved
      ? `${parsed.data.name}: from ${formatINR(before.pricePaise)} → from ${formatINR(summary.pricePaise)}. `
        + "Orders already placed keep the price they were quoted."
      : `${parsed.data.name} saved.`,
  };
}

/* ─────────────────────────────────────────────────────── availability etc. */

/**
 * Take a cake off the shelf, or put it back.
 *
 * Deliberately not a delete. An order that names this cake has to go on reading
 * correctly for as long as it exists, and the shop has to stop selling it
 * *now* — which is two different requirements, and withdrawal is the control
 * that meets both. `deleteCake` below exists for the other case: a cake nobody
 * has ever ordered.
 */
export async function setCakeAvailability(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  const next = String(form.get("next") ?? "") === "true";
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  let row: { name: string };
  try {
    if (next) {
      const spec = await db.cakeProduct.findUnique({
        where: { id },
        select: { productionSpec: true },
      });
      if (!spec || !ProductionSpec.safeParse(spec.productionSpec).success) {
        return {
          ok: false,
          message: "Complete and review the production specification before putting this cake on sale.",
        };
      }
    }
    row = await db.cakeProduct.update({
      where: { id },
      data: { isAvailable: next },
      select: { name: true },
    });
  } catch {
    return { ok: false, message: "That cake no longer exists. Reload the page." };
  }

  revalidateEverywhere(id);
  return {
    ok: true,
    message: next
      ? `${row.name} is back on the shelf.`
      : `${row.name} is off the shelf. Orders already placed are unaffected.`,
  };
}

/** Flag or unflag a cake as one to lead with. */
export async function setCakeFeatured(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  const next = String(form.get("next") ?? "") === "true";
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  let row: { name: string };
  try {
    row = await db.cakeProduct.update({
      where: { id },
      data: { isFeatured: next },
      select: { name: true },
    });
  } catch {
    return { ok: false, message: "That cake no longer exists. Reload the page." };
  }

  revalidateEverywhere(id);
  return {
    ok: true,
    message: next ? `${row.name} is featured.` : `${row.name} is no longer featured.`,
  };
}

/**
 * Delete a cake, and only where that is safe.
 *
 * "Safe" is a question with an exact answer: has anybody ordered it. A cake
 * with orders behind it is part of a record and is withdrawn instead — the
 * check is here rather than only in the UI, because the UI hiding a button is
 * not a rule, and the count can change between the page rendering and the
 * button being pressed.
 *
 * The Order side would survive either way — `cakeProductId` is `ON DELETE SET
 * NULL` and the name and photograph are frozen onto the row — so this is not
 * about preventing corruption. It is about not letting one click quietly sever
 * the only link between an order and the product it came from.
 *
 * The photograph goes with it. An orphaned blob costs a fraction of a cent and
 * keeping every deleted cake's photo forever is a storage bill for an undo
 * nobody has asked for.
 */
export async function deleteCake(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  const cake = await db.cakeProduct.findUnique({
    where: { id },
    select: { name: true, primaryImageUrl: true, _count: { select: { orderCakes: true } } },
  });
  if (!cake) return { ok: false, message: "That cake no longer exists. Reload the page." };

  if (cake._count.orderCakes > 0) {
    return {
      ok: false,
      message:
        `${cake.name} has ${cake._count.orderCakes} order${cake._count.orderCakes === 1 ? "" : "s"} `
        + "against it, so it cannot be deleted. Take it off the shelf instead — "
        + "that stops new orders and leaves the old ones readable.",
    };
  }

  try {
    await db.cakeProduct.delete({ where: { id } });
  } catch (e) {
    console.error("cake_delete_failed", e);
    return { ok: false, message: "That didn't delete. Reload the page and try again." };
  }

  await discard(cake.primaryImageUrl);

  revalidateEverywhere(id);
  return { ok: true, message: `${cake.name} deleted.` };
}

/**
 * The crop box the cropper computed, as four fractions of the source.
 *
 * Parsed defensively and dropped entirely on anything unexpected: an unreadable
 * crop means the whole photograph is centre-cropped to 4:3, which is a
 * reasonable picture, whereas refusing the upload would fail an operation that
 * can plainly succeed. lib/storage clamps the numbers again regardless.
 *
 * Shared by the primary photograph and the gallery, which post the same field
 * from the same component — two copies of a lenient parser is two places for
 * "lenient" to drift into "different".
 */
function cropFrom(form: FormData): Crop | undefined {
  const raw = form.get("crop");
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const c = JSON.parse(raw) as Record<string, unknown>;
    if (!["x", "y", "width", "height"].every((k) => typeof c[k] === "number")) return undefined;
    return c as unknown as Crop;
  } catch {
    /* Intentionally ignored — see above. */
    return undefined;
  }
}

/* ────────────────────────────────────────────────────────────────── photos */

/**
 * Put a photograph on a cake.
 *
 * The same shape as /admin/actions' `uploadOptionPhoto` and the same guarantees,
 * because it is the same lib/storage underneath: the bytes are decoded by
 * sharp, cropped, resized to 1024x768 and re-encoded to WebP on the *server*
 * before anything is stored. That re-encode is the security boundary as much as
 * the optimisation — a file that is a valid JPEG and also something else cannot
 * survive being rewritten from a decoded pixel buffer — which is why the MIME
 * type the browser claims is not trusted anywhere in this function.
 *
 * Vercel Blob rather than Supabase Storage, which the brief's §21 offers as the
 * first option. The reasoning is lib/storage's and is worth repeating: the
 * project already has a Blob store wired up with `BLOB_READ_WRITE_TOKEN`,
 * next.config.ts already allows that host for next/image, and Supabase Storage
 * would need `supabase-js` back in the bundle and a *service-role key* in the
 * environment — a higher-privilege secret than this application currently holds
 * anywhere, for a capability it already has. Reusing it is also what §21 asks
 * for first: "reuse existing infrastructure where possible. Do not create
 * duplicate upload systems."
 */
export async function uploadCakePhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;
  if (!hasImageStore()) return { ok: false, message: NO_IMAGE_STORE_MESSAGE };

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No photo was attached. Choose a file and try again." };
  }
  /* Checked here as well as inside `optimize`, because this one can be answered
     without reading 8MB into memory first: `File.size` is known from the
     multipart headers. The check inside `optimize` is the one that counts. */
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. `
        + `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    };
  }

  const cake = await db.cakeProduct.findUnique({
    where: { id },
    select: { slug: true, name: true, primaryImageUrl: true },
  });
  if (!cake) return { ok: false, message: "That cake no longer exists. Reload the page." };

  let url: string;
  try {
    const bytes = await optimize(Buffer.from(await file.arrayBuffer()), cropFrom(form));
    /* Stored under `catalog/cakes/<slug>.webp`, which is the prefix
       next.config.ts's remotePattern already allows — so an uploaded cake photo
       renders without touching the image configuration. */
    url = await store(bytes, "cakes", cake.slug);
  } catch (e) {
    /* An ImageError is written for the person holding the phone that took the
       photo, so it is shown as-is. Anything else is a Blob outage or a bug, and
       its message is not for an owner — that one is logged and replaced. */
    if (e instanceof ImageError) return { ok: false, message: e.message };
    console.error("cake_photo_upload_failed", cake.slug, e);
    return {
      ok: false,
      message: "Couldn't upload this photo. Nothing has changed — try again in a moment.",
    };
  }

  try {
    await db.cakeProduct.update({ where: { id }, data: { primaryImageUrl: url } });
  } catch {
    /* The row went away between the read and the write. The bytes are already
       stored and now belong to nothing, so they go back. */
    await discard(url);
    return { ok: false, message: "That cake no longer exists. Reload the page." };
  }

  /* Only after the new URL is committed. Deleting first would leave every
     customer looking at a 404 if the update failed. */
  await discard(cake.primaryImageUrl);

  revalidateEverywhere(id);
  return { ok: true, message: `Photo updated for ${cake.name}.` };
}

/**
 * Take the photograph off a cake.
 *
 * The row is cleared before the file is deleted, in that order for the reason
 * the upload gives in reverse: if the delete succeeded and the row update
 * failed, the shop would point every customer at a 404. This way the worst case
 * is a file nobody references.
 */
export async function removeCakePhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  const cake = await db.cakeProduct.findUnique({
    where: { id },
    select: { name: true, primaryImageUrl: true },
  });
  if (!cake) return { ok: false, message: "That cake no longer exists. Reload the page." };
  if (!cake.primaryImageUrl) return { ok: true, message: `${cake.name} has no photo.` };

  try {
    await db.cakeProduct.update({ where: { id }, data: { primaryImageUrl: null } });
  } catch {
    return { ok: false, message: "That cake no longer exists. Reload the page." };
  }

  await discard(cake.primaryImageUrl);

  revalidateEverywhere(id);
  return { ok: true, message: `Photo removed from ${cake.name}.` };
}

/* ───────────────────────────────────────────────────────────────── gallery */

/**
 * The extra photographs, and the four things an owner does to them.
 *
 * ## Why these are not `uploadCakePhoto` with a flag
 *
 * They share the decode-crop-re-encode pipeline and nothing else. The primary
 * photograph is a column on the cake and swapping it means replacing a string;
 * a gallery photograph is a row, and adding one means an insert, removing one
 * means a delete, and ordering them means rewriting a column across siblings.
 * A `isGallery` boolean threaded through the existing function would put four
 * different operations behind one name and one set of error messages.
 *
 * ## The one rule that holds the two halves together
 *
 * The primary photograph lives on `CakeProduct.primaryImageUrl`; every other
 * photograph is a `CakeImage` row. `makeCakePhotoPrimary` is therefore a *swap*
 * rather than a flag flip — the gallery row takes the cake's current primary
 * URL and the cake takes the row's. Nothing is uploaded, nothing is deleted, and
 * the cake is never without a photograph mid-operation.
 */

/** How many photographs one cake may carry, beyond the primary. */
const MAX_GALLERY = 8;

export async function addCakeGalleryPhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;
  if (!hasImageStore()) return { ok: false, message: NO_IMAGE_STORE_MESSAGE };

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, message: "That cake no longer exists. Reload the page." };

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No photo was attached. Choose a file and try again." };
  }
  /* Answered from the multipart headers before 8MB is read into memory. The
     check inside `optimize` is the one that counts. */
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. `
        + `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    };
  }

  const cake = await db.cakeProduct.findUnique({
    where: { id },
    select: {
      slug: true,
      name: true,
      _count: { select: { images: true } },
      images: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 },
    },
  });
  if (!cake) return { ok: false, message: "That cake no longer exists. Reload the page." };

  if (cake._count.images >= MAX_GALLERY) {
    return {
      ok: false,
      message: `${cake.name} already has ${MAX_GALLERY} extra photos, which is the limit. `
        + "Remove one to add another.",
    };
  }

  let url: string;
  try {
    const bytes = await optimize(Buffer.from(await file.arrayBuffer()), cropFrom(form));
    url = await store(bytes, "cakes", cake.slug);
  } catch (e) {
    if (e instanceof ImageError) return { ok: false, message: e.message };
    console.error("cake_gallery_upload_failed", cake.slug, e);
    return {
      ok: false,
      message: "Couldn't upload this photo. Nothing has changed — try again in a moment.",
    };
  }

  try {
    await db.cakeImage.create({
      data: {
        cakeId: id,
        url,
        alt: String(form.get("alt") ?? "").trim().slice(0, 160) || null,
        /* Appended. `sortOrder` is only ever compared, never counted, so a gap
           left by a delete is not a problem worth renumbering for. */
        sortOrder: (cake.images[0]?.sortOrder ?? -1) + 1,
      },
    });
  } catch {
    /* The row went away between the read and the write. The bytes are stored
       and now belong to nothing, so they go back. */
    await discard(url);
    return { ok: false, message: "That cake no longer exists. Reload the page." };
  }

  revalidateEverywhere(id);
  return { ok: true, message: `Photo added to ${cake.name}.` };
}

export async function removeCakeGalleryPhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const imageId = String(form.get("imageId") ?? "");
  if (!imageId) return { ok: false, message: "That photo no longer exists. Reload the page." };

  const image = await db.cakeImage.findUnique({
    where: { id: imageId },
    select: { url: true, cakeId: true },
  });
  if (!image) return { ok: true, message: "That photo has already gone." };

  try {
    await db.cakeImage.delete({ where: { id: imageId } });
  } catch {
    return { ok: false, message: "That photo no longer exists. Reload the page." };
  }

  /* Only after the row is gone, so the worst case is a file nobody references
     rather than a page pointing at a 404. `uploadCakePhoto` gives the argument. */
  await discard(image.url);

  revalidateEverywhere(image.cakeId);
  return { ok: true, message: "Photo removed." };
}

/**
 * Promote a gallery photograph to the card.
 *
 * A swap, not a flag: the cake's current primary URL moves into the row the
 * gallery photograph vacates, so nothing is lost and no photograph has to be
 * re-uploaded to get its old place back. A cake with no primary yet simply
 * consumes the row.
 *
 * The alt text travels with its picture, which is the whole reason it is
 * swapped rather than left behind — a description of the old photograph
 * attached to the new one is worse than none at all.
 */
export async function makeCakePhotoPrimary(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const imageId = String(form.get("imageId") ?? "");
  if (!imageId) return { ok: false, message: "That photo no longer exists. Reload the page." };

  const image = await db.cakeImage.findUnique({
    where: { id: imageId },
    select: {
      url: true,
      alt: true,
      cakeId: true,
      cake: { select: { name: true, primaryImageUrl: true, primaryImageAlt: true } },
    },
  });
  if (!image) return { ok: false, message: "That photo no longer exists. Reload the page." };

  const { primaryImageUrl, primaryImageAlt } = image.cake;

  try {
    await db.$transaction([
      db.cakeProduct.update({
        where: { id: image.cakeId },
        data: { primaryImageUrl: image.url, primaryImageAlt: image.alt },
      }),
      /* The old primary takes the gallery slot this one just left. Nothing to
         demote when the cake had no photograph, so the row is deleted instead —
         keeping a gallery row whose URL is null is a row that renders nothing. */
      primaryImageUrl
        ? db.cakeImage.update({
            where: { id: imageId },
            data: { url: primaryImageUrl, alt: primaryImageAlt },
          })
        : db.cakeImage.delete({ where: { id: imageId } }),
    ]);
  } catch (e) {
    console.error("cake_photo_promote_failed", e);
    return { ok: false, message: "That didn't work. Reload the page and try again." };
  }

  revalidateEverywhere(image.cakeId);
  return { ok: true, message: `Cover photo changed for ${image.cake.name}.` };
}

/**
 * Move a gallery photograph one place earlier or later.
 *
 * Two rows swap `sortOrder`, which is the smallest correct reorder: it touches
 * exactly the two photographs involved, needs no renumbering pass, and is
 * idempotent at the ends — a photo already first simply has no neighbour and
 * the action says so rather than failing.
 *
 * Buttons rather than drag-and-drop. A pointer-driven reorder needs a drag
 * library, a keyboard alternative written by hand, and live-region
 * announcements to be usable at all; two buttons are all three for free, and
 * eight photographs is not a list anybody is sorting at speed.
 */
export async function moveCakePhoto(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const imageId = String(form.get("imageId") ?? "");
  const back = String(form.get("direction") ?? "") === "up";
  if (!imageId) return { ok: false, message: "That photo no longer exists. Reload the page." };

  const image = await db.cakeImage.findUnique({
    where: { id: imageId },
    select: { cakeId: true, sortOrder: true },
  });
  if (!image) return { ok: false, message: "That photo no longer exists. Reload the page." };

  /* The adjacent photograph by position rather than by index, so a gap left by
     an earlier delete does not make "one place up" skip a row. */
  const neighbour = await db.cakeImage.findFirst({
    where: {
      cakeId: image.cakeId,
      sortOrder: back ? { lt: image.sortOrder } : { gt: image.sortOrder },
    },
    orderBy: { sortOrder: back ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbour) {
    return { ok: true, message: back ? "Already first." : "Already last." };
  }

  try {
    await db.$transaction([
      db.cakeImage.update({ where: { id: imageId }, data: { sortOrder: neighbour.sortOrder } }),
      db.cakeImage.update({ where: { id: neighbour.id }, data: { sortOrder: image.sortOrder } }),
    ]);
  } catch (e) {
    console.error("cake_photo_move_failed", e);
    return { ok: false, message: "That didn't work. Reload the page and try again." };
  }

  revalidateEverywhere(image.cakeId);
  return { ok: true, message: back ? "Moved earlier." : "Moved later." };
}
