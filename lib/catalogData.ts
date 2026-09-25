import { publicBakeryBrand } from "./brand";
import { unstable_cache, updateTag } from "next/cache";
import {
  DEFAULT_BAKERY, DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, snapshotFrom,
} from "./catalogDefaults";
import type { BakeryInfo, CatalogRow, CatalogSnapshot } from "./catalogSnapshot";
import { db, hasDatabase } from "./db";
import type { DeliverySlot } from "./schema";

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
 * ## Why the fallbacks, and where they stop
 *
 * lib/db.ts has always held that a deployment without a database should still
 * let somebody design a cake and see a price. That is a statement about
 * *development*: `npm run dev` with an empty .env falls back to what the
 * product shipped with, rather than to a blank menu or a NaN total.
 *
 * In production the same fallback is a silent mis-sale, so it is refused — see
 * `CatalogUnavailable` below for the whole of the reasoning. The one exception
 * is `getBakeryInfo`, which carries no price and no availability flag.
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
  leadHours: number | null;
  slotWindow: string | null;
  slotNote: string | null;
  dailyCapacity: number | null;
  cutoffHours: number | null;
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
    ...(r.leadHours === null ? {} : { leadHours: r.leadHours }),
    ...(r.slotWindow === null ? {} : { slotWindow: r.slotWindow }),
    ...(r.slotNote === null ? {} : { slotNote: r.slotNote }),
    ...(r.dailyCapacity === null ? {} : { dailyCapacity: r.dailyCapacity }),
    ...(r.cutoffHours === null ? {} : { cutoffHours: r.cutoffHours }),
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
    const [rows, settings, zones, bakery] = await Promise.all([
      db.catalogOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
      db.pricingSettings.findUnique({ where: { id: "singleton" } }),
      // Inactive zones are left behind entirely rather than carried with a
      // flag: a zone that is off is a place we do not deliver to, and the
      // resolver's "no zone" answer already says exactly that.
      db.deliveryZone.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      db.bakerySettings.findUnique({ where: { id: "singleton" } }),
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
            minOrderPaise: settings.minOrderPaise,
          }
        : DEFAULT_SETTINGS,
      zones.map((z) => ({
        id: z.id,
        name: z.name,
        pincodeFrom: z.pincodeFrom,
        pincodeTo: z.pincodeTo,
        extraHours: z.extraHours,
        slots: z.slots as DeliverySlot[],
      })),
      bakery ?? undefined,
    );
  },
  ["catalog-snapshot"],
  { tags: [CATALOG_TAG] },
);

/**
 * Thrown instead of quietly serving `DEFAULT_SNAPSHOT` when the deployment is
 * supposed to have a catalogue and does not.
 *
 * The shipped defaults are a development floor, not a second catalogue, and the
 * difference only becomes visible in production: every price the customer sees,
 * *and every price an order is written at*, comes out of this snapshot. Falling
 * back in silence therefore does not degrade — it sells. It sells at the prices
 * this repository shipped with rather than the ones the bakery set; it re-opens
 * every option an owner has withdrawn, because the defaults are all available;
 * it drops the delivery zones, so every pincode looks serviceable and every
 * slot looks bookable; and it swaps the configured GST rate and minimum order
 * for the ones in the source tree.
 *
 * None of that surfaces as an error. It surfaces as a month of underpriced
 * cakes. So in production the fallback is refused and the request fails —
 * loudly, where the customer sees a safe error page and the platform log sees
 * the cause. It is the posture lib/auth already takes when it cannot read a
 * role: a guard that cannot read its own rule must not guess.
 */
export class CatalogUnavailable extends Error {}

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  const production = process.env.NODE_ENV === "production";

  if (!hasDatabase()) {
    /* Locally this is the whole point of the defaults: `npm run dev` against no
       DATABASE_URL still designs a cake and shows a price. A production build
       with no DATABASE_URL is a deployment nobody finished configuring, and
       pretending otherwise is precisely how the hardcoded catalogue once
       reached customers. */
    if (production) {
      throw new CatalogUnavailable(
        "catalog_unconfigured: DATABASE_URL is not set on this deployment, so "
        + "there is no catalogue to price from. Refusing to serve the built-in "
        + "development defaults in production.",
      );
    }
    return DEFAULT_SNAPSHOT;
  }

  try {
    const snapshot = await load();
    return { ...snapshot, bakery: publicBakeryBrand(snapshot.bakery) };
  } catch (e) {
    console.error("catalog_read_failed", e);
    if (production) {
      throw new CatalogUnavailable(
        "catalog_read_failed: the catalogue could not be read from the "
        + "database. Refusing to price from the built-in development defaults.",
      );
    }
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

/**
 * The snapshot if it can be trusted, `null` if it cannot.
 *
 * For the callers that have something honest to say about a missing catalogue —
 * a route handler with a 503 to return, a page with a section it can simply
 * leave out. Everything that would otherwise render a price it cannot stand
 * behind should use `getCatalogSnapshot` and let the throw reach the error
 * boundary instead.
 */
export async function tryCatalogSnapshot(): Promise<CatalogSnapshot | null> {
  try {
    return await getCatalogSnapshot();
  } catch (e) {
    if (e instanceof CatalogUnavailable) return null;
    throw e;
  }
}

/**
 * What a customer is told when the catalogue cannot be read. Deliberately says
 * nothing about databases, environments or which of the two went wrong — the
 * detail is on the platform log, where it belongs, under `catalog_read_failed`.
 */
export const CATALOG_UNAVAILABLE_MESSAGE =
  "The kitchen's price list isn't reachable at the moment, so we can't quote "
  + "this accurately. Nothing has been ordered — please try again shortly.";

/**
 * The bakery's own name, phone and address — for page furniture only.
 *
 * Every other reader of the snapshot is deciding what a cake costs or whether
 * an option can be bought, and `getCatalogSnapshot` fails closed for exactly
 * that reason. The footer is not one of those readers, and neither is the 404
 * page: a database outage that turns "page not found" into "application error"
 * has made a bad minute worse and protected nothing, because a stale shop
 * telephone number cannot mis-sell a cake.
 *
 * So this is the one deliberate soft edge, and it is narrow by construction —
 * it hands back `BakeryInfo` and nothing else, so no price and no availability
 * flag can leave through it. The failure is already on the log by the time this
 * swallows it; see `getCatalogSnapshot`.
 */
export async function getBakeryInfo(): Promise<BakeryInfo> {
  try {
    return (await getCatalogSnapshot()).bakery;
  } catch (e) {
    if (e instanceof CatalogUnavailable) return DEFAULT_BAKERY;
    throw e;
  }
}
