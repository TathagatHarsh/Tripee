import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST, titleCase } from "@/lib/format";
import { isClosed, STATUS_LABEL } from "@/lib/orders";
import { eyebrow } from "@/lib/ui";

/**
 * What is happening in the bakery today.
 *
 * Deliberately short. Every number here is one somebody acts on before lunch —
 * what came in, what is late, what to make next — and nothing is here because
 * it charts nicely. There are no graphs: at a few dozen orders a week a
 * sparkline is decoration pretending to be information, and the day a real
 * trend exists it will deserve a real chart rather than one drawn in advance.
 *
 * Two honesty rules this page follows.
 *
 * It says "taken", never "revenue". Nothing is paid online — Order.paymentStatus
 * is `none` on every row in the product — so these totals are the value of
 * orders accepted, not money received, and calling them revenue would put a
 * figure on a dashboard that no bank statement agrees with.
 *
 * And "due" is derived, not stored. There is no delivery timestamp on an order;
 * there is a slot and the lead time that slot promised, so due = placed + lead.
 * That is the arithmetic the customer was quoted, which makes it the right one
 * to be judged against.
 */

export const dynamic = "force-dynamic";

/** IST has no daylight saving, so the offset is a constant and this is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function startOfISTDay(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

const OPEN: OrderStatus[] = ["draft", "confirmed", "in_kitchen", "out_for_delivery"];

export default async function Dashboard() {
  if (!hasDatabase()) {
    return (
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const now = new Date();
  const dayStart = startOfISTDay(now);
  const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const quarterStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const notCancelled = { status: { not: "cancelled" as const } };

  const [today, week, byStatus, openOrders, recent, sponges, sizes] = await Promise.all([
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
    db.order.findMany({
      where: { status: { in: OPEN } },
      select: { ref: true, status: true, createdAt: true, leadHours: true, customerName: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { ref: true, status: true, createdAt: true, totalPaise: true, customerName: true },
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
  ]);

  const counts: Partial<Record<OrderStatus, number>> = {};
  for (const g of byStatus) counts[g.status] = g._count._all;

  const due = openOrders
    .map((o) => ({ ...o, dueAt: new Date(o.createdAt.getTime() + o.leadHours * 3600_000) }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const overdue = due.filter((d) => d.dueAt < now);

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-col gap-3">
        <span className={eyebrow}>Today</span>
        <h1 className="text-heading">{formatIST(now).replace(/ \d\d:\d\d IST$/, "")}</h1>
      </header>

      <section className="flex flex-col gap-2">
        <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Orders today" value={String(today._count._all)} />
          <Figure label="Taken today" value={formatINR(today._sum.totalPaise ?? 0)} />
          <Figure label="Orders this week" value={String(week._count._all)} />
          <Figure
            label="Average order, this week"
            value={week._avg.totalPaise ? formatINR(Math.round(week._avg.totalPaise)) : "—"}
          />
        </div>
        <p className="font-sans text-meta leading-relaxed text-steel">
          Taken is the value of orders accepted, not money received — nothing is
          paid on the site, so the kitchen still rings to confirm.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-item">On the board</h2>
        <ul className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {OPEN.map((s) => (
            <li key={s} className="bg-paper">
              <Link href={`/admin/orders?status=${s}`} className="group flex flex-col gap-1 px-4 py-3.5">
                <span className="font-mono text-micro uppercase tracking-[0.1em] text-steel group-hover:text-ink">
                  {STATUS_LABEL[s]}
                </span>
                <span className="font-mono text-title tabular-nums">{counts[s] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-item">Due next</h2>
          <p className="font-mono text-micro text-steel">
            Placed, plus the lead time that slot promised
          </p>
        </div>

        {overdue.length > 0 && (
          <p
            role="alert"
            className="border border-seal/40 bg-seal-tint px-3.5 py-2.5 font-mono text-meta leading-snug"
          >
            {overdue.length === 1
              ? "One order is past the window it was quoted."
              : `${overdue.length} orders are past the window they were quoted.`}{" "}
            That is a phone call, not a status change.
          </p>
        )}

        {due.length === 0 ? (
          <p className="border border-rule bg-paper px-4 py-3.5 text-body text-steel">
            Nothing open. Every docket is finished or cancelled.
          </p>
        ) : (
          <ul className="border border-rule bg-paper">
            {due.slice(0, 8).map((d) => (
              <li
                key={d.ref}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 last:border-0"
              >
                <span className="flex flex-wrap items-baseline gap-3">
                  <Link
                    href={`/admin/orders/${d.ref}`}
                    className="font-mono text-body font-medium tracking-wide underline-offset-4 hover:underline"
                  >
                    {d.ref}
                  </Link>
                  <span className="text-meta text-steel">{d.customerName ?? "—"}</span>
                  <span className="font-mono text-micro text-steel">{STATUS_LABEL[d.status]}</span>
                </span>
                <span
                  className={`font-mono text-meta tabular-nums ${
                    d.dueAt < now ? "text-seal" : "text-graphite"
                  }`}
                >
                  {formatIST(d.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Popular title="Sponges people order" rows={sponges} />
        <Popular title="Sizes people order" rows={sizes} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-item">Just in</h2>
          <Link
            href="/admin/orders"
            className="font-mono text-micro uppercase tracking-[0.1em] text-graphite hover:text-ink"
          >
            All orders →
          </Link>
        </div>
        <ul className="border border-rule bg-paper">
          {recent.map((o) => (
            <li
              key={o.ref}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 last:border-0"
            >
              <span className="flex flex-wrap items-baseline gap-3">
                <Link
                  href={`/admin/orders/${o.ref}`}
                  className="font-mono text-body font-medium tracking-wide underline-offset-4 hover:underline"
                >
                  {o.ref}
                </Link>
                <span className="text-meta text-steel">{o.customerName ?? "—"}</span>
                <span
                  className={`font-mono text-micro ${
                    isClosed(o.status) ? "text-steel" : "text-carbon"
                  }`}
                >
                  {STATUS_LABEL[o.status]}
                </span>
              </span>
              <span className="flex items-baseline gap-4">
                <span className="font-mono text-micro text-steel">{formatIST(o.createdAt)}</span>
                <span className="font-mono text-meta tabular-nums">{formatINR(o.totalPaise)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-paper px-4 py-3.5">
      <span className="font-mono text-micro uppercase tracking-[0.1em] text-steel">{label}</span>
      <span className="font-mono text-title tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Counted over ninety days, and says so. A "most popular" with no window behind
 * it is a claim about all of history that quietly becomes a claim about
 * whenever the table was last emptied.
 */
function Popular({ title, rows }: { title: string; rows: { value: string; n: bigint }[] }) {
  const top = rows.filter((r) => r.value);
  const most = Number(top[0]?.n ?? 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="text-item">{title}</h2>
        <p className="font-mono text-micro text-steel">Last 90 days</p>
      </div>

      {top.length === 0 ? (
        <p className="border border-rule bg-paper px-4 py-3.5 text-body text-steel">
          No orders in that window yet.
        </p>
      ) : (
        <ul className="border border-rule bg-paper">
          {top.map((r) => (
            <li
              key={r.value}
              className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-body">{titleCase(r.value)}</span>
              {/* A rule as wide as its share of the top row: the shape is
                  readable without asking anybody to read an axis. */}
              <span aria-hidden="true" className="hidden h-px flex-1 bg-rule sm:block">
                <span
                  className="block h-px bg-ink"
                  style={{ width: `${most ? (Number(r.n) / most) * 100 : 0}%` }}
                />
              </span>
              <span className="font-mono text-meta tabular-nums text-graphite">{Number(r.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
