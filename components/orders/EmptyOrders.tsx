import Link from "next/link";
import { sBtn, sCard } from "@/lib/shopUi";

/**
 * Nothing here yet — said three different ways, because there are three
 * different reasons a list can be empty and only one of them is "you have never
 * ordered a cake".
 *
 * A single "No orders found" would be wrong twice over: it would tell somebody
 * who has just searched for a flavour they never chose to go and order a cake,
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
        <p className="max-w-[48ch] text-s-bark">
          Nothing on this account matches{" "}
          <span className="font-mono text-s-cocoa">{query}</span>. Try the order
          reference from your confirmation, or a flavour you remember choosing.
        </p>
        <Link href="/orders" className={sBtn("outline", "md")}>
          Show all orders
        </Link>
      </Shell>
    );
  }

  if (reason === "filter") {
    return (
      <Shell title="Nothing in this tab">
        <p className="max-w-[48ch] text-s-bark">
          You have orders on this account, just none at this stage right now.
        </p>
        <Link href="/orders" className={sBtn("outline", "md")}>
          Show all orders
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="No orders on this account yet">
      <p className="max-w-[52ch] text-s-bark">
        When you order a cake while signed in, it lands here and you can follow it
        from our call through to the doorstep.
      </p>
      <p className="max-w-[52ch] text-[0.875rem] leading-relaxed text-s-bark">
        Ordered as a guest? That order is real and the kitchen has it. It is
        tracked by the reference on your confirmation rather than by this page.
        Ring the bakery with the reference and they will find it.
      </p>
      <Link href="/shop" className={sBtn("primary", "lg")}>
        Shop cakes
      </Link>
    </Shell>
  );
}

/** The frame all three share. */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${sCard} flex flex-col items-start gap-4 px-6 py-12 sm:px-10 sm:py-16`}>
      <h2 className="text-[1.75rem]">{title}</h2>
      {children}
    </div>
  );
}
