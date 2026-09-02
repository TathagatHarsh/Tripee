import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BOARD_TOP, CUT_BEVEL, DEFAULT_SLICE, FILLING_SQUEEZE, MM,
  crumbGeometry, phiOf, scatterCrumbs, shellGeometry, tierGeometry,
} from "@/components/three/geometry";
import { Finish, Shape } from "@/lib/schema";

/**
 * The cutaway, checked by firing rays at it — which is the only way to tell a cut
 * cake from a cake-shaped shell with a hole in it. Every one of these caught a real
 * defect: cut faces mirrored onto the far side of the cake so you looked straight
 * through the slice, frosting laid across the cross-section it was supposed to
 * frame, and a frosting lid that vanished on every shape with corners.
 */

const H = 0.9;
const SOLID_RADII = [0.25, 0.4, 0.55, 0.7, 0.85];
const HALF = DEFAULT_SLICE.width / 2;
const SHAPES = Shape.options;
const LATHE: Shape[] = ["round"];

function mesh(g: THREE.BufferGeometry) {
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.updateMatrixWorld();
  return m;
}

/** Sponge as SpongeLayers builds it: one slab's worth of body, cut to the wedge. */
function sponge(shape: Shape, radius: number) {
  return tierGeometry({
    shape, radius, height: H, segments: 72,
    bevel: Math.min(radius * 0.04, 0.03), sector: DEFAULT_SLICE,
  });
}

function shell(shape: Shape, radius: number, finish: Finish = "smooth") {
  return shellGeometry({
    shape, radius, height: H, finish, seed: 7, segments: 72, sector: DEFAULT_SLICE,
  });
}

/**
 * Fire a ray sideways out of the middle of the removed wedge and report the angle
 * off the wedge's centre at which it hits something. On a properly closed cut that
 * is the half-width of the wedge; on an open one the ray sails through the missing
 * cut face and lands on the inside of the far wall, much further round.
 */
function cutAt(g: THREE.BufferGeometry, r: number, sign: 1 | -1, y = H * 0.5) {
  const c = DEFAULT_SLICE.centre;
  const origin = new THREE.Vector3(r * Math.sin(c), y, r * Math.cos(c));
  const dir = new THREE.Vector3(Math.cos(c) * sign, 0, -Math.sin(c) * sign).normalize();
  const hits = new THREE.Raycaster(origin, dir, 0, 20).intersectObject(mesh(g));
  return hits.length ? Math.atan(hits[0].distance / r) : NaN;
}

/** Height of the first thing a ray straight down from above hits. */
function topAt(g: THREE.BufferGeometry, r: number, phi: number) {
  const origin = new THREE.Vector3(r * Math.sin(phi), H * 4, r * Math.cos(phi));
  const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, H * 8)
    .intersectObject(mesh(g));
  return hits.length ? hits[0].point.y : NaN;
}

describe("cutaway", () => {
  it.each(SHAPES)("%s: the cut is closed, not see-through", (shape) => {
    const radius = 1.4;
    const g = sponge(shape, radius);
    for (const sign of [1, -1] as const) {
      let sampled = 0;
      for (const rf of SOLID_RADII) {
        const at = cutAt(g, radius * rf, sign);
        // A miss means the ray left the cake before reaching the cut — a corner of
        // a hexagon, the cleft of a heart, the short side of a rectangle. Nothing
        // to assert about those, so long as some radius lands.
        if (Number.isNaN(at)) continue;
        expect(at, `${shape} r=${rf} side=${sign}`).toBeCloseTo(HALF, 1);
        sampled++;
      }
      expect(sampled, `${shape} side=${sign}: nothing sampled`).toBeGreaterThan(1);
    }
  });

  it.each(SHAPES)("%s: frosting never covers the cross-section", (shape) => {
    for (const radius of [0.7, 1.1, 1.4, 2.0]) {
      const sp = sponge(shape, radius);
      for (const finish of Finish.options) {
        const sh = shell(shape, radius, finish);
        for (const rf of SOLID_RADII) {
          for (const sign of [1, -1] as const) {
            const a = cutAt(sp, radius * rf, sign), b = cutAt(sh, radius * rf, sign);
            if (Number.isNaN(a) || Number.isNaN(b)) continue;
            // The shell's cut has to sit further round than the sponge's, or the
            // frosting wins the depth test and hides the layers.
            expect(b, `${shape}/${finish} R=${radius} r=${rf} side=${sign}`)
              .toBeGreaterThan(a);
          }
        }
        sh.dispose();
      }
      sp.dispose();
    }
  });

  /*
   * §5.3, requirement 1: "The frosting shell shows its thickness at the cut as a
   * visible 2–4mm band."
   *
   * The suite above cannot see this. Its rays are fired from 0.25–0.85 of the
   * radius, and a sideways ray from radial distance r crosses the cut plane at
   * r / cos(HALF) — so even the outermost of them crosses at 0.95 of the radius,
   * inside the sponge, where the band is not. This one fires between the sponge's
   * edge and the shell's, which is the only place the band exists.
   *
   * Before the band, a ray through that annulus sailed clean through the cut and
   * landed on the inside of the far wall, because the shell was a zero-thickness
   * surface with nothing at all on its cut edge.
   *
   * Round only. It is the one lathe left, and the extruded shapes put the band
   * at an outer radius that is a function of angle, so aiming a ray at the middle
   * of one means reimplementing the outline here.
   */
  it("round: the frosting shows its thickness at the cut", () => {
    const shape = "round" as const;
    for (const radius of [0.7, 1.1, 1.4, 2.0]) {
      const t = Math.max(0.022, radius * 0.035);
      const sp = sponge(shape, radius);
      const sh = shell(shape, radius);

      // Aim the crossing at the middle of the band, [radius, radius + t]. The
      // margin either side is t/2, comfortably clear of the smooth finish's own
      // displacement at these radii.
      const r = (radius + t / 2) * Math.cos(HALF);

      for (const sign of [1, -1] as const) {
        // The premise: out here there is no sponge to close the cut, so whatever
        // the ray meets at the cut plane can only be frosting.
        expect(cutAt(sp, r, sign), `${shape} R=${radius}: sponge reaches the band`)
          .not.toBeCloseTo(HALF, 1);

        expect(cutAt(sh, r, sign), `${shape} R=${radius} side=${sign}`)
          .toBeCloseTo(HALF, 1);
      }

      sp.dispose();
      sh.dispose();
    }
  });

  it.each(SHAPES.filter(s => !LATHE.includes(s)))(
    "%s: a cut shell keeps its lid",
    (shape) => {
      const radius = 1.4;
      const cut = shell(shape, radius);
      const whole = shellGeometry({
        shape, radius, height: H, finish: "smooth", seed: 7, segments: 72,
      });
      // Well inside the outline and on the far side from the wedge, where an
      // uncapped extrude used to leave nothing but bare sponge.
      const phi = DEFAULT_SLICE.centre + Math.PI;
      for (const rf of [0.1, 0.3, 0.6]) {
        expect(topAt(cut, radius * rf, phi), `r=${rf}`)
          .toBeCloseTo(topAt(whole, radius * rf, phi), 1);
      }
    },
  );
});

/*
 * §5.3, requirement 3: the filling "squeezes at the cut edge: a 0.3mm bulge where
 * it meets the exterior, with a very slight sag."
 *
 * Measured off the band's own wall, because that is where the squeeze lives — the
 * cut face is flat by definition and shows only the bulge in silhouette, which at
 * 0.3mm is a third of a pixel and worth asserting nothing about.
 *
 * Every sample is taken at one φ, so the lathe's chord error — a facet is nearer
 * the axis than the arc it stands in for, by about 0.1mm at 72 segments — is the
 * same constant on all of them and cancels out of every comparison below.
 */
describe("filling squeeze", () => {
  /** A band as SpongeLayers builds one: real height, no flare, bowed wall. */
  const BAND_H = 0.04;

  function band(radius: number) {
    return tierGeometry({
      shape: "round", radius, height: BAND_H, segments: 72,
      squeeze: FILLING_SQUEEZE, sector: DEFAULT_SLICE,
    });
  }

  /** Radius of the band's wall at height `y`, found by firing inward at the axis. */
  function wallAt(g: THREE.BufferGeometry, phi: number, y: number) {
    const start = 4;
    const origin = new THREE.Vector3(Math.sin(phi) * start, y, Math.cos(phi) * start);
    const dir = new THREE.Vector3(-Math.sin(phi), 0, -Math.cos(phi));
    const hits = new THREE.Raycaster(origin, dir, 0, 8).intersectObject(mesh(g));
    return hits.length ? start - hits[0].distance : NaN;
  }

  it("round: the band bellies out, and the belly sits low", () => {
    // Every radius the catalogue sells, from 0.5kg to a 5kg base tier.
    for (const radius of [0.84, 1.12, 1.4, 1.68]) {
      const g = band(radius);
      const phi = DEFAULT_SLICE.centre + Math.PI;

      /*
       * The wall runs between the two bevel arcs. tierGeometry's default bevel is
       * height * 0.18 at these proportions, so the wall spans [0.18h, 0.82h] and
       * reaches exactly `radius` at both of its ends — the bow is zero there and,
       * with the flare dropped, nothing else moves it.
       */
      const b = BAND_H * 0.18;
      const ys = Array.from({ length: 41 }, (_, i) => b + (BAND_H - 2 * b) * (i / 40));
      const rs = ys.map(y => wallAt(g, phi, y));

      expect(rs.every(Number.isFinite), `R=${radius}: the wall was not sampled`).toBe(true);

      const rim = Math.min(rs[0], rs[rs.length - 1]);
      const belly = Math.max(...rs);

      // First, that it is a band at all. Carrying a tier's 1.2% base flare, the
      // wall left the bottom rim 0.9mm wider than the top and narrowed the whole
      // way up, and a wedge like that passes a bulge test on its own bottom edge.
      expect(rs[0], `R=${radius}: the wall does not start at the rim`)
        .toBeCloseTo(rs[rs.length - 1], 3);

      // Then the bulge. 0.9 of it, not all of it: the sampled maximum lands on
      // whichever of the 26 wall steps is nearest the belly, not on the belly.
      expect(belly - rim, `R=${radius}: no bulge`)
        .toBeGreaterThan(FILLING_SQUEEZE * 0.9);

      // And the sag.
      const at = ys[rs.indexOf(belly)];
      expect(at, `R=${radius}: the belly is not below the midline`)
        .toBeLessThan(BAND_H * 0.5);
      expect(at, `R=${radius}: the belly has slumped onto the lower rim`)
        .toBeGreaterThan(BAND_H * 0.25);

      g.dispose();
    }
  });
});

/*
 * §5.3, requirement 4: "The cut face has a 0.5mm bevel with a soft highlight, so it
 * does not read as a boolean operation."
 *
 * The bevel is in the plane of the cut and carries its own tilted normals — see
 * beveledCap for why it is not displaced — so a ray cannot see it: Raycaster
 * reports a face's *geometric* normal, taken from the triangle's positions, and
 * those are unchanged. The shape of it is asserted off the attributes instead, and
 * the one thing a ray can still prove is the one thing that could actually go
 * wrong: that the ring closes the gap it opened in the face it rims.
 */
describe("cut-face bevel", () => {
  const R = 1.26, BH = 0.36, BEV = 0.03;

  function cap() {
    return tierGeometry({
      shape: "round", radius: R, height: BH, segments: 72,
      bevel: BEV, sector: DEFAULT_SLICE,
    });
  }

  /** The cut plane at phiStart, as a normal through the origin. */
  const phi = DEFAULT_SLICE.centre + HALF;
  const planeN = new THREE.Vector3(-Math.cos(phi), 0, Math.sin(phi));

  it("round: the cut face carries a bevelled rim", () => {
    const g = cap();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;

    const tilted: number[] = [], flat: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (Math.abs(v.dot(planeN)) > 1e-4) continue;   // not in this cut plane
      const d = Math.abs(new THREE.Vector3().fromBufferAttribute(nor, i).dot(planeN));
      const r = Math.hypot(v.x, v.z);
      // Anything else in the plane is the lathe wall's own edge column, whose
      // normals are neither flat to the cut nor at 45 degrees to it.
      if (d > 0.999) flat.push(r);
      else if (Math.abs(d - Math.SQRT1_2) < 0.01) tilted.push(r);
    }

    expect(tilted.length, "no rim at 45 degrees to the cut").toBeGreaterThan(0);

    /*
     * One tilted vertex and one flat vertex per profile point for the ring, plus
     * one flat vertex per profile point for the face it rims. Exactly 2:1 is what
     * says the ring runs the whole outline and stops at the closing segment on the
     * axis — one quad short and the ratio breaks.
     */
    expect(flat.length, "the rim does not follow the whole outline")
      .toBe(tilted.length * 2);

    // And the tilted row is the outline itself, with the flat face a bevel inside
    // it. Not exactly CUT_BEVEL: round the base and rim arcs the inset runs along
    // the arc's own normal rather than radially.
    const reach = Math.max(...tilted) - Math.max(...flat);
    expect(reach, "the rim is not a bevel's width proud of the face")
      .toBeGreaterThan(CUT_BEVEL * 0.5);
    expect(reach, "the bevel is wider than it was asked to be")
      .toBeLessThan(CUT_BEVEL * 1.5);

    g.dispose();
  });

  it("round: the bevel does not open the cut at the rim", () => {
    const g = cap();

    /*
     * Aim the crossing into the middle of the ring itself.
     *
     * The wall is linear between the two bevel arcs — lathePoints runs it from
     * radius*1.012 at y = BEV to radius at y = BH - BEV — so its radius at
     * mid-height is exact, not estimated, and half a bevel inside that is inside
     * the ring and outside the face the ring rims.
     *
     * Before the ring, the cap was the inset outline and nothing else, and a ray
     * through this annulus went straight past the cut to the far wall.
     */
    const rb = R * 1.012;
    const wall = rb + (R - rb) * ((BH / 2 - BEV) / (BH - 2 * BEV));
    const r = (wall - CUT_BEVEL / 2) * Math.cos(HALF);

    /*
     * Three decimal places, where the rest of this file uses one.
     *
     * A ray that misses the cap does not fly off — it leaves through the wall a
     * bevel's width further on, and 0.5mm of extra travel is 0.004 radians of
     * extra angle. At the usual tolerance of 0.05 the seam this is meant to catch
     * is invisible; the cut plane itself is exact to float32, so there is no reason
     * not to ask for 0.0005.
     */
    for (const sign of [1, -1] as const) {
      expect(cutAt(g, r, sign, BH / 2), `side=${sign}`).toBeCloseTo(HALF, 3);
    }

    g.dispose();
  });
});

/*
 * §5.3, requirement 5: "Loose crumbs on the board beneath the cut — 6 to 12 tiny
 * instanced meshes with sponge material, scattered with a seed. They cost nothing
 * and they are the single detail that makes people believe it."
 *
 * Not a ray-cast: crumbs are placed, not carved, so what is worth pinning is where
 * they are allowed to be. The seed is the load-bearing part — `e2e/visual.spec.ts`
 * compares committed PNGs, and a crumb that moves between two renders of the same
 * design fails every one of them.
 */
describe("loose crumbs", () => {
  const RADII = [0.84, 1.12, 1.4, 1.68];
  const SEEDS = [1, 7, 42, 1234, 99999];
  const HALF_W = DEFAULT_SLICE.width / 2;

  /** Signed angle from the wedge's centre, wrapped to (-pi, pi]. */
  function offCentre(x: number, z: number) {
    let d = phiOf(x, z) - DEFAULT_SLICE.centre;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  it("scatters 6 to 12, and the same 6 to 12 every time", () => {
    for (const seed of SEEDS) {
      const a = scatterCrumbs(seed, 1.26, DEFAULT_SLICE);

      expect(a.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(a.length, `seed ${seed}`).toBeLessThanOrEqual(12);

      // Same seed, same crumbs — to the last bit, not approximately.
      const b = scatterCrumbs(seed, 1.26, DEFAULT_SLICE);
      expect(b.map(c => [...c.position.toArray(), ...c.scale.toArray()]))
        .toEqual(a.map(c => [...c.position.toArray(), ...c.scale.toArray()]));
    }

    // And a different design is a different scatter, or the seed is doing nothing.
    const first = scatterCrumbs(SEEDS[0], 1.26, DEFAULT_SLICE);
    for (const seed of SEEDS.slice(1)) {
      expect(scatterCrumbs(seed, 1.26, DEFAULT_SLICE).map(c => c.position.toArray()))
        .not.toEqual(first.map(c => c.position.toArray()));
    }
  });

  it("puts every crumb on the board, none of them inside the cake", () => {
    for (const radius of RADII) {
      for (const seed of SEEDS) {
        for (const c of scatterCrumbs(seed, radius, DEFAULT_SLICE)) {
          const r = Math.hypot(c.position.x, c.position.z);
          const where = `R=${radius} seed=${seed} r=${r.toFixed(3)}`;

          /*
           * Inside the cake's own footprint a crumb has to be in the notch the
           * slice came out of. Anywhere else there and it is buried in sponge,
           * which reads as a lump on the wall rather than as debris.
           */
          if (r < radius) {
            expect(Math.abs(offCentre(c.position.x, c.position.z)), `${where}: buried`)
              .toBeLessThan(HALF_W);
          }

          // On the board's lid: boardGeometry runs to radius * 1.3 and rolls its
          // edge over the last 0.0165 of that.
          expect(r, `${where}: off the board`).toBeLessThan(radius * 1.3 - 0.0165);

          // Sitting on the board, not floating over it or sunk through it.
          expect(c.position.y, `${where}: not on the board`).toBeGreaterThan(BOARD_TOP);
          expect(c.position.y - BOARD_TOP, `${where}: floating`).toBeLessThan(1.5 * MM);

          // 1-3mm across. `scale` is a half-extent and crumbGeometry is normalised
          // to radius 1, so this is the crumb's real size in millimetres.
          const halfExtent = Math.max(c.scale.x, c.scale.y, c.scale.z);
          expect(halfExtent / MM, `${where}: too small`).toBeGreaterThanOrEqual(0.5);
          expect(halfExtent / MM, `${where}: too big`).toBeLessThanOrEqual(1.5);
        }
      }
    }
  });

  it("normalises the crumb to a radius of exactly 1", () => {
    // What makes the millimetre band above mean anything: an instance's scale is
    // the crumb's half-extent only while the mesh it scales reaches exactly 1.
    const g = crumbGeometry();
    const pos = g.attributes.position as THREE.BufferAttribute;

    let max = 0, min = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      max = Math.max(max, r);
      min = Math.min(min, r);
    }

    expect(max).toBeCloseTo(1, 5);
    // And it is a crumb, not a ball: the displacement has to actually displace.
    expect(min, "the crumb is round").toBeLessThan(0.9);

    g.dispose();
  });
});
