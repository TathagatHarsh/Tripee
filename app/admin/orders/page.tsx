import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST } from "@/lib/format";
import { isClosed, STATUS_LABEL } from "@/lib/orders";
import { eyebrow } from "@/lib/ui";

/**
 * Orders, for the office rather than the bench.
 *
 * /kitchen is deliberately not this page and this page is deliberately not
 * /kitchen. A shift needs one question answered — what do I make next — and
 * gets a board with big buttons on it. An owner asks different questions: what
 * did we take this week, who was that customer on the phone, what did we quote
 * them. Same Order table, two readings of it.
 *
 * Which is why nothing here moves a docket along. Status transitions live in
 * app/kitchen/actions.ts behind lib/orders' state machine, and a second way to
 * change status is a second place for those rules to drift.
 */

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = [
  "draft", "confirmed", "in_kitchen", "out_for_delivery", "delivered", "cancelled",
];

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; days?: string }>;
}) {
  if (!hasDatabase()) {
    return (
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const { q, status, days } = await searchParams;
  const filter = STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : null;
  const window = days === "7" || days === "30" ? Number(days) : null;

  const where: Prisma.OrderWhereInput = {};
  if (filter) where.status = filter;
  if (window) {
    /*
     * Computed from the request rather than stored, so "last 7 days" means
     * seven days before this page load and not seven days before the server
     * happened to start.
     *
     * `new Date()` rather than `Date.now()`, which react-hooks/purity refuses
     * during render. The refusal is about a component that re-renders and must
     * give the same answer twice; this one is `force-dynamic` and runs once per
     * request on the server, where reading the clock is the entire point. Same
     * arithmetic either way, and it is now what app/admin/page.tsx already does.
     */
    const now = new Date();
    where.createdAt = { gte: new Date(now.getTime() - window * 24 * 60 * 60 * 1000) };
  }
  if (q?.trim()) {
    const term = q.trim();
    // The reference is what gets read down a phone line; name and phone are
    // what somebody has when they do not have the reference.
    where.OR = [
      { ref: { contains: term, mode: "insensitive" } },
      { customerName: { contains: term, mode: "insensitive" } },
      { customerPhone: { contains: term } },
    ];
  }

  const [orders, open] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: { orderBy: { position: "asc" } } },
    }),
    db.order.count({ where: { status: { in: ["draft", "confirmed", "in_kitchen"] } } }),
  ]);

  const taken = orders.reduce((sum, o) => (o.status === "cancelled" ? sum : sum + o.totalPaise), 0);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, status: filter ?? undefined, days: window?.toString(), ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      key={href + label}
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex min-h-11 items-center border px-3 font-mono text-meta",
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule-strong bg-paper text-graphite hover:border-ink hover:text-ink",
      ].join(" ")}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className={eyebrow}>The book</span>
        <h1 className="text-heading">Orders</h1>
        <p className="font-mono text-micro text-ink-35">
          {orders.length} shown · {open} still open · {formatINR(taken)} on this page,
          cancellations excluded
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="q">Search by reference, name or phone</label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ""}
          placeholder="MC-4471, a name, or a number"
          className="min-h-11 min-w-64 flex-1 border border-rule-strong bg-paper px-3 font-mono text-body text-ink placeholder:text-ink-35 focus:border-ink focus:outline-none"
        />
        {filter && <input type="hidden" name="status" value={filter} />}
        {window && <input type="hidden" name="days" value={String(window)} />}
        <button
          type="submit"
          className="inline-flex min-h-11 items-center border border-ink bg-ink px-4 font-mono text-meta text-paper"
        >
          Search
        </button>
        {q && (
          <Link href={qs({ q: undefined })} className="font-mono text-meta text-steel hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      <nav aria-label="Filter orders" className="flex flex-wrap gap-2">
        {tab(qs({ status: undefined }), "All statuses", filter === null)}
        {STATUSES.map((s) => tab(qs({ status: s }), STATUS_LABEL[s], filter === s))}
        <span aria-hidden="true" className="w-4" />
        {tab(qs({ days: undefined }), "Any date", window === null)}
        {tab(qs({ days: "7" }), "Last 7 days", window === 7)}
        {tab(qs({ days: "30" }), "Last 30 days", window === 30)}
      </nav>

      {orders.length === 0 ? (
        <p className="border border-rule bg-paper px-4 py-3.5 text-body text-steel">
          Nothing matches that.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id} className="border border-rule bg-paper">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-item font-medium tracking-wide">{o.ref}</span>
                  <span
                    className={[
                      "border px-2 py-0.5 font-mono text-micro",
                      isClosed(o.status) ? "border-rule text-steel" : "border-carbon text-carbon",
                    ].join(" ")}
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                  <span className="font-mono text-micro text-steel">{formatIST(o.createdAt)}</span>
                </div>
                <span className="font-mono text-item font-medium tabular-nums">
                  {formatINR(o.totalPaise)}
                </span>
              </div>

              <dl className="grid gap-x-6 gap-y-1 px-4 py-3 text-body sm:grid-cols-2">
                <Row k="Customer" v={o.customerName ?? "—"} />
                <Row k="Phone" v={o.customerPhone ?? "—"} mono />
                <Row k="Delivery" v={`${o.deliverySlot} · lead ${o.leadHours}h`} />
                <Row k="Pincode" v={o.pincode ?? "Not set"} mono />
                <Row k="Serves" v={`${o.servesMin}–${o.servesMax}`} />
                <Row
                  k="Contains"
                  v={o.allergens.length ? o.allergens.join(", ") : "No declared allergens"}
                />
              </dl>

              <details className="border-t border-rule">
                <summary className="cursor-pointer px-4 py-2.5 text-meta text-steel hover:text-ink">
                  What they were charged
                </summary>
                <div className="border-t border-rule bg-sunken px-4 py-3">
                  {/*
                    The frozen lines, straight off OrderItem — not a fresh
                    priceCake of the config. This is the number the customer
                    agreed to, and it must not move when the catalogue does.
                  */}
                  <ul className="flex flex-col gap-1">
                    {o.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-baseline justify-between gap-4 font-mono text-meta"
                      >
                        <span className="min-w-0 text-graphite">{it.label}</span>
                        <span className="shrink-0 tabular-nums">{formatINR(it.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-rule pt-2 font-mono text-micro text-steel">
                    Quoted {formatIST(o.createdAt)}. Later price changes do not touch this.
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-rule pt-4 font-sans text-meta leading-relaxed text-steel">
        Moving an order along — confirming it, starting it, sending it out — is
        the <Link href="/kitchen" className="underline">kitchen board</Link>, so
        the sequence a docket follows has one set of rules and one place that
        applies them.
      </p>
    </div>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-rule py-1.5 last:border-0">
      <dt className="w-24 shrink-0 font-mono text-micro text-steel">{k}</dt>
      <dd className={`min-w-0 flex-1 leading-snug ${mono ? "font-mono tabular-nums" : ""}`}>{v}</dd>
    </div>
  );
}
