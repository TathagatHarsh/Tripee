import Link from "next/link";
import { cakeSubtitle } from "@/lib/docket";
import { formatINR, formatIST } from "@/lib/format";
import { dueAt, PHASE } from "@/lib/orders";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { cakeDisplayName, sizeLabel } from "@/lib/shop";
import { sBtn, sCard } from "@/lib/shopUi";
import type { OrderCardData } from "@/app/orders/data";
import { CakeThumb } from "./CakeThumb";
import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * One order in the list.
 *
 * A shop's order card rather than a carbon copy: the photograph of the cake on
 * the left, what it is and what it cost beside it, and the reference and the
 * badge on a strip across the top. The strip is what makes a column of these
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
  /* The frozen name wins: an order says what it said when it was placed, even
     after the cake behind it has been renamed or withdrawn. */
  const first = order.cakes[0];
  const config = first?.config ?? order.config;
  const name = cakeDisplayName(config, catalog, first?.cakeName ?? order.cakeName);
  const size = sizeLabel(config, catalog);
  const cakeCount = order.cakes.length || 1;

  return (
    <li className={`${sCard} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-s-line bg-s-cream-deep/40 px-4 py-2.5 sm:px-5">
        <h3 className="font-mono text-[0.875rem] tracking-[0.1em] text-s-cocoa uppercase">
          <Link
            href={`/orders/${order.ref}`}
            className="transition-colors duration-[var(--dur-ui)] hover:text-s-berry"
          >
            {order.ref}
          </Link>
        </h3>
        <time
          dateTime={order.createdAt.toISOString()}
          className="font-mono text-[0.6875rem] text-s-bark tabular-nums"
        >
          Placed {formatIST(order.createdAt)}
        </time>
        <OrderStatusBadge status={order.status} pickup={pickup} className="ml-auto" />
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <CakeThumb
          config={config}
          /* Named, because unlike the order page this card's heading is the
             reference rather than the cake — so the picture is the only place
             the flavour is said to somebody who cannot see it. */
          alt={name}
          sizes="112px"
          frozenImageUrl={first?.cakeImageUrl ?? order.cakeImageUrl}
          className="size-20 sm:size-28"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[1.0625rem] leading-tight text-s-cocoa">{name}</p>

          {config ? (
            <p className="text-[0.875rem] leading-snug text-s-bark">
              {cakeSubtitle(config, catalog)}
            </p>
          ) : (
            /* A stored configuration that no longer validates. The order is
               still real, still priced and still trackable — see app/orders/data. */
            <p className="text-[0.875rem] leading-snug text-s-bark">
              Built with an earlier version of the designer.
            </p>
          )}

          <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-s-bark uppercase tabular-nums">
            {cakeCount} {cakeCount === 1 ? "cake" : "cakes"}
            {cakeCount === 1 && size && ` · ${size}`} · serves {order.servesMin}-{order.servesMax}
          </p>

          <p className="mt-1 font-mono text-[1.0625rem] font-medium text-s-cocoa tabular-nums">
            {formatINR(order.totalPaise)}
          </p>

          {live && (
            <p className="text-[0.875rem] leading-snug text-s-live">
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
        <div className="shrink-0">
          <Link
            href={`/orders/${order.ref}`}
            className={sBtn(live ? "primary" : "outline", "md", "w-full sm:w-auto")}
          >
            {live ? "Track order" : "View order"}
            <span className="sr-only"> {order.ref}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
