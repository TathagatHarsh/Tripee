import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Finish, Shape, SizeBand } from "@/lib/schema";
import { DIAMETER_IN } from "@/lib/servings";
import { fbm3 } from "./noise";
import { mulberry32 } from "@/lib/seed";

/**
 * Everything is a primitive. Procedural means every combination works and there
 * is no modeller in the loop. Real cakes have no sharp corners, so every profile
 * here is bevelled — sharp edges are the second-biggest CG tell after gloss.
 */

/** 1 world unit ≈ 3.6 inches. An 8in cake comes out 2.24 units across. */
const IN = 0.28;

export function baseRadius(size: SizeBand): number {
  return (DIAMETER_IN[size] / 2) * IN;
}

/** A single tier is about 4in tall; bigger cakes get a touch more height. */
export function baseHeight(size: SizeBand): number {
  return (3.6 + DIAMETER_IN[size] * 0.06) * IN;
}

/** Bundt tins are deeper than a sandwich tin, and it shows. */
export function heightFor(shape: Shape, size: SizeBand): number {
  return baseHeight(size) * (shape === "bundt" ? 1.16 : 1);
}

/**
 * Diameter step between tiers.
 *
 * A tiered cake is baked in tins two or three inches apart — a 10/8/6 or a
 * 12/9/6 — which is a ratio around 0.75–0.8 per step, not 0.68 and 0.54. The old
 * numbers stepped in twice as fast as any real tin set, and a top tier that small
 * makes the whole cake read as a novelty tower rather than as a celebration cake.
 */
const TIER_RADIUS_RATIO: Record<number, number[]> = {
  1: [1],
  2: [1, 0.72],
  3: [1, 0.78, 0.58],
};

/**
 * Real tiers are all much the same height — they come out of tins of the same
 * depth. A slight taper upward flatters the stack; 0.9/0.8 is not a taper, it is a
 * different cake per layer.
 */
const TIER_HEIGHT_RATIO: Record<number, number[]> = {
  1: [1],
  2: [1, 0.94],
  3: [1, 0.95, 0.88],
};

/**
 * How much each tier of a stack is shortened relative to a single-tier cake.
 *
 * At 0.82, on top of the height ratios above, a 5kg three-tier came out 12 inches
 * across and nine and a half tall — squat, and nothing like the proportions people
 * are picturing when they order a tiered cake. A real one of that size is closer
 * to eleven or twelve inches tall.
 */
const STACK_HEIGHT_FACTOR = 0.94;

/**
 * The shape of one tier of a stack.
 *
 * `docs/SESSION-SUMMARY.md` closes on this as an open question: a two-tier heart
 * stacks a heart on a heart, which reads oddly, and real tiered hearts are a heart
 * over a round. It reads oddly for a concrete reason — a heart is a silhouette,
 * and a silhouette only works when you can see the whole of it. Stacked, each
 * heart eats the cleft of the one below it, so what you get is neither one heart
 * nor two: it is a lumpy round cake with a notch in the top.
 *
 * So the heart goes where it can be seen whole, which is the top, and everything
 * under it is round. A single-tier heart is its own top tier and is unaffected.
 */
export function tierShape(shape: Shape, index: number, tierCount: number): Shape {
  if (shape === "heart" && tierCount > 1) {
    return index === tierCount - 1 ? "heart" : "round";
  }
  return shape;
}

export interface TierDims {
  radius: number;
  height: number;
  /** World Y of the tier's base. */
  y: number;
}

export function tierDims(size: SizeBand, tiers: number, shape: Shape = "round"): TierDims[] {
  const r0 = baseRadius(size);
  const h0 = heightFor(shape, size) * (tiers === 1 ? 1 : STACK_HEIGHT_FACTOR);
  const rr = TIER_RADIUS_RATIO[tiers] ?? TIER_RADIUS_RATIO[1];
  const hr = TIER_HEIGHT_RATIO[tiers] ?? TIER_HEIGHT_RATIO[1];

  const out: TierDims[] = [];
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const height = h0 * hr[i];
    out.push({ radius: r0 * rr[i], height, y });
    y += height;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2D profiles
 * ------------------------------------------------------------------ */

/** 0–1 easing with zero first *and* second derivative at both ends. */
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function roundedPolygon(pts: [number, number][], r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;

  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];

    const dPrev = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const dNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const tPrev = Math.min(0.5, r / dPrev);
    const tNext = Math.min(0.5, r / dNext);

    const a = lerp(cur, prev, tPrev);
    const b = lerp(cur, next, tNext);

    if (i === 0) s.moveTo(a[0], a[1]);
    else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(cur[0], cur[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

function heartShape(r: number): THREE.Shape {
  // Two bézier lobes meeting at a point, mirrored so the lobes face the camera
  // and the point runs away from it — the way a heart cake is photographed.
  // The point itself gets a small radius; a knife-edge corner is not a cake.
  const s = new THREE.Shape();
  const k = r * 1.02;
  const tip = k * 0.95;
  const nib = k * 0.07;

  s.moveTo(-nib * 0.6, tip - nib * 0.5);
  s.quadraticCurveTo(0, tip, nib * 0.6, tip - nib * 0.5);
  s.bezierCurveTo(k * 0.62, k * 0.35, k * 1.06, -k * 0.36, k * 0.52, -k * 0.72);
  s.bezierCurveTo(k * 0.22, -k * 0.94, 0, -k * 0.66, 0, -k * 0.5);
  s.bezierCurveTo(0, -k * 0.66, -k * 0.22, -k * 0.94, -k * 0.52, -k * 0.72);
  s.bezierCurveTo(-k * 1.06, -k * 0.36, -k * 0.62, k * 0.35, -nib * 0.6, tip - nib * 0.5);
  return s;
}

function polygonFor(shape: Shape, r: number): THREE.Shape {
  switch (shape) {
    case "square":
      return roundedPolygon(
        [[-r, -r], [r, -r], [r, r], [-r, r]],
        r * 0.16,
      );
    case "rectangle": {
      const w = r * 1.28, d = r * 0.82;
      return roundedPolygon([[-w, -d], [w, -d], [w, d], [-w, d]], d * 0.2);
    }
    case "hexagon": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return roundedPolygon(pts, r * 0.12);
    }
    case "heart":
      return heartShape(r);
    default:
      return roundedPolygon([[-r, -r], [r, -r], [r, r], [-r, r]], r);
  }
}

/**
 * LatheGeometry spaces V by point index, not by arc length. A profile with
 * bevel arcs — which is every profile here — therefore gives the long side wall
 * a sliver of the texture and stretches it into vertical streaks. Remap V to
 * real arc length so a normal map tiles evenly.
 */
function latheWithUV(
  points: THREE.Vector2[],
  segments: number,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(points, segments, phiStart, phiLength);

  const lens: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    lens.push(lens[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  const total = lens[lens.length - 1] || 1;

  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = points.length;
  for (let i = 0; i < uv.count; i++) uv.setY(i, lens[i % n] / total);
  uv.needsUpdate = true;

  // NOT computeVertexNormals(). LatheGeometry ships analytic normals that are
  // already averaged across the φ=0 wrap and across the fan apex at the centre
  // of a flat top. Recomputing them from face winding breaks both: every round
  // cake got a hard vertical crease down one side and a star-shaped shading
  // artifact on its lid.
  weldNormals(g);
  return g;
}

/**
 * Average the normals of vertices that occupy the same point in space.
 *
 * Any geometry whose vertices have been moved has to have its normals
 * recomputed, and computeVertexNormals() treats duplicated seam vertices as
 * unrelated — so a closed lathe comes back with a visible seam. Welding after
 * the fact keeps the split UVs (which have to stay split) while making the
 * shading continuous (which it has to be).
 */
function weldNormals(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (!nor) return;

  const buckets = new Map<string, number[]>();
  const q = (v: number) => Math.round(v * 1e4);

  for (let i = 0; i < pos.count; i++) {
    const key = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }

  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of list) { x += nor.getX(i); y += nor.getY(i); z += nor.getZ(i); }
    const len = Math.hypot(x, y, z) || 1;
    x /= len; y /= len; z /= len;
    for (const i of list) nor.setXYZ(i, x, y, z);
  }
  nor.needsUpdate = true;
}

/**
 * Round tiers get a lathe so the base can flare very slightly, as cakes settle.
 *
 * `wallSteps` subdivides the straight side wall. The profile used to jump
 * bevel-top straight to bevel-bottom in one segment, giving the whole side of
 * the cake two vertices to work with. The combed finish displaces by
 * sin(y · 62), which is about eleven ridges over the height of a tier — sampled
 * twice. So a customer could pay ₹94 for "horizontal ridges from a serrated
 * scraper" and get a perfectly smooth cake, on every round shape, which is most
 * of them.
 */
function lathePoints(
  r: number, h: number, bevel: number, flare = 1.012, wallSteps = 26,
): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const rb = r * flare;
  const arc = (
    cx: number, cy: number, rad: number,
    from: number, to: number, steps = 6,
  ) => {
    for (let i = 0; i <= steps; i++) {
      const a = from + (to - from) * (i / steps);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
    }
  };

  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(rb - bevel, 0));
  arc(rb - bevel, bevel, bevel, -Math.PI / 2, 0);

  // The side wall, sampled densely enough for a finish to live on it. The wall
  // tapers from the flared base radius to r over its height, which is what a
  // stacked cake actually does under its own weight.
  const y0 = bevel;
  const y1 = h - bevel;
  const x0 = rb;
  for (let i = 1; i <= wallSteps; i++) {
    const t = i / wallSteps;
    pts.push(new THREE.Vector2(x0 + (r - x0) * t, y0 + (y1 - y0) * t));
  }

  arc(r - bevel, h - bevel, bevel, 0, Math.PI / 2);

  // Same argument for the lid: one segment from the rim to the centre meant the
  // top of a rustic cake was mirror-flat while its sides were swirled.
  const topSteps = Math.max(1, Math.round(wallSteps * 0.5));
  const xTop = r - bevel;
  for (let i = 1; i <= topSteps; i++) {
    pts.push(new THREE.Vector2(xTop * (1 - i / topSteps), h));
  }

  return pts;
}

/* ------------------------------------------------------------------ *
 * Tier bodies
 * ------------------------------------------------------------------ */

/**
 * A wedge taken out of the cake, so the sponge layers and the filling between
 * them read as a cross-section. `phi` is measured the way LatheGeometry
 * measures it — from +Z towards +X — so the same angle means the same place on
 * a lathe and on an extruded shape.
 */
export interface Sector {
  /** Centre of the *removed* wedge, in radians. */
  centre: number;
  /** Angular width of the removed wedge, in radians. */
  width: number;
}

/** Facing the default camera, opened slightly to its right. */
export const DEFAULT_SLICE: Sector = { centre: 0.34, width: Math.PI * 0.3 };

/** Where a point sits on the cut circle. Shared by every shape. */
export function phiOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

export interface BodyOpts {
  shape: Shape;
  radius: number;
  height: number;
  /** Radial segments for round shapes. Dropped on low-power devices. */
  segments?: number;
  bevel?: number;
  /** Omit for a whole cake; supply to cut a wedge out of it. */
  sector?: Sector;
  /**
   * Close a lathe's cut with a flat face. True for anything solid — the sponge, the
   * filling. False for the frosting: a capped frosting shell puts a slab of
   * buttercream across the whole cross-section and hides the very layers the cut
   * exists to show. Left open, it reads as the thin skin it actually is, and the
   * lathe's profile carries the lid round with it either way.
   *
   * Extruded shapes ignore this — their wall follows the whole outline, the two
   * radial cut edges included, and there is no way to ask ExtrudeGeometry for a
   * wall with two faces missing. `shellGeometry` sets those cuts back instead.
   */
  capCut?: boolean;
}

export function tierGeometry({
  shape, radius, height, segments = 72, bevel, sector, capCut = true,
}: BodyOpts): THREE.BufferGeometry {
  const b = bevel ?? Math.min(radius * 0.09, height * 0.18, 0.07);

  if (shape === "round") {
    const profile = lathePoints(radius, height, b);
    return sector
      ? cutLathe(profile, segments, sector, capCut)
      : latheWithUV(profile, segments);
  }

  if (shape === "bundt") return bundtGeometry(radius, height, segments, sector, capCut);

  const full = polygonFor(shape, radius - b);
  const inset = sector ? cutShape(full, sector, b) : full;
  const g = new THREE.ExtrudeGeometry(inset, {
    depth: Math.max(0.01, height - b * 2),
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 4,
    curveSegments: 28,
    // The side wall needs vertical tessellation or the frosting displacement has
    // nothing to push and the surface comes out looking hammered.
    steps: 14,
  });
  // Extrusion runs from -bevelThickness to depth + bevelThickness, so the base
  // lands one bevel below zero. Lift it back onto the board.
  g.rotateX(-Math.PI / 2);
  g.translate(0, b, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * A lathe swept over everything except the wedge, plus a flat cap at each cut.
 * `LatheGeometry` leaves a sector open, and an open cake is a cake you can see
 * straight through — the caps are what make the cut read as a cut.
 */
function cutLathe(
  profile: THREE.Vector2[],
  segments: number,
  sector: Sector,
  capped = true,
): THREE.BufferGeometry {
  const half = sector.width / 2;
  const phiStart = sector.centre + half;
  const phiLength = Math.PI * 2 - sector.width;

  const kept = Math.max(8, Math.round(segments * (phiLength / (Math.PI * 2))));
  const wall = latheWithUV(profile, kept, phiStart, phiLength);
  if (!capped) return wall;

  /*
   * The two cut faces look in opposite directions — away from the missing wedge on
   * each side. One of them therefore needs its winding reversed, or it is back-face
   * culled and you see straight through the cake.
   *
   * `phiStart` is the *end* of the removed wedge, so its face looks back down the
   * decreasing-φ side — which is where ShapeGeometry's own +Z normal ends up once
   * the profile is stood up. That one is already right; the far face is the one to
   * turn round.
   */
  const caps = [
    capGeometry(profile, phiStart, false),
    capGeometry(profile, phiStart + phiLength, true),
  ];
  const merged = mergeGeometries([wall, ...caps], false);

  if (!merged) return wall;
  wall.dispose();
  caps.forEach(c => c.dispose());
  // No computeVertexNormals here: the wall's normals are the lathe's analytic
  // ones and the caps carry their own flat normals. Recomputing would weld the
  // cut face to the wall and round off the very edge that makes a cut read as
  // a cut — and would put the lathe seam back.
  return merged;
}

/**
 * The profile itself, triangulated flat and stood up in the plane at `phi`.
 * Rendered double-sided, because a cut face is looked at from whichever side
 * the customer happens to have rotated towards.
 */
function capGeometry(
  profile: THREE.Vector2[],
  phi: number,
  flip: boolean,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(p => new THREE.Vector2(Math.max(0, p.x), p.y)));
  const g = new THREE.ShapeGeometry(shape);

  /*
   * ShapeGeometry lies in XY. Lathe places a profile point at
   * (x·sin φ, y, x·cos φ), and rotateY(θ) sends (x, y, 0) to (x·cos θ, y, −x·sin θ) —
   * so the angle that lands the profile on the lathe's own plane is (φ − π/2).
   *
   * It used to be (π/2 − φ), which is the same rotation the other way and puts the
   * cap at (π − φ): both cut faces came out mirrored onto the far side of the cake,
   * buried inside solid sponge where nothing could see them, leaving the actual cut
   * uncapped. Every round and bundt cutaway was hollow — you looked straight through
   * the slice at the inside of the far wall and at the pac-man notch in the layer
   * discs across the cake.
   */
  g.rotateY(phi - Math.PI / 2);

  if (flip) {
    // Reverse the triangle winding, and flip the normals to match. The normals
    // used to be left to a computeVertexNormals() after the merge, but that
    // pass also destroyed the wall's seam-continuous normals, so the cap now
    // owns its own.
    const idx = g.getIndex();
    if (idx) {
      const a = Array.from(idx.array);
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i];
        a[i] = a[i + 2];
        a[i + 2] = t;
      }
      g.setIndex(a);
    }
    const nor = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nor.count; i++) {
      nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    }
    nor.needsUpdate = true;
  }

  // Give the cap its own UVs; the shape's are in world units.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const spanY = Math.max(1e-6, box.max.y - box.min.y);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    uv[i * 2] = r;
    uv[i * 2 + 1] = (pos.getY(i) - box.min.y) / spanY;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Clip a 2D outline to the kept sector and close it through the axis, so an extruded
 * shape loses the same wedge a lathe does. Extrude caps the result on its own, which
 * is why this does not need explicit cut faces — and why `bevel`, the extrude's own
 * `bevelSize`, has to be compensated for below.
 */
function cutShape(shape: THREE.Shape, sector: Sector, bevel: number): THREE.Shape {
  const pts = shape.getSpacedPoints(288);
  const n = pts.length;
  const half = sector.width / 2;

  /*
   * The wedge, as two half-planes rather than two angles — and each one pushed
   * `bevel` further out of the cake than the sector asked for.
   *
   * That offset is the compensation for `ExtrudeGeometry`, which shifts the whole
   * outline outward by `bevelSize` across the body of the extrusion. On the
   * perimeter that is paid for by extruding `polygonFor(radius - b)`; on the two
   * radial edges of the wedge it means the cut creeps into the void. Measured on a
   * square at bevel 0.1 the wedge came out 0.07rad narrow at the rim and *half* the
   * asked-for angle near the axis, because the apex had slid off-centre — which on
   * a frosting shell, whose bevel is the heaviest in the cake, was enough to plant
   * the shell's cut face in front of the sponge's and hide the cross-section.
   *
   * A world angle θ points (sin θ, −cos θ) in shape space, so (cos θ, sin θ) is its
   * plane's normal there; signing it by which side of the wedge it bounds makes
   * "kept" the same test on both.
   */
  const normal = (s: 1 | -1) => {
    const th = sector.centre + s * half;
    return new THREE.Vector2(Math.cos(th) * s, Math.sin(th) * s);
  };
  const nPos = normal(1), nNeg = normal(-1);
  const keep = pts.map(p => p.dot(nPos) >= bevel || p.dot(nNeg) >= bevel);
  if (!keep.some(k => k) || keep.every(k => k)) return shape;

  // The run of kept points, found by the one place it starts rather than by
  // guessing at a gap in the list.
  const start = keep.findIndex((k, i) => k && !keep[(i - 1 + n) % n]);
  if (start < 0) return shape;

  const ordered: THREE.Vector2[] = [];
  for (let i = 0; i < n && keep[(start + i) % n]; i++) ordered.push(pts[(start + i) % n]);
  if (ordered.length < 3) return shape;

  /*
   * Both ends of that run land wherever the sampling happened to fall, up to one
   * sample outside the wedge — 0.045rad of slop at mid-radius on a square, enough
   * for the two sides of one wedge to disagree by 3°. So each end is walked back
   * onto the exact plane it crossed, which is whichever of the two it sits nearer.
   */
  const nearer = (p: THREE.Vector2) => (p.dot(nPos) < p.dot(nNeg) ? nPos : nNeg);
  const last = ordered.length - 1;
  const before = pts[(start - 1 + n) % n];
  const after = pts[(start + ordered.length) % n];
  ordered[0] = onPlane(before, ordered[0], nearer(ordered[0]), bevel) ?? ordered[0];
  ordered[last] = onPlane(after, ordered[last], nearer(ordered[last]), bevel) ?? ordered[last];

  /*
   * Closed through the apex, which is where those two offset planes cross rather
   * than the centre. Clamped so a heavy bevel on a small cake cannot push it out
   * past the outline and fold the polygon over itself; at that point the cut is
   * slightly shy of the axis, which is invisible next to a wedge folded inside out.
   */
  const reach = Math.min(
    bevel / Math.max(0.25, Math.sin(half)),
    0.4 * Math.min(...pts.map(p => p.length())),
  );
  const apex = new THREE.Vector2(-Math.sin(sector.centre), Math.cos(sector.centre))
    .multiplyScalar(reach);

  const out = new THREE.Shape();
  out.moveTo(apex.x, apex.y);
  for (const p of ordered) out.lineTo(p.x, p.y);
  out.closePath();
  return out;
}

/**
 * Where the segment `a`→`b` crosses the plane `nrm · p = d`, in shape space. Null
 * if it does not, which leaves the caller on its sampled point.
 */
function onPlane(
  a: THREE.Vector2, b: THREE.Vector2, nrm: THREE.Vector2, d: number,
): THREE.Vector2 | null {
  const da = a.dot(nrm) - d;
  const db = b.dot(nrm) - d;
  if (Math.abs(da - db) < 1e-9) return null;
  const t = da / (da - db);
  return t >= 0 && t <= 1 ? new THREE.Vector2().lerpVectors(a, b, t) : null;
}

/**
 * The bundt. `docs/SESSION-SUMMARY.md` calls it the weakest of the twelve renders
 * and it is worse than that reads: what it actually looked like was a plant pot.
 *
 * Four separate faults, all of them about silhouette:
 *
 *  1. The outer wall was dead straight from the base bevel to half height, and then
 *     turned in. A bundt tin is the other way round — it is *widest near the top*
 *     and tapers down towards the base, because the tin has to release the cake.
 *     Straight-sided-then-domed is a bucket; wide-shouldered-and-tapering is a
 *     bundt, and the difference is legible from across a room.
 *  2. The centre shaft ran at a constant `ri` all the way down to the board, and
 *     the top surface simply stopped at it — so the hole was an open pipe you could
 *     see down, right through to the board. A tin's core is a cone, wider at the
 *     top, and the cake wraps *over* the inner wall in the same curve it wraps over
 *     the outer one. That closes the eye's path into the middle, which is what stops
 *     it reading as a container.
 *  3. Eleven profile points meant no vertical subdivision to flute against, and
 *     0.11 of radius at the widest was a ripple. A bundt's flutes are deep — a
 *     third of the wall — and they run over the shoulder and down into the hole.
 *  4. The flute amplitude was keyed to `(rad - ri)/(r - ri)`, i.e. to how far out a
 *     vertex was, so the flutes faded to nothing at the top of the dome exactly
 *     where a real bundt's flutes converge most tightly.
 */
/** Flutes round a bundt. Exported so the glaze can follow the same ridges. */
export const BUNDT_FLUTES = 14;

/** Radius of the centre core, as a fraction of the cake's own radius. */
const BUNDT_CORE = 0.3;

/**
 * The bundt's profile in normalised (radius, height) pairs, as data rather than as
 * a sequence of calls, because two things need it: the cake, and the glaze poured
 * over the cake. Deriving the glaze from the same numbers is the only way its skirt
 * can sit *on* the dome rather than near it.
 *
 * The winding, as a path: start at the foot of the centre core, out along the base,
 * up the outer wall, over the shoulder and the crown, down the inner shoulder into
 * the hole, and back down the core to the board. Reverse it and the cake renders
 * inside-out — that was bug 5 in the render log, and writing this out in the reading
 * order of the shape rather than in winding order reproduced it exactly: an open
 * crater with a lit interior. Sampled densely enough that the fluting has vertices
 * to move.
 */
const BUNDT_PROFILE: [number, number][] = [
  [BUNDT_CORE, 0],  // foot of the core, on the board
  [0.84, 0],        // out along the base
  [0.88, 0.03],
  [0.94, 0.13],
  [0.98, 0.28],
  [1, 0.44],        // the widest point, a little below mid-height
  [0.99, 0.58],
  [0.96, 0.71],     // and rolling in from here — this is the dome
  [0.9, 0.82],
  [0.8, 0.91],
  [0.68, 0.97],
  [0.56, 1],        // the crown, well inboard of the widest point
  [0.46, 0.98],
  [0.38, 0.92],     // over the inner lip and down into the hole
  [0.33, 0.8],
  [0.31, 0.56],
  [BUNDT_CORE, 0.3],  // the core runs to the board, so the hole is a hole
  [BUNDT_CORE, 0],
];

/** The flute modulation, shared by the cake and by the glaze on it. */
function bundtFlute(theta: number, t: number, radFrac: number): number {
  const outer = THREE.MathUtils.smoothstep(radFrac, BUNDT_CORE * 1.35, BUNDT_CORE * 1.75);
  const envelope = Math.min(1, t / 0.06) * Math.min(1, (1 - t) / 0.1) * outer;
  return 1 + 0.115 * envelope * Math.cos(BUNDT_FLUTES * theta);
}

/**
 * Glaze poured over a bundt.
 *
 * Three attempts at running the generic drip system over this shape all failed for
 * the same reason, and it is worth writing down: that system assumes a *pooled top
 * edge over a vertical wall*, and a bundt has neither. Runs placed at free angles
 * either buried themselves in a flute crest or hung in mid-air over a trough; snapped
 * to the crests they sat on the ridges correctly but still detached, because a run
 * descending plumb leaves a dome the instant the dome starts curving inward.
 *
 * What a poured glaze actually is, on this shape, is a *coat with an uneven skirt*:
 * it covers the crown, wraps the inner lip, and reaches further down the troughs than
 * the ridges, because that is where a liquid collects. So it is built as a shell of
 * the cake's own surface, offset outward by a glaze thickness, ending at a per-angle
 * height. It cannot detach, because it is a copy of the thing it sits on.
 */
export function glazeCapGeometry(
  radius: number,
  height: number,
  segments: number,
  seed: number,
): THREE.BufferGeometry {
  // From the inner lip, over the crown, down the outer wall. Reversed out of the
  // cake's own profile, so the two can never drift apart.
  const start = BUNDT_PROFILE.findIndex(([, y]) => y === 0.92 as number);
  const capPath = BUNDT_PROFILE.slice(4, start + 1).reverse();

  const arc: number[] = [0];
  for (let i = 1; i < capPath.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(
      (capPath[i][0] - capPath[i - 1][0]) * radius,
      (capPath[i][1] - capPath[i - 1][1]) * height,
    ));
  }
  const total = arc[arc.length - 1] || 1;

  /** Sample the cap path at a fraction of its own arc length. */
  const sample = (f: number): [number, number] => {
    const d = THREE.MathUtils.clamp(f, 0, 1) * total;
    let k = 0;
    while (k < arc.length - 2 && arc[k + 1] < d) k++;
    const u = (d - arc[k]) / Math.max(1e-6, arc[k + 1] - arc[k]);
    return [
      capPath[k][0] + (capPath[k + 1][0] - capPath[k][0]) * u,
      capPath[k][1] + (capPath[k + 1][1] - capPath[k][1]) * u,
    ];
  };

  const rng = mulberry32(seed ^ 0x9d2c5680);
  const rows = 12;
  const cols = Math.max(24, Math.round(segments));
  /*
   * Clearance over the cake, not a physical glaze thickness. `shellGeometry` displaces
   * the surface underneath by its own fbm, base fillet and top crown — up to about 2%
   * of the radius — none of which this cap reproduces, so anything tighter than that
   * budget lets the cake poke through and the two surfaces tear into each other.
   */
  const thickness = Math.max(0.02, radius * 0.045);

  // One phase per cake, so two bundts of different configs pour differently.
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let c = 0; c <= cols; c++) {
    const theta = (c / cols) * Math.PI * 2;
    // Deeper in the troughs than on the ridges: cos is +1 on a crest, so this
    // subtracts reach there. Plus two slow waves, so the skirt is not periodic in
    // the flutes alone — glaze does not know how many flutes the tin had.
    const crest = (Math.cos(BUNDT_FLUTES * theta) + 1) / 2;
    const wave = Math.sin(theta * 2 + phaseA) * 0.5 + Math.sin(theta * 3.7 + phaseB) * 0.5;
    const reach = THREE.MathUtils.clamp(0.72 - crest * 0.2 + wave * 0.12, 0.3, 1);

    for (let r = 0; r <= rows; r++) {
      const f = (r / rows) * reach;
      const [radFrac, t] = sample(f);
      const k = bundtFlute(theta, t, radFrac);
      const rad = radFrac * k * radius + thickness;
      pos.push(Math.cos(theta) * rad, t * height, Math.sin(theta) * rad);
      uv.push(c / cols, r / rows);
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i0 = c * (rows + 1) + r;
      const i1 = i0 + 1;
      const i2 = (c + 1) * (rows + 1) + r;
      const i3 = i2 + 1;
      // Wound so the cap faces outward. The frosting renders FrontSide, so the other
      // winding shows the inside of the glaze and reads as dark torn shards.
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

function bundtGeometry(
  r: number,
  h: number,
  segments: number,
  sector?: Sector,
  capCut = true,
): THREE.BufferGeometry {
  /*
   * Wound so the surface normals face out of the ring, not into it. Reverse this
   * order and the cake renders inside-out — that was bug 5 in the render log, and
   * writing this profile out in the reading order of the shape rather than in the
   * winding order reproduced it exactly: an open crater with a lit interior.
   *
   * The winding, as a path: start at the foot of the centre core, out along the
   * base, up the outer wall, over the shoulder and the crown, down the inner
   * shoulder into the hole, and back down the core to the board. Sampled densely
   * enough that the fluting below has vertices to move.
   */
  const pts = BUNDT_PROFILE.map(([rad, y]) => new THREE.Vector2(rad * r, y * h));

  const g = sector ? cutLathe(pts, segments, sector, capCut) : latheWithUV(pts, segments);

  /*
   * Radial fluting — the thing that makes a bundt a bundt.
   *
   * Keyed to height rather than to radius, so the flutes run the whole way over the
   * shoulder and converge at the crown the way a tin's do, and pinched out only in
   * the last few percent at the very top and at the foot, where the metal of a real
   * tin is flat.
   */
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rad = Math.hypot(x, z);
    if (rad < 1e-5) continue;

    // Faded at the foot and at the crown; full depth across the body and the
    // shoulder, where the flutes of a real tin converge and are most legible. Only
    // the outer wall is fluted: a tin's centre tube is smooth, and rippling the
    // inside of the hole reads as a mistake.
    const t = THREE.MathUtils.clamp(y / h, 0, 1);
    const theta = Math.atan2(z, x);
    const k = bundtFlute(theta, t, rad / r);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

/* ------------------------------------------------------------------ *
 * Frosting shell
 * ------------------------------------------------------------------ */

const FINISH_AMPLITUDE: Record<Finish, number> = {
  smooth: 0.006,
  rustic: 0.034,
  // 0.022 was a moulding profile and 0.014 was invisible on a 0.5kg cake, which
  // is a customer paying for a serrated-comb finish and getting a plain one.
  combed: 0.018,
  ombre: 0.008,
  ruffle: 0.008,   // the ruffles themselves are instanced on top
  rosette: 0.008,  // ditto
};

// Low frequencies sample slowly around the circumference and come out as
// vertical brush streaks. These are tuned to stay isotropic on a cylinder.
const FINISH_FREQUENCY: Record<Finish, number> = {
  smooth: 13,
  rustic: 8.5,
  combed: 11,
  ombre: 13,
  ruffle: 10,
  rosette: 10,
};

/**
 * The shell's cut, moved back out of the sponge's way.
 *
 * Only extruded shapes need this. A lathe can be left open at the cut — see
 * BodyOpts.capCut — but an extrude's wall runs round the whole outline, so a cut
 * square, heart, rectangle or hexagon gets a slab of frosting across its
 * cross-section whether it wants one or not. Coplanar with the sponge's own cut
 * face, and bigger, the frosting won the depth test and hid the very layers the cut
 * exists to show; that is what the old thin-band workaround was avoiding, at the
 * price of the entire frosting lid.
 *
 * So the wedge is widened for the shell alone, by enough that its cut face — noise
 * displacement and all — stays behind the sponge's. `amp` is the finish's
 * displacement, doubled because a couple of the finishes stack a second term on top
 * of it, plus 3mm for the residual in the bevel compensation in `cutShape`.
 */
function setBack(sector: Sector, radius: number, amp: number): Sector {
  return {
    centre: sector.centre,
    width: sector.width + 2 * ((amp * 2 + 0.03) / Math.max(0.2, radius)),
  };
}

/**
 * The shell is the tier profile grown by the frosting thickness, then pushed
 * along its own normals by seeded noise. Seeded, because a cake that reshuffles
 * on every React render looks broken.
 */
export function shellGeometry(
  opts: BodyOpts & { finish: Finish; seed: number; thickness?: number },
): THREE.BufferGeometry {
  const t = opts.thickness ?? Math.max(0.022, opts.radius * 0.035);
  const H = opts.height + t;
  const B = Math.min((opts.radius + t) * 0.13, H * 0.2, 0.1);
  const amp = FINISH_AMPLITUDE[opts.finish] * (opts.radius / 1.1);
  const lathe = opts.shape === "round" || opts.shape === "bundt";
  const g = tierGeometry({
    ...opts,
    // Frosting is a skin, not a solid.
    capCut: false,
    sector: opts.sector && (lathe ? opts.sector : setBack(opts.sector, opts.radius, amp)),
    radius: opts.radius + t,
    height: H,
    bevel: B,
  });
  /*
   * Before displacing, not just after.
   *
   * `ExtrudeGeometry` keeps its lid and its side wall on separate vertices that
   * happen to share a position, with the two surfaces' own normals. Displace along
   * those and the seam splits — a hairline crack right round the top rim. It never
   * showed on a whole cake, because with the frosting closed there is nothing behind
   * it to see; on a cut cake the sponge is rendered, and the crack came out as a
   * dashed brown line along the rim of the lid.
   */
  weldNormals(g);

  const freq = FINISH_FREQUENCY[opts.finish];
  const rng = mulberry32(opts.seed);
  const ox = rng() * 100, oy = rng() * 100, oz = rng() * 100;
  // A fourth offset off the same stream. No new field in lib/seed's SEEDED array,
  // so nothing that is already hashed changes meaning — this is another draw on
  // randomness the cake already had.
  const ow = rng() * 100;

  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;

  // The top of the side wall: where a scraper stops and frosting gathers.
  const wallTop = H - B;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const sideness = 1 - Math.abs(nor.getY(i));

    let d = (fbm3(x * freq + ox, y * freq + oy, z * freq + oz, 3) - 0.5) * 2 * amp;

    // These two were tuned against a lathe that had two vertices down the whole
    // side wall, so their amplitudes had to be enormous to survive the
    // aliasing. Now that the wall is properly subdivided the same numbers came
    // out as coil pottery and a stack of plates. Retuned to what the tools
    // actually leave: a serrated scraper cuts 2-3mm ridges, a bench scraper
    // leaves a track you have to catch in the light.
    if (opts.finish === "combed") {
      // Still a stack of plates at 1.15 of a 0.022 amplitude: that is a 3.4mm
      // peak-to-trough ridge every 7mm, which is a moulding profile rather than a
      // scraper mark. A serrated comb leaves about 1.5mm of relief, so the
      // amplitude is roughly halved (see FINISH_AMPLITUDE) and the ridges are
      // pitched a little finer to match a real comb's teeth.
      d += Math.sin(y * 88) * amp * 1.05 * sideness;
    }
    if (opts.finish === "smooth" || opts.finish === "ombre") {
      d += Math.sin(y * 16 + ox) * amp * 0.4 * sideness;
    }
    if (opts.finish === "rustic") {
      // Palette-knife work is a sequence of overlapping *sweeps* — each one
      // starts, curves and lifts off. The old band was sin(θ·9 + y·14), which at
      // nine cycles around the cake and a shallow y term is a set of near-vertical
      // folds running top to bottom: a draped cloth, or a candle that has melted,
      // which is exactly how the palest cake in the lab read. Pitching the two
      // terms the other way round — few cycles vertically, many around — turns the
      // same one-line displacement into diagonal strokes that wrap the cake.
      const theta = Math.atan2(z, x);
      d += Math.sin(theta * 3.5 + y * 22) * amp * 0.42;
      d += Math.sin(theta * 6.5 - y * 9 + oy) * amp * 0.3;
    }

    let nx = x + nor.getX(i) * d;
    const ny = y + nor.getY(i) * d;
    let nz = z + nor.getZ(i) * d;

    /*
     * Radial-only shaping, on top of the along-normal displacement above.
     *
     * Three separate reasons the old shell read as a machined part:
     *
     *  - its plan view was a mathematically exact circle at every height. The fbm
     *    displacement runs at frequency 8.5–13, which is fine enough to texture the
     *    surface and far too fine to move the *outline*, so the silhouette — the
     *    thing the eye actually judges a shape by — stayed perfect. `wobble` is one
     *    slow turn of noise, half a percent of the radius, which is invisible as
     *    texture and unmistakable as a hand-made outline;
     *  - frosting does not stop dead at the board. It gathers in a fillet at the
     *    bottom, because that is where the scraper runs out and where gravity puts
     *    it. Without one, the join is a knife-edge;
     *  - and it gathers again at the top of the wall, standing slightly proud of it.
     *    That crown is the signature of a hand-scraped cake — it is the ridge you
     *    knock off with a hot knife to get a "sharp edge" finish.
     *
     * All three are applied radially rather than along the normal, and scaled by
     * `sideness`, so the flat top is left alone: pushing the lid outward would tear
     * it away from the wall it shares vertices with.
     */
    const rad = Math.hypot(nx, nz);
    if (rad > 1e-4 && sideness > 0.05) {
      const fillet = Math.exp(-y / (H * 0.07)) * t * 0.55;
      const crown = Math.exp(-Math.pow((y - wallTop * 0.985) / (H * 0.045), 2)) * t * 0.4;
      const wobble = (fbm3(nx * 0.9 + ow, y * 0.6, nz * 0.9 + ow, 2) - 0.5) * 2
        * opts.radius * 0.006;
      const dr = (fillet + crown + wobble) * sideness;
      nx += (nx / rad) * dr;
      nz += (nz / rad) * dr;
    }

    pos.setXYZ(i, nx, ny, nz);
  }

  pos.needsUpdate = true;
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

/** A frosting disc for top-only and naked builds. */
export function topDiscGeometry(opts: BodyOpts & { finish: Finish; seed: number }) {
  return shellGeometry({
    ...opts,
    radius: opts.radius * 0.94,
    height: Math.max(0.04, opts.radius * 0.07),
    thickness: 0.01,
  });
}

/* ------------------------------------------------------------------ *
 * Sponge and filling slabs
 * ------------------------------------------------------------------ */

export interface Slab {
  kind: "sponge" | "filling";
  y: number;
  height: number;
  radius: number;
}

/**
 * Layer heights get ±2% of seeded jitter so the stack is not mechanically
 * identical, which is what gives away a generated cake.
 */
/**
 * Every layer gets a band under it — jam, mousse, or just the scrape of
 * frosting that holds a plain sponge together. Without one the cut face of a
 * three-layer cake is a single flat panel of colour and reads as a solid block.
 */
export function slabStack(
  layers: number,
  height: number,
  radius: number,
  hasFilling: boolean,
  seed: number,
): Slab[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const bandCount = Math.max(0, layers - 1);
  const bandH = bandCount
    ? Math.min(hasFilling ? 0.035 : 0.02, height * (hasFilling ? 0.045 : 0.028))
    : 0;
  const spongeH = (height - bandH * bandCount) / layers;

  const out: Slab[] = [];
  let y = 0;
  for (let i = 0; i < layers; i++) {
    const h = spongeH * (0.98 + rng() * 0.04);
    out.push({ kind: "sponge", y, height: h, radius });
    y += h;
    if (i < layers - 1) {
      out.push({ kind: "filling", y, height: bandH, radius: radius * 1.004 });
      y += bandH;
    }
  }

  // Normalise so the stack lands exactly on the tier height.
  const scale = height / y;

  // Overlap every boundary by a hair. Stacked slabs share exact planes
  // otherwise, and a cut cake puts that z-fighting on full display.
  const bleed = 0.005;
  return out.map(s => ({
    ...s,
    y: s.y * scale - bleed / 2,
    height: s.height * scale + bleed,
  }));
}

/* ------------------------------------------------------------------ *
 * Drip
 * ------------------------------------------------------------------ */

export interface DripSpec {
  angle: number;
  length: number;
  width: number;
  /** Where along the run the drip is fattest, 0–1. */
  belly: number;
  /** Radius at that point, relative to `width`. A pendant drop is > 1. */
  bulge: number;
  /** Radius where it leaves the pool, relative to `width`. */
  neck: number;
  /** Sideways drift by the tip, in world units. Nothing runs perfectly plumb. */
  drift: number;
  /** How much of the run is spent tapering out. Low is a blunt blob, high a tail. */
  taper: number;
}

/**
 * All the variation in one place, drawn from one stream.
 *
 * Everything below the first three fields is new, and none of it required a new
 * entry in lib/seed's SEEDED array — they are further draws on the same
 * `seed ^ 0x5bf03635` stream that the angles and lengths already came from. That
 * matters: registering a new field there would rehash every cake in existence and
 * silently reshuffle every saved design.
 */
export function dripSpecs(
  seed: number,
  radius: number,
  count?: number,
  /**
   * Drop the angular jitter, so each run lands exactly on `count` evenly spaced
   * positions.
   *
   * This exists for the bundt. Every other shape has a cylindrical wall, where a run
   * can break away anywhere along the rim; a bundt has a *fluted* one, and a run
   * placed at an arbitrary angle either buries itself in a crest or hangs in mid-air
   * over a trough. Both happened, and floating white spikes over the troughs looked
   * considerably worse than no glaze at all. Real glaze follows the ridges, so the
   * runs are snapped to them.
   */
  snap = false,
): DripSpec[] {
  const rng = mulberry32(seed ^ 0x5bf03635);
  // Twelve drips 2mm across, spaced two inches apart, read as candle wax
  // running down a wall. A poured ganache drip is 5-10mm wide and they land
  // close enough together that the rim between them still reads as one pour.
  const n = count ?? Math.round(THREE.MathUtils.clamp(radius * 22, 14, 34));
  const out: DripSpec[] = [];
  for (let i = 0; i < n; i++) {
    const jitter = snap ? 0 : (rng() - 0.5) * (Math.PI / n) * 1.6;
    // Two thirds of a real pour barely leaves the rim; the long ones are the
    // exception, and it is the *contrast* that reads as gravity. A uniform
    // 0.14–0.48 spread gave every drip a middling length and no contrast at all.
    const long = rng() < 0.34;
    out.push({
      angle: (i / n) * Math.PI * 2 + jitter,
      length: long ? 0.26 + rng() * 0.34 : 0.08 + rng() * 0.14,
      // An absolute radius now, not a scale factor on a lathe of radius 0.5. A
      // poured drip is 5-10mm across and one world unit is 91mm, so this is
      // 5.8mm to 10.5mm of real chocolate before the bulge widens it.
      width: 0.032 + rng() * 0.026,
      belly: 0.42 + rng() * 0.34,
      // Chocolate hanging off an edge is pulled into a teardrop by its own weight,
      // so the widest part is below the middle and wider than the neck.
      bulge: 1 + rng() * 0.34,
      neck: 0.72 + rng() * 0.22,
      drift: (rng() - 0.5) * 0.05,
      taper: 0.16 + rng() * 0.26,
    });
  }
  return out;
}

/**
 * The radius the frosting actually pools at, which is not the tier radius on a
 * domed bundt.
 *
 * 0.88 was measured against the old bundt, whose widest point was its straight
 * outer wall. The rebuilt one is a dome that bulges to the full radius a little
 * below mid-height (see bundtGeometry), so a ring at 0.88 sits *inside* the
 * silhouette — which is what left the glaze hoop hovering above the shoulder with
 * its drips hanging down the inside of it.
 */
export function rimRadius(shape: Shape, radius: number): number {
  // On the flute crest, which is where the runs are snapped to (see dripSpecs'
  // `snap`). The crest stands 11.5% proud of the mean wall.
  return shape === "bundt" ? radius * 1.108 : radius;
}

/**
 * The pooled ring of frosting at the top edge, following the real silhouette.
 *
 * `seed` makes the pool uneven. A tube of constant radius swept along a perfect
 * ring is a torus, and a torus reads as a plastic hoop pressed onto the cake —
 * which is precisely how the bundt's glaze looked. Real poured frosting gathers
 * thickly in some places and thinly in others, so the *path* rises, falls, and
 * breathes in and out. Displacing the path rather than the tube's radius keeps
 * this a single cheap TubeGeometry.
 */
export function rimGeometry(
  shape: Shape,
  radius: number,
  tube = 0.028,
  outline?: OutlinePoint[],
  seed = 0,
): THREE.BufferGeometry {
  const ring = outline?.length
    ? outline.map(p => ({ ...p, x: p.x + p.nx * tube * 0.5, z: p.z + p.nz * tube * 0.5 }))
    : outlinePoints(shape, rimRadius(shape, radius) + tube * 0.9, 96);

  // Sampled down to at most 96 control points: a CatmullRom through 200 points
  // only 3mm apart turns any per-point displacement into a visible zigzag.
  const count = Math.min(96, ring.length);
  const step = ring.length / count;

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const p = ring[Math.floor(i * step)];
    const a = (i / count) * Math.PI * 2;
    // Two incommensurable frequencies, so the pool never repeats around the cake.
    const n = Math.sin(a * 3 + seed * 0.7) * 0.6 + Math.sin(a * 7.3 + seed * 1.9) * 0.4;
    pts.push(new THREE.Vector3(
      p.x + p.nx * n * tube * 0.3,
      n * tube * 0.42,
      p.z + p.nz * n * tube * 0.3,
    ));
  }

  const curve = new THREE.CatmullRomCurve3(pts, true);
  const g = new THREE.TubeGeometry(curve, 128, tube, 10, true);
  g.computeVertexNormals();
  return g;
}

/**
 * Every drip on one tier, as a single geometry.
 *
 * What was here before was one lathe, built once, and then instanced per drip with
 * `scale=[width, length, width]`. Every drip on the cake was therefore the *same
 * drip*, stretched — the same taper, the same tip, the same perfectly circular
 * cross-section, all hanging perfectly plumb. Fourteen to thirty-four copies of one
 * shape in a ring is a procedural pattern no amount of material work can rescue,
 * and it is the "repeated tubes" reading exactly.
 *
 * So each drip is built from its own spec instead: its own neck, belly, taper, tip
 * and sideways drift. That is more geometry to generate, so they are merged into one
 * buffer and drawn in a single call — which is actually *fewer* draw calls than the
 * fourteen-to-thirty-four separate meshes this replaces.
 *
 * Each run also starts above the rim, inside the pooled ring, so a drip emerges from
 * the frosting rather than being stuck onto the outside of it — and it is closed at
 * both ends, because the frosting renders FrontSide and an open tube is a hole you
 * can see the cake through. (That was the bug the previous profile's comment
 * described; it stays fixed here.)
 */
export function dripsGeometry(
  specs: DripSpec[],
  anchors: OutlinePoint[],
  opts: { rings?: number; segments?: number } = {},
): THREE.BufferGeometry | null {
  const rings = opts.rings ?? 9;
  const segments = opts.segments ?? 10;
  const parts: THREE.BufferGeometry[] = [];

  for (const s of specs) {
    const a = anchors[
      Math.floor((s.angle / (Math.PI * 2)) * anchors.length + anchors.length) % anchors.length
    ];
    if (!a) continue;

    // Along the wall, at right angles to the outward normal: the direction a drip
    // wanders as it runs.
    const tx = -a.nz, tz = a.nx;

    const pos: number[] = [];
    const idx: number[] = [];
    const uv: number[] = [];

    /*
     * The run starts at -0.12 — above the rim, buried in the pooled ring — and the
     * radius there is zero, so the geometry closes inside the frosting and the drip
     * appears to be *fed* by the pool.
     */
    const t0 = -0.12;
    for (let r = 0; r <= rings; r++) {
      const u = r / rings;
      const t = t0 + (1 - t0) * u;

      // Radius along the run: closed inside the pool, out to the neck, swelling to
      // the belly, holding, then rounding off at the tip.
      let radius: number;
      if (t <= 0) {
        // A quarter-ellipse, so the buried end closes smoothly instead of ending
        // in a disc that could poke out of the pool as a visible rim.
        radius = s.width * s.neck * Math.sqrt(Math.max(0, 1 - (t / t0) ** 2));
      } else if (t < s.belly) {
        const k = smootherstep(t / s.belly);
        radius = s.width * (s.neck + (s.bulge - s.neck) * k);
      } else {
        const k = (t - s.belly) / (1 - s.belly);
        const hold = 1 - s.taper;
        radius = k < hold
          // Thinning gently along the run.
          ? s.width * s.bulge * (1 - 0.18 * (k / hold))
          // Hemispherical tip: a hanging drop ends in a bead, not a needle.
          : s.width * s.bulge * 0.82
            * Math.sqrt(Math.max(0, 1 - ((k - hold) / (1 - hold)) ** 2));
      }
      radius = Math.max(1e-4, radius);

      /*
       * Centre-line: down, drifting sideways, and standing proud of the wall.
       *
       * The outward offset is what makes a drip read as chocolate hanging off an
       * edge rather than a dark line painted on the side. It has to be along the
       * anchor's own normal, not a fixed vector: a fixed offset only ever worked on
       * a round cake, where the wall curves away from the drip anyway, and on a
       * square it left nine tenths of every drip buried in the frosting.
       *
       * The slight inward pull with depth is surface tension — a run of ganache
       * hugs the wall it is descending.
       */
      const run = Math.max(0, t);
      const out0 = s.width * 0.34 - 0.006 * run;
      const cx = a.x + a.nx * out0 + tx * s.drift * run * run;
      const cz = a.z + a.nz * out0 + tz * s.drift * run * run;
      const cy = -t * s.length;

      for (let c = 0; c < segments; c++) {
        const phi = (c / segments) * Math.PI * 2;
        // The cross-section is an ellipse flattened against the wall: a drip is
        // spread by the surface it clings to, never a perfect cylinder.
        const along = Math.cos(phi) * radius;
        const out = Math.sin(phi) * radius * 0.72;
        pos.push(cx + tx * along + a.nx * out, cy, cz + tz * along + a.nz * out);
        uv.push(c / segments, u);
      }
    }

    for (let r = 0; r < rings; r++) {
      for (let c = 0; c < segments; c++) {
        const c2 = (c + 1) % segments;
        const i0 = r * segments + c, i1 = r * segments + c2;
        const i2 = (r + 1) * segments + c, i3 = (r + 1) * segments + c2;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Per drip, before merging: welding the merged set would fuse drips that happen
    // to touch and average their normals across the gap.
    weldNormals(g);
    parts.push(g);
  }

  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return merged;
}

/* ------------------------------------------------------------------ *
 * Ruffle and rosette decoration
 * ------------------------------------------------------------------ */

/**
 * The ruffled finish, as one continuous band per row.
 *
 * Three rewrites of this as an *instanced petal* all came out worse than the flat lens
 * they replaced — fish scales, then torn paper, then a spiky thistle — and the reason
 * is that the primitive was wrong, not the parameters. A ruffle is a single gathered
 * ribbon piped in one unbroken pass around the cake. Anything built from discrete
 * instances has a boundary at every instance, and those boundaries are visible: push
 * the waviness up to disguise them and they read as tears, push the thickness taper up
 * and they read as spikes. There is no setting at which a row of separate objects
 * becomes one continuous frill.
 *
 * So it is swept instead: the tier's own measured outline, walked once per row, with a
 * hem that undulates as it goes. There are no instance boundaries because there are no
 * instances, and the undulation closes on itself around the cake, so there is no seam
 * either.
 *
 * It is also far cheaper. The instanced version put 200-odd frills of ~200 triangles on
 * every tier, about 80–100k triangles a cake; this is nearer 20k, in one draw call.
 */
export function ruffleBandGeometry(
  shape: Shape,
  radius: number,
  height: number,
  seed: number,
  sector?: Sector,
): THREE.BufferGeometry | null {
  const size = Math.min(0.3, radius * 0.32);
  const rows = Math.max(3, Math.round(height / (size * 0.55)));

  /*
   * Wavelength first, then sampling.
   *
   * At one undulation every 0.72 of a frill's depth the tier got about thirty-seven of
   * them, which put ±0.06 of hem swing into a 0.22-unit wavelength — a 28% amplitude
   * ratio, and that is a chevron rather than a scallop. It rendered as pinked card. A
   * scallop wants to be long and shallow, so the wavelength roughly doubles; and ten
   * samples across each one, because six left the hem a visible polyline of straight
   * segments meeting at points.
   */
  const perimeter = outlinePerimeter(outlinePoints(shape, radius, 64));
  const waves = Math.max(9, Math.round(perimeter / (size * 1.5)));
  const segments = waves * 10;
  const V = 4;

  const ring = shellOutline(shape, radius, height, segments, "widest");
  if (!ring.length) return null;

  const rng = mulberry32(seed ^ 0x1f83d9ab);
  const parts: THREE.BufferGeometry[] = [];

  for (let r = 0; r < rows; r++) {
    const rowY = ((r + 0.5) / rows) * height;
    // Each row is piped separately, so each gets its own phase and its own slightly
    // different hem. Rows that share a phase line up into vertical columns.
    const phaseA = rng() * Math.PI * 2;
    const phaseB = rng() * Math.PI * 2;
    const depth = size * (0.92 + rng() * 0.16);

    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const cols = segments + 1;

    // A whole number of cycles, so the ripple closes on itself and leaves no seam
    // where the band meets its own start. Rows differ by a cycle so they do not nest.
    const rowWaves = waves + (r % 2 === 0 ? 0 : 1);
    const wave = (i: number) => {
      const a = (i / segments) * Math.PI * 2;
      return Math.sin(a * rowWaves + phaseA) * 0.7
        + Math.sin(a * Math.max(2, Math.round(rowWaves / 2)) + phaseB) * 0.3;
    };

    /** Half-thickness: fat where the bag holds it to the cake, thin at the hem. */
    const half = (v: number) => depth * (0.09 * Math.pow(1 - v, 1.2) + 0.016);

    for (const sign of [1, -1]) {
      for (let j = 0; j <= V; j++) {
        const v = j / V;
        for (let i = 0; i < cols; i++) {
          const p = ring[i % segments];
          const w = wave(i);
          // The hem hangs, lengthening and shortening with the wave — that variation
          // is what makes it a ruffle rather than a skirt.
          const y = rowY + depth * 0.34 - v * depth * (0.86 + w * 0.14);
          // And it lifts away from the wall as it falls, waving in and out.
          const out = v * v * depth * 0.26 + w * depth * 0.1 * v + sign * half(v);
          pos.push(p.x + p.nx * out, y, p.z + p.nz * out);
          uv.push(i / segments, 1 - v);
        }
      }
    }

    const ringSize = cols * (V + 1);
    const kept = (i: number) => !sector || !inSector(ring[i % segments], sector);

    for (let j = 0; j < V; j++) {
      for (let i = 0; i < segments; i++) {
        // A cut cake simply stops: the band is not piped over open sponge.
        if (!kept(i) || !kept(i + 1)) continue;
        const f = j * cols + i;
        idx.push(f, f + cols, f + cols + 1, f, f + cols + 1, f + 1);
        const b = ringSize + f;
        idx.push(b, b + 1, b + cols + 1, b, b + cols + 1, b + cols);
      }
    }
    // The hem itself, so the band is solid and not two sheets with a gap.
    for (let i = 0; i < segments; i++) {
      if (!kept(i) || !kept(i + 1)) continue;
      const f = V * cols + i;
      idx.push(f, f + 1, ringSize + f + 1, f, ringSize + f + 1, ringSize + f);
    }

    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }

  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach(x => x.dispose());
  return merged;
}

/** Whether an outline point falls in the removed wedge. */
function inSector(p: OutlinePoint, sector: Sector): boolean {
  let d = phiOf(p.x, p.z) - sector.centre;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < sector.width / 2;
}

/**
 * A piped rosette: a spiral sweep, wound from the outside in so the centre sits
 * proud the way a real rose does.
 *
 * The spiral was right and two things about the sweep were wrong.
 *
 * The first is arithmetic. The spiral stepped inward by (0.46 − 0.03) / 1.85 turns =
 * 0.232 per turn, and it was swept with a tube of radius 0.155 — a *diameter* of
 * 0.31. Consecutive coils therefore overlapped by a third and fused into one solid
 * mound with a groove cut into it, which is a snail shell. For coils to read as coils
 * the sweep's diameter has to be about the radial pitch, so the pitch goes up (more
 * turns over a slightly smaller spiral) and the section comes down to meet it.
 *
 * The second is the section itself. A rosette is piped through an open *star* tip,
 * and the ridges that tip leaves are the whole signature of piped buttercream — a
 * circular section is a rope of clay however well it is lit. `TubeGeometry` only
 * sweeps circles, so this sweeps its own five-pointed section instead, which also
 * allows the outer end to taper off the way it does when the bag lifts away.
 */
export function rosetteGeometry(): THREE.BufferGeometry {
  const turns = 2.25;
  const stations = 34;
  /*
   * Fifteen, not a round dozen, because the five ridges have to land *on* vertices to
   * read as ridges: 360/15 = 24°, the ridge period is 72°, so every crest is a vertex
   * and each lobe gets three of them. At twelve the crests fall between vertices and
   * the section aliases into a twisting prism.
   */
  const section = 15;
  /** Radial pitch per turn; the section's width is matched to it below. */
  const rOuter = 0.44, rInner = 0.05;
  const pitch = (rOuter - rInner) / turns;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const a = t * Math.PI * 2 * turns;
    const r = rOuter * (1 - t) + rInner;

    // The spiral rises towards its centre, so the middle of the rose stands above
    // the coils around it.
    // Domed rather than flat. At 0.22 the rose was a third as deep as it was wide and
    // read as a spiral carved in relief; a piped rose is a mound with its heart
    // standing well clear of the outer coil.
    P.set(Math.cos(a) * r, t * t * 0.34, Math.sin(a) * r);

    // Analytic tangent: d/dt of the above. The spiral is never vertical, so the
    // frame can be built against world up without a degenerate case.
    const da = Math.PI * 2 * turns;
    const dr = -rOuter;
    T.set(
      Math.cos(a) * dr - Math.sin(a) * r * da,
      2 * t * 0.34,
      Math.sin(a) * dr + Math.cos(a) * r * da,
    ).normalize();
    B.crossVectors(T, UP).normalize();
    N.crossVectors(B, T).normalize();

    /*
     * Half the pitch, so neighbouring coils meet without merging — then tapered over
     * the outer eighth, which is the tail, and swelled a little at the very centre so
     * the heart of the rose reads as a button rather than as the end of a rope.
     */
    // A thinner tail than 0.45 of the section reads as a spike rather than as the
    // end of a piped stroke — invisible on a wall where neighbours hide it, obvious
    // on a top face seen from directly above.
    const tail = 0.45 + 0.55 * THREE.MathUtils.smoothstep(t, 0, 0.12);
    const heart = 1 + 0.18 * THREE.MathUtils.smoothstep(t, 0.82, 1);
    const rad = pitch * 0.5 * tail * heart;

    for (let j = 0; j < section; j++) {
      const phi = (j / section) * Math.PI * 2;
      // Five ridges, as an open star tip leaves.
      const k = rad * (1 + 0.24 * Math.cos(5 * phi));
      pos.push(
        P.x + N.x * Math.cos(phi) * k + B.x * Math.sin(phi) * k,
        P.y + N.y * Math.cos(phi) * k + B.y * Math.sin(phi) * k,
        P.z + N.z * Math.cos(phi) * k + B.z * Math.sin(phi) * k,
      );
      uv.push(t, j / section);
    }
  }

  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < section; j++) {
      const j2 = (j + 1) % section;
      const a0 = i * section + j, a1 = i * section + j2;
      const b0 = (i + 1) * section + j, b1 = (i + 1) * section + j2;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }

  // Cap both ends: the tail, and the centre of the rose. Open tubes render as holes
  // in a FrontSide material.
  const capCentre = (station: number, flip: boolean) => {
    const base = station * section;
    const c = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < section; j++) {
      cx += pos[(base + j) * 3];
      cy += pos[(base + j) * 3 + 1];
      cz += pos[(base + j) * 3 + 2];
    }
    pos.push(cx / section, cy / section, cz / section);
    uv.push(0.5, 0.5);
    for (let j = 0; j < section; j++) {
      const j2 = (j + 1) % section;
      if (flip) idx.push(c, base + j2, base + j);
      else idx.push(c, base + j, base + j2);
    }
  };
  capCentre(0, false);
  capCentre(stations, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Built in XZ rising along +Y, so its face is +Y. Turn it to face +Z instead:
  // every other piece of decoration here is aimed by a yaw about Y, and a
  // +Z-facing rosette can be aimed the same way instead of by a three-term
  // Euler that has to be reasoned about from the composition order.
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ *
 * Board and plaque
 * ------------------------------------------------------------------ */

export function boardGeometry(radius: number): THREE.BufferGeometry {
  const h = 0.055;
  const r = radius * 1.3;

  /*
   * This used to be `lathePoints(r, h, 0.016, 1, 1)`, on the stated grounds that
   * "a board carries no finish, so the extra rings would be vertices spent on
   * nothing". That was true while the board was lit and nothing more. It is not
   * true now: the lid carries the cake's baked contact shadow (CakeBoard →
   * bakeOcclusion), and a two-point lid can hold a two-step gradient. So the lid
   * gets rings — and only the lid, because the wall still carries nothing.
   *
   * The edge is its own detail now rather than one bevel arc. A cake board is card
   * wrapped in foil: a crisp top arris, a straight rolled edge, and a slight
   * undercut where the foil folds beneath. Four profile points instead of one arc,
   * and the board stops being a cylinder with a rounded corner.
   */
  const b = 0.011;
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r - b * 1.6, 0),
    // The fold of the foil. It catches a sliver of shadow, and that sliver is
    // what separates the board's edge from the surface underneath it.
    new THREE.Vector2(r - b * 0.3, h * 0.22),
    new THREE.Vector2(r, h * 0.52),
    new THREE.Vector2(r - b * 0.35, h - b),
    new THREE.Vector2(r - b * 1.5, h),
  ];

  const lidRings = 16;
  const xLid = r - b * 1.5;
  for (let i = 1; i <= lidRings; i++) {
    pts.push(new THREE.Vector2(xLid * (1 - i / lidRings), h));
  }

  return latheWithUV(pts, 64);
}

export function plaqueGeometry(width: number, height: number): THREE.BufferGeometry {
  const s = roundedPolygon(
    [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]],
    height * 0.34,
  );
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.018, bevelEnabled: true, bevelSize: 0.012,
    bevelThickness: 0.01, bevelSegments: 3, curveSegments: 16,
  });
  g.rotateX(-Math.PI / 2);
  // ExtrudeGeometry's cap UVs are world coordinates, not 0–1, so the lettering
  // texture would be sampled from a single corner of the canvas. Renormalise.
  normaliseUV(g);
  g.computeVertexNormals();
  return g;
}

/** Remap UVs to the geometry's own XZ footprint, 0–1 on both axes. */
function normaliseUV(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const spanX = Math.max(1e-6, box.max.x - box.min.x);
  const spanZ = Math.max(1e-6, box.max.z - box.min.z);

  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / spanX;
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - box.min.z) / spanZ;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export interface OutlinePoint {
  x: number;
  z: number;
  /** Outward normal in the XZ plane. */
  nx: number;
  nz: number;
  /** Rotation about Y that faces the point outward. */
  yaw: number;
}

/**
 * Evenly spaced points around the actual silhouette. Ruffles and rosettes on a
 * square cake have to follow the square, not a circle inscribed in it.
 */
export function outlinePoints(shape: Shape, radius: number, count: number): OutlinePoint[] {
  const n = Math.max(6, Math.round(count));

  if (shape === "round" || shape === "bundt") {
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, nx: Math.cos(a), nz: Math.sin(a), yaw: -a };
    });
  }

  // `tierGeometry` rotates the extrude by -90° about X, which sends shape Y to
  // world **-Z**, not +Z. This used to return `z: p.y`, so every outline for a
  // non-round shape was mirrored front-to-back. On a square, a rectangle and a
  // hexagon that is invisible — they are symmetric about the axis. On a heart it
  // is not: the cleft and the point swap ends, so the decoration ran round a
  // heart that was facing the other way. (cutShape has always had this right —
  // it measures `phiOf(p.x, -p.y)`.)
  const pts = polygonFor(shape, radius).getSpacedPoints(n);
  const world = pts.map(p => ({ x: p.x, z: -p.y }));

  // Which way the outline is wound, measured once for the whole loop. The old
  // test was per-point — flip the normal if it does not point away from the
  // origin — which is only valid for a shape whose every edge faces away from
  // its centre. A heart's cleft does not: the correct outward normal there
  // points back towards the middle of the cake, so the test inverted it and the
  // frills at the top of the heart were driven into the cake.
  let area = 0;
  for (let i = 0; i < world.length; i++) {
    const a = world[i];
    const b = world[(i + 1) % world.length];
    area += a.x * b.z - b.x * a.z;
  }
  const ccw = area > 0;

  return world.map((p, i) => {
    const next = world[(i + 1) % world.length];
    const prev = world[(i - 1 + world.length) % world.length];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    // Outward is the tangent turned 90° away from the interior, and which side
    // the interior is on is exactly what the winding tells us.
    const nx = (ccw ? tz : -tz) / len;
    const nz = (ccw ? -tx : tx) / len;
    return { x: p.x, z: p.z, nx, nz, yaw: -Math.atan2(nz, nx) };
  });
}

/** Push a measured outline out along its own normals — what a bevel does. */
export function offsetOutline(pts: OutlinePoint[], d: number): OutlinePoint[] {
  return pts.map(p => ({ ...p, x: p.x + p.nx * d, z: p.z + p.nz * d }));
}

/** Distance from (x, z) to the segment a—b. */
function distToSegment(x: number, z: number, a: OutlinePoint, b: OutlinePoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

/**
 * `offsetOutline`, keeping only the points that ended up genuinely `d` clear of
 * the outline they came from.
 *
 * Offsetting a polygon along per-vertex normals is only valid while the distance
 * stays under the local radius of curvature. Past that the path folds through
 * itself and leaves a bowtie: outward it happens at a concave feature, inward at a
 * convex one, and this cake has both — a heart's cleft is concave and its point is
 * sharp, a square's corner rounds at 16% of its half-width. A bowtie is not a
 * cosmetic problem for anything that walks the result by arc length, because the
 * doubled-back leg is length that leads nowhere: two pieces get spaced a full gap
 * apart along the path and land in the same place on the cake.
 *
 * The test is the definition rather than a repair. A point of an offset outline is
 * the point `d` from the edge and on the correct side of it; if it is not both, it
 * is not that point, so it goes. What is left is a valid path with corners missing,
 * and a corner too tight to hold the offset is a corner too tight to hold the thing
 * being placed there — walking straight across it is the right answer anyway.
 *
 * Both halves of the test are load-bearing. Distance alone leaves the fold at a
 * heart's cleft in place: a point pushed *outward* from one wall of the notch can
 * land a clean `d` from the outline and still be inside the cake, under the far
 * wall, where a strawberry on the board would be somewhere under the sponge.
 *
 * Scaling the silhouette instead is the other way to stay valid, and is what the
 * rosettes do, but it only works on a shape whose every point is roughly the same
 * distance out. A heart's cleft comes closer to the centre than its lobes by half,
 * so the scale that clears the cleft shrinks the lobes to nothing.
 */
export function offsetOutlineClear(pts: OutlinePoint[], d: number): OutlinePoint[] {
  const near = Math.abs(d) * 0.9;
  const wantInside = d < 0;
  const kept = offsetOutline(pts, d).filter((m) => {
    if (insideOutline(pts, m.x, m.z) !== wantInside) return false;
    for (let i = 0; i < pts.length; i++) {
      if (distToSegment(m.x, m.z, pts[i], pts[(i + 1) % pts.length]) < near) return false;
    }
    return true;
  });
  // Three points is the least that still encloses anything. Below that the offset
  // has eaten the whole shape, and the un-filtered path is a better answer than
  // nothing at all.
  return kept.length >= 3 ? kept : offsetOutline(pts, d);
}

/** The frosting thickness `shellGeometry` will use, so callers cannot drift. */
export function shellThickness(radius: number): number {
  return Math.max(0.022, radius * 0.035);
}

/**
 * The exact outline of the frosting shell, at the height band a given piece of
 * decoration hangs from.
 *
 * This replaces measuring the built mesh with a polar histogram. That approach
 * had three faults that all pointed the same way — towards a circle:
 *
 *  - it reconstructed each point as (cos θ · r, sin θ · r) and handed back
 *    (cos θ, sin θ) as the *normal*, which is the radial direction. On a flat
 *    face the surface normal is not radial, so every frill was pushed out along
 *    a diagonal and yawed to face the middle of the cake. That is why they
 *    splayed off the corners of a square and sank into its sides;
 *  - empty angular bins were filled by taking `max(prev, next)`, so the corner
 *    radius spread outward into its neighbours and inflated the whole outline
 *    towards the circumscribed circle;
 *  - a histogram of max-radius-per-angle cannot represent a concave outline at
 *    all, so a heart's cleft was filled in and the frills ran straight across
 *    the notch.
 *
 * Deriving it from the 2D shape is exact and handles all three. The reason the
 * original comment gave for not doing it — that a bevel offsets an outline
 * along its normal, which is not the same as scaling it — is right, and is why
 * this offsets rather than scales.
 */
export function shellOutline(
  shape: Shape,
  radius: number,
  height: number,
  count: number,
  band: "rim" | "widest" | "top",
): OutlinePoint[] {
  const { R, B } = shellMetrics(radius, height);

  if (shape === "bundt") {
    /*
     * No `+ B` here, unlike the extruded shapes below. That bevel offset is what
     * pushed the glaze ring 8mm clear of the dome and left it hanging in mid-air
     * as a hoop: a bundt is a lathe, so its silhouette *is* its profile radius,
     * with no bevel inset to compensate for. The anchor is the shoulder, a little
     * above the widest point, which is where glaze poured over the crown breaks
     * away and runs.
     */
    return outlinePoints(shape, rimRadius(shape, R), count);
  }

  if (shape === "round") {
    // lathePoints flares the base to R·1.012 and tapers back to R at the top of
    // the wall, which is where the frosting gathers before it runs.
    if (band === "widest") return outlinePoints(shape, R * 1.012, count);
    return outlinePoints(shape, band === "top" ? R - B : R, count);
  }

  // ExtrudeGeometry insets the outline by bevelSize and then bevels back out
  // along the normals, so the side wall — the widest band, and the edge a drip
  // runs off — is the inset outline pushed back out by exactly one bevel.
  //
  // Which makes the *inset* outline, un-offset, exactly the flat top face: the
  // bevel is the roll between the two, so anything that has to lie on the top
  // rather than hang off its edge measures itself against this one. That is what
  // "top" is for, and toppings are its only caller — see Toppings.place.
  if (band === "top") return outlinePoints(shape, R - B, count);
  return offsetOutline(outlinePoints(shape, R - B, count), B);
}

/** The shell's outer radius and bevel, shared by everything that measures it. */
function shellMetrics(radius: number, height: number) {
  const t = shellThickness(radius);
  const R = radius + t;
  const H = height + t;
  return { R, H, B: Math.min(R * 0.13, H * 0.2, 0.1) };
}

/**
 * Height, above the tier's base, of the edge a drip runs off: the top of the
 * side wall, where the top bevel starts.
 *
 * The drip used to be pinned to `height + 0.012`, which is the top of the
 * *sponge* — but the frosting shell is built one thickness taller and one
 * thickness wider than that, so the entire rim and every drip on it was
 * rendered inside the frosting. Combined with an outline taken at the top of
 * the bevel rather than at the wall, the drip a customer paid ₹120 for did not
 * appear anywhere on any shape.
 */
export function shellRimY(radius: number, height: number, shape: Shape = "round"): number {
  const { H, B } = shellMetrics(radius, height);
  // A bundt has no top edge to run off. Glaze poured over the crown runs down the
  // dome and only breaks away where the wall turns under, at the widest point,
  // which bundtGeometry puts a little below mid-height. Anchoring it at H - B like
  // every other shape hung the drips from the crown, so they ran down the *inside*
  // of the hole.
  // Where the dome turns under and a run breaks away from the surface.
  if (shape === "bundt") return H * 0.46;
  return H - B;
}

/** Perimeter of a measured outline. A square's is 8r, not 2πr. */
export function outlinePerimeter(pts: OutlinePoint[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

/**
 * Area enclosed by a measured outline. A square's top is 4r², not πr² — 27% more
 * cake to cover, which is the difference between a scattered topping filling a
 * square and leaving a bare margin all the way round it.
 */
export function outlineArea(pts: OutlinePoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/**
 * Is (x, z) on the cake?
 *
 * Ray crossing rather than a radius comparison, because the whole point of
 * measuring an outline is that some of these shapes are not circles and one of
 * them — the heart — is not even convex. A radius test cannot exclude the cleft.
 */
export function insideOutline(pts: OutlinePoint[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.z > z) !== (b.z > z)
      && x < a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

/**
 * Radius of the circle that contains the whole footprint, whichever way the
 * cake is turned. The camera framing assumed every shape was as wide as a
 * round one of the same size, so a rectangle — which is 2.56 radii across its
 * long axis, and 3.04 across its diagonal — was framed as if it were 2 radii
 * wide and ran off both sides of the canvas.
 */
export function footprintRadius(shape: Shape, radius: number): number {
  switch (shape) {
    case "square": return radius * 1.42;
    case "rectangle": return radius * 1.52;
    case "heart": return radius * 1.08;
    default: return radius;
  }
}

/**
 * A circle that fits inside the top of the shape.
 *
 * This used to be what toppings were placed on, and "round-ish bound is close
 * enough" — as the comment here said — was wrong: laying every placement on the
 * inscribed circle of a square put the ring in a small circle in the middle of a
 * square top with all four corners bare, and the base border on a circle that
 * crossed in and out of the wall. Placement measures the real outline now (see
 * shellOutline and Toppings.place).
 *
 * The message plaque still uses it, where a conservative circle is genuinely what
 * is wanted — it needs one rectangle to fit with room around it, not a path to
 * follow — and where the heart already carries its own correction.
 */
export function surfaceRadius(shape: Shape, radius: number): number {
  switch (shape) {
    case "square": return radius * 0.92;
    case "rectangle": return radius * 0.9;
    case "hexagon": return radius * 0.9;
    case "heart": return radius * 0.78;
    case "bundt": return radius * 0.95;
    default: return radius;
  }
}
