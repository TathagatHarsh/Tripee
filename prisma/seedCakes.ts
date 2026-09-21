import { PrismaClient } from "@prisma/client";
import { categoryForConfig } from "../lib/shop";
import type { CatalogSnapshot } from "../lib/catalogSnapshot";
import { priceCake } from "../lib/pricing";
import { PRESETS } from "../lib/presets";
import { productionSpecFromConfig } from "../lib/productionSpec";
import { migrateConfig } from "../lib/schema";

/**
 * The twenty-one hardcoded presets, migrated into CakeProduct.
 *
 * ## Create-if-missing, never upsert
 *
 * The same policy prisma/seed.ts applies to CatalogOption, and for the same
 * reason: every row here becomes *authored data* the moment the bakery touches
 * it. A seed that "restored" prices would quietly undo an afternoon of somebody
 * repricing the shop, and one that restored names would rename a cake back
 * after an owner deliberately changed it. Bootstrapping a row that does not
 * exist yet is safe; rewriting one that does is not.
 *
 * The consequence is that this is idempotent by construction rather than by a
 * flag: running it twice writes nothing the second time, running it after an
 * owner has edited six cakes leaves those six alone, and deleting a cake and
 * re-running brings that one back. The match is on `slug`, which is unique.
 *
 * ## Where each field comes from
 *
 *   name, description  the preset's own `name` and `blurb`;
 *   slug               the preset's own slug, so every existing /cakes/<slug>
 *                      link and every bookmark still resolves;
 *   category           `categoryForConfig` — the predicates lib/shop already
 *                      used to file a cake by flavour, run once here rather
 *                      than on every page render;
 *   pricePaise         what the cake cost yesterday. See below;
 *   sizeBand, eggless  read straight off the config;
 *   variant            one, from those three — see below;
 *   image              `/presets/<slug>.webp`, the committed render that has
 *                      always been this cake's photograph;
 *   config             the preset's own `CakeConfig`, so the kitchen goes on
 *                      getting the same docket it always did.
 *
 * ## Why the price is computed and then never computed again
 *
 * Yesterday a preset's price was `priceCake(config, catalogue).total` — the
 * builder's option arithmetic, run at render time. The point of this phase is
 * that it stops being that. So the arithmetic runs exactly once, here, to
 * decide what each cake should cost on day one, and the answer is written to a
 * column an owner edits from then on.
 *
 * The delivery fee is subtracted back out, because `priceCake` folds the slot's
 * charge into its subtotal and `priceProduct` adds the customer's chosen slot
 * separately — leaving it in would charge for delivery twice. GST is excluded
 * for the same reason: `pricePaise` is pre-tax and `priceProduct` applies the
 * rate. The result is that a cake ordered today for the slot it shipped with
 * comes to the same total it came to yesterday.
 *
 * ## One variant each, and deliberately not two
 *
 * A cake is bought as a `CakeVariant` now — a size, a sponge type and a price —
 * and each preset produces exactly one: its own size, its own sponge, its own
 * price. It would be easy to write a second row here so that every seeded cake
 * offered both egg and eggless, and it would be a fabrication: nobody has
 * decided what a Chocolate Truffle with egg in it costs, and a seed that made
 * one up would put a price on the shelf that the bakery never agreed to.
 *
 * So a seeded cake sells as exactly the cake it was, and the storefront shows
 * one option where there is one option. Adding the 2 kg, or the version with
 * egg, is a row in the grid at /admin/cakes — which is the point of the grid.
 *
 * Nothing is invented. There is no new cake here, no cake with a made-up price
 * and no description written for this file — every value is one the repository
 * already held.
 */

export interface SeedReport {
  created: string[];
  backfilled: string[];
  skipped: string[];
}

export async function seedCakes(
  db: PrismaClient,
  catalog: CatalogSnapshot,
): Promise<SeedReport> {
  const report: SeedReport = { created: [], backfilled: [], skipped: [] };

  /* One query rather than twenty-one existence checks. */
  const existing = new Map(
    (await db.cakeProduct.findMany({
      select: { slug: true, config: true, productionSpec: true },
    })).map((r) => [r.slug, r]),
  );

  for (const [i, preset] of PRESETS.entries()) {
    const current = existing.get(preset.slug);
    if (current) {
      /* Specifications arrived after the seeded catalogue. Fill only a
         missing spec from that row's own validated CakeConfig. This preserves
         every authored field and leaves an unreadable legacy row unpublished
         for a person to repair instead of guessing at its recipe. */
      const storedConfig = migrateConfig(current.config);
      if (current.productionSpec === null && storedConfig) {
        await db.cakeProduct.update({
          where: { slug: preset.slug },
          data: { productionSpec: productionSpecFromConfig(storedConfig) },
        });
        report.backfilled.push(preset.slug);
      }
      report.skipped.push(preset.slug);
      continue;
    }

    const priced = priceCake(preset.config, catalog);
    const deliveryFee = catalog.price.deliveryFee[preset.config.delivery] ?? 0;
    /* Pre-GST, and without the delivery the customer has not chosen yet. */
    const pricePaise = priced.subtotal - deliveryFee;

    await db.cakeProduct.create({
      data: {
        slug: preset.slug,
        name: preset.name,
        description: preset.blurb,
        category: categoryForConfig(preset.config),
        pricePaise,
        sizeBand: preset.config.size,
        isEggless: preset.config.eggless,
        /* The committed render of this exact configuration. A root-relative
           path rather than a Blob URL, which next/image serves happily — see
           the note on `primaryImageUrl` in prisma/schema.prisma. */
        primaryImageUrl: `/presets/${preset.slug}.webp`,
        primaryImageAlt: `${preset.name}. ${preset.blurb}`,
        config: preset.config,
        productionSpec: productionSpecFromConfig(preset.config),
        /* The cake as it was, as one buyable version of itself. Written in the
           same `create` so a cake can never exist with nothing to sell. */
        variants: {
          create: [
            {
              sizeBand: preset.config.size,
              eggType: preset.config.eggless ? "eggless" : "egg",
              pricePaise,
              isAvailable: true,
            },
          ],
        },
        isAvailable: true,
        /*
         * Nothing is featured by default.
         *
         * Which cakes to lead with is an editorial decision the bakery makes,
         * and flagging the first eight because they happen to be first in an
         * array would be this file making it for them. The homepage falls back
         * to `sortOrder` when nothing is flagged, so the shop looks exactly as
         * it did.
         */
        isFeatured: false,
        /* The order lib/presets listed them in, which is the order the shop
           has always shown them in. */
        sortOrder: i,
      },
    });

    report.created.push(preset.slug);
  }

  return report;
}
