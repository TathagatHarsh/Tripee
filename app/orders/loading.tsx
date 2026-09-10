import { OrdersSkeleton } from "@/components/orders/OrderSkeleton";
import { eyebrow } from "@/lib/ui";

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
        <span className={eyebrow}>Orders</span>
        <h1 className="font-mono text-heading text-ink">Your orders</h1>
      </div>

      <div className="flex animate-pulse flex-col gap-4">
        <span aria-hidden="true" className="block h-13 w-full max-w-[24rem] bg-counter" />
        <span aria-hidden="true" className="block h-11 w-full border-b border-rule" />
      </div>

      {/* `aria-busy` on the region rather than a spinner: a screen reader is told
          the list is loading once, instead of reading five empty cards. */}
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your orders</span>
        <OrdersSkeleton />
      </div>
    </>
  );
}
