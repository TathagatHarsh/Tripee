import type { Metadata } from "next";
import { CatalogSync } from "@/components/CatalogSync";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { BuilderShell } from "./BuilderShell";

export const metadata: Metadata = {
  title: "Build your cake — Makemycake",
};

/**
 * The one place the builder gets its prices.
 *
 * All nine steps are client components and none of them can read a database,
 * so the catalogue is fetched here — the only Server Component on the path —
 * and handed to the store before anything under it renders. CatalogSync comes
 * first in the tree for that reason: it seeds during render, so the pickers and
 * the running total below it never see the shipped defaults at all.
 */
export default async function BuildLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await getCatalogSnapshot();

  return (
    <>
      <CatalogSync snapshot={snapshot} />
      <BuilderShell>{children}</BuilderShell>
    </>
  );
}
