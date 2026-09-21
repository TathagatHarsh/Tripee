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
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { sBtn, sEyebrow } from "@/lib/shopUi";

export const metadata: Metadata = {
  title: "MakeMyCake · A little more celebration",
  description:
    "Beautiful cakes, baked to order in Hyderabad. Find your flavour, choose your size, and make their day.",
};

export default async function Home() {
  const [catalog, cakes] = await Promise.all([
    getCatalogSnapshot(),
    listCakes(),
  ]);
  const hero =
    cakes.find((c) => c.isFeatured && cheapestVariant(c)) ??
    cakes.find((c) => cheapestVariant(c));
  const variant = hero && cheapestVariant(hero);
  const price =
    hero && variant
      ? priceProduct(
          { name: hero.name, pricePaise: variant.pricePaise },
          { delivery: "pickup" },
          catalog,
        ).total
      : null;
  const featured = [...cakes]
    .sort(
      (a, b) =>
        Number(b.isFeatured) - Number(a.isFeatured) ||
        a.sortOrder - b.sortOrder,
    )
    .slice(0, 8);
  const categories = CAKE_CATEGORIES.filter((category) =>
    cakes.some((c) => c.category === category.id),
  );
  return (
    <div className="s-root min-h-dvh bg-s-cream">
      <ShopHeader current="home" />
      <main id="main">
        <section className="brand-hero">
          <div className="brand-hero-inner">
            <div className="s-enter brand-hero-copy">
              <span className={sEyebrow}>Made in Hyderabad. Made for you.</span>
              <h1>
                A little more{" "}
                <br />
                <em>celebration.</em>
              </h1>
              <p>
                Big milestones. Small victories. Just-because Tuesdays.
                Beautiful cakes for everything worth a slice.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/shop" className={sBtn("primary", "lg")}>
                  Find your cake <span aria-hidden>↗</span>
                </Link>
                <Link
                  href="#the-collection"
                  className="inline-flex min-h-14 items-center px-3 text-sm font-semibold underline underline-offset-8"
                >
                  Explore the collection
                </Link>
              </div>
              <div className="brand-hero-note">
                <span aria-hidden>✳</span>
                <span>
                  Baked to order. A personal touch.
                  <br />
                  <strong>No payment until we confirm.</strong>
                </span>
              </div>
            </div>
            {hero && price !== null ? (
              <div className="brand-hero-art s-enter-media">
                <span className="brand-seal" aria-hidden>
                  Made for
                  <br />
                  <em>your</em>
                  <br />
                  moment
                </span>
                <Link
                  href={`/cakes/${hero.slug}`}
                  className="brand-hero-photo group"
                >
                  <CakePhoto
                    src={hero.imageUrl}
                    alt={hero.imageAlt ?? hero.name}
                    config={hero.config}
                    priority
                    sizes="(min-width:1024px) 48vw, 100vw"
                    className="transition-transform duration-700 motion-safe:group-hover:scale-105"
                  />
                </Link>
                <Link
                  href={`/cakes/${hero.slug}`}
                  className="brand-hero-caption"
                >
                  <span>
                    <small>Meet your next favourite</small>
                    <strong>{hero.name}</strong>
                  </span>
                  <span>
                    From {formatINR(price)} <span aria-hidden>↗</span>
                  </span>
                </Link>
              </div>
            ) : (
              <div className="brand-hero-empty">
                <span aria-hidden>✳</span>
                <p>Something lovely is in the making.</p>
                <Link href="/shop" className={sBtn()}>
                  Visit the cake counter
                </Link>
              </div>
            )}
          </div>
        </section>
        <div className="brand-ribbon" aria-label="Our approach">
          <span>Baked for your occasion</span>
          <span aria-hidden>✳</span>
          <span>Your cake. Your message.</span>
          <span aria-hidden>✳</span>
          <span>Thoughtfully delivered</span>
        </div>
        <section
          id="the-collection"
          className="brand-section"
          aria-labelledby="categories"
        >
          <div className="brand-section-head s-rise-in">
            <div>
              <span className={sEyebrow}>Follow your cravings</span>
              <h2 id="categories">A flavour for every feeling.</h2>
            </div>
            <Link href="/shop" className="brand-text-link">
              All {cakes.length} cakes <span aria-hidden>↗</span>
            </Link>
          </div>
          <ul className="brand-categories s-rise-row">
            {categories.map((category, index) => {
              const face = cakes.find((c) => c.category === category.id)!;
              return (
                <li key={category.slug}>
                  <Link
                    href={`/shop?category=${category.slug}`}
                    className="brand-category group"
                  >
                    <div className="brand-category-photo">
                      <CakePhoto
                        src={face.imageUrl}
                        alt=""
                        config={face.config}
                        sizes="(min-width:1024px) 16vw, 44vw"
                        className="transition-transform duration-500 motion-safe:group-hover:scale-105"
                      />
                    </div>
                    <span>
                      <small>0{index + 1}</small>
                      {category.name}
                      <span aria-hidden>↗</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {categories.length === 0 && (
            <p className="py-8 text-s-bark">
              Our next collection is being prepared. Please check back soon.
            </p>
          )}
        </section>
        <section
          className="border-y border-s-line bg-s-cream-deep/50"
          aria-labelledby="featured"
        >
          <div className="brand-section">
            <div className="brand-section-head s-rise-in">
              <div>
                <span className={sEyebrow}>The cake counter</span>
                <h2 id="featured">Love at first slice.</h2>
              </div>
              <Link href="/shop" className={sBtn("outline")}>
                Shop the collection ↗
              </Link>
            </div>
            <ul className="s-rise-row grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {featured.map((p) => (
                <ProductCard key={p.slug} product={p} catalog={catalog} />
              ))}
            </ul>
          </div>
        </section>
        <section className="brand-story" aria-labelledby="our-way">
          <div className="brand-section brand-story-grid">
            <div className="s-rise-in">
              <span className="brand-story-kicker">The MakeMyCake way</span>
              <h2 id="our-way">
                Good cake.
                <br />
                Great memories.
              </h2>
              <p>
                It starts with a cake you love. We make it personal, confirm the
                details with you, and bake for the moment you have in mind.
              </p>
              <Link href="/shop" className={sBtn("outline", "lg")}>
                Make someone’s day ↗
              </Link>
            </div>
            <ol className="brand-promises s-rise-row">
              {[
                [
                  "Pick your favourite",
                  "Browse the collection and find a flavour that feels like them.",
                ],
                [
                  "Make it personal",
                  "Choose the size, the sponge and a message from the heart.",
                ],
                [
                  "Leave the baking to us",
                  "Tell us where and when. We call to confirm before anything goes in the oven.",
                ],
              ].map(([title, copy], i) => (
                <li key={title}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="brand-section">
          <BuilderComingSoon />
        </section>
      </main>
      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
