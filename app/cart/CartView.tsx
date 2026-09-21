"use client";

import { AddToCartSheet } from "@/components/shop/AddToCartSheet";
import { PriceRoll } from "@/components/shop/PriceRoll";
import Link from "next/link";
import { BakingPanel } from "@/components/shop/BakingMark";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { MAX_QTY, useCart, useCartHydrated } from "@/lib/cart";
import { variantById, variantLabel, type CakeProductView } from "@/lib/cakes";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { sBtn, sCard } from "@/lib/shopUi";

/**
 * The basket.
 *
 * ## Why the prices are computed here rather than stored
 *
 * `lib/cart` holds slugs and choices and no money, no names and no
 * photographs — anything cached in localStorage is a value from whenever the
 * cake was added, shown as if it were today's, and an admin can reprice or
 * rename a cake in between. So every line is matched against the rows this
 * page's Server Component fetched, and `/api/orders` reads them a third time on
 * the server before writing. The server remains the only authority.
 *
 * ## Lines whose cake — or whose size — has gone
 *
 * A cake can be withdrawn or deleted while a basket sits in somebody's browser
 * for a fortnight, and so can one size of it: an owner takes the 2 kg off the
 * grid and every basket holding a 2 kg is now holding a row that no longer
 * exists. Both cases render as themselves, with a sentence naming which happened
 * and a Remove button, rather than disappearing silently or taking the page down.
 *
 * Both are excluded from the total and both block checkout, because a basket
 * that quietly drops something somebody chose is worse than one that says what
 * happened — and because §30 asks for exactly this rather than a silent
 * substitution. The server refuses the same basket for the same reason; see
 * `reviewBasket`, which does not trust this page to have checked.
 *
 * Delivery is selected once at checkout and charged once for the shipment, so
 * this page shows the product total and says where the final fee is added.
 *
 * ## The empty state and the hydration gate
 *
 * The cart is read from localStorage after mount, so before that this renders a
 * skeleton rather than the empty state. Showing "your cake box is empty" for
 * one frame to somebody with three cakes in it is worse than showing nothing.
 */
export function CartView({
  catalog,
  cakes,
}: {
  catalog: CatalogSnapshot;
  /** Everything on sale, from the server. A slug missing from it has gone. */
  cakes: CakeProductView[];
}) {
  const hydrated = useCartHydrated();
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);

  if (!hydrated) {
    return (
      /* One panel at the height the two blank cards used to occupy, so what is
         below the fold stays where it was. */
      <BakingPanel label="Getting your cake box…" className={`${sCard} h-[19rem]`} />
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5 rounded-s border border-dashed border-s-line-strong bg-s-shell px-6 py-16 sm:px-10">
        {/* A cake box, drawn in the same three-stroke language as the wordmark
            and the bag glyph in the header, so the empty state looks like part
            of this shop rather than a stock illustration dropped into it. */}
        <span
          aria-hidden
          className="inline-flex size-14 items-center justify-center rounded-full bg-s-berry-wash text-s-berry"
        >
          <svg viewBox="0 0 24 24" className="size-7" fill="none" focusable="false">
            <path d="M3.2 8.6h17.6L19.4 20a1.8 1.8 0 0 1-1.8 1.6H6.4A1.8 1.8 0 0 1 4.6 20L3.2 8.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M8.4 8.6 12 3.2l3.6 5.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.6 12.6c1.6 0 1.6 1.5 3.2 1.5s1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <h2 className="text-[1.75rem]">Your cake box is empty</h2>
        <p className="max-w-[46ch] text-s-bark">
          Explore our cakes and find something worth celebrating.
        </p>
        <Link href="/shop" className={sBtn("primary", "lg")}>
          Shop cakes
        </Link>
      </div>
    );
  }

  const bySlug = new Map(cakes.map((c) => [c.slug, c]));

  const priced = lines.map((line) => {
    const cake = bySlug.get(line.slug);
    /* The variant as it is *now*, looked up by id among this cake's rows. A
       withdrawn or deleted one comes back undefined, which is what the "no
       longer available" branch below renders — and the browser holds no price
       of its own to fall back on, by design. See lib/cart. */
    const variant = cake ? variantById(cake, line.variantId) : undefined;
    const sellableNow = Boolean(cake && variant?.isAvailable);
    return {
      line,
      cake,
      variant,
      sellableNow,
      each:
        cake && variant && sellableNow
          ? priceProduct(
              { name: cake.name, pricePaise: variant.pricePaise },
              line.choices,
              catalog,
            ).total
          : 0,
    };
  });

  const gone = priced.filter((p) => !p.sellableNow).length;
  const total = priced.reduce((n, p) => n + p.each * p.line.qty, 0);
  const cakeCount = priced
    .filter((p) => p.sellableNow)
    .reduce((n, p) => n + p.line.qty, 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <ul className="s-rise-row flex flex-col gap-4">
        {priced.map(({ line, cake, variant, sellableNow, each }) => (
          <li key={line.id} className={`${sCard} flex gap-4 p-4 sm:gap-5 sm:p-5`}>
            <div className="s-photo-well relative size-24 shrink-0 overflow-hidden rounded-s-sm sm:size-32">
              <CakePhoto
                src={cake?.imageUrl ?? null}
                alt=""
                config={cake?.config}
                sizes="128px"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-[1.0625rem] leading-snug sm:text-[1.1875rem]">
                  {cake ? (
                    <Link href={`/cakes/${cake.slug}`} className="hover:text-s-berry">
                      {cake.name}
                    </Link>
                  ) : (
                    /* No link: the page is a 404 now. The slug is printed as
                       itself so somebody can tell which cake this was. */
                    <span className="text-s-bark">{line.slug}</span>
                  )}
                </h2>
                {sellableNow && (
                  /* `key` on the formatted total rather than on the line: the
                     span remounts when the figure changes and the CSS pop
                     replays, which is the feedback for a quantity step. Keying
                     the whole <li> would remount the photograph too. */
                  <span
                    key={each * line.qty}
                    className="s-pop shrink-0 font-mono text-[0.9375rem] font-medium tabular-nums"
                  >
                    {formatINR(each * line.qty)}
                  </span>
                )}
              </div>

              {sellableNow && variant ? (
                /* The variant, named. Two lines of the same cake in different
                   sizes are two rows in this list, and this is what tells them
                   apart — §9 and §10. */
                <p className="text-[0.8125rem] leading-snug text-s-bark">
                  {variantLabel(variant)}
                </p>
              ) : (
                <p role="alert" className="text-[0.8125rem] leading-snug text-s-berry">
                  {cake
                    ? "That size or sponge isn’t available any more. Remove it and pick again."
                    : "We’ve stopped baking this one. Remove it to carry on."}
                </p>
              )}

              {line.choices.message && (
                <p className="text-[0.8125rem] leading-snug text-s-bark">
                  Message: &ldquo;{line.choices.message}&rdquo;
                </p>
              )}

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                {sellableNow && cake ? (
                  <div className="inline-flex items-center rounded-s-sm border border-s-line-strong bg-s-shell">
                    <button
                      type="button"
                      onClick={() => setQty(line.id, line.qty - 1)}
                      aria-label={`One fewer ${cake.name}`}
                      className="inline-flex size-11 items-center justify-center text-s-cocoa hover:bg-s-cream-deep"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-mono tabular-nums" aria-live="polite">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(line.id, line.qty + 1)}
                      disabled={line.qty >= MAX_QTY}
                      aria-label={`One more ${cake.name}`}
                      className="inline-flex size-11 items-center justify-center text-s-cocoa hover:bg-s-cream-deep disabled:text-s-bark/40"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {cake && <AddToCartSheet product={cake} catalog={catalog} editLine={line} />}
                  {sellableNow && (
                    <span className="font-mono text-[0.75rem] text-s-bark tabular-nums">
                      {formatINR(each)} each
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(line.id)}
                    className="inline-flex min-h-11 items-center text-[0.8125rem] text-s-bark underline decoration-s-line-strong underline-offset-4 transition-colors hover:text-s-berry hover:decoration-s-berry"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* ── Summary ────────────────────────────────────────────────────── */}
      <aside aria-label="Order summary" className={`checkout-summary ${sCard} flex flex-col gap-4 p-6 lg:sticky lg:top-[84px]`}>
        <h2 className="text-[1.375rem]">Summary</h2>

        <dl className="flex flex-col gap-2.5 text-[0.9375rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-s-bark">{cakeCount} {cakeCount === 1 ? "cake" : "cakes"}</dt>
            <dd className="font-mono tabular-nums">{formatINR(total)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-s-bark">Delivery</dt>
            <dd className="text-[0.8125rem] text-s-bark">Selected once at checkout</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-s-line pt-3">
            <dt className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
              Total
            </dt>
            <dd className="font-mono text-[1.375rem] font-medium tabular-nums">
              <PriceRoll text={formatINR(total)} />
            </dd>
          </div>
        </dl>

        {gone > 0 ? (
          <p role="alert" className="rounded-s-sm border border-s-berry/40 bg-s-berry-wash px-4 py-3 text-[0.875rem] leading-snug text-s-berry">
            {gone === 1
              ? "One item in your box is no longer available. Remove it to check out."
              : `${gone} items in your box are no longer available. Remove them to check out.`}
          </p>
        ) : (
          <Link href="/checkout" className={sBtn("primary", "lg", "w-full")}>
            Checkout
          </Link>
        )}
        <Link href="/shop" className={sBtn("outline", "md", "w-full")}>
          Keep shopping
        </Link>

        <p className="text-[0.8125rem] leading-relaxed text-s-bark">
          Nothing is charged now. We confirm every order by phone before it goes
          in the oven.
        </p>
      </aside>
    </div>
  );
}
