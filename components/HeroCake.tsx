"use client";

import type { CakeConfig } from "@/lib/schema";
import { CakePreview } from "@/components/CakePreview";

/**
 * The landing hero's cake.
 *
 * Thin on purpose. Everything that makes this a hero rather than a preview —
 * the light balance, the tighter fit in frame, the entrance, the breath, the
 * pointer parallax — belongs inside the canvas, where the frame loop is, and
 * lives in three/HeroMotion and three/Lighting. What is left out here is the
 * stage: a fixed-height box for the canvas to fill, the cursor that says the
 * cake turns, and the badge that says it out loud.
 */
export function HeroCake({ config }: { config: CakeConfig }) {
  return (
    <>
      {/* Grab, not pointer: the cake turns, it is not a button. `touch-pan-y`
          leaves vertical swipes to the page, so a phone can still scroll past
          a canvas that fills most of its width. */}
      <div className="relative h-[clamp(20rem,42vw,38.75rem)] w-full cursor-grab touch-pan-y active:cursor-grabbing">
        <CakePreview config={config} hero />
      </div>

      {/* Under the cake on a phone, over it on a desktop.
          The desktop hero has room to float the badge in the stage's own bottom
          margin. A phone does not: the cake fills the full width of the column,
          so an absolutely-placed badge lands on the board and covers the thing it
          is describing. In flow it simply sits beneath, which is where the brief
          asks for it anyway. */}
      <span className="pointer-events-none mt-3 flex h-[34px] items-center gap-2.5 rounded-full border border-rule bg-paper/90 px-3.5 font-mono text-micro tracking-[0.13em] whitespace-nowrap text-steel uppercase backdrop-blur-[6px] lg:absolute lg:bottom-12 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2">
        <span aria-hidden className="size-1.5 rounded-full bg-brass" />
        Live 3D · Drag to turn
      </span>
    </>
  );
}
