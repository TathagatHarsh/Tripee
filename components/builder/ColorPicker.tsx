"use client";

import { achievable, clampReason, wasClamped } from "@/lib/color";

interface Props {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  palette: { name: string; hex: string }[];
  /**
   * The group heading above already says "Frosting colour", and printing it
   * again directly underneath is the label appearing twice in eight vertical
   * pixels. The name still reaches assistive tech.
   */
  labelHidden?: boolean;
}

/**
 * The UI shows the colour the customer picked; the render shows the one a
 * kitchen can actually mix. Saying so out loud is more honest than quietly
 * desaturating it behind their back.
 *
 * The swatches were 36px circles with the name hidden in a `title` attribute,
 * so choosing a colour meant hovering twelve dots to find out what they were
 * called — and on a touch screen, not finding out at all. They are named
 * tiles now, in the same six-column grid the design specifies, and the name is
 * the button's accessible name rather than a tooltip.
 */
export function ColorPicker({ label, value, onChange, palette, labelHidden }: Props) {
  const clamped = wasClamped(value);
  const current = value.toLowerCase();

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className={labelHidden ? "sr-only" : "text-meta text-steel"}>{label}</span>
        <span className="font-mono text-micro tracking-[0.06em] text-steel tabular-nums">
          {value.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2.5 @md:grid-cols-6">
        {palette.map((p) => {
          const on = current === p.hex.toLowerCase();
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => onChange(p.hex)}
              aria-pressed={on}
              className="flex flex-col items-center gap-[7px]"
            >
              <span
                aria-hidden
                className={[
                  "h-[46px] w-full transition-shadow duration-[--dur-ui]",
                  on
                    ? ""
                    : "",
                ].join(" ")}
                style={{ background: p.hex }}
              />
              <span
                className={[
                  "text-center text-[0.71875rem] leading-tight",
                  on ? "font-medium text-ink" : "text-steel",
                ].join(" ")}
              >
                {p.name}
              </span>
            </button>
          );
        })}

        {/* Anything the palette does not cover. Same tile, dashed. */}
        <label className="flex cursor-pointer flex-col items-center gap-[7px]">
          <span
            aria-hidden
            className="grid h-[46px] w-full place-items-center border border-dashed border-rule-strong text-steel"
          >
            +
          </span>
          <span className="text-center text-[0.71875rem] leading-tight text-steel">
            Custom
          </span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
            aria-label={`${label} — custom colour`}
          />
        </label>
      </div>

      {clamped && (
        <p className="mt-3 flex items-start gap-2.5 text-meta leading-snug text-steel">
          <span
            aria-hidden
            className="mt-0.5 size-4 shrink-0 "
            style={{ background: achievable(value) }}
          />
          <span>{clampReason(value)}</span>
        </p>
      )}
    </div>
  );
}
