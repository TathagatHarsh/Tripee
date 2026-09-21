import { AccountSkeleton } from "@/components/orders/OrderSkeleton";
import { BakingStatus } from "@/components/shop/BakingMark";

/**
 * The account centre, before the greeting and the order count land.
 *
 * Both of those are a session read and a GROUP BY, so this is usually a frame or
 * two — but the cards are drawn at their real height regardless, because the one
 * thing worse than a wait is a page that jumps once it is over.
 */
export default function LoadingAccount() {
  return (
    <div aria-busy="true" aria-live="polite" className="relative">
      <BakingStatus label="Getting your account…" />
      <AccountSkeleton />
    </div>
  );
}
