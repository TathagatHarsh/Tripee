"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, Shape } from "@/lib/schema";
import { fillingMaterial, frostingMaterial, spongeMaterial, tileRepeat } from "./materials";
import { slabStack, tierGeometry, type Sector, type TierDims } from "./geometry";
import { useDisposed } from "./useDisposable";

interface Props {
  config: CakeConfig;
  /** This tier's shape — see geometry.tierShape. */
  shape: Shape;
  dims: TierDims;
  seed: number;
  segments: number;
  castShadow: boolean;
  /** When the cake is cut, the slabs are cut with it. */
  sector?: Sector;
}

/**
 * Visible on naked, semi-naked and top-only builds. Layer heights carry ±2% of
 * seeded jitter — a mechanically identical stack is what gives a render away.
 */
export function SpongeLayers({ config, shape, dims, seed, segments, castShadow, sector }: Props) {
  // A bundt is baked in one piece in a ring mould. It has no layers to show.
  const hasFilling = config.filling !== "none" && shape !== "bundt";
  // On a cut cake the stack is lifted a hair off the shell's own base, which is
  // otherwise coplanar with it and fights for the same pixels at the cut.
  const inset = sector ? 0.008 : 0;

  const slabs = useMemo(
    () => slabStack(
      shape === "bundt" ? 1 : config.layers,
      dims.height - inset * 2, dims.radius, hasFilling, seed,
    ),
    [shape, config.layers, dims.height, inset, dims.radius, hasFilling, seed],
  );

  const spongeGeo = useDisposed(useMemo(
    () => tierGeometry({
      shape,
      radius: dims.radius,
      height: 1,
      segments,
      bevel: Math.min(dims.radius * 0.04, 0.03),
      sector,
    }),
    [shape, dims.radius, segments, sector],
  ));

  const fillingGeo = useDisposed(useMemo(
    () => tierGeometry({
      shape,
      radius: dims.radius * 1.002,
      height: 1,
      segments,
      bevel: Math.min(dims.radius * 0.03, 0.02),
      sector,
    }),
    [shape, dims.radius, segments, sector],
  ));

  const spongeMat = useMemo(
    () => spongeMaterial(config.sponge, tileRepeat(shape, dims.radius, 1, 0.3)),
    [config.sponge, shape, dims.radius],
  );
  // "No filling" still means something between the layers — the frosting.
  const fillMat = useMemo(
    () => (config.filling === "none"
      ? frostingMaterial(config.frosting, config.frostingColor, "smooth", 4)
      : fillingMaterial(config.filling)),
    [config.filling, config.frosting, config.frostingColor],
  );

  // Semi-naked keeps a thin scrape of frosting; naked shows bare sponge.
  const scrape = config.coverage === "semi-naked";

  return (
    <group position={[0, dims.y + inset, 0]}>
      {slabs.map((s, i) => (
        <mesh
          key={i}
          geometry={s.kind === "sponge" ? spongeGeo : fillingGeo}
          position={[0, s.y, 0]}
          scale={[1, s.height, 1]}
          castShadow={castShadow}
          receiveShadow
        >
          {s.kind === "sponge" ? (
            <meshPhysicalMaterial
              side={THREE.DoubleSide}
              {...spongeMat}
              color={scrape ? mixTowards(spongeMat.color, config.frostingColor) : spongeMat.color}
              roughness={scrape ? 0.7 : spongeMat.roughness}
            />
          ) : (
            <meshPhysicalMaterial side={THREE.DoubleSide} {...fillMat} />
          )}
        </mesh>
      ))}
    </group>
  );
}

/** A semi-naked cake is sponge seen through a thin scrape — not bare sponge. */
function mixTowards(sponge: string, frosting: string): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(sponge), b = p(frosting);
  const m = a.map((v, i) => Math.round(v * 0.55 + b[i] * 0.45));
  return "#" + m.map(v => v.toString(16).padStart(2, "0")).join("");
}
