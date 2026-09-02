"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { CakeScene } from "./CakeScene";

/**
 * The 3D bundle is the entire cost centre of this page. It loads after the
 * route paints, never on the server, and shows a plain skeleton meanwhile.
 */
const Scene = dynamic(() => import("./CakeScene").then(m => m.CakeScene), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

export function LazyCakeScene(props: ComponentProps<typeof CakeScene>) {
  return <Scene {...props} />;
}

export function SceneSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-24 w-32">
          <div className="absolute bottom-0 left-1/2 h-3 w-32 -translate-x-1/2 bg-slab-deep" />
          <div className="absolute bottom-2 left-1/2 h-14 w-24 -translate-x-1/2 animate-pulse bg-slab-deep" />
          <div className="absolute bottom-14 left-1/2 h-8 w-16 -translate-x-1/2 animate-pulse bg-slab-deep" />
        </div>
        <p className="text-meta text-steel">
          Warming the oven
        </p>
      </div>
    </div>
  );
}
