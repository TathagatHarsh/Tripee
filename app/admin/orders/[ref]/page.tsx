import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { renderSpecSheet } from "@/lib/docket";
import { formatINR, formatIST } from "@/lib/format";
import { isClosed, STATUS_LABEL } from "@/lib/orders";
import { priceCake } from "@/lib/pricing";
import { migrateConfig } from "@/lib/schema";
import { eyebrow } from "@/lib/ui";

/**
 * One order, in full.
 *
 * The list answers "which order"; this answers "what exactly did we agree to".
 * So the frozen lines come first and the regenerated spec sheet second, and
 * where the two disagree the page says which is binding — the customer agreed
 * to a number, and the catalogue moving afterwards does not renegotiate it on
 * their behalf.
 *
 * No status buttons here either, for the reason /admin/orders gives: the
 * sequence a docket follows belongs to app/kitchen and its state machine.
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
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const [order, catalog] = await Promise.all([
    db.order.findUnique({
      where: { ref },
      include: { items: { orderBy: { position: "asc" } }, design: { select: { slug: true } } },
    }),
    getCatalogSnapshot(),
  ]);

  if (!order) notFound();

  const config = migrateConfig(order.config);
  const recomputed = config ? priceCake(config, catalog).total : null;
  const drifted = recomputed !== null && recomputed !== order.totalPaise;
  const dueAt = new Date(order.createdAt.getTime() + order.leadHours * 3600_000);
  const overdue = dueAt < new Date() && !isClosed(order.status);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/orders"
          className="font-mono text-micro uppercase tracking-[0.1em] text-steel hover:text-ink"
        >
          ← All orders
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <span className={eyebrow}>Order</span>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-mono text-heading tracking-wide">{order.ref}</h1>
          <span
            className={[
              "border px-2 py-0.5 font-mono text-micro",
              isClosed(order.status) ? "border-rule text-steel" : "border-carbon text-carbon",
            ].join(" ")}
          >
            {STATUS_LABEL[order.status]}
          </span>
          <span className="font-mono text-item font-medium tabular-nums">
            {formatINR(order.totalPaise)}
          </span>
        </div>
      </header>

      <section className="border border-rule bg-paper">
        <h2 className="border-b border-rule px-4 py-2.5 font-mono text-micro uppercase tracking-[0.1em] text-steel">
          Who, and when
        </h2>
        <dl className="grid gap-x-6 gap-y-1 px-4 py-3 text-body sm:grid-cols-2">
          <Row k="Customer" v={order.customerName ?? "—"} />
          <Row k="Phone" v={order.customerPhone ?? "—"} mono />
          <Row k="Placed" v={formatIST(order.createdAt)} />
          <Row k="Due" v={`${formatIST(dueAt)}${overdue ? " · overdue" : ""}`} />
          <Row k="Delivery" v={`${order.deliverySlot} · lead ${order.leadHours}h`} />
          <Row k="Pincode" v={order.pincode ?? "Not set"} mono />
          <Row k="Serves" v={`${order.servesMin}–${order.servesMax}`} />
          <Row
            k="Contains"
            v={order.allergens.length ? order.allergens.join(", ") : "No declared allergens"}
          />
          {order.design && <Row k="Design" v={`/d/${order.design.slug}`} mono />}
        </dl>
      </section>

      <section className="border border-rule bg-paper">
        <h2 className="border-b border-rule px-4 py-2.5 font-mono text-micro uppercase tracking-[0.1em] text-steel">
          What they were charged
        </h2>
        <ul className="flex flex-col gap-1 px-4 py-3">
          {order.items.map((it) => (
            <li
              key={it.id}
              className="flex items-baseline justify-between gap-4 font-mono text-meta"
            >
              <span className="min-w-0 text-graphite">{it.label}</span>
              <span className="shrink-0 tabular-nums">{formatINR(it.amountPaise)}</span>
            </li>
          ))}
          <li className="mt-2 flex items-baseline justify-between gap-4 border-t border-rule pt-2 font-mono text-body font-medium">
            <span>Total, including GST</span>
            <span className="tabular-nums">{formatINR(order.totalPaise)}</span>
          </li>
        </ul>

        {drifted && (
          <p
            role="alert"
            className="mx-4 mb-3 border border-seal/40 bg-seal-tint px-3.5 py-2.5 text-meta leading-snug"
          >
            The same cake would cost {formatINR(recomputed!)} at today&rsquo;s
            prices. The {formatINR(order.totalPaise)} above is what was agreed and
            is what stands — the sheet below is regenerated and will show the new
            figure.
          </p>
        )}
      </section>

      <section className="border border-rule bg-paper">
        <h2 className="border-b border-rule px-4 py-2.5 font-mono text-micro uppercase tracking-[0.1em] text-steel">
          Spec sheet
        </h2>
        {config ? (
          <pre className="overflow-x-auto bg-sunken px-4 py-3 font-mono text-micro leading-[1.7]">
{renderSpecSheet(config, catalog, { ref: order.ref, createdAt: order.createdAt })}
          </pre>
        ) : (
          <p role="alert" className="m-4 border border-seal/40 bg-seal-tint px-3.5 py-2.5 text-meta">
            This order&rsquo;s stored configuration no longer validates against the
            current schema, so no sheet can be produced. Ring the customer.
          </p>
        )}
      </section>

      <p className="border-t border-rule pt-4 font-sans text-meta leading-relaxed text-steel">
        To move this order along, use the{" "}
        <Link href="/kitchen" className="underline">kitchen board</Link>.
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
