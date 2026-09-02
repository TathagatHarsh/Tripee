"use client";

import { OptionGrid } from "@/components/builder-legacy/OptionGrid";
import { StepHeader } from "@/components/builder-legacy/StepHeader";
import { ViolationCard } from "@/components/builder-legacy/ViolationCard";
import { SHAPES } from "@/lib/catalog";

export default function ShapeStep() {
  return (
    <>
      <StepHeader
        title="Choose a shape"
        hint="The silhouette everything else is built on."
      />
      <OptionGrid
        options={SHAPES}
        label="Shape"
        columns={3}
        selected={(c) => c.shape}
        patch={(shape) => ({ shape })}
      />
      <ViolationCard field="shape" />
    </>
  );
}
