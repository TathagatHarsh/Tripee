import { mulberry32 } from "@/lib/seed";

/**
 * Sprinkles falling through the hero.
 *
 * The one motion on this page that is not a document doing something, and it
 * earns its place the way the brief asks every motion to: it is something a hand
 * does. Somebody scatters sprinkles over a cake. They are cut cylinders, so they
 * are drawn as thin rectangles rather than dots, they tumble on the way down,
 * and they are in inks this brand already owns — carbon, stamp and two greys —
 * rather than in party colours.
 *
 * No client component, no rAF, no library. Twenty-eight absolutely positioned
 * spans with one CSS animation between them, and the per-fleck variation handed
 * in as custom properties, so this costs one keyframe rule and nothing on the
 * main thread.
 *
 * SEEDED, NOT RANDOM
 *
 * `Math.random()` here renders one field on the server and a different one in
 * the browser, which React reports as a hydration mismatch and then patches by
 * throwing the server's HTML away. `mulberry32` is already in lib/seed for the
 * cake's own crumb scatter — same reason, same fix — so the field is computed
 * once at module scope from a fixed seed and both renders agree.
 *
 * The delays are NEGATIVE on purpose. A field of positive delays starts empty
 * and fills up, so the first thing a visitor sees is sprinkles being switched
 * on. Starting each one part-way through its own cycle opens the page
 * mid-scatter, which is the only state that looks like weather rather than like
 * a widget.
 */

/* Four inks. §1.2's two signal colours plus two greys — the same restraint the
   rest of the page keeps, so this reads as confetti cut from the stationery. */
const TONES = [
  "var(--color-carbon)",
  "var(--color-stamp)",
  "var(--color-ink-60)",
  "var(--color-ink-35)",
] as const;

const COUNT = 28;

const rng = mulberry32(0x5c47);
const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

const FLECKS = Array.from({ length: COUNT }, (_, i) => ({
  key: i,
  /* Spread across the full width. The hero's emptiest band is the middle, and an
     even spread is what puts flecks there without having to aim at it. */
  left: between(1, 99),
  width: between(1.5, 2.6),
  height: between(6, 13),
  /* Slow. Fast confetti is a celebration graphic; this is meant to be noticed
     second, after the headline. */
  duration: between(11, 21),
  drift: between(-70, 70),
  spin: between(-540, 720),
  opacity: between(0.22, 0.5),
  tone: TONES[i % TONES.length],
  /* Phase, as a fraction of this fleck's own cycle. Drawn from the same seeded
     stream rather than from the index, so the field does not fall in a visible
     sequence the way `(i * 37) % 100` would. */
  phase: between(0, 1),
}));

export function HeroSprinkles({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {FLECKS.map((f) => (
        <span
          key={f.key}
          className="hero-sprinkle"
          style={
            {
              left: `${f.left}%`,
              width: `${f.width}px`,
              height: `${f.height}px`,
              background: f.tone,
              animationDuration: `${f.duration}s`,
              animationDelay: `-${(f.duration * f.phase).toFixed(2)}s`,
              "--fleck-x": `${f.drift.toFixed(1)}px`,
              "--fleck-r": `${f.spin.toFixed(0)}deg`,
              "--fleck-o": f.opacity.toFixed(2),
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
