import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { priceCake } from "../lib/pricing";
import {
  DEFAULT_GST_BASIS_POINTS, DEFAULT_ROWS, DEFAULT_SETTINGS, snapshotFrom,
} from "../lib/catalogDefaults";
import { PRESETS } from "../lib/presets";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * The catalogue, and the presets.
 *
 * A CatalogItem table was seeded here once before and read by nothing, so it
 * was dropped (migration 2). CatalogOption is the opposite arrangement: it is
 * what the pricing engine and every picker read, and lib/catalogDefaults.ts —
 * the values this writes — is only its starting point.
 *
 * Which is exactly why the catalogue is written create-if-missing rather than
 * upserted. Every row here becomes authored data the moment the bakery touches
 * it, and a seed that "restores" prices would quietly undo an afternoon of
 * somebody repricing the menu. Bootstrapping a row that does not exist yet is
 * safe; rewriting one that does is not. To genuinely reset an option, delete
 * that row and re-run this.
 *
 * Presets are the opposite case and keep their upsert: a Design row is derived
 * from lib/presets.ts, nobody edits it by hand, and totalPaise is a cache so
 * the gallery does not reprice eight cakes on every render.
 */
async function main() {
  await db.pricingSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      tierSurchargePaise: DEFAULT_SETTINGS.tierSurchargePaise,
      layerSurchargePaise: DEFAULT_SETTINGS.layerSurchargePaise,
      messagePipingPaise: DEFAULT_SETTINGS.messagePipingPaise,
      dripPaise: DEFAULT_SETTINGS.dripPaise,
      sugarFreePaise: DEFAULT_SETTINGS.sugarFreePaise,
      gstBasisPoints: DEFAULT_GST_BASIS_POINTS,
    },
    update: {},
  });

  let written = 0;
  for (const r of DEFAULT_ROWS) {
    const row = await db.catalogOption.upsert({
      where: { category_value: { category: r.category, value: r.value } },
      create: {
        category: r.category,
        value: r.value,
        name: r.name,
        blurb: r.blurb,
        shortName: r.shortName ?? null,
        swatch: r.swatch ?? null,
        glyph: r.glyph ?? null,
        priceInputPaise: r.priceInputPaise,
        multiplier: r.multiplier ?? null,
        isAvailable: r.isAvailable,
        sortOrder: r.sortOrder,
      },
      update: {},
      select: { createdAt: true, updatedAt: true },
    });
    // A row this run created has not been updated since it was created.
    if (row.createdAt.getTime() === row.updatedAt.getTime()) written++;
  }

  /*
   * Price the presets from the catalogue as it now stands, not from the
   * defaults this file just offered. On a database where somebody has already
   * repriced a sponge, those are different numbers, and the gallery should show
   * what the bakery charges rather than what the code shipped with.
   *
   * Read straight through snapshotFrom rather than lib/catalogData's
   * getCatalogSnapshot: that one is wrapped in unstable_cache, which needs a
   * Next request context this script does not have.
   */
  const settings = await db.pricingSettings.findUniqueOrThrow({
    where: { id: "singleton" },
  });
  const rows = await db.catalogOption.findMany();
  const catalog = snapshotFrom(
    rows.map((r) => ({
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
    })),
    {
      tierSurchargePaise: settings.tierSurchargePaise,
      layerSurchargePaise: settings.layerSurchargePaise,
      messagePipingPaise: settings.messagePipingPaise,
      dripPaise: settings.dripPaise,
      sugarFreePaise: settings.sugarFreePaise,
      gstRate: settings.gstBasisPoints / 10_000,
    },
  );

  for (const p of PRESETS) {
    const totalPaise = priceCake(p.config, catalog).total;
    await db.design.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, config: p.config, totalPaise },
      update: { config: p.config, totalPaise },
    });
  }

  console.log(
    `Catalogue: ${DEFAULT_ROWS.length} options checked, ${written} newly written, `
    + `${DEFAULT_ROWS.length - written} left as they were.`,
  );
  console.log(`Seeded ${PRESETS.length} presets.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
