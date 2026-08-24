"use client";

import { LazyCakeScene } from "@/components/three/LazyCakeScene";
import type { Shot } from "@/components/three/CakeScene";
import type { QualitySettings } from "@/lib/quality";
import type { CakeConfig } from "@/lib/schema";

/**
 * The studio the catalogue is photographed in.
 *
 * This is not a page anybody visits — it exists so `scripts/shoot-presets` has
 * something to point a camera at. One preset, one cake, one well, no chrome.
 *
 * It draws the *same* `CakeScene` the builder and the shared-design page draw,
 * from the preset's own `CakeConfig`, which is the whole point: the photograph
 * on a card has to be the cake "Make it mine" loads, or the card is a lie. The
 * only things this route changes are the ones a photographer changes — where the
 * camera stands and how good the film is.
 */

/**
 * 4:3, matching the card well exactly, because `Framing` solves the fit against
 * the canvas aspect — photograph a cake in a square and it arrives in a 4:3 card
 * either cropped or floating.
 *
 * 720x540 CSS at `deviceScaleFactor: 2` is a 1440x1080 render. The widest a card
 * well actually gets is ~310px CSS, so even a 3x phone asks for ~930px; 1440
 * leaves headroom for a wider layout later without paying for pixels nobody
 * requests, and next/image resamples down per `sizes` anyway.
 */
export const STAGE = { width: 720, height: 540 } as const;

/**
 * The catalogue shot. One camera for all twenty, and the reasoning is the same
 * as the live gallery's was: a customer choosing between twenty cakes is choosing
 * the cake, not the crop, and a lens that changes per row makes every difference
 * on the page ambiguous — is that cake wider, or just closer?
 */
const SHOOT_SHOT: Shot = {
  /*
   * 23 degrees above the horizon, carried over from the live gallery shot where
   * it was measured: high enough that a top-ring of strawberries or a scatter of
   * sprinkles reads as decoration rather than as a coloured edge, low enough
   * that the drips, the combed sides and the second tier keep their height.
   */
  elevation: 0.4,
  /*
   * 24 degrees round, where the gallery shot was square-on.
   *
   * On eighteen of the twenty this is invisible — a cylinder has the same
   * outline from every side, and all it moves is which drip faces the lens. It
   * is here for the two that are not cylinders: square-on, the square cake reads
   * as a flat slab and the hexagon as a badly-drawn circle, and both need two
   * faces in shot before the shape is legible at card size.
   *
   * 24 rather than the 45 a product shot would normally use, because the two
   * presets carrying a message plaque are read as well as looked at, and a
   * plaque turned 45 degrees off the lens is decoration rather than words.
   */
  azimuth: 0.42,
  /*
   * `contain` fits both axes off `cakeFocus`, whose radius is the *circum*radius
   * — the one extent that does not change as a square or a hexagon turns. That
   * mattered when these cakes were on turntables and it still matters here: it is
   * what makes one number frame all twenty.
   */
  fit: "contain",
  /*
   * Air. `fill` multiplies the distance that just contains the cake, so this is
   * "how much further back than the tightest possible frame".
   *
   * The live gallery ran 1.22 and the cake filled about 90% of the frame both
   * ways — a catalogue thumbnail, where every pixel has to work. A photograph
   * wants the opposite, so this is calibrated to put the cake at roughly 70% of
   * the frame height with the rest as breathing room. Measured off the rendered
   * silhouette by `scripts/shoot-presets`, which prints the fraction it got and
   * complains when a cake lands outside the band — not reasoned about.
   */
  fill: 1.56,
  offsetX: 0,
  /*
   * A small lift, because `Framing` aims at `height * 0.53` while the cake's own
   * middle is at `height * 0.5`, and the board and its contact shadow hang below
   * the cake — so a cake that is mathematically centred sits visibly low. Same
   * measured-not-argued treatment as `fill`.
   */
  offsetY: 0.32,
  exposure: 1.07,
};

/**
 * Where one cake needs a different print from the rest. Carried over from the
 * live gallery, where each of these was measured against the render, and every
 * one of them is a *correction* rather than art direction: the camera, the lens,
 * the lights, the backdrop and the frame are shared, and a darkroom print is not
 * a second opinion about how a cake should look.
 *
 * **Exposure.** A dark subject metered for a pale one comes out as a black wall.
 * Set ganache is #3B2318 — 16% lightness — so the four cakes coated in it take a
 * third of a stop over. The tiramisu is the interesting one:
 * its coat is cream cheese at #8A6A52, which is 43% lightness and therefore only
 * about half as dark, so it takes about half the push. Copying 1.2 onto it blew
 * the cocoa out to a milky tan and lost the espresso the whole cake is named for.
 */
const TRIM: Record<string, Partial<Shot>> = {
  "classic-truffle": { exposure: 1.2 },
  "chocolate-truffle": { exposure: 1.2 },
  "death-by-chocolate": { exposure: 1.2 },
  /* Coated dark now rather than creamed white — see the note in lib/presets — so
     it joins the ganache cakes on the same third of a stop. */
  "black-forest": { exposure: 1.2 },
  "tiramisu-chocolate": { exposure: 1.12 },
};

/**
 * The film. Every field of `QualitySettings` is pinned, which is the point:
 * `useQuality` samples the frame rate and drops to `LOW` on anything slow, and
 * SwiftShader is by a distance the slowest thing this scene has ever run on — so
 * left alone, the highest-quality render in the project would come out as the
 * lowest. `budget` spreads over the measurement, so pinning all seven fields
 * takes the measurement out of the decision entirely.
 *
 * Nothing here is affordable live. `segments: 128` is what removes the faceting
 * from a cylinder's silhouette at 1440px, `shadows` is what the card renders
 * never had (see quality.CARD_BUDGET — twelve shadow-casting canvases on one
 * page is not a thing you ship), and the shadow map behind it is already 2048².
 * Offline, a frame can cost a second.
 */
const SHOOT_BUDGET: Partial<QualitySettings> = {
  tier: "high",
  dpr: [2, 2],
  segments: 128,
  shadows: true,
  contactShadows: true,
  maxInstances: 120,
  antialias: true,
};

export function ShootStage({ slug, config }: { slug: string; config: CakeConfig }) {
  const trim = TRIM[slug];
  const shot = trim ? { ...SHOOT_SHOT, ...trim } : SHOOT_SHOT;

  return (
    <div
      data-shoot-stage
      style={{ width: STAGE.width, height: STAGE.height }}
      /* `cake-stage` — the same warm ivory sweep the card wells already carry, so
         the backdrop baked into the photograph and the placeholder behind it
         while it loads are the same gradient rather than two near-misses. */
      className="cake-stage relative overflow-hidden"
    >
      {/*
        `interactive`, on a page with no user, purely for the frame loop: without
        it or `autoRotate` the canvas is `frameloop="demand"` and draws when
        something asks it to, which is not a thing a screenshot can wait for. With
        it the loop runs continuously and the environment cubemap, the contact
        shadow pass and the camera all converge — and the shoot script runs under
        `reducedMotion: "reduce"`, which snaps the camera instead of easing it and
        keeps `OrbitControls` from turning the cake. Nothing touches the controls,
        so nothing moves.

        No `turntable`, no `hero`, no `followView`: a turntable would give every
        preset a different azimuth, and `followView` would let a stale `useView`
        slice a cake nobody asked to cut.
      */}
      <LazyCakeScene
        config={config}
        interactive
        autoRotate={false}
        shot={shot}
        budget={SHOOT_BUDGET}
      />
    </div>
  );
}
