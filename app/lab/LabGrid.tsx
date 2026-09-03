"use client";

import { useState } from "react";
import { LazyCakeScene } from "@/components/three/LazyCakeScene";
import { priceCake } from "@/lib/pricing";
import { formatINR } from "@/lib/format";
import { validateCake } from "@/lib/rules";
import { LAB_CONFIGS } from "./configs";
import { useView } from "@/lib/view";

export function LabGrid() {
  const [autoRotate, setAutoRotate] = useState(false);
  const [big, setBig] = useState<number | null>(null);
  const sliced = useView(s => s.sliced);
  const toggleSlice = useView(s => s.toggleSlice);

  return (
    <main className="min-h-dvh px-4 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Render lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-steel">
            {LAB_CONFIGS.length} extremes at once. Squint at it — does the silhouette read as a cake?
            Would you eat it? If anyone says &ldquo;plastic&rdquo;, &ldquo;wax&rdquo; or
            &ldquo;3D model&rdquo;, it is not done.
          </p>
        </div>

        <div className="flex gap-5">
          <label className="flex items-center gap-2 text-meta text-steel">
            <input
              type="checkbox"
              checked={autoRotate}
              onChange={(e) => setAutoRotate(e.target.checked)}
              className="size-4 accent-ink"
            />
            Auto-rotate
          </label>
          <label className="flex items-center gap-2 text-meta text-steel">
            <input
              type="checkbox"
              checked={sliced}
              onChange={toggleSlice}
              className="size-4 accent-ink"
            />
            Cut a slice
          </label>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {LAB_CONFIGS.map((entry, i) => {
          const price = priceCake(entry.config);
          const notes = validateCake(entry.config);

          return (
            <figure
              key={entry.label}
              className="overflow-hidden bg-paper paper-edge"
            >
              <button
                type="button"
                onClick={() => setBig(big === i ? null : i)}
                className="block aspect-square w-full cursor-zoom-in bg-paper"
                aria-label={`Enlarge ${entry.label}`}
              >
                <LazyCakeScene
                  config={entry.config}
                  autoRotate={autoRotate}
                  interactive={big === i}
                  followView
                />
              </button>

              <figcaption className="border-t border-rule px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-meta font-medium ">
                    {entry.label}
                  </span>
                  <span className="font-mono text-meta tabular-nums text-steel">
                    {formatINR(price.total)}
                  </span>
                </div>
                <p className="mt-1 text-body leading-snug text-steel">{entry.note}</p>
                {notes.length > 0 && (
                  <p className="mt-1 text-meta text-seal">
                    {notes.length} rule note{notes.length > 1 ? "s" : ""}
                  </p>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {big !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4"
          onClick={() => setBig(null)}
        >
          <div
            className="h-[min(88vh,88vw)] w-[min(88vh,88vw)] overflow-hidden bg-paper"
            onClick={(e) => e.stopPropagation()}
          >
            <LazyCakeScene config={LAB_CONFIGS[big].config} autoRotate={autoRotate} />
          </div>
        </div>
      )}
    </main>
  );
}
