import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { renderSpecSheet } from "@/lib/docket";
import { formatINR, formatIST, titleCase } from "@/lib/format";
import {
  buildProgress, buildTimeline, customerStatus, dueAt, isClosed, NEXT_STATUS, STATUS_LABEL,
} from "@/lib/orders";
import { priceCake } from "@/lib/pricing";
import { sizeName } from "@/lib/cakes";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { assignmentHistory, VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE } from "@/lib/vendors";
import { OrderHistory, OrderProgress } from "@/components/admin/OrderTimeline";
import {
  aBtn, aEyebrow, Card, CardHead, Notice, OrderStatusBadge, PageHeader, StatusBadge,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { getOrderDetail } from "./data";
import { AssignVendor } from "./AssignVendor";
import { StatusActions } from "./StatusActions";

/**
 * One order, whole.
 *
 * The page an owner has open while they are on the phone to the person whose
 * cake it is, which is what decides the running order: who they are talking to
 * and what it cost first, where the cake is second, what was actually agreed
 * third, and the paper trail last. §8's layout is that order and this follows
 * it.
 *
 * ## Two things sit outside the `config` check, on purpose
 *
 * An order whose stored configuration no longer validates against the current
 * schema is a real state, not an error — lib/schema's `migrateConfig` returns
 * null for one. Where the order is, who ordered it and what they were charged
 * are all columns, so they survive it; only the spec sheet and the recomputed
 * comparison need the parsed cake. That is why status and history render before
 * anything asks whether the config is readable: an order that cannot produce a
 * spec sheet still has to be confirmable, cancellable, and answerable on the
 * phone.
 *
 * ## The frozen price, and the one place this page volunteers arithmetic
 *
 * The charges are `OrderItem` rows, read as stored. Nothing on this page
 * reprices the cake into the total — the number the customer agreed to is the
 * number, which is the whole point of freezing it. The drift notice is the
 * exception and it is a comparison rather than a correction: it says what the
 * same cake would cost today, states plainly that the frozen figure stands, and
 * changes nothing. It exists because an owner looking at a two-week-old order
 * beside a spec sheet regenerated at today's prices deserves to be told why the
 * two disagree, rather than discovering it as a discrepancy.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ ref: string }> },
): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} — Admin`, robots: { index: false, follow: false } };
}

export default async function OrderDetail({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Order" back={{ href: "/admin/orders", label: "Back to orders" }} />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  /* The assign picker's options, read beside the order rather than after it.
     Active only — an order cannot be given to a bakery the shop has stopped
     sending work to, and lib/vendorTransition refuses one regardless. */
  const [detail, vendors] = await Promise.all([
    getOrderDetail(ref),
    db.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!detail) notFound();

  const { order, catalog, config } = detail;

  const recomputed = config ? priceCake(config, catalog).total : null;
  const drifted = recomputed !== null && recomputed !== order.totalPaise;
  const now = new Date();
  const due = dueAt(order);
  const overdue = due < now && !isClosed(order.status);
  const closed = isClosed(order.status);

  /* One shape for the events, read twice — the tracker wants `fromStatus` (to
     know how far a cancelled order got) and the history wants the actor's name.
     Mapped once so the two lists cannot come from different reads. */
  const events = order.events.map((e) => ({
    toStatus: e.toStatus,
    fromStatus: e.fromStatus,
    createdAt: e.createdAt,
    actorName: e.actor?.name ?? null,
  }));

  const progress = buildProgress(order, events);
  const timeline = buildTimeline(order.createdAt, events);
  /* The same words the tracking page prints, from the same function — so an
     owner on the phone can read back exactly what the customer is looking at
     rather than translating the enum in their head. `customerStatus` is the one
     mapping, and this page calls it rather than restating it. */
  const seen = customerStatus(order.status, order.deliverySlot === "pickup");
  /* The pointer, not "the newest assignment that isn't rejected". Which one is
     live is a column — see prisma/schema.prisma — so this page never has to
     work it out and cannot disagree with the writer that set it. */
  const current = order.currentAssignment;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={order.ref} back={{ href: "/admin/orders", label: "Back to orders" }}>
        {/* A new tab, because the thing being printed is a document rather than
            a screen: the kitchen keeps the order open and takes the paper away. */}
        <Link
          href={`/admin/orders/${order.ref}/print`}
          target="_blank"
          className={aBtn("secondary", "md")}
        >
          <Icon name="print" size={16} />
          Print docket
        </Link>
      </PageHeader>

      {/* ── the facts that belong in one glance ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <OrderStatusBadge status={order.status} label={STATUS_LABEL[order.status]} />
        <span className="font-a-mono text-a-lede font-semibold tabular-nums text-a-ink">
          {formatINR(order.totalPaise)}
        </span>
        {order.allergens.length > 0 && (
          <StatusBadge tone="warn" dot={false} label={`Contains ${order.allergens.join(", ")}`} />
        )}
        {overdue && <StatusBadge tone="bad" label="Past its window" />}
      </div>

      {overdue && (
        <Notice tone="bad" icon="clock">
          This order was due {formatIST(due)} and has not been delivered. The
          customer was promised that time — ring them before changing anything on
          this page.
        </Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ══════════════════════════════════════════════ the left column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── §8: order status, as a progress timeline ───────────────── */}
          <Card>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-a-sans text-a-item font-semibold text-a-ink">Order status</h2>
              <p className="text-a-meta text-a-muted">
                Where this docket is, and when each step was recorded.
              </p>
            </div>
            <OrderProgress steps={progress} />

            {/* What this status looks like from the other side. The customer is
                never shown the enum, the vendor, or any of the fulfilment panel
                on the right — see app/orders/[ref], which renders exactly this. */}
            <div className="mt-4 border-t border-a-line pt-3">
              <h3 className={aEyebrow}>What the customer sees</h3>
              <p className="mt-1 font-a-sans text-a-body font-semibold text-a-ink">
                {seen.label}
              </p>
              <p className="mt-0.5 text-a-meta leading-relaxed text-a-muted">{seen.note}</p>
            </div>
          </Card>

          {/* ── §23: the cake, said plainly ────────────────────────────── */}
          {/*
            Above the details and above the spec sheet, because "which cake, what
            size, with or without egg" is the question an owner on the phone is
            being asked, and reading it out of a monospace docket is slower than
            it needs to be.

            Every value is the order's own: `cakeName` and `cakeImageUrl` frozen
            onto the row when it was placed, the size and the sponge from the
            frozen config, and the money from the `OrderItem` lines below. None
            of them is re-read from the cake, so editing or deleting that cake
            leaves this panel saying exactly what it said yesterday.
          */}
          <Card flush>
            <CardHead
              title="Cake"
              note="As it was bought. Editing the cake in the catalogue does not change this."
            />
            <div className="flex items-start gap-4 p-4 sm:p-5">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-a-sm border border-a-line bg-a-sunken">
                <CakePhoto
                  src={order.cakeImageUrl}
                  /* Empty: the name is immediately beside it. */
                  alt=""
                  config={config}
                  sizes="80px"
                />
              </div>
              <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-0 sm:grid-cols-2">
                <Row k="Cake" v={order.cakeName ?? "Built in the 3D builder"} />
                <Row k="Size" v={config ? sizeName(config.size) : "Unknown"} />
                <Row
                  k="Sponge"
                  v={config ? (config.eggless ? "Eggless" : "With egg") : "Unknown"}
                />
                {/* One order is one cake in this schema — see app/checkout — so
                    this is a constant rather than a column. Stated anyway,
                    because every order list trains people to look for it. */}
                <Row k="Quantity" v="1" />
                {config?.message?.trim() && (
                  <Row k="Piped on it" v={`“${config.message.trim()}”`} />
                )}
              </dl>
            </div>
          </Card>

          {/* ── §8: order details ──────────────────────────────────────── */}
          <Card flush>
            <CardHead title="Order details" note="What was agreed when the order was taken." />
            <dl className="grid gap-x-6 gap-y-0 px-4 py-1 sm:grid-cols-2 sm:px-5">
              <Row k="Delivery" v={titleCase(order.deliverySlot)} />
              <Row k="Lead time quoted" v={`${order.leadHours} hours`} />
              <Row k="Due" v={formatIST(due)} tone={overdue ? "bad" : undefined} />
              <Row k="Pincode" v={order.pincode ?? "Not set"} mono />
              <Row k="Serves" v={`${order.servesMin}–${order.servesMax} people`} />
              <Row
                k="Allergens"
                v={order.allergens.length ? order.allergens.join(", ") : "None declared"}
                tone={order.allergens.length ? "warn" : undefined}
              />
              <Row k="Placed" v={formatIST(order.createdAt)} mono />
              <Row k="Last touched" v={formatIST(order.updatedAt)} mono />
              <Row
                k="Payment"
                /*
                 * Read from the column rather than assumed. It is `none` on
                 * every order in the product — nothing is paid online — and
                 * printing the enum's own answer means this row starts telling
                 * the truth the day a payment provider is wired up, instead of
                 * being a hardcoded "on delivery" that quietly becomes wrong.
                 */
                v={
                  order.paymentStatus === "none"
                    ? "Nothing taken online — on delivery"
                    : titleCase(order.paymentStatus)
                }
              />
              {order.design && (
                <Row
                  k="Saved design"
                  v={`/d/${order.design.slug}`}
                  mono
                  href={`/d/${order.design.slug}`}
                />
              )}
            </dl>
          </Card>

          {/* ── §8: pricing, frozen ────────────────────────────────────── */}
          <Card flush>
            <CardHead
              title="What they were charged"
              note="Frozen when the order was placed. Later catalogue changes do not touch it."
            />
            <ul className="flex flex-col gap-1.5 px-4 py-3.5 sm:px-5">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-4 text-a-small">
                  <span className="min-w-0 text-a-muted">{it.label}</span>
                  <span className="shrink-0 font-a-mono tabular-nums text-a-ink">
                    {formatINR(it.amountPaise)}
                  </span>
                </li>
              ))}
              <li className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-a-line pt-2.5">
                <span className="font-a-sans text-a-body font-semibold text-a-ink">
                  Total, including GST
                </span>
                <span className="font-a-mono text-a-item font-semibold tabular-nums text-a-ink">
                  {formatINR(order.totalPaise)}
                </span>
              </li>
            </ul>

            {drifted && (
              <div className="border-t border-a-line px-4 pb-4 pt-4 sm:px-5">
                <Notice tone="warn" icon="info">
                  The same cake would cost{" "}
                  <span className="font-a-mono font-semibold">{formatINR(recomputed!)}</span> at
                  today&rsquo;s prices. The{" "}
                  <span className="font-a-mono font-semibold">{formatINR(order.totalPaise)}</span>{" "}
                  above is what was agreed and is what stands — the spec sheet below
                  is regenerated and will show the new figure.
                </Notice>
              </div>
            )}
          </Card>

          {/* ── the spec sheet, for the bench ──────────────────────────── */}
          <Card flush>
            <CardHead
              title="Cake specification"
              note="The sheet the kitchen works from, regenerated against today's catalogue."
            />
            {config ? (
              /*
               * Mono, and the one place in the portal where a whole block of it
               * is right: this is the kitchen's document, laid out in columns by
               * lib/docket, and a proportional face would break the alignment it
               * depends on. Scrolls inside itself so a long line cannot widen
               * the page.
               */
              <pre className="a-scroll-x bg-a-sunken px-4 py-3.5 font-a-mono text-a-meta leading-[1.75] text-a-ink sm:px-5">
{renderSpecSheet(config, catalog, { ref: order.ref, createdAt: order.createdAt })}
              </pre>
            ) : (
              <div className="p-4 sm:p-5">
                <Notice tone="bad" icon="alert">
                  This order&rsquo;s stored configuration no longer validates against
                  the current schema, so no sheet can be produced. Everything else on
                  this page is still correct — ring the customer and confirm the cake
                  by hand.
                </Notice>
              </div>
            )}
          </Card>
        </div>

        {/* ═════════════════════════════════════════════ the right column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── §8: customer ───────────────────────────────────────────── */}
          <Card>
            <h2 className={aEyebrow}>Customer</h2>
            <p className="mt-2 font-a-sans text-a-lede font-semibold text-a-ink">
              {order.customerName ?? "No name taken"}
            </p>
            {order.customerPhone ? (
              /*
               * A `tel:` link, which is the single most useful control on this
               * page: the portal is open on a laptop next to a phone, and on a
               * tablet this dials. Every other route to it is retyping ten
               * digits off a screen.
               */
              <a
                href={`tel:${order.customerPhone.replace(/[^\d+]/g, "")}`}
                className="mt-1 inline-flex items-center gap-1.5 font-a-mono text-a-item tabular-nums text-a-accent-ink underline decoration-a-accent-line underline-offset-2 hover:decoration-a-accent"
              >
                <Icon name="phone" size={15} />
                {order.customerPhone}
              </a>
            ) : (
              <p className="mt-1 text-a-small text-a-faint">No number on this order.</p>
            )}
            <p className="mt-2.5 text-a-meta leading-relaxed text-a-muted">
              {order.userId
                ? "Placed from a signed-in account, so they can follow it themselves."
                : "Placed as a guest. Contact details are recorded above."}
            </p>
          </Card>

          <Card>
            <h2 className={aEyebrow}>Delivery &amp; requested arrival</h2>
            <p className="mt-3 text-a-body font-semibold">{order.fulfillmentMethod === "pickup" ? "Bakery pickup" : [order.addressLine1,order.addressLine2,order.landmark,order.city,order.state,order.pincode].filter(Boolean).join(", ") || "Address not recorded"}</p>
            {order.requestedFor && <p className="mt-3 text-a-body">{formatIST(order.requestedFor)}</p>}
            <p className="mt-1 text-a-small text-a-muted">{order.requestedWindow ?? order.deliverySlot}</p>
            {order.deliveryInstructions && <p className="mt-3 text-a-small">Delivery instructions: {order.deliveryInstructions}</p>}
            {order.customerNotes && <p className="mt-3 text-a-small">Customer notes: {order.customerNotes}</p>}
            {order.customerEmail && <a href={`mailto:${order.customerEmail}`} className="mt-3 inline-flex min-h-11 items-center text-a-small text-a-accent-ink underline">{order.customerEmail}</a>}
          </Card>

          {/* ── §8: admin actions ──────────────────────────────────────── */}
          <Card>
            <h2 className={aEyebrow}>Actions</h2>
            <div className="mt-3">
              {closed ? (
                <p className="text-a-small leading-relaxed text-a-muted">
                  {order.status === "delivered"
                    ? "Delivered. Nothing further to do on this one."
                    : "Cancelled. A cancelled order does not reopen — take a new one."}
                </p>
              ) : (
                <>
                  <StatusActions
                    orderRef={order.ref}
                    status={order.status}
                    next={NEXT_STATUS[order.status]}
                  />
                  <p className="mt-3 text-a-meta leading-relaxed text-a-muted">
                    Only the moves this order can legally make are shown. The{" "}
                    <Link href="/kitchen" className="font-medium text-a-accent-ink underline">
                      kitchen board
                    </Link>{" "}
                    moves it by the same rules, and both write the same record.
                  </p>
                </>
              )}
            </div>
          </Card>

          {/* ── fulfilment: which bakery is making this ─────────────────── */}
          <Card>
            <h2 className={aEyebrow}>Fulfilment</h2>

            {current ? (
              <>
                <p className="mt-2 font-a-sans text-a-lede font-semibold text-a-ink">
                  {current.vendor.name}
                </p>
                <div className="mt-2">
                  <StatusBadge
                    label={VENDOR_STATUS_LABEL[current.status]}
                    tone={VENDOR_STATUS_TONE[current.status]}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 font-a-sans text-a-lede font-semibold text-a-muted">
                  Unassigned
                </p>
                <p className="mt-1 text-a-meta leading-relaxed text-a-muted">
                  {order.assignments.length === 0
                    ? "No bakery has been given this order."
                    : "No bakery is holding this order now. The history below says who had it."}
                </p>
              </>
            )}

            {(order.status === "confirmed" || order.status === "in_kitchen") ? (
            <div className="mt-3 border-t border-a-line pt-3">
              {/* Keyed on the live assignment, so handing the order to a
                  different bakery remounts the picker with it shut again rather
                  than leaving a component's state chasing a prop. */}
              <AssignVendor
                key={current?.id ?? "unassigned"}
                orderRef={order.ref}
                vendors={vendors}
                assigned={current?.vendor.name ?? null}
              />
            </div>
            ) : (
              <p className="mt-3 border-t border-a-line pt-3 text-a-meta text-a-muted">
                Confirm the order before assigning it. Closed orders cannot be assigned.
              </p>
            )}

            {order.assignments.length > 0 && (
              <div className="mt-4 border-t border-a-line pt-3">
                <h3 className={aEyebrow}>Assignment history</h3>
                <ul className="mt-2.5 flex flex-col gap-3">
                  {order.assignments.map((a) => (
                    <li key={a.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-a-sans text-a-small font-semibold text-a-ink">
                          {a.vendor.name}
                        </span>
                        {a.id === order.currentAssignmentId && (
                          <span className={aEyebrow}>Current</span>
                        )}
                      </div>
                      {/*
                        Read off the row's own timestamp columns rather than from
                        an event table — see lib/vendors' `assignmentHistory`,
                        and prisma/schema.prisma on why VendorOrder is its own
                        history. Nothing here is inferred: a step with no
                        timestamp simply has no line.
                      */}
                      <ul className="flex flex-col gap-0.5">
                        {assignmentHistory(a).map((e) => (
                          <li
                            key={e.label}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 text-a-meta"
                          >
                            <span className="text-a-muted">{e.label}</span>
                            <span className="font-a-mono tabular-nums text-a-faint">
                              {formatIST(e.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {a.rejectionReason && (
                        <p className="mt-0.5 text-a-meta leading-snug text-a-bad-ink">
                          &ldquo;{a.rejectionReason}&rdquo;
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-3 border-t border-a-line pt-3 text-a-meta leading-relaxed text-a-muted">
              The bakery&rsquo;s progress is separate from the order status above, and
              none of this panel reaches the customer — not the name, not a decline,
              not a reason. The one exception is a bakery starting a cake, which
              moves the order to <span className="font-medium text-a-ink">In the kitchen</span>{" "}
              if it is legal from where the order is; everything else on the
              customer&rsquo;s page is moved from here or the kitchen board.
            </p>
          </Card>

          {/* ── §8: order timeline ─────────────────────────────────────── */}
          <Card>
            <h2 className={aEyebrow}>Order timeline</h2>
            <div className="mt-3">
              <OrderHistory entries={timeline} />
            </div>
            {order.events.length === 0 && (
              <p className="mt-3 border-t border-a-line pt-3 text-a-meta leading-relaxed text-a-muted">
                Nothing after that has been recorded. Status changes have only been
                written down since this order book started keeping them — an older
                order that was baked and delivered shows one line here rather than a
                history invented for it.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * One labelled fact.
 *
 * `tone` is used exactly twice — an overdue due-date and a non-empty allergen
 * list — and both are cases where the value changes what somebody does about
 * it. Everything else is plain, because a definition list where half the rows
 * are coloured has stopped colour meaning anything.
 */
function Row({
  k,
  v,
  mono = false,
  href,
  tone,
}: {
  k: string;
  v: string;
  mono?: boolean;
  href?: string;
  tone?: "warn" | "bad";
}) {
  const colour =
    tone === "bad" ? "font-medium text-a-bad-ink"
    : tone === "warn" ? "font-medium text-a-warn-ink"
    : "text-a-ink";

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 border-b border-a-line py-2.5 last:border-0">
      <dt className={`${aEyebrow} w-full sm:w-auto sm:min-w-[7.5rem]`}>{k}</dt>
      <dd
        className={`min-w-0 flex-1 text-a-small leading-snug ${mono ? "font-a-mono tabular-nums" : ""} ${colour}`}
      >
        {href ? (
          <Link
            href={href}
            target="_blank"
            className="inline-flex items-center gap-1 text-a-accent-ink underline decoration-a-accent-line underline-offset-2"
          >
            {v}
            <Icon name="external" size={12} />
          </Link>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
