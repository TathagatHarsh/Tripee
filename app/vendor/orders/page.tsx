import { QueueFilters, filterQueue, type QueueQuery } from "../QueueFilters";
import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { isVendorFinished } from "@/lib/vendors";
import { Notice } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { vendorHistory, type VendorCard } from "../data";
import { OrderTicket } from "../OrderTicket";

/**
 * Everything this bakery has been given, newest first.
 *
 * The board answers "what now" and drops anything finished or declined, which is
 * right for a board and leaves one real question unanswered: *what did I do with
 * that one*. Before this page the answer was a URL somebody had to still have —
 * `vendorOrder` has always been willing to return a declined assignment, and
 * nothing linked to it. So a bakery that declined an order on Tuesday had no way
 * back to the fact that they had declined it, or to the reason they gave.
 *
 * Two sections rather than one list, and the split is the state machine's own:
 * `isVendorFinished` is true exactly when `VENDOR_NEXT` is empty, so "still
 * open" means "there is still a move" and is not a second opinion about what
 * open means.
 *
 * The cards carry no buttons here. Everything still open is on the board with
 * its button already, and a second place to press "Mark ready" is a second place
 * for two people to press it at once.
 */

export const metadata: Metadata = {
  title: "Your orders — MakeYourCakes",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VendorOrders({
  searchParams,
}: {
  searchParams: Promise<QueueQuery>;
}) {
  const { vendor } = await requireVendor();

  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;

  const query = await searchParams;
  const all = filterQueue(await vendorHistory(vendor.id), query, new Date());
  const open = all.filter((c) => !isVendorFinished(c.status));
  const done = all.filter((c) => isVendorFinished(c.status));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-a-sans text-a-title font-bold tracking-[-0.015em] text-a-ink">
          Orders
        </h1>
        <p className="mt-1 text-a-body leading-relaxed text-a-muted">
          Every order MakeYourCakes has given you, newest first.
        </p>
      </header>

      <QueueFilters query={query} action="/vendor/orders" />
      {all.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-a border border-a-line bg-a-surface px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-a-idle-wash text-a-faint">
            <Icon name="cake" size={22} />
          </span>
          <p className="font-a-sans text-a-lede font-semibold text-a-ink">
            No orders yet
          </p>
          <p className="max-w-sm text-a-body leading-relaxed text-a-muted">
            Nothing has been given to you so far. The first one shows up here
            and on the kitchen board at the same time.
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <Section
              title="Still open"
              note="On the kitchen board now, with something left to do."
              cards={open}
            />
          )}
          {done.length > 0 && (
            <Section
              title="Finished and declined"
              note="Nothing further to do on these. Open one to read what happened."
              cards={done}
            />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  cards,
}: {
  title: string;
  note: string;
  cards: VendorCard[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-a-sans text-a-lede font-semibold tracking-[-0.01em] text-a-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-a-small leading-snug text-a-muted">{note}</p>
      </div>
      {/* Two columns from `sm` and no more. These are reading cards, not a queue
          to scan, and a third column would only make each one narrower. */}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <OrderTicket key={card.id} card={card} actions={false} />
        ))}
      </div>
    </section>
  );
}
