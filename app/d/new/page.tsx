import Link from "next/link";
import type { Metadata } from "next";
import { CakePreview } from "@/components/CakePreview";
import { LoadConfig } from "@/components/builder/LoadConfig";
import { PriceBreakdown } from "@/components/docket/PriceBreakdown";
import { decodeConfig } from "@/lib/share";
import { titleCase } from "@/lib/format";
import { priceCake } from "@/lib/pricing";
import { btn, eyebrow } from "@/lib/ui";

export const metadata: Metadata = {
  title: "A shared cake — Makemycake",
  robots: { index: false, follow: false },
};

/** A design carried entirely in the URL — no database row, no expiry. */
export default async function InlineDesign({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const config = c ? decodeConfig(c) : null;

  if (!config) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-24 text-center">
        <h1 className="text-heading">That link didn&rsquo;t survive the journey</h1>
        <p className="text-body leading-relaxed text-steel">
          Cake designs travel in the address bar, and something trimmed this one.
          Ask whoever sent it to share it again, or build your own.
        </p>
        <Link href="/build/shape" className={btn("primary", "md")}>
          Build one
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <Link href="/" className="font-mono text-meta font-medium tracking-[0.2em]">
        MAKEMYCAKE
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="cake-stage overflow-hidden p-6">
          <div className="aspect-square">
            <CakePreview config={config} autoRotate />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <span className={eyebrow}>Carried in the link</span>
          <h1 className="text-heading">
            {titleCase(config.sponge)}, {config.size}
          </h1>
          <p className="text-body leading-relaxed text-steel">
            {titleCase(config.frosting)} · {titleCase(config.finish)} finish
          </p>

          <div className="border border-rule bg-paper p-5 ">
            <PriceBreakdown price={priceCake(config)} />
          </div>

          <div>
            <LoadConfig config={config} label="Open in the builder" variant="primary" />
          </div>
        </div>
      </div>
    </main>
  );
}
