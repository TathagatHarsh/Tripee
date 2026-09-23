import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { FSSAI_LICENCE, renderSpecSheet } from "@/lib/docket";
import { formatINR, formatIST } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { getOrderDetail } from "../data";
import { PrintButton } from "./PrintButton";

/**
 * The docket, on paper.
 *
 * A kitchen does not work from a screen it has to keep unlocking, and a rider
 * does not take a browser tab to somebody's door. This is the same order the
 * detail page shows, laid out for a sheet of A4: mono throughout, hairline
 * rules, no navigation, nothing that only makes sense if you can click it.
 *
 * ## The price is the frozen one
 *
 * `renderSpecSheet` is asked to leave its price section out, and the lines
 * below are read straight off OrderItem instead. The sheet's own prices are
 * computed from today's catalogue, which is the right answer beside the builder
 * and the wrong one on a document about an order agreed last month — the number
 * printed here has to be the number the customer agreed to, and a catalogue
 * edited since must not be able to reprint their cake at a new price.
 *
 * Everything above the price is regenerated from the stored config, because it
 * describes the cake rather than charging for it. That includes the allergen
 * block, which is deliberately the sheet's single derived one rather than a
 * second copy printed from `Order.allergens`: two allergen statements on one
 * kitchen document, able to disagree, is worse than either of them alone.
 *
 * ## Who gets in
 *
 * Nothing here, and that is on purpose. This route is nested under
 * app/admin/layout.tsx, whose `requireAdmin()` runs on the server for every
 * request to anything beneath it, at any depth. A second check in the page
 * would read as though it were the gate.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ ref: string }> },
): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} — Docket`, robots: { index: false, follow: false } };
}

export default async function OrderDocket({
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

  const detail = await getOrderDetail(ref);
  if (!detail) notFound();

  const { order, catalog, config } = detail;
  const dueAt = new Date(order.createdAt.getTime() + order.leadHours * 3600_000);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 font-mono">
      <div className="flex flex-wrap items-baseline justify-between gap-4 print:hidden">
        <PrintButton />
        <span className="text-micro text-steel">
          One order, laid out for paper. The price shown is the one frozen when
          this order was placed.
        </span>
      </div>

      <header className="flex flex-col gap-2 border-b-2 border-ink pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <span className="text-item uppercase tracking-[0.18em]">MakeYourCakes</span>
          <span className="text-micro uppercase tracking-[0.1em] text-steel">Order docket</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-heading tracking-wide">{order.ref}</span>
          <span className="border border-ink px-2 py-0.5 text-micro uppercase tracking-[0.1em]">
            {STATUS_LABEL[order.status]}
          </span>
        </div>
      </header>

      <Block title="Customer">
        <Line k="Name" v={order.customerName ?? "—"} />
        <Line k="Phone" v={order.customerPhone ?? "—"} />
      </Block>

      <Block title="Delivery">
        <Line k="Slot" v={order.deliverySlot} />
        <Line k="Placed" v={formatIST(order.createdAt)} />
        {/* Derived from the slot's lead time, the same arithmetic the order
            detail page shows as "Due" — there is no separate stored date. */}
        <Line k="Due by" v={`${formatIST(dueAt)} (lead ${order.leadHours}h)`} />
        <Line k="Pincode" v={order.pincode ?? "Not set"} />
        <Line k="Serves" v={`${order.servesMin}–${order.servesMax}`} />
      </Block>

      {config ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-micro uppercase tracking-[0.1em] text-steel">The cake</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap text-micro leading-[1.7]">
{renderSpecSheet(config, catalog, {
  ref: order.ref,
  createdAt: order.createdAt,
  omitPrice: true,
})}
          </pre>
        </section>
      ) : (
        <p className="border border-seal/40 bg-seal-tint px-3.5 py-2.5 text-meta leading-snug">
          This order&rsquo;s stored configuration no longer validates against the
          current schema, so no specification can be printed. Ring the customer
          before baking anything.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-micro uppercase tracking-[0.1em] text-steel">Price</h2>
        {/*
          Straight off OrderItem — the lines the customer agreed to. Not a fresh
          priceCake of the config, which would reprint this cake at whatever the
          catalogue says today.
        */}
        <ul className="flex flex-col gap-1">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-4 text-meta">
              <span className="min-w-0">{it.label}</span>
              <span className="shrink-0 tabular-nums">{formatINR(it.amountPaise)}</span>
            </li>
          ))}
          <li className="mt-1 flex items-baseline justify-between gap-4 border-t border-ink pt-1.5 text-body font-medium">
            <span>Total, including GST</span>
            <span className="tabular-nums">{formatINR(order.totalPaise)}</span>
          </li>
        </ul>
        <p className="text-micro text-steel">
          Quoted {formatIST(order.createdAt)}. Later price changes do not touch this.
        </p>
      </section>

      <footer className="border-t border-rule pt-3 text-micro leading-relaxed text-steel">
        {FSSAI_LICENCE && <p>FSSAI Lic. No. {FSSAI_LICENCE}</p>}
        <p>Printed from the order book. {order.ref}</p>
      </footer>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-micro uppercase tracking-[0.1em] text-steel">{title}</h2>
      <dl className="flex flex-col">{children}</dl>
    </section>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 border-b border-rule py-1 last:border-0">
      <dt className="w-28 shrink-0 text-micro text-steel">{k}</dt>
      <dd className="min-w-0 flex-1 text-meta leading-snug">{v}</dd>
    </div>
  );
}
