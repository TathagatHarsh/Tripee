import type { OrderStatus } from "@prisma/client";
import { customerStatus, PHASE, type OrderPhase, type ProgressStep } from "@/lib/orders";

/**
 * Where an order is, as one line a customer can read at a glance.
 *
 * ## Colour is never the only signal
 *
 * Each state carries a glyph as well as a tone — ✓ done, ● here now, ○ not yet,
 * × stopped — so the badge survives being printed, being read by somebody who
 * cannot separate the berry from the caramel, and being screenshotted into a
 * WhatsApp thread. The glyph is `aria-hidden`; the label is the text.
 *
 * ## The three tones
 *
 * Caramel for work in progress, green for arrived, deep berry for stopped — see
 * the note on `--color-s-live` in globals.css for why the storefront's own berry
 * could not do all three jobs, and for the measured contrast of each pair. A
 * pill on a wash rather than an outline on paper, because this now sits on white
 * cards in a warm shop rather than on a ruled carbon copy.
 */

const TONE: Record<OrderPhase, string> = {
  active: "bg-s-live-wash text-s-live",
  delivered: "bg-s-done-wash text-s-done",
  cancelled: "bg-s-stop-wash text-s-stop",
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
        "font-mono text-[0.6875rem] tracking-[0.08em] uppercase",
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
 *
 * Round, where these used to be squares. The tracker is the one place on this
 * page where the eye follows a line of marks, and a circle on a rail is the
 * shape everybody has already learned to read as a step.
 */
const STEP: Record<ProgressStep["state"], { glyph: string; tone: string; said: string }> = {
  done: { glyph: "✓", tone: "border-s-done bg-s-done text-white", said: "Done" },
  current: { glyph: "●", tone: "border-s-live bg-s-live text-white", said: "Happening now" },
  upcoming: { glyph: "○", tone: "border-s-line-strong bg-s-shell text-s-bark", said: "Still to come" },
  stopped: { glyph: "×", tone: "border-s-line bg-s-cream-deep text-s-bark", said: "Not reached" },
};

/**
 * A cancellation is not one of the four states, it is a fifth mark.
 *
 * `buildProgress` appends the cancelled step as `current`, which is true of the
 * order — it is where it stopped — and would draw it in caramel, the colour that
 * everywhere else on this page means "being worked on". Deep berry is the only
 * honest tone for it, and the label beside it already says the word, so this
 * mark says nothing of its own to a screen reader.
 */
export function StepGlyph({
  state,
  size = 26,
  seal = false,
}: {
  state: ProgressStep["state"];
  size?: number;
  seal?: boolean;
}) {
  const s = seal
    ? { glyph: "×", tone: "border-s-stop bg-s-stop text-white", said: "" }
    : STEP[state];

  return (
    <span
      style={{ width: size, height: size }}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full border font-mono",
        size >= 24 ? "text-[0.75rem]" : "text-[0.625rem]",
        s.tone,
      ].join(" ")}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {/* The state in words, for a reader that cannot see a filled circle. */}
      {s.said && <span className="sr-only">{s.said}</span>}
    </span>
  );
}
