"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
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
