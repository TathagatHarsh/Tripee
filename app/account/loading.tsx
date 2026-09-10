import { AccountSkeleton } from "@/components/orders/OrderSkeleton";

/**
 * The account centre, before the greeting and the order count land.
 *
 * Both of those are a session read and a GROUP BY, so this is usually a frame or
 * two — but the cards are drawn at their real height regardless, because the one
 * thing worse than a wait is a page that jumps once it is over.
 */
export default function LoadingAccount() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your account</span>
      <AccountSkeleton />
    </div>
  );
}
