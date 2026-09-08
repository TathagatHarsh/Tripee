"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { offeredOrSelected } from "@/lib/catalogSnapshot";
import { useCatalog } from "@/lib/catalogStore";
import { deltaFor } from "@/lib/pricing";
import { blockerFor } from "@/lib/rules";
import { formatDelta } from "@/lib/format";
import { servingsLabel } from "@/lib/servings";
import { useConfig, useSetConfig } from "@/lib/store";
import { cardState, optionText, radioArrowKeys } from "@/lib/ui";

export default function SizeStep() {
  const config = useConfig();
  const catalog = useCatalog();
  const sizes = offeredOrSelected(catalog, "size", config.size);
  const set = useSetConfig();

  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader
          title="How big, how tall"
          hint="Weight sets the servings. Tiers set the drama."
        />
        <OptionGrid
          options={sizes}
          label="Size"
          columns={3}
          selected={(c) => c.size}
          patch={(size) => ({ size })}
        />
        <p className="mt-3 text-meta text-steel">
          {servingsLabel(config)} — based on standard 100g portions
        </p>
      </div>

      <fieldset>
        <GroupHeader
          title="Tiers"
          hint="Stacked rounds. Bigger cakes hold more of them."
        />
        <div role="radiogroup" aria-label="Tiers" className="grid grid-cols-3 gap-2.5">
          {[1, 2, 3].map((tiers, index) => {
            const patch = { tiers };
            const blocked = blockerFor(config, patch);
            const active = config.tiers === tiers;
            const off = !!blocked && !active;
            return (
              <button
                key={tiers}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => set(patch)}
                onKeyDown={(e) => radioArrowKeys(e, index, 3, (i) => set({ tiers: i + 1 }))}
                aria-describedby={blocked ? `why-tiers-${tiers}` : undefined}
                className={[
                  "flex min-h-11 flex-col gap-1.5 border px-4 py-3.5 text-left",
                  "transition-[background-color,border-color,box-shadow] duration-[--dur-ui] ease-[--ease-out]",
                  cardState(active, off),
                ].join(" ")}
              >
                <span className={`text-item font-medium ${optionText.name(active, off)}`}>
                  {tiers} tier{tiers > 1 ? "s" : ""}
                </span>
                <span
                  className={`font-mono text-micro font-medium tabular-nums ${optionText.delta(active)}`}
                >
                  {formatDelta(deltaFor(config, patch, catalog))}
                </span>
                {blocked && (
                  <span
                    id={`why-tiers-${tiers}`}
                    className={`text-meta leading-snug ${active ? "text-brass-lit" : "text-seal"}`}
                  >
                    {blocked.message}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <GroupHeader
          title="Sponge layers"
          hint="How many times the filling repeats inside each tier."
        />
        <div role="radiogroup" aria-label="Sponge layers" className="grid grid-cols-3 gap-2.5">
          {[2, 3, 4].map((layers, index) => {
            const active = config.layers === layers;
            return (
              <button
                key={layers}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => set({ layers })}
                onKeyDown={(e) => radioArrowKeys(e, index, 3, (i) => set({ layers: i + 2 }))}
                className={[
                  "flex min-h-11 flex-col gap-1.5 border px-4 py-3.5 text-left",
                  "transition-[background-color,border-color,box-shadow] duration-[--dur-ui] ease-[--ease-out]",
                  cardState(active, false),
                ].join(" ")}
              >
                <span className={`text-item font-medium ${optionText.name(active, false)}`}>
                  {layers} layers
                </span>
                <span
                  className={`font-mono text-micro font-medium tabular-nums ${optionText.delta(active)}`}
                >
                  {formatDelta(deltaFor(config, { layers }, catalog))}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-meta leading-snug text-steel">
          Three is standard. A fourth layer means more filling and a taller slice.
        </p>
      </fieldset>

      <ViolationCard />
    </div>
  );
}
