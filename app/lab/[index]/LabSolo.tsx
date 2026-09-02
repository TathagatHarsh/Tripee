"use client";

import { LazyCakeScene } from "@/components/three/LazyCakeScene";
import { useView } from "@/lib/view";
import { LAB_CONFIGS } from "../configs";

export function LabSolo({ index }: { index: number }) {
  const sliced = useView(s => s.sliced);
  const toggleSlice = useView(s => s.toggleSlice);

  return (
    <div className="relative h-full w-full">
      <LazyCakeScene config={LAB_CONFIGS[index].config} followView />

      <label className="absolute bottom-3 left-3 flex items-center gap-2 border border-rule bg-paper/85 px-3 py-2 text-meta text-steel">
        <input
          type="checkbox"
          checked={sliced}
          onChange={toggleSlice}
          className="size-4 accent-ink"
        />
        Cut a slice
      </label>
    </div>
  );
}
