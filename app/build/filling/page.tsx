"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { FILLINGS } from "@/lib/catalog";
import { useConfig } from "@/lib/store";

export default function FillingStep() {
  const config = useConfig();

  return (
    <>
      <StepHeader title="What goes between" hint="Layered between every sponge." />

      <OptionGrid
        options={FILLINGS}
        label="Filling"
        selected={(c) => c.filling}
        patch={(filling) => ({ filling })}
      />

      {config.shape === "bundt" && (
        <p className="mt-5 rounded-card border border-rule bg-sunken px-4 py-3.5 text-meta leading-snug text-graphite">
          A bundt is baked in one piece in a ring mould, so there are no layers to
          fill. Your filling will be served alongside instead.
        </p>
      )}

      <ViolationCard field="filling" />
    </>
  );
}
