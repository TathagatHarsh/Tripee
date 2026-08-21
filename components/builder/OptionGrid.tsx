"use client";

import type { Option } from "@/lib/catalog";
import type { CakeConfig } from "@/lib/schema";
import { deltaFor } from "@/lib/pricing";
import { blockerFor } from "@/lib/rules";
import { formatDelta } from "@/lib/format";
import { useConfig, useSetConfig } from "@/lib/store";
import { cardState, optionText } from "@/lib/ui";

interface Props<T extends string> {
  options: Option<T>[];
  /** Reads the current value out of the config. */
  selected: (c: CakeConfig) => T;
  /** Turns a chosen value into a config patch. */
  patch: (value: T) => Partial<CakeConfig>;
  columns?: 2 | 3 | 4;
  /** Names the group for assistive tech: "Shape", "Sponge", and so on. */
  label?: string;
}

/**
 * One selected language, learned once on the shape step and read for the next
 * eight.
 *
 * Rest is a paper card on a rule boundary. Selected inverts to ink and is the
 * only dark card on the page. Blocked drops to the counter tone behind a dashed
 * seal edge and says, in a sentence about cake, why. A free option says nothing
 * at all — "included" printed on all six rows of a group where everything is
 * included costs a column and carries no information.
 *
 * The group is a radiogroup with a roving tabindex, not a pile of independent
 * aria-pressed toggles: that is what tells a screen-reader user "one of six"
 * rather than eleven separate switches, and it is what makes the arrow keys
 * work.
 */
export function OptionGrid<T extends string>({
  options, selected, patch, columns = 2, label,
}: Props<T>) {
  const config = useConfig();
  const set = useSetConfig();
  const current = selected(config);

  // Container queries, not viewport ones: the controls column is narrow on a
  // wide screen, and swatches squeezed into two 160px columns are unreadable.
  const cols = {
    2: "@md:grid-cols-2",
    3: "@md:grid-cols-2 @2xl:grid-cols-3",
    4: "@md:grid-cols-2 @2xl:grid-cols-4",
  }[columns];

  /** Left and right move through the group, the way radios are meant to. */
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 :
      e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    set(patch(next.value));
    const el = e.currentTarget.parentElement?.children[
      (index + step + options.length) % options.length
    ] as HTMLElement | undefined;
    el?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={`grid grid-cols-1 gap-2.5 ${cols}`}>
      {options.map((o, index) => {
        const p = patch(o.value);
        const blocked = blockerFor(config, p);
        const delta = deltaFor(config, p);
        const active = current === o.value;
        const off = !!blocked && !active;

        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => set(p)}
            onKeyDown={(e) => onKeyDown(e, index)}
            aria-describedby={blocked ? `why-${o.value}` : undefined}
            className={[
              "flex min-h-[76px] flex-col items-start gap-[7px] rounded-card border px-4 py-3.5 text-left",
              "transition-[background-color,border-color,color,box-shadow,transform]",
              "duration-[--dur-ui] ease-[--ease-out] motion-safe:hover:-translate-y-px",
              cardState(active, off),
              active ? "motion-safe:animate-[chosen_var(--dur-settle)_var(--ease-spring)]" : "",
            ].join(" ")}
          >
            <span className="flex w-full items-center gap-2.5">
              {o.glyph && (
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className={[
                    "size-[26px] shrink-0",
                    active ? "text-paper" : off ? "text-steel" : "text-graphite",
                  ].join(" ")}
                >
                  <path d={o.glyph} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                </svg>
              )}

              {o.swatch && (
                <span
                  aria-hidden
                  className={[
                    "size-[22px] shrink-0 rounded-[5px] transition-shadow",
                    active
                      ? "shadow-[inset_0_0_0_1px_rgb(253_252_250/0.3)]"
                      : "shadow-[inset_0_0_0_1px_rgb(23_22_26/0.16)]",
                  ].join(" ")}
                  style={{ background: o.swatch }}
                />
              )}

              <span
                className={`min-w-0 flex-1 text-item leading-tight font-medium ${optionText.name(active, off)}`}
              >
                {o.name}
              </span>

              {/* Brass, not steel: this is money, and money is the one thing on
                  a card a customer scans for. */}
              {delta !== 0 && (
                <span
                  className={`shrink-0 font-mono text-micro font-bold whitespace-nowrap tabular-nums ${optionText.delta(active)}`}
                >
                  {formatDelta(delta)}
                </span>
              )}
            </span>

            <span className={`text-meta leading-snug ${optionText.blurb(active)}`}>
              {o.blurb}
            </span>

            {blocked && (
              <span
                id={`why-${o.value}`}
                className={`text-meta leading-snug ${active ? "text-brass-lit" : "text-seal"}`}
              >
                {blocked.message}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
