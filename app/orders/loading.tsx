import { OrdersSkeleton } from "@/components/orders/OrderSkeleton";
import { BakingStatus } from "@/components/shop/BakingMark";
import { sEyebrow } from "@/lib/shopUi";

/**
 * The list, before it arrives.
 *
 * The heading is real rather than a grey bar: it is the same two lines on every
 * render, so drawing a placeholder for text that is already known would be a
 * shimmer where a title could have been. Everything below it is the shape of the
 * cards that are coming — see components/orders/OrderSkeleton on why the sizes
 * matter more than the tone.
 */
export default function LoadingOrders() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={sEyebrow}>Orders</span>
        <h1 className="text-[2.25rem] sm:text-[2.75rem]">Your orders</h1>
      </div>

      <div className="flex animate-pulse flex-col gap-4">
        <span aria-hidden="true" className="block h-12 w-full max-w-[24rem] rounded-s-sm bg-s-cream-deep" />
        <span aria-hidden="true" className="block h-11 w-full border-b border-s-line" />
      </div>

      {/* `aria-busy` on the region rather than a spinner on each card: a screen
          reader is told the list is loading once, instead of reading five empty
          ones. The mark floats over the skeleton rather than sitting above it —
          in the flow it would push every card down forty pixels and let them
          spring back the moment the data landed, which is the shift the
          skeleton exists to prevent. */}
      <div aria-busy="true" aria-live="polite" className="relative">
        <BakingStatus label="Getting your orders…" />
        <OrdersSkeleton />
      </div>
    </>
  );
}
