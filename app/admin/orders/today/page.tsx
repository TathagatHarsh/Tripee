import Link from "next/link";
import type { Metadata } from "next";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatIST, titleCase } from "@/lib/format";
import { customerStatus, STATUS_LABEL } from "@/lib/orders";
import {
  ATTENTION_LABEL, ATTENTION_TONE, DELIVERY_DAY_LABEL, DELIVERY_STATE_LABEL,
  isCakeReady, type DeliveryDay, type DeliveryState,
} from "@/lib/ops";
import { VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE } from "@/lib/vendors";
import { FilterChips, type Chip } from "@/components/admin/Filters";
import { DueLabel } from "@/components/admin/OrderTimeline";
import {
  aBtn, Card, CardHead, EmptyState, Notice, OrderStatusBadge, PageHeader,
  Ref, StatCard, StatusBadge,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { deliverySnapshot } from "../../data";

/**
 * The delivery board: what has to leave the building, by day and by slot.
 *
 * The dashboard answers "what is happening"; this answers the narrower question
 * somebody asks with a van outside — what is going out, in what order, is it
 * ready, and who is making it. So it is every delivery due on one **IST day**,
 * grouped and filterable, rather than the eight most urgent.
 *
 * ## The route keeps its name
 *
 * `/admin/orders/today` is where this has always lived and it still opens on
 * today, so no bookmark and no link breaks. It grew a day filter rather than a
 * new address, because `/admin/delivery` is already taken by the page that edits
 * slots, zones and lead times — a second route differing from it by one letter
 * would be a genuinely confusing pair, and lib/adminNav is explicit that routes
 * here are reused rather than restructured.
 *
 * ## Why the grouping is by slot and not by morning/afternoon/evening
 *
 * §9 suggests times of day and also says, in the same breath, to use the
 * existing delivery-slot model and not invent a new one. Those pull apart here,
 * because this product's slots are **service levels rather than hours**:
 * `standard`, `same-day`, `express-4hr`, `midnight`, `pickup` — see
 * lib/schema.ts's `DeliverySlot`. There is no stored hour-of-day to group by at
 * all; what a customer was promised is a window of words on a CatalogOption
 * (`slotWindow`) plus the lead time frozen onto the order.
 *
 * Sorting those five into MORNING / AFTERNOON / EVENING would mean inventing a
 * mapping the database does not hold — deciding that `express-4hr` is a morning
 * thing when it is four hours from whenever the order was taken. That is exactly
 * the invention the same paragraph forbids, and it would be wrong twice a day.
 *
 * So the groups are the slots themselves, ordered by urgency, and within each
 * group the orders are soonest-due first. `midnight` and `pickup` are genuinely
 * different operations from a delivery run, which is the other reason this reads
 * better than three invented buckets.
 *
 * ## Nothing here writes
 *
 * A row links to /admin/orders/[ref], which is the one place an order is acted
 * on. §4 is explicit that there must not be a second order-detail
 * implementation, and a day view with its own buttons would be the start of one.
 * Every delivery transition in the product still goes through
 * lib/orderTransition, from that page or the kitchen board.
 *
 * ## Every filter is a URL
 *
 * `?day=&state=&vendor=&slot=` — so a filtered board survives a reload, can be
 * sent to somebody, and is undone by the back button. The same decision
 * /admin/orders made, for the same reasons; see components/admin/Filters.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deliveries — Admin — MakeYourCakes",
  robots: { index: false, follow: false },
};

/**
 * The slots, most urgent first, with what each one actually means to whoever is
 * reading the list. Ordered by hand rather than alphabetically: this is the
 * sequence a day is worked in, and `pickup` is last because nobody drives it.
 *
 * Every value of lib/schema's `DeliverySlot` appears. A slot added to that enum
 * without a line here still renders — see the grouping below, which falls back
 * to whatever the column actually says rather than dropping the order.
 */
const SLOT_ORDER: { slot: string; note: string }[] = [
  { slot: "express-4hr", note: "Four hours from when the order was taken." },
  { slot: "same-day", note: "Out today." },
  { slot: "midnight", note: "Late drop. Goes out after the rest of the day is done." },
  { slot: "standard", note: "The ordinary run." },
  { slot: "pickup", note: "Collected from the counter. Nothing is driven anywhere." },
];

const DAYS: DeliveryDay[] = ["today", "tomorrow", "upcoming", "past"];

const STATES: DeliveryState[] = [
  "all", "ready", "not_ready", "out_for_delivery", "delivered", "attention",
];

/** What each day's board is for, under its heading. */
const DAY_BLURB: Record<DeliveryDay, string> = {
  today: "Everything due today, by slot.",
  tomorrow: "What has to be made and ready by tomorrow.",
  upcoming: "Due from the day after tomorrow onwards, soonest first.",
  past: "Days that have gone, most recent first. Anything here that is not delivered is a phone call.",
};

export default async function DeliveryBoard({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; state?: string; vendor?: string; slot?: string }>;
}) {
  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Deliveries" back={{ href: "/admin", label: "Back to dashboard" }} />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const sp = await searchParams;

  /*
   * Every parameter is checked against a closed list rather than passed through.
   * An arbitrary string would become an equality test that silently matches
   * nothing, which reads on screen as "no deliveries tomorrow" rather than as a
   * bad URL. The vendor id is the one free-form value, and it is only ever
   * compared against ids this page read back itself — nothing is queried by it.
   */
  const day: DeliveryDay = DAYS.includes(sp.day as DeliveryDay)
    ? (sp.day as DeliveryDay)
    : "today";
  const state: DeliveryState = STATES.includes(sp.state as DeliveryState)
    ? (sp.state as DeliveryState)
    : "all";
  const slot = sp.slot && /^[a-z0-9-]{1,24}$/.test(sp.slot) ? sp.slot : null;
  const vendor = sp.vendor && /^[a-z0-9-]{1,40}$/i.test(sp.vendor) ? sp.vendor : null;

  /* One instant for the whole page, so "due today" and "past its window" cannot
     be computed against two different clocks — see app/admin/data.ts. */
  const now = new Date();
  const board = await deliverySnapshot(now, { day, state, vendor, slot });
  const { counts } = board;

  /** A URL with one filter changed and the rest kept. */
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      day,
      state: state === "all" ? undefined : state,
      vendor: vendor ?? undefined,
      slot: slot ?? undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/orders/today?${s}` : "/admin/orders/today";
  };

  const dayChips: Chip[] = DAYS.map((d) => ({
    label: DELIVERY_DAY_LABEL[d],
    /* Changing the day drops the vendor and the slot, which belong to the day
       that was on screen: carrying "Sweet Crust" into tomorrow, where they have
       nothing, shows an empty board and blames the wrong thing. The state is a
       question about any day, so it is kept. */
    href: qs({ day: d, vendor: undefined, slot: undefined }),
    active: day === d,
  }));

  const stateChips: Chip[] = STATES.map((s) => ({
    label: DELIVERY_STATE_LABEL[s],
    href: qs({ state: s === "all" ? undefined : s }),
    active: state === s,
    count:
      s === "all" ? counts.total
      : s === "ready" ? counts.ready
      : s === "not_ready" ? counts.notReady
      : s === "out_for_delivery" ? counts.outForDelivery
      : s === "delivered" ? counts.delivered
      : counts.attention,
  }));

  const vendorChips: Chip[] = [
    { label: "Any bakery", href: qs({ vendor: undefined }), active: !vendor },
    ...board.vendors.map((v) => ({
      label: v.name,
      href: qs({ vendor: v.id }),
      active: vendor === v.id,
      count: v.n,
    })),
    /* Only offered when there is one. A permanent "No bakery (0)" chip is a
       filter for a state that does not exist today. */
    ...(board.unassigned > 0
      ? [{
          label: "No bakery",
          href: qs({ vendor: "none" }),
          active: vendor === "none",
          count: board.unassigned,
        }]
      : []),
  ];

  const slotChips: Chip[] = [
    { label: "Any slot", href: qs({ slot: undefined }), active: !slot },
    ...board.slots.map((s) => ({
      label: titleCase(s.slot),
      href: qs({ slot: s.slot }),
      active: slot === s.slot,
      count: s.n,
    })),
  ];

  /*
   * Grouped in the order above, then anything whose slot this build does not
   * know about, so a value added to the enum shows up at the bottom rather than
   * silently vanishing off the delivery run.
   */
  const known = new Set(SLOT_ORDER.map((s) => s.slot));
  const groups = [
    ...SLOT_ORDER.map((s) => ({
      ...s,
      rows: board.rows.filter((r) => r.deliverySlot === s.slot),
    })),
    ...[...new Set(board.rows.filter((r) => !known.has(r.deliverySlot)).map((r) => r.deliverySlot))]
      .map((value) => ({
        slot: value,
        note: "Not a slot this build knows about.",
        rows: board.rows.filter((r) => r.deliverySlot === value),
      })),
  ].filter((g) => g.rows.length > 0);

  const filtered = state !== "all" || vendor !== null || slot !== null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Deliveries"
        blurb={`${DAY_BLURB[day]} ${formatIST(now)}.`}
        back={{ href: "/admin", label: "Back to dashboard" }}
      >
        <Link href="/admin/orders" className={aBtn("secondary", "md")}>
          All orders
          <Icon name="arrowRight" size={16} />
        </Link>
      </PageHeader>

      <FilterChips label="Filter by delivery day" chips={dayChips} />

      {/* ── §12: the day at a glance ────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`${DELIVERY_DAY_LABEL[day]} — deliveries`}
          value={String(counts.total)}
          note={counts.total === 0 ? "Nothing due" : `${counts.preparing} being made now`}
          icon="delivery"
        />
        <StatCard
          label="Ready to go"
          value={String(counts.ready)}
          note="Baked and waiting. Not out yet."
          tone={counts.ready > 0 ? "good" : "plain"}
          icon="check"
          href={counts.ready > 0 ? qs({ state: "ready" }) : undefined}
        />
        <StatCard
          label="Out for delivery"
          value={String(counts.outForDelivery)}
          note={`${counts.delivered} delivered`}
          tone={counts.outForDelivery > 0 ? "accent" : "plain"}
          icon="delivery"
          href={counts.outForDelivery > 0 ? qs({ state: "out_for_delivery" }) : undefined}
        />
        <StatCard
          label="Needs attention"
          value={String(counts.attention)}
          note={
            counts.attention === 0
              ? "Nothing late, unassigned or waiting on a bakery"
              : "Late, unassigned, or waiting on a bakery"
          }
          tone={counts.attention > 0 ? "bad" : "good"}
          icon="clock"
          href={counts.attention > 0 ? qs({ state: "attention" }) : undefined}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <FilterChips label="Filter by delivery state" chips={stateChips} />
        <div className="flex flex-col gap-2 lg:flex-row lg:gap-6">
          <FilterChips label="Filter by bakery" chips={vendorChips} />
          <FilterChips label="Filter by slot" chips={slotChips} />
        </div>
      </div>

      <p className="text-a-small text-a-muted">
        <span className="font-semibold text-a-ink">{board.rows.length}</span>
        {filtered ? ` of ${counts.total} shown` : " shown"}
        {" · "}
        {/* Excluded in the query itself, not hidden here — see app/admin/data.ts.
            §26: a cancelled cake is never an active delivery. */}
        cancelled orders are not deliveries and never appear on this board
      </p>

      {board.rows.length === 0 ? (
        <Card flush>
          {filtered ? (
            <EmptyState
              icon="search"
              title="Nothing matches those filters."
              blurb={
                `${counts.total} ${counts.total === 1 ? "delivery is" : "deliveries are"} `
                + `due ${DELIVERY_DAY_LABEL[day].toLowerCase()}. Clear the filters to see them.`
              }
            >
              <Link
                href={qs({ state: undefined, vendor: undefined, slot: undefined })}
                className={aBtn("secondary", "md")}
              >
                Clear filters
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon="delivery"
              title={`Nothing due ${DELIVERY_DAY_LABEL[day].toLowerCase()}.`}
              blurb={
                "No order's promised window falls in this range. Due is when the "
                + "order was placed plus the lead time frozen onto it — nothing here "
                + "re-estimates it."
              }
            >
              <Link href="/admin/orders" className={aBtn("secondary", "md")}>
                Browse all orders
              </Link>
            </EmptyState>
          )}
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.slot} flush>
            <CardHead
              title={titleCase(g.slot)}
              note={`${g.note} ${g.rows.length} ${g.rows.length === 1 ? "order" : "orders"}.`}
            />
            <ul className="flex flex-col">
              {g.rows.map((d) => (
                <li key={d.ref} className="border-b border-a-line last:border-0">
                  <Link
                    href={`/admin/orders/${d.ref}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-a-sunken sm:px-5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Ref className="font-medium text-a-ink">{d.ref}</Ref>
                        {/* Both machines, never merged — §8. The order badge is
                            the customer's lifecycle; the vendor badge is what one
                            bakery has actually done with the docket. */}
                        <OrderStatusBadge status={d.status} label={STATUS_LABEL[d.status]} />
                        {d.vendorStatus ? (
                          <StatusBadge
                            label={VENDOR_STATUS_LABEL[d.vendorStatus]}
                            tone={VENDOR_STATUS_TONE[d.vendorStatus]}
                          />
                        ) : (
                          <StatusBadge label="No bakery" tone="plain" />
                        )}
                        {/*
                          The one thing somebody loading a van is scanning for,
                          said in words and not only in colour — §10. A different
                          claim from either badge above: "Ready" is the cake
                          existing, which only the vendor machine knows, and it is
                          worth saying only while the order has not gone out.
                        */}
                        {d.status !== "out_for_delivery" && d.status !== "delivered" && (
                          <StatusBadge
                            label={isCakeReady(d.vendorStatus) ? "Ready" : "Not ready"}
                            tone={isCakeReady(d.vendorStatus) ? "good" : "warn"}
                          />
                        )}
                        {d.attention.map((r) => (
                          <StatusBadge
                            key={r}
                            label={ATTENTION_LABEL[r]}
                            tone={ATTENTION_TONE[r]}
                          />
                        ))}
                      </span>
                      <span className="text-a-meta text-a-muted">
                        {d.customerName ?? "No name taken"}
                        {d.customerPhone && ` · ${d.customerPhone}`}
                        {/* The whole of the destination this database holds. The
                            street address is taken on the confirmation call and is
                            not a column — see components/orders/DeliveryInfo. */}
                        {d.pincode && ` · ${d.pincode}`}
                        {` · ${d.vendorName ?? "Unassigned"}`}
                      </span>
                      <span className="text-a-meta text-a-faint">
                        Customer sees:{" "}
                        {customerStatus(d.status, d.deliverySlot === "pickup").label}
                      </span>
                    </span>

                    <span className="flex items-center gap-4">
                      <DueLabel dueAt={d.due} now={now} status={d.status} />
                      <Icon name="chevronRight" size={15} className="shrink-0 text-a-ghost" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      {/* Not `aEyebrow` on the sentence: that sets `uppercase`, and overriding one
          Tailwind text-transform utility with another depends on stylesheet order
          rather than class order. A sentence wants sentence case reliably. */}
      <p className="max-w-3xl text-a-meta leading-relaxed text-a-muted">
        <strong className="font-semibold text-a-ink">Due</strong> is the window the
        customer was quoted — when the order was placed plus the lead time frozen
        onto it. Days are Hyderabad days, not the server&rsquo;s. Nothing on this
        page moves an order: open a reference to send it out or mark it delivered,
        and a bakery marks its own cake ready and handed over from their side.
      </p>
    </div>
  );
}
