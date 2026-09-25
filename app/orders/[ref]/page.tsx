import { AssignmentRefresh } from "@/components/assignment/Refresh";
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
import { BUILDER_ENABLED } from "@/lib/flags";
import { DEFAULT_BAKERY } from "@/lib/catalogDefaults";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { renderSpecSheet } from "@/lib/docket";
import { formatIST } from "@/lib/format";
import { buildProgress, customerStatus, dueAt, PHASE } from "@/lib/orders";
import { sBtn, sCard, sEyebrow } from "@/lib/shopUi";
import { readGuestOrderRefs } from "@/lib/guestOrders";
import { getOrder, type OrderOwner } from "../data";

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
 * Two doors, one property. A signed-in customer comes through `requireRole` and
 * the query is filtered on their own id; a guest comes through the signed
 * cookie lib/guestOrders set when the order was written, and the query is
 * filtered on the references that cookie names. Either way the filter is in
 * Postgres, so somebody else's reference is *not found* rather than
 * found-and-refused, and nothing about that order is read into this process.
 * See app/orders/data.ts.
 *
 * What is deliberately *not* a door: knowing the reference. Six characters off
 * a docket are an identifier, not a password, and §10 is explicit that they
 * must not open somebody's name, phone number and delivery window. The cookie
 * is proof of having been handed the order by this server, on this browser; it
 * cannot be typed, guessed, or forwarded in a message.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return {
    title: `Order ${ref} · MakeYourCakes`,
    robots: { index: false, follow: false },
  };
}

export default async function TrackOrder({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  /*
   * The cookie first, because it is the cheaper question and because a guest
   * must not be bounced to a sign-in page for an order they placed without an
   * account. `requireRole` refuses by throwing a redirect, so it stays out of
   * any `try` — the ternary below is a plain expression, not a caught call.
   */
  const guestRefs = await readGuestOrderRefs();
  const owner: OrderOwner = guestRefs.includes(ref)
    ? { guestRefs }
    : { userId: (await requireRole("CUSTOMER")).profile.id };

  if (!hasDatabase()) {
    return (
      <Shell>
        <p className={`${sCard} px-5 py-4 leading-relaxed text-s-bark`}>
          {NO_DATABASE_MESSAGE}
        </p>
      </Shell>
    );
  }

  const found = await getOrder(owner, ref);
  /*
   * Not theirs, or not a reference at all — the same answer to both, which is
   * the right one: whether MC-4471 exists is not a stranger's business. The
   * not-found page beside this one says so in the customer's own terms.
   */
  if (!found) notFound();

  const { order, catalog, config, cakes } = found;
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
   * own, and this is the comparison that decides it. The email test is on the
   * reserved `.example` domain rather than the exact default, so a row seeded
   * with an older placeholder address stays hidden too.
   */
  const phone = catalog.bakery.phone === DEFAULT_BAKERY.phone ? null : catalog.bakery.phone;
  const email = catalog.bakery.email.endsWith(".example") ? null : catalog.bakery.email;

  return (
    <Shell>
      <AssignmentRefresh/>
      {order.fulfillmentMethod === "delivery" && !["cancelled", "delivered"].includes(order.status) && <section className="rounded-xl border border-s-line bg-s-shell p-5"><p className="font-semibold">{order.currentAssignment?.assignmentStatus === "ACCEPTED" ? "Bakery assigned ✓" : order.assignmentState === "MANUAL" ? "Order confirmed. Our main bakery is arranging your cake." : "Order confirmed. Finding the nearest available bakery…"}</p>{order.currentAssignment?.assignmentStatus === "ACCEPTED" && <p className="mt-2">Your cake is being prepared by: {order.currentAssignment.vendor.name}{order.currentAssignment.status === "ready" && " · Ready ✓"}</p>}</section>}
      <div className="flex flex-col gap-2">
        <span className={sEyebrow}>Order</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Mono and tracked out, against the `.s-root` rule that sets every
              heading in the shop in the display serif. A reference is a string
              somebody reads back over the phone character by character — it is
              a number, not a title, and the tabular face is what makes MC-8B3J
              unambiguous. The same exception the price figures take. */}
          <h1 className="font-mono text-[2rem] tracking-[0.08em] text-s-cocoa sm:text-[2.5rem]">
            {order.ref}
          </h1>
          <OrderStatusBadge status={order.status} pickup={pickup} />
        </div>
        <p className="text-[0.875rem] text-s-bark">
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

          <div className="flex flex-col gap-1.5 border-t border-s-line pt-5">
            <h3
              className={[
                "text-[1.25rem]",
                phase === "cancelled" ? "text-s-stop" : phase === "active" ? "text-s-live" : "text-s-done",
              ].join(" ")}
            >
              {now.label}
            </h3>
            <p className="max-w-[54ch] leading-relaxed text-s-bark">{now.note}</p>

            {phase === "active" && (
              <div className="mt-3 flex flex-col gap-1 rounded-s-sm bg-s-live-wash px-4 py-3">
                <span className="font-mono text-[0.6875rem] tracking-[0.13em] text-s-live uppercase">
                  {pickup ? "Ready by" : "Expected by"}
                </span>
                <time
                  dateTime={dueAt(order).toISOString()}
                  className="font-mono text-[1.0625rem] font-medium text-s-cocoa tabular-nums"
                >
                  {formatIST(dueAt(order))}
                </time>
                {/* Where the promise came from, so the time above is not a
                    number that appeared on its own. */}
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-s-bark">
                  The window you chose, plus the lead time held on this order. If
                  it needs to move, the bakery rings the number on it.
                </p>
              </div>
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
          <p className="mt-6 border-t border-s-line pt-4 text-[0.875rem] leading-relaxed text-s-bark">
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
          <Sheet title={cakes.length > 1 ? "Your cakes" : "Your cake"}>
            <div className="flex flex-col gap-6 divide-y divide-s-line">
              {(cakes.length ? cakes : [{
                id: order.id, config, totalPaise: cakePaise,
                servesMin: order.servesMin, servesMax: order.servesMax,
                cakeName: order.cakeName, cakeImageUrl: order.cakeImageUrl,
                allergens: order.allergens, productionSpec: null,
              }]).map((cake, index) => (
                <div key={cake.id} className={index ? "pt-6" : ""}>
                  <OrderItems
                    config={cake.config}
                    catalog={catalog}
                    amountPaise={cake.totalPaise}
                    servesMin={cake.servesMin}
                    servesMax={cake.servesMax}
                    cakeName={cake.cakeName}
                    cakeImageUrl={cake.cakeImageUrl}
                    allergens={cake.allergens}
                  />
                </div>
              ))}
            </div>

            {cakes.some((cake) => !cake.config) && (
              <p className="mt-4 border-t border-s-line pt-4 text-[0.875rem] leading-relaxed text-s-bark">
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
            <p className="mt-4 border-t border-s-line pt-3 text-[0.875rem] leading-relaxed text-s-bark">
              Settled with the bakery directly. Nothing has been charged to a card
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
                  filename={`makeyourcakes-${order.ref}.txt`}
                />
              )}

              {/* Only the actions that exist. A phone the bakery has actually
                  set, an address it has actually set, the design if this order
                  came from a saved one, and the builder — which is the real
                  "order this again", because it opens the same cake. */}
              {phone && (
                <a href={`tel:${phone.replace(/\s/g, "")}`} className={sBtn("outline", "md", "w-full")}>
                  Ring the bakery
                </a>
              )}

              {email && (
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(`Order ${order.ref}`)}`}
                  className={sBtn("ghost", "md", "w-full border border-s-line")}
                >
                  Email about this order
                </a>
              )}

              {/*
                "Order this cake again" loads the order's own config into the
                3D builder, which is held back for this phase — see lib/flags.
                Offered while the door is shut it would be a button that lands
                on a Coming Soon page, which is a worse answer than not offering
                it. The control is not removed: it comes back with the flag.

                No shop substitute is put in its place, and deliberately. This
                order's config is a cake somebody built option by option; the
                nearest thing the shop sells is a different cake, and quietly
                swapping one for the other under the words "this cake again" is
                the kind of small lie a reorder button must not tell.
              */}
              {BUILDER_ENABLED && config && (
                <LoadConfig
                  config={config}
                  label="Order this cake again"
                  className="w-full"
                />
              )}

              {order.design && (
                <Link
                  href={`/d/${order.design.slug}`}
                  className={sBtn("ghost", "md", "w-full border border-s-line")}
                >
                  View the saved design
                </Link>
              )}
            </div>

            <p className="mt-4 border-t border-s-line pt-3 text-[0.875rem] leading-relaxed text-s-bark">
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
        className="inline-flex min-h-11 items-center self-start font-mono text-[0.6875rem] tracking-[0.13em] text-s-bark uppercase transition-colors hover:text-s-cocoa"
      >
        ← All your orders
      </Link>
      {children}
    </div>
  );
}

/**
 * One card with its section name on it.
 *
 * The heading is inside the card rather than on a ruled strip above it, which is
 * the storefront's own card shape — see `sCard` and every panel on /cart and
 * /checkout. A tracking page made of six differently-shaped boxes is what makes
 * an area feel bolted on.
 */
function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${sCard} px-5 py-5 sm:px-6 sm:py-6`}>
      <h2 className="mb-4 font-mono text-[0.6875rem] tracking-[0.16em] text-s-bark uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
