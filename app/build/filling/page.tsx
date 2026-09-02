"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { FILLINGS } from "@/lib/catalog";
import { useConfig } from "@/lib/store";
import { btn } from "@/lib/ui";
import { useView } from "@/lib/view";

export default function FillingStep() {
  const config = useConfig();
  const sliced = useView((s) => s.sliced);
  const toggleSlice = useView((s) => s.toggleSlice);

  /* A bundt is baked in one piece, so there is no gap and nothing to look into. */
  const hasGaps = config.shape !== "bundt";

  return (
    <>
      <StepHeader title="Between the layers" hint="One filling, spread into every gap in the stack." />

      {/*
        The filling is the one choice you cannot see from outside the cake, which
        is the whole reason the section is the default view. This says so at the
        moment it matters, and drives the same `sliced` flag the render reads —
        not a second copy of the state.

        The canvas already carries this control, so the wording here is the
        canvas's wording exactly. Two placements of one control is defensible on
        a step where the canvas button scrolls out of reach on a phone; two NAMES
        for one control is not, and would have been the more expensive mistake.
      */}
      {hasGaps && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-rule bg-sunken px-4 py-3.5">
          <p className="max-w-[46ch] text-meta leading-snug text-graphite">
            {sliced
              ? "The cake is cut open. Whatever you pick below is what shows in the cross-section."
              : "The cake is whole, so the filling is hidden. Cut a slice and you can see the gap you are filling."}
          </p>
          <button
            type="button"
            onClick={toggleSlice}
            aria-pressed={sliced}
            className={btn("secondary", "md", "shrink-0")}
          >
            {sliced ? "Whole cake" : "Cut a slice"}
          </button>
        </div>
      )}

      <OptionGrid
        options={FILLINGS}
        label="Filling"
        selected={(c) => c.filling}
        patch={(filling) => ({ filling })}
      />

      {!hasGaps && (
        <p className="mt-5 border border-rule bg-sunken px-4 py-3.5 text-meta leading-snug text-graphite">
          A bundt is baked in one piece in a ring mould, so there are no layers to
          fill. Your filling will be served alongside instead.
        </p>
      )}

      <ViolationCard field="filling" />
    </>
  );
}
