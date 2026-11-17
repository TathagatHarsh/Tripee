import type { Metadata } from "next";
import Link from "next/link";
import { BuilderComingSoon } from "@/components/shop/BuilderComingSoon";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { CustomCakeTile } from "@/components/shop/CustomCakeTile";
import { CUSTOM_CAKES, HOME_CUSTOM_IDS } from "@/lib/customCakes";
import { ProductCard } from "@/components/shop/ProductCard";
import { QuoteButton } from "@/components/shop/QuoteButton";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { WellnessCard, WellnessNote, WellnessPillars } from "@/components/shop/WellnessPromise";
import { listCakes } from "@/lib/cakeData";
import { CAKE_CATEGORIES, cheapestVariant } from "@/lib/cakes";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { sBtn, sEyebrow } from "@/lib/shopUi";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: "MakeYourCakes · Your idea, baked.",
  description:
    "Choose a cake design you love, or share a photo of the cake you've been dreaming of, and get a customised quote on WhatsApp. Low-sugar, prebiotic and fibre-rich cakes in Hyderabad.",
};

/**
 * The home page, in the order the client set (2026-11-17): the feel-good card,
 * their "Your idea, baked." introduction, then Our cake gallery, Customise your cake, Healthy &
 * functional cakes and Get your quote on WhatsApp. The ready-to-order
 * collection follows those four.
 */
export default async function Home() {
  const [catalog, cakes] = await Promise.all([
    getCatalogSnapshot(),
    listCakes(),
  ]);
  const phone = catalog.bakery.phone;
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
              {/* The feel-good range opens the page: the client's main selling point. */}
              <WellnessCard />
              <span className={sEyebrow}>Made in Hyderabad. Made for you.</span>
              <h1>
                Your idea,
                <br />
                <em>baked.</em>
              </h1>
              <p className="brand-hero-lead">
                Every cake on this page began with someone&rsquo;s idea.
              </p>
              <p>
                Choose a design you love, or simply share a photo of the cake
                you&rsquo;ve been dreaming of. Tell us what you have in mind,
                and we&rsquo;ll create a customised quote for you directly on
                WhatsApp.
              </p>
              <div className="flex flex-wrap gap-3">
                <QuoteButton phone={phone} className={sBtn("primary", "lg")}>
                  Get your quote on WhatsApp <span aria-hidden>↗</span>
                </QuoteButton>
                <Link
                  href="#gallery"
                  className="inline-flex min-h-14 items-center px-3 text-sm font-semibold underline underline-offset-8"
                >
                  Explore our gallery
                </Link>
              </div>
              <WellnessNote href="#healthy" />
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
                  aria-label={`View ${hero.name}`}
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
        <div className="brand-ribbon" aria-label="Your idea. Your cake. Your celebration.">
          <span>Your idea</span>
          <span aria-hidden>✳</span>
          <span>Your cake</span>
          <span aria-hidden>✳</span>
          <span>Your celebration</span>
        </div>

        <section
          id="gallery"
          className="brand-section scroll-mt-20"
          aria-labelledby="gallery-title"
        >
          <div className="brand-section-head s-rise-in">
            <div>
              <span className={sEyebrow}>01 · Our cake gallery</span>
              <h2 id="gallery-title">Choose a design you love.</h2>
              <p className="mt-3 max-w-[36rem] text-s-bark">
                Jungle birthdays, engagement tiers, a cake shaped like their
                job. Tap any one and ask us for a cake like it.
              </p>
            </div>
            <Link href="/custom-cakes" className={sBtn("outline")}>
              See the full gallery ↗
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {HOME_CUSTOM_IDS.map((id) => (
              <CustomCakeTile
                key={id}
                cake={CUSTOM_CAKES.find((c) => c.id === id)!}
                phone={phone}
                sizes="(min-width:1024px) 15vw, (min-width:640px) 30vw, 46vw"
              />
            ))}
          </div>
        </section>

        <section
          id="customise"
          className="brand-story scroll-mt-20"
          aria-labelledby="customise-title"
        >
          <div className="brand-section brand-story-grid">
            <div className="s-rise-in">
              <span className="brand-story-kicker">02 · Customise your cake</span>
              <h2 id="customise-title">
                Made the way
                <br />
                you imagine it.
              </h2>
              <p>
                Bring a design from our gallery or a photo of your own. We
                shape every detail around you, and confirm it all before
                anything goes in the oven.
              </p>
              <QuoteButton phone={phone} className={sBtn("outline", "lg")}>
                Share your idea ↗
              </QuoteButton>
            </div>
            <ol className="brand-promises s-rise-row">
              {[
                [
                  "Share your idea",
                  "Pick a design from our gallery, or send a photo of the cake you’ve been dreaming of.",
                ],
                [
                  "Make it yours",
                  "Tell us the date, the size, the flavour and the message you want on it.",
                ],
                [
                  "Get your quote",
                  "We send a customised quote on WhatsApp and confirm everything with you before we bake.",
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

        <section
          id="healthy"
          className="scroll-mt-20 border-b border-s-line bg-s-cream-deep/50"
          aria-labelledby="healthy-title"
        >
          <div className="brand-section home-healthy">
            <div className="s-rise-in flex flex-col items-start gap-5">
              <span className={sEyebrow}>03 · Healthy &amp; functional cakes</span>
              <h2 id="healthy-title" className="font-display text-[clamp(2rem,3.3vw,3.1rem)] leading-[1.05]">
                Something <em className="text-s-berry">healthier,</em> just as
                celebratory.
              </h2>
              <p className="max-w-[34rem] text-[1.0625rem] leading-relaxed text-s-bark">
                We also offer low-sugar, prebiotic and fibre-rich cakes,
                thoughtfully crafted to suit your preferences. Tell us which
                you&rsquo;d like when you share your idea, and we&rsquo;ll
                include it in your quote.
              </p>
              <QuoteButton phone={phone} className={sBtn("outline", "lg")}>
                Ask for a healthier cake ↗
              </QuoteButton>
            </div>
            <WellnessPillars />
          </div>
        </section>

        <section
          id="quote"
          className="scroll-mt-20 bg-s-cocoa-deep text-s-cream"
          aria-labelledby="quote-title"
        >
          <div className="brand-section home-quote">
            <div className="flex flex-col items-start gap-5">
              <span className="font-mono text-[0.75rem] tracking-[0.18em] text-s-gold uppercase">
                04 · Get your quote on WhatsApp
              </span>
              <h2 id="quote-title" className="font-display text-[clamp(2rem,3.3vw,3.1rem)] leading-tight">
                Have a design in mind?
              </h2>
              <p className="max-w-[40rem] text-s-cream/80">
                Send us a photo, a sketch or a screenshot. Tell us the date and
                how many people it&rsquo;s for, and we&rsquo;ll come back with
                a price on WhatsApp.
              </p>
              <QuoteButton phone={phone} className={sBtn("primary", "lg")}>
                Get your quote on WhatsApp <span aria-hidden>↗</span>
              </QuoteButton>
            </div>
            <p className="home-quote-sign">
              Your idea.
              <br />
              Your cake.
              <br />
              <em>Your celebration.</em>
            </p>
          </div>
        </section>

        <section
          id="the-collection"
          className="brand-section"
          aria-labelledby="categories"
        >
          <div className="brand-section-head s-rise-in">
            <div>
              <span className={sEyebrow}>Ready to order</span>
              <h2 id="categories">Or pick one of ours today.</h2>
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
        <section className="brand-section">
          <BuilderComingSoon />
        </section>
      </main>
      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
