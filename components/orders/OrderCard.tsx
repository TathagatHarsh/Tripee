import Link from "next/link";
import { cakeSubtitle, cakeTitle } from "@/lib/docket";
import { formatINR, formatIST } from "@/lib/format";
import { dueAt, PHASE } from "@/lib/orders";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { btn } from "@/lib/ui";
import type { OrderCardData } from "@/app/orders/data";
import { CakeMark } from "./CakeMark";
import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * One order in the list.
 *
 * A docket, not a dashboard row: the reference and the date sit on a ruled strip
 * across the top the way a carbon copy's header does, and the cake, the money
 * and the way in are underneath it. That strip is what makes a column of these
 * scannable — the eye runs down the references and the badges without reading
 * anything else, which is the whole job of an order list.
 *
 * ## What it does not show
 *
 * No expected time on a delivered or cancelled order. A window that has already
 * passed, printed under a badge saying the cake arrived, reads as a system that
 * does not know what happened — the badge is the answer, and the timeline on the
 * order's own page is where the times live.
 */
export function OrderCard({
  order,
  catalog,
}: {
  order: OrderCardData;
  catalog: CatalogSnapshot;
}) {
  const pickup = order.deliverySlot === "pickup";
  const live = PHASE[order.status] === "active";

  return (
    <li className="paper-edge bg-paper">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule px-4 py-3 sm:px-5">
        <h3 className="font-mono text-body tracking-[0.1em] text-ink uppercase">
          <Link href={`/orders/${order.ref}`} className="hover:underline">
            Order {order.ref}
          </Link>
        </h3>
        <time
          dateTime={order.createdAt.toISOString()}
          className="font-mono text-micro tabular-nums text-steel"
        >
          Placed {formatIST(order.createdAt)}
        </time>
        <OrderStatusBadge status={order.status} pickup={pickup} className="ml-auto" />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:gap-5 sm:px-5">
        {/* The mark keeps its own box so the row's left edge is a straight line
            down a list of cards whatever the cake is. */}
        <div className="flex size-20 shrink-0 items-center justify-center border border-rule bg-counter sm:size-24">
          <CakeMark config={order.config} className="size-full" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {order.config ? (
            <>
              <p className="font-sans text-item leading-tight text-ink">
                {cakeTitle(order.config, catalog)}
              </p>
              <p className="font-sans text-meta leading-snug text-steel">
                {cakeSubtitle(order.config, catalog)}
              </p>
            </>
          ) : (
            /* A stored configuration that no longer validates. The order is
               still real, still priced and still trackable — see app/orders/data. */
            <p className="font-sans text-item leading-tight text-ink">Custom cake</p>
          )}

          <p className="mt-0.5 font-mono text-micro tabular-nums text-graphite">
            1 cake · serves {order.servesMin}–{order.servesMax}
          </p>

          <p className="mt-1 font-mono text-item tabular-nums text-ink">
            {formatINR(order.totalPaise)}
          </p>

          {live && (
            <p className="font-sans text-meta leading-snug text-carbon">
              {pickup ? "Ready to collect by " : "Expected by "}
              <time dateTime={dueAt(order).toISOString()} className="font-mono tabular-nums">
                {formatIST(dueAt(order))}
              </time>
            </p>
          )}
        </div>

        {/*
          One action, not two. "Track order" and "View details" would be two
          buttons 200px apart pointing at the same page — the order's page is
          both, and a customer who presses the wrong one of a pair that does the
          same thing learns the interface is guessing.
        */}
        <div className="flex items-start sm:items-center">
          <Link
            href={`/orders/${order.ref}`}
            className={btn(live ? "primary" : "secondary", "md", "w-full sm:w-auto")}
          >
            {live ? "Track order" : "View order"}
            <span className="sr-only"> {order.ref}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
