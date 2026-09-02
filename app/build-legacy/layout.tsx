import type { Metadata } from "next";
import { BuilderShell } from "./BuilderShell";

/**
 * THE PREVIOUS BUILDER, KEPT RUNNABLE.
 *
 * A copy of app/build as it stood before the redesign, with only its import
 * paths and its own route prefix rewritten, so the two designs can be opened
 * side by side at /build and /build-legacy and judged against each other rather
 * than from memory.
 *
 * It shares lib/ and components/three with the live builder on purpose. The
 * store, the pricing, the rules and the 3D scene are the product; only the
 * design is under review here, and a frozen copy of the *logic* would rot into
 * a second source of truth for prices.
 *
 * Delete this directory, components/builder-legacy and components/docket-legacy
 * once the new builder is settled. The exact original — Bundt included — is also
 * at the `builder-pre-redesign` tag and on the `builder-original` branch, so
 * deleting these three costs nothing.
 *
 * noindex because it is the same nine steps at a second set of URLs, and a
 * crawler has no way to know which of the two is the real product.
 */
export const metadata: Metadata = {
  title: "Build your cake (previous design) — Makemycake",
  robots: { index: false, follow: false },
};

export default function BuildLegacyLayout({ children }: { children: React.ReactNode }) {
  return <BuilderShell>{children}</BuilderShell>;
}
