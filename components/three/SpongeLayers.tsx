"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, Shape } from "@/lib/schema";
import { fillingMaterial, frostingMaterial, spongeMaterial, tileRepeat } from "./materials";
import { FILLING_SQUEEZE, slabStack, tierGeometry, type Sector, type TierDims } from "./geometry";
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
  const hasFilling = config.filling !== "none";
  // On a cut cake the stack is lifted a hair off the shell's own base, which is
  // otherwise coplanar with it and fights for the same pixels at the cut.
  const inset = sector ? 0.008 : 0;

  const slabs = useMemo(
    () => slabStack(
      config.layers,
      dims.height - inset * 2, dims.radius, hasFilling, seed,
    ),
    [config.layers, dims.height, inset, dims.radius, hasFilling, seed],
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

  /*
   * Every band slabStack returns is the same height, so they still share one
   * geometry — but it is now built at that height instead of at 1 and squashed by
   * the mesh scale below, and that is what makes a squeeze visible at all.
   *
   * A band is about 3.2mm on a 100mm tier, so the old mesh scale was [1, .035, 1].
   * Under it, a bevel declared as 0.02 was 1.8mm across and 0.02mm tall — an
   * overhang rather than an edge. Worse, three.js takes normals through the inverse
   * scale: the 45-degree normal on a rounded rim came out 28x steeper in y, so it
   * pointed at the ceiling. The rim shaded like a lid, the wall shaded like a wall,
   * and there was nothing in between. That is the whole reason the filling read as
   * a stripe printed on the side of the cake rather than as paste between layers.
   *
   * At its real height the default bevel is 0.65mm in both axes, and the normals
   * are its own.
   *
   * The fallback height is never rendered: slabStack only emits bands when there is
   * more than one layer, and with one layer nothing reaches this geometry.
   */
  const fillH = slabs.find(s => s.kind === "filling")?.height ?? 0.01;

  const fillingGeo = useDisposed(useMemo(
    () => tierGeometry({
      shape,
      radius: dims.radius * 1.002,
      height: fillH,
      segments,
      squeeze: FILLING_SQUEEZE,
      sector,
    }),
    [shape, dims.radius, fillH, segments, sector],
  ));

  /*
   * Tile 0.3 was a crumb every 0.8mm, and that is the whole reason a cut cake
   * read as a flat grey slab.
   *
   * One world unit is 90.7mm — geometry.IN = 0.28 units per inch — so a 2kg round
   * at DIAMETER_IN 9 comes out at radius 1.26. spongeNormal and spongeCrumb both
   * run at frequency 38 across one tile, so a 0.3-unit tile put 38 crumb cells into
   * 27mm of real sponge. That is far past what the pixels can resolve, so the
   * normal map averaged out to a flat surface and the tone map averaged to its own
   * mean — which, being a darkening field of depth 0.26, dragged every sponge about
   * 13% darker than the colour named in SPONGE_COLORS and towards grey with it.
   *
   * 1.1 units is 38 cells per 100mm: a crumb every 2.6mm, which is what cake crumb
   * measures and what §5.3 means by "tiled small". The crumb resolves, so it
   * shades, so the cut face reads as sponge instead of mush.
   */
  const spongeMat = useMemo(
    () => spongeMaterial(config.sponge, tileRepeat(shape, dims.radius, 1, 1.1)),
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
          scale={[1, s.kind === "sponge" ? s.height : 1, 1]}
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
