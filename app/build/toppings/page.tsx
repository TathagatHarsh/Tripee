"use client";

import { GroupHeader, StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { PLACEMENTS, TOPPINGS } from "@/lib/catalog";
import { deltaFor } from "@/lib/pricing";
import { formatDelta } from "@/lib/format";
import type { Topping, ToppingPlacement } from "@/lib/schema";
import { useConfig, useSetConfig } from "@/lib/store";
import { btn, cardState, optionText } from "@/lib/ui";

const MAX = 4;

/**
 * Toppings are the one multi-select step, and the only one where a choice has
 * settings of its own.
 *
 * Placement was a native <select> and density a range slider — two controls
 * that hide their current value behind an interaction, on a step whose entire
 * point is that you can see the effect immediately. They are five pills and
 * five dots: the state is the picture, and every target clears 44px including
 * Remove, which was an 18px underlined text link.
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

  const update = (i: number, patch: Partial<(typeof chosen)[number]>) =>
    set({ toppings: chosen.map((t, n) => (n === i ? { ...t, ...patch } : t)) });

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
                  "flex min-h-11 items-center gap-3 rounded-card border px-4 py-3.5 text-left",
                  "transition-[background-color,border-color,box-shadow,transform] duration-[--dur-ui] ease-[--ease-out]",
                  off ? "cursor-not-allowed" : "motion-safe:hover:-translate-y-px",
                  cardState(active, off),
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="size-[22px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(23_22_26/0.18)]"
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
                  className={`shrink-0 font-mono text-micro font-bold whitespace-nowrap tabular-nums ${optionText.delta(active)}`}
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

      <section>
        <GroupHeader
          title="Placement and density"
          hint="Where each topping sits, and how much of it."
        />

        {chosen.length === 0 ? (
          <p className="rounded-card border border-dashed border-rule-strong bg-sunken px-4 py-5 text-meta text-steel">
            No toppings yet. Plenty of cakes don&rsquo;t need any.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {chosen.map((t, i) => {
              const meta = TOPPINGS.find(x => x.value === t.kind)!;
              return (
                <li
                  key={`${t.kind}-${i}`}
                  className="flex flex-col gap-3 rounded-card border border-rule bg-paper px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(23_22_26/0.18)]"
                      style={{ background: meta.swatch }}
                    />
                    <span className="min-w-0 flex-1 text-item font-medium">{meta.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(t.kind)}
                      aria-label={`Remove ${meta.name}`}
                      className={btn("quiet", "md", "px-3.5 text-meta")}
                    >
                      Remove
                    </button>
                  </div>

                  <div role="group" aria-label={`${meta.name} placement`} className="flex flex-wrap gap-1.5">
                    {PLACEMENTS.map((p) => {
                      const on = t.placement === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => update(i, { placement: p.value })}
                          aria-pressed={on}
                          className={[
                            "flex min-h-9 items-center rounded-full border px-3.5 text-meta",
                            "transition-colors duration-[--dur-ui] ease-[--ease-out]",
                            on
                              ? "border-ink bg-ink text-paper"
                              : "border-rule bg-paper text-steel hover:border-rule-strong hover:text-ink",
                          ].join(" ")}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>

                  <div role="group" aria-label={`${meta.name} density`} className="flex items-center gap-3">
                    <span className="font-mono text-micro tracking-[0.14em] text-steel">
                      DENSITY
                    </span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => update(i, { density: d })}
                          aria-pressed={d === t.density}
                          aria-label={`Density ${d} of 5`}
                          className={[
                            "size-[26px] rounded-full transition-colors duration-[--dur-tap]",
                            d <= t.density ? "bg-ink" : "bg-rule hover:bg-rule-strong",
                          ].join(" ")}
                        />
                      ))}
                    </div>
                    <span className="ml-auto font-mono text-micro text-steel tabular-nums">
                      {t.density}/5
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ViolationCard field="toppings" />
    </div>
  );
}
