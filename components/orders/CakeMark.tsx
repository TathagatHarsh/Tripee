import type { CakeConfig } from "@/lib/schema";
import { shade } from "@/lib/color";

/**
 * The cake, drawn from the order itself, when nobody has photographed it.
 *
 * Reached through `components/orders/CakeThumb`, which prefers the real
 * catalogue photograph when the order's design matches a product the shop
 * sells. What is left for this to draw is a cake assembled option by option in
 * the 3D builder — one nobody has made before, and so one there is no picture
 * of.
 *
 * A stock image of somebody else's cake beside "your order" would be the one
 * thing a tracking page cannot do — lib/photos.ts refuses the same trick for the
 * same reason, and its list is empty on purpose.
 *
 * What does exist is the configuration, which is what the 3D preview renders
 * from. So this is that, flattened: the real tier count, the real frosting
 * colour, the real drip, the silhouette of the real shape. It is a mark rather
 * than a picture — nobody will mistake it for a photo — and it is honest, cheap
 * and deterministic. `<CakePreview>` is the alternative and it is a WebGL canvas
 * per card, which is a dozen contexts on a list of a dozen orders.
 *
 * No text and no title: `aria-hidden`, because every card and every item row
 * names the cake in words beside it, and "cake drawing" read out before the
 * flavour would be noise.
 */
export function CakeMark({
  config,
  className = "",
}: {
  config: CakeConfig | null;
  className?: string;
}) {
  /* A config that no longer validates still gets a card — see app/orders/data —
     so this draws the shape of a cake with no colours claimed. */
  const body = config?.frostingColor ?? "#e4d6c2";
  const tiers = config?.tiers ?? 1;
  const round = (config?.shape ?? "round") !== "square";

  /* Bottom tier widest, each one above it narrower, stacked upward from the
     board. Heights sum to the same silhouette whatever the tier count, so a
     one-tier cake is not a sliver in the corner of the frame. */
  const height = 34 / tiers;
  const stack = Array.from({ length: tiers }, (_, i) => ({
    w: 56 - i * (tiers > 1 ? 13 : 0),
    y: 62 - (i + 1) * height,
  }));

  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* The board it sits on, which is also what stops the drawing floating. */}
      <line x1="8" y1="66" x2="72" y2="66" stroke="var(--color-s-line-strong)" strokeWidth="1" />

      {stack.map((s, i) => (
        <g key={i}>
          <rect
            x={40 - s.w / 2}
            y={s.y}
            width={s.w}
            height={height}
            fill={body}
            stroke={shade(body, -0.28)}
            strokeWidth="0.75"
          />
          {/* The top face, so a round cake reads as round rather than as a box. */}
          {round && (
            <ellipse
              cx="40"
              cy={s.y}
              rx={s.w / 2}
              ry="3"
              fill={shade(body, 0.06)}
              stroke={shade(body, -0.28)}
              strokeWidth="0.75"
            />
          )}
        </g>
      ))}

      {config?.hasDrip && (
        <path
          d={`M ${40 - stack[tiers - 1]!.w / 2} ${stack[tiers - 1]!.y + 4}
              q 4 6 8 0 q 4 7 8 1 q 4 6 8 0 q 4 7 8 1 q 4 6 8 0
              q 4 5 6 0`}
          fill="none"
          stroke={config.dripColor ?? shade(body, -0.35)}
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {/* One candle for a cake carrying a message — the order said it was for an
          occasion, so the mark says so too. Nothing invented: no message, no
          candle. */}
      {config?.message && (
        <>
          <line
            x1="40" y1={stack[tiers - 1]!.y - 9} x2="40" y2={stack[tiers - 1]!.y - 2}
            stroke="var(--color-s-cocoa)" strokeWidth="1.25"
          />
          <circle cx="40" cy={stack[tiers - 1]!.y - 11} r="1.75" fill="var(--color-s-berry)" />
        </>
      )}
    </svg>
  );
}
