"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { SPONGES } from "@/lib/catalog";
import { useConfig, useSetConfig } from "@/lib/store";

export default function SpongeStep() {
  const config = useConfig();
  const set = useSetConfig();

  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader
          title="The cake itself"
          hint="This is what people taste first."
        />
        <OptionGrid
          options={SPONGES}
          label="Sponge"
          selected={(c) => c.sponge}
          patch={(sponge) => ({ sponge })}
        />
      </div>

      <fieldset>
        <GroupHeader title="Dietary" hint="Both are separate bakes, so both change the price." />
        <div className="flex flex-col gap-2.5">
          <DietOption
            label="Eggless"
            blurb="Our default. The crumb is slightly denser and holds moisture better."
            checked={config.eggless}
            onChange={(eggless) => set({ eggless })}
          />
          <DietOption
            label="Sugar-free"
            blurb="Sweetened with stevia and dates. Separate batch, so it costs more."
            checked={config.sugarFree}
            onChange={(sugarFree) => set({ sugarFree })}
          />
        </div>
      </fieldset>

      <ViolationCard />
    </div>
  );
}

function DietOption({
  label, blurb, checked, onChange,
}: {
  label: string;
  blurb: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-card border px-4 py-3.5",
        "transition-[background-color,border-color,box-shadow] duration-[--dur-ui] ease-[--ease-out]",
        checked
          ? "border-ink bg-paper shadow-elev-1"
          : "border-rule bg-paper hover:border-rule-strong",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-[18px] shrink-0 accent-ink"
      />
      <span className="min-w-0">
        <span className="block text-item font-medium">{label}</span>
        <span className="mt-1 block text-meta leading-snug text-steel">{blurb}</span>
      </span>
    </label>
  );
}
