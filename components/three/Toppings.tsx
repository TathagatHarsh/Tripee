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

/** What a placement can tell `drop` about how a piece should sit. See `aimed`. */
interface Aim {
  /** Spread of the per-piece scale variation. Default 0.18. */
  jitter?: number;
  /** Turn about the vertical, for pieces laid along a line. */
  yaw?: number;
  /** Azimuth of the wall to lay the piece against, instead of on the top. */
  wall?: number;
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
   * Where a piece's origin goes when it rests against a surface at `at`.
   *
   * Its own bottom is put on the surface and then pressed in by `sink` of its own
   * height. This replaces a flat `surfaceY + size * 0.4` shared by all twelve
   * garnishes, which floated the short ones and buried the tall ones.
   *
   * Read as a height for everything that sits on the top or the board, and as a
   * *radius* by the cascade, which rests its pieces against the wall. Same
   * relationship either way: a surface, and a body pressed into it.
   */
  const seat = (at: number) => at - (geo.bottom + geo.height * geo.sink) * size;

  /**
   * How a flat piece is aimed. A piece that is dropped at a random angle is not
   * aimed at all, and that was the only option.
   *
   * `yaw` turns it about the vertical, for the placements that run along a line.
   * A halved strawberry is nearly three times as long as it is wide, so a
   * broadside one eats three times the arc of an end-on one: the spacing
   * `countFor` reserves is right on average and wrong for every actual pair,
   * which is why neighbours collided in some places and left gaps in others. And
   * a baker laying fruit round a cake points it *round* the cake. A little
   * deviation is kept, because a ring where every nose sits at the same angle is
   * a machined pattern rather than a hand-laid one.
   *
   * `wall` lays it against the *side* of the cake at that azimuth instead of on
   * top of it, which is what a cascade needs. `flat` means "sits on the surface
   * rather than dropped at an angle", and every placement read that as *the top*
   * surface — so on the wall the cut face stayed horizontal and a halved
   * strawberry stuck straight out like a shelf. Harmless while a garnish was
   * 15mm; unmissable at life size.
   *
   * YXZ order, so each of the three angles does exactly one thing. `z` stands the
   * piece up against the wall — a quarter turn, plus a couple of degrees, because
   * fruit pressed on by hand is never perfectly flush. `x` then spins it within
   * the plane of the wall, which is where the variation belongs: some pieces
   * vertical, some at an angle, every one of them still touching the frosting.
   * `y` carries the result round to its azimuth. In the default XYZ order those
   * two roles swap and interact, and a wide `x` becomes garnish peeling off the
   * side of the cake.
   */
  const aimed = (aim: Aim) => {
    if (!flat) {
      return new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    }
    if (aim.wall !== undefined) {
      return new THREE.Euler(
        (rng() - 0.5) * 1.1,
        -aim.wall,
        -Math.PI / 2 + (rng() - 0.5) * 0.24,
        "YXZ",
      );
    }
    return new THREE.Euler(
      (rng() - 0.5) * 0.24,
      aim.yaw === undefined ? rng() * Math.PI * 2 : aim.yaw + (rng() - 0.5) * 0.34,
      (rng() - 0.5) * 0.24,
    );
  };

  const drop = (x: number, y: number, z: number, aim: Aim = {}) => {
    if (blocked(x, z, keepOff, sector)) return;
    const jitter = aim.jitter ?? 0.18;
    out.push({
      position: new THREE.Vector3(x, y, z),
      rotation: aimed(aim),
      scale: size * (1 - jitter / 2 + rng() * jitter),
    });
  };

  /** Yaw that lays a piece's +x along the ring at angle `a`. */
  const tangent = (a: number) => -(a + Math.PI / 2);

  const n = Math.min(
    limit,
    countFor(spec, spec.placement === "base-border" ? bottom.radius : topR, size),
  );

  switch (spec.placement) {
    case "top-ring": {
      const r0 = topR * 0.74;
      const y = seat(topY);
      for (let i = 0; i < n; i++) {
        /*
         * Angular jitter back down to 0.5, and radial jitter doing the work it was
         * raised to 1.1 to do.
         *
         * The point of the jitter is that a hand laying fruit round a cake does not
         * hit a fixed radius or a fixed spacing. But `countFor` reserves an arc per
         * piece and angular jitter spends it: at 1.1 a piece could move half the gap
         * to its neighbour, so on the ring where it mattered — a topping laid along
         * the circle rather than spun at random — neighbours ran into each other.
         * Radial jitter and the yaw deviation in `drop` break the pattern without
         * touching the spacing.
         */
        const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / n) * 0.5;
        const r = r0 * (1 + (rng() - 0.5) * 0.07);
        drop(Math.cos(a) * r, y, Math.sin(a) * r, { yaw: tangent(a) });
      }
      break;
    }
    case "base-border": {
      // Sitting on the board, so the surface it seats against is the board itself.
      const r0 = surfaceRadius(shapeAt(0), bottom.radius) + size * 0.55;
      const y = seat(0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / n) * 0.5;
        const r = r0 * (1 + (rng() - 0.5) * 0.05);
        drop(Math.cos(a) * r, y, Math.sin(a) * r, { yaw: tangent(a) });
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
          /*
           * A pile: each ring steps up by most of a piece's *visible* height, so
           * the layer above rests in the gaps of the one below rather than
           * hovering over it. Visible, not total — a piece seated at `sink` 0.5
           * has half its body inside the frosting, and stepping by the whole of
           * it put a berry's worth of air between every layer.
           */
          const step = size * geo.height * (1 - geo.sink) * ring * 0.72;
          drop(Math.cos(a) * rr, seat(topY) + step, Math.sin(a) * rr);
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
        /*
         * `seat` against the wall rather than `+ size * 0.45` outside it. That
         * offset was 45% of a piece's size whatever the piece was, which for
         * anything wider than it was deep left the garnish hanging clear of the
         * frosting with a shadow under it. Seating it presses each one into the
         * wall by the same fraction of its own body that the top would.
         */
        const r = seat(surfaceRadius(shapeAt(ti), tiers[ti].radius));
        drop(Math.cos(a) * r, Math.max(seat(0), y), Math.sin(a) * r, {
          jitter: 0.32, wall: a,
        });
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
