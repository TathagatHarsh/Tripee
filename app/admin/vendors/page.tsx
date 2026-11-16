import { requireAdmin } from "@/lib/auth";
import type { Metadata } from "next";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { aBtn, Card, CardHead, Notice, PageHeader } from "@/components/admin/ui";
import { FilterChips, type Chip } from "@/components/admin/Filters";
import { AreasTab, CakesTab, PerformanceTab, PipelineTab } from "@/components/admin/bakeries/HubTabs";
import { hubChips, parseDays, parseTab } from "@/lib/bakeriesHub";
import { loadAreas, loadCoverage, loadPerformance, loadPipeline } from "@/lib/bakeriesHubData";
import { VendorForm } from "./VendorForms";

/**
 * The bakeries hub: Pipeline (onboarding by stage), Cakes (which cakes no live
 * bakery makes right now), Performance (who answers, who is late) and Areas
 * (where orders were missed). Only the open tab's loader runs.
 */

export const metadata: Metadata = {
  title: "Vendors — Admin — MakeYourCakes",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

const windowChips = (tab: "performance" | "areas", days: number): Chip[] =>
  [7, 30, 90].map((d) => ({ label: `${d} days`, href: `/admin/vendors?tab=${tab}&days=${d}`, active: d === days }));

async function TabBody({ tab, days, show }: { tab: ReturnType<typeof parseTab>; days: 7 | 30 | 90; show: string | undefined }) {
  switch (tab) {
    case "pipeline":
      return <PipelineTab groups={await loadPipeline()} />;
    case "cakes": {
      const grid = await loadCoverage();
      const mode = show === "all" || show === "gaps" ? show : grid.gaps ? "gaps" : "all";
      const chips: Chip[] = [
        { label: "Gaps only", href: "/admin/vendors?tab=cakes&show=gaps", active: mode === "gaps" },
        { label: "All cakes", href: "/admin/vendors?tab=cakes&show=all", active: mode === "all" },
      ];
      return (
        <div className="flex flex-col gap-4">
          <FilterChips label="Which cakes" chips={chips} />
          <CakesTab grid={grid} show={mode} />
        </div>
      );
    }
    case "performance":
      return (
        <div className="flex flex-col gap-4">
          <FilterChips label="Window" chips={windowChips("performance", days)} />
          <PerformanceTab rows={await loadPerformance(days)} days={days} />
        </div>
      );
    case "areas": {
      const { missed, reach } = await loadAreas(days);
      return (
        <div className="flex flex-col gap-4">
          <FilterChips label="Window" chips={windowChips("areas", days)} />
          <AreasTab missed={missed} reach={reach} days={days} />
        </div>
      );
    }
  }
}

export default async function VendorsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin();
  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Vendors" />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const days = parseDays(sp.days);
  const show = Array.isArray(sp.show) ? sp.show[0] : sp.show;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Vendors" blurb="The bakeries that make the cakes: who is setting up, what they cover and how they are doing." />

      <details>
        <summary className={aBtn("secondary", "md", "w-fit cursor-pointer list-none")}>Add bakery</summary>
        <Card flush className="mt-3">
          <CardHead title="Add a bakery" note="Name and mobile are required. The mobile is where the invite link goes." />
          <VendorForm />
        </Card>
      </details>

      <FilterChips label="Bakeries hub" chips={hubChips(tab, days)} />
      <TabBody tab={tab} days={days} show={show} />
    </div>
  );
}
