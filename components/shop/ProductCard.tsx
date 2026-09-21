import Link from "next/link";
import { AddToCartSheet } from "@/components/shop/AddToCartSheet";
import { CakePhoto } from "@/components/shop/CakePhoto";
import {
  cheapestVariant, hasBothEggTypes, sizeName, sizesOffered, type CakeProductView,
} from "@/lib/cakes";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { sCard } from "@/lib/shopUi";

/**
 * One cake, on the shelf.
 *
 * Everything on it comes off a CakeProduct row: the name, the sentence, the
 * photograph and the price the bakery set. Nothing is derived from a config and
 * nothing is hardcoded — which is the whole of this phase in one component.
 *
 * The price is `priceProduct` against the catalogue the *page* fetched, passed
 * down rather than looked up per card, because the parent is a Server Component
 * holding the snapshot and a card is rendered a dozen at a time. What it shows
 * is the cheapest variant's price plus GST; delivery is added once the shopper
 * picks a slot. `/api/orders` prices it again on the server before writing — the
 * server stays the authority, exactly as before.
 *
 * ## The "Eggless" badge is gone, and that is the point of §7
 *
 * It sat on the photograph of every cake because `isEggless` was true of every
 * row, and it was a claim about the *cake* — which is wrong now and was
 * misleading before: the same cake can be baked either way, and a badge saying
 * otherwise tells a customer they cannot have what they can. What replaces it is
 * a line of neutral copy under the price, shown only when both sponges are
 * actually configured for that cake. A cake with one option gets nothing, which
 * keeps the card clean rather than filling it with a fact.
 *
 * ## "From", when there is more than one price
 *
 * A cake sold in four sizes has four prices and a card has room for one. The
 * cheapest, with "from" in front where it is genuinely a floor and without it
 * where the cake has exactly one variant — printing "From ₹799" for a cake that
 * costs ₹799 and nothing else is a qualifier doing no work.
 *
 * `as` because heading level is a property of the page and not of the card: on
 * /shop the h1 is the collection's title so these are h2, on the homepage they
 * sit under a section h2 so they are h3. Getting it wrong is an axe failure
 * (heading-order), not a preference.
 */
export function ProductCard({
  product,
  catalog,
  as: Heading = "h3",
  priority = false,
}: {
  product: CakeProductView;
  catalog: CatalogSnapshot;
  as?: "h2" | "h3";
  /** True for the first row above the fold, so the LCP image is not lazy. */
  priority?: boolean;
}) {
  /* Priced without a delivery slot, so the figure on a card is the cake and the
     tax on it and nothing conditional. A card that quoted standard delivery
     would be quoting a choice the shopper has not made yet. */
  const cheapest = cheapestVariant(product);
  const price = cheapest
    ? priceProduct(
        { name: product.name, pricePaise: cheapest.pricePaise },
        { delivery: "pickup" },
        catalog,
      )
    : null;

  const sizes = sizesOffered(product);
  /* "From" only where it is true. See the note above. */
  const manyPrices = new Set(product.variants.filter((v) => v.isAvailable).map((v) => v.pricePaise)).size > 1;
  const href = `/cakes/${product.slug}`;

  return (
    <li
      className={
        `s-card-lift group flex flex-col overflow-hidden ${sCard} ` +
        "transition-[box-shadow,border-color,translate] " +
        /* `duration-[var(--dur-ui)]`, not the `[--dur-ui]` shorthand: Tailwind
           v4 dropped it, and the short form silently compiles to 0s. */
        "duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
        "hover:border-s-line-strong hover:shadow-[var(--shadow-s-lift)] " +
        "motion-safe:hover:-translate-y-1"
      }
    >
      <Link
        href={href}
        /* The whole photograph is a link to the product, and it is deliberately
           NOT wrapping the title as well: two links to one destination in one
           card is two tab stops and two announcements for a screen reader. This
           one is `aria-hidden`/`tabIndex={-1}`, so the title below is the single
           accessible link and this is the mouse's large target. */
        aria-hidden
        tabIndex={-1}
        className="s-photo-well relative block aspect-square overflow-hidden"
      >
        <CakePhoto
          src={product.imageUrl}
          alt={product.imageAlt ?? product.name}
          config={product.config}
          sizes="(min-width:1280px) 23vw, (min-width:1024px) 31vw, (min-width:640px) 45vw, 46vw"
          priority={priority}
          className={
            "transition-transform duration-[500ms] ease-[var(--ease-out)] " +
            "motion-safe:group-hover:scale-[1.04]"
          }
        />
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <Heading className="text-[1.0625rem] leading-snug sm:text-[1.1875rem]">
          <Link
            href={href}
            className="transition-colors duration-[var(--dur-ui)] hover:text-s-berry"
          >
            {product.name}
          </Link>
        </Heading>

        {/* Two lines, clamped. The clamp stops one long description from making
            a whole row taller — and an owner can now write any length at all. */}
        <p className="line-clamp-2 text-[0.875rem] leading-snug text-s-bark">
          {product.description}
        </p>

        <div className="mt-auto flex flex-col gap-1 pt-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[1.0625rem] font-medium text-s-cocoa tabular-nums">
              {price
                ? `${manyPrices ? "From " : ""}${formatINR(price.total)}`
                : "Off the shelf"}
            </span>
            {/* The sizes on offer. One is named; several are counted, because
                "0.5 kg · 1 kg · 1.5 kg · 2 kg" does not fit a 170px card and
                truncating it would imply a shorter list than there is. */}
            {sizes.length > 0 && (
              <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-s-bark uppercase">
                {sizes.length === 1 ? sizeName(sizes[0]) : `${sizes.length} sizes`}
              </span>
            )}
          </div>

          {/* Neutral, and only when it is configured. §7. */}
          {hasBothEggTypes(product) && (
            <span className="text-[0.75rem] text-s-bark">Egg &amp; eggless available</span>
          )}
        </div>

        {/*
          One button below 640px, two above it.

          The grid runs two columns on a phone, so a card is about 170px wide
          there — and "Add to cart" beside "Details" inside that came out as a
          squeezed primary and a clipped "De…". The secondary is the one that
          yields, because it is the only one of the two already on the card
          twice: the title above is a link to the same page, and so is the
          photograph. Nothing becomes unreachable and no journey gets longer.
        */}
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          {/* Opens the choices rather than adding a cake nobody has specified.
              §2, and the reason `<AddToCart>` is no longer on this card. */}
          <AddToCartSheet
            product={product}
            catalog={catalog}
            srSuffix={product.name}
            className="w-full"
          />
          <Link
            href={href}
            className={
              "hidden min-h-11 items-center justify-center rounded-s-sm border " +
              "border-s-line-strong px-3.5 text-[0.8125rem] whitespace-nowrap text-s-bark " +
              "transition-colors duration-[var(--dur-ui)] " +
              "hover:border-s-cocoa hover:text-s-cocoa sm:inline-flex"
            }
          >
            Details
          </Link>
        </div>
      </div>
    </li>
  );
}
