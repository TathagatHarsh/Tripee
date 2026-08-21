"use client";

import * as THREE from "three";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useStore } from "@react-three/fiber";

/**
 * A cake on a plate, turning.
 *
 * This is the preset cards' counterpart to three/HeroMotion: the hero cake
 * arrives, breathes and follows the pointer, and it needs GSAP to choreograph
 * an entrance with a beginning and an end. A turntable has neither. It is one
 * continuous rotation, so it is one frame callback and no timeline — which is
 * also why there are no GSAP instances on this page's eight cards.
 *
 * The cake turns, not the camera. Orbiting the camera instead would be fewer
 * lines — drei's OrbitControls has `autoRotate` built in — and it would swing
 * the key light from front to back across every revolution, so each cake would
 * spend a third of its turn lit from behind and reading as a silhouette. A
 * studio turntable moves the subject and leaves the lights alone. So does this.
 */

/**
 * What the DOM tells the turntable, read fresh every frame.
 *
 * A ref rather than a prop, because a pointer crossing a grid of cards must not
 * re-render a WebGL scene per card. Unlike HeroMotion's reveal — which the
 * component that writes it also owns — this one is created outside the canvas by
 * PresetCakeViewer, because pointer handlers live on the card, not in the scene.
 */
export interface TurntableDrive {
  hovered: boolean;
}

/** Seconds for one full revolution → radians per second. */
const rate = (seconds: number) => (Math.PI * 2) / seconds;

/**
 * Thirteen and a half seconds a turn: about twenty-seven degrees a second.
 *
 * Slow enough that the first thought is "that cake is actually 3D" rather than
 * "that thing is spinning", which is the whole brief. You can follow a single
 * drip all the way round it.
 */
const REST = rate(13.5);

/**
 * Faster under the pointer, but not by much — one turn in seven and a half
 * seconds. Doubling it read as a product GIF; this reads as the cake noticing.
 */
const HOVER = rate(7.6);

/**
 * How much closer the cake comes when the pointer arrives.
 *
 * In the scene rather than in CSS, which is where this started. Scaling the
 * canvas element resamples a rendered frame — soft at the edges — and, because
 * the well clips, it crops the picture: on the tightest of the eight cards the
 * board's front edge went out of frame on hover. Scaling the subject instead
 * re-renders it at the new size and the framing stays the framing. Kept small
 * enough to sit inside the margin the shots leave: 2.5% growth is 1.25% off each
 * edge, against the 2.8% of clearance measured on the tightest card.
 */
const HOVER_SCALE = 1.025;

/**
 * The rate the cards ask to be drawn at.
 *
 * Eight canvases at 60fps is eight render loops, eight scene traversals and
 * eight contact-shadow passes a frame — to advance a rotation by a quarter of a
 * degree. At 30 the step is half a degree, still far under anything the eye
 * reads as a stutter, for half the work. The rotation itself is driven by
 * elapsed time rather than by frame count, so this changes the cost and not the
 * speed.
 */
const FPS = 30;

export function Turntable({
  drive, active, children,
}: {
  drive: RefObject<TurntableDrive>;
  /**
   * On screen, and allowed to move. When it goes false the cake simply stops
   * being drawn and the last frame stays up — a paused card costs nothing.
   */
  active: boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef({ angle: 0, speed: REST, lean: 0 });
  /*
   * The store rather than the `invalidate` bound to it, so the loop below can ask
   * whether the root is still alive before asking it to draw.
   *
   * This loop is the one part of the component that lives outside React's
   * lifecycle: a frame can already be queued when the tree goes away, and
   * R3F's `invalidate` reads `state.internal` without checking that there is
   * one. Cancelling on cleanup covers the ordinary unmount; this covers a root
   * torn down under a frame that is already in flight, which is what Fast
   * Refresh does on every save.
   */
  const store = useStore();

  /*
   * The canvas draws on demand — see CakeScene's `frameloop` — so the turntable
   * has to ask for the frames it needs. Asking here rather than switching the
   * whole canvas to "always" is what makes pausing free and precise: stop
   * asking, and everything else about the scene stays exactly as it was.
   */
  useEffect(() => {
    if (!active) return;

    const step = 1000 / FPS;
    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < step) return;
      last = now;

      const state = store.getState();
      if (!state?.internal?.active) return;
      state.invalidate();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, store]);

  useFrame((_, delta) => {
    const g = group.current;
    /* Nothing to do on a frame somebody else asked for — a resize, a prop
       change — while this card is paused or the reader has asked for stillness.
       Without this the cake would jump by however long it had been still. */
    if (!g || !active) return;

    const s = spin.current;
    // A backgrounded tab hands back its whole absence on the first frame after
    // it returns. Capped, or the cake snaps a third of a turn on wake.
    const d = Math.min(delta, 0.12);

    /*
     * The speed is eased into, not switched. About half a second to change
     * gear, which is the same beat as the card's own lift and shadow, so
     * pointing at a card reads as one gesture rather than as a cake being
     * kicked.
     */
    const k = 1 - Math.pow(0.02, d);
    const hovered = drive.current?.hovered ?? false;
    s.speed = THREE.MathUtils.lerp(s.speed, hovered ? HOVER : REST, k);
    s.lean = THREE.MathUtils.lerp(s.lean, hovered ? 1 : 0, k);

    s.angle = (s.angle + s.speed * d) % (Math.PI * 2);
    g.rotation.y = s.angle;
    g.scale.setScalar(1 + s.lean * (HOVER_SCALE - 1));
  });

  /*
   * At rest the group is untouched, so a cake that never animates — reduced
   * motion, no frames ever asked for — sits at rotation zero, which is the
   * angle its Shot was composed for. Stillness is the art-directed pose, not a
   * degraded one.
   */
  return <group ref={group}>{children}</group>;
}
