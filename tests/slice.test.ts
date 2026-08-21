import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_SLICE, shellGeometry, tierGeometry } from "@/components/three/geometry";
import { Finish, Shape } from "@/lib/schema";

/**
 * The cutaway, checked by firing rays at it — which is the only way to tell a cut
 * cake from a cake-shaped shell with a hole in it. Every one of these caught a real
 * defect: cut faces mirrored onto the far side of the cake so you looked straight
 * through the slice, frosting laid across the cross-section it was supposed to
 * frame, and a frosting lid that vanished on every shape with corners.
 */

const H = 0.9;
/** A bundt is a ring: inside BUNDT_CORE there is only the shaft, not cake. */
const SOLID_RADII = { solid: [0.25, 0.4, 0.55, 0.7, 0.85], bundt: [0.5, 0.65, 0.8] };
const HALF = DEFAULT_SLICE.width / 2;
const SHAPES = Shape.options;
const LATHE: Shape[] = ["round", "bundt"];

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
      for (const rf of SOLID_RADII[shape === "bundt" ? "bundt" : "solid"]) {
        const at = cutAt(g, radius * rf, sign);
        // A miss means the ray left the cake before reaching the cut — a corner of
        // a hexagon, the cleft of a heart, the short side of a rectangle, the core
        // of a bundt. Nothing to assert about those, so long as some radius lands.
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
        for (const rf of SOLID_RADII[shape === "bundt" ? "bundt" : "solid"]) {
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
