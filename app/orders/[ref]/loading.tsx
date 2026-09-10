import { OrderDetailSkeleton } from "@/components/orders/OrderSkeleton";

/**
 * The tracking page, before it arrives.
 *
 * The five marks of the tracker are drawn at the size they will be, because the
 * status sheet is the first thing the eye goes to and having it jump 30px when
 * the data lands is the one shift worth engineering away.
 */
export default function LoadingOrder() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading this order</span>
      <span aria-hidden="true" className="block h-11 w-40 animate-pulse bg-counter" />
      <OrderDetailSkeleton />
    </div>
  );
}
