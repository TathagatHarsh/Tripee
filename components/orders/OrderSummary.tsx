import { formatINR } from "@/lib/format";

/**
 * What it cost, itemised, from the lines frozen onto the order.
 *
 * These are OrderItem rows and they are read, never recomputed. The whole point
 * of freezing them at order time is that a catalogue edit afterwards cannot
 * rewrite what somebody agreed to pay — prisma/schema.prisma says so on the
 * model, and the admin page shows the drift as a warning to staff. A customer
 * gets the number they agreed to and no editorial about it.
 *
 * GST is derived as the remainder rather than recalculated from a rate: the
 * total is the authoritative column and the lines are the authoritative parts,
 * so the difference between them *is* the tax that was charged. Applying today's
 * 18% to an old order would be arithmetic that disagrees with the total sitting
 * next to it.
 */
export function OrderSummary({
  items,
  totalPaise,
}: {
  items: { id: string; label: string; amountPaise: number; kind: string }[];
  totalPaise: number;
}) {
  const subtotal = items.reduce((sum, i) => sum + i.amountPaise, 0);
  const gst = totalPaise - subtotal;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-4 border-b border-rule py-2 first:pt-0"
          >
            <span className="min-w-0 font-sans text-body leading-snug text-graphite">
              {item.label}
            </span>
            <span className="shrink-0 font-mono text-body tabular-nums text-ink">
              {formatINR(item.amountPaise)}
            </span>
          </li>
        ))}
      </ul>

      <Line k="Subtotal" v={subtotal} />
      {/* Zero would print a line saying nothing; a negative remainder would mean
          the lines and the total disagree, and hiding that is not this
          component's call — it prints what the columns say. */}
      {gst !== 0 && <Line k="GST" v={gst} />}

      <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-ink pt-2.5">
        <span className="font-mono text-item tracking-[0.06em] text-ink uppercase">Total paid</span>
        <span className="font-mono text-item font-medium tabular-nums text-ink">
          {formatINR(totalPaise)}
        </span>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pt-2">
      <span className="font-mono text-micro tracking-[0.13em] text-steel uppercase">{k}</span>
      <span className="font-mono text-body tabular-nums text-graphite">{formatINR(v)}</span>
    </div>
  );
}
