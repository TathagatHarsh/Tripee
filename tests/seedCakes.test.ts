import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT } from "@/lib/catalogDefaults";
import { PRESETS } from "@/lib/presets";
import { priceCake, priceProduct } from "@/lib/pricing";
import { seedCakes } from "@/prisma/seedCakes";
import { categoryForConfig } from "@/lib/shop";

/**
 * The migration of the twenty-three hardcoded presets.
 *
 * ## Why a fake client and not a database
 *
 * The thing worth testing here is the *policy* — create-if-missing, never
 * upsert — and the arithmetic that decides each cake's opening price. Neither
 * needs Postgres, and running this against the only DATABASE_URL this project
 * has would mean writing twenty-three rows into production to assert that
 * running it twice does not write forty-six.
 *
 * So the client is two methods: the one query the seed makes and the one write.
 * If `seedCakes` ever reaches for a third, this fails loudly rather than
 * silently doing something untested.
 */

interface Row {
  slug: string;
  name: string;
  description: string;
  category: string;
  pricePaise: number;
  sizeBand: string;
  isEggless: boolean;
  primaryImageUrl: string | null;
  isFeatured: boolean;
  sortOrder: number;
  config: unknown;
  /* The nested create Prisma is handed. Shaped as Prisma shapes it, so the test
     is exercising the call the seed actually makes rather than a flattened
     convenience. */
  variants?: { create: { sizeBand: string; eggType: string; pricePaise: number; isAvailable: boolean }[] };
}

/** A database that is a list. */
function fakeDb(initial: Row[] = []) {
  const rows = [...initial];
  return {
    rows,
    cakeProduct: {
      findMany: async () => rows.map((r) => ({ slug: r.slug })),
      create: async ({ data }: { data: Row }) => {
        if (rows.some((r) => r.slug === data.slug)) {
          /* What Postgres would do: `slug` is UNIQUE. A seed that relied on the
             constraint rather than on its own check would blow up here. */
          throw new Error("unique constraint violated");
        }
        rows.push(data);
        return data;
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (db: ReturnType<typeof fakeDb>) => seedCakes(db as any, DEFAULT_SNAPSHOT);

describe("seedCakes", () => {
  it("creates one cake per preset", async () => {
    const db = fakeDb();
    const report = await run(db);
    expect(report.created).toHaveLength(PRESETS.length);
    expect(db.rows).toHaveLength(PRESETS.length);
  });

  it("invents nothing — every cake is one the repository already held", async () => {
    const db = fakeDb();
    await run(db);
    const slugs = new Set(PRESETS.map((p) => p.slug));
    for (const row of db.rows) expect(slugs.has(row.slug)).toBe(true);
  });

  it("is idempotent: a second run writes nothing", async () => {
    const db = fakeDb();
    await run(db);
    const second = await run(db);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(PRESETS.length);
    expect(db.rows).toHaveLength(PRESETS.length);
  });

  it("leaves a cake the bakery has edited exactly as it is", async () => {
    const db = fakeDb();
    await run(db);

    /* The owner reprices and renames one, as they now can. */
    const edited = db.rows.find((r) => r.slug === PRESETS[0].slug)!;
    edited.pricePaise = 123400;
    edited.name = "Renamed by the bakery";

    await run(db);

    const after = db.rows.find((r) => r.slug === PRESETS[0].slug)!;
    expect(after.pricePaise).toBe(123400);
    expect(after.name).toBe("Renamed by the bakery");
    expect(db.rows).toHaveLength(PRESETS.length);
  });

  it("brings back only a cake that was deleted", async () => {
    const db = fakeDb();
    await run(db);
    const gone = db.rows.splice(3, 1)[0];

    const report = await run(db);
    expect(report.created).toEqual([gone.slug]);
    expect(db.rows).toHaveLength(PRESETS.length);
  });

  it("carries each preset's own name, description, size and photograph across", async () => {
    const db = fakeDb();
    await run(db);

    for (const preset of PRESETS) {
      const row = db.rows.find((r) => r.slug === preset.slug)!;
      expect(row.name).toBe(preset.name);
      expect(row.description).toBe(preset.blurb);
      expect(row.sizeBand).toBe(preset.config.size);
      expect(row.isEggless).toBe(preset.config.eggless);
      expect(row.primaryImageUrl).toBe(`/presets/${preset.slug}.webp`);
      expect(row.category).toBe(categoryForConfig(preset.config));
      /* The recipe travels too, so the kitchen goes on getting the same
         docket it always did for a cake bought by name. */
      expect(row.config).toEqual(preset.config);
    }
  });

  it("prices each cake at what it cost the day before", async () => {
    const db = fakeDb();
    await run(db);

    for (const preset of PRESETS) {
      const row = db.rows.find((r) => r.slug === preset.slug)!;

      /* Yesterday: the builder's option arithmetic, delivery folded in, GST on
         top. Today: the stored price, with the same slot and the same tax
         added by `priceProduct`. The two totals have to agree, or every cake in
         the shop changed price the moment this phase shipped. */
      const before = priceCake(preset.config, DEFAULT_SNAPSHOT);
      const after = priceProduct(
        { name: preset.name, pricePaise: row.pricePaise },
        { delivery: preset.config.delivery },
        DEFAULT_SNAPSHOT,
      );

      expect(after.total).toBe(before.total);
    }
  });

  it("gives every cake exactly one buyable version, from its own config", async () => {
    /*
     * One, and deliberately not two. A second row so that each seeded cake
     * offered both egg and eggless would mean inventing a price nobody has
     * agreed to — see the note in prisma/seedCakes. The version is the cake as
     * it was: its own size, its own sponge, its own price.
     */
    const db = fakeDb();
    await run(db);

    for (const row of db.rows) {
      const created = row.variants?.create ?? [];
      expect(created).toHaveLength(1);
      expect(created[0].sizeBand).toBe(row.sizeBand);
      expect(created[0].eggType).toBe(row.isEggless ? "eggless" : "egg");
      /* The same figure as the cake's summary column, which is what makes
         "from ₹X" on the card equal to what the only version costs. */
      expect(created[0].pricePaise).toBe(row.pricePaise);
      expect(created[0].isAvailable).toBe(true);
    }
  });

  it("flags nothing as featured", async () => {
    /* Which cakes lead is the bakery's editorial decision, not this file's. */
    const db = fakeDb();
    await run(db);
    expect(db.rows.every((r) => r.isFeatured === false)).toBe(true);
  });

  it("keeps the order the shop has always listed them in", async () => {
    const db = fakeDb();
    await run(db);
    for (const [i, preset] of PRESETS.entries()) {
      expect(db.rows.find((r) => r.slug === preset.slug)!.sortOrder).toBe(i);
    }
  });
});
