import Image from "next/image";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import type { Preset } from "@/lib/presets";
import { priceCake } from "@/lib/pricing";
import { servingsLabel } from "@/lib/servings";
import { btn } from "@/lib/ui";

/**
 * One preset, shot like a page from a catalogue rather than logged like a
 * product.
 *
 * The cake on the card is a photograph now — `public/presets/<slug>.webp`, made
 * by `scripts/shoot-presets` — where it used to be a live canvas. It is still a
 * render of this preset's own `CakeConfig`, drawn by the same `CakeScene` the
 * builder draws, so the promise the catalogue makes still holds: the cake in the
 * picture is the cake the CTA hands over. What changed is only what a render can
 * afford. Nothing drawn in twelve simultaneous browser canvases can cast a
 * shadow (see quality.CARD_BUDGET, which switches them off), and the difference
 * between a cake with a shadow under it and a cake without one is most of the
 * difference between a photograph and a diagram.
 *
 * The art direction went with the canvas, and deliberately. These three used to
 * get a camera each — a low raking close-up on the truffle, a high airy frame on
 * the strawberry, a cut wedge on the red velvet — because three cakes in three
 * identical frames read as three placeholders. That reasoning was right for a
 * marketing row of three and wrong for a catalogue of twenty, and one shoot has
 * to serve both: `app/shoot/[slug]` photographs every preset from one camera so
 * that twenty cakes are comparable, and these three inherit it. What separates
 * them here is the cakes.
 */
export function PresetCard({ preset }: { preset: Preset }) {
  return (
    <li
      className={
        "group flex flex-col overflow-hidden rounded-panel border border-rule bg-paper " +
        "shadow-elev-1 transition-[box-shadow,border-color,translate] " +
        /*
         * `var(...)` spelled out, not the `[--dur-ui]` shorthand used elsewhere
         * in this codebase. Tailwind v4 dropped that shorthand, so
         * `duration-[--dur-ui]` compiles to the literal `transition-duration:
         * --dur-ui`, which is invalid and silently resolves to 0s. Checked in the
         * built stylesheet, not assumed.
         */
        "duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
        "hover:border-steel hover:shadow-elev-3 " +
        // The lift is motion, so it waits to be asked for.
        "motion-safe:hover:-translate-y-1"
      }
    >
      {/*
        4:5. The cake photo is now a real portrait food shot (~1122x1402), not a
        crop of the old 4:3 camera render — 4:3 cut the tops and bases off these.

        `cake-stage` under the image, not decoration: it is the same ivory sweep
        the photograph is shot against, so the well matches the picture that is
        about to land in it instead of flashing a different colour first.
      */}
      <div className="cake-stage relative aspect-[4/5] overflow-hidden border-b border-rule">
        <Image
          src={`/presets/${preset.slug}.webp`}
          alt={preset.name}
          fill
          sizes="(min-width:1280px) 25vw, 50vw"
          /* The push-in used to happen inside the scene — see three/Turntable —
             because scaling a canvas resamples a frame that has already been
             drawn. A bitmap has no such objection, and the well clips, so a plain
             transform is the whole of it. Motion, so it waits to be asked for. */
          className={
            "object-cover transition-transform duration-[400ms] ease-[var(--ease-out)] " +
            "motion-safe:group-hover:scale-[1.02]"
          }
        />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-5 sm:p-6">
        <span className="font-mono text-micro tracking-[0.14em] text-steel uppercase">
          {servingsLabel(preset.config)}
        </span>

        <h3 className="font-sans text-group font-medium tracking-[-0.008em]">
          {preset.name}
        </h3>

        <p className="flex-1 text-body leading-relaxed text-steel">{preset.blurb}</p>

        {/* Price and CTA on one line under a rule: the price is the fact, the
            button is the action, and stacked full-width they made the card
            bottom-heavy and left the two competing. */}
        <div className="mt-1 flex items-center gap-3 border-t border-rule pt-4">
          <span className="font-mono text-body font-bold tabular-nums">
            {formatINR(priceCake(preset.config).total)}
          </span>
          <Link
            href="/presets"
            /* `border-ink`, matching what the button does under its own hover.
               `border-rule-strong` — the first choice — is the colour it already
               is at rest, so the "subtle CTA transition" was a no-op. */
            className={btn("secondary", "md", "ml-auto group-hover:border-ink")}
          >
            Make it mine
          </Link>
        </div>
      </div>
    </li>
  );
}
