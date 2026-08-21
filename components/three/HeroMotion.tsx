"use client";

import * as THREE from "three";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { HERO_CAKE_IN, HERO_EASE } from "@/lib/heroMotion";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { MAX_TIERS, type CakeReveal } from "./Cake";

/**
 * The hero cake's choreography: how it arrives, and how it behaves once it has.
 *
 * GSAP drives the arrival and nothing else. It tweens a plain object of numbers
 * and this component reads them in the frame loop — rather than letting GSAP
 * reach into the three.js objects directly, which works right up until React
 * re-renders the scene and reconciles the transform back to its prop value.
 * Numbers in, transforms out, one owner per property.
 *
 * Everything after the arrival is a frame callback, because it is continuous: a
 * breath, and a parallax that follows the pointer. Neither has a start or an
 * end, so neither is a timeline.
 */
export function HeroMotion({
  tiers, children,
}: {
  /** How many of the reveal's tier slots this cake actually uses. */
  tiers: number;
  /**
   * Handed the reveal state to read.
   *
   * A function rather than plain children so that this component *owns* the
   * state it writes. The cake only reads it, and the alternative — the parent
   * creating it and passing it to both — makes it a prop of whichever component
   * writes it, which is a thing React is entitled to assume never happens.
   */
  children: (reveal: RefObject<CakeReveal>) => ReactNode;
}) {
  const group = useRef<THREE.Group>(null);

  /* Written here every frame of the entrance, read by `Cake` every frame of it.
     Fixed-length, because the schema caps a cake at three tiers and resizing a
     live animation target is a bug waiting to happen. */
  const reveal = useRef<CakeReveal>({
    tiers: Array.from({ length: MAX_TIERS }, () => 0),
    garnish: 0,
  });
  const reduced = useReducedMotion();
  const gl = useThree(s => s.gl);

  /* Where the entrance has got to. Not state: it changes every frame and no
     render depends on it. */
  const entrance = useRef<{ scale: number; lift: number }>({
    scale: HERO_CAKE_IN.from,
    lift: -HERO_CAKE_IN.lift,
  });

  /* Pointer parallax, eased toward the pointer rather than snapped to it. */
  const tilt = useRef({ x: 0, y: 0 });
  const hover = useRef(0);

  /*
   * Suppressed while the pointer is down, because a drag *is* the pointer
   * sweeping across the canvas: without this, every drag adds a parallax swing
   * on top of the orbit it is already producing and the cake wobbles as it
   * turns. Hover is dropped at the same time for the same reason — you are not
   * inspecting it, you are moving it.
   */
  const dragging = useRef(false);
  const inside = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    const down = () => { dragging.current = true; };
    const up = () => { dragging.current = false; };
    const enter = () => { inside.current = true; };
    const leave = () => { inside.current = false; dragging.current = false; };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    // On the window, not the canvas: releasing outside the canvas after a drag
    // that started inside it would otherwise leave the cake stuck in dragging.
    window.addEventListener("pointerup", up);

    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  /*
   * The arrival.
   *
   * One timeline, overlapping tweens: the cake as a whole grows and rises, each
   * tier closes the gap under it a beat apart, and the garnish comes down last.
   * The offsets are small — 0.14s between tiers — because the brief is a cake
   * being photographed, not a cake being built in front of you.
   */
  useEffect(() => {
    const parts = reveal.current;

    if (reduced) {
      entrance.current.scale = 1;
      entrance.current.lift = 0;
      parts.tiers.fill(1);
      parts.garnish = 1;
      return;
    }

    const tl = gsap.timeline();
    const { duration } = HERO_CAKE_IN;

    tl.to(entrance.current, { scale: 1, lift: 0, duration, ease: HERO_EASE }, 0);

    for (let i = 0; i < tiers; i++) {
      tl.to(
        parts.tiers,
        { [i]: 1, duration: duration * 0.62, ease: HERO_EASE },
        0.06 + i * 0.14,
      );
    }

    tl.to(parts, { garnish: 1, duration: duration * 0.5, ease: "power2.out" }, 0.34);

    return () => { tl.kill(); };
  }, [reduced, tiers]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    const e = entrance.current;

    if (reduced) {
      g.scale.setScalar(1);
      g.position.y = 0;
      g.rotation.set(0, 0, 0);
      return;
    }

    // A breath, not a bob: four millimetres of travel, slow enough that you feel
    // it rather than watch it. Faded in with the entrance so it does not fight
    // the arrival.
    const t = state.clock.elapsedTime;
    const settled = THREE.MathUtils.clamp(
      (e.scale - HERO_CAKE_IN.from) / (1 - HERO_CAKE_IN.from), 0, 1,
    );
    const breathe = Math.sin(t * 0.55) * 0.014 * settled;

    const wantHover = inside.current && !dragging.current ? 1 : 0;
    hover.current = THREE.MathUtils.lerp(hover.current, wantHover, 1 - Math.pow(0.006, delta));

    g.scale.setScalar(e.scale * (1 + hover.current * 0.022));
    g.position.y = e.lift + breathe;

    /*
     * Parallax. `state.pointer` is already normalised to -1..1 over the canvas,
     * so there is no listener and no rect maths here.
     *
     * Y leads X by more than double: turning a subject to follow you reads as
     * attention, tipping it toward you reads as a wobble. Both are held under
     * five degrees — past that it stops being parallax and becomes a second,
     * worse camera fighting the one the customer is dragging.
     */
    const wantY = dragging.current ? tilt.current.y : state.pointer.x * 0.075 * settled;
    const wantX = dragging.current ? tilt.current.x : -state.pointer.y * 0.032 * settled;

    // ~0.4s to follow. Slow enough that a fast flick across the hero does not
    // snap the cake around, which is what makes it feel like weight.
    const k = 1 - Math.pow(0.02, delta);
    tilt.current.y = THREE.MathUtils.lerp(tilt.current.y, wantY, k);
    tilt.current.x = THREE.MathUtils.lerp(tilt.current.x, wantX, k);

    g.rotation.y = tilt.current.y;
    g.rotation.x = tilt.current.x;
  });

  return <group ref={group}>{children(reveal)}</group>;
}
