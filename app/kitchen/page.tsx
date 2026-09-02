import Link from "next/link";
import type { Metadata } from "next";
import type { OrderStatus } from "@prisma/client";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { renderSpecSheet } from "@/lib/docket";
import { formatINR, formatIST } from "@/lib/format";
import { ACTION_LABEL, isClosed, NEXT_STATUS, STATUS_LABEL } from "@/lib/orders";
import { priceCake } from "@/lib/pricing";
import { migrateConfig } from "@/lib/schema";
import { advanceOrder } from "./actions";
import { btn, eyebrow } from "@/lib/ui";

/**
 * The board the kitchen works from.
 *
 * Every order ever placed sat at `draft` in a table nobody could read: no GET
 * endpoint, no admin page, no notification. A customer could order a cake and
 * the bakery would never learn of it. This is that missing half.
 *
 * It renders the same spec sheet the customer downloads — `renderSpecSheet` is
 * already the artifact a kitchen works from, already tested, and printing a
 * second, subtly different summary beside it is how the two drift apart.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kitchen — Makemycake",
  robots: { index: false, follow: false },
};

const ORDER: OrderStatus[] = [
  "draft", "confirmed", "in_kitchen", "out_for_delivery", "delivered", "cancelled",
];

export default async function KitchenBoard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = ORDER.includes(status as OrderStatus) ? (status as OrderStatus) : null;

  if (!hasDatabase()) {
    return (
      <Shell counts={{}} filter={null} total={0}>
        <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
          {NO_DATABASE_MESSAGE}
        </p>
      </Shell>
    );
  }

  const [orders, grouped] = await Promise.all([
    db.order.findMany({
      where: filter ? { status: filter } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Partial<Record<OrderStatus, number>> = {};
  let total = 0;
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    total += g._count._all;
  }

  return (
    <Shell counts={counts} filter={filter} total={total}>
      {orders.length === 0 ? (
        <p className="border border-rule bg-paper px-4 py-3.5 text-body text-steel">
          Nothing here{filter ? ` at "${STATUS_LABEL[filter]}"` : " yet"}.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((o) => {
            const config = migrateConfig(o.config);
            // The stored total is the number the customer was quoted and is
            // frozen. The sheet is regenerated from the config, so if the price
            // tables have been edited and redeployed since, the two disagree —
            // and the kitchen needs to know which one it is holding to.
            const recomputed = config ? priceCake(config).total : null;
            const drifted = recomputed !== null && recomputed !== o.totalPaise;

            return (
              <li key={o.id} className="overflow-hidden border border-rule bg-paper ">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-item font-medium tracking-wide">{o.ref}</span>
                    <span className="border border-rule px-2 py-0.5 font-mono text-micro text-steel">
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <span className="font-mono text-item font-medium tabular-nums">
                    {formatINR(o.totalPaise)}
                  </span>
                </div>

                <dl className="grid gap-x-6 gap-y-1 px-4 py-3 text-body sm:grid-cols-2">
                  <Row k="Customer" v={o.customerName ?? "—"} />
                  <Row k="Phone" v={o.customerPhone ?? "—"} mono />
                  <Row k="Placed" v={formatIST(o.createdAt)} />
                  <Row k="Delivery" v={`${o.deliverySlot} · lead ${o.leadHours}h`} />
                  <Row k="Pincode" v={o.pincode ?? "Not set"} mono />
                  <Row k="Serves" v={`${o.servesMin}–${o.servesMax}`} />
                  <Row
                    k="Contains"
                    v={o.allergens.length ? o.allergens.join(", ") : "No declared allergens"}
                  />
                </dl>

                {drifted && (
                  <p role="alert" className="mx-4 mb-3 border border-seal/40 bg-seal-tint px-3.5 py-2.5 text-meta leading-snug">
                    Quoted {formatINR(o.totalPaise)}, but today&rsquo;s prices make this
                    cake {formatINR(recomputed!)}. The quoted figure is what was
                    agreed — the sheet below is regenerated and shows the new one.
                  </p>
                )}

                {config ? (
                  <details className="border-t border-rule">
                    <summary className="cursor-pointer px-4 py-2.5 text-meta text-steel hover:text-ink">
                      Spec sheet
                    </summary>
                    <pre className="overflow-x-auto border-t border-rule bg-sunken px-4 py-3 font-mono text-micro leading-[1.7]">
{renderSpecSheet(config, { ref: o.ref, createdAt: o.createdAt })}
                    </pre>
                  </details>
                ) : (
                  <p role="alert" className="mx-4 mb-3 border border-seal/40 bg-seal-tint px-3.5 py-2.5 text-meta">
                    This order&rsquo;s stored configuration no longer validates against
                    the current schema, so no sheet can be produced. Ring the customer.
                  </p>
                )}

                {!isClosed(o.status) && (
                  <div className="flex flex-wrap gap-2 border-t border-rule px-4 py-3">
                    {NEXT_STATUS[o.status].map((next) => (
                      <form key={next} action={advanceOrder}>
                        <input type="hidden" name="ref" value={o.ref} />
                        <input type="hidden" name="to" value={next} />
                        <button
                          type="submit"
                          className={btn(next === "cancelled" ? "quiet" : "primary", "md")}
                        >
                          {ACTION_LABEL[next]}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function Shell({
  children, counts, filter, total,
}: {
  children: React.ReactNode;
  counts: Partial<Record<OrderStatus, number>>;
  filter: OrderStatus | null;
  total: number;
}) {
  const tab = (href: string, label: string, n: number | undefined, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex min-h-11 items-center gap-2 border px-4 text-meta",
        "transition-colors duration-[--dur-ui]",
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-graphite hover:border-rule-strong hover:text-ink",
      ].join(" ")}
    >
      {label}
      <span className={`font-mono text-micro tabular-nums ${active ? "text-quiet" : "text-steel"}`}>
        {n ?? 0}
      </span>
    </Link>
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <header className="mb-8 flex flex-col gap-3">
        <span className={eyebrow}>The board</span>
        <h1 className="text-heading">Kitchen</h1>
        <p className="text-body leading-relaxed text-steel">
          Every docket, newest first. This is the only place an order can be read.
        </p>
      </header>

      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {tab("/kitchen", "All", total, filter === null)}
        {ORDER.map((s) =>
          tab(`/kitchen?status=${s}`, STATUS_LABEL[s], counts[s], filter === s),
        )}
      </nav>

      {children}
    </main>
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
