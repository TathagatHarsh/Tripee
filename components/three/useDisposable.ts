"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Disposable = { dispose: () => void };

/**
 * Wrap a memoised geometry or texture so the previous one is released when it
 * is replaced. Geometry rebuilt on every config change would otherwise leak GPU
 * memory as the customer changes their mind.
 *
 * Takes the value rather than a factory so callers keep a literal dependency
 * list on their own `useMemo`, which is what the hook lint rules can verify.
 */
export function useDisposed<T extends Disposable | null>(value: T): T {
  const prev = useRef<T | null>(null);

  useEffect(() => {
    if (prev.current && prev.current !== value) prev.current.dispose();
    prev.current = value;
  }, [value]);

  useEffect(() => () => { prev.current?.dispose(); }, []);

  return value;
}

/**
 * The vertex colour attribute, created white on first use.
 *
 * Two separate things write to this channel — the ombré gradient and the baked
 * occlusion — and they have to compose rather than overwrite, because an ombré
 * cake still needs a shadow where it meets the board. Everything that touches it
 * therefore *multiplies*, and the identity is white.
 */
function colorAttribute(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const existing = geometry.attributes.color as THREE.BufferAttribute | undefined;
  if (existing) return existing;

  const count = geometry.attributes.position.count;
  const attr = new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3);
  geometry.setAttribute("color", attr);
  return attr;
}

/** Ombré: colour graded from base to top, multiplied into the vertex colours. */
export function applyVerticalGradient(
  geometry: THREE.BufferGeometry,
  bottomHex: string,
  topHex: string,
) {
  const pos = geometry.attributes.position;
  const attr = colorAttribute(geometry);

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const span = Math.max(1e-4, box.max.y - box.min.y);

  const bottom = new THREE.Color(bottomHex).convertSRGBToLinear();
  const top = new THREE.Color(topHex).convertSRGBToLinear();
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const raw = (pos.getY(i) - box.min.y) / span;
    const t = raw * raw * (3 - 2 * raw);
    c.copy(bottom).lerp(top, t);
    attr.setXYZ(i, attr.getX(i) * c.r, attr.getY(i) * c.g, attr.getZ(i) * c.b);
  }
  attr.needsUpdate = true;
}

export interface OcclusionOpts {
  /**
   * How far up from the geometry's base the contact darkening reaches, in world
   * units. Where a tier meets the board — or the tier below it — light cannot get
   * into the join, and that dark seam is most of what tells the eye the two
   * things are touching rather than merely overlapping.
   */
  contactHeight?: number;
  /** Darkening in the join itself, 0–1. */
  contactStrength?: number;
  /**
   * Where the surface this geometry is standing on actually is, measured up from
   * the geometry's own base.
   *
   * A frosting shell is built one thickness taller than the tier it covers, so a
   * stacked tier's base sits that far *inside* the shell of the tier below it. Left
   * at zero, the strong end of the contact ramp is therefore buried in the cake and
   * only the pale tail of it is visible — which is why the join between two tiers
   * still read as no join at all after the darkening was added.
   */
  contactBase?: number;
  /**
   * Radius of whatever is standing on top of this geometry. A tier blocks the sky
   * from the surface it sits on, so the annulus under its footprint goes down and
   * a soft halo spreads outward from the edge of it.
   */
  aboveRadius?: number;
  /** Darkening under that footprint, 0–1. */
  aboveStrength?: number;
  /** How far past the footprint the halo reaches, as a fraction of `aboveRadius`. */
  aboveFalloff?: number;
}

/**
 * Ambient occlusion, baked into the vertex colours at build time.
 *
 * A shadow map cannot do this job. The key light's map has to cover the whole
 * cake, so one texel is two or three millimetres of real cake — far coarser than
 * the millimetre-scale gradient that makes a join read as a join. And on LOW
 * quality there is no shadow map at all, which is exactly the hardware where the
 * cake most needs to look like a solid object. Baking costs one pass over the
 * vertices when the geometry is built, nothing per frame, and it looks identical
 * on every device.
 *
 * Deterministic by construction: the only inputs are positions and normals.
 */
export function bakeOcclusion(geometry: THREE.BufferGeometry, opts: OcclusionOpts) {
  const {
    contactHeight = 0, contactStrength = 0, contactBase = 0,
    aboveRadius = 0, aboveStrength = 0, aboveFalloff = 0.55,
  } = opts;
  if (contactStrength <= 0 && aboveStrength <= 0) return;

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const nor = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  const attr = colorAttribute(geometry);

  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const span = Math.max(1e-4, max.y - min.y);

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - min.y;
    let k = 1;

    if (contactStrength > 0 && contactHeight > 0 && y < contactBase + contactHeight) {
      // Quadratic, not linear. Real occlusion falls off fast and then lingers; a
      // linear ramp reads as a painted band, which is worse than no shadow.
      const t = 1 - Math.max(0, y - contactBase) / contactHeight;
      k -= contactStrength * t * t;
    }

    if (aboveStrength > 0 && aboveRadius > 0) {
      // Only the up-facing surface near the top is being stood on. Without both
      // tests the darkening wraps down onto the side wall, where there is nothing
      // above to cast it.
      const up = nor ? Math.max(0, nor.getY(i)) : 1;
      if (up > 0.3 && max.y - pos.getY(i) < span * 0.24) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        const edge = aboveRadius * (1 + aboveFalloff);
        const t = r <= aboveRadius
          ? 1
          : Math.max(0, 1 - (r - aboveRadius) / Math.max(1e-4, edge - aboveRadius));
        k -= aboveStrength * t * t * up;
      }
    }

    // A floor, because a vertex colour of zero is a black hole in the frosting
    // and rule 1 of the render — never pure black — applies to shading too.
    k = Math.max(0.16, k);
    attr.setXYZ(i, attr.getX(i) * k, attr.getY(i) * k, attr.getZ(i) * k);
  }
  attr.needsUpdate = true;
}
