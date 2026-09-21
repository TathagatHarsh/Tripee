import type { Metadata } from "next";
import Link from "next/link";
import { BuilderComingSoon } from "@/components/shop/BuilderComingSoon";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { listCakes } from "@/lib/cakeData";
import { CAKE_CATEGORIES, cheapestVariant } from "@/lib/cakes";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { resolveSlot } from "@/lib/delivery";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { sBtn, sEyebrow } from "@/lib/shopUi";

export const metadata: Metadata = {
  title: "Makemycake · cakes baked to order in Hyderabad",
  description:
    "Twenty-one eggless cakes, baked to order in Jubilee Hills and delivered across Hyderabad. Itemised pricing, no payment until we confirm.",
  openGraph: {
    title: "Makemycake",
    description: "Cakes baked to order in Jubilee Hills, Hyderabad.",
    type: "website",
    images: [{ url: "/presets/berry-forest.webp" }],
  },
};

/**
 * The cake on the front page.
 *
 * A preference, not a requirement: if this slug has been renamed, withdrawn or
 * deleted, the hero falls back to whatever the bakery has flagged as featured
 * and then to the first cake on the shelf. A homepage that 500s because
 * somebody retired a cake is a homepage held hostage by a string in the source.
 */
const HERO_SLUG = "berry-forest";

/**
 * The shop front.
 *
 * Phase 1 of the redesign: this used to lead with the 3D builder — "Custom cake,
 * designed by you", and a live WebGL cake in the hero — because the builder was
 * the product. It is a cake shop now. The builder is held back behind
 * `lib/flags` and appears on this page as the upcoming feature it is, well below
 * the cakes somebody can actually buy today.
 *
 * The consequence worth noting is what this page no longer loads: there is no
 * `<Canvas>`, no `@react-three/fiber` and no Three.js on the homepage at all.
 * Every cake here is one of the photographs `scripts/shoot-presets` already
 * makes from the same configurations, so the page is images and HTML.
 *
 * ## Why every number on it is fetched rather than typed
 *
 * The cakes come from CakeProduct, the prices from `priceProduct` against them,
 * and the lead time from `resolveSlot` — the same resolver the kitchen and the
 * docket use. The previous landing page made the same call and gave the reason:
 * typing "24 h" into a marketing page is how a shop front ends up promising
 * something the delivery module disagrees with. The same now goes for the count
 * of cakes and for which of them lead: both are read, not written.
 *
 * ## No reviews section
 *
 * There is no review data anywhere in this application. A testimonial strip
 * would have to be written rather than collected, and a shop that invents its
 * own praise has told its first lie above the fold.
 */
export default async function Home() {
  const [catalog, cakes] = await Promise.all([getCatalogSnapshot(), listCakes()]);

  const hero =
    cakes.find((c) => c.slug === HERO_SLUG) ?? cakes.find((c) => c.isFeatured) ?? cakes[0];
  /* Priced without a delivery slot, so "from ₹x" is the cake and its tax and
     nothing conditional — the same figure the cards show. */
  /* "from ₹X" — the cheapest variant, which is what the card and the shelf both
     show. A cake whose every size is withdrawn has no price and no hero slot. */
  const heroCheapest = hero ? cheapestVariant(hero) : undefined;
  const heroPrice =
    hero && heroCheapest
      ? priceProduct(
          { name: hero.name, pricePaise: heroCheapest.pricePaise },
          { delivery: "pickup" },
          catalog,
        )
      : null;
  /* One representative pincode per zone, asked of the delivery module. */
  const lead = resolveSlot("standard", "500001", catalog).effectiveLeadHours;
  /* The bakery's own eight: flagged first, then its own display order. */
  const featured = [...cakes]
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder)
    .slice(0, 8);

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader current="home" />

      <main id="main" className="flex-1">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="border-b border-s-line bg-gradient-to-b from-s-cream to-s-cream-deep">
          {/*
            `minmax(0, …)` on both tracks, which is doing real work rather than
            being defensive noise: an `fr` track takes `auto` as its minimum, and
            `auto` there means "at least max-content". The metadata row below the
            copy is wider than a phone, so without the floor the track sized
            itself to that and every child laid out against a box wider than the
            viewport — a clipped headline and a horizontally scrolling page.
          */}
          <div className="mx-auto grid max-w-[84rem] grid-cols-[minmax(0,1fr)] items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-20">
            <div className="s-enter flex flex-col items-start gap-6 lg:order-1">
              <span className={sEyebrow}>
                One bakery · Jubilee Hills · Hyderabad
              </span>

              <h1 className="text-[2.75rem] leading-[1.03] sm:text-[3.5rem] lg:text-[4.25rem]">
                Make every celebration
                <span className="block text-s-berry italic">sweeter.</span>
              </h1>

              {/*
                Nineteen words, and it was thirty-four.

                At 375px the old paragraph ran to five lines and pushed the two
                buttons most of the way down the first screen. A hero's job is
                the claim and the way in, not the whole proposition: what it
                dropped ("choose a size, tell us what it should say") is a
                description of the product page, which is one tap away and does
                it better with controls than with prose.
              */}
              <p className="max-w-[46ch] text-[1.125rem] leading-relaxed text-s-bark">
                {/* The count is read rather than written: it used to say
                    "Twenty-one" because the catalogue was twenty-one constants
                    in the source tree, and an owner adding a cake would have
                    made the sentence wrong with no way to fix it. */}
                Eggless cakes, baked to order in Jubilee Hills. Nothing is paid
                for until we confirm it with you.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/shop" className={sBtn("primary", "lg")}>
                  Shop cakes
                </Link>
                {hero && (
                  <Link href={`/cakes/${hero.slug}`} className={sBtn("outline", "lg")}>
                    Explore cakes
                  </Link>
                )}
              </div>

              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 font-mono text-[0.6875rem] tracking-[0.12em] text-s-bark uppercase">
                <li>Freshly baked to order</li>
                <li aria-hidden className="size-1 rounded-full bg-s-line-strong" />
                <li>{lead}-hour lead time</li>
                <li aria-hidden className="size-1 rounded-full bg-s-line-strong" />
                <li>No payment up front</li>
              </ul>
            </div>

            {/* Only when there is a cake to be the hero. A shop with an empty
                CakeProduct table renders the claim and the two links and leaves
                this column out, rather than a broken image over a ₹NaN. */}
            {hero && heroPrice && (
              <div className="relative lg:order-2">
                <Link
                  href={`/cakes/${hero.slug}`}
                  className="s-enter-media s-photo-well group relative block aspect-[4/3.6] overflow-hidden rounded-s border border-s-line shadow-[var(--shadow-s-lift)] sm:aspect-[4/3]"
                >
                  <CakePhoto
                    src={hero.imageUrl}
                    alt={hero.imageAlt ?? `${hero.name}. ${hero.description}`}
                    config={hero.config}
                    sizes="(min-width:1024px) 46vw, 100vw"
                    /* The LCP of the whole site. Never lazy, and it is the one
                       image on this page that says so. */
                    priority
                    className="object-[50%_58%] transition-transform duration-[600ms] ease-[var(--ease-out)] motion-safe:group-hover:scale-[1.03]"
                  />
                </Link>

                {/* The price tag. Absolute on a wide screen where there is room
                    beside the photo, and in flow below it on a phone — a floating
                    card over a 340px image covers the cake it is advertising. */}
                <div className="mt-4 flex items-center gap-4 rounded-s border border-s-line bg-s-shell px-4 py-3 shadow-[var(--shadow-s-card)] sm:absolute sm:right-4 sm:bottom-4 sm:mt-0 sm:w-auto">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[0.9375rem] font-medium text-s-cocoa">
                      {hero.name}
                    </span>
                    <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-s-bark uppercase">
                      from {formatINR(heroPrice.total)}
                    </span>
                  </div>
                  <Link href={`/cakes/${hero.slug}`} className={sBtn("primary", "sm")}>
                    View
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Shop by flavour ────────────────────────────────────────── */}
        <section aria-labelledby="categories" className="mx-auto max-w-[84rem] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <div className="s-rise-in mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className={sEyebrow}>Shop by flavour</span>
              <h2 id="categories" className="text-[2rem] sm:text-[2.5rem]">
                Find the one they&rsquo;ll ask for again
              </h2>
            </div>
            <Link
              href="/shop"
              className="inline-flex min-h-11 items-center text-[0.9375rem] text-s-berry underline decoration-s-berry/30 underline-offset-4 transition-colors hover:decoration-s-berry"
            >
              See all {cakes.length} cakes
            </Link>
          </div>

          <ul className="s-rise-row grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {CAKE_CATEGORIES.map((cat) => {
              /* The card's picture is the first cake actually in the category,
                 so a category can never illustrate itself with a cake it does
                 not contain — and adding a preset re-picks it automatically. */
              const face = cakes.find((p) => p.category === cat.id);
              return (
                <li key={cat.slug}>
                  <Link
                    href={`/shop?category=${cat.slug}`}
                    className="group relative flex h-40 items-end overflow-hidden rounded-s border border-s-line sm:h-48"
                  >
                    {face && (
                      <CakePhoto
                        src={face.imageUrl}
                        alt=""
                        config={face.config}
                        sizes="(min-width:1024px) 31vw, 47vw"
                        className="object-[50%_54%] transition-transform duration-[500ms] ease-[var(--ease-out)] motion-safe:group-hover:scale-[1.05]"
                      />
                    )}
                    {/*
                      A wash, not a blanket — the cake still has to be the thing
                      you see. It has to go this dark at the foot, though: the
                      six cakes behind these cards run from dark ganache to a
                      near-white pistachio, and a gradient tuned to the chocolate
                      one left white text on cream over Eggless and Fruit & Berry.
                      The stop is set by the palest card, which is the only one
                      that can fail.
                    */}
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-[linear-gradient(180deg,rgba(42,24,15,0)_30%,rgba(42,24,15,0.55)_62%,rgba(42,24,15,0.95)_100%)]"
                    />
                    <span className="relative flex w-full flex-col gap-1 p-4">
                      <span className="text-[1.0625rem] font-medium text-white sm:text-[1.25rem]">
                        {cat.name}
                      </span>
                      {/* Sentence case at 13px, clamped to two lines. Set in
                          uppercase mono at 10px it read as a system label and,
                          on the two longest blurbs, took three lines and pushed
                          the card's own title off the bottom of the tile. */}
                      <span className="line-clamp-2 text-[0.8125rem] leading-snug text-white/80">
                        {cat.blurb}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── The counter ────────────────────────────────────────────── */}
        <section
          aria-labelledby="featured"
          className="border-y border-s-line bg-s-cream-deep/50"
        >
          <div className="mx-auto max-w-[84rem] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
            <div className="s-rise-in mb-8 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className={sEyebrow}>On the counter</span>
                <h2 id="featured" className="text-[2rem] sm:text-[2.5rem]">
                  Baked to order, photographed as sold
                </h2>
              </div>
              <Link href="/shop" className={sBtn("outline", "md")}>
                Browse everything
              </Link>
            </div>

            <ul className="s-rise-row grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {featured.map((p) => (
                <ProductCard key={p.slug} product={p} catalog={catalog} />
              ))}
            </ul>
          </div>
        </section>

        {/* ── The builder, held back ─────────────────────────────────── */}
        <section className="mx-auto max-w-[84rem] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <span className={`${sEyebrow} mb-3 block`}>Create something extraordinary</span>
          <BuilderComingSoon className="s-rise-in" />
        </section>

        {/* ── Why ────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="why"
          className="border-t border-s-line bg-s-shell"
        >
          <div className="mx-auto max-w-[84rem] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
            <h2 id="why" className="s-rise-in mb-10 text-[2rem] sm:text-[2.5rem]">
              Why Makemycake
            </h2>

            {/*
              Four claims, and every one of them is something this codebase can
              actually back: the cakes are baked after the call rather than held
              in a case, the price is itemised by the same engine the kitchen
              docket prints, the lead time is the delivery module's own number,
              and nothing is charged because this deployment takes no payments at
              all. No certifications, awards or guarantees have been invented.
            */}
            <ul className="s-rise-row grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [
                  "Freshly made",
                  "Nothing sits in a case. We call to confirm, and the cake is baked after that call.",
                ],
                [
                  "Itemised pricing",
                  "Sponge, filling, finish, delivery and GST are each a line on your order, priced from the same list the kitchen works from.",
                ],
                [
                  "Reliable delivery",
                  `Standard orders are ready about ${lead} hours after confirmation, across the zones we actually serve.`,
                ],
                [
                  "Made for your celebration",
                  "Choose the size, say what it should say on top, and tell us when you need it.",
                ],
              ].map(([title, body], i) => (
                <li key={title} className="flex flex-col gap-2.5">
                  {/* /80 and not /45. A 45%-alpha berry on white measures about
                      2.4:1 — these are numerals somebody reads, not a rule, so
                      they have to clear 4.5:1. /80 composites to 4.97:1 and
                      keeps the tint. Measured with axe, not by eye. */}
                  <span className="font-mono text-[1.75rem] leading-none text-s-berry/80">
                    0{i + 1}
                  </span>
                  <h3 className="text-[1.25rem]">{title}</h3>
                  <p className="text-[0.9375rem] leading-relaxed text-s-bark">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Closing band ───────────────────────────────────────────── */}
        <section className="bg-s-cocoa">
          <div className="s-rise-in mx-auto flex max-w-[84rem] flex-col items-start gap-5 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-16">
            <div className="flex flex-col gap-2">
              <h2 className="text-[1.875rem] text-s-cream sm:text-[2.25rem]">
                Something to celebrate?
              </h2>
              <p className="max-w-[46ch] text-s-cream/70">
                Pick a cake, tell us the date, and we&rsquo;ll take it from there.
              </p>
            </div>
            <Link href="/shop" className={sBtn("primary", "lg")}>
              Shop cakes
            </Link>
          </div>
        </section>
      </main>

      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
