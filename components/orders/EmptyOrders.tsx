import Link from "next/link";
import { btn, eyebrow } from "@/lib/ui";

/**
 * Nothing here yet — said three different ways, because there are three
 * different reasons a list can be empty and only one of them is "you have never
 * ordered a cake".
 *
 * A single "No orders found" would be wrong twice over: it would tell somebody
 * who has just searched for a flavour they never chose to go and build a cake,
 * and it would hide the one fact a first-time visitor to this page actually
 * needs, which is that an order placed as a guest does not appear here at all.
 * That is not a bug to be papered over — signing in is a convenience in this
 * product and never a condition of ordering, so the page has to be honest that
 * a reference is the other way to track one.
 */
export function EmptyOrders({
  reason,
  query,
}: {
  reason: "none" | "search" | "filter";
  query?: string;
}) {
  if (reason === "search") {
    return (
      <Shell title="No orders match that">
        <p className="max-w-[46ch] font-sans text-body leading-relaxed text-steel">
          Nothing on this account matches{" "}
          <span className="font-mono text-meta text-ink">{query}</span>. Try the
          order reference from your confirmation, or a flavour you remember
          choosing.
        </p>
        <Link href="/orders" className={btn("secondary", "md")}>
          Show all orders
        </Link>
      </Shell>
    );
  }

  if (reason === "filter") {
    return (
      <Shell title="Nothing in this tab">
        <p className="max-w-[46ch] font-sans text-body leading-relaxed text-steel">
          You have orders on this account, just none at this stage right now.
        </p>
        <Link href="/orders" className={btn("secondary", "md")}>
          Show all orders
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="No orders on this account yet">
      <p className="max-w-[52ch] font-sans text-body leading-relaxed text-steel">
        When you build a cake while signed in, it lands here and you can follow
        it from our call through to the doorstep.
      </p>
      <p className="max-w-[52ch] font-sans text-meta leading-relaxed text-steel">
        Ordered as a guest? That order is real and the kitchen has it — it is
        tracked by the reference on your confirmation rather than by this page.
        Ring the bakery with the reference and they will find it.
      </p>
      <Link href="/build/shape" className={btn("primary", "md")}>
        Build a cake
      </Link>
    </Shell>
  );
}

/**
 * The frame all three share: a sheet with a ruled header, so an empty list is
 * still a piece of stationery rather than a paragraph floating in a gutter.
 */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="paper-edge bg-paper">
      <span className={`${eyebrow} block border-b border-rule px-5 py-3`}>Your orders</span>
      <div className="flex flex-col items-start gap-4 px-5 py-8 sm:px-8 sm:py-10">
        {/* An empty box where a card would have a cake, at the same size — so
            the shape of the page does not change once there is something in it. */}
        <div className="flex size-20 items-center justify-center border border-dashed border-rule-strong bg-counter">
          <span aria-hidden="true" className="font-mono text-heading text-steel">—</span>
        </div>
        <h2 className="font-mono text-title text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
