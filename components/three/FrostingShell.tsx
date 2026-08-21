"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, Shape } from "@/lib/schema";
import { frostingMaterial, tileRepeat } from "./materials";
import {
  phiOf, ruffleBandGeometry, rosetteGeometry, shellOutline, outlinePerimeter,
  type Sector, type TierDims,
} from "./geometry";
import { useDisposed } from "./useDisposable";
import { mulberry32 } from "@/lib/seed";

interface Props {
  config: CakeConfig;
  /** This tier's own shape — see geometry.tierShape. The decoration is laid out on
   *  the outline of the tier it is piped onto, which on a tiered heart is a round. */
  shape: Shape;
  dims: TierDims;
  seed: number;
  castShadow: boolean;
  /** Built by the tier, which also needs it to place the drip. */
  geometry: THREE.BufferGeometry;
  /** Decoration stops at the cut rather than hanging over open sponge. */
  sector?: Sector;
}

export function FrostingShell({ config, shape, dims, seed, castShadow, geometry, sector }: Props) {
  const mat = useMemo(
    () => frostingMaterial(
      config.frosting, config.frostingColor, config.finish,
      tileRepeat(shape, dims.radius, dims.height),
    ),
    [config.frosting, config.frostingColor, config.finish, shape, dims.radius, dims.height],
  );

  return (
    <group position={[0, dims.y, 0]}>
      <mesh geometry={geometry} castShadow={castShadow} receiveShadow>
        <meshPhysicalMaterial
          {...mat}
          /* The vertex colour channel is always populated now: the tier bakes its
             contact occlusion into it (Tier → bakeOcclusion) and ombré multiplies
             its gradient on top. So vertex colours are on for every finish, and
             only ombré needs the material colour out of the way — for ombré the
             channel is carrying colour, not just shade. */
          color={config.finish === "ombre" ? "#ffffff" : mat.color}
          vertexColors
          /* Open at the cut, so the far inner surface has to render too. */
          side={sector ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>

      {config.finish === "ruffle" && (
        <Ruffles shape={shape} dims={dims} seed={seed} mat={mat} castShadow={castShadow} sector={sector} />
      )}
      {config.finish === "rosette" && (
        <Rosettes shape={shape} dims={dims} seed={seed} mat={mat} castShadow={castShadow} sector={sector} />
      )}
    </group>
  );
}

type Mat = ReturnType<typeof frostingMaterial>;

interface DecorProps {
  /** Decoration is laid out on the shell's exact outline, derived per shape. */
  shape: Shape;
  dims: TierDims;
  seed: number;
  mat: Mat;
  castShadow: boolean;
  sector?: Sector;
}

/** Skip anything that would sit over the missing wedge. */
function inCut(x: number, z: number, sector?: Sector): boolean {
  if (!sector) return false;
  let d = phiOf(x, z) - sector.centre;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < sector.width / 2;
}

/**
 * The ruffled finish: one continuous swept band per row, not a field of instanced
 * frills. See geometry.ruffleBandGeometry for why — in short, a ruffle is piped in one
 * unbroken pass, and anything assembled from separate pieces shows its seams.
 */
function Ruffles({ shape, dims, seed, mat, castShadow, sector }: DecorProps) {
  const geo = useDisposed(useMemo(
    () => ruffleBandGeometry(shape, dims.radius, dims.height, seed, sector),
    [shape, dims.radius, dims.height, seed, sector],
  ));

  if (!geo) return null;

  return (
    <mesh geometry={geo} castShadow={castShadow} receiveShadow>
      {/* Two-sided: the underside of every frill is visible from below, and the hem is
          thin enough that backface culling shows through it. */}
      <meshPhysicalMaterial {...mat} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Piped spirals covering the whole surface. */
function Rosettes({ shape, dims, seed, mat, castShadow, sector }: DecorProps) {
  const geo = useDisposed(useMemo(
    () => rosetteGeometry(),
    [],
  ));

  const instances = useMemo(() => {
    const rng = mulberry32(seed ^ 0x2c1b3a55);
    const out: { pos: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];
    const size = Math.min(0.32, dims.radius * 0.4);

    /*
     * Spaced to touch. The sweep is a shade under one unit across and one unit tall,
     * so a pitch of 1.15 left a visible gap between every pair — and a lattice of
     * separated blobs is what made the square read as embossed rather than piped.
     * Piped rosettes are butted up against each other; the neighbours are what hide
     * each other's tails.
     */
    const rows = Math.max(2, Math.round(dims.height / (size * 0.98)));
    const probe = shellOutline(shape, dims.radius, dims.height, 256, "widest");
    const perRow = Math.max(8, Math.round(outlinePerimeter(probe) / (size * 1.0)));
    const ring = shellOutline(shape, dims.radius, dims.height, perRow, "widest");

    /*
     * Same problem as the ruffles, worse: every row started at ring[0], so the
     * rosettes lined up into vertical columns and the tier read as an embossed
     * grid of snail shells rather than as piped work. A per-row phase breaks the
     * columns; the jitter below breaks the rows.
     */
    for (let r = 0; r < rows; r++) {
      const rowY = ((r + 0.5) / rows) * dims.height;
      const phase = rng();
      for (let i = 0; i < perRow; i++) {
        const p = ring[Math.floor(i + phase * perRow) % perRow];
        if (inCut(p.x, p.z, sector)) continue;
        /*
         * How far the rosette stands off the wall, and it has to be measured from the
         * geometry rather than guessed. 0.18 buried half of every one of them; 0.34
         * was right for the old fused tube, which extended a third of its own scale
         * behind its origin. The star-section sweep only reaches 0.087 back, so 0.34
         * would float every rosette a quarter of its own width clear of the cake.
         * 0.06 seats it with its back just inside the frosting.
         */
        const push = size * 0.06;
        const tx = -p.nz, tz = p.nx;
        const slide = (rng() - 0.5) * size * 0.2;
        out.push({
          pos: new THREE.Vector3(
            p.x + p.nx * push + tx * slide,
            rowY + (rng() - 0.5) * size * 0.14,
            p.z + p.nz * push + tz * slide,
          ),
          // rosetteGeometry now faces local +Z, so aiming it is a single yaw
          // about Y and the third Euler term becomes a roll about the facing
          // axis — which is what varying a piped swirl actually means.
          //
          // The old Euler(π/2, 0, yaw) composed to R = Rx(π/2)·Rz(yaw), which
          // sends local +Y to (-sin yaw, 0, cos yaw) — ninety degrees off the
          // outward normal. Every rosette in the product has been edge-on since
          // it was written; on a round cake they overlapped into something that
          // read as texture, so nobody caught it.
          rot: new THREE.Euler(
            (rng() - 0.5) * 0.16,
            Math.atan2(p.nx, p.nz),
            rng() * Math.PI * 2,
          ),
          scale: size * (0.86 + rng() * 0.28),
        });
      }
    }

    // Top face, worked inward by shrinking the measured silhouette.
    const steps = Math.max(1, Math.round(dims.radius / size));
    for (let k = 1; k <= steps; k++) {
      // Back to the original step: at +0.15 the inner rings crowded together and then
      // left a bare stripe across the middle of the top.
      const shrink = 1 - k / (steps + 0.4);
      const inner = ring.map(p => ({
        ...p,
        x: p.x * shrink,
        z: p.z * shrink,
      }));
      // Perimeter of this ring, not 2π times a radius sampled from one
      // arbitrary point of it — on a square that point could be a corner or a
      // flat, so the ring count swung by 40% depending on where the outline
      // happened to start.
      const ringLength = outlinePerimeter(inner);
      if (ringLength <= size * 2.6) {
        out.push({
          pos: new THREE.Vector3(0, dims.height + size * 0.16, 0),
          rot: new THREE.Euler(-Math.PI / 2, 0, rng() * Math.PI * 2),
          scale: size * (0.92 + rng() * 0.16),
        });
        break;
      }
      // The top face needs more room than the wall does. Seen from above, a rose
      // shows its full width, and at the wall's pitch the rings collided into an
      // overlapping mat with tails poking through each other.
      const n = Math.max(4, Math.round(ringLength / (size * 1.16)));
      for (let i = 0; i < n; i++) {
        const p = inner[Math.floor((i / n) * inner.length)];
        if (inCut(p.x, p.z, sector)) continue;
        out.push({
          pos: new THREE.Vector3(p.x, dims.height + size * 0.16, p.z),
          rot: new THREE.Euler(-Math.PI / 2, 0, rng() * Math.PI * 2),
          scale: size * (0.92 + rng() * 0.16),
        });
      }
    }
    return out;
  }, [shape, dims.radius, dims.height, seed, sector]);

  return (
    <instancedMesh
      args={[geo, undefined, instances.length]}
      castShadow={castShadow}
      ref={(m) => {
        if (!m) return;
        const o = new THREE.Object3D();
        instances.forEach((inst, i) => {
          o.position.copy(inst.pos);
          o.rotation.copy(inst.rot);
          o.scale.setScalar(inst.scale);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
      }}
    >
      <meshPhysicalMaterial {...mat} />
    </instancedMesh>
  );
}
