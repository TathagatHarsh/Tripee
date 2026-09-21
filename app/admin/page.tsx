import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST, titleCase } from "@/lib/format";
import { customerStatus, STATUS_LABEL } from "@/lib/orders";
import {
  ATTENTION_LABEL,
  ATTENTION_NOTE,
  ATTENTION_TONE,
  IST_OFFSET_MS,
  openTotal,
  startOfISTDay,
  worstAttention,
} from "@/lib/ops";
import { VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE } from "@/lib/vendors";
import { DueLabel } from "@/components/admin/OrderTimeline";
import {
  aBtn,
  aEyebrow,
  Card,
  CardHead,
  EmptyState,
  Notice,
  OrderStatusBadge,
  PageHeader,
  Ref,
  StatCard,
  StatusBadge,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { deliverySnapshot, opsSnapshot } from "./data";

/**
 * What is happening in the bakery today.
 *
 * Deliberately short, and this is the one thing the redesign did not change
 * about it. Every number here is one somebody acts on before lunch — what came
 * in, what is late, what to make next — and nothing is here because it charts
 * nicely. §6 asks for the same thing in its own words: "Prioritize actionable
 * information. Do not fill the dashboard with meaningless graphs."
 *
 * There are still no graphs. At a few dozen orders a week a sparkline is
 * decoration pretending to be information, and the day a real trend exists it
 * will deserve a real chart rather than one drawn in advance. The two "what
 * people order" lists keep their bar-as-a-share-of-the-top-row, which is
 * readable without an axis.
 *
 * Two honesty rules this page has always followed and still does.
 *
 * It says "order value", never "revenue". Nothing is paid online —
 * Order.paymentStatus is `none` on every row in the product — so these totals
 * are the value of orders accepted, not money received, and calling them
 * revenue would put a figure on a dashboard that no bank statement agrees with.
 * §6 asks for a "REVENUE / ORDER VALUE" section and this is the order-value
 * half of it; the revenue half does not exist yet and is not going to be
 * invented.
 *
 * And "due" is derived, not stored. There is no delivery timestamp on an order;
 * there is a slot and the lead time that slot promised, so due = placed + lead.
 * That is the arithmetic the customer was quoted, which makes it the right one
 * to be judged against. `lib/orders`' `dueAt` is the single definition of it,
 * shared with the orders table and the kitchen board.
 */

/** The hour in IST, for the greeting. Not the server's hour, which is UTC. */
function greeting(now: Date): string {
  const h = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Three of §6's four overview cards. The fourth is delivery, on the row below. */
const BOARD: { status: OrderStatus; label: string; icon: string }[] = [
  { status: "draft", label: "Awaiting confirmation", icon: "phone" },
  { status: "confirmed", label: "Confirmed", icon: "check" },
  { status: "in_kitchen", label: "In the kitchen", icon: "kitchen" },
];

export default async function Dashboard() {
  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="The bakery, at a glance." />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const now = new Date();
  const dayStart = startOfISTDay(now);
  const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const quarterStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const notCancelled = { status: { not: "cancelled" as const } };

  const [
    today,
    week,
    byStatus,
    ops,
    delivery,
    recent,
    events,
    sponges,
    sizes,
    productCount,
    vendorCount,
  ] = await Promise.all([
    db.order.aggregate({
      where: { ...notCancelled, createdAt: { gte: dayStart } },
      _count: { _all: true },
      _sum: { totalPaise: true },
    }),
    db.order.aggregate({
      where: { ...notCancelled, createdAt: { gte: weekStart } },
      _count: { _all: true },
      _sum: { totalPaise: true },
      _avg: { totalPaise: true },
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    /*
     * The operational half: the open orders with their live assignment, the
     * vendor-state counts and each bakery's workload. One call rather than the
     * bare `findMany` this used to be, because every one of those rows now also
     * has to answer "who is making it" and "is anything wrong with it" — see
     * app/admin/data.ts for the query budget, and lib/ops for the rules.
     */
    opsSnapshot(now),
    /*
     * Today's delivery run, counted. A separate read from `opsSnapshot` above
     * and not a duplicate of it: that one is the open backlog with no date in
     * it, and this is one IST day — which crucially includes the orders already
     * delivered, since "six due, four delivered" is the sentence somebody wants
     * at four in the afternoon and a delivered order is invisible to a backlog.
     *
     * Narrowed by date in Postgres, so this is a day rather than the order book
     * filtered in the page — §12 and §29. See app/admin/data.ts.
     */
    deliverySnapshot(now, {
      day: "today",
      state: "all",
      vendor: null,
      slot: null,
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        ref: true,
        status: true,
        createdAt: true,
        totalPaise: true,
        customerName: true,
      },
    }),
    /*
     * §6's "Recent activity", and the only source of it that is real:
     * OrderEvent rows, written by lib/orderTransition whenever somebody moves a
     * docket. There is no activity log for catalogue edits and none was
     * invented — §44 is explicit about not filling a UI with data that is not
     * there, and CatalogPriceChange is per-option history rather than a feed.
     *
     * An empty list here is a real answer: nothing has been moved since the
     * table started recording.
     */
    db.orderEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        toStatus: true,
        createdAt: true,
        order: { select: { ref: true } },
        actor: { select: { name: true } },
      },
    }),
    /*
     * The config is JSON, so this is the one place raw SQL earns itself: the
     * alternative is pulling every order into memory to count a string field.
     * Nothing a customer typed is interpolated — the only variable is a date
     * this file computed.
     */
    db.$queryRaw<{ value: string; n: bigint }[]>`
      SELECT "config"->>'sponge' AS value, count(*) AS n
      FROM "Order"
      WHERE status <> 'cancelled' AND "createdAt" >= ${quarterStart}
      GROUP BY 1 ORDER BY n DESC, value ASC LIMIT 5`,
    db.$queryRaw<{ value: string; n: bigint }[]>`
      SELECT "config"->>'size' AS value, count(*) AS n
      FROM "Order"
      WHERE status <> 'cancelled' AND "createdAt" >= ${quarterStart}
      GROUP BY 1 ORDER BY n DESC, value ASC LIMIT 5`,
    db.cakeProduct.count({ where: { isAvailable: true } }),
    db.vendor.count(),
  ]);

  const counts: Partial<Record<OrderStatus, number>> = {};
  for (const g of byStatus) counts[g.status] = g._count._all;

  /* Already sorted soonest-due-first by the snapshot, and each row already
     carries why it wants somebody — nothing is re-derived here. */
  const due = ops.rows;
  const overdue = due.filter((d) => d.attention.includes("overdue"));
  const needing = due.filter((d) => d.attention.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="The bakery, at a glance."
        blurb={`${greeting(now)}. Here's what's happening with the bakery today.`}
      >
        <Link href="/admin/orders/today" className={aBtn("secondary", "md")}>
          <Icon name="delivery" size={16} />
          Deliveries
        </Link>
        {/*
          The kitchen board used to be the third button here and is deliberately
          not any more. §3: the owner confirms orders and decides who bakes them;
          the bench work belongs to whoever is at the bench, which is a partner
          bakery on /vendor or a baker on /kitchen. It is still reachable — the
          account menu offers it to anybody with KITCHEN rank, and ADMIN outranks
          KITCHEN — but promoting it here made running the kitchen look like part
          of the owner's morning.
        */}
        <Link href="/admin/orders" className={aBtn("primary", "md")}>
          All orders
          <Icon name="arrowRight" size={16} />
        </Link>
      </PageHeader>

      <section className="ops-overview-band" aria-label="Business overview">
        <div>
          <span className="text-xs uppercase tracking-widest">
            The business behind the celebrations
          </span>
          <h2>Keep every promise.</h2>
          <p>
            Orders, the cake counter and your bakery partners — all in one
            place.
          </p>
        </div>
        <div className="ops-overview-figures">
          <Link href="/admin/cakes">
            <strong>{productCount}</strong>
            <span>Cakes on sale ↗</span>
          </Link>
          <Link href="/admin/vendors">
            <strong>{vendorCount}</strong>
            <span>Bakery partners ↗</span>
          </Link>
          <Link href="/admin/orders?status=delivered">
            <strong>{counts.delivered ?? 0}</strong>
            <span>Completed orders ↗</span>
          </Link>
        </div>
      </section>

      {/* ── what needs somebody, before anything else on the page ───────── */}
      {overdue.length > 0 && (
        <Notice tone="bad" icon="clock">
          <p className="font-semibold">
            {overdue.length === 1
              ? "One order is past the window it was quoted."
              : `${overdue.length} orders are past the window they were quoted.`}
          </p>
          <p className="mt-0.5">
            That is a phone call, not a status change — the customer was
            promised a time and it has gone.{" "}
            <Link
              href="/admin/orders?due=late"
              className="font-medium underline"
            >
              See which ones
            </Link>
            .
          </p>
        </Notice>
      )}

      {/* ── §6: today's overview ────────────────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <h2 className={aEyebrow}>Today&apos;s overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Orders today"
            value={String(today._count._all)}
            note={`Since midnight IST · ${formatINR(today._sum.totalPaise ?? 0)} in order value`}
            icon="orders"
          />
          {BOARD.map((b) => (
            <StatCard
              key={b.status}
              label={b.label}
              value={String(counts[b.status] ?? 0)}
              /* Coloured only when there is something in it. A dashboard where
                 every card is amber has said nothing about which one to open. */
              tone={
                (counts[b.status] ?? 0) === 0
                  ? "plain"
                  : b.status === "draft"
                    ? "warn"
                    : "accent"
              }
              href={`/admin/orders?status=${b.status}`}
              icon={b.icon}
            />
          ))}
        </div>

        {/* ── §6: order value ─────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Out for delivery"
            value={String(counts.out_for_delivery ?? 0)}
            href="/admin/orders?status=out_for_delivery"
            tone={(counts.out_for_delivery ?? 0) > 0 ? "accent" : "plain"}
            icon="delivery"
          />
          <StatCard
            label="Order value this week"
            value={formatINR(week._sum.totalPaise ?? 0)}
            note={`${week._count._all} ${week._count._all === 1 ? "order" : "orders"} in seven days`}
            icon="pricing"
          />
          <StatCard
            label="Average order, this week"
            value={
              week._avg.totalPaise
                ? formatINR(Math.round(week._avg.totalPaise))
                : "—"
            }
            note="Cancellations excluded"
          />
          <StatCard
            label="Past its window"
            value={String(overdue.length)}
            tone={overdue.length > 0 ? "bad" : "good"}
            note={
              overdue.length === 0
                ? "Everything is inside its promise"
                : undefined
            }
            href={overdue.length > 0 ? "/admin/orders?due=late" : undefined}
            icon="clock"
          />
        </div>

        <p className="text-a-meta leading-relaxed text-a-muted">
          <strong className="font-semibold text-a-ink">
            Order value, not revenue.
          </strong>{" "}
          Nothing is paid on the site, so these totals are the value of orders
          accepted — the kitchen still rings to confirm, and takes payment on
          delivery.
        </p>
      </section>

      {/* ── §12: today's delivery run ───────────────────────────────────── */}
      <Card flush>
        <CardHead
          title="Today's deliveries"
          note={
            delivery.counts.total === 0
              ? "Nothing is due today. Days are Hyderabad days, not the server's."
              : `${delivery.counts.total} due today, by the window each customer was ` +
                "quoted. Hyderabad days, not the server's."
          }
        >
          <Link href="/admin/orders/today" className={aBtn("ghost", "sm")}>
            Delivery board
            <Icon name="chevronRight" size={13} />
          </Link>
        </CardHead>

        {/*
          Six figures rather than six StatCards. They are one thing — the shape
          of today's run — and six cards would give them more of the page than
          the order book above them, which is the "decorative dashboard" §32
          warns off. Each is a link into the board already filtered to it, so a
          number somebody wants to act on is one click from the rows behind it.

          Every figure carries its word. §10: not colour alone.
        */}
        <div className="grid grid-cols-2 gap-px border-t border-a-line bg-a-line sm:grid-cols-3 xl:grid-cols-6">
          <DayFigure
            k="Due today"
            v={delivery.counts.total}
            href="/admin/orders/today"
          />
          <DayFigure
            k="Ready"
            v={delivery.counts.ready}
            tone={delivery.counts.ready > 0 ? "good" : undefined}
            href="/admin/orders/today?state=ready"
          />
          <DayFigure
            k="In preparation"
            v={delivery.counts.preparing}
            href="/admin/orders/today?state=not_ready"
          />
          <DayFigure
            k="Out for delivery"
            v={delivery.counts.outForDelivery}
            href="/admin/orders/today?state=out_for_delivery"
          />
          <DayFigure
            k="Delivered"
            v={delivery.counts.delivered}
            href="/admin/orders/today?state=delivered"
          />
          <DayFigure
            k="Needs attention"
            v={delivery.counts.attention}
            tone={delivery.counts.attention > 0 ? "bad" : undefined}
            href="/admin/orders/today?state=attention"
          />
        </div>
      </Card>

      {/* ── fulfilment: where the partner bakeries are ──────────────────── */}
      <section className="flex flex-col gap-2.5">
        <h2 className={aEyebrow}>Fulfilment</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/*
            Counted off live assignments only — see app/admin/data.ts. A bakery's
            declined and withdrawn rows are history on the order's own page and
            would otherwise inflate every figure here.

            These are the *vendor* machine, deliberately kept apart from the
            order cards above: an order can be `confirmed` to the customer while
            the bakery holding it has not answered the phone. Both are true and
            they are different questions.
          */}
          <StatCard
            label="Awaiting assignment"
            value={String(ops.unassigned)}
            note="Confirmed, with no bakery making it"
            tone={ops.unassigned > 0 ? "bad" : "good"}
            icon="vendor"
          />
          <StatCard
            label="Awaiting acceptance"
            value={String(ops.vendorState.assigned)}
            note="Handed over, not answered yet"
            tone={ops.vendorState.assigned > 0 ? "warn" : "plain"}
            icon="clock"
          />
          <StatCard
            label="In preparation"
            value={String(ops.vendorState.in_preparation)}
            note="Being made now"
            tone={ops.vendorState.in_preparation > 0 ? "accent" : "plain"}
            icon="kitchen"
          />
          <StatCard
            label="Ready for handover"
            value={String(ops.vendorState.ready)}
            note="Finished, waiting for collection"
            tone={ops.vendorState.ready > 0 ? "good" : "plain"}
            icon="check"
          />
        </div>
      </section>

      {/* ── §6: needs attention ─────────────────────────────────────────── */}
      <Card flush>
        <CardHead
          title="Needs attention"
          note={
            needing.length === 0
              ? "Nothing is stuck, late, or waiting on a bakery."
              : `${needing.length} ${needing.length === 1 ? "order wants" : "orders want"} ` +
                "somebody. Worst first."
          }
        >
          <Link href="/admin/vendors" className={aBtn("ghost", "sm")}>
            Vendors
            <Icon name="chevronRight" size={13} />
          </Link>
        </CardHead>

        {needing.length === 0 ? (
          <EmptyState
            icon="check"
            title="Nothing needs chasing."
            blurb={
              "Every open order is inside its window, has a bakery on it, and " +
              "nobody is waiting on an answer."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {needing.slice(0, 8).map((d) => {
              const worst = worstAttention(d.attention)!;
              return (
                <li
                  key={d.ref}
                  className="border-b border-a-line last:border-0"
                >
                  <Link
                    href={`/admin/orders/${d.ref}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-a-sunken sm:px-5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Ref className="font-medium text-a-ink">{d.ref}</Ref>
                        {/* Every reason, not just the worst: an order can be
                            declined *and* due in an hour, and the office needs
                            both facts to decide what to do about it. */}
                        {d.attention.map((r) => (
                          <StatusBadge
                            key={r}
                            label={ATTENTION_LABEL[r]}
                            tone={ATTENTION_TONE[r]}
                          />
                        ))}
                      </span>
                      <span className="text-a-meta text-a-muted">
                        {ATTENTION_NOTE[worst]}
                      </span>
                      <span className="text-a-meta text-a-muted">
                        {d.customerName ?? "No name taken"}
                        {d.customerPhone && ` · ${d.customerPhone}`}
                        {` · ${titleCase(d.deliverySlot)}`}
                        {` · ${d.vendorName ?? "No bakery"}`}
                      </span>
                    </span>

                    <span className="flex items-center gap-4">
                      <DueLabel dueAt={d.due} now={now} status={d.status} />
                      <Icon
                        name="chevronRight"
                        size={15}
                        className="shrink-0 text-a-ghost"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── §6: vendor workload ─────────────────────────────────────────── */}
      <Card flush>
        <CardHead
          title="Vendor workload"
          note={
            "What each bakery is holding right now, busiest first. Counts of open " +
            "assignments — there is no capacity figure on a vendor, and one would " +
            "be invented."
          }
        >
          <Link href="/admin/vendors" className={aBtn("ghost", "sm")}>
            All vendors
            <Icon name="chevronRight" size={13} />
          </Link>
        </CardHead>

        {ops.load.length === 0 ? (
          <EmptyState
            icon="vendor"
            title="No bakeries yet"
            blurb={
              "Until there is at least one active vendor, orders cannot be assigned " +
              "and stay in the shop's own hands."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {ops.load.map((v) => (
              <li key={v.id} className="border-b border-a-line last:border-0">
                <Link
                  href={`/admin/vendors/${v.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-a-sunken sm:px-5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-a-sans text-a-small font-semibold text-a-ink">
                        {v.name}
                      </span>
                      {!v.isActive && (
                        <StatusBadge label="Inactive" tone="plain" />
                      )}
                      {v.assigned > 0 && (
                        <StatusBadge
                          label={`${v.assigned} to answer`}
                          tone="warn"
                        />
                      )}
                    </span>
                    {/*
                      A definition list rather than four bare numbers: each one is
                      a different job, which is the same reason lib/vendors'
                      VENDOR_BUCKET splits the bakery's own dashboard four ways.
                    */}
                    <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-a-meta text-a-muted">
                      <Load k="To answer" v={v.assigned} />
                      <Load k="Accepted" v={v.accepted} />
                      <Load k="Preparing" v={v.inPreparation} />
                      <Load k="Ready" v={v.ready} />
                    </span>
                  </span>

                  <span className="flex items-center gap-3">
                    <span className="text-right">
                      <span className="block font-a-sans text-a-item font-semibold tabular-nums text-a-ink">
                        {openTotal(v)}
                      </span>
                      <span className={aEyebrow}>Open</span>
                    </span>
                    <Icon
                      name="chevronRight"
                      size={15}
                      className="shrink-0 text-a-ghost"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── §4: the open order list, both machines side by side ─────────── */}
      <Card flush>
        <CardHead
          title="Open orders"
          note="Soonest due first. The window is what the customer was quoted."
        >
          <Link href="/admin/orders" className={aBtn("ghost", "sm")}>
            All orders
            <Icon name="chevronRight" size={13} />
          </Link>
        </CardHead>

        {due.length === 0 ? (
          <EmptyState
            icon="check"
            title="Nothing open."
            blurb="Every docket is finished or cancelled. The board is clear."
          />
        ) : (
          <ul className="flex flex-col">
            {due.slice(0, 8).map((d) => (
              <li key={d.ref} className="border-b border-a-line last:border-0">
                <Link
                  href={`/admin/orders/${d.ref}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-a-sunken sm:px-5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Ref className="font-medium text-a-ink">{d.ref}</Ref>
                      {/*
                        Both machines, never merged. The order badge is what the
                        customer's lifecycle is doing; the vendor badge is what
                        one bakery has actually done with the docket. §8 asks for
                        exactly this distinction and prisma/schema.prisma is
                        emphatic that folding them into one enum is the mistake.
                      */}
                      <OrderStatusBadge
                        status={d.status}
                        label={STATUS_LABEL[d.status]}
                      />
                      {d.vendorStatus ? (
                        <StatusBadge
                          label={VENDOR_STATUS_LABEL[d.vendorStatus]}
                          tone={VENDOR_STATUS_TONE[d.vendorStatus]}
                        />
                      ) : (
                        <StatusBadge label="No bakery" tone="plain" />
                      )}
                    </span>
                    <span className="text-a-meta text-a-muted">
                      {d.customerName ?? "No name taken"}
                      {d.customerPhone && ` · ${d.customerPhone}`}
                      {` · ${titleCase(d.deliverySlot)}`}
                      {` · ${d.vendorName ?? "Unassigned"}`}
                    </span>
                    {/* What the person who ordered it is reading right now, from
                        the one mapping — see lib/orders' `customerStatus`. */}
                    <span className="text-a-meta text-a-faint">
                      Customer sees:{" "}
                      {
                        customerStatus(d.status, d.deliverySlot === "pickup")
                          .label
                      }
                    </span>
                  </span>

                  <span className="flex items-center gap-4">
                    <DueLabel dueAt={d.due} now={now} status={d.status} />
                    <span className="font-a-mono text-a-small font-medium tabular-nums text-a-ink">
                      {/* The frozen total, read as stored. Nothing on this page
                          reprices a cake — see §19. */}
                      {formatINR(d.totalPaise)}
                    </span>
                    <Icon
                      name="chevronRight"
                      size={15}
                      className="shrink-0 text-a-ghost"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── §6: recent activity ───────────────────────────────────────── */}
        <Card flush>
          <CardHead
            title="Recent activity"
            note="Every docket move, as it was recorded."
          />
          {events.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No moves recorded yet."
              blurb={
                "This fills in as dockets are confirmed and sent out. Orders placed " +
                "before the portal started recording moves show only that they were placed."
              }
            />
          ) : (
            <ul className="flex flex-col">
              {events.map((e) => (
                <li key={e.id} className="border-b border-a-line last:border-0">
                  <Link
                    href={`/admin/orders/${e.order.ref}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-a-sunken sm:px-5"
                  >
                    <span className="min-w-0 text-a-small text-a-ink">
                      <Ref className="font-medium">{e.order.ref}</Ref>
                      <span className="text-a-muted">
                        {" → "}
                        {STATUS_LABEL[e.toStatus].toLowerCase()}
                      </span>
                      {e.actor?.name && (
                        <span className="text-a-muted"> · {e.actor.name}</span>
                      )}
                    </span>
                    <span className="font-a-mono text-a-meta text-a-muted">
                      {formatIST(e.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── just in ───────────────────────────────────────────────────── */}
        <Card flush>
          <CardHead title="Just in" note="The last six orders, newest first.">
            <Link href="/admin/orders" className={aBtn("ghost", "sm")}>
              All orders
              <Icon name="chevronRight" size={13} />
            </Link>
          </CardHead>
          {recent.length === 0 ? (
            <EmptyState
              icon="orders"
              title="No orders yet."
              blurb="The first order somebody places will land here."
            />
          ) : (
            <ul className="flex flex-col">
              {recent.map((o) => (
                <li
                  key={o.ref}
                  className="border-b border-a-line last:border-0"
                >
                  <Link
                    href={`/admin/orders/${o.ref}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-a-sunken sm:px-5"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Ref className="font-medium text-a-ink">{o.ref}</Ref>
                      <span className="text-a-meta text-a-muted">
                        {o.customerName ?? "—"}
                      </span>
                      <OrderStatusBadge
                        status={o.status}
                        label={STATUS_LABEL[o.status]}
                      />
                    </span>
                    <span className="font-a-mono text-a-small font-medium tabular-nums">
                      {formatINR(o.totalPaise)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── what people order ───────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Popular title="Sponges people order" rows={sponges} />
        <Popular title="Sizes people order" rows={sizes} />
      </div>
    </div>
  );
}

/**
 * One figure from today's delivery run.
 *
 * A zero is printed rather than hidden, for `Load`'s reason below: "Delivered 0"
 * at nine in the morning is a fact, and a strip whose cells come and go cannot be
 * read at a glance. Tone is used on exactly two of the six — the one that is good
 * news and the one that is not — because a row where every figure is coloured has
 * stopped colouring anything.
 */
function DayFigure({
  k,
  v,
  href,
  tone,
}: {
  k: string;
  v: number;
  href: string;
  tone?: "good" | "bad";
}) {
  const colour =
    v === 0
      ? "text-a-faint"
      : tone === "bad"
        ? "text-a-bad-ink"
        : tone === "good"
          ? "text-a-good-ink"
          : "text-a-ink";

  /* Spans inside the link rather than the `<dt>`/`<dd>` this reads like, and the
     grid above is a plain div rather than a `<dl>` for the same reason `Load`
     below gives: a definition list is flow content and cannot live inside an
     anchor's label. The pairing is carried by the wording, which is what a screen
     reader reads out either way. */
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 bg-a-surface px-4 py-3 transition-colors hover:bg-a-sunken"
    >
      <span className={aEyebrow}>{k}</span>
      <span
        className={`font-a-sans text-a-item font-semibold tabular-nums ${colour}`}
      >
        {v}
      </span>
    </Link>
  );
}

/**
 * One number in a bakery's workload, with what it means beside it.
 *
 * A zero is printed rather than hidden. "Preparing 0" is a fact somebody is
 * reading the row to learn, and a row whose columns move about depending on
 * which are non-zero cannot be scanned down a list of bakeries.
 *
 * Spans rather than the `<dt>`/`<dd>` this reads like, because the whole row is
 * one `<Link>` and a definition list is flow content that cannot live inside the
 * phrasing content of an anchor's label. The pairing is carried by the wording
 * instead, which is what a screen reader reads out either way.
 */
function Load({ k, v }: { k: string; v: number }) {
  return (
    <span className="flex gap-1.5">
      <span>{k}</span>
      <span
        className={`font-a-mono tabular-nums ${v > 0 ? "text-a-ink" : "text-a-faint"}`}
      >
        {v}
      </span>
    </span>
  );
}

/**
 * Counted over ninety days, and says so. A "most popular" with no window behind
 * it is a claim about all of history that quietly becomes a claim about
 * whenever the table was last emptied.
 */
function Popular({
  title,
  rows,
}: {
  title: string;
  rows: { value: string; n: bigint }[];
}) {
  const top = rows.filter((r) => r.value);
  const most = Number(top[0]?.n ?? 0);

  return (
    <Card flush>
      <CardHead title={title} note="Last 90 days, cancellations excluded." />
      {top.length === 0 ? (
        <EmptyState
          icon="info"
          title="No orders in that window."
          blurb="This fills in once there are orders from the last ninety days."
        />
      ) : (
        <ul className="flex flex-col px-4 py-2 sm:px-5">
          {top.map((r) => (
            <li key={r.value} className="flex items-center gap-3 py-2">
              <span className="w-36 shrink-0 truncate text-a-small font-medium text-a-ink">
                {titleCase(r.value)}
              </span>
              {/*
                A bar as wide as its share of the top row: the shape is readable
                without asking anybody to read an axis, which is the only kind of
                chart §6 allows on this page.
              */}
              <span
                aria-hidden="true"
                className="h-2 min-w-0 flex-1 rounded-full bg-a-idle-wash"
              >
                <span
                  className="block h-2 rounded-full bg-a-accent"
                  style={{ width: `${most ? (Number(r.n) / most) * 100 : 0}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right font-a-mono text-a-small tabular-nums text-a-muted">
                {Number(r.n)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
