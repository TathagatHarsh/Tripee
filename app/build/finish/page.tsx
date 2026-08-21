"use client";

import { ColorPicker } from "@/components/builder/ColorPicker";
import { OptionGrid } from "@/components/builder/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { DRIP_PALETTE, FINISHES, FROSTING_PALETTE } from "@/lib/catalog";
import { deltaFor } from "@/lib/pricing";
import { blockerFor } from "@/lib/rules";
import { formatDelta } from "@/lib/format";
import { FROSTING_MATERIALS } from "@/components/three/materials";
import { useConfig, useSetConfig } from "@/lib/store";

export default function FinishStep() {
  const config = useConfig();
  const set = useSetConfig();

  const fixedColour = FROSTING_MATERIALS[config.frosting].fixedColor;
  const dripBlocked = blockerFor(config, { hasDrip: true });
  const dripOff = !!dripBlocked && !config.hasDrip;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader
          title="Colour, finish and drip"
          hint="The part everyone photographs."
        />

        {fixedColour ? (
          <p className="rounded-card border border-rule bg-sunken px-4 py-3.5 text-meta leading-snug text-graphite">
            Ganache is chocolate and cream — its colour comes from the chocolate, so
            there is nothing to tint. Pick a different frosting if you want a colour.
          </p>
        ) : (
          <>
            <GroupHeader
              title="Frosting colour"
              hint="Pulled to shades a kitchen can actually mix."
            />
            <ColorPicker
              label="Frosting colour"
              labelHidden
              value={config.frostingColor}
              onChange={(frostingColor) => set({ frostingColor })}
              palette={FROSTING_PALETTE}
            />
          </>
        )}
      </div>

      <fieldset>
        <GroupHeader title="Finish" hint="How the surface is worked once it is on." />
        <OptionGrid
          options={FINISHES}
          label="Finish"
          columns={3}
          selected={(c) => c.finish}
          patch={(finish) => ({ finish })}
        />
      </fieldset>

      <fieldset>
        <GroupHeader title="Drip" hint="Poured over the top edge and left to run." />

        <label
          className={[
            "flex min-h-11 cursor-pointer items-start gap-3 rounded-card border px-4 py-3.5",
            "transition-[background-color,border-color,box-shadow] duration-[--dur-ui] ease-[--ease-out]",
            config.hasDrip
              ? "border-ink bg-paper shadow-elev-1"
              : dripOff
                ? "cursor-not-allowed border-dashed border-seal/50 bg-counter"
                : "border-rule bg-paper hover:border-rule-strong",
          ].join(" ")}
        >
          <input
            type="checkbox"
            checked={config.hasDrip}
            disabled={dripOff}
            onChange={(e) => set({ hasDrip: e.target.checked })}
            className="mt-1 size-[18px] shrink-0 accent-ink"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className={`text-item font-medium ${dripOff ? "text-steel" : "text-ink"}`}>
                Chocolate drip
              </span>
              <span className="shrink-0 font-mono text-micro font-bold text-brass tabular-nums">
                {formatDelta(deltaFor(config, { hasDrip: !config.hasDrip }))}
              </span>
            </span>
            <span className="mt-1 block text-meta leading-snug text-steel">
              Poured warm at the rim so it runs a little way down the side.
            </span>
            {dripBlocked && (
              <span className="mt-1.5 block text-meta leading-snug text-seal">
                {dripBlocked.message}
              </span>
            )}
          </span>
        </label>

        {config.hasDrip && (
          <div className="mt-5">
            <ColorPicker
              label="Drip colour"
              value={config.dripColor ?? "#3B2318"}
              onChange={(dripColor) => set({ dripColor })}
              palette={DRIP_PALETTE}
            />
          </div>
        )}
      </fieldset>

      <ViolationCard />
    </div>
  );
}
