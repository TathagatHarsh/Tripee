import Link from "next/link";
import { btn, eyebrow } from "@/lib/ui";

/**
 * No such order — or none of yours.
 *
 * Both cases land here and the wording covers both, which is not vagueness but
 * the point: app/orders/data.ts queries for "this reference, belonging to me",
 * so a real order that belongs to somebody else is indistinguishable from a
 * reference that was never minted. Saying "that order is not yours" would
 * confirm the existence of a stranger's order to anybody who typed a reference.
 *
 * The guest case is named because it is the likeliest innocent cause: an order
 * placed without signing in has no owner to match, so it will never appear here
 * however many times it is typed in.
 */
export default function OrderNotFound() {
  return (
    <div className="paper-edge bg-paper">
      <span className={`${eyebrow} block border-b border-rule px-5 py-3`}>Order not found</span>
      <div className="flex flex-col items-start gap-4 px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-mono text-title text-ink">
          We can&rsquo;t find that order on this account
        </h1>
        <p className="max-w-[52ch] font-sans text-body leading-relaxed text-steel">
          Check the reference against your confirmation — they look like
          <span className="font-mono text-meta text-ink"> MC-4471</span>. If the
          order was placed without signing in, it is tracked by that reference
          rather than by this account: ring the bakery and they will find it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/orders" className={btn("primary", "md")}>
            All your orders
          </Link>
          <Link href="/build/shape" className={btn("secondary", "md")}>
            Build a cake
          </Link>
        </div>
      </div>
    </div>
  );
}
