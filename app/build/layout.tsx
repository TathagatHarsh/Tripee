import type { Metadata } from "next";
import Link from "next/link";
import { CatalogSync } from "@/components/CatalogSync";
import { BuilderComingSoon } from "@/components/shop/BuilderComingSoon";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { BUILDER_ENABLED } from "@/lib/flags";
import { sBtn } from "@/lib/shopUi";
import { BuilderShell } from "./BuilderShell";

export const metadata: Metadata = {
  title: BUILDER_ENABLED
    ? "Build your cake — Makemycake"
    : "3D Cake Builder — coming soon — Makemycake",
  /* An unfinished feature is not a page to rank. When the flag goes back on,
     this becomes the builder's own metadata again with no further edit. */
  robots: BUILDER_ENABLED ? undefined : { index: false, follow: true },
};

/**
 * The builder's layout, and — for this phase — its gate.
 *
 * ## Why the gate is here and nowhere else
 *
 * All nine steps (`/build/shape` … `/build/review`) and the entry route
 * (`/build`, which reads `?preset=` and redirects) are children of this layout.
 * A layout runs before its children on every one of them, so one branch here is
 * one answer to "can a customer get into the builder", for every URL, including
 * the ones somebody has bookmarked or typed. Gating the homepage's links
 * instead would have been theatre: the steps would still render for anybody who
 * knew an address.
 *
 * Deliberately NOT in `proxy.ts`. That file's own comment explains why it holds
 * no authorisation of its own — a gate that runs before a route is a gate that
 * can be routed around, which is the shape of CVE-2025-29927 — and the same
 * argument applies to a feature flag. The check belongs inside the thing being
 * gated.
 *
 * Deliberately NOT `notFound()` or a `redirect()` either. The brief asks for a
 * controlled "Coming Soon" state rather than a deletion, and a 404 tells a
 * customer the feature does not exist when the truth is that it is not open
 * yet. Every builder URL now answers with the same page saying so.
 *
 * ## What is preserved
 *
 * Everything. `BuilderShell`, the nine step pages, `components/builder/*`,
 * `components/three/*`, `lib/store.ts`, `lib/rules.ts` and the rest are
 * untouched by this phase — this file gained a branch and nothing else lost a
 * line. Setting `NEXT_PUBLIC_BUILDER_ENABLED=true` restores the previous
 * behaviour exactly: the two statements below the branch are the whole of what
 * this layout used to be. See lib/flags.
 */
export default async function BuildLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await getCatalogSnapshot();

  if (!BUILDER_ENABLED) return <Held bakery={snapshot.bakery} />;

  /*
   * The one place the builder gets its prices.
   *
   * All nine steps are client components and none of them can read a database,
   * so the catalogue is fetched here — the only Server Component on the path —
   * and handed to the store before anything under it renders. CatalogSync comes
   * first in the tree for that reason: it seeds during render, so the pickers
   * and the running total below it never see the shipped defaults at all.
   */
  return (
    <>
      <CatalogSync snapshot={snapshot} />
      <BuilderShell>{children}</BuilderShell>
    </>
  );
}

/**
 * What every `/build/*` URL answers with while the feature is held back.
 *
 * `children` is deliberately not rendered. Returning the steps behind a banner
 * would leave the builder usable to anybody who scrolled, and would still mount
 * a WebGL context and the whole Three.js bundle to do it.
 */
function Held({ bakery }: { bakery: Awaited<ReturnType<typeof getCatalogSnapshot>>["bakery"] }) {
  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-10 sm:px-6 lg:px-10 lg:py-16">
          <BuilderComingSoon />

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link href="/shop" className={sBtn("primary", "lg")}>
              Shop cakes
            </Link>
            <Link href="/" className={sBtn("outline", "lg")}>
              Back to the shop front
            </Link>
          </div>
        </div>
      </main>
      <ShopFooter bakery={bakery} />
    </div>
  );
}
