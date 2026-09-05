"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { offeredOrSelected } from "@/lib/catalogSnapshot";
import { useCatalog } from "@/lib/catalogStore";
import { useConfig } from "@/lib/store";

export default function FrostingStep() {
  const config = useConfig();
  const catalog = useCatalog();
  const frostings = offeredOrSelected(catalog, "frosting", config.frosting);
  const coverages = offeredOrSelected(catalog, "coverage", config.coverage);
  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader
          title="The outer coat"
          hint="Decides how it holds, cuts and shines."
        />
        <OptionGrid
          options={frostings}
          label="Frosting"
          selected={(c) => c.frosting}
          patch={(frosting) => ({ frosting })}
        />
      </div>

      <fieldset>
        <GroupHeader title="Coverage" hint="How much of the sponge the frosting hides." />
        <OptionGrid
          options={coverages}
          label="Coverage"
          selected={(c) => c.coverage}
          patch={(coverage) => ({ coverage })}
        />
      </fieldset>

      <ViolationCard />
    </div>
  );
}
