import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { presetBySlug } from "@/lib/presets";
import { ShootStage } from "./ShootStage";

/**
 * One preset, on a stage, and nothing else on the page.
 *
 * `scripts/shoot-presets` walks every slug in `lib/presets` and photographs this
 * route, so the route exists for the script rather than for a visitor. It reads
 * the preset out of the same array the catalogue and the "Make it mine" button
 * read, which is what guarantees the photograph and the cake the builder loads
 * cannot drift apart: there is no second source of truth to drift from.
 */

/* A bare cake on an ivory rectangle is not a page anybody should arrive at from
   a search result. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ShootPreset({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const preset = presetBySlug(slug);
  if (!preset) notFound();

  return <ShootStage slug={preset.slug} config={preset.config} />;
}
