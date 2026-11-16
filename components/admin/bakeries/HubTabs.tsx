import Link from "next/link";
import { ActionItem, EmptyState, aBtn } from "@/components/admin/ui";
import { InviteLink } from "@/app/admin/vendors/InviteLink";
import { formatIST } from "@/lib/format";
import { telHref } from "@/lib/needsYou";
import type { VendorStage } from "@/lib/onboarding";
import type { bakeryStats, Cell, coverageGrid, missedAreas, pipelineGroups } from "@/lib/bakeriesHub";

/** The four tabs of the bakeries hub (/admin/vendors). Server components; data comes from lib/bakeriesHubData. */

const STAGE_LABEL: Record<VendorStage, string> = {
  ready_for_review: "Ready for review",
  setting_up: "Setting up",
  invited: "Invited",
  invite_expired: "Invite expired",
  paused: "Paused",
  live: "Live",
};
const STAGE_TONE: Record<VendorStage, "late" | "stuck" | "new" | "request"> = {
  ready_for_review: "new",
  setting_up: "request",
  invited: "request",
  invite_expired: "stuck",
  paused: "stuck",
  live: "request",
};
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const heading = "font-a-sans text-a-item font-semibold text-a-ink";

type Groups = ReturnType<typeof pipelineGroups>;

export function PipelineTab({ groups }: { groups: Groups }) {
  if (!groups.length) return <EmptyState icon="vendor" title="No bakeries yet: add one to get started" blurb="" />;
  const list = (g: Groups[number]) => (
    <div className="flex flex-col gap-2">
      {g.rows.map((r) => {
        const call = telHref(r.phone);
        const action =
          r.stage === "ready_for_review" ? (
            <Link href={`/admin/vendors/${r.id}`} className={aBtn("primary", "md")}>Review</Link>
          ) : r.stage === "invited" || r.stage === "invite_expired" ? (
            <InviteLink vendorId={r.id} />
          ) : r.stage !== "live" && call ? (
            <a href={call} className={aBtn("secondary", "md")}>Call</a>
          ) : null;
        return <ActionItem key={r.id} tone={STAGE_TONE[r.stage]} tag={STAGE_LABEL[r.stage]} title={r.name} href={`/admin/vendors/${r.id}`} detail={r.detail} action={action} />;
      })}
    </div>
  );
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) =>
        g.stage === "live" ? (
          <details key={g.stage}>
            <summary className={`${heading} min-h-11 cursor-pointer`}>Live bakeries ({g.rows.length})</summary>
            <div className="mt-2">{list(g)}</div>
          </details>
        ) : (
          <section key={g.stage} className="flex flex-col gap-2">
            <h2 className={heading}>{STAGE_LABEL[g.stage]} ({g.rows.length})</h2>
            {list(g)}
          </section>
        ),
      )}
    </div>
  );
}

function CellView({ label, cell }: { label: string; cell: Cell | null }) {
  if (!cell) return <span className="text-a-muted">{label} —</span>;
  return (
    <details data-gap={cell.gap ? "true" : "false"} className={cell.gap ? "text-a-bad-ink" : "text-a-ink"}>
      <summary className="min-h-11 cursor-pointer">
        {label} {cell.count}
        {cell.gap && cell.paused ? " (paused)" : ""}
      </summary>
      <p className="text-a-small text-a-muted">{cell.bakeries.length ? cell.bakeries.join(", ") : "No live bakery right now"}</p>
    </details>
  );
}

export function CakesTab({ grid, show }: { grid: ReturnType<typeof coverageGrid>; show: "gaps" | "all" }) {
  const cakes = show === "gaps" ? grid.cakes.filter((c) => c.sizes.some((s) => s.egg?.gap || s.eggless?.gap)) : grid.cakes;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-a-body text-a-ink">
        {plural(grid.gaps, "gap")} across {plural(grid.gapCakes, "cake")} · {grid.pauseGaps} caused by pauses
      </p>
      {!cakes.length ? (
        <EmptyState icon="check" title="No gaps: every cake has a bakery right now" blurb="" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cakes.map((c) => (
            <section key={c.productId} className="rounded-a border border-a-line bg-a-surface p-4">
              <h3 className={heading}>{c.name}</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {c.sizes.map((s) => (
                  <li key={s.sizeBand} className="grid grid-cols-[4rem_1fr_1fr] items-start gap-2 text-a-body">
                    <span className="font-medium">{s.sizeBand.replace(/\s*kg$/, " kg")}</span>
                    <CellView label="Egg" cell={s.egg} />
                    <CellView label="Eggless" cell={s.eggless} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function PerformanceTab({ rows, days }: { rows: ReturnType<typeof bakeryStats>; days: number }) {
  if (!rows.some((r) => r.offers > 0)) return <EmptyState icon="vendor" title="No offers in this window" blurb={`Nothing was offered to a bakery in the last ${days} days.`} />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map((r) => (
        <Link key={r.vendorId} href={`/admin/vendors/${r.vendorId}`} className="block rounded-a border border-a-line bg-a-surface p-4 hover:border-a-accent-line">
          <div className="flex items-center justify-between gap-2">
            <h3 className={heading}>{r.name}</h3>
            {r.flag && <span className="rounded-full bg-a-warn-wash px-2 py-0.5 text-a-small font-medium text-a-warn-ink">needs a chat · {r.flag}</span>}
          </div>
          {r.offers ? (
            <p className="mt-2 text-a-body text-a-muted">
              {plural(r.offers, "offer")} · accepted {r.acceptedPct}% · said no {r.declinedPct}% · didn&apos;t answer {r.ignoredPct}%
              {r.medianMin !== null ? ` · answers in ${r.medianMin} min` : ""}
              {r.latePct !== null ? ` · ${r.latePct}% late` : ""}
            </p>
          ) : (
            <p className="mt-2 text-a-body text-a-muted">No offers yet</p>
          )}
        </Link>
      ))}
    </div>
  );
}

export function AreasTab({ missed, reach, days }: { missed: ReturnType<typeof missedAreas>; reach: { name: string; address: string | null; radiusKm: number }[]; days: number }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className={heading}>Missed orders · last {days} days</h2>
        {!missed.length ? (
          <EmptyState icon="check" title="No missed orders in this window" blurb="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {missed.map((a) => (
              <li key={a.area} className="rounded-a border border-a-line bg-a-surface p-4 text-a-body">
                <p className="font-semibold text-a-ink">
                  {a.area} · {plural(a.count, "order")} missed
                </p>
                <p className="text-a-muted">
                  Last on {formatIST(a.last)} ·{" "}
                  {a.nearest ? `${a.nearest.name} · ${a.nearest.km} km (delivers up to ${a.nearest.radiusKm} km)` : "No live bakery"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-a-small text-a-muted">Addresses refused at checkout never become orders, so they are not counted here.</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={heading}>Live bakery reach</h2>
        <ul className="flex flex-col gap-1 text-a-body">
          {reach.map((b) => (
            <li key={b.name}>
              {b.name}
              {b.address ? ` · ${b.address}` : ""} · delivers up to {b.radiusKm} km
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
