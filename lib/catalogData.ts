import { unstable_cache, updateTag } from "next/cache";
import { DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, snapshotFrom } from "./catalogDefaults";
import type { CatalogRow, CatalogSnapshot } from "./catalogSnapshot";
import { db, hasDatabase } from "./db";

/**
 * The catalogue, read on the server.
 *
 * Server only — it imports lib/db, so a client component reaching for this
 * fails to bundle rather than silently shipping Prisma to a browser.
 *
 * ## Why a tag and not a timer
 *
 * The obvious implementation is a module-level `let cached` with a TTL. On
 * Vercel that is not a cache, it is a per-instance cache: every lambda has its
 * own module scope, so an admin's save refreshes whichever instance served the
 * save and leaves every other one holding the old prices — not for the length
 * of a TTL, but until each happens to expire or cold-start. Two customers
 * quoted different prices for the same cake, indefinitely, with nothing in the
 * logs to show for it.
 *
 * `unstable_cache` writes to Next's Data Cache, which is shared across
 * instances, and `revalidateTag` invalidates it at the moment of the write
 * rather than up to N seconds later. So there is no TTL here at all: the
 * catalogue is cached until somebody changes it.
 *
 * ## Why the fallbacks
 *
 * lib/db.ts has always held that a deployment without a database should still
 * let somebody design a cake and see a price. That has to keep being true now
 * that the price comes from a table, so both the "no DATABASE_URL" case and a
 * failed query fall back to what the product shipped with, rather than to a
 * blank menu or a NaN total.
 */

export const CATALOG_TAG = "catalog";

/** Prisma hands back nulls; the snapshot's optional fields want undefined. */
function toRow(r: {
  category: CatalogRow["category"];
  value: string;
  name: string;
  blurb: string;
  shortName: string | null;
  swatch: string | null;
  glyph: string | null;
  priceInputPaise: number;
  multiplier: number | null;
  isAvailable: boolean;
  sortOrder: number;
}): CatalogRow {
  return {
    category: r.category,
    value: r.value,
    name: r.name,
    blurb: r.blurb,
    ...(r.shortName === null ? {} : { shortName: r.shortName }),
    ...(r.swatch === null ? {} : { swatch: r.swatch }),
    ...(r.glyph === null ? {} : { glyph: r.glyph }),
    priceInputPaise: r.priceInputPaise,
    ...(r.multiplier === null ? {} : { multiplier: r.multiplier }),
    isAvailable: r.isAvailable,
    sortOrder: r.sortOrder,
  };
}

/**
 * Deliberately free of Date objects and class instances: this value is written
 * to the Data Cache, which serialises it. Row timestamps stay in the database,
 * where the admin table reads them directly.
 */
const load = unstable_cache(
  async (): Promise<CatalogSnapshot> => {
    const [rows, settings] = await Promise.all([
      db.catalogOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
      db.pricingSettings.findUnique({ where: { id: "singleton" } }),
    ]);

    return snapshotFrom(
      rows.map(toRow),
      settings
        ? {
            tierSurchargePaise: settings.tierSurchargePaise,
            layerSurchargePaise: settings.layerSurchargePaise,
            messagePipingPaise: settings.messagePipingPaise,
            dripPaise: settings.dripPaise,
            sugarFreePaise: settings.sugarFreePaise,
            // Stored as basis points so the rate is never a float in the
            // database. 1800 -> 0.18, which is what PriceBreakdown reports.
            gstRate: settings.gstBasisPoints / 10_000,
          }
        : DEFAULT_SETTINGS,
    );
  },
  ["catalog-snapshot"],
  { tags: [CATALOG_TAG] },
);

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  if (!hasDatabase()) return DEFAULT_SNAPSHOT;

  try {
    return await load();
  } catch (e) {
    // A catalogue that cannot be read is not a reason to stop quoting prices,
    // but it is a reason to say so out loud rather than serve defaults in
    // silence — the numbers on screen may not be the ones the bakery set.
    console.error("catalog_read_failed", e);
    return DEFAULT_SNAPSHOT;
  }
}

/**
 * Call after any write to CatalogOption or PricingSettings.
 *
 * The admin's save actions own this; nothing else should need it. It is the
 * tag-based sibling of the revalidatePath that app/kitchen/actions.ts already
 * calls after moving a docket — a tag rather than a path because the catalogue
 * is read by the builder, the presets, the homepage and the kitchen alike, and
 * naming all of them would be a list that goes stale.
 *
 * `updateTag` rather than `revalidateTag`, which in Next 16 are two different
 * promises. revalidateTag marks the entry stale and takes a cache-life profile
 * saying how stale is tolerable; updateTag is read-your-own-writes and is only
 * callable from a Server Action. The person who just typed a new price and
 * pressed save is precisely the person who must not be shown the old one, so
 * this is the stronger of the two and the reason every write goes through an
 * action rather than a route handler.
 */
export function revalidateCatalog(): void {
  updateTag(CATALOG_TAG);
}
