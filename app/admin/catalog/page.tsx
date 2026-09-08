import type { CatalogCategory } from "@prisma/client";
import { DEFAULT_GST_BASIS_POINTS, DEFAULT_SETTINGS } from "@/lib/catalogDefaults";
import { CATEGORIES } from "@/lib/catalogSnapshot";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { eyebrow } from "@/lib/ui";
import { ChargesForm } from "./ChargesForm";
import { OptionRow, type Row } from "./OptionRow";

/**
 * The catalogue, as one page.
 *
 * Every option at once, grouped and jump-linked, rather than a tab per
 * category. A bakery owner opens this to find "the ganache" — one page means
 * one search box, the browser's own, and no wondering which of ten tabs a
 * filling lives under. It is a long document, which is the correct shape for a
 * document.
 *
 * force-dynamic for the same reason /kitchen is: this is a staff screen behind
 * a password, and a cached copy would show somebody yesterday's prices while
 * they are trying to change today's.
 */

export const dynamic = "force-dynamic";

/** What the number in each row means, which is not the same for every category. */
const PRICE_LABEL: Record<CatalogCategory, string> = {
  shape: "No charge — shape does not change the price",
  size: "Base price of the cake",
  sponge: "Added to the base, scaled by size",
  filling: "Added to the base, scaled by size",
  frosting: "Added to the base, scaled by size",
  coverage: "No charge — coverage does not change the price",
  finish: "Labour, scaled by size",
  topping: "Per topping, scaled by size and density",
  placement: "No charge — placement does not change the price",
  delivery: "Flat fee, not scaled by size",
};

const HEADING: Record<CatalogCategory, string> = {
  shape: "Shapes",
  size: "Sizes",
  sponge: "Sponges",
  filling: "Fillings",
  frosting: "Frostings",
  coverage: "Coverage",
  finish: "Finishes",
  topping: "Toppings",
  placement: "Topping placement",
  delivery: "Delivery",
};

export default async function CatalogAdmin() {
  if (!hasDatabase()) {
    return (
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const [options, settings] = await Promise.all([
    db.catalogOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    db.pricingSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const byCategory = new Map<CatalogCategory, Row[]>();
  for (const c of CATEGORIES) byCategory.set(c, []);
  for (const o of options) {
    byCategory.get(o.category)?.push({
      id: o.id,
      category: o.category,
      value: o.value,
      name: o.name,
      blurb: o.blurb,
      priceInputPaise: o.priceInputPaise,
      isAvailable: o.isAvailable,
    });
  }

  const withdrawn = options.filter((o) => !o.isAvailable).length;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <span className={eyebrow}>The catalogue</span>
        <h1 className="text-heading">Prices and availability</h1>
        <p className="max-w-prose text-body leading-relaxed text-steel">
          Every option a customer can choose, what it costs, and whether it is
          being offered today. A saved price is live on the next quote — there is
          no deploy and nothing to publish. Orders already placed keep the price
          they were quoted.
        </p>
        <p className="font-mono text-micro text-ink-35">
          {options.length} options · {withdrawn} withdrawn
        </p>
      </header>

      <nav aria-label="Jump to a category" className="flex flex-wrap gap-x-4 gap-y-1">
        {CATEGORIES.map((c) => (
          <a
            key={c}
            href={`#${c}`}
            className="font-mono text-micro uppercase tracking-[0.1em] text-graphite hover:text-ink"
          >
            {HEADING[c]}
          </a>
        ))}
      </nav>

      <section className="flex flex-col gap-3">
        <h2 className="text-item">Charges that are not options</h2>
        <ChargesForm
          charges={settings ?? { ...DEFAULT_SETTINGS, gstBasisPoints: DEFAULT_GST_BASIS_POINTS }}
        />
      </section>

      {CATEGORIES.map((c) => {
        const rows = byCategory.get(c) ?? [];
        if (rows.length === 0) return null;

        return (
          <section key={c} id={c} className="flex scroll-mt-6 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="text-item">{HEADING[c]}</h2>
              <p className="font-mono text-micro text-steel">{PRICE_LABEL[c]}</p>
            </div>

            <ul className="border border-rule bg-paper">
              {rows.map((row) => (
                <OptionRow key={row.id} row={row} priceLabel={PRICE_LABEL[c]} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="max-w-prose border-t border-rule pt-4 font-sans text-meta leading-relaxed text-steel">
        Adding a new flavour or shape is not something this page can do. An
        option needs a 3D model, an allergen entry and its own rules before it
        can be sold, so it arrives with a release — this page decides what the
        options already built are worth, and whether they are on today.
      </p>
    </div>
  );
}
