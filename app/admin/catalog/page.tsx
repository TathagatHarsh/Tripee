import Link from "next/link";
import type { Metadata } from "next";
import { CATALOG_GROUPS, CATEGORY_META } from "@/lib/adminNav";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { hasImageStore, NO_IMAGE_STORE_MESSAGE } from "@/lib/storage";
import { aBtn, aEyebrow, Card, CardHead, Notice, PageHeader, StatCard } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { countCategory } from "./data";

/**
 * The catalogue, as a way in rather than as one long document.
 *
 * This page used to *be* the catalogue: all ninety-six options on a single
 * scrolling page, grouped and jump-linked, on the argument that "a bakery owner
 * opens this to find 'the ganache' — one page means one search box, the
 * browser's own, and no wondering which of ten tabs a filling lives under."
 *
 * That argument was right about search and wrong about everything else, and the
 * thing that changed it is photographs. Ninety-six rows was a long document;
 * ninety-six rows each with an image, an upload control and a price editor is a
 * page that neither renders nor scrolls well. The four-group split (§5) also
 * puts sponges, fillings and frostings on one screen, which is the set an owner
 * actually reprices together after a supplier's increase.
 *
 * The search did not get worse, because it stopped being the browser's. There
 * is a real one on each group page and a global one in the header that reaches
 * every category at once — better than find-in-page ever was: it matches the
 * description as well as the name, and every result links to that option's
 * editor.
 *
 * So this is now the map. Four cards, each saying how much is in it and how
 * much of it is on today.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catalogue — Admin",
  robots: { index: false, follow: false },
};

/** Which icon fronts each group card. */
const GROUP_ICON: Record<string, string> = {
  cakes: "cake",
  ingredients: "ingredients",
  addons: "addons",
  pricing: "pricing",
};

export default async function CatalogAdmin() {
  const head = (
    <PageHeader
      title="Catalogue"
      blurb="Everything the shop sells, and what the bakery has decided about it — the price, whether it is on today, how it is described and what it looks like."
    />
  );

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        {head}
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  /*
   * Counted per category rather than per group, so a group card can total its
   * own categories and each category can still show its own number. Ten cheap
   * counts in parallel; the alternative is one groupBy that then has to be
   * reshaped in three places.
   */
  const entries = await Promise.all(
    (Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map(
      async (key) => [key, await countCategory(key)] as const,
    ),
  );
  const counts = Object.fromEntries(entries) as Record<
    keyof typeof CATEGORY_META,
    { total: number; available: number; withPhoto: number }
  >;

  const [changes, withdrawn] = await Promise.all([
    db.catalogPriceChange.count(),
    db.catalogOption.count({ where: { isAvailable: false } }),
  ]);

  /* Only the categories a photograph suits are counted in the coverage figure.
     Including coverage, size and placement would make "13 of 96" the permanent
     answer and read as work outstanding — see CATEGORY_META's `photo`. */
  const photographable = Object.values(CATEGORY_META).filter((m) => m.photo);
  const photoTotal = photographable.reduce((n, m) => n + counts[m.category].total, 0);
  const photoDone = photographable.reduce((n, m) => n + counts[m.category].withPhoto, 0);
  const allOptions = Object.values(counts).reduce((n, c) => n + c.total, 0);

  return (
    <div className="flex flex-col gap-5">
      {head}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Options in the catalogue" value={String(allOptions)} icon="cake" />
        <StatCard
          label="Withdrawn today"
          value={String(withdrawn)}
          tone={withdrawn > 0 ? "warn" : "good"}
          note={withdrawn === 0 ? "Everything is on offer" : "Not choosable by new customers"}
        />
        <StatCard
          label="Photographed"
          value={`${photoDone} of ${photoTotal}`}
          tone={photoDone === 0 ? "plain" : photoDone === photoTotal ? "good" : "accent"}
          note="Across the categories a photo suits"
          icon="image"
        />
        <StatCard
          label="Price changes recorded"
          value={String(changes)}
          note={
            changes === 0
              ? "Nothing has been repriced yet"
              : "Since the portal started keeping track"
          }
          icon="pricing"
        />
      </div>

      {!hasImageStore() && <Notice tone="warn">{NO_IMAGE_STORE_MESSAGE}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        {CATALOG_GROUPS.map((g) => {
          const cats = g.categories.map((c) => ({ meta: CATEGORY_META[c], n: counts[c] }));
          const total = cats.reduce((n, c) => n + c.n.total, 0);

          return (
            <Card key={g.slug} flush className="flex flex-col">
              <CardHead title={g.title} note={g.blurb}>
                <Icon name={GROUP_ICON[g.slug] ?? "cake"} size={19} className="text-a-ghost" />
              </CardHead>

              <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
                {cats.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {cats.map((c) => (
                      <li
                        key={c.meta.category}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
                      >
                        <span className="text-a-small font-medium text-a-ink">{c.meta.plural}</span>
                        <span className="text-a-meta text-a-muted">
                          <span className="font-a-mono tabular-nums">{c.n.total}</span> options
                          {c.n.available < c.n.total && (
                            <span className="font-medium text-a-warn-ink">
                              {" · "}
                              {c.n.total - c.n.available} withdrawn
                            </span>
                          )}
                          {c.meta.photo && (
                            <>
                              {" · "}
                              <span className="font-a-mono tabular-nums">{c.n.withPhoto}</span>
                              {" with photos"}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  /* Pricing has no categories — it is a settings row rather than
                     a list of options, which is what this says instead of
                     rendering an empty list. */
                  <p className="text-a-small leading-relaxed text-a-muted">
                    Five charges and a tax rate, rather than a list of options.
                    Nobody picks &ldquo;18% GST&rdquo; off a shelf.
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  <Link href={`/admin/catalog/${g.slug}`} className={aBtn("primary", "md")}>
                    {cats.length > 0 ? `Manage ${g.title.toLowerCase()}` : "Open pricing"}
                    <Icon name="arrowRight" size={15} />
                  </Link>
                  {cats.length > 0 && (
                    <span className="text-a-meta text-a-muted">{total} in total</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Delivery is a catalogue category and is not on this page, which is
          worth saying rather than leaving somebody to hunt for it. */}
      <Card>
        <h2 className={aEyebrow}>Also part of the catalogue</h2>
        <p className="mt-2 max-w-2xl text-a-small leading-relaxed text-a-muted">
          Delivery slots are options like any other — each has a price, a
          description and an availability switch — but each also promises a lead
          time and a window, and those only make sense next to the pincode zones
          that add rider time to them. So they live on their own page.
        </p>
        <Link href="/admin/delivery" className={aBtn("secondary", "md", "mt-3")}>
          <Icon name="delivery" size={16} />
          Delivery slots and zones
        </Link>
      </Card>

      <Notice tone="accent" icon="info">
        The named cakes on the shop&rsquo;s catalogue page are built from these
        options rather than stored separately, so their prices come from here:
        repricing a sponge changes what every cake using it costs. Adding a
        genuinely new option needs a recipe, an allergen entry and — for a
        topping — a 3D model, so that stays a development job rather than a form.
      </Notice>
    </div>
  );
}
