"use client";

import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CakeConfig } from "@/lib/schema";
import { seedFrom } from "@/lib/seed";
import { CakeBoard } from "./CakeBoard";
import { Crumbs } from "./Crumbs";
import { MessagePlaque, plaqueFootprint } from "./MessagePlaque";
import { Tier } from "./Tier";
import { Toppings } from "./Toppings";
import { DEFAULT_SLICE, footprintRadius, tierDims, tierShape } from "./geometry";

/**
 * Progress of a staggered entrance, 0 → 1 per part. GSAP owns the easing (see
 * three/HeroMotion): these are plain eased numbers, so nothing here has to agree
 * with anything else about what "power3.out" means.
 *
 * Carried in a ref, and passed around as the ref rather than as its contents,
 * because it is written every frame by one component and read every frame by
 * another. A memoised object would do the job and lie about it — React is
 * entitled to assume props do not change under it, and mutating one is how you
 * get a render that disagrees with the screen.
 *
 * Absent on every screen but the landing hero, and absent means absent — no
 * wrapper groups, no frame callbacks, nothing to opt out of.
 */
export interface CakeReveal {
  /**
   * One per tier, bottom-up. Fixed at three, which is the most tiers the schema
   * allows, so the array never has to be resized when the cake changes shape.
   */
  tiers: number[];
  /** Toppings and the plaque, which land on a cake that is already there. */
  garnish: number;
}

/** How many entries `CakeReveal.tiers` carries — see CakeConfig.tiers. */
export const MAX_TIERS = 3;

interface Props {
  config: CakeConfig;
  segments?: number;
  castShadow?: boolean;
  maxInstances?: number;
  showBoard?: boolean;
  /** Cut a wedge out so the sponge and filling are visible. */
  sliced?: boolean;
  /** The message is still being typed; the plaque hovers clear of the cake. */
  composingMessage?: boolean;
  /** Drive a staggered entrance. Landing hero only. */
  reveal?: RefObject<CakeReveal>;
}

/**
 * Reads the config and composes tiers. This is the only place that knows how a
 * cake is put together; every other three component knows about one part of it.
 */
export function Cake({
  config,
  segments = 72,
  castShadow = true,
  maxInstances = 80,
  showBoard = true,
  sliced = false,
  composingMessage = false,
  reveal,
}: Props) {
  const seed = useMemo(() => seedFrom(config), [config]);
  const tiers = useMemo(
    () => tierDims(config.size, config.tiers, config.shape),
    [config.size, config.tiers, config.shape],
  );

  // Worked out once and handed to the toppings, so nothing lands on the words.
  const keepOff = useMemo(() => plaqueFootprint(config, tiers), [config, tiers]);

  /* A tier rises a little further than the one under it, so the stack reads as
     assembling upward rather than as one object sliding into place. */
  const rise = (node: ReactNode, amount: () => number, distance: number, key?: string) =>
    reveal
      ? <Rise key={key} amount={amount} distance={distance}>{node}</Rise>
      : node;

  return (
    <group>
      {showBoard && <CakeBoard radius={tiers[0].radius} cakeRadius={tiers[0].radius} />}

      {/* Debris from the cut, so it needs both a board to land on and a cut to
          have come out of. Outside the reveal below: the hero is never sliced,
          and crumbs are not something a decorator puts on. */}
      {showBoard && sliced && (
        <Crumbs
          config={config}
          radius={tiers[0].radius}
          seed={seed}
          castShadow={castShadow}
          sector={DEFAULT_SLICE}
        />
      )}

      {tiers.map((dims, i) => rise(
        <Tier
          key={i}
          config={config}
          shape={tierShape(config.shape, i, tiers.length)}
          dims={dims}
          index={i}
          seed={seed}
          segments={segments}
          castShadow={castShadow}
          isTop={i === tiers.length - 1}
          sliced={sliced}
          /* So each tier can bake the shadow of the one standing on it, and know
             how deep into the one below it its own base sits. */
          aboveRadius={tiers[i + 1]?.radius}
          belowRadius={tiers[i - 1]?.radius}
        />,
        () => reveal?.current.tiers[i] ?? 1,
        -(0.16 + i * 0.07),
        `tier-${i}`,
      ))}

      {/* Garnish and plaque together, and downward: they are the things a
          decorator puts on last, onto a cake that is already standing. */}
      {rise(
        <>
          <Toppings
            config={config}
            tiers={tiers}
            seed={seed}
            castShadow={castShadow}
            maxInstances={maxInstances}
            keepOff={keepOff}
            sector={sliced ? DEFAULT_SLICE : undefined}
          />

          <MessagePlaque
            config={config}
            tiers={tiers}
            castShadow={castShadow}
            composing={composingMessage}
          />
        </>,
        () => reveal?.current.garnish ?? 1,
        0.24,
        "garnish",
      )}
    </group>
  );
}

/**
 * Holds one part of the cake off its resting place by `distance`, closing the
 * gap as `amount` goes to 1.
 *
 * Read in a frame callback rather than from props, because the value changes
 * sixty times a second and re-rendering a tier that often would rebuild nothing
 * and cost everything.
 */
function Rise({
  amount, distance, children,
}: {
  amount: () => number;
  distance: number;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.y = (1 - THREE.MathUtils.clamp(amount(), 0, 1)) * distance;
  });

  return <group ref={group}>{children}</group>;
}

/** Where the camera should look, given how tall the cake ended up. */
export function cakeFocus(config: CakeConfig): { height: number; radius: number } {
  const tiers = tierDims(config.size, config.tiers, config.shape);
  const top = tiers[tiers.length - 1];
  return {
    height: top.y + top.height,
    // The *base* tier's shape, which on a tiered heart is a round — framing a
    // round base as though its lobes stuck out would push the cake into the
    // middle distance for no reason.
    radius: footprintRadius(tierShape(config.shape, 0, tiers.length), tiers[0].radius),
  };
}
