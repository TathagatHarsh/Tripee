import { requireVendor } from "@/lib/auth";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { VENDOR_COLUMNS } from "@/lib/vendors";
import { Notice } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { vendorBoard } from "./data";
import { OrderTicket } from "./OrderTicket";

/**
 * The kitchen board. What this bakery has to make, and what to press next.
 *
 * ## Why this is a board now and was a list before
 *
 * The list was the right shape for a screen that answered "what have you given
 * me". §7 changes the question to the one a kitchen actually asks — *what do I
 * do next* — and that question has four answers at once: something is waiting
 * for an answer, something is agreed but not started, something is in the oven,
 * something is boxed. A list sorted by due date mixes all four together and
 * makes the reader sort them again in their head every time they look.
 *
 * The objection to a board was phones, and it was a fair one: four narrow
 * columns on a 390px screen is one column you cannot read and three you cannot
 * find. So below `md` the columns stack into four labelled sections in the same
 * order, which is a board a thumb can scroll rather than a board shrunk.
 *
 * ## The columns are the state machine, not a second one
 *
 * `VENDOR_COLUMNS` is four members of `VendorOrderStatus`, and there is no
 * board-only status anywhere in this file. §25's rule, and the same one the
 * kitchen board at /kitchen follows against `OrderStatus`: two state machines in
 * this product, deliberately separate, and neither of them invents a third.
 *
 * Which is also why there is no "collected" column. `handed_over` is terminal,
 * so a card that reached it can never move again, and a column of cards nobody
 * can clear is a column that fills up until it is ignored. Finished work is on
 * /vendor/orders.
 *
 * ## Scope
 *
 * `requireVendor()` in the layout is the gate; this calls it again for the
 * bakery's *id*, which `vendorBoard` puts in its WHERE. Nothing on this page
 * filters a wider read, and nothing a request can name reaches the query. See
 * app/vendor/data.ts.
 */

export const dynamic = "force-dynamic";

export default async function KitchenBoard() {
  const { vendor } = await requireVendor();

  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;

  const board = await vendorBoard(vendor.id);
  const waiting = board.filter((c) => c.status === "assigned").length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-a-sans text-a-title font-bold tracking-[-0.015em] text-a-ink">
          Kitchen
        </h1>
        {/*
          One sentence, and it is the answer to "is there anything for me".
          Counting the orders waiting on an answer rather than the total, because
          that is the only number on this page somebody else is waiting on.
        */}
        <p className="mt-1 text-a-body leading-relaxed text-a-muted">
          {board.length === 0
            ? "Nothing to make right now."
            : waiting > 0
              ? `${waiting} new ${waiting === 1 ? "order needs" : "orders need"} an answer.`
              : `${board.length} ${board.length === 1 ? "cake" : "cakes"} in hand.`}
        </p>
      </header>

      {board.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-a border border-a-line bg-a-surface px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-a-good-wash text-a-good-ink">
            <Icon name="check" size={22} />
          </span>
          <p className="font-a-sans text-a-lede font-semibold text-a-ink">
            You&rsquo;re all caught up.
          </p>
          <p className="max-w-sm text-a-body leading-relaxed text-a-muted">
            No cakes are waiting for you. When Makemycake gives you an order it
            appears here. What you have finished is under Orders.
          </p>
        </div>
      ) : (
        /*
          `items-start` so a column with one card is one card tall rather than
          stretched to match the tallest. Four equal-height columns of mostly
          empty box is what makes a Kanban board hard to scan.
        */
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {VENDOR_COLUMNS.map((col) => {
            const cards = board.filter((c) => c.status === col.status);
            const answering = col.status === "assigned" && cards.length > 0;

            return (
              /*
                Named by its own heading. A <section> with no accessible name is
                announced as a plain group, which on a four-column board means a
                screen-reader user hears four unlabelled groups of cards and has
                to read into each one to find out which is which.
              */
              <section
                key={col.status}
                aria-labelledby={`col-${col.status}`}
                className="flex flex-col gap-2.5"
              >
                <div
                  className={[
                    "flex flex-col gap-0.5 rounded-a border px-3 py-2.5",
                    answering
                      ? "border-a-warn-line bg-a-warn-wash"
                      : "border-a-line bg-a-sunken",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2
                      id={`col-${col.status}`}
                      className={`font-a-sans text-a-item font-bold tracking-[-0.01em] ${
                        answering ? "text-a-warn-ink" : "text-a-ink"
                      }`}
                    >
                      {col.label}
                    </h2>
                    <span
                      className={`font-a-mono text-a-item font-semibold tabular-nums ${
                        answering ? "text-a-warn-ink" : "text-a-muted"
                      }`}
                    >
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-a-meta leading-snug text-a-muted">{col.note}</p>
                </div>

                {cards.length === 0 ? (
                  /* Every column says what empty means for it. "No new orders"
                     and "Nothing on the bench" are different pieces of good
                     news, and one shared "Nothing here" would make a board of
                     four identical grey boxes. */
                  <p className="rounded-a border border-dashed border-a-line px-3 py-5 text-center text-a-small text-a-faint">
                    {col.empty}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {cards.map((card) => (
                      <OrderTicket key={card.id} card={card} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
