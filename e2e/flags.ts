/**
 * What the suite is allowed to assume is reachable.
 *
 * Phase 1 of the storefront redesign holds the 3D builder back behind
 * `NEXT_PUBLIC_BUILDER_ENABLED` (see lib/flags.ts), so every `/build/*` URL
 * answers with a Coming Soon page instead of a step. The tests that drive those
 * steps are not wrong and are not deleted — they describe a feature that is
 * still in the tree, complete, and one environment variable away from being
 * live again. They are *skipped*, so that turning the flag on turns them back
 * on with it and a regression in the builder cannot hide behind a deletion.
 *
 * Read the same variable the application reads. A suite with its own idea of
 * whether a feature is on is a suite that passes against a build where it is
 * off.
 */
export const BUILDER_ENABLED = process.env.NEXT_PUBLIC_BUILDER_ENABLED === "true";

/** The one-line reason a skipped builder test prints. */
export const BUILDER_HELD =
  "the 3D builder is held back for Phase 1 — set NEXT_PUBLIC_BUILDER_ENABLED=true";
