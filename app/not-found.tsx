import Link from "next/link";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { listCakes } from "@/lib/cakeData";
import { getBakeryInfo, tryCatalogSnapshot } from "@/lib/catalogData";
import { sBtn, sEyebrow } from "@/lib/shopUi";

/**
 * The page that isn't there.
 *
 * ## Why a 404 gets the whole shop around it
 *
 * Because this is the one page a visitor arrives at having already failed at
 * something, and the worst possible answer is a dead end that offers one link
 * back. With the header on it, every route out of here — the categories, the
 * search, the cart, the account — is where it is on every other page, which
 * means somebody who mistyped a URL or followed a stale link is one click from
 * what they were actually after rather than three.
 *
 * The four cakes underneath are the same reasoning taken one step: "the cakes
 * are all still where they were" is a claim, and showing four of them is
 * cheaper than asking somebody to take it on trust. They are `<ProductCard>`s
 * off the real catalogue with real prices, not a decorative strip — the
 * add-to-cart on them works.
 *
 * ## What it costs
 *
 * One catalogue read, which is `unstable_cache`d and shared with every other
 * page on the site. A 404 that cannot render because the catalogue is
 * unreachable would be a 500 wearing a 404's clothes, so the read is allowed to
 * fail here — but the strip goes with it rather than falling back to the
 * shipped prices, because a card with an add-to-cart on it is a price this shop
 * is offering to honour. The words and every route out stay put either way; see
 * lib/catalogData's `CatalogUnavailable`.
 *
 * ## What it answers for
 *
 * Unmatched URLs, and `notFound()` from any segment without a closer boundary —
 * which today means `/cakes/[slug]` with a slug the shop does not sell.
 * `/orders/[ref]` has its own, because "we can't find that order on this
 * account" is a different sentence with a different fix, and a stranger must
 * not be able to tell a reference that does not exist from one that is somebody
 * else's.
 */
export default async function NotFound() {
  const [bakery, catalog, cakes] = await Promise.all([
    getBakeryInfo(),
    tryCatalogSnapshot(),
    listCakes(),
  ]);
  /* Featured first, so the four a visitor lands on are the four the bakery
     would have picked. Empty when there is no catalogue to price them from, or
     no cake on the shelf at all — both of which drop the strip rather than
     showing a card that cannot quote. */
  const suggestions = catalog
    ? [...cakes]
        .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder)
        .slice(0, 4)
    : [];

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
          <div className="flex max-w-[46rem] flex-col items-start gap-5">
            <span className={sEyebrow}>404</span>
            <h1 className="text-[2.5rem] leading-[1.05] sm:text-[3.25rem]">
              Nothing on this shelf
            </h1>
            <p className="max-w-[52ch] text-[1.125rem] leading-relaxed text-s-bark">
              The page you were after isn&rsquo;t here. It may have moved, or the
              link may have been mistyped. The cakes are all still where they were.
            </p>
            <div className="flex flex-wrap gap-3">
              {/*
                /shop, and not /build/shape. The 3D builder is held back for this
                phase (see lib/flags) and every one of its URLs answers with a
                Coming Soon page, so sending somebody there from a 404 would be
                swapping one dead end for another.
              */}
              <Link href="/shop" className={sBtn("primary", "lg")}>
                Shop cakes
              </Link>
              <Link href="/" className={sBtn("outline", "lg")}>
                Back to the shop front
              </Link>
            </div>
          </div>

          {catalog && suggestions.length > 0 && (
            <section aria-labelledby="suggestions" className="mt-16 border-t border-s-line pt-12">
              <h2 id="suggestions" className="mb-6 text-[1.75rem] sm:text-[2rem]">
                Start with one of these
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {suggestions.map((p) => (
                  <ProductCard key={p.slug} product={p} catalog={catalog} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>

      <ShopFooter bakery={bakery} />
    </div>
  );
}
