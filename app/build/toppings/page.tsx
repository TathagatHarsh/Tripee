"use client";

import { GroupHeader, StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { TOPPINGS } from "@/lib/catalog";
import { deltaFor } from "@/lib/pricing";
import { formatDelta } from "@/lib/format";
import type { Topping, ToppingPlacement } from "@/lib/schema";
import { useConfig, useSetConfig } from "@/lib/store";
import { cardState, optionText } from "@/lib/ui";

const MAX = 4;

/**
 * Toppings are the one multi-select step, and the only one where a choice has
 * settings of its own.
 *
 * Those settings are no longer here. Placement and density were five pills and
 * five dots at the bottom of this column, under a twelve-card picker, which put
 * them below the fold on every viewport — so the two controls whose entire value
 * is watching the cake change were the two you could not see the cake from. They
 * are a bar on the render now; see builder/ToppingBar. What is left is the pick,
 * which is what a step is for.
 */
export default function ToppingsStep() {
  const config = useConfig();
  const set = useSetConfig();
  const chosen = config.toppings;
  const full = chosen.length >= MAX;

  const toggle = (kind: Topping) => {
    const at = chosen.findIndex(t => t.kind === kind);
    if (at >= 0) {
      set({ toppings: chosen.filter((_, n) => n !== at) });
      return;
    }
    if (full) return;
    set({
      toppings: [...chosen, { kind, placement: "top-scatter" as ToppingPlacement, density: 3 }],
    });
  };

  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader title="Up to four toppings" hint="Placement and density are yours to set." />

        <GroupHeader
          title="Choose toppings"
          hint="Tap to add or remove. Four is the maximum."
          aside={
            <span className="font-mono text-micro tracking-[0.12em] text-brass">
              {chosen.length} OF {MAX} CHOSEN
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2">
          {TOPPINGS.map((o) => {
            const active = chosen.some(t => t.kind === o.value);
            const off = !active && full;
            const delta = deltaFor(config, {
              toppings: [...chosen, { kind: o.value, placement: "top-scatter", density: 3 }],
            });

            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                aria-pressed={active}
                aria-describedby={off ? "toppings-full" : undefined}
                className={[
                  "flex min-h-11 items-center gap-3 border px-4 py-3.5 text-left",
                  "transition-[background-color,border-color,box-shadow,transform] duration-[--dur-ui] ease-[--ease-out]",
                  off ? "cursor-not-allowed" : "motion-safe:hover:-translate-y-px",
                  cardState(active, off),
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="size-[22px] shrink-0 rounded-full border border-ink/20"
                  style={{ background: o.swatch }}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-item font-medium ${optionText.name(active, off)}`}>
                    {o.name}
                  </span>
                  <span className={`mt-0.5 block text-meta leading-snug ${optionText.blurb(active)}`}>
                    {o.blurb}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono text-micro font-medium whitespace-nowrap tabular-nums ${optionText.delta(active)}`}
                >
                  {active ? "ADDED" : formatDelta(delta)}
                </span>
              </button>
            );
          })}
        </div>

        {full && (
          <p id="toppings-full" className="mt-3 text-meta text-steel">
            Four toppings is the maximum. Remove one to swap it out.
          </p>
        )}
      </div>

      {chosen.length > 0 && (
        <p className="border border-dashed border-rule-strong bg-sunken px-4 py-3.5 text-meta text-steel">
          Placement and density sit on the preview, so the cake changes while you
          set them.
        </p>
      )}

      <ViolationCard field="toppings" />
    </div>
  );
}
