"use client";

import { useState } from "react";
import { PLACEMENTS, TOPPINGS } from "@/lib/catalog";
import type { Topping, ToppingSpec } from "@/lib/schema";
import { useConfig, useSetConfig } from "@/lib/store";

/**
 * Placement and density, on the cake rather than under it.
 *
 * These two controls used to sit at the bottom of the toppings step, below a
 * twelve-card picker, which on every viewport put them under the fold: you set a
 * density, scrolled up to see what it did, and scrolled back down to change it.
 * They are the one pair of controls in the builder whose entire value is the
 * picture moving while you hold them, so they belong on the picture.
 *
 * Density is a slider here and was five dots there. Dots were the right call in
 * a column, for the reason the step used to give: a slider hides its value
 * behind an interaction, and a column of controls has to be readable at a
 * glance. Over the render that argument inverts. The *cake* is showing the
 * value, so the control's job is no longer to display it — it is to let you
 * sweep the range and watch the top fill up.
 *
 * Not a portal. The bar needs the cake pane, which BuilderShell owns and which
 * knows which step it is on already; a context or a portal to move one component
 * into a layout two files away is machinery for its own sake.
 */
export function ToppingBar() {
  const chosen = useConfig().toppings;
  const set = useSetConfig();

  /*
   * Which topping the bar is aimed at — by kind, and reset whenever the list
   * changes length so the newest one wins.
   *
   * Both halves of that matter. An *index* survives a removal as a number and
   * stops meaning what it meant, so clamping it to the end quietly re-aims the
   * bar at whatever is now last. And a pick that survives an *addition* is worse
   * than wrong: you tap Mixed Berry, the bar still says Strawberry, and the next
   * drag of the slider changes the density of a topping you were not looking at.
   *
   * Adjusted during render rather than in an effect, which is what React asks for
   * when state has to follow something outside it: one extra render, no frame
   * where the bar shows the wrong thing.
   */
  /*
   * Below lg the two pill strips are collapsed behind a summary row — see the
   * button that opens it.
   *
   * Deliberately not reset when the topping or the placement changes: someone who
   * opened the bar is placing things, and closing it under them on every tap would
   * be the control taking a view about when they are finished. The whole value of
   * these settings is watching the cake move while you hold them.
   */
  const [open, setOpen] = useState(false);

  const [pick, setPick] = useState<Topping | null>(null);
  const [count, setCount] = useState(chosen.length);
  if (chosen.length !== count) {
    setCount(chosen.length);
    setPick(null);
  }

  if (chosen.length === 0) return null;

  const spec = chosen.find(t => t.kind === pick) ?? chosen[chosen.length - 1];
  const meta = TOPPINGS.find(t => t.value === spec.kind)!;

  const update = (patch: Partial<ToppingSpec>) =>
    set({
      toppings: chosen.map(t => (t.kind === spec.kind ? { ...t, ...patch } : t)),
    });

  const many = chosen.length > 1;

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border border-rule-strong bg-paper/90 px-2 py-1.5 backdrop-blur-[6px]">
      {/*
        A row per kind of control, and the name riding along with the slider
        rather than taking a row of its own.

        The cake pane is 398px wide at 1280, which is the narrowest three-column
        layout the builder has. Five placement pills are 354 of that, so anything
        sharing their row wraps — and a third row is 44px off the height of the
        render, which is what the panel exists to show. With one topping chosen,
        which is most of the time, this is two rows; a second topping buys its own
        row of tabs and is welcome to it.

        Everything wraps rather than scrolls. A strip that scrolls sideways is
        tighter and it hid Crown past the right edge at every width that actually
        occurs, and a control you cannot see is worse than a row you can.
      */}
      {/*
        The mobile disclosure.

        Measured on a 375x812 phone: the two pill strips are 76px each, because
        five placement pills need 381px of a 301px row and wrap, and the bar came
        to 214px — 35% of the 618px the builder has to share between the render,
        this bar and the topping picker. The render was getting 182px of an 812px
        screen, which is a preview of nothing.

        They cannot simply be made to fit. "White Chocolate Curl" alone is 211px,
        and scrolling the strip sideways was tried and reverted for the good reason
        recorded below: it hid Crown past the right edge.

        So on a phone they are one row until they are asked for, and the summary
        carries what collapsing would otherwise cost — which topping the bar is
        aimed at, and where it is putting it. Density stays outside this and stays
        live, because sweeping it while the top fills up is the entire argument for
        the bar existing at all.

        From lg the strips are shown outright and this button is display:none, so
        it leaves the accessibility tree with its own box and nothing is left
        announcing a control that is not there.
      */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="topping-pills"
        className="flex min-h-9 items-center gap-2 border border-rule bg-paper/70 px-2 text-left lg:hidden"
      >
        <Swatch hex={meta.swatch} />
        <span className="truncate text-meta text-ink">{meta.name}</span>
        <span aria-hidden className="shrink-0 text-rule-strong">·</span>
        <span className="shrink-0 font-mono text-micro tracking-[0.14em] text-steel uppercase">
          {PLACEMENTS.find(x => x.value === spec.placement)?.short}
        </span>
        {/* A hairline rule, because without one the placement and the action ran
            together as a single phrase — "BORDER CHANGE" — and the only word on
            the row that is a verb stopped looking like one. */}
        <span className="ml-auto flex shrink-0 items-center self-stretch border-l border-rule pl-2.5 font-mono text-micro tracking-[0.14em] text-ink uppercase">
          {open ? "Done" : "Change"}
        </span>
      </button>

      <div
        id="topping-pills"
        className={`${open ? "flex" : "hidden"} flex-col gap-1.5 lg:flex`}
      >
      {many && (
        <div className="flex flex-wrap items-center gap-1">
          {chosen.map((t) => {
            const each = TOPPINGS.find(x => x.value === t.kind)!;
            const on = t.kind === spec.kind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => setPick(t.kind)}
                aria-pressed={on}
                className={pill(on)}
              >
                <Swatch hex={each.swatch} />
                <span className="whitespace-nowrap">{each.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        role="group"
        aria-label={`${meta.name} placement`}
        className="flex flex-wrap items-center gap-1"
      >
        {PLACEMENTS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => update({ placement: p.value })}
            aria-pressed={spec.placement === p.value}
            /* The pill is abbreviated; the full name is the one that is spoken. */
            aria-label={p.name}
            title={p.name}
            className={pill(spec.placement === p.value)}
          >
            {p.short}
          </button>
        ))}
        </div>
      </div>

      <div className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1">
        {!many && (
          <span className="flex shrink-0 items-center gap-2 pl-1">
            <Swatch hex={meta.swatch} />
            <span className="text-body font-medium whitespace-nowrap">{meta.name}</span>
          </span>
        )}
        <span className="shrink-0 font-mono text-micro tracking-[0.14em] text-steel">
          DENSITY
        </span>
        {/*
          A native range, so the keyboard, the touch handling and the drag all
          arrive correct and cost nothing. `h-9` is the hit area rather than the
          track: a range jumps to wherever inside its box you press, so the whole
          36px row is the target even though the thumb is 16px of it.
        */}
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={spec.density}
          onChange={e => update({ density: Number(e.target.value) })}
          aria-label={`${meta.name} density`}
          aria-valuetext={`${spec.density} of 5`}
          className="h-9 min-w-[4.5rem] flex-1 accent-ink"
        />
        <span className="shrink-0 font-mono text-micro text-steel tabular-nums">
          {spec.density}/5
        </span>
      </div>
    </div>
  );
}

/** Both strips are the same single-select language, so they are the same pill. */
function pill(on: boolean): string {
  return [
    "flex min-h-9 shrink-0 items-center gap-2 border px-3 text-meta",
    "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    on
      ? "border-ink bg-ink text-paper"
      : "border-rule bg-paper/70 text-steel hover:border-rule-strong hover:text-ink",
  ].join(" ");
}

function Swatch({ hex }: { hex?: string }) {
  return (
    <span
      aria-hidden
      className="size-[15px] shrink-0 rounded-full border border-ink/20"
      style={{ background: hex }}
    />
  );
}
