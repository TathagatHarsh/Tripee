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
      {/* Warm key — the sun through a kitchen window.
          Re-aimed to §5.2's azimuth 40° / elevation 55°, at the same distance from
          the cake (was 46.6° / 47.5°). Higher and more frontal: a steeper key is
          what puts the top edge of every tier in light and drops the wall away
          from it, and it shortens the cast shadow into a contact shadow rather
          than a long diagonal across the board. */}
      <directionalLight
        position={[2.7, 6.0, 3.22]}
        intensity={2.6}
        /* §5.2: KEY 5200K. Warm-neutral rather than the #FFF1DC amber it was —
           5200K is nearly white with the warmth carried in the red channel only,
           which is what lets frosting be both warm and legibly white. */
        color="#FFF4E8"
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
          white — and it is genuinely cool rather than a warm grey pretending to be.

          §5.2 puts the fill at 0.22 of the key, where this was at 0.40. Fill is
          what flattens form: a cake lit from every side has no shadow side, so it
          has no volume. Down to 0.57 (0.22 × 2.6), which is the document's ratio
          against the key's existing absolute value.

          §5.2 puts the FILL at 4400K — *warmer* than the key, not cooler. That
          only works once the paper is cool, which it now is (§1.2, #E8E7E1), and
          it is why this changed in item 5 rather than item 1. Against a cool
          grey-white page a warm cake separates as food; against the old #FDFCFA
          warm-white it muddied into the background, which is the beige reading
          the previous cool fill was fighting. The page is doing the white balance
          now, so the rig no longer has to. */}
      <directionalLight position={[-3.4, 1.6, 3.2]} intensity={0.57} color="#FFE2C4" />

      {/* Rim — silhouette separation only, per §5.2, which is a narrower job than
          this light used to have.

          Dropped to elevation 15° from 37.6°. A high rim washes down the shadow
          side and undoes the fill's work; a low one grazes the side wall and draws
          the outline, which is the whole of what it is for. Intensity to §5.2's
          0.12 of key = 0.31, with the hero keeping a little more because it is the
          only thing separating a #3B2318 cake from the page behind it. */}
      {/* §5.2: RIM 6200K, cool. It was warm, which put it on the same side of the
          spectrum as the key and left it flattering the cake rather than cutting it
          out. Cool against a warm subject is what a rim light is for — it reads as
          daylight from a window behind the bench, and it is now the only cool
          source in the rig. */}
      <directionalLight
        position={[-2.2, 1.62, -5.61]}
        intensity={hero ? 0.42 : 0.31}
        color="#DCE8FF"
      />

      {/*
       * ONE soft overhead source, and nothing else in the environment.
       *
       * CARBON COPY §5.2: "No HDRI dome, no fake studio environment — an env map
       * with hard highlights is why your frosting currently looks like car
       * paint." This used to be a five-former studio: an overhead softbox, a cool
       * wall camera-left, a warm wall camera-right, a ring behind, and the worktop
       * bouncing up. Four of those five are small, bright and at grazing angles to
       * a lathe, which is the exact recipe for a hard specular streak down the side
       * of a cake — and a dielectric at roughness 0.85 has no business carrying a
       * streak at all.
       *
       * TWO survive. The window, because a room does have one and because clearcoat
       * and specularIntensity go black with nothing to reflect: ganache needs a
       * source for its wet skin and mirror glaze has to be a mirror of something.
       *
       * And a broad frontal bounce, because SECTION is the default view (§5.2 item
       * 2) and a section is a *vertical* face. With the window alone, the cut — the
       * money shot, per §5.3 — was the worst-lit surface in the frame: it went flat
       * grey, because an overhead source contributes almost nothing to a plane it
       * is parallel to. This is the photographer's own reflector, standing where
       * the photographer stands. It is large, neutral and weak, so at the roughness
       * values §5.3 now mandates it physically cannot produce a hard streak — which
       * is what §5.2 was actually objecting to. Small, bright, grazing sources are
       * what make car paint, and those are the four that are gone.
       */}
      <Environment resolution={256} environmentIntensity={0.4}>
        <Lightformer
          form="rect" intensity={2.3} color="#FFFAF2"
          position={[0, 5, 1]} rotation={[-Math.PI / 2, 0, 0]} scale={[9, 9, 1]}
        />
        <Lightformer
          form="rect" intensity={1.0} color="#F4F2EE"
          position={[0, 1.4, 6]} scale={[10, 7, 1]}
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

/*
 * The ambient stays cool, and it is the one source that ignores §5.2.
 *
 * §5.2 describes three lights and does not mention an ambient, because an ambient
 * is not a light — it is the floor under the shadows. Shadows in a kitchen are lit
 * by the sky through the window, so cool is physically right, and at 0.1 it is
 * doing nothing to the white balance the key and fill have settled between them.
 */
