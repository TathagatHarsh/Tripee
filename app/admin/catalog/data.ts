import type { CatalogCategory } from "@prisma/client";
import { db } from "@/lib/db";
import type { Row } from "@/components/admin/CatalogList";

/**
 * The catalogue rows one group page needs, read once.
 *
 * Here rather than in each of the three group pages for the reason
 * app/admin/orders/[ref]/data.ts gives about its own query: the `select` list
 * has to be identical everywhere, and the copy that drifts is always the one
 * nobody is looking at. A page that quietly forgot `imageUrl` would render a
 * whole category with no photographs and look like a category with no
 * photographs.
 *
 * No authorization here, deliberately. Every caller is a page under
 * app/admin/layout.tsx, whose `requireAdmin()` runs on the server for every
 * request to anything nested beneath it; a check in a data helper would read as
 * though it were the gate when it is not. The gate is the layout, and for
 * writes it is the action.
 */

/** Timestamps are formatted here so `Row` stays serialisable across the boundary. */
const DAY = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export async function loadCategory(
  category: CatalogCategory,
  query: string,
): Promise<Row[]> {
  const term = query.trim();

  const rows = await db.catalogOption.findMany({
    where: {
      category,
      /*
       * The name and the blurb, and not the internal `value`. An owner
       * searching "chocolate" means the word on the option; matching the enum
       * literal too would surface `belgian-chocolate` for a search of
       * "belgian-cho" and teach them that the hyphenated form is a thing they
       * are supposed to know — which §23 is specifically about not doing.
       */
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { blurb: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      category: true,
      value: true,
      name: true,
      blurb: true,
      swatch: true,
      imageUrl: true,
      imageAlt: true,
      priceInputPaise: true,
      isAvailable: true,
      updatedAt: true,
      /*
       * A count rather than the rows. The list shows "3 changes" as a hint that
       * history exists and the editor shows the history itself — pulling every
       * change for twenty-four toppings to render a number would be twenty-four
       * joins for a digit.
       */
      _count: { select: { priceChanges: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    value: r.value,
    name: r.name,
    blurb: r.blurb,
    swatch: r.swatch,
    imageUrl: r.imageUrl,
    imageAlt: r.imageAlt,
    priceInputPaise: r.priceInputPaise,
    isAvailable: r.isAvailable,
    updatedAt: DAY.format(r.updatedAt),
    changes: r._count.priceChanges,
  }));
}

/** How many options a category has, and how many are on today. Used by the overview. */
export async function countCategory(
  category: CatalogCategory,
): Promise<{ total: number; available: number; withPhoto: number }> {
  const [total, available, withPhoto] = await Promise.all([
    db.catalogOption.count({ where: { category } }),
    db.catalogOption.count({ where: { category, isAvailable: true } }),
    /* `not: null` rather than a truthiness test: the column is nullable and the
       application never writes "", so NULL is the only "no photo" there is —
       see the note on `imageUrl` in prisma/schema.prisma. */
    db.catalogOption.count({ where: { category, imageUrl: { not: null } } }),
  ]);
  return { total, available, withPhoto };
}
