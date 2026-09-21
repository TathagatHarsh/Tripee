import Link from "next/link";
import type { Metadata } from "next";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST, titleCase } from "@/lib/format";
import { dueAt, STATUS_LABEL } from "@/lib/orders";
import { FilterChips, SearchForm, type Chip } from "@/components/admin/Filters";
import { DueLabel } from "@/components/admin/OrderTimeline";
import {
  aBtn, aEyebrow, Card, DataTable, EmptyState, Notice, OrderStatusBadge, PageHeader,
  Ref, StatusBadge, Td, Th, Tr,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * Orders, for the office rather than the bench.
 *
 * /kitchen is deliberately not this page and this page is deliberately not
 * /kitchen. A shift needs one question answered — what do I make next — and
 * gets a board with big cards on it. An owner asks different questions: what
 * did we take this week, who was that customer on the phone, what did we quote
 * them. Same Order table, two readings of it, and §29 asks for exactly that
 * separation.
 *
 * Which is why nothing on this page moves a docket along: a list is for finding
 * the order, and the order's own page is where it is acted on. Both that page
 * and the kitchen board write through lib/orderTransition, behind lib/orders'
 * state machine — two surfaces asking one implementation, rather than a second
 * copy of the rules to drift.
 *
 * ## Every field the old list showed is still here
 *
 * §7 asks for a seven-column table and separately asks that no existing field
 * be removed, and those two pull against each other: the previous version of
 * this page was a stack of cards showing customer, phone, delivery, pincode,
 * serves, allergens and a collapsible list of the frozen price lines. Seven
 * columns cannot hold that.
 *
 * So the columns are §7's, and the fields with no column of their own are kept
 * as a second line inside the cell they belong to — the phone under the
 * customer, the pincode and lead time under the delivery — with the allergens
 * as a badge on the order itself, because "contains nuts" is the one of these
 * that is safety-critical and must not be a hover. The frozen price lines keep
 * their disclosure. Nothing was dropped; a few things moved a line down.
 *
 * ## The filters are URLs
 *
 * `?q=&status=&days=&slot=&due=` — every one a link, so a filtered view
 * survives a reload, can be sent to somebody, and is undone by the back button.
 * Two are new (`slot`, which §7 asks for, and `due`, which the dashboard's
 * overdue banner links into) and the three that existed keep their exact
 * spelling, so every bookmark still resolves.
 */

export const metadata: Metadata = {
  title: "Orders — Admin",
  robots: { index: false, follow: false },
};

const STATUSES: OrderStatus[] = [
  "draft", "confirmed", "in_kitchen", "out_for_delivery", "delivered", "cancelled",
];

/** How many rows one page of the book shows. */
const LIMIT = 100;

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; days?: string; slot?: string; due?: string }>;
}) {
  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Orders" />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const { q, status, days, slot, due } = await searchParams;

  const filter = STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : null;
  const window = days === "7" || days === "30" || days === "90" ? Number(days) : null;
  /*
   * The slot is shape-checked rather than passed through: an arbitrary string
   * here would be a `deliverySlot` equality test that silently matches nothing,
   * which reads as "no orders use express" rather than as a bad URL.
   */
  const slotFilter = slot && /^[a-z0-9-]{1,24}$/.test(slot) ? slot : null;
  const late = due === "late";

  /*
   * `new Date()` rather than `Date.now()`, which react-hooks/purity refuses
   * during render. The refusal is about a component that re-renders and must
   * give the same answer twice; this page is dynamic and runs once per request
   * on the server, where reading the clock is the entire point.
   */
  const now = new Date();

  const where: Prisma.OrderWhereInput = {};
  if (filter) where.status = filter;
  if (slotFilter) where.deliverySlot = slotFilter;
  if (window) {
    /* Computed from the request rather than stored, so "last 7 days" means seven
       days before this page load and not seven days before the server started. */
    where.createdAt = { gte: new Date(now.getTime() - window * 24 * 60 * 60 * 1000) };
  }
  if (q?.trim()) {
    const term = q.trim();
    /* The reference is what gets read down a phone line; name and phone are
       what somebody has when they do not have the reference. */
    where.OR = [
      { ref: { contains: term, mode: "insensitive" } },
      { customerName: { contains: term, mode: "insensitive" } },
      { customerPhone: { contains: term } },
    ];
  }
  if (late) {
    /*
     * Overdue cannot be a Prisma filter: the comparison is against
     * `createdAt + leadHours * interval`, per row, which the query builder
     * cannot express. So the SQL narrows to a set of ids and Prisma takes it
     * from there — one code path for the includes and the ordering instead of
     * hand-writing the whole query twice.
     *
     * Only open orders can be late. A cake delivered last Tuesday has no
     * window left to miss, and listing it as overdue is a red row nobody can
     * act on.
     */
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order"
      WHERE status IN ('draft', 'confirmed', 'in_kitchen', 'out_for_delivery')
        AND COALESCE("dueAt", "requestedFor", COALESCE("confirmedAt", "createdAt") + ("leadHours" * interval '1 hour')) < ${now}
      LIMIT ${LIMIT}`;
    where.id = { in: rows.map((r) => r.id) };
  }

  const [orders, open, statusCounts, slots] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { items: { orderBy: { position: "asc" } } },
    }),
    db.order.count({ where: { status: { in: ["draft", "confirmed", "in_kitchen"] } } }),
    /* Counts on the chips, and they are counts of the whole book rather than of
       the filtered page — a chip reading "Confirmed (0)" because the current
       search excluded them all would be a lie about the table. */
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.groupBy({ by: ["deliverySlot"], _count: { _all: true } }),
  ]);

  const counts: Partial<Record<OrderStatus, number>> = {};
  for (const g of statusCounts) counts[g.status] = g._count._all;

  const taken = orders.reduce(
    (sum, o) => (o.status === "cancelled" ? sum : sum + o.totalPaise),
    0,
  );

  /** A URL with one or more filters changed and the rest kept. */
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q,
      status: filter ?? undefined,
      days: window?.toString(),
      slot: slotFilter ?? undefined,
      due: late ? "late" : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  const statusChips: Chip[] = [
    {
      label: "All statuses",
      href: qs({ status: undefined, due: undefined }),
      active: !filter && !late,
    },
    ...STATUSES.map((s) => ({
      label: STATUS_LABEL[s],
      href: qs({ status: s, due: undefined }),
      active: filter === s,
      count: counts[s] ?? 0,
    })),
    { label: "Past its window", href: qs({ due: "late", status: undefined }), active: late },
  ];

  const dateChips: Chip[] = [
    { label: "Any date", href: qs({ days: undefined }), active: !window },
    { label: "Last 7 days", href: qs({ days: "7" }), active: window === 7 },
    { label: "Last 30 days", href: qs({ days: "30" }), active: window === 30 },
    { label: "Last 90 days", href: qs({ days: "90" }), active: window === 90 },
  ];

  const slotChips: Chip[] = [
    { label: "Any delivery", href: qs({ slot: undefined }), active: !slotFilter },
    ...slots
      .slice()
      .sort((a, b) => b._count._all - a._count._all)
      .map((s) => ({
        label: titleCase(s.deliverySlot),
        href: qs({ slot: s.deliverySlot }),
        active: slotFilter === s.deliverySlot,
        count: s._count._all,
      })),
  ];

  const filtered = Boolean(q?.trim() || filter || window || slotFilter || late);

  return (
    <div className="flex flex-col gap-5">
      {/*
        No kitchen-board button. §3 moved the bench work off the owner's screens
        — see the note on app/admin/page.tsx — and the paragraph at the foot of
        this page still links to the board in the one place it is genuinely the
        answer, which is "I want the whole day at once".
      */}
      <PageHeader title="Orders" blurb="Manage all customer orders and their current status." />

      <div className="flex flex-col gap-3">
        <SearchForm
          action="/admin/orders"
          value={q ?? ""}
          label="Search orders by reference, name or phone number"
          placeholder="MC-4471, a name, or a phone number"
          keep={{
            status: filter ?? undefined,
            days: window?.toString(),
            slot: slotFilter ?? undefined,
            due: late ? "late" : undefined,
          }}
        />

        <FilterChips label="Filter by status" chips={statusChips} />
        <div className="flex flex-col gap-2 lg:flex-row lg:gap-6">
          <FilterChips label="Filter by date" chips={dateChips} />
          <FilterChips label="Filter by delivery" chips={slotChips} />
        </div>
      </div>

      {/* The count line, which is the one thing a filtered table has to say
          about itself: how much of the book you are looking at. */}
      <p className="text-a-small text-a-muted">
        <span className="font-semibold text-a-ink">{orders.length}</span>
        {orders.length === LIMIT ? ` of the most recent ${LIMIT}` : ""} shown
        {" · "}
        <span className="font-semibold text-a-ink">{open}</span> still open in the book
        {" · "}
        <span className="font-a-mono font-semibold tabular-nums text-a-ink">
          {formatINR(taken)}
        </span>
        {" on this page, cancellations excluded"}
      </p>

      <Card flush>
        {orders.length === 0 ? (
          filtered ? (
            <EmptyState
              icon="search"
              title="No orders match those filters."
              blurb="Try a shorter search, a wider date range, or clear the filters to see the whole book."
            >
              <Link href="/admin/orders" className={aBtn("secondary", "md")}>
                Clear all filters
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon="orders"
              title="No orders yet."
              blurb="When somebody builds a cake and places an order, it lands here."
            >
              <Link href="/build" className={aBtn("secondary", "md")}>
                Open the cake builder
              </Link>
            </EmptyState>
          )
        ) : (
          <>
            {/* ── desktop: the table §7 asks for ─────────────────────────── */}
            <div className="hidden md:block">
              <DataTable
                caption="Customer orders, newest first"
                minWidth="62rem"
                head={
                  <>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th>Delivery</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Created</Th>
                    <Th align="right"><span className="sr-only">Actions</span></Th>
                  </>
                }
              >
                {orders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <Link
                        href={`/admin/orders/${o.ref}`}
                        className="font-a-mono text-a-small font-semibold tracking-[0.03em] text-a-ink underline decoration-transparent underline-offset-2 transition-colors hover:decoration-a-accent"
                      >
                        {o.ref}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-a-meta text-a-muted">
                          Serves {o.servesMin}–{o.servesMax}
                        </span>
                        {/*
                          Allergens get a badge rather than a second line of grey
                          text. This is the one field on the row that is
                          safety-critical, and an owner scanning for "does this
                          one have nuts in it" should not have to read for it.
                        */}
                        {o.allergens.length > 0 && (
                          <StatusBadge
                            tone="warn"
                            dot={false}
                            label={o.allergens.join(", ")}
                            className="max-w-[12rem] truncate"
                          />
                        )}
                      </span>
                    </Td>

                    <Td>
                      <span className="block max-w-[12rem] truncate font-medium text-a-ink">
                        {o.customerName ?? "No name taken"}
                      </span>
                      <Ref className="mt-0.5 block text-a-meta text-a-muted">
                        {o.customerPhone ?? "No number"}
                      </Ref>
                    </Td>

                    <Td>
                      <OrderStatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                    </Td>

                    <Td>
                      <span className="block font-medium text-a-ink">
                        {titleCase(o.deliverySlot)}
                      </span>
                      <span className="mt-0.5 block text-a-meta text-a-muted">
                        {o.pincode ? `${o.pincode} · ` : ""}
                        {o.leadHours}h lead
                      </span>
                      <DueLabel dueAt={dueAt(o)} now={now} status={o.status} />
                    </Td>

                    <Td align="right">
                      <span className="font-a-mono text-a-small font-semibold tabular-nums">
                        {formatINR(o.totalPaise)}
                      </span>
                      {/*
                        The frozen lines, straight off OrderItem — not a fresh
                        priceCake of the config. This is the number the customer
                        agreed to and it must not move when the catalogue does.
                        A <details> so it needs no JavaScript.
                      */}
                      <details className="mt-0.5 text-left">
                        <summary className="cursor-pointer list-none text-right text-a-meta text-a-muted underline decoration-dotted underline-offset-2 hover:text-a-ink [&::-webkit-details-marker]:hidden">
                          {o.items.length} {o.items.length === 1 ? "line" : "lines"}
                        </summary>
                        <div className="mt-1.5 rounded-a-sm border border-a-line bg-a-sunken p-2">
                          <ul className="flex flex-col gap-1">
                            {o.items.map((it) => (
                              <li
                                key={it.id}
                                className="flex items-baseline justify-between gap-3 text-a-meta"
                              >
                                <span className="min-w-0 truncate text-a-muted">{it.label}</span>
                                <span className="shrink-0 font-a-mono tabular-nums">
                                  {formatINR(it.amountPaise)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1.5 border-t border-a-line pt-1.5 text-a-meta leading-snug text-a-faint">
                            Quoted {formatIST(o.createdAt)}. Later price changes do not
                            touch this.
                          </p>
                        </div>
                      </details>
                    </Td>

                    <Td align="right">
                      <span className="font-a-mono text-a-meta text-a-muted">
                        {formatIST(o.createdAt)}
                      </span>
                    </Td>

                    <Td align="right">
                      <Link href={`/admin/orders/${o.ref}`} className={aBtn("ghost", "sm")}>
                        View
                        <Icon name="chevronRight" size={13} />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </div>

            {/* ── mobile: stacked cards, §7's other half ──────────────────── */}
            <ul className="flex flex-col md:hidden">
              {orders.map((o) => (
                <li key={o.id} className="border-b border-a-line last:border-0">
                  <Link
                    href={`/admin/orders/${o.ref}`}
                    className="flex flex-col gap-2.5 p-3.5 transition-colors active:bg-a-sunken"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <Ref className="text-a-item font-semibold text-a-ink">{o.ref}</Ref>
                      <span className="font-a-mono text-a-item font-semibold tabular-nums">
                        {formatINR(o.totalPaise)}
                      </span>
                    </span>

                    <span className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                      {o.allergens.length > 0 && (
                        <StatusBadge tone="warn" dot={false} label={o.allergens.join(", ")} />
                      )}
                    </span>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-a-meta">
                      <Field k="Customer" v={o.customerName ?? "No name taken"} />
                      <Field k="Phone" v={o.customerPhone ?? "No number"} mono />
                      <Field k="Delivery" v={`${titleCase(o.deliverySlot)} · ${o.leadHours}h`} />
                      <Field k="Pincode" v={o.pincode ?? "Not set"} mono />
                      <Field k="Serves" v={`${o.servesMin}–${o.servesMax}`} />
                      <Field k="Created" v={formatIST(o.createdAt)} mono />
                    </dl>

                    <span className="flex items-center justify-between gap-2 border-t border-a-line pt-2">
                      <DueLabel dueAt={dueAt(o)} now={now} status={o.status} />
                      <span className="flex items-center gap-1 text-a-meta font-medium text-a-accent-ink">
                        View order
                        <Icon name="chevronRight" size={13} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="max-w-3xl text-a-small leading-relaxed text-a-muted">
        Open a reference to read the whole order — what was agreed, how it got to
        where it is, and the moves it can still make. For the whole day at once
        there is the{" "}
        <Link href="/kitchen" className="font-medium text-a-accent-ink underline">
          kitchen board
        </Link>
        . Both move a docket by the same rules, from the same state machine,
        through the same function that records the move.
      </p>
    </div>
  );
}

function Field({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={aEyebrow}>{k}</dt>
      <dd className={`mt-0.5 truncate text-a-ink ${mono ? "font-a-mono tabular-nums" : ""}`}>
        {v}
      </dd>
    </div>
  );
}
