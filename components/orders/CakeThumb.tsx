import Image from "next/image";
import type { CakeConfig } from "@/lib/schema";
import { productForConfig } from "@/lib/shop";
import { CakeMark } from "./CakeMark";

/**
 * The cake on an order, as a picture where there is one and a drawing where
 * there is not.
 *
 * Both cases are real and neither is a fallback in the apologetic sense:
 *
 *   · An order placed from the shop has its cake's photograph copied onto the
 *     row at the moment it was placed (`Order.cakeImageUrl`), so the picture on
 *     the order is the picture the customer actually bought from — and stays
 *     that picture after the cake is rephotographed, renamed or deleted.
 *
 *     Orders written before the product table existed have no such column, and
 *     for those `lib/shop.productForConfig` finds the preset whose *design*
 *     matches; `public/presets/<slug>.webp` is a render of that exact
 *     configuration. Its note explains why the match is on the design.
 *
 *   · An order built in the 3D builder is a cake nobody has photographed,
 *     because nobody has made it before. `CakeMark` draws it from its own
 *     config — real tiers, real frosting colour, real drip. A stock photo of
 *     somebody else's cake beside the words "your order" is the one thing a
 *     tracking page must not do, and `lib/photos.ts` refuses the same trick
 *     for the same reason with an empty list.
 *
 * `sizes` is passed by the caller because the two call sites are different
 * widths — a 96px square in the list, a 128px one on the order — and a wrong
 * `sizes` on a `fill` image is a full-resolution download for a thumbnail.
 */
export function CakeThumb({
  config,
  alt,
  sizes,
  frozenImageUrl,
  className = "",
}: {
  config: CakeConfig | null;
  /** The cake's name in words. Empty when the caller already names it beside. */
  alt: string;
  sizes: string;
  /** `Order.cakeImageUrl` — the photograph as it was when the order was placed. */
  frozenImageUrl?: string | null;
  className?: string;
}) {
  const src = frozenImageUrl ?? productForConfig(config)?.image ?? null;

  return (
    <div
      className={
        "s-photo-well relative shrink-0 overflow-hidden rounded-s-sm border border-s-line " +
        className
      }
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover object-[50%_62%]"
        />
      ) : (
        /* `aria-hidden` inside CakeMark already, and correctly: the cake is
           named in words beside every one of these. */
        <CakeMark config={config} className="size-full p-1" />
      )}
    </div>
  );
}
