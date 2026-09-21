import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { listCakes } from "@/lib/cakeData";
import {
  CAKE_CATEGORIES, categoryBySlug, EGGLESS_CATEGORY, EGGLESS_SLUG, fromPricePaise,
  hasEggless, type CakeProductView,
} from "@/lib/cakes";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { sBtn, sChip, sEyebrow } from "@/lib/shopUi";

export const metadata: Metadata = {
  title: "Shop cakes · Makemycake",
  description:
    "Every cake we bake, in the size you want and with or without egg, baked to order in Jubilee Hills. Filter by flavour, sort by price, and order without paying up front.",
};

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A-Z" },
] as const;

type Sort = (typeof SORTS)[number]["value"];

/**
 * The collection.
 *
 * ## Where the cakes come from
 *
 * `listCakes()` — CakeProduct rows, cached under a tag that every write in
 * /admin/cakes invalidates. There is no hardcoded list on this page and no
 * second copy anywhere: an owner changing a price, a photograph or a name sees
 * it here on the next request, without a deploy and without a developer.
 *
 * ## Why the filters live in the URL and not in component state
 *
 * `/shop?category=chocolate&sort=price-asc` is a place: bookmarkable,
 * shareable, reachable with the back button, crawlable, and rendered on the
 * server. A filter held in `useState` is none of those — and it would also mean
 * shipping the whole catalogue to the browser to filter it there.
 *
 * The consequence is that every control on this page is a link or a `GET` form,
 * so the entire collection works with JavaScript off. Nothing here is a client
 * component except the add-to-cart button inside each card.
 *
 * ## Sorting
 *
 * A cake has several prices now, so "cheapest first" sorts on the cheapest
 * variant on sale — the same figure the card prints, because sorting by a
 * number nobody is shown is a control that appears broken. It runs against the
 * rows this request loaded rather than a stored sort key, so it is right the
 * moment an admin saves. "Featured" is the bakery's own order: flagged cakes
 * first, then `sortOrder`, which is the sequence `listCakes` already returns.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; sort?: string }>;
}) {
  const { category, q, sort } = await searchParams;
  const [catalog, all] = await Promise.all([getCatalogSnapshot(), listCakes()]);

  const active = category ? categoryBySlug(category) : undefined;
  /* The eggless chip is not one of the five families — see lib/cakes. It asks
     whether the cake has an eggless *variant* on sale, which is why it is
     matched separately rather than shoehorned into the category list. */
  const egglessOnly = category === EGGLESS_SLUG;
  const query = q?.trim() ?? "";

  let shown: CakeProductView[] = all;
  if (query) {
    const needle = query.toLowerCase();
    /* Name and description only, and deliberately not the recipe: somebody
       typing "chocolate" means the word on the card, and matching a frosting
       value would return White Forest for it. Categories are the tool for
       flavour; this is the tool for a name half-remembered. */
    shown = shown.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle),
    );
  }
  if (active) shown = shown.filter((p) => p.category === active.id);
  if (egglessOnly) shown = shown.filter(hasEggless);

  const order: Sort = SORTS.some((s) => s.value === sort) ? (sort as Sort) : "featured";
  /*
   * Cheapest-first means cheapest *variant* first, which is the number the card
   * prints and therefore the only one a shopper can be sorting by. A cake with
   * nothing on sale has no price; it sorts last in both directions rather than
   * at zero, which would put an unbuyable cake at the head of "low to high".
   */
  if (order === "price-asc" || order === "price-desc") {
    const dir = order === "price-asc" ? 1 : -1;
    shown = [...shown].sort((a, b) => {
      const pa = fromPricePaise(a);
      const pb = fromPricePaise(b);
      if (pa === null || pb === null) return (pa === null ? 1 : 0) - (pb === null ? 1 : 0);
      return (pa - pb) * dir;
    });
  }
  if (order === "name") shown = [...shown].sort((a, b) => a.name.localeCompare(b.name));
  if (order === "featured") {
    shown = [...shown].sort(
      (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder,
    );
  }

  const heading = egglessOnly ? EGGLESS_CATEGORY : active;

  /* Every link on this page has to carry the filters it is not changing, or
     sorting would silently drop the category somebody just chose. */
  const href = (patch: { category?: string | null; sort?: string }) => {
    const next = new URLSearchParams();
    const cat = patch.category === undefined ? (category ?? undefined) : patch.category;
    if (cat) next.set("category", cat);
    if (query) next.set("q", query);
    const s = patch.sort ?? (order === "featured" ? "" : order);
    if (s) next.set("sort", s);
    const qs = next.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };

  const chips = [...CAKE_CATEGORIES, EGGLESS_CATEGORY];

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader current={category ?? "shop"} />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {/* A trail, so "chocolate cakes" is a page somebody can climb out of. */}
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.1em] text-s-bark uppercase">
              <li>
                <Link href="/" className="transition-colors hover:text-s-cocoa">Home</Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                {heading ? (
                  <Link href="/shop" className="transition-colors hover:text-s-cocoa">Shop</Link>
                ) : (
                  <span className="text-s-cocoa">Shop</span>
                )}
              </li>
              {heading && (
                <>
                  <li aria-hidden>/</li>
                  <li className="text-s-cocoa">{heading.name}</li>
                </>
              )}
            </ol>
          </nav>

          <div className="flex flex-col gap-3 border-b border-s-line pb-8">
            <span className={sEyebrow}>
              {shown.length} {shown.length === 1 ? "cake" : "cakes"}
            </span>
            <h1 className="text-[2.25rem] sm:text-[3rem]">
              {query ? `“${query}”` : (heading?.name ?? "Every cake we bake")}
            </h1>
            <p className="max-w-[56ch] text-[1.0625rem] leading-relaxed text-s-bark">
              {heading?.blurb ??
                "Each one is baked to order in Jubilee Hills. Nothing is paid for up front: we call to confirm, then bake."}
            </p>
          </div>

          {/* ── Filters ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
            {/* `overflow-x-auto` on a phone: six chips do not fit on 375px, and
                a wrapped double row of chips above the fold pushes the first
                cake off the screen. The rail scrolls; the page does not. */}
            <nav
              aria-label="Filter by flavour"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0 lg:pb-0"
            >
              <Link href={href({ category: null })} className={sChip(!category)} aria-current={!category ? "page" : undefined}>
                All
              </Link>
              {chips.map((c) => (
                <Link
                  key={c.slug}
                  href={href({ category: c.slug })}
                  aria-current={category === c.slug ? "page" : undefined}
                  className={sChip(category === c.slug)}
                >
                  {c.name}
                </Link>
              ))}
            </nav>

            {/* A `GET` form with a submit button, so it works without
                JavaScript; `onChange`-submits-the-form is the version that does
                not. */}
            <form action="/shop" className="flex shrink-0 items-center gap-2">
              {category && <input type="hidden" name="category" value={category} />}
              {query && <input type="hidden" name="q" value={query} />}
              <label htmlFor="sort" className="font-mono text-[0.6875rem] tracking-[0.1em] text-s-bark uppercase">
                Sort
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={order}
                className="h-11 rounded-s-sm border border-s-line-strong bg-s-shell px-3 text-[0.875rem] text-s-cocoa"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-s-sm border border-s-line-strong px-3 text-[0.8125rem] text-s-bark transition-colors hover:border-s-cocoa hover:text-s-cocoa"
              >
                Apply
              </button>
            </form>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-s border border-dashed border-s-line-strong bg-s-cream-deep/50 px-6 py-14">
              <h2 className="text-[1.75rem]">
                {all.length === 0 ? "Nothing on the shelf yet" : "No cakes found"}
              </h2>
              <p className="max-w-[46ch] text-s-bark">
                {/*
                  Three different sentences for three different facts, and the
                  first one is new: an empty *shop* is now possible, because the
                  catalogue is a table somebody fills rather than a list that
                  shipped with the code. Saying "no cakes match chocolate" over
                  a shop with no cakes in it at all would send a shopper hunting
                  through filters for something that was never there.
                */}
                {all.length === 0
                  ? "We are not taking cake orders online just yet. Give the counter a ring and we will sort you out."
                  : query
                    ? `Nothing on the shelf is called “${query}”. Try a flavour instead: chocolate, biscoff, red velvet.`
                    : `We are not baking anything in ${heading?.name ?? "that flavour"} today.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {(query || category) && all.length > 0 && (
                  <Link href="/shop" className={sBtn("primary", "md")}>
                    Clear filters
                  </Link>
                )}
                <Link href="/" className={sBtn("outline", "md")}>
                  Back to home
                </Link>
              </div>
            </div>
          ) : (
            <ul
              className={
                /* `s-rise-row` gives each card its own view() timeline, so a row
                   lifts together and the row below it lifts when it is reached.
                   The first row is already on screen at load and its range is
                   satisfied immediately, so nothing above the fold waits. */
                "s-rise-row grid grid-cols-2 gap-3 pb-16 sm:gap-5 " +
                "lg:grid-cols-3 xl:grid-cols-4"
              }
            >
              {shown.map((p, i) => (
                <ProductCard
                  key={p.slug}
                  product={p}
                  catalog={catalog}
                  as="h2"
                  /* The first row is the LCP on every viewport this grid has. */
                  priority={i < 4}
                />
              ))}
            </ul>
          )}
        </div>
      </main>

      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
