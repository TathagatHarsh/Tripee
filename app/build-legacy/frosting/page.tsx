"use client";

import { OptionGrid } from "@/components/builder-legacy/OptionGrid";
import { GroupHeader, StepHeader } from "@/components/builder-legacy/StepHeader";
import { ViolationCard } from "@/components/builder-legacy/ViolationCard";
import { COVERAGES, FROSTINGS } from "@/lib/catalog";

export default function FrostingStep() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepHeader
          title="The outer coat"
          hint="Decides how it holds, cuts and shines."
        />
        <OptionGrid
          options={FROSTINGS}
          label="Frosting"
          selected={(c) => c.frosting}
          patch={(frosting) => ({ frosting })}
        />
      </div>

      <fieldset>
        <GroupHeader title="Coverage" hint="How much of the sponge the frosting hides." />
        <OptionGrid
          options={COVERAGES}
          label="Coverage"
          selected={(c) => c.coverage}
          patch={(coverage) => ({ coverage })}
        />
      </fieldset>

      <ViolationCard />
    </div>
  );
}
