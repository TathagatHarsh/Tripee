"use client";

import { OptionGrid } from "@/components/builder-legacy/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder-legacy/StepHeader";
import { ViolationCard } from "@/components/builder-legacy/ViolationCard";
import { SPONGES } from "@/lib/catalog";
import { useConfig, useSetConfig } from "@/lib/store";

export default function SpongeStep() {
  const config = useConfig();
  const set = useSetConfig();

  return (
    <div className="flex flex-col gap-7">
      <StepHeader
        title="The sponge layers"
        hint="Every layer is baked from this one. It is what people taste first."
      />

      {/*
        Dietary sits ABOVE the fourteen sponges, not below them.

        The controls column scrolls on its own and the page does not, so there is
        no scrollbar to suggest anything follows the grid. Measured at 1440, 768
        and 375, this fieldset landed between 1351px and 1884px down the column —
        never on screen at any width — for the two controls on this step that
        carry an allergen and change the price.

        Eggless is our default rather than an upsell, and a default nobody can
        find is not a default. Two rows before the grid is the whole cost.
      */}
      <fieldset>
        <GroupHeader title="Dietary" hint="Both are separate bakes, so both change the price." />
        <div className="grid gap-2.5 @md:grid-cols-2">
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

      <OptionGrid
        options={SPONGES}
        label="Sponge"
        selected={(c) => c.sponge}
        patch={(sponge) => ({ sponge })}
      />

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
        "flex min-h-11 cursor-pointer items-start gap-3 border px-4 py-3.5",
        "transition-[background-color,border-color,box-shadow] duration-[--dur-ui] ease-[--ease-out]",
        checked
          ? "border-ink bg-paper "
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
