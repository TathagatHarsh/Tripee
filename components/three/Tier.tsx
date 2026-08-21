"use client";

import * as THREE from "three";
import { useMemo } from "react";
import type { CakeConfig, Shape } from "@/lib/schema";
import { Drip } from "./Drip";
import { FrostingShell } from "./FrostingShell";
import { SpongeLayers } from "./SpongeLayers";
import { frostingMaterial, ombreBase, ombreTop } from "./materials";
import {
  DEFAULT_SLICE, shellGeometry, shellOutline, shellThickness, topDiscGeometry,
  type Sector, type TierDims,
} from "./geometry";
import { applyVerticalGradient, bakeOcclusion, useDisposed } from "./useDisposable";

interface Props {
  config: CakeConfig;
  /**
   * This tier's own shape, which is not always the cake's. A tiered heart puts the
   * heart on top and rounds everything under it — see geometry.tierShape.
   */
  shape: Shape;
  dims: TierDims;
  index: number;
  seed: number;
  segments: number;
  castShadow: boolean;
  /** The drip runs off the topmost tier, and only that one. */
  isTop: boolean;
  /** A wedge is cut out so the inside is visible. */
  sliced?: boolean;
  /**
   * Radius of the tier standing on this one, if there is one. Used to bake the
   * shadow it casts on the surface it sits on — the join that used to be as
   * bright as everything around it, which is what made a stack of tiers read as
   * a stack of separate objects.
   */
  aboveRadius?: number;
  /**
   * Radius of the tier this one stands on, if any. Its shell is proud of it by one
   * frosting thickness, which is how far into the cake this tier's own base sits.
   */
  belowRadius?: number;
}

/**
 * Full coverage is normally a single closed shell — there is no point rendering
 * a sponge nobody can see. A cutaway changes that: the whole reason for the cut
 * is the sponge and the filling, so the interior gets built regardless of
 * coverage and both are clipped to the same wedge.
 *
 * The shell geometry is built here rather than inside FrostingShell because the
 * drip needs the cake's real outline, and measuring it off the finished
 * geometry is the only way to get it right for a bevelled extrude.
 */
export function Tier({
  config, shape, dims, index, seed, segments, castShadow, isTop, sliced = false,
  aboveRadius, belowRadius,
}: Props) {
  const tierSeed = seed ^ ((index + 1) * 0x9e3779b9);
  const sector: Sector | undefined = sliced ? DEFAULT_SLICE : undefined;

  // A bundt is glazed, not frosted — the glaze is poured over and coats the
  // whole ring. There is no partial-coverage version of that.
  const covered = config.coverage === "full" || shape === "bundt";

  const shell = useDisposed(useMemo(() => {
    if (!covered) return null;
    const g = shellGeometry({
      shape,
      radius: dims.radius,
      height: dims.height,
      finish: config.finish,
      seed: tierSeed,
      segments,
      sector,
    });
    /*
     * Both of these multiply into the same vertex-colour channel, so an ombré cake
     * keeps its gradient *and* gets its shadow. Occlusion first only because it
     * reads better in the diff; the two commute.
     *
     * The contact band is 20% of the tier's height, capped: on a 0.5kg cake 20% is
     * about 13mm of real cake, which is right for the shadow that gathers in the
     * join, and on a 5kg base tier the uncapped version would be a 30mm skirt.
     *
     * `contactBase` is what makes the join between two tiers visible at all. Every
     * tier above the first stands on the shell of the tier below, and that shell is
     * built one thickness proud of the tier it covers — so the bottom of this
     * geometry is that far inside the cake, and the darkest part of an unshifted
     * ramp would be buried in it.
     */
    bakeOcclusion(g, {
      contactHeight: Math.min(dims.height * 0.2, 0.12),
      contactStrength: 0.44,
      contactBase: belowRadius ? shellThickness(belowRadius) : 0,
      aboveRadius: aboveRadius ? aboveRadius + shellThickness(aboveRadius) : 0,
      aboveStrength: 0.42,
    });
    if (config.finish === "ombre") {
      applyVerticalGradient(g, ombreBase(config.frostingColor), ombreTop(config.frostingColor));
    }
    return g;
  }, [covered, shape, config.finish, config.frostingColor, dims.radius, dims.height, tierSeed, segments, sector, aboveRadius, belowRadius]));

  // Measured across the top band only, which is where frosting actually pools
  // before it runs.
  const rimOutline = useMemo(
    () => (shell && !sliced
      ? shellOutline(shape, dims.radius, dims.height, 200, "rim")
      : undefined),
    [shell, sliced, shape, dims.radius, dims.height],
  );

  const drip = isTop && config.hasDrip && config.coverage !== "naked" ? (
    <Drip
      config={config}
      shape={shape}
      dims={dims}
      seed={seed}
      castShadow={castShadow}
      silhouette={rimOutline}
      sector={sector}
    />
  ) : null;

  // The interior shows whenever there is a cut, or whenever the coverage
  // already exposes it.
  const interior = (sliced || !covered) ? (
    <SpongeLayers
      config={config}
      shape={shape}
      dims={dims}
      seed={tierSeed}
      segments={segments}
      castShadow={castShadow}
      sector={sector}
    />
  ) : null;

  if (covered && shell) {
    return (
      <>
        {interior}
        <FrostingShell
          config={config}
          shape={shape}
          dims={dims}
          seed={tierSeed}
          geometry={shell}
          castShadow={castShadow}
          /* Ruffles and rosettes follow a measured silhouette, which a cut
             makes meaningless — they are suppressed on the cut face instead. */
          sector={sector}
        />
        {drip}
      </>
    );
  }

  return (
    <group>
      {interior}
      <TopFrosting
        config={config}
        shape={shape}
        dims={dims}
        index={index}
        seed={tierSeed}
        segments={segments}
        castShadow={castShadow}
        isTop={isTop}
        sector={sector}
        /* On a stacked naked cake only the bottom tier gets a crown of frosting. */
        hidden={config.coverage === "naked" && index !== 0}
      />
      {drip}
    </group>
  );
}

function TopFrosting({
  config, shape, dims, seed, segments, castShadow, hidden, sector,
}: Props & { hidden: boolean; sector?: Sector }) {
  const geometry = useDisposed(useMemo(
    () => topDiscGeometry({
      shape,
      radius: dims.radius,
      height: dims.height,
      finish: config.finish,
      seed,
      segments,
      sector,
    }),
    [shape, config.finish, dims.radius, dims.height, seed, segments, sector],
  ));

  const mat = useMemo(
    () => frostingMaterial(config.frosting, config.frostingColor, config.finish, 3),
    [config.frosting, config.frostingColor, config.finish],
  );

  if (hidden) return null;

  return (
    <mesh
      geometry={geometry}
      position={[0, dims.y + dims.height - 0.02, 0]}
      castShadow={castShadow}
      receiveShadow
    >
      <meshPhysicalMaterial
        {...mat}
        side={sector ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}
