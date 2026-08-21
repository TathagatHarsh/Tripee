"use client";

import { Environment, Lightformer } from "@react-three/drei";

/**
 * Food-photography lighting: a large soft key from above, a bounce fill so
 * shadows never go black, and a rim that fakes the subsurface glow at the
 * silhouette. Light from below alone is what makes things look like horror props
 * — there is none of it here.
 *
 * The environment is built from lightformers rather than an HDR file: no network
 * fetch, no 3MB download, and the reflections are art-directed.
 *
 * WHITE BALANCE. Every source in this rig used to be warm — key #FFF4E2, fill
 * #DCE4F0 at under a quarter of the key, rim #FFD9A8, ambient #FFF0DE, and all
 * five lightformers between #FFE0BA and #FFF6E8. With nothing cool anywhere, white
 * frosting has no way to render as white; it can only come out cream, and the
 * whole cake with it. That is what the "overly yellow/beige" reading is, and it is
 * a white-balance fault rather than an exposure one.
 *
 * The fix is the one a photographer would use: keep the key warm, because a warm
 * key is what makes food look appetising, and make the *fill* properly cool and
 * strong enough to be seen. The eye reads the average as neutral, and reads the
 * separation between warm light and cool shadow as form. Both improve at once.
 *
 * CONTRAST. Three directionals summing to 3.85, plus 0.55 of environment, plus
 * 0.18 of ambient, is a great deal of fill — and fill is what flattens form. A
 * cake lit from every side has no shadow side, so it has no volume. The total
 * comes down; the ratio between key and fill goes up.
 */
export function CakeLighting({
  shadows = true, hero = false,
}: {
  shadows?: boolean;
  /**
   * One nudge for the landing hero, whose cake is dark ganache rather than pale
   * frosting: a stronger rim, because a near-black cake on a cream page has no
   * silhouette until something draws its top edge.
   *
   * It was more than one nudge. The reasoning — a dark dielectric is nearly all
   * specular, so cool fill only lifts its blacks into grey — is true as far as it
   * goes, and acting on it made the cake worse: with the fill cut and the warm
   * sources raised, the wall ran from a blown highlight straight to black with no
   * chocolate anywhere between, and a dark surface with no diffuse midtones is
   * not chocolate, it is chrome. The fill was carrying the *colour*. The rest of
   * this rig was already right for a cake of any shade.
   */
  hero?: boolean;
}) {
  return (
    <>
      {/* Warm key — the sun through a kitchen window */}
      <directionalLight
        position={[3.6, 5.4, 3.4]}
        intensity={2.6}
        color="#FFF1DC"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        /*
         * The frustum was ±4 on both axes: eight world units of shadow map for a
         * cake at most 3.4 across, so two thirds of the map's area was spent on
         * empty space and one texel came out at about 4mm of real cake. A contact
         * shadow is a millimetre-scale gradient, so at that resolution there was
         * nothing to see where a tier met the board. Tightened to the cake, its
         * board, and the throw of its own shadow: a little over three times the
         * texel density from the same 2048² map, for free.
         */
        shadow-camera-left={-2.6}
        shadow-camera-right={2.6}
        shadow-camera-top={3.4}
        shadow-camera-bottom={-2.2}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        /*
         * Radius 6 on a soft (PCF) map is a six-texel blur, which at the old
         * frustum was a 24mm smear — no edge anywhere along the shadow's length,
         * near the cake or far from it. 3 keeps the softness that stops it looking
         * like a video game while letting the contact edge resolve.
         */
        shadow-radius={3}
      />

      {/* Cool bounce fill. This is the light that lets white frosting read as
          white, so it is no longer a quarter of the key's strength — and it is
          genuinely cool rather than a warm grey pretending to be. */}
      <directionalLight position={[-3.4, 1.6, 3.2]} intensity={1.05} color="#BFD2EE" />

      {/* Warm rim — fakes subsurface glow at the silhouette. Raised and pushed
          further behind, so it draws the top edge rather than washing across the
          shadow side and undoing the fill's work.

          On the hero it is doing structural work rather than flattery: it is the
          only thing separating a #3B2318 cake from the cream page behind it, and
          it is what puts the wet highlight along the top of every comb ridge and
          down the drips. */}
      <directionalLight
        position={[-1.8, 3.8, -4.6]}
        intensity={hero ? 1.0 : 0.8}
        color="#FFDCAE"
      />

      <Environment resolution={256} environmentIntensity={0.5}>
        {/* Big soft overhead source — the window. Nearly neutral, because this is
            the largest single contributor to every reflection in the scene and a
            cream-coloured softbox tints the entire cake. */}
        <Lightformer
          form="rect" intensity={2.3} color="#FFFAF2"
          position={[0, 5, 1]} rotation={[-Math.PI / 2, 0, 0]} scale={[9, 9, 1]}
        />
        {/* Cool wall bounce, camera left — the shadow side. */}
        <Lightformer
          form="rect" intensity={1.1} color="#CBDCF4"
          position={[-5, 1.5, 2]} rotation={[0, Math.PI / 2, 0]} scale={[7, 5, 1]}
        />
        {/* Warm wall bounce, camera right — the key side. */}
        <Lightformer
          form="rect" intensity={0.6} color="#FFE9CE"
          position={[5, 1.5, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[7, 5, 1]}
        />
        {/* Behind, to lift the silhouette off the background. */}
        <Lightformer
          form="ring" intensity={0.75} color="#FFE4C4"
          position={[-1.5, 2.5, -5]} scale={[4, 4, 1]}
        />
        {/* The worktop itself, bouncing a little warmth back up. Kept weak: a
            strong uplight fills in the shadow under the board and undoes the
            grounding that everything else here is working to build. */}
        <Lightformer
          form="rect" intensity={0.22} color="#E8E2D6"
          position={[0, -1.5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]}
        />
      </Environment>

      {/* Ambient is the floor under the shadows, not a light source — so it is the
          first thing to cut when the cake needs form, and it is cool for the same
          reason the fill is: it lands in the shadows, and shadows outdoors and in a
          kitchen alike are lit by the sky. */}
      <ambientLight intensity={0.1} color="#E4EAF4" />
    </>
  );
}
