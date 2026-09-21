import type { Metadata } from "next";
import { CatalogGroupPage } from "../GroupPage";

/**
 * Add-ons. The whole page is ../GroupPage — see the note there on why three routes
 * share one component.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add-ons — Admin",
  robots: { index: false, follow: false },
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return <CatalogGroupPage slug="addons" searchParams={searchParams} />;
}
