"use client";

import * as THREE from "three";
import { useMemo } from "react";
import { BOARD_MATERIAL } from "./materials";
import { boardGeometry } from "./geometry";
import { boardGrain, boardNormal } from "./noise";
import { bakeOcclusion, useDisposed } from "./useDisposable";

/** Thin pressed-card round, matte, sitting under everything. */
export function CakeBoard({ radius, cakeRadius }: { radius: number; cakeRadius?: number }) {
  const geometry = useDisposed(useMemo(
    () => {
      const g = boardGeometry(radius);
      /*
       * The cake's own shadow never landed on the board. The `ContactShadows`
       * plane sits below the board, so the pool it draws is the *board's* shadow
       * on the page, and the key light's shadow map is spread over the whole cake
       * and has no contact definition at this scale. The board therefore had a
       * cake standing on it with nothing to show that they touched, which is most
       * of why the cake appeared to hover a millimetre above its own base.
       *
       * Baked instead: dark under the footprint, easing outward. Free at run time,
       * and it survives on LOW quality, where shadow maps are switched off.
       */
      if (cakeRadius) {
        bakeOcclusion(g, { aboveRadius: cakeRadius, aboveStrength: 0.46, aboveFalloff: 0.4 });
      }
      return g;
    },
    [radius, cakeRadius],
  ));

  /*
   * 6×6 of a strength-14 field was a bump every half-millimetre of real board —
   * sandpaper, and the most artificial surface in the frame. The map itself is
   * gentler now (noise.boardNormal) and it tiles half as often, because card
   * grain is a long fibre and not a stipple.
   */
  const normalMap = useMemo(() => {
    const t = boardNormal().clone();
    t.repeat.set(3, 3);
    t.needsUpdate = true;
    return t;
  }, []);

  /** Tone, so the board reads as card rather than a flat swatch of beige. */
  const grainMap = useMemo(() => {
    const t = boardGrain().clone();
    t.repeat.set(3, 3);
    t.needsUpdate = true;
    return t;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, -0.05, 0]} receiveShadow castShadow>
      <meshPhysicalMaterial
        color={BOARD_MATERIAL.color}
        map={grainMap}
        /* Carries the baked footprint shadow. */
        vertexColors
        roughness={BOARD_MATERIAL.roughness}
        metalness={BOARD_MATERIAL.metalness}
        ior={BOARD_MATERIAL.ior}
        specularIntensity={BOARD_MATERIAL.specularIntensity}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.32, 0.32)}
        envMapIntensity={0.5}
      />
    </mesh>
  );
}
