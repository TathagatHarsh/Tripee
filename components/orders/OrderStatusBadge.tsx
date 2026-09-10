import type { OrderStatus } from "@prisma/client";
import { customerStatus, PHASE, type OrderPhase, type ProgressStep } from "@/lib/orders";

/**
 * Where an order is, as one line a customer can read at a glance.
 *
 * ## Colour is never the only signal
 *
 * Each state carries a glyph as well as a tone — ✓ done, ● here now, ○ not yet,
 * × stopped — so the badge survives being printed, being read by somebody who
 * cannot separate the stamp red from the graphite, and being screenshotted into
 * a WhatsApp thread. The glyph is `aria-hidden`; the label is the text.
 *
 * The tones are the three the design system already has: carbon for the live
 * state, because it is the one colour in this product that means "attention
 * here"; steel on paper for something finished; stamp red for a cancellation,
 * which is the only place that colour is ever used.
 */

const TONE: Record<OrderPhase, string> = {
  active: "border-carbon text-carbon",
  delivered: "border-rule-strong text-graphite",
  cancelled: "border-seal text-seal",
};

const GLYPH: Record<OrderPhase, string> = {
  active: "●",
  delivered: "✓",
  cancelled: "×",
};

export function OrderStatusBadge({
  status,
  pickup = false,
  className = "",
}: {
  status: OrderStatus;
  pickup?: boolean;
  className?: string;
}) {
  const phase = PHASE[status];

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 border bg-paper px-2 py-1",
        "font-mono text-micro tracking-[0.08em] uppercase",
        TONE[phase],
        className,
      ].join(" ")}
    >
      <span aria-hidden="true">{GLYPH[phase]}</span>
      {customerStatus(status, pickup).label}
    </span>
  );
}

/* -------------------------------------------------------------- step glyphs */

/**
 * The same four marks, for one node of a tracker or one row of a timeline.
 *
 * `state` rather than `status`: a node's appearance is about how far the order
 * has got past it, not about which state it names — "delivered" is a tick on a
 * delivered order and an empty circle on one still in the kitchen.
 */
const STEP: Record<ProgressStep["state"], { glyph: string; tone: string; said: string }> = {
  done: { glyph: "✓", tone: "border-ink bg-ink text-paper", said: "Done" },
  current: { glyph: "●", tone: "border-carbon bg-carbon text-paper", said: "Happening now" },
  upcoming: { glyph: "○", tone: "border-rule bg-paper text-steel", said: "Still to come" },
  stopped: { glyph: "×", tone: "border-rule bg-slab text-steel", said: "Not reached" },
};

/**
 * A cancellation is not one of the four states, it is a fifth mark.
 *
 * `buildProgress` appends the cancelled step as `current`, which is true of the
 * order — it is where it stopped — and would draw it in carbon, the colour that
 * everywhere else in this product means "in progress". The stamp is the only
 * honest tone for it, and the label beside it already says the word, so this
 * mark says nothing of its own to a screen reader.
 */
export function StepGlyph({
  state,
  size = 24,
  seal = false,
}: {
  state: ProgressStep["state"];
  size?: number;
  seal?: boolean;
}) {
  const s = seal
    ? { glyph: "×", tone: "border-seal bg-seal text-paper", said: "" }
    : STEP[state];

  return (
    <span
      style={{ width: size, height: size }}
      className={[
        "inline-flex shrink-0 items-center justify-center border font-mono",
        size >= 24 ? "text-micro" : "text-[0.625rem]",
        s.tone,
      ].join(" ")}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {/* The state in words, for a reader that cannot see a filled square. */}
      {s.said && <span className="sr-only">{s.said}</span>}
    </span>
  );
}
