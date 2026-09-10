import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LoadConfig } from "@/components/builder/LoadConfig";
import { DeliveryInfo } from "@/components/orders/DeliveryInfo";
import { OrderItems } from "@/components/orders/OrderItems";
import { OrderProgress } from "@/components/orders/OrderProgress";
import { OrderSheetButton } from "@/components/orders/OrderSheetButton";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderSummary } from "@/components/orders/OrderSummary";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { requireRole } from "@/lib/auth";
import { DEFAULT_BAKERY } from "@/lib/catalogDefaults";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { renderSpecSheet } from "@/lib/docket";
import { formatIST } from "@/lib/format";
import { buildProgress, customerStatus, dueAt, PHASE } from "@/lib/orders";
import { btn, eyebrow } from "@/lib/ui";
import { getOrder } from "../data";

/**
 * One order, tracked.
 *
 * The customer's counterpart to /admin/orders/[ref], and deliberately a
 * different page rather than the same page with things hidden. The admin's asks
 * "what exactly did we agree to and who moved it" — frozen lines against a
 * regenerated spec sheet, the price drift, the staff member's name, the buttons
 * that advance the status. This one asks the single question somebody types a
 * reference into a phone to ask: where is my cake, and when will it be here.
 *
 * Both read the same columns and the same OrderEvent rows. Neither writes
 * anything here; every status change in the product still goes through
 * lib/orderTransition from a staff surface, which is why a move made on the
 * kitchen board shows up in this timeline with no further wiring — the board
 * writes the row, this reads it.
 *
 * ## The authorisation
 *
 * `requireRole` for the session, and `getOrder(profile.id, ref)` for the row:
 * the query is filtered on the viewer's own id in Postgres, so another
 * customer's reference is *not found* rather than found-and-refused. Nothing
 * about that order is read into this process. See app/orders/data.ts.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return {
    title: `Order ${ref} — Makemycake`,
    robots: { index: false, follow: false },
  };
}

export default async function TrackOrder({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  // First statement, and never inside a try: this refuses by throwing.
  const { profile } = await requireRole("CUSTOMER");
  const { ref } = await params;

  if (!hasDatabase()) {
    return (
      <Shell>
        <p className="paper-edge bg-paper px-5 py-4 font-sans text-body leading-relaxed text-steel">
          {NO_DATABASE_MESSAGE}
        </p>
      </Shell>
    );
  }

  const found = await getOrder(profile.id, ref);
  /*
   * Not theirs, or not a reference at all — the same answer to both, which is
   * the right one: whether MC-4471 exists is not a stranger's business. The
   * not-found page beside this one says so in the customer's own terms.
   */
  if (!found) notFound();

  const { order, catalog, config } = found;
  const pickup = order.deliverySlot === "pickup";
  const phase = PHASE[order.status];
  const steps = buildProgress(order, order.events);
  const now = customerStatus(order.status, pickup);

  /* The recorded arrival, if the move was written down. Beats any estimate, and
     is why the delivery panel takes it as an argument rather than guessing. */
  const deliveredAt =
    order.events.find((e) => e.toStatus === "delivered")?.createdAt ?? null;

  /* The cake's own share of the total: every frozen line except the delivery
     one, which the summary lists separately. */
  const cakePaise = order.items
    .filter((i) => i.kind !== "delivery")
    .reduce((sum, i) => sum + i.amountPaise, 0);

  /*
   * A placeholder is not a phone number.
   *
   * DEFAULT_BAKERY ships an unroutable number and an `.example` address so a
   * deployment with no BakerySettings row still has a letterhead. Wiring a "Ring
   * the bakery" button to either of them would be a control that fails in the
   * customer's hand — so the contact actions appear once the bakery has set its
   * own, and this is the comparison that decides it.
   */
  const phone = catalog.bakery.phone === DEFAULT_BAKERY.phone ? null : catalog.bakery.phone;
  const email = catalog.bakery.email === DEFAULT_BAKERY.email ? null : catalog.bakery.email;

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <span className={eyebrow}>Order</span>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-mono text-heading tracking-[0.08em] text-ink">{order.ref}</h1>
          <OrderStatusBadge status={order.status} pickup={pickup} />
        </div>
        <p className="font-sans text-meta text-steel">
          Placed{" "}
          <time dateTime={order.createdAt.toISOString()} className="font-mono tabular-nums">
            {formatIST(order.createdAt)}
          </time>
        </p>
      </div>

      {/* ------------------------------------------------------------ status */}
      <Sheet title="Order status">
        <div className="flex flex-col gap-6">
          <OrderProgress steps={steps} />

          <div className="flex flex-col gap-1.5 border-t border-rule pt-5">
            <h3
              className={[
                "font-mono text-group",
                phase === "cancelled" ? "text-seal" : phase === "active" ? "text-carbon" : "text-ink",
              ].join(" ")}
            >
              {now.label}
            </h3>
            <p className="max-w-[52ch] font-sans text-body leading-relaxed text-steel">
              {now.note}
            </p>

            {phase === "active" && (
              <p className="mt-2 font-sans text-body text-ink">
                <span className="font-mono text-micro tracking-[0.13em] text-steel uppercase">
                  {pickup ? "Ready by" : "Expected by"}
                </span>
                <br />
                <time dateTime={dueAt(order).toISOString()} className="font-mono tabular-nums">
                  {formatIST(dueAt(order))}
                </time>
              </p>
            )}

            {/* Where the promise came from, so the time above is not a number
                that appeared on its own. */}
            {phase === "active" && (
              <p className="mt-1 font-sans text-meta leading-relaxed text-steel">
                The window you chose, plus the lead time held on this order. If it
                needs to move, the bakery rings the number on it.
              </p>
            )}
          </div>
        </div>
      </Sheet>

      {/* ---------------------------------------------------------- timeline */}
      <Sheet title="Order timeline">
        <OrderTimeline steps={steps} />

        {/*
          Every status change has been recorded since the order book started
          keeping them, and not before — see prisma/schema.prisma on OrderEvent.
          An older order that was baked and delivered shows the steps as done
          with no times against them, and this says why rather than leaving a
          customer to conclude the page is broken.
        */}
        {order.events.length === 0 && order.status !== "draft" && (
          <p className="mt-6 border-t border-rule pt-4 font-sans text-meta leading-relaxed text-steel">
            The times on the later steps were not written down — this order predates
            our keeping a record of each move. The stage above is current.
          </p>
        )}
      </Sheet>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="flex flex-col gap-4">
          {/* ------------------------------------------------------ delivery */}
          <Sheet title={pickup ? "Collection details" : "Delivery details"}>
            <DeliveryInfo order={order} catalog={catalog} deliveredAt={deliveredAt} />
          </Sheet>

          {/* --------------------------------------------------------- items */}
          <Sheet title="Your cake">
            <OrderItems
              config={config}
              catalog={catalog}
              amountPaise={cakePaise}
              servesMin={order.servesMin}
              servesMax={order.servesMax}
            />

            {!config && (
              <p className="mt-4 border-t border-rule pt-4 font-sans text-meta leading-relaxed text-steel">
                This order was built with an older version of the designer, so we
                cannot redraw it here. The kitchen has the full specification and
                the price above is what stands.
              </p>
            )}
          </Sheet>
        </div>

        <div className="flex flex-col gap-4">
          {/* ------------------------------------------------------- summary */}
          <Sheet title="Order summary">
            <OrderSummary items={order.items} totalPaise={order.totalPaise} />
            {/*
              This product takes no money on the site yet — Order.paymentStatus
              defaults to `none` and there is no gateway behind it. Saying so is
              better than a "Paid" badge that is not true or a silence that
              leaves somebody wondering whether they have been charged.
            */}
            <p className="mt-4 border-t border-rule pt-3 font-sans text-meta leading-relaxed text-steel">
              Settled with the bakery directly — nothing has been charged to a card
              through this site.
            </p>
          </Sheet>

          {/* ------------------------------------------------------- actions */}
          <Sheet title="Anything else?">
            <div className="flex flex-col gap-2.5">
              {config && (
                <OrderSheetButton
                  /* Rendered here, on the server, by the same function the
                     admin's printable docket uses — see that component on why
                     the catalogue does not cross the boundary. */
                  sheet={renderSpecSheet(config, catalog, {
                    ref: order.ref,
                    createdAt: order.createdAt,
                  })}
                  filename={`makemycake-${order.ref}.txt`}
                />
              )}

              {/* Only the actions that exist. A phone the bakery has actually
                  set, an address it has actually set, the design if this order
                  came from a saved one, and the builder — which is the real
                  "order this again", because it opens the same cake. */}
              {phone && (
                <a href={`tel:${phone.replace(/\s/g, "")}`} className={btn("secondary", "md", "w-full")}>
                  Ring the bakery
                </a>
              )}

              {email && (
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(`Order ${order.ref}`)}`}
                  className={btn("quiet", "md", "w-full")}
                >
                  Email about this order
                </a>
              )}

              {config && (
                <LoadConfig
                  config={config}
                  label="Order this cake again"
                  className="w-full"
                />
              )}

              {order.design && (
                <Link href={`/d/${order.design.slug}`} className={btn("quiet", "md", "w-full")}>
                  View the saved design
                </Link>
              )}
            </div>

            <p className="mt-4 border-t border-rule pt-3 font-sans text-meta leading-relaxed text-steel">
              Quote {order.ref} and the bakery can pull this order up straight away.
            </p>
          </Sheet>
        </div>
      </div>
    </Shell>
  );
}

/* -------------------------------------------------------------- the furniture */

/**
 * The way back, and the frame around a page of sheets.
 *
 * The bar and the column are app/orders/layout.tsx, shared with the list and
 * with every loading, error and not-found state under this route. What is left
 * here is the back link — which belongs to this page rather than to the area,
 * since the list has nowhere of its own to go back to — and the tighter gap
 * between sheets that a document of six sections wants.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/orders"
        className="inline-flex min-h-11 items-center self-start font-mono text-micro tracking-[0.13em] text-steel uppercase hover:text-ink"
      >
        ← All your orders
      </Link>
      {children}
    </div>
  );
}

/** One sheet of paper with its section name on a ruled header. */
function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="paper-edge bg-paper">
      <h2 className={`${eyebrow} border-b border-rule px-5 py-3`}>{title}</h2>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}
