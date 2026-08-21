"use client";

import type { CakeConfig } from "@/lib/schema";
import { LazyCakeScene } from "@/components/three/LazyCakeScene";
import type { Shot } from "@/components/three/CakeScene";

/** A read-only view of a cake, for share pages, the gallery and the landing hero. */
export function CakePreview({
  config,
  autoRotate = false,
  interactive = true,
  hero = false,
  shot,
  className,
}: {
  config: CakeConfig;
  autoRotate?: boolean;
  interactive?: boolean;
  /** Shot as the landing page's product hero — see three/HeroMotion. */
  hero?: boolean;
  /** How to photograph it — camera, crop, exposure. See three/CakeScene.Shot. */
  shot?: Shot;
  className?: string;
}) {
  // The wrapper must fill its parent: R3F sizes the canvas to 100% of its
  // container, and a container with auto height collapses the drawing buffer.
  return (
    <div className={`h-full w-full ${className ?? ""}`}>
      <LazyCakeScene
        config={config}
        autoRotate={autoRotate}
        interactive={interactive}
        hero={hero}
        shot={shot}
      />
    </div>
  );
}
