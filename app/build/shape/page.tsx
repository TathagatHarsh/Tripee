"use client";

import { OptionGrid } from "@/components/builder/OptionGrid";
import { StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { offeredOrSelected } from "@/lib/catalogSnapshot";
import { useCatalog } from "@/lib/catalogStore";
import { useConfig } from "@/lib/store";

export default function ShapeStep() {
  const config = useConfig();
  const catalog = useCatalog();
  const shapes = offeredOrSelected(catalog, "shape", config.shape);
  return (
    <>
      <StepHeader
        title="Choose a shape"
        hint="The silhouette everything else is built on."
      />
      <OptionGrid
        options={shapes}
        label="Shape"
        columns={3}
        selected={(c) => c.shape}
        patch={(shape) => ({ shape })}
      />
      <ViolationCard field="shape" />
    </>
  );
}
