"use client";

import { docketAmount } from "@/lib/format";
import type { PriceBreakdown as Breakdown } from "@/lib/pricing";

/**
 * Every line names a real thing. A mystery total is the single clearest tell
 * that a site was thrown together, so this is never collapsed or hidden.
 *
 * The total is the one place on the ticket with a solid rule above it: every
 * other divider is dashed, so the eye finds the number without reading a word.
 * It stays ink, never seal — the accent means "something is wrong and you need
 * to look at it", and it cannot also mean "here is your total", because then a
 * customer cannot tell a price from a problem.
 */
export function PriceBreakdown({
  price,
  dense = false,
}: {
  price: Breakdown;
  dense?: boolean;
}) {
  const size = dense ? "text-micro leading-[1.9]" : "text-meta leading-[2]";

  const row = (label: string, amount: number) => (
    <div key={label} className={`flex items-baseline gap-1 font-mono tabular-nums ${size}`}>
      <span className="shrink-0 text-steel">{label}</span>
      <span aria-hidden className="min-w-2 grow docket-leader self-stretch" />
      <span className="shrink-0">{docketAmount(amount)}</span>
    </div>
  );

  return (
    <div>
      {price.lines.map((l, i) => (
        <div
          key={`${l.label}-${i}`}
          className={`flex items-baseline gap-1 font-mono tabular-nums ${size}`}
        >
          <span className="min-w-0 shrink text-steel">{l.label}</span>
          <span aria-hidden className="min-w-2 grow docket-leader self-stretch" />
          <span className="shrink-0">{docketAmount(l.amount)}</span>
        </div>
      ))}

      <hr className="my-2 border-0 border-t border-dashed border-rule" />
      {row("Subtotal", price.subtotal)}
      {row(`GST @ ${Math.round(price.gstRate * 100)}%`, price.gst)}

      <div className="mt-2.5 flex items-baseline gap-1 border-t border-ink pt-2.5 font-mono text-meta font-medium tabular-nums text-ink">
        <span className="shrink-0 tracking-[0.1em]">TOTAL</span>
        <span aria-hidden className="min-w-2 grow self-stretch" />
        <span
          key={price.total}
          className="shrink-0 motion-safe:animate-[price-tick_var(--dur-settle)_var(--ease-out)]"
        >
          {docketAmount(price.total)}
        </span>
      </div>
      <p className="mt-0.5 text-right font-mono text-micro tracking-[0.08em] text-steel">
        INCLUSIVE OF GST
      </p>
    </div>
  );
}
