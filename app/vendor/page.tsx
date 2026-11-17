import { AssignmentRefresh } from "@/components/assignment/Refresh";
import Link from "next/link";
import { requireVendorSetup } from "@/lib/auth";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { dueAt } from "@/lib/orders";
import { dueUrgency, VENDOR_COLUMNS, VENDOR_SENT_OUT_COLUMN } from "@/lib/vendors";
import { Notice, StatCard } from "@/components/admin/ui";
import { vendorBoard, vendorSetup, pausedRows } from "./data";
import { ChecklistCard } from "@/components/vendor/ChecklistCard";
import { StatusSwitch } from "@/components/vendor/StatusSwitch";
import { LiveNote } from "@/components/vendor/LiveNote";
import { ResumeButton } from "@/components/vendor/ResumeButton";
import { OrderTicket } from "./OrderTicket";
import { filterQueue, QueueFilters, type QueueQuery } from "./QueueFilters";
export const dynamic = "force-dynamic";
export default async function KitchenBoard({
  searchParams,
}: {
  searchParams: Promise<QueueQuery>;
}) {
  const { vendor } = await requireVendorSetup();
  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;
  if (!vendor.isActive) {
    const { steps, stage } = await vendorSetup(vendor.id);
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <h1 className="font-a-sans text-a-title font-bold text-a-ink">Welcome, {vendor.name}</h1>
        <ChecklistCard steps={steps} stage={stage} />
        <StatusSwitch vendorId={vendor.id} accepting="closed" active={false} />
      </div>
    );
  }
  const [all, query, paused] = await Promise.all([
    vendorBoard(vendor.id),
    searchParams,
    pausedRows(vendor.id),
  ]);
  const now = new Date();
  const board = filterQueue(all, query, now);
  const waiting = all.filter((c) => c.status === "assigned").length;
  const urgent = all.filter(
    (c) => dueUrgency(dueAt(c.order), now) !== "later",
  ).length;
  return (
    <div className="flex flex-col gap-6"><AssignmentRefresh/>
      <LiveNote vendorId={vendor.id} />
      <StatusSwitch vendorId={vendor.id} accepting={!vendor.isAcceptingOrders ? "closed" : vendor.isBusy ? "busy" : "accepting"} active />
      {!vendor.locationSetAt && (
        <Notice tone="warn">
          Set your bakery location to start getting orders.{" "}
          <Link href="/vendor/profile#location" className="font-semibold underline">Set location</Link>
        </Notice>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-a-meta font-semibold uppercase tracking-[.14em] text-a-accent-ink">
            MakeYourCakes · Fulfilment studio
          </span>
          <h1 className="mt-2 font-a-sans text-a-title font-bold text-a-ink">
            A good day in the kitchen.
          </h1>
          <p className="mt-2 text-a-body text-a-muted">
            {waiting
              ? `${waiting} new ${waiting === 1 ? "order needs" : "orders need"} your attention.`
              : "Every detail ready. Every next step clear."}
          </p>
        </div>
        <Link
          href="/vendor/orders"
          className="inline-flex min-h-11 items-center text-a-body font-semibold text-a-accent-ink"
        >
          Order history ↗
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="New orders"
          value={String(waiting)}
          note="Waiting for your response"
        />
        <StatCard
          label="In preparation"
          value={String(
            all.filter((c) => c.status === "in_preparation").length,
          )}
          note="On the baking bench"
        />
        <StatCard
          label="Ready"
          value={String(all.filter((c) => c.status === "ready").length)}
          note="Prepared for handover"
        />
        <StatCard
          label="Time sensitive"
          value={String(urgent)}
          note="Due soon or overdue"
        />
      </div>
      <h2 className="font-a-sans text-a-lede font-bold text-a-ink">Today</h2>
      <QueueFilters query={query} />
      <p className="text-a-small text-a-muted">
        Showing {board.length} of {all.length} active orders · sorted by due
        time
      </p>
      {board.length === 0 ? (
        <div className="rounded-a border border-dashed border-a-line-strong bg-a-surface px-6 py-10 text-center">
          <h2 className="text-a-lede font-semibold">
            {all.length
              ? "No orders match these filters."
              : "You’re all caught up."}
          </h2>
          <p className="mt-2 text-a-body text-a-muted">
            {all.length
              ? "Change a filter to see more of your queue."
              : "New assignments will appear here with the details you need."}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {[...VENDOR_COLUMNS, VENDOR_SENT_OUT_COLUMN].map((column) => {
            const cards = board.filter((c) => c.status === column.status);
            return (
              <section
                key={column.status}
                aria-labelledby={`queue-${column.status}`}
                className="flex flex-col gap-3"
              >
                <div
                  className={`border-b-2 pb-4 ${column.status === "assigned" ? "border-a-accent" : "border-a-line-strong"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      id={`queue-${column.status}`}
                      className="text-a-lede font-bold"
                    >
                      {column.label}
                    </h2>
                    <span className="grid size-7 place-items-center rounded-full bg-a-surface text-a-small font-semibold">
                      {cards.length}
                    </span>
                  </div>
                  <p className="mt-1 text-a-meta text-a-muted">{column.note}</p>
                </div>
                {cards.length ? (
                  cards.map((card) => <OrderTicket key={card.id} card={card} />)
                ) : (
                  <p className="rounded-a border border-dashed border-a-line p-6 text-center text-a-small text-a-muted">
                    {column.empty}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {paused.length > 0 && (
        <section aria-labelledby="paused-title" className="rounded-a border border-a-line bg-a-surface p-4 shadow-a-card sm:p-5">
          <h2 id="paused-title" className="font-a-sans text-a-lede font-bold text-a-ink">Paused right now</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {paused.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-a border border-a-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-a-body font-medium text-a-ink">{row.productName} · {row.sizeBand} · {row.eggType}</p>
                  <p className="text-a-meta text-a-muted">Back {row.pausedUntil!.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                </div>
                <ResumeButton vendorId={vendor.id} id={row.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
