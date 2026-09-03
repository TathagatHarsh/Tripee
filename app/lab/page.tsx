import type { Metadata } from "next";
import { LabGrid } from "./LabGrid";

export const metadata: Metadata = {
  title: "Render lab — Makemycake",
  robots: { index: false, follow: false },
};

/**
 * Eleven very different cakes, side by side. Every time a material value or a
 * light changes, all eleven change at once — that is the difference between
 * converging in three days and flailing for two weeks.
 *
 * The judgement test, in order:
 *   1. Squint. Does the silhouette read as a cake?
 *   2. Would you eat it?
 *   3. Show three people with no context. Nobody should say "plastic" or "wax".
 *   4. Put it next to a real bakery photo. The gap is the next thing to fix.
 */
export default function LabPage() {
  return <LabGrid />;
}
