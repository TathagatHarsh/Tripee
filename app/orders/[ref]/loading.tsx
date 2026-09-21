import { OrderDetailSkeleton } from "@/components/orders/OrderSkeleton";
import { BakingStatus } from "@/components/shop/BakingMark";

/**
 * The tracking page, before it arrives.
 *
 * The five marks of the tracker are drawn at the size they will be, because the
 * status sheet is the first thing the eye goes to and having it jump 30px when
 * the data lands is the one shift worth engineering away.
 */
export default function LoadingOrder() {
  return (
    <div aria-busy="true" aria-live="polite" className="relative flex flex-col gap-4">
      <BakingStatus label="Finding your order…" />
      <span aria-hidden="true" className="block h-11 w-40 animate-pulse rounded-s-sm bg-s-cream-deep" />
      <OrderDetailSkeleton />
    </div>
  );
}
