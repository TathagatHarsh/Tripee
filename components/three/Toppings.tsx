"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, ToppingSpec } from "@/lib/schema";
import { mulberry32 } from "@/lib/seed";
import { TOPPING_MATERIALS, TOPPING_PALETTES } from "./materials";
import {
  insideOutline, offsetOutlineClear, outlineArea, outlinePerimeter, phiOf, shellOutline,
  shellThickness, tierShape, type OutlinePoint, type Sector, type TierDims,
} from "./geometry";
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
  /**
   * Direction the wall faces where the piece is being laid, instead of on the
   * top. An azimuth on a round cake, and not on any other shape — which is the
   * whole of why the cascade used to lie wrong on a square.
   */
  wall?: number;
}

/**
 * Density 1..5 maps to a count, scaled by how much cake there is to fill.
 *
 * `span` is a length for the placements that run along a line and an area for the
 * ones that cover a surface. It was 2πr and πr² of the circle inscribed in the
 * shape, which under-counted everything that is not round: a square top is 27%
 * more area than that circle and its edge is 22% longer, so density 3 on a square
 * bought visibly less fruit than density 3 on a round cake of the same weight.
 *
 * Measured off the cake — its top face, its wall — and not off the inset path the
 * pieces are actually laid on, which is the mistake the first pass at this made.
 * The two constants below were tuned against the outer radius, so counting the
 * shorter inset path instead reads as "the same cake holds a third less fruit"
 * rather than as a fix. How much there is to cover is a fact about the cake; where
 * the pieces sit is a separate one.
 */
function countFor(spec: ToppingSpec, span: number, size: number): number {
  const linear = spec.placement === "base-border"
    || spec.placement === "top-ring"
    || spec.placement === "cascade";

  const perUnit = linear ? 1 / (size * 1.35) : 1 / (size * size * 3.2);

  const base = span * perUnit * (spec.placement === "cascade" ? 1.6 : 1);
  const densityFactor = 0.32 + (spec.density - 1) * 0.24;
  return Math.max(1, Math.round(base * densityFactor));
}

/**
 * `n` points spaced evenly by arc length round a measured outline, carrying the
 * outline's own outward normal.
 *
 * Not `outlinePoints(shape, r, n)` with the count asked for up front, for two
 * reasons. It floors at six points, and a low density on a small cake genuinely
 * wants three. And every outline here is an *offset* one — pushed in or out along
 * its normals to clear the frosting — which bunches points together on the inside
 * of a corner and spreads them on the outside, so even spacing has to be measured
 * after the offset rather than inherited from before it.
 */
function spaced(pts: OutlinePoint[], n: number): OutlinePoint[] {
  const ends: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
    ends.push(total);
  }

  const out: OutlinePoint[] = [];
  for (let k = 0; k < n; k++) {
    const want = (k / n) * total;
    let i = 0;
    while (i < ends.length - 1 && ends[i] < want) i++;
    const from = i === 0 ? 0 : ends[i - 1];
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const t = (want - from) / Math.max(1e-6, ends[i] - from);
    // Position interpolates between the two points; the normal does not. It is
    // constant along a straight edge and the only place it is not is a corner
    // arc, where the outline already carries enough points to resolve it.
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: a.nx, nz: a.nz, yaw: a.yaw });
  }
  return out;
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

/**
 * Where every piece of one topping goes. Exported for the unit tests: this is
 * pure geometry whose failures are invisible until something renders it, which is
 * how a ring laid on a circle inscribed in a square survived this long.
 */
export function place(
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
  // Per-tier, because a tiered heart is a heart on rounds and a topping has to sit
  // on the surface that is actually there — see geometry.tierShape.
  const shapeAt = (i: number) => tierShape(config.shape, i, tiers.length);

  /*
   * The height of the surface a garnish on the top actually lands on.
   *
   * `top.y + top.height` is the top of the *sponge*, and on a covered cake that is
   * not where anything rests: the frosting shell is built one thickness taller and
   * one thickness wider than the tier it covers (geometry.shellMetrics), so every
   * piece seated on the sponge plane was sunk by a whole shell thickness — 3.6mm on
   * an 8in cake, and it scales with the radius.
   *
   * This is the identical mistake geometry.shellRimY was written to fix for the
   * drip, and it read the same way: it took out whatever was shorter than the
   * frosting was thick. A pistachio crumb is 3.3mm tall, so all eighty of them on
   * a scattered top were inside the buttercream and the render came back with a
   * bare cake; gold leaf is 1.3mm and had never been visible at all; the
   * hundreds-and-thousands on the Funfetti preset were poking their tips out. The
   * pieces that *did* show — a strawberry, an Oreo — showed short, which is why
   * garnishes here have historically been tuned a shade over life size.
   *
   * Only when there is a shell. Naked, semi-naked and top-only builds render the
   * slab stack and no shell at all (see Tier.covered / SpongeLayers), so on those
   * the sponge top is the real surface and adding anything would float the fruit.
   */
  const covered = config.coverage === "full" || shapeAt(tiers.length - 1) === "bundt";
  const topY = top.y + top.height + (covered ? shellThickness(top.radius) : 0);

  const out: Placed[] = [];

  /*
   * The outline the frosting actually presents on tier `i`, at the band the
   * placement touches: `top` for the flat top face, `widest` for the side wall.
   *
   * This is the fix for the whole class of bug this file had. Every placement was
   * built from `surfaceRadius`, a single scalar — the radius of a circle drawn
   * *inside* the shape — so a ring on a square cake was a small circle in the
   * middle of a square top with all four corners bare, a base border was a circle
   * that crossed in and out of the wall as it went round, and a scatter covered a
   * disc and left a bare margin at every corner. The silhouette is already
   * measured exactly, by the same helper the ruffles, the rosettes and the drips
   * all follow (geometry.shellOutline); toppings were the one decoration that
   * never adopted it.
   *
   * 192 points, which is enough to resolve a rounded corner. How many *pieces*
   * there are comes from measuring this, not from it.
   */
  const outlineAt = (i: number, band: "top" | "widest") =>
    shellOutline(shapeAt(i), tiers[i].radius, tiers[i].height, 192, band);

  /*
   * Where a piece's origin goes when it rests against a surface at `at`.
   *
   * Its own bottom is put on the surface and then pressed in by `sink` of its own
   * height. This replaces a flat `surfaceY + size * 0.4` shared by all twelve
   * garnishes, which floated the short ones and buried the tall ones.
   *
   * A height, for the pieces that sit on the top or on the board. The cascade
   * needs the same quantity as a *distance*, to press a piece into a wall it is
   * lying against, so that is `press` — the same relationship, along the wall's
   * own normal rather than along y.
   */
  const press = (geo.bottom + geo.height * geo.sink) * size;
  const seat = (at: number) => at - press;

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

  /**
   * Yaw that lays a piece's +x along the outline at `p`, rather than across it.
   *
   * `OutlinePoint.yaw` faces outward — it is what a rosette pointing away from the
   * cake wants — and a quarter turn off that is the tangent, which is what a
   * piece laid *along* an edge wants. On a circle this is the old
   * `-(a + π/2)`; on a square it is what makes the fruit run parallel to the side
   * instead of fanning out from the middle.
   */
  const along = (p: OutlinePoint) => p.yaw - Math.PI / 2;

  /** How close two pieces of the same topping are allowed to get. */
  const apart = size * 1.15;

  /**
   * How many pieces to lay along `path`, given what the cake as a whole asks for.
   *
   * Two different lengths are in play and each is right about a different thing.
   * `countFor` measures the cake, because how much fruit a cake takes is a fact
   * about the cake. But the pieces go on a path inset from its edge, and on a
   * square that path is much shorter than the edge it follows — inset far enough
   * and the corners stop existing altogether. Asking the cake and laying the
   * answer on the path put fourteen strawberries on a ring with room for nine.
   *
   * So the cake's answer is a request and the path's length is the ceiling: never
   * more pieces than fit along the line they are being laid on, at the same
   * spacing the scatter already refuses to go under. Round cakes come out where
   * they were — the ceiling sits just above what density 5 asks of them — and it is
   * the shapes whose edge and whose inset ring differ most that it saves.
   *
   * Spacing has to be the ceiling rather than the arc: `spaced` divides the path
   * evenly by arc length, and where the path turns a corner two points one arc
   * apart are closer than that in a straight line, which is exactly where a ring
   * on a square would have run into itself.
   */
  const fit = (path: OutlinePoint[], span: number) => Math.max(1, Math.min(
    limit,
    countFor(spec, span, size),
    Math.floor(outlinePerimeter(path) / apart),
  ));

  switch (spec.placement) {
    case "top-ring": {
      /*
       * One piece in from the edge of the flat top, following that edge.
       *
       * The inset was `topR * 0.74` — a quarter of the way in from a circle
       * inscribed in the shape — and on a round 2kg cake that lands 0.37 from the
       * frosting edge, which is almost exactly one strawberry. That is the rule the
       * number was really expressing, and stated as a distance it survives being
       * carried round a corner: a constant margin from a square's edge is a
       * rounded square, where a constant fraction of an inscribed radius is a
       * circle floating in the middle of a square top.
       *
       * Stating it per piece also fixes it for the small garnishes, which the old
       * number ignored: sprinkles were laid the same 0.37 in as a strawberry, a
       * finger's width of bare frosting outside a line of hundreds-and-thousands.
       */
      const face = outlineAt(tiers.length - 1, "top");
      const ring = offsetOutlineClear(face, -size * 0.92);
      const y = seat(topY);
      const n = fit(ring, outlinePerimeter(face));
      for (const p of spaced(ring, n)) {
        /*
         * Jitter across the line, not along it.
         *
         * A hand laying fruit round a cake does not hit a fixed radius, but it
         * does space evenly, and `countFor` reserves exactly one piece's worth of
         * edge each: spending any of that on along-the-line jitter is what used to
         * run neighbours into each other. The deviation in `aimed` does the rest.
         */
        const j = (rng() - 0.5) * size * 0.16;
        drop(p.x + p.nx * j, y, p.z + p.nz * j, { yaw: along(p) });
      }
      break;
    }
    case "base-border": {
      // Sitting on the board, so the surface it seats against is the board itself,
      // and the line it runs along is the widest band of the bottom tier pushed
      // out far enough to clear the frosting.
      const wall = outlineAt(0, "widest");
      const ring = offsetOutlineClear(wall, size * 0.55);
      const y = seat(0);
      const n = fit(ring, outlinePerimeter(wall));
      for (const p of spaced(ring, n)) {
        const j = (rng() - 0.5) * size * 0.12;
        drop(p.x + p.nx * j, y, p.z + p.nz * j, { yaw: along(p) });
      }
      break;
    }
    case "crown": {
      /*
       * Piled high in the centre: concentric rings that step upward. The one
       * placement that stays a circle, because a pile in the middle of a cake is a
       * pile in the middle of a cake whatever the outline round it is.
       *
       * Its size still comes off the real top — the radius of the circle with the
       * same area — so a square, which has 27% more top than the circle inside it,
       * gets the bigger pile a square top can carry.
       */
      const face = outlineAt(tiers.length - 1, "top");
      const r0 = Math.sqrt(outlineArea(face) / Math.PI) * 0.42;
      const n = Math.min(limit, countFor(spec, outlineArea(face), size));
      const rings = 3;
      let placed = 0;
      for (let ring = 0; ring < rings && placed < n; ring++) {
        const rr = (1 - ring / rings) * r0;
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
      /*
       * Falling from one shoulder down the side — down the side that is there,
       * rather than down a cylinder inscribed in it.
       *
       * Two things were wrong and both were the inscribed circle. The pieces were
       * put at a radius, so on a square they went into the wall along the flat
       * faces and hung in the air off the corners; and they were *aimed* by their
       * azimuth, which is only the direction a wall faces if the wall is round, so
       * on a flat face every piece was turned a few degrees away from the frosting
       * it was supposed to be pressed into.
       *
       * Both come right from the outline. Each piece takes a point on the wall, is
       * pressed in along that point's own normal, and is aimed by it.
       */
      const walls = tiers.map((_, i) => outlineAt(i, "widest"));
      const totalH = topY;
      // The sweep was 1.5 radians of azimuth and the wander ±0.35 of one. On a
      // circle a radian is one radius of wall, so both are fractions of the way
      // round — which is what they have to be to mean the same thing on a shape
      // whose radius is not constant.
      const start = rng();
      const sweep = 1.5 / (Math.PI * 2);
      const wander = 0.35 / (Math.PI * 2);

      /*
       * Bounded by the length of the run it actually makes, which nothing bounded
       * before: the count came off the whole perimeter with the cascade's own 1.6
       * multiplier on top, and then went down one shoulder. Twenty-three halved
       * strawberries over a run of 2.2 is a step of 45mm between pieces that are
       * 350mm long — not a cascade, a rope.
       *
       * It never showed, because every one of them was inside the cake. The count
       * was calibrated when a garnish was 15mm and buried besides, so the moment
       * the pieces came out onto the wall the crowding came out with them.
       *
       * Half of `apart` rather than all of it: a cascade is a spill and pieces
       * overlapping down the fall is the whole look — this only stops it closing
       * into a solid tube.
       */
      const run = Math.hypot(sweep * outlinePerimeter(walls[0]), totalH * 0.85);
      const n = Math.max(1, Math.min(
        limit,
        countFor(spec, outlinePerimeter(walls[0]), size),
        Math.floor(run / (apart * 0.5)),
      ));
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        const y = topY - t * totalH * 0.85;
        let ti = 0;
        for (let k = 0; k < tiers.length; k++) if (y >= tiers[k].y) ti = k;
        const wall = walls[ti];
        const u = start + t * sweep + (rng() - 0.5) * wander;
        const p = wall[Math.floor((u - Math.floor(u)) * wall.length) % wall.length];
        drop(
          p.x - p.nx * press, Math.max(seat(0), y), p.z - p.nz * press,
          { jitter: 0.32, wall: Math.atan2(p.nz, p.nx) },
        );
      }
      break;
    }
    default: {
      /*
       * top-scatter: dart-throwing with rejection, seeded — inside the real top
       * face now, rather than inside a disc drawn in it.
       *
       * The disc is why a scattered topping on a square left four bare corners and
       * a margin down every side, and why on a heart the odd piece sat out over
       * the cleft with nothing under it. Darts are thrown at the outline's bounding
       * box and the ones that miss the cake are dropped, which costs a third of the
       * throws on a heart and buys a scatter that fills whatever it is scattered on.
       */
      const face = outlineAt(tiers.length - 1, "top");
      const field = offsetOutlineClear(face, -size * 0.7);
      const n = Math.min(limit, countFor(spec, outlineArea(face), size));

      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of field) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
      }

      const pts: [number, number][] = [];
      let guard = 0;
      while (pts.length < n && guard < n * 240) {
        guard++;
        const p: [number, number] = [x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0)];
        if (!insideOutline(field, p[0], p[1])) continue;
        if (blocked(p[0], p[1], keepOff, sector)) continue;
        if (pts.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= apart)) pts.push(p);
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
        normalMap={mat.normalMap?.()}
        normalScale={[mat.normalScale ?? 1, mat.normalScale ?? 1]}
        sheen={mat.sheen ?? 0}
        sheenColor="#FFE9CC"
        envMapIntensity={spec.kind === "gold-leaf" ? 1.6 : 0.8}
      />
    </instancedMesh>
  );
}

/** Garnish does not scale linearly with the cake — a strawberry is a strawberry. */
export function scaleForSize(baseRadius: number): number {
  return 0.78 + Math.min(0.42, baseRadius * 0.18);
}
