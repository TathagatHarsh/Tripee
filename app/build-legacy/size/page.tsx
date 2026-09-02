"use client";

import { OptionGrid } from "@/components/builder-legacy/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder-legacy/StepHeader";
import { ViolationCard } from "@/components/builder-legacy/ViolationCard";
import { SIZES } from "@/lib/catalog";
import { deltaFor } from "@/lib/pricing";
import { blockerFor } from "@/lib/rules";
import { formatDelta } from "@/lib/format";
import { servingsLabel } from "@/lib/servings";
import { useConfig, useSetConfig } from "@/lib/store";
import { cardState, optionText } from "@/lib/ui";

export default function SizeStep() {
  const config = useConfig();
  const set = useSetConfig();

  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader
          title="How big, how tall"
          hint="Weight sets the servings. Tiers set the drama."
        />
        <OptionGrid
          options={SIZES}
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
        <div className="grid grid-cols-3 gap-2.5">
          {[1, 2, 3].map((tiers) => {
            const patch = { tiers };
            const blocked = blockerFor(config, patch);
            const active = config.tiers === tiers;
            const off = !!blocked && !active;
            return (
              <button
                key={tiers}
                type="button"
                onClick={() => { if (!blocked) set(patch); }}
                aria-pressed={active}
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
                  {formatDelta(deltaFor(config, patch))}
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
        <div className="grid grid-cols-3 gap-2.5">
          {[2, 3, 4].map((layers) => {
            const active = config.layers === layers;
            return (
              <button
                key={layers}
                type="button"
                onClick={() => set({ layers })}
                aria-pressed={active}
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
                  {formatDelta(deltaFor(config, { layers }))}
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
