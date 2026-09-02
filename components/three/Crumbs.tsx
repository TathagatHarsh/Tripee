"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig } from "@/lib/schema";
import { mulberry32 } from "@/lib/seed";
import { spongeBaseColor, spongeMaterial } from "./materials";
import { crumbGeometry, scatterCrumbs, type Sector } from "./geometry";
import { useDisposed } from "./useDisposable";

interface Props {
  config: CakeConfig;
  /** The base tier's radius. The crumbs are placed around its footprint. */
  radius: number;
  seed: number;
  castShadow: boolean;
  /** The wedge they fell out of. Rendered only on a cut cake. */
  sector: Sector;
}

/**
 * The handful of crumbs on the board beneath a cut — §5.3, requirement 5.
 *
 * Placement is `geometry.scatterCrumbs`; this only instances it.
 */
export function Crumbs({ config, radius, seed, castShadow, sector }: Props) {
  const geometry = useDisposed(useMemo(() => crumbGeometry(), []));
  const crumbs = useMemo(
    () => scatterCrumbs(seed, radius, sector),
    [seed, radius, sector],
  );

  /*
   * Sponge colour and roughness, and none of the maps.
   *
   * spongeMaterial's crumb and normal maps are tiled for a surface measured in
   * tens of millimetres — SpongeLayers hands it 1.1 units, which is a crumb every
   * 2.6mm. One of these is 1-3mm across in total, so it sits well inside a single
   * cell of either map and would take whatever value that cell happens to carry as
   * a flat tint. The per-instance colour below does that job deliberately instead.
   *
   * Which is why the colour comes from `spongeBaseColor` and not from the
   * material: spongeMaterial lifts its colour by CRUMB_LIFT so the tone map can
   * bring it back down, and dropping the map while keeping the lift renders every
   * crumb 7% pale. They came out as white specks on the board before this.
   */
  const sponge = useMemo(() => spongeMaterial(config.sponge), [config.sponge]);
  const base = useMemo(() => spongeBaseColor(config.sponge), [config.sponge]);

  return (
    <instancedMesh
      args={[geometry, undefined, crumbs.length]}
      castShadow={castShadow}
      receiveShadow
      ref={(m) => {
        if (!m) return;
        const o = new THREE.Object3D();
        const c = new THREE.Color();
        const rng = mulberry32(seed ^ 0x63726d62);

        crumbs.forEach((crumb, i) => {
          o.position.copy(crumb.position);
          o.rotation.copy(crumb.rotation);
          o.scale.copy(crumb.scale);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);

          /*
           * Plus or minus 9% per crumb. Some of a cut face is crust and some of it
           * is open crumb, so debris that is all one value reads as one object
           * that has been shattered rather than as debris. Instance colour
           * multiplies the material colour, so it centres on 1.
           */
          c.set(base).multiplyScalar(0.91 + rng() * 0.18);
          m.setColorAt(i, c);
        });

        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }}
    >
      <meshPhysicalMaterial
        /* White, because the instance colours above already carry the sponge. */
        color="#ffffff"
        roughness={sponge.roughness}
        metalness={0}
        sheen={sponge.sheen}
        sheenColor={sponge.sheenColor}
        sheenRoughness={sponge.sheenRoughness}
        ior={sponge.ior}
        specularIntensity={sponge.specularIntensity}
        envMapIntensity={0.4}
      />
    </instancedMesh>
  );
}
