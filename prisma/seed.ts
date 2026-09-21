import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { priceCake } from "../lib/pricing";
import {
  DEFAULT_BAKERY, DEFAULT_GST_BASIS_POINTS, DEFAULT_ROWS, DEFAULT_SETTINGS,
  DEFAULT_ZONES, snapshotFrom,
} from "../lib/catalogDefaults";
import { PRESETS } from "../lib/presets";
import { seedCakes } from "./seedCakes";

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
      minOrderPaise: DEFAULT_SETTINGS.minOrderPaise,
    },
    update: {},
  });

  await db.bakerySettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      name: DEFAULT_BAKERY.name,
      phone: DEFAULT_BAKERY.phone,
      email: DEFAULT_BAKERY.email,
      address: DEFAULT_BAKERY.address,
      hours: DEFAULT_BAKERY.hours,
      fssaiLicence: DEFAULT_BAKERY.fssaiLicence,
    },
    update: {},
  });

  /*
   * Zones all-or-nothing rather than row by row. They carry generated ids, so
   * there is no natural key to upsert against, and a bakery that has drawn its
   * own map should not find this quietly re-adding the zone it deleted. An
   * empty table is the only state that means "never set up".
   */
  if ((await db.deliveryZone.count()) === 0) {
    await db.deliveryZone.createMany({
      data: DEFAULT_ZONES.map((z, i) => ({
        name: z.name,
        pincodeFrom: z.pincodeFrom,
        pincodeTo: z.pincodeTo,
        extraHours: z.extraHours,
        slots: z.slots,
        sortOrder: i,
      })),
    });
  }

  /*
   * Counted, not inferred. This used to compare createdAt with updatedAt and
   * call the difference "newly written", which quietly reported 93 of 95 rows
   * as written on a run that created none of them — every row an admin had
   * never edited looked new. A count either side of the loop is the only thing
   * that actually answers the question.
   */
  const before = await db.catalogOption.count();
  for (const r of DEFAULT_ROWS) {
    await db.catalogOption.upsert({
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
        leadHours: r.leadHours ?? null,
        slotWindow: r.slotWindow ?? null,
        slotNote: r.slotNote ?? null,
        dailyCapacity: r.dailyCapacity ?? null,
        cutoffHours: r.cutoffHours ?? null,
        isAvailable: r.isAvailable,
        sortOrder: r.sortOrder,
      },
      update: {},
      select: { id: true },
    });
  }
  const written = (await db.catalogOption.count()) - before;

  /*
   * Backfill, not an overwrite.
   *
   * The delivery columns arrived in migration 4, after these rows already
   * existed, so they hold null on any database seeded before it — and a null
   * lead time reads as "zero hours", which is a promise no kitchen can keep.
   * Scoped to `leadHours: null` so a slot somebody has already retimed is left
   * exactly as they set it.
   */
  let filled = 0;
  for (const r of DEFAULT_ROWS) {
    if (r.category !== "delivery") continue;
    const lead = await db.catalogOption.updateMany({
      where: { category: "delivery", value: r.value, leadHours: null },
      data: {
        leadHours: r.leadHours ?? null,
        slotWindow: r.slotWindow ?? null,
        slotNote: r.slotNote ?? null,
      },
    });
    const capacity = await db.catalogOption.updateMany({
      where: { category: "delivery", value: r.value, dailyCapacity: null },
      data: { dailyCapacity: r.dailyCapacity ?? null },
    });
    const cutoff = await db.catalogOption.updateMany({
      where: { category: "delivery", value: r.value, cutoffHours: null },
      data: { cutoffHours: r.cutoffHours ?? null },
    });
    filled += lead.count + capacity.count + cutoff.count;
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
  const zoneRows = await db.deliveryZone.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const bakeryRow = await db.bakerySettings.findUnique({ where: { id: "singleton" } });
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
      ...(r.leadHours === null ? {} : { leadHours: r.leadHours }),
      ...(r.slotWindow === null ? {} : { slotWindow: r.slotWindow }),
      ...(r.slotNote === null ? {} : { slotNote: r.slotNote }),
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
      minOrderPaise: settings.minOrderPaise,
    },
    zoneRows.map((z) => ({
      id: z.id, name: z.name, pincodeFrom: z.pincodeFrom, pincodeTo: z.pincodeTo,
      extraHours: z.extraHours, slots: z.slots as typeof DEFAULT_ZONES[number]["slots"],
    })),
    bakeryRow ?? undefined,
  );

  for (const p of PRESETS) {
    const totalPaise = priceCake(p.config, catalog).total;
    await db.design.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, config: p.config, totalPaise },
      update: { config: p.config, totalPaise },
    });
  }

  /*
   * The sellable cakes, from the same presets, priced against the catalogue
   * just assembled above.
   *
   * After the Design rows, deliberately: it reads the catalogue snapshot this
   * function already built, so there is one read and one set of prices behind
   * both. Create-if-missing, so running the seed again changes nothing an owner
   * has edited — see prisma/seedCakes.
   */
  const cakes = await seedCakes(db, catalog);

  console.log(
    `Catalogue: ${DEFAULT_ROWS.length} options checked, ${written} created, `
    + `${DEFAULT_ROWS.length - written} already present and left untouched, `
    + `${filled} delivery rows backfilled.`,
  );
  console.log(`Seeded ${PRESETS.length} presets.`);
  console.log(
    `Cakes: ${cakes.created.length} created, `
    + `${cakes.skipped.length} already present and left untouched.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
