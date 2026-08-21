import Link from "next/link";
import { PresetCakeViewer } from "@/components/PresetCakeViewer";
import type { Shot } from "@/components/three/CakeScene";
import { formatINR } from "@/lib/format";
import type { Preset } from "@/lib/presets";
import { priceCake } from "@/lib/pricing";
import { servingsLabel } from "@/lib/servings";
import { btn } from "@/lib/ui";

/**
 * One preset, shot like a page from a catalogue rather than logged like a
 * product.
 *
 * The cards were not cheap because the renderer is cheap — the hero uses the
 * same one. They were cheap because all three were the *same photograph*: one
 * camera height, one distance, one `max(needV, needH)` fit that centres the cake
 * and leaves a margin on every side. Three cakes in three identical frames read
 * as three placeholders no matter how good each cake is.
 *
 * So each one gets a shot of its own — see three/CakeScene.Shot — and they differ
 * in the things a photographer would change: where the camera stands, how tight
 * the crop is, which way the cake is turned, and where in the frame it sits.
 * Nothing here touches a preset's config, so the cake on the card is exactly the
 * cake the CTA hands to the builder.
 *
 * The cakes turn now — see components/PresetCakeViewer — and these crops survive
 * that untouched, which is worth saying because in general they would not. A
 * frame this tight is only safe when the silhouette is known, and a cake on a
 * turntable normally shows a different one every second. All three of these
 * presets are `round`: a cylinder's outline does not change as it spins, so the
 * only things whose profile moves are the drips and the scattered curls, and both
 * live well inside the crop. The eight-up catalogue has a hexagon and a square in
 * it and cannot make that assumption — which is why app/presets frames on
 * `contain` instead of borrowing these.
 */
interface Art extends Shot {
  /**
   * The wash behind the cake. Same paper, three lighting set-ups: warmer and
   * deeper behind the chocolate, higher and cooler behind the cream. One shared
   * backdrop was the other half of why the row read as repetition.
   */
  backdrop: string;
}

const ART: Record<string, Art> = {
  /*
   * Dramatic close-up. Low enough that the ganache rim runs across the frame with
   * the drips hanging under it, turned left so the light rakes the near shoulder,
   * and cropped — a drip cake is read along its top edge, not from a polite
   * distance. Over-exposed a third of a stop, like the hero, because set
   * chocolate photographed for pale buttercream comes out as a black wall.
   */
  "classic-truffle": {
    /*
     * 19 degrees, not 13. Lower was more dramatic and left the top of the cake a
     * bare dark disc: the chocolate curls are a `top-ring`, they lie flat, and at
     * 13 degrees the ganache rim stood in front of them entirely. A close-up of a
     * decorated cake that shows none of the decoration is just a close-up of a
     * wall.
     */
    elevation: 0.33,
    azimuth: -0.46,
    /*
     * `contain`, not the `height` fit with a 1.20 fill this used to run. That put
     * the cake at 105% of the frame width — the near shoulder deliberately out of
     * shot — and what it actually produced was a featureless brown wall. The angle
     * and the exposure are what make this card its own photograph; the crop was
     * never doing that work, it was only hiding the cake.
     */
    fit: "contain",
    fill: 1.22,
    offsetX: 0.12,
    offsetY: 0.24,
    exposure: 1.2,
    backdrop:
      "bg-[radial-gradient(64%_56%_at_34%_28%,#F3E8D6_0%,#E2D5C0_54%,#CBBBA2_100%)]",
  },

  /*
   * The whole cake, board and all, and the only one of the three that is not
   * cropped — the brief for this one is airy and seasonal, and air means letting
   * the silhouette close. Higher than the others so the ring of strawberries on
   * top reads as fruit rather than as a red edge, and sat left of centre.
   */
  "strawberry-cream": {
    /*
     * The highest of the three, but pulled back from 29 degrees to 23. Up there
     * the frame filled with flat white top and the cake read as exactly the
     * generic white tier the brief warns about; lower, the rustic finish's ridges
     * run down the side and it reads as piped cream, which is what it is.
     */
    elevation: 0.4,
    azimuth: 0.34,
    /*
     * `contain` now fills both axes, which it could not do in the 4:5 frame this
     * note used to be arguing about — there it capped out at 72% of the width and
     * 58% of the height, and that empty backdrop was the reason the fit was
     * abandoned for a crop. In a 4:3 well the same fit lands around 85% both ways.
     */
    fit: "contain",
    fill: 1.22,
    offsetX: -0.12,
    offsetY: 0.24,
    exposure: 1.06,
    /*
     * The deepest of the three backdrops, which is the opposite of the instinct.
     * An ivory cake on near-white paper has no silhouette — it was the one card
     * where the cake dissolved into its own background, and "generic white
     * wedding cake" is what a subject with no edges looks like.
     */
    backdrop:
      "bg-[radial-gradient(58%_52%_at_62%_24%,#F0E5D3_0%,#DCCDB6_56%,#BFAC94_100%)]",
  },

  /*
   * Cut, and turned to meet the cut. `geometry.DEFAULT_SLICE` centres the wedge
   * 0.34rad off the front and `phiOf` measures from +Z, so an azimuth of the same
   * 0.34 puts the open face square to the lens. Low, because the layers are on
   * the wall of the cake and not its top — this is the one card where the red
   * velvet itself is visible rather than implied by a name.
   */
  "red-velvet-classic": {
    elevation: 0.26,
    /*
     * 0.54, a fifth of a radian off the wedge's own centre line rather than
     * square to it. Dead-on, the two cut walls mirror each other into a symmetric
     * V and the card reads as a cross-section diagram. Off-axis it reads as a
     * slice having been taken, and the combed side of the cake comes back into
     * shot behind it. The wedge spans 0.34 ± 0.24rad, so this still looks into it.
     */
    azimuth: 0.54,
    /*
     * The card that lost most to the crop. Cut is the whole point of this one, and
     * at a 1.34 fill on a height fit the open face sat outside the frame: what was
     * left on screen was a white wall with a red speck over the top edge. Framed
     * whole, the wedge reads as a wedge.
     *
     * Tighter than the other two at 1.15, because this is the lowest camera on
     * the row — 15 degrees against 19 and 23 — and a cake seen from lower down is
     * apparently shorter. At the shared 1.22 it measured 71% of the frame height
     * where its neighbours were 80 and 87, and next to them it read as the small
     * one rather than the low one. It is width-bound, so this is as close as it
     * goes before the board starts leaving the frame.
     */
    fit: "contain",
    fill: 1.15,
    offsetX: 0.08,
    offsetY: 0.24,
    // Not over-exposed, unlike the chocolate: red velvet at #8B2E20 goes
    // vermilion when it is pushed, and the brief asks for burgundy.
    exposure: 1.0,
    sliced: true,
    backdrop:
      "bg-[radial-gradient(60%_54%_at_44%_32%,#F2E6D8_0%,#DFD1BF_54%,#C6B49F_100%)]",
  },
};

/** Anything without art direction still gets a card, just the plain record shot. */
const FALLBACK: Art = {
  elevation: 0.38,
  azimuth: 0,
  fit: "contain",
  fill: 1.22,
  offsetX: 0,
  offsetY: 0.24,
  exposure: 1.05,
  backdrop:
    "bg-[radial-gradient(58%_48%_at_50%_32%,#F7F2E7_0%,#EAE4D6_54%,#D9D3C4_100%)]",
};

export function PresetCard({ preset }: { preset: Preset }) {
  const art = ART[preset.slug] ?? FALLBACK;

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
        4:3, the same well the eight-up catalogue uses, and for the same measured
        reason: a single-tier cake on its board projects about 1.35 wider than it
        is tall at this camera height.

        This was 4:5. A portrait frame cannot hold a squat subject — fitted, the
        cake filled 95% of the width and 61% of the height and the rest was empty
        backdrop; cropped to kill the emptiness, it filled 105% and the cake left
        the frame. The three cards shipped cropped, and a close-up that tight
        stops reading as a cake at all: card one was a brown wall, card three a
        white one with a red speck on it. Neither the fit nor the crop was wrong —
        the aspect was, and both were symptoms.
      */}
      <div className={`relative aspect-[4/3] overflow-hidden border-b border-rule ${art.backdrop}`}>
        {/* The hover push-in happens in the scene — see three/Turntable — rather
            than by scaling this element. Scaling the canvas resamples a frame that
            has already been rendered, and the well clips, so a tight crop lost its
            near edge on hover. */}
        <PresetCakeViewer config={preset.config} shot={art} />
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
