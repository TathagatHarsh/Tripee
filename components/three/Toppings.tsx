"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, ToppingSpec } from "@/lib/schema";
import { mulberry32 } from "@/lib/seed";
import { TOPPING_MATERIALS, TOPPING_PALETTES } from "./materials";
import { phiOf, surfaceRadius, tierShape, type Sector, type TierDims } from "./geometry";
import type { PlaqueFootprint } from "./MessagePlaque";
import { toppingGeo, type ToppingGeo } from "./toppingGeometry";

interface Props {
  config: CakeConfig;
  tiers: TierDims[];
  seed: number;
  castShadow: boolean;
  maxInstances: number;
  /** Nothing lands on the message plaque. */
  keepOff?: PlaqueFootprint | null;
  /** Nothing floats over the missing wedge. */
  sector?: Sector;
}

interface Placed {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
}

/** Density 1..5 maps to a count, scaled by how much surface there is to fill. */
function countFor(spec: ToppingSpec, radius: number, size: number): number {
  const linear = spec.placement === "base-border"
    || spec.placement === "top-ring"
    || spec.placement === "cascade";

  const area = linear ? Math.PI * 2 * radius : Math.PI * radius * radius;
  const perUnit = linear ? 1 / (size * 1.35) : 1 / (size * size * 3.2);

  const base = area * perUnit * (spec.placement === "cascade" ? 1.6 : 1);
  const densityFactor = 0.32 + (spec.density - 1) * 0.24;
  return Math.max(1, Math.round(base * densityFactor));
}

/** True when a spot would sit on the plaque, or over the cut. */
function blocked(
  x: number, z: number,
  keepOff?: PlaqueFootprint | null,
  sector?: Sector,
): boolean {
  if (keepOff
    && Math.abs(x - keepOff.cx) < keepOff.halfW
    && Math.abs(z - keepOff.cz) < keepOff.halfD) return true;

  if (sector) {
    let d = phiOf(x, z) - sector.centre;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < sector.width / 2) return true;
  }
  return false;
}

function place(
  spec: ToppingSpec,
  config: CakeConfig,
  tiers: TierDims[],
  seed: number,
  size: number,
  geo: ToppingGeo,
  limit: number,
  keepOff?: PlaqueFootprint | null,
  sector?: Sector,
): Placed[] {
  const flat = geo.flat;
  const rng = mulberry32(seed ^ hashKind(spec.kind) ^ (spec.density * 2654435761));
  const top = tiers[tiers.length - 1];
  const bottom = tiers[0];
  const topY = top.y + top.height;
  // Per-tier, because a tiered heart is a heart on rounds and a topping has to sit
  // on the surface that is actually there — see geometry.tierShape.
  const shapeAt = (i: number) => tierShape(config.shape, i, tiers.length);
  const topR = surfaceRadius(shapeAt(tiers.length - 1), top.radius);
  const out: Placed[] = [];

  /*
   * Y for a piece resting on a surface at `surfaceY`.
   *
   * Its own bottom is put on the surface and then pressed in by `sink` of its own
   * height. This replaces a flat `surfaceY + size * 0.4` shared by all twelve
   * garnishes, which floated the short ones and buried the tall ones.
   */
  const seat = (surfaceY: number) =>
    surfaceY - (geo.bottom + geo.height * geo.sink) * size;

  const drop = (x: number, y: number, z: number, scaleJitter = 0.18) => {
    if (blocked(x, z, keepOff, sector)) return;
    out.push({
      position: new THREE.Vector3(x, y, z),
      rotation: flat
        ? new THREE.Euler((rng() - 0.5) * 0.24, rng() * Math.PI * 2, (rng() - 0.5) * 0.24)
        : new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2),
      scale: size * (1 - scaleJitter / 2 + rng() * scaleJitter),
    });
  };

  const n = Math.min(
    limit,
    countFor(spec, spec.placement === "base-border" ? bottom.radius : topR, size),
  );

  switch (spec.placement) {
    case "top-ring": {
      const r0 = topR * 0.74;
      const y = seat(topY);
      for (let i = 0; i < n; i++) {
        // Angular jitter up from 0.5 to 1.1, plus radial jitter, which the ring had
        // none of. A hand laying fruit round a cake does not hit a fixed radius to
        // the millimetre, and a ring that does reads as a machined pattern.
        const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / n) * 1.1;
        const r = r0 * (1 + (rng() - 0.5) * 0.07);
        drop(Math.cos(a) * r, y, Math.sin(a) * r);
      }
      break;
    }
    case "base-border": {
      // Sitting on the board, so the surface it seats against is the board itself.
      const r0 = surfaceRadius(shapeAt(0), bottom.radius) + size * 0.55;
      const y = seat(0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / n) * 1.1;
        const r = r0 * (1 + (rng() - 0.5) * 0.05);
        drop(Math.cos(a) * r, y, Math.sin(a) * r);
      }
      break;
    }
    case "crown": {
      // Piled high in the centre: concentric rings that step upward.
      const rings = 3;
      let placed = 0;
      for (let ring = 0; ring < rings && placed < n; ring++) {
        const rr = (1 - ring / rings) * topR * 0.42;
        const count = Math.max(1, Math.round((Math.PI * 2 * rr) / (size * 1.5)));
        for (let i = 0; i < count && placed < n; i++) {
          const a = (i / count) * Math.PI * 2 + ring * 0.7;
          // A pile: each ring steps up by most of a piece's height, so the layer
          // above rests in the gaps of the one below rather than hovering over it.
          drop(Math.cos(a) * rr, seat(topY) + size * geo.height * ring * 0.72, Math.sin(a) * rr);
          placed++;
        }
      }
      break;
    }
    case "cascade": {
      // Falling from one shoulder down the side.
      const a0 = rng() * Math.PI * 2;
      const totalH = topY;
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        const a = a0 + t * 1.5 + (rng() - 0.5) * 0.35;
        const y = topY - t * totalH * 0.85;
        let ti = 0;
        for (let k = 0; k < tiers.length; k++) if (y >= tiers[k].y) ti = k;
        const r = surfaceRadius(shapeAt(ti), tiers[ti].radius) + size * 0.45;
        drop(Math.cos(a) * r, Math.max(seat(0), y), Math.sin(a) * r, 0.32);
      }
      break;
    }
    default: {
      // top-scatter: dart-throwing with rejection, seeded.
      const minDist = size * 1.15;
      const pts: [number, number][] = [];
      let guard = 0;
      while (pts.length < n && guard < n * 160) {
        guard++;
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * (topR - size * 0.7);
        const p: [number, number] = [Math.cos(a) * d, Math.sin(a) * d];
        if (blocked(p[0], p[1], keepOff, sector)) continue;
        if (pts.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= minDist)) pts.push(p);
      }
      const y = seat(topY);
      for (const [x, z] of pts) drop(x, y, z);
    }
  }

  return out;
}

function hashKind(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function Toppings({
  config, tiers, seed, castShadow, maxInstances, keepOff, sector,
}: Props) {
  return (
    <group>
      {config.toppings.map((t, i) => (
        <ToppingLayer
          key={`${t.kind}-${t.placement}-${i}`}
          spec={t}
          config={config}
          tiers={tiers}
          seed={seed}
          castShadow={castShadow}
          maxInstances={maxInstances}
          keepOff={keepOff}
          sector={sector}
        />
      ))}
    </group>
  );
}

function ToppingLayer({
  spec, config, tiers, seed, castShadow, maxInstances, keepOff, sector,
}: { spec: ToppingSpec } & Props) {
  const geo = useMemo(() => toppingGeo(spec.kind), [spec.kind]);
  const mat = TOPPING_MATERIALS[spec.kind];
  const palette = geo.vertexColors ? undefined : TOPPING_PALETTES[spec.kind];

  const instances = useMemo(
    () => place(
      spec, config, tiers, seed,
      geo.scale * scaleForSize(tiers[0].radius),
      geo, maxInstances, keepOff, sector,
    ),
    [spec, config, tiers, seed, geo, maxInstances, keepOff, sector],
  );

  if (instances.length === 0) return null;

  return (
    <instancedMesh
      args={[geo.geometry, undefined, instances.length]}
      castShadow={castShadow}
      receiveShadow
      ref={(m) => {
        if (!m) return;
        const o = new THREE.Object3D();
        const c = new THREE.Color();
        const rng = mulberry32(seed ^ hashKind(spec.kind));

        instances.forEach((inst, i) => {
          o.position.copy(inst.position);
          o.rotation.copy(inst.rotation);
          o.scale.setScalar(inst.scale);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);

          if (palette) {
            c.set(palette[Math.floor(rng() * palette.length)]);
            m.setColorAt(i, c);
          }
        });

        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }}
    >
      <meshPhysicalMaterial
        /* Vertex colours and instance colours both multiply the material colour.
           Tinting on top of either one darkens the topping twice over. */
        color={palette || geo.vertexColors ? "#ffffff" : mat.color}
        vertexColors={geo.vertexColors}
        roughness={mat.roughness}
        metalness={mat.metalness}
        clearcoat={mat.clearcoat}
        clearcoatRoughness={0.3}
        sheen={mat.sheen ?? 0}
        sheenColor="#FFE9CC"
        envMapIntensity={spec.kind === "gold-leaf" ? 1.6 : 0.8}
      />
    </instancedMesh>
  );
}

/** Garnish does not scale linearly with the cake — a strawberry is a strawberry. */
function scaleForSize(baseRadius: number): number {
  return 0.78 + Math.min(0.42, baseRadius * 0.18);
}
