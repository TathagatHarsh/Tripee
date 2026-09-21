import { BakingStatus } from "@/components/shop/BakingMark";
import { ShopHeader } from "@/components/shop/ShopHeader";

/**
 * The collection, before it arrives.
 *
 * ## Why this file did not exist
 *
 * It should have. /shop is an async server component that reads the whole
 * catalogue, and it is the door the storefront opens onto — from the home page,
 * from every breadcrumb, from the header on every other route. With no boundary
 * here, all of those waited on a catalogue read with the previous page frozen on
 * screen and nothing to say why.
 *
 * ## What this does NOT cover, and why that is not a bug here
 *
 * The filters. `/shop?category=chocolate` is the same route segment as `/shop`,
 * so Next does not re-suspend it — it holds the current page until the new one
 * is ready and this file never renders. That is the router's behaviour and not
 * something a second `loading.tsx` can change; the fix for it is a pending
 * state on the controls themselves (`useLinkStatus`), which would make the
 * chips client components. They are deliberately plain links and a `GET` form
 * today so the shop filters without JavaScript at all — see the note in
 * app/shop/page.tsx — so that trade is a decision rather than an oversight, and
 * it is not made here.
 *
 * ## Why the header is real and the cards are not
 *
 * `ShopHeader` takes no required props and renders the same nav, search and
 * cart on every page, so a grey bar in its place would be a shimmer where a
 * header could have been — and worse, the header would visibly swap itself out
 * when the page landed. The h1 and the count *are* drawn as bars, because both
 * depend on which category was asked for and neither is knowable here.
 *
 * The footer is deliberately absent rather than faked: it needs the bakery
 * record this boundary does not have, it sits below the fold on every viewport
 * this grid has, and a wrong footer is worse than a late one.
 *
 * ## The card height
 *
 * Matched to the real card — square photograph, then the same stack of title,
 * blurb, price row and button — so the rows below the first do not reflow when
 * the photographs land. components/orders/OrderSkeleton makes this argument at
 * more length; the short version is that a skeleton whose card is the wrong
 * height is a layout shift with extra steps.
 */
export default function LoadingShop() {
  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {/* Title block: the eyebrow count, the heading, the blurb. */}
          <div className="flex animate-pulse flex-col gap-3 border-b border-s-line pb-8">
            <Bar className="h-3 w-20" />
            <Bar className="h-10 w-full max-w-[22rem] sm:h-12" />
            <Bar className="h-4 w-full max-w-[52ch]" />
            <Bar className="h-4 w-full max-w-[38ch]" />
          </div>

          {/* Filters: the chip row on the left, sort and search on the right. */}
          <div className="flex animate-pulse flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
            <Bar className="h-11 w-full max-w-[26rem]" />
            <Bar className="h-11 w-full max-w-[18rem]" />
          </div>

          <div aria-busy="true" aria-live="polite" className="relative">
            <BakingStatus label="Getting the cakes…" />
            <ul
              aria-hidden="true"
              className="grid animate-pulse grid-cols-2 gap-3 pb-16 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <li
                  key={i}
                  className="flex flex-col overflow-hidden rounded-s border border-s-line bg-s-shell"
                >
                  {/* The photograph, which is square on every card in the shop. */}
                  <span aria-hidden="true" className="block aspect-square bg-s-cream-deep" />
                  <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
                    <Bar className="h-5 w-3/4" />
                    <Bar className="h-3.5 w-full" />
                    <Bar className="h-3.5 w-2/3" />
                    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                      <Bar className="h-5 w-20" />
                      <Bar className="h-3 w-14" />
                    </div>
                    <Bar className="mt-2 h-11 w-full" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

/** One blank bar, in the storefront's own cream rather than a web grey. */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-s-sm bg-s-cream-deep ${className}`} />;
}
