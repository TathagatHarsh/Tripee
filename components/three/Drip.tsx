"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, Shape } from "@/lib/schema";
import { achievable } from "@/lib/color";
import {
  dripSpecs, dripsGeometry, glazeCapGeometry, outlinePoints, phiOf, rimGeometry,
  rimRadius, shellRimY, shellThickness,
  type OutlinePoint, type Sector, type TierDims,
} from "./geometry";
import { frostingNormal } from "./noise";
import { useDisposed } from "./useDisposable";

interface Props {
  config: CakeConfig;
  /** The shape of the tier the drip runs off, which on a tiered heart is not the
   *  cake's own shape — see geometry.tierShape. */
  shape: Shape;
  dims: TierDims;
  seed: number;
  castShadow: boolean;
  /**
   * The frosting shell's real outline. Without it the rim is re-derived from
   * the 2D shape, which does not match a bevelled extrude — on a heart the ring
   * ends up floating clear of the cake at the back and cutting through it at
   * the front.
   */
  silhouette?: OutlinePoint[];
  /** Nothing drips over the cut face. */
  sector?: Sector;
}

const DEFAULT_DRIP = "#3B2318";

/**
 * A pooled ring at the rim plus individual tapered drips at seeded angles. The
 * angles come from the config hash, so the drips do not reshuffle when React
 * re-renders — that single detail is the difference between "built" and "buggy".
 *
 * Every drip is its own geometry now (geometry.dripsGeometry) rather than one shared
 * lathe scaled per instance, and they are merged into a single mesh: real per-drip
 * variation, and one draw call in place of up to thirty-four.
 */
export function Drip({ config, shape, dims, seed, castShadow, silhouette, sector }: Props) {
  const color = achievable(config.dripColor ?? DEFAULT_DRIP);

  // Drips hang from the real silhouette, so a square cake drips off its corners.
  const anchors = useMemo(
    () => silhouette && silhouette.length
      ? silhouette
      : outlinePoints(shape, rimRadius(shape, dims.radius) + 0.018, 240),
    [silhouette, shape, dims.radius],
  );

  /* A bundt is glazed rather than dripped — see geometry.glazeCapGeometry for why the
   * generic runs cannot work on a fluted dome. */
  const glaze = useDisposed(useMemo(
    () => {
      if (shape !== "bundt") return null;
      // Built off the *shell's* outer dimensions, not the tier's. The frosting shell
      // is one thickness proud of the tier it covers, so a cap sized to the tier is
      // a cap rendered inside the cake — which is exactly what happened: the glaze
      // was there, correct, and completely invisible.
      const t = shellThickness(dims.radius);
      return glazeCapGeometry(dims.radius + t, dims.height + t, 72, seed);
    },
    [shape, dims.radius, dims.height, seed],
  ));

  /*
   * The wedge is culled here rather than at render time. Each drip used to be its
   * own mesh, so a spec over the cut face could just return null from the map;
   * merged into one buffer, it has to come out before the geometry is built.
   */
  const specs = useMemo(() => {
    if (shape === "bundt") return [];
    const all = dripSpecs(seed, dims.radius);
    if (!sector) return all;
    return all.filter(s => {
      const a = anchors[
        Math.floor((s.angle / (Math.PI * 2)) * anchors.length + anchors.length) % anchors.length
      ];
      if (!a) return false;
      let d = phiOf(a.x, a.z) - sector.centre;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) >= sector.width / 2;
    });
  }, [seed, dims.radius, sector, anchors, shape]);

  const geo = useDisposed(useMemo(
    () => dripsGeometry(specs, anchors),
    [specs, anchors],
  ));

  const ringGeo = useDisposed(useMemo(
    () => rimGeometry(shape, dims.radius, 0.045, anchors, seed),
    [shape, dims.radius, anchors, seed],
  ));

  const normalMap = useMemo(() => {
    const t = frostingNormal().clone();
    t.repeat.set(4, 1);
    t.needsUpdate = true;
    return t;
  }, []);

  const material = (
    <meshPhysicalMaterial
      color={color}
      roughness={0.26}
      metalness={0}
      clearcoat={0.42}
      clearcoatRoughness={0.24}
      sheen={0.12}
      sheenColor="#5A3A22"
      normalMap={normalMap}
      normalScale={new THREE.Vector2(0.2, 0.2)}
      /* Tinted, for the same reason ganache's is: a neutral-white highlight on a
         brown dielectric is the signature of a metal. */
      specularColor="#FFEBD2"
      ior={1.51}
      envMapIntensity={0.9}
    />
  );

  // The top of the frosting's side wall, not the top of the sponge. The shell
  // is a thickness taller and wider than the tier it covers, so measuring from
  // dims.height put the whole rim inside the cake.
  const rimY = dims.y + shellRimY(dims.radius, dims.height, shape);

  return (
    <group position={[0, rimY, 0]}>
      {/* The pool that gathers at the top edge before it runs. A cut cake has
          no continuous rim to pool along, so it is left off — and so does a bundt,
          which has no top edge at all: glaze poured over a dome coats the crown and
          runs straight down the flutes. A tube swept round its shoulder is a torus,
          and a torus on a fluted cake reads as a plastic hoop, which is exactly how
          it looked. */}
      {!sector && shape !== "bundt" && (
        <mesh geometry={ringGeo} castShadow={castShadow}>
          {material}
        </mesh>
      )}

      {/* The poured coat, which is what a glazed bundt has instead. It hangs off the
          group's rim offset like everything else here, so it is lifted back to the
          tier's own base. */}
      {glaze && (
        <mesh
          geometry={glaze}
          position={[0, -shellRimY(dims.radius, dims.height, shape), 0]}
          castShadow={castShadow}
        >
          {material}
        </mesh>
      )}

      {geo && (
        <mesh geometry={geo} castShadow={castShadow}>
          {material}
        </mesh>
      )}
    </group>
  );
}
