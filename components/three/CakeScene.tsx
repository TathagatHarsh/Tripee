"use client";

import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CakeConfig } from "@/lib/schema";
import { useQuality, type QualitySettings } from "@/lib/quality";
import { useView } from "@/lib/view";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Cake, cakeFocus, type CakeReveal } from "./Cake";
import { HeroMotion } from "./HeroMotion";
import { CakeLighting } from "./Lighting";
import { Turntable, type TurntableDrive } from "./Turntable";

interface Props {
  config: CakeConfig;
  /** Auto-rotate belongs on the review screen only. */
  autoRotate?: boolean;
  className?: string;
  interactive?: boolean;
  /**
   * Track the shared view state — the cutaway toggle and whether the message is
   * still being typed. Off for gallery and share previews, which show the cake
   * as ordered rather than as it is being edited.
   */
  followView?: boolean;
  /**
   * Shoot it as a product hero: its own light balance, and the entrance, breath
   * and pointer parallax of three/HeroMotion. The landing page and nothing else.
   */
  hero?: boolean;
  /**
   * Stand it on a turntable — one slow revolution, a little faster under the
   * pointer. The preset cards, and nothing else; see three/Turntable.
   *
   * `active` is a prop because starting and stopping the frame loop is a render's
   * worth of work and happens twice a scroll. `drive.hovered` is a ref because it
   * is read sixty times a second and must never cost a render at all.
   */
  turntable?: { drive: RefObject<TurntableDrive>; active: boolean };
  /**
   * Cap what this canvas may spend, over whatever the device measured. A page
   * with eight cakes on it cannot give each the budget of a page with one — see
   * quality.CARD_BUDGET.
   */
  budget?: Partial<QualitySettings>;
  /**
   * How to photograph it. Omitted, a cake gets the plain three-quarter record
   * shot the builder wants; the hero and the preset cards each hand in their own.
   */
  shot?: Shot;
}

/**
 * How a cake is photographed: where the camera stands, how much of the frame the
 * cake fills, where it sits in that frame, and what the print is exposed for.
 *
 * One object rather than a boolean per screen and a ternary per property, which
 * is the direction this file was going. A shot is the unit a photographer thinks
 * in, so it is the unit the scene takes.
 */
export interface Shot {
  /** Above the horizon, radians. Low reads dramatic; high shows the top. */
  elevation: number;
  /** Round the cake from front-on, radians. Front is 0, positive swings right. */
  azimuth: number;
  /**
   * `contain` keeps everything inside the frame, taking whichever of width or
   * height needs more room. `height` fits the height alone and lets the sides
   * fall where they may — which is the only way a portrait frame is ever filled
   * by a subject that is wider than it is tall. Whether that actually crops is
   * then down to `fill`, which is the honest place for the decision.
   */
  fit: "contain" | "height";
  /** Multiplier on that fit. Above 1 is air around the cake, below 1 is tighter. */
  fill: number;
  /** Slides the cake off the frame's centre line, in cake radii. */
  offsetX: number;
  /**
   * Raises the cake in the frame, in cake radii. Positive is up.
   *
   * The vertical twin of `offsetX`, and it was missing. `Framing` lifts its
   * look-at to a fixed fraction of the cake's height — the right instinct, since
   * a cake is widest at the bottom and centring its geometry leaves the
   * composition bottom-heavy — but one fraction cannot suit every frame shape.
   * In a frame wider than the cake is tall the fit is bound by the width, the
   * vertical margin is whatever is left over, and that lift spends all of it
   * above the cake: measured on the presets page, a sixth of the frame sat empty
   * over the top while the board's near edge was cropped off the bottom.
   *
   * Moves the subject, not the camera — like `offsetX`, and for a reason worth
   * writing down. Nudging the look-at instead is the obvious move and it does not
   * behave: `Framing` pins the camera's distance from the *origin* while
   * OrbitControls keeps it a fixed offset from its *target*, so dropping the
   * target drags the camera down with it and changes the subject's size as a side
   * effect. Moving the cake is a plain vertical translation with nothing else
   * attached to it.
   *
   * Optional, and zero by default, so every existing screen composes exactly as
   * it did.
   */
  offsetY?: number;
  /** Tone-mapping exposure. A dark cake needs more of it than a pale one. */
  exposure: number;
  /** Cut a wedge out, so the sponge and the filling read. */
  sliced?: boolean;
}

/**
 * Cakes are photographed from three-quarters, slightly above eye level, looking
 * slightly down. A 35mm-equivalent field of view keeps the proportions honest —
 * wide angles distort food and make it look wrong.
 */
const CAMERA_START: [number, number, number] = [0, 2.2, 5.5];

/**
 * The hero sits higher — 31 degrees above the horizon against 22.
 *
 * The builder's rig is right for the builder: most of the nine choices are about
 * the *side* of the cake, so the camera stays low enough to give the wall its
 * full height. The hero's subject is the top: a plaque with words on it, berries
 * and standing shards. At 22 degrees a flat plaque is foreshortened to a third
 * of its depth and the lettering closes up into a smudge, which is a strange way
 * to photograph the one part of a cake that is addressed to someone.
 *
 * Still a three-quarter view, not a plan view. The drip and the comb lines are
 * the other half of the look and both live on the wall.
 */
const HERO_CAMERA: [number, number, number] = [0, 3.1, 5.2];

/**
 * How far above the horizon a rig sits. Derived from the rig rather than written
 * down a second time and left to drift.
 */
const elevationOf = (p: readonly [number, number, number]) =>
  Math.atan2(p[1], Math.hypot(p[0], p[2]));

/** The record shot: the whole cake, front on, with air around it. */
const PLAIN_SHOT: Shot = {
  elevation: elevationOf(CAMERA_START),
  azimuth: 0,
  fit: "contain",
  /*
   * 1.26 filled the frame edge to edge and 1.4 pushed the cake into the middle
   * distance: on the landing hero it occupied under half the height of its own
   * square and the rest was empty page. 1.22 keeps a clear margin — the cake
   * still sits on a table rather than being a cut-out — while making it the
   * subject.
   */
  fill: 1.22,
  offsetX: 0,
  /* §5.2: ACES, exposure 1.0. This was 1.05 — a twentieth of a stop over, which
     was compensating for a fill and an environment that have both since come
     down. HERO_SHOT keeps its own correction; see the note there. */
  exposure: 1.0,
};

/**
 * The hero: higher, and tighter in the frame.
 *
 * A third of a stop over, too. The hero's cake is dark ganache — an albedo at 16%
 * lightness, under a key that has to clear the top tier before it reaches the
 * base one. Exposed for pale buttercream it came out as a bright rim over a black
 * wall, with the comb texture and the chocolate colour both lost in the shadow.
 * This is the correction a photographer makes for a dark subject, and it is
 * cheaper and more honest than bending the light rig around one cake.
 *
 * The tighter fit is affordable only because the air is already in the page: that
 * column has a pool of light round the cake and generous margin either side, so
 * 22% of *frame* margin on top of it left the cake small in a lot of nothing.
 */
const HERO_SHOT: Shot = {
  elevation: elevationOf(HERO_CAMERA),
  azimuth: 0,
  fit: "contain",
  fill: 1.16,
  offsetX: 0,
  exposure: 1.16,
};

/**
 * A camera position for a shot, at roughly the distance `Framing` will settle on.
 *
 * Roughly is enough — Framing corrects the length on mount — but it must not be
 * a unit vector, or the first frame of a demand-driven canvas renders with the
 * lens inside the cake before the correction lands.
 */
const NOMINAL_DISTANCE = 5.9;

function cameraFor({ elevation, azimuth }: Shot): [number, number, number] {
  const flat = Math.cos(elevation) * NOMINAL_DISTANCE;
  return [
    Math.sin(azimuth) * flat,
    Math.sin(elevation) * NOMINAL_DISTANCE,
    Math.cos(azimuth) * flat,
  ];
}

export function CakeScene({
  config, autoRotate = false, className, interactive = true, followView = false,
  hero = false, shot, turntable, budget,
}: Props) {
  const measured = useQuality();
  /* The device's own measurement, then the screen's ceiling on top of it. Only
     ever narrower than what was measured — see quality.CARD_BUDGET. */
  const q = useMemo(
    () => (budget ? { ...measured, ...budget } : measured),
    [measured, budget],
  );
  const reduced = useReducedMotion();
  const framing = shot ?? (hero ? HERO_SHOT : PLAIN_SHOT);
  const cutByView = useView(s => s.sliced) && followView;
  const sliced = cutByView || !!framing.sliced;
  const composing = useView(s => s.composingMessage) && followView;

  /* Off-centre is expressed in radii, both ways, so a shot composes the same
     whatever size cake it is pointed at. */
  const offset = useMemo(() => {
    const { radius } = cakeFocus(config);
    return [framing.offsetX * radius, (framing.offsetY ?? 0) * radius] as const;
  }, [framing.offsetX, framing.offsetY, config]);
  /* The hero hands its entrance state in; everything else passes nothing and
     gets a cake that simply stands there. */
  const cake = (reveal?: RefObject<CakeReveal>) => (
    <Cake
      config={config}
      segments={q.segments}
      castShadow={q.shadows}
      maxInstances={q.maxInstances}
      sliced={sliced}
      composingMessage={composing}
      reveal={reveal}
    />
  );

  return (
    <Canvas
      /* §5.2's 2% film grain. The class lands on Canvas's own outer div, which
         already carries position:relative and overflow:hidden — see the utility. */
      className={`film-grain ${className ?? ""}`}
      shadows={q.shadows ? "soft" : false}
      dpr={q.dpr}
      gl={{
        antialias: q.antialias,
        toneMapping: THREE.ACESFilmicToneMapping,
        // Without ACES the highlights clip to white and the frosting loses form.
        toneMappingExposure: framing.exposure,
      }}
      camera={{ position: cameraFor(framing), fov: 35, near: 0.1, far: 60 }}
      /*
       * A still cake does not need 60 frames a second. The landing page mounts
       * four of these canvases and the presets page eight; on "always" that was
       * eight render loops running flat out behind a page where nothing moves,
       * which is how a laptop fan tells a customer the site is cheap. Anything
       * that is not being dragged or deliberately spinning renders on demand.
       */
      frameloop={interactive || autoRotate ? "always" : "demand"}
    >
      <Suspense fallback={null}>
        <CakeLighting shadows={q.shadows} hero={hero} />

        <group position={[offset[0], -0.55 + offset[1], 0]}>
          {/* The same cake in all three cases. The hero gets its arrival and its
              parallax, a preset card gets its turntable, and everywhere else it
              simply stands there and is looked at. */}
          {hero ? (
            <HeroMotion tiers={config.tiers}>{cake}</HeroMotion>
          ) : turntable ? (
            <Turntable drive={turntable.drive} active={turntable.active}>
              {cake()}
            </Turntable>
          ) : (
            cake()
          )}

          {/* The board mesh occupies y ∈ [-0.05, 0]. The shadow plane used to sit
              at -0.048, i.e. *inside* it, so the only shadow in the scene was
              drawn underneath an opaque disc and the cake appeared to float on
              nothing. It belongs just below the board, where the pool of dark
              can spread past the board's edge and give the cake a base. */}
          {/* Tightened rather than strengthened. At scale 6 this plane covered
              nearly three times the board's own footprint, so its 512² map spent
              most of its resolution on empty floor and the pool it drew had no
              edge — a wide grey haze reads as fog, not as an object resting on a
              surface. The cake's own contact with the *board* is baked now (see
              CakeBoard → bakeOcclusion), which leaves this pass the one job it can
              do well: putting the board on the worktop. */}
          {q.contactShadows && (
            <ContactShadows
              position={[0, -0.056, 0]}
              opacity={0.62}
              scale={3.6}
              blur={1.5}
              far={1.1}
              resolution={q.tier === "high" ? 512 : 256}
              color="#31261C"
            />
          )}
        </group>

        {/* On a demand-driven canvas useFrame only runs on the frames that are
            actually drawn, so there is nothing to ease over. Snap instead. */}
        <Framing config={config} animate={interactive || autoRotate} shot={framing} />

        <OrbitControls
          enablePan={false}
          /*
           * Off on the hero, so the wheel still belongs to the document. A
           * full-height hero that eats the scroll to zoom a cake is a hero
           * nobody gets past.
           */
          enableZoom={interactive && !hero}
          enableRotate={interactive}
          /* Gentler on the hero. At full speed a flick of the wrist turns the
             cake most of the way round, and the far side of it is the back of
             the message plaque — the one thing on this page that has to stay
             readable. Restrained is the brief. */
          rotateSpeed={hero ? 0.55 : 1}
          minPolarAngle={0.3}
          maxPolarAngle={1.45}
          minDistance={2.4}
          maxDistance={9}
          enableDamping
          dampingFactor={0.06}
          autoRotate={autoRotate && !reduced}
          autoRotateSpeed={0.4}
          makeDefault
        />
      </Suspense>
    </Canvas>
  );
}

/**
 * Keeps the whole cake in frame as it grows, easing rather than snapping. A
 * three-tier 5kg cake and a 0.5kg round need very different distances.
 */
function Framing({
  config, animate = true, shot,
}: {
  config: CakeConfig;
  animate?: boolean;
  shot: Shot;
}) {
  const initialCamera = useThree(s => s.camera);
  const reduced = useReducedMotion() || !animate;

  const size = useThree(s => s.size);
  const aspect = size.width / Math.max(1, size.height);

  const target = useMemo(() => {
    const { height, radius } = cakeFocus(config);
    const fov = (35 * Math.PI) / 180;

    // Fit vertically and horizontally, then take whichever needs more room. A
    // tall narrow canvas is constrained by width, not height, and fitting only
    // the vertical FOV crops the cake against the sides.
    const halfV = Math.tan(fov / 2);
    const halfH = halfV * aspect;

    // Board included, plus a little air. The margin is small because the fit is
    // already correct — multiplying a correct fit by 1.5 just pushes the cake
    // into the middle distance.
    // Board below, plus headroom for anything piled on top.
    const crown = config.toppings.some(t => t.placement === "crown") ? 0.34 : 0.12;
    const tall = height + 0.14 + crown;

    /*
     * The rig looks *down* at the cake, so the height is not what the frame has to
     * hold. The top rim and the board separate on screen by the height foreshortened
     * plus the depth of the cake tipped towards the lens, and fitting bare `tall`
     * under-reads that by half on a big cake. It stayed hidden for as long as width
     * was the binding constraint, which it is on every stage taller than it is wide —
     * i.e. every desktop one. Below lg the stage is short and wide, needV binds, and
     * the cake grew out of the frame.
     */
    const projectedV =
      tall * Math.cos(shot.elevation) + radius * 2 * Math.sin(shot.elevation);

    const needV = projectedV / 2 / halfV;

    /*
     * 2.34 radii is the *cake*. The widest thing in the scene is the board, which
     * geometry.boardGeometry builds at 1.3 radii, and the contact shadow spreads a
     * little past even that — so at a tight margin the board's near edge was cut off
     * on exactly the cakes whose fit was width-constrained.
     */
    const needH = (radius * 2.72) / 2 / halfH;

    /*
     * `height` deliberately ignores `needH`.
     *
     * A cake is wider than it is tall, so in a portrait frame `needH` always wins
     * and the fit that results is a small cake with empty bands above and below
     * it — which is exactly what made three preset cards read as three copies of
     * one placeholder. Fitting the height gives the shot back its own decision
     * about the sides.
     */
    const need = shot.fit === "height" ? needV : Math.max(needV, needH);

    /*
     * `fill`'s air is composition on a large frame and waste on a small one.
     *
     * 22% margin round a 600px canvas is a cake standing on a table with room to
     * breathe, which is the point of it. Round the 182px the builder's canvas
     * measures on a 375x812 phone — with the stage split between the render and
     * the topping bar — the same 22% is 40px of empty chipboard, and the cake it
     * frames is 140px of a 812px screen. At that size nobody is reading the
     * composition; they are trying to see the cake.
     *
     * So the air is spent in proportion to the frame that holds it: full above
     * 300px, tapering to a quarter of it at 200px and below. The floor matters —
     * this must not reach the preset cards or the hero, which are composed and
     * are not short of room, so the ramp is written against canvas height in CSS
     * pixels rather than against a breakpoint.
     */
    const roomy = THREE.MathUtils.clamp((size.height - 200) / 100, 0, 1);
    const fill = 1 + (shot.fill - 1) * (0.25 + 0.75 * roomy);

    const distance = THREE.MathUtils.clamp(need * fill, 2.6, 12);

    /*
     * The cake sits in a group offset by -0.55; look at its actual middle.
     *
     * Its *optical* middle, though, is above its geometric one. A cake is widest at
     * the bottom and the board is wider still, so centring the geometry leaves the
     * composition bottom-heavy and the interesting half — the top edge, the drip, the
     * message — sitting low. Product photography lifts the look-at slightly for
     * exactly this reason.
     */
    // Lifting the look-at spends vertical margin at the bottom of the frame, so it
    // stays small: 0.56 of the height cropped the board on a three-tier.
    return { distance, lookY: height * 0.53 - 0.55 };
  }, [config, aspect, size.height, shot]);

  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    initialCamera.position.setLength(target.distance);
  }, [initialCamera, target.distance]);

  // Everything mutable is read off the frame state rather than captured, so the
  // camera and controls are never treated as React-owned values.
  useFrame((state, delta) => {
    const camera = state.camera;
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    const wantY = target.lookY;

    if (reduced) {
      controls?.target.set(0, wantY, 0);
      camera.position.setLength(target.distance);
      return;
    }

    // 0.001 is a 99.9%-per-second convergence: a snap with a wobble on the end,
    // not an ease. 0.06 lands in about half a second, which is the same beat as
    // the option card and the price ticking over, so the three read as one
    // response to one tap rather than three unrelated things twitching.
    const k = 1 - Math.pow(0.06, delta);
    if (controls) {
      controls.target.setY(THREE.MathUtils.lerp(controls.target.y, wantY, k));
    }
    camera.position.setLength(
      THREE.MathUtils.lerp(camera.position.length(), target.distance, k),
    );
  });

  return null;
}
