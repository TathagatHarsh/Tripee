import { allergensForVariant } from "@/lib/productionSpec";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { allergenLineForOffer } from "@/lib/allergens";
import { cakeBySlug, listCakes } from "@/lib/cakeData";
import { cheapestVariant, eggTypesOffered, hasBothEggTypes, sellable } from "@/lib/cakes";
import { FILLINGS, FINISHES, FROSTINGS, SPONGES } from "@/lib/catalog";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { CakeGallery } from "./CakeGallery";
import { categoryById } from "@/lib/cakes";
import { BuyPanel } from "./BuyPanel";

/**
 * One cake.
 *
 * The photograph and the purchase decision are the page: a single large shot on
 * the left, and on the right the price, the choices a shopper actually makes,
 * and the button. Everything else — what is in it, who it feeds, what it
 * contains — sits below the fold where somebody goes to check rather than to
 * decide.
 *
 * This is deliberately NOT the builder's review screen wearing new clothes. It
 * does not show the nine-step docket, the itemised price breakdown or the 3D
 * render, because a shopper choosing between four chocolate cakes is doing a
 * different job than somebody who just configured one.
 *
 * ## Rendered per request, not at build time
 *
 * There used to be a `generateStaticParams` naming all twenty-one, because the
 * list of cakes was a constant in the source tree. It is a table now, so the
 * build cannot know the pages: an owner adds a cake on a Tuesday afternoon and
 * it has to have a page on Tuesday afternoon. The read is `unstable_cache`d and
 * tagged, so this costs one query the first time and none afterwards until an
 * admin saves — the mechanism lib/cakeData already has.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await cakeBySlug(slug);
  if (!product) return { title: "Cake not found · Makemycake" };

  const catalog = await getCatalogSnapshot();
  /* The cheapest version, which is the figure the card and the shelf show. A
     cake with nothing on sale has no price to put in a title. */
  const cheapest = cheapestVariant(product);
  const price = cheapest
    ? priceProduct(
        { name: product.name, pricePaise: cheapest.pricePaise },
        { delivery: "pickup" },
        catalog,
      )
    : null;

  return {
    title: price
      ? `${product.name} · ${formatINR(price.total)} · Makemycake`
      : `${product.name} · Makemycake`,
    description: `${product.description} Baked to order in Jubilee Hills, Hyderabad.`,
    openGraph: {
      title: `${product.name} · Makemycake`,
      description: product.description,
      ...(product.imageUrl ? { images: [{ url: product.imageUrl }] } : {}),
      type: "website",
    },
  };
}

/** The plain-language name of an option value, from the one list that has it. */
function nameOf<T extends string>(
  options: readonly { value: T; name: string }[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.name ?? value;
}

export default async function CakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [catalog, product] = await Promise.all([getCatalogSnapshot(), cakeBySlug(slug)]);
  /* A withdrawn cake is not found, which is also the answer for one that never
     existed — a 404 rather than a page saying "sold out", because a shop that
     keeps a page for everything it has ever stopped baking accumulates dead
     shelves. Orders and links that already name it still read fine; see
     lib/shop and the frozen columns on Order. */
  if (!product) notFound();

  const category = categoryById(product.category);
  const c = product.config;

  /* Four more from the same family, never this one. */
  const related = (await listCakes())
    .filter((p) => p.slug !== product.slug && p.category === product.category)
    .slice(0, 4);

  /*
   * What is in it, when the cake has a recipe on file.
   *
   * The seeded cakes do; a cake an owner added from /admin/cakes does not, and
   * this section simply does not render for one. Printing "Sponge: Vanilla"
   * from the derived config would be stating as fact something nobody typed —
   * see `configForVariant`, which is explicit that the derived config is
   * structural rather than descriptive.
   */
  const spec: [string, string][] = c
    ? [
        ["Sponge", nameOf(SPONGES, c.sponge)],
        ["Between the layers", c.filling === "none" ? "Frosting only" : nameOf(FILLINGS, c.filling)],
        ["Frosting", nameOf(FROSTINGS, c.frosting)],
        ["Finish", nameOf(FINISHES, c.finish)],
        ["Layers", `${c.layers} layers`],
      ]
    : [];

  /*
   * How the sponge can be baked, as a fact rather than a badge.
   *
   * §6 and §7: the cake is not inherently one or the other, so this states what
   * the bakery has actually configured. It is in the spec section rather than on
   * the photograph, because a corner badge is read as a property of the product
   * and this is a choice the panel on the right is about to offer.
   */
  const eggLine = hasBothEggTypes(product)
    ? "Egg and eggless"
    : sellable(product).some((v) => v.eggType === "eggless")
      ? "Eggless"
      : sellable(product).length > 0
        ? "Contains egg"
        : null;
  if (eggLine) spec.push(["Baked as", eggLine]);
  if (product.productionSpec) spec.push(["Ingredients", product.productionSpec.ingredients.join(", ")]);

  /* The servings line moved into the buy panel, where it can follow the size
     the shopper picks. A page-level "serves 12-15" would be a number for one of
     four sizes, printed as though it applied to the cake. */

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.1em] text-s-bark uppercase">
              <li><Link href="/" className="transition-colors hover:text-s-cocoa">Home</Link></li>
              <li aria-hidden>/</li>
              <li><Link href="/shop" className="transition-colors hover:text-s-cocoa">Shop</Link></li>
              <li aria-hidden>/</li>
              <li>
                <Link
                  href={`/shop?category=${category.slug}`}
                  className="transition-colors hover:text-s-cocoa"
                >
                  {category.name}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-s-cocoa">{product.name}</li>
            </ol>
          </nav>

          <div className="product-detail-grid grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
            {/* ── The photograph ───────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              {/*
                No "Eggless" badge. It said a thing about the cake that is now a
                thing about the variant, and §6 is explicit that a cake must not
                be presented as inherently one or the other — the panel on the
                right asks instead. What the cake can be baked as is stated
                under the gallery, where it is a fact rather than a label.
              */}
              {product.gallery.length > 0 ? (
                <CakeGallery
                  name={product.name}
                  description={product.description}
                  primary={{ url: product.imageUrl, alt: product.imageAlt }}
                  gallery={product.gallery}
                  config={c}
                />
              ) : (
                <div className="s-enter-media s-photo-well relative aspect-square overflow-hidden rounded-s border border-s-line lg:aspect-[4/3.4]">
                  <CakePhoto
                    src={product.imageUrl}
                    alt={product.imageAlt ?? `${product.name}. ${product.description}`}
                    config={c}
                    sizes="(min-width:1024px) 56vw, 100vw"
                    /* The LCP on this page, every time. */
                    priority
                  />
                </div>
              )}

              {/* ── What is in it ──────────────────────────────────────── */}
              {(spec.length > 0 || c) && (
                <section aria-labelledby="spec" className="s-rise-in rounded-s border border-s-line bg-s-shell p-5 sm:p-6">
                  <h2 id="spec" className="mb-4 text-[1.375rem]">What&rsquo;s in it</h2>
                  <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {spec.map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5 border-b border-s-line pb-3">
                        <dt className="font-mono text-[0.6875rem] tracking-[0.12em] text-s-bark uppercase">
                          {k}
                        </dt>
                        <dd className="text-[0.9375rem] text-s-cocoa">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {/* Derived from the config by lib/allergens, not typed here — an
                      allergen list that can go stale is worse than none. */}
                  {/* Against the versions on sale, not against the stored
                      recipe — see `allergenLineForOffer`. A cake sold both ways
                      must not print "EGGLESS" above a picker offering egg. */}
                  {product.productionSpec ? (
                    <p className="mt-4 text-sm leading-relaxed text-s-bark">Allergens: {[...new Set(sellable(product).flatMap(v=>allergensForVariant(product.productionSpec!,v.eggType)))].join(", ") || "None declared"}. Prepared in a kitchen that handles allergens; contact the bakery before ordering for a food allergy.</p>
                  ) : c && (
                    <p className="mt-4 text-[0.875rem] leading-relaxed text-s-bark">
                      {allergenLineForOffer(c, eggTypesOffered(product))}
                    </p>
                  )}
                </section>
              )}
            </div>

            {/* ── The decision ─────────────────────────────────────────── */}
            <div className="lg:sticky lg:top-[84px] lg:self-start">
              <h1 className="mb-4 text-[2.5rem] leading-[1.08] sm:text-[3.25rem]">{product.name}</h1>
              <p className="mb-6 text-[1.0625rem] leading-relaxed text-s-bark">
                {product.description}
              </p>

              {/* The size, the sponge and the price all live in here now,
                  because all three are the variant. §13. */}
              <BuyPanel product={product} catalog={catalog} />
            </div>
          </div>

          {related.length > 0 && (
            <section aria-labelledby="related" className="s-rise-in mt-16 border-t border-s-line pt-12 sm:mt-20">
              <h2 id="related" className="mb-6 text-[1.75rem] sm:text-[2rem]">
                You might also like
              </h2>
              <ul className="s-rise-row grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {related.map((p) => (
                  <ProductCard key={p.slug} product={p} catalog={catalog} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>

      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
