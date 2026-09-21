/**
 * The cake box, waiting.
 *
 * The confirmation's box opens once and is done — see
 * components/shop/OrderPlaced. This is the same box before that moment: shut,
 * with the lid breathing against it and a little heat coming off the top. One
 * object, two states, so a wait anywhere in the shop and the payoff at the end
 * of checkout are recognisably the same thing.
 *
 * ## Why this is a second drawing and not the same one scaled down
 *
 * The confirmation's illustration is a 240×180 viewBox rendered at ~300px, with
 * 1.5-unit strokes and a berry drip measured in tenths of a unit. Rendered at
 * 20px inside a button, every one of those strokes is a hairline and the drip
 * is mud. This is the same object drawn for the size it is actually used at —
 * chunky, four shapes, no detail below a pixel. Sharing the geometry would mean
 * one of the two looking wrong, which is not what sharing is for.
 *
 * ## Where it belongs, and where it does not
 *
 * Here: in front of a wait with no shape to it — a card that has not hydrated,
 * a button mid-request, a region whose contents are not known yet.
 *
 * NOT in place of the skeletons in components/orders/OrderSkeleton. Those draw
 * the real thing at its real size so the page does not jump when the data
 * lands, which is worth more than any animation — the note on
 * `OrderDetailSkeleton` calls a 30px jump "the one shift worth engineering
 * away". `BakingStatus` below floats over a skeleton rather than pushing it
 * down, for exactly that reason.
 */

const SIZE = {
  /* Inside a button, beside its label. */
  sm: "size-5",
  /* A status line. */
  md: "size-8",
  /* Alone in the middle of a card that has not arrived. */
  lg: "size-16",
} as const;

/**
 * The mark on its own, decorative.
 *
 * `aria-hidden`, always: a box that bobs says nothing a screen reader can use,
 * and every caller here already carries `aria-busy` or a word beside it. The
 * animation is never the only signal that something is loading.
 */
export function BakingMark({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={`${SIZE[size]} shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="mmc-bake-glow">
          <stop offset="0%" stopColor="var(--color-s-gold)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-s-gold)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="s-bake-glow" cx="16" cy="19" r="15" fill="url(#mmc-bake-glow)" />

      {/*
        Heat, not confetti. Three wisps on a stagger, rising out of a shut box —
        the one thing here that says "something is happening in there" rather
        than "something is sitting there".
      */}
      <g className="s-bake-steam">
        <circle cx="10.5" cy="5.5" r="1.6" fill="var(--color-s-berry)" />
        <circle cx="16" cy="3.2" r="1.9" fill="var(--color-s-berry)" />
        <circle cx="21.5" cy="5.5" r="1.6" fill="var(--color-s-berry)" />
      </g>

      {/*
        The box fills the frame on purpose. This is rendered at 20px inside a
        button, and a drawing that uses half its viewBox is a drawing that is
        ten pixels tall by the time anybody sees it.
      */}
      <rect
        x="4"
        y="16"
        width="24"
        height="12"
        rx="2"
        fill="var(--color-s-shell)"
        stroke="var(--color-s-line-strong)"
        strokeWidth="1.25"
      />
      <rect x="14" y="16" width="4" height="12" fill="var(--color-s-berry)" />

      {/* The lid, which never quite settles. */}
      <g className="s-bake-lid">
        <rect
          x="2"
          y="10"
          width="28"
          height="6.5"
          rx="2"
          fill="var(--color-s-shell)"
          stroke="var(--color-s-line-strong)"
          strokeWidth="1.25"
        />
        <rect x="14" y="10" width="4" height="6.5" fill="var(--color-s-berry)" />
      </g>
    </svg>
  );
}

/**
 * The mark with a word beside it, floating over whatever is underneath.
 *
 * `absolute`, and that is the whole point. The three route loading states that
 * use this already draw the page's real furniture at its real size, and a
 * status line in the flow would push the status sheet down thirty pixels and
 * let it spring back the moment the data landed. Floating costs the layout
 * nothing.
 *
 * The label is visible rather than `sr-only`. A sighted customer waiting on
 * /orders used to get a shimmer and no words at all — the screen reader was the
 * only one being told what was going on.
 */
export function BakingStatus({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <span className="inline-flex items-center gap-2.5 rounded-full border border-s-line bg-s-shell/90 px-4 py-2 text-[0.8125rem] text-s-bark shadow-[0_4px_16px_rgb(58_35_23/0.10)] backdrop-blur-sm">
        <BakingMark size="sm" />
        {label}
      </span>
    </span>
  );
}

/**
 * A whole card's worth of waiting, with the box in the middle of it.
 *
 * For the two places that render a featureless block while `localStorage` is
 * read — the cart and the checkout form. Those blocks stand in for content
 * whose height is not knowable in advance (a basket is one cake or nine), so
 * there was no shape to draw and what got drawn was a grey rectangle pulsing.
 *
 * The height stays the caller's, unchanged, because the one thing that must not
 * move is the fold underneath it.
 */
export function BakingPanel({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <BakingMark size="lg" />
      <span className="text-[0.875rem] text-s-bark">{label}</span>
    </div>
  );
}
