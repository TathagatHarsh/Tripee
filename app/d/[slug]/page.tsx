import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CakePreview } from "@/components/CakePreview";
import { LoadConfig } from "@/components/builder/LoadConfig";
import { PriceBreakdown } from "@/components/docket/PriceBreakdown";
import { db, hasDatabase } from "@/lib/db";
import { allergenLine } from "@/lib/allergens";
import { formatINR, titleCase } from "@/lib/format";
import { priceCake } from "@/lib/pricing";
import { migrateConfig } from "@/lib/schema";
import { deriveHandling, servingsLabel } from "@/lib/servings";
import { btn, eyebrow } from "@/lib/ui";

async function load(slug: string) {
  if (!hasDatabase()) return null;
  const design = await db.design.findUnique({ where: { slug } });
  if (!design) return null;
  const config = migrateConfig(design.config);
  return config ? { design, config } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug).catch(() => null);
  if (!found) return { title: "Design not found — Makemycake" };

  const c = found.config;
  return {
    title: `${titleCase(c.size)} ${titleCase(c.sponge)} cake — Makemycake`,
    description: `${titleCase(c.frosting)}, ${titleCase(c.finish)} finish. ${formatINR(priceCake(c).total)} including GST.`,
  };
}

export default async function SharedDesign({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();

  const { config } = found;
  const price = priceCake(config);
  const handling = deriveHandling(config);

  // Views are interesting and nobody is harmed if one is lost to a race.
  db.design.update({ where: { slug }, data: { views: { increment: 1 } } }).catch(() => {});

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <Link href="/" className="font-mono text-meta font-bold tracking-[0.2em]">
        MAKEMYCAKE
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="cake-stage cake-panel overflow-hidden rounded-panel p-6">
          <div className="aspect-square">
            <CakePreview config={config} autoRotate />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <span className={eyebrow}>A saved design</span>
          <h1 className="text-heading">
            {titleCase(config.sponge)}, {config.size}
          </h1>
          <p className="text-body leading-relaxed text-steel">
            {titleCase(config.frosting)} · {titleCase(config.coverage)} coverage ·{" "}
            {titleCase(config.finish)} finish
            {config.tiers > 1 ? ` · ${config.tiers} tiers` : ""}
          </p>

          {config.message?.trim() && (
            <p className="text-body">
              Plaque reads{" "}
              <span className="font-medium">&ldquo;{config.message.trim()}&rdquo;</span>
            </p>
          )}

          <div className="rounded-panel border border-rule bg-paper p-5 shadow-elev-1">
            <PriceBreakdown price={price} />
          </div>

          <div className="flex flex-col gap-1.5 font-mono text-micro leading-relaxed text-steel">
            <p>{allergenLine(config)}</p>
            <p>
              {servingsLabel(config)} · {handling.storage} · best before{" "}
              {handling.bestBefore}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <LoadConfig config={config} label="Make this one mine" variant="primary" />
            <Link href="/build/shape" className={btn("secondary", "md")}>
              Start from scratch
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
