import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import type { CakeCategory, Prisma } from "@prisma/client";
import type { CakeProductView } from "./cakes";
import { db, hasDatabase } from "./db";
import { migrateConfig, type SizeBand } from "./schema";
import { parseProductionSpec } from "./productionSpec";

/**
 * The cakes the shop sells, read on the server.
 *
 * Server only — it imports lib/db, so a client component reaching for this
 * fails to bundle rather than silently shipping Prisma to a browser. The pure
 * half (types, categories, the choices a customer makes) is lib/cakes.ts.
 *
 * ## The cache is lib/catalogData's, deliberately
 *
 * Same mechanism, same reasoning, written out there at length: `unstable_cache`
 * with a tag rather than a module-level `let` with a TTL, because on a
 * serverless runtime a module-level cache is a *per-instance* cache and an
 * admin's save would leave every other lambda quoting yesterday's price
 * indefinitely. The tag is invalidated at the moment of the write, from a
 * Server Action, with `updateTag` — which is read-your-own-writes, so the owner
 * who just changed a price is not shown the old one.
 *
 * A separate tag from `catalog`, because these are separate decisions: nothing
 * about repricing a filling changes what a shop cake costs any more, and
 * invalidating the whole catalogue every time somebody toggles a cake's
 * availability would throw away the snapshot every price quote in the product
 * depends on.
 *
 * ## No fallback, and why that is different from the catalogue
 *
 * lib/catalogData falls back to shipped defaults when there is no database, so
 * `npm run dev` with an empty .env still designs and prices a cake. There is no
 * equivalent here and there should not be: the shipped constants for *cakes*
 * are lib/presets, and serving them as a catalogue is precisely the arrangement
 * this phase exists to end. A deployment with no database, or one where nobody
 * has run the seed, has an empty shop — which the shop says plainly, and which
 * an owner fixes by adding a cake rather than by wondering which list they are
 * looking at.
 */

export const CAKES_TAG = "cakes";

/**
 * Every column the views below need, named once so the queries cannot drift.
 *
 * `pricePaise`, `sizeBand` and `isEggless` are deliberately absent. They are
 * still on the table as a derived summary (see prisma/schema.prisma) and
 * nothing in the application reads them — selecting them here is how they would
 * find their way back onto a card.
 *
 * The two children are ordered in SQL rather than in `toView`, so the ordering
 * survives being cached and cannot be forgotten by a second reader. Variants
 * come cheapest-first, which is the order the "From ₹X" on a card and the
 * grid in the admin both want.
 */
const FIELDS = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  primaryImageUrl: true,
  primaryImageAlt: true,
  config: true,
  productionSpec: true,
  isAvailable: true,
  isFeatured: true,
  sortOrder: true,
  updatedAt: true,
  variants: {
    select: {
      id: true,
      sizeBand: true,
      eggType: true,
      pricePaise: true,
      isAvailable: true,
    },
    orderBy: [{ pricePaise: "asc" }, { sizeBand: "asc" }],
  },
  images: {
    select: { id: true, url: true, alt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.CakeProductSelect;

type Row = Prisma.CakeProductGetPayload<{ select: typeof FIELDS }>;

/**
 * A row, made safe to render and safe to cache.
 *
 * Two conversions matter. `config` goes through `migrateConfig`, which is the
 * same gate every other deserialisation path in this product uses — a stored
 * recipe naming a withdrawn option (`shape: "bundt"`) is translated rather than
 * dropped, and one that genuinely no longer parses becomes null instead of
 * throwing on a shop page. And `sizeBand` is cast rather than parsed: the write
 * path validates it against the Zod enum, and a row that somehow held nonsense
 * would show its raw value on the card rather than failing the page.
 */
function toView(r: Row): CakeProductView {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    variants: r.variants.map((v) => ({
      id: v.id,
      sizeBand: v.sizeBand as SizeBand,
      eggType: v.eggType,
      pricePaise: v.pricePaise,
      isAvailable: v.isAvailable,
    })),
    imageUrl: r.primaryImageUrl,
    imageAlt: r.primaryImageAlt,
    gallery: r.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
    config: migrateConfig(r.config),
    productionSpec: parseProductionSpec(r.productionSpec),
    isAvailable: r.isAvailable,
    isFeatured: r.isFeatured,
    sortOrder: r.sortOrder,
    updatedAt: r.updatedAt.getTime(),
  };
}

/**
 * Every cake on sale, in display order.
 *
 * One query for the whole shop rather than one per page or per filter, and the
 * filtering happens in the page. Twenty-odd rows is not a table you paginate —
 * it is smaller than the catalogue snapshot this same request already loads —
 * and keeping it as one cached value means /shop, a category, the cart and the
 * checkout all read the identical list and cannot disagree about what is on
 * the shelf.
 *
 * Withdrawn cakes are left out entirely rather than carried with a flag, which
 * is lib/catalogData's rule for an inactive delivery zone: a cake that is off
 * is not for sale, and every caller filtering for itself is a caller that
 * forgets. The basket needs to know about a cake that has *gone* — it asks by
 * slug and gets nothing back, which is exactly the answer it renders.
 */
const loadAvailable = unstable_cache(
  async (): Promise<CakeProductView[]> => {
    const rows = await db.cakeProduct.findMany({
      where: { isAvailable: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: FIELDS,
    });
    return rows.map(toView);
  },
  ["cakes-available"],
  { tags: [CAKES_TAG] },
);

export async function listCakes(): Promise<CakeProductView[]> {
  if (!hasDatabase()) return [];
  try {
    return await loadAvailable();
  } catch (e) {
    /*
     * Logged and answered with an empty shelf rather than an exception.
     *
     * The catalogue fails closed in production because serving the shipped
     * defaults would *mis-price* a sale. This cannot: an empty list sells
     * nothing at all, which is a visibly broken shop rather than a quietly
     * wrong one, and it keeps a database blip off the homepage as a stack
     * trace. The price paths refuse separately — see `reviewBasket`, which
     * cannot quote a cake it did not find.
     */
    console.error("cakes_read_failed", e);
    return [];
  }
}

/** One cake by its address, or nothing. Withdrawn cakes are nothing. */
export async function cakeBySlug(slug: string): Promise<CakeProductView | undefined> {
  const all = await listCakes();
  return all.find((c) => c.slug === slug);
}

/**
 * The cakes named by a basket, by slug, keyed for lookup.
 *
 * A `Map` rather than an array because every caller is asking "is this line's
 * cake still on sale, and what does it cost" one line at a time. A slug with no
 * entry is the answer for a cake that has been withdrawn or deleted since it
 * went in the basket, and the callers all render that case rather than throwing.
 */
export async function cakesBySlug(
  slugs: readonly string[],
): Promise<Map<string, CakeProductView>> {
  const wanted = new Set(slugs);
  const all = await listCakes();
  return new Map(all.filter((c) => wanted.has(c.slug)).map((c) => [c.slug, c]));
}

/* ─────────────────────────────────────────────────────────────── the admin */

export interface AdminCakeFilters {
  /** Matched against the name and the description, case-insensitively. */
  q?: string;
  category?: CakeCategory;
  /** Undefined means both; the portal's third filter chip. */
  available?: boolean;
}

/**
 * The admin's list: withdrawn cakes included, and never cached.
 *
 * Uncached on purpose. The tag above is invalidated by every write in
 * app/admin/cakes/actions, so caching this would work — but the portal's layout
 * is already `force-dynamic` and an owner who has just saved needs to see the
 * row they saved, not a value that happens to have been refreshed. The
 * storefront is the surface that gets the cache; the tool gets the truth.
 *
 * The search runs in Postgres rather than over a loaded array, for the reason
 * app/orders/data gives about the customer's own list: it is the database's job,
 * it stays correct when there are three hundred cakes, and `mode: "insensitive"`
 * is a thing `Array.filter` has to reimplement badly.
 */
export async function listCakesForAdmin(
  { q, category, available }: AdminCakeFilters = {},
): Promise<CakeProductView[]> {
  if (!hasDatabase()) return [];

  const search = q?.trim();

  const rows = await db.cakeProduct.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(available === undefined ? {} : { isAvailable: available }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: FIELDS,
  });

  return rows.map(toView);
}

/** One cake by id, withdrawn or not — the editor's own read. */
export async function cakeById(id: string): Promise<CakeProductView | null> {
  if (!hasDatabase()) return null;
  const row = await db.cakeProduct.findUnique({ where: { id }, select: FIELDS });
  return row ? toView(row) : null;
}

/**
 * How many orders name this cake.
 *
 * The one question that decides whether the editor offers Delete or only
 * Withdraw. A cake nobody has ordered is a mistake somebody is tidying up; a
 * cake with orders behind it is part of a record, and the honest control for it
 * is the one that stops new sales without touching the past. See §5's "delete
 * only where safe" and `deleteCake` in app/admin/cakes/actions.
 */
export async function orderCountFor(cakeProductId: string): Promise<number> {
  if (!hasDatabase()) return 0;
  return db.orderCake.count({ where: { cakeProductId } });
}

/**
 * Call after any write to CakeProduct.
 *
 * `updateTag` rather than `revalidateTag`, which in Next 16 are two different
 * promises — see lib/catalogData's note. Only callable from a Server Action,
 * which is why every write in this feature is one.
 */
export function revalidateCakes(): void {
  updateTag(CAKES_TAG);
}
