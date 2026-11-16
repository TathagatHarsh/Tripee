import type { AssignmentStatus } from "@prisma/client";
import { haversine, pointFrom } from "./assignmentRules";
import { isOfferable } from "./inventoryRules";
import type { VendorStage } from "./onboarding";

/**
 * The bakeries hub's maths: onboarding groups, cake coverage, bakery
 * performance and missed areas. Pure, so every number on /admin/vendors is
 * unit-tested; lib/bakeriesHubData.ts feeds it.
 */

export type HubTab = "pipeline" | "cakes" | "performance" | "areas";
const TABS: HubTab[] = ["pipeline", "cakes", "performance", "areas"];
const first = (p: string | string[] | undefined) => (Array.isArray(p) ? p[0] : p);

export function parseTab(p: string | string[] | undefined): HubTab {
  const v = first(p);
  return TABS.includes(v as HubTab) ? (v as HubTab) : "pipeline";
}

export function parseDays(p: string | string[] | undefined): 7 | 30 | 90 {
  const v = Number(first(p));
  return v === 7 || v === 90 ? v : 30;
}

const DAY_MS = 86_400_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- Pipeline ----

export type PipelineRow = {
  id: string;
  name: string;
  phone: string | null;
  stage: VendorStage;
  steps: { location: boolean; cakes: boolean; details: boolean; done: number };
  inviteExpiresAt: Date | null;
  availableVariants: number;
  ordersToday: number;
};

const STAGE_ORDER: VendorStage[] = ["ready_for_review", "setting_up", "invited", "invite_expired", "paused", "live"];
const INVITE_DAYS = 7;

function detail(r: PipelineRow, now: Date): string {
  switch (r.stage) {
    case "ready_for_review":
      return `${r.steps.done} of 4 done · ${plural(r.availableVariants, "cake")}`;
    case "setting_up": {
      const missing = [!r.steps.location && "pin", !r.steps.cakes && "cakes", !r.steps.details && "details"].filter(Boolean);
      return `Needs: ${missing.join(", ")}`;
    }
    case "invited": {
      if (!r.inviteExpiresAt) return "Invite sent";
      const days = Math.max(0, Math.floor((now.getTime() - (r.inviteExpiresAt.getTime() - INVITE_DAYS * DAY_MS)) / DAY_MS));
      return days === 0 ? "Invite sent today" : `Invite sent ${plural(days, "day")} ago`;
    }
    case "invite_expired":
      return "Invite expired";
    case "paused":
      return "Not taking orders";
    case "live":
      return `${plural(r.ordersToday, "order")} today · taking orders`;
  }
}

export function pipelineGroups(rows: PipelineRow[], now: Date) {
  return STAGE_ORDER.map((stage) => ({
    stage,
    rows: rows.filter((r) => r.stage === stage).map((r) => ({ ...r, detail: detail(r, now) })),
  })).filter((g) => g.rows.length > 0);
}

// ---- Cakes coverage ----

type Egg = "egg" | "eggless";
export type CoverageCake = { productId: string; name: string; variants: { sizeBand: string; eggType: Egg }[] };
/** One VendorInventory row of a live bakery. */
export type CoverageRow = { vendorName: string; productId: string; sizeBand: string; eggType: Egg; isAvailable: boolean; pausedUntil: Date | null };
export type Cell = { count: number; bakeries: string[]; gap: boolean; paused: boolean };

export function coverageGrid(cakes: CoverageCake[], rows: CoverageRow[], now: Date) {
  let gaps = 0;
  let pauseGaps = 0;
  let gapCakes = 0;
  const cell = (productId: string, sizeBand: string, eggType: Egg): Cell => {
    const matching = rows.filter((r) => r.productId === productId && r.sizeBand === sizeBand && r.eggType === eggType);
    const bakeries = matching.filter((r) => isOfferable(r, now)).map((r) => r.vendorName).sort();
    const paused = matching.some((r) => r.isAvailable && !!r.pausedUntil && r.pausedUntil > now);
    const gap = bakeries.length === 0;
    if (gap) gaps++;
    if (gap && paused) pauseGaps++;
    return { count: bakeries.length, bakeries, gap, paused };
  };
  const out = cakes.map((c) => {
    const sizes = [...new Set(c.variants.map((v) => v.sizeBand))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const before = gaps;
    const row = {
      productId: c.productId,
      name: c.name,
      sizes: sizes.map((sizeBand) => {
        const has = (e: Egg) => c.variants.some((v) => v.sizeBand === sizeBand && v.eggType === e);
        return { sizeBand, egg: has("egg") ? cell(c.productId, sizeBand, "egg") : null, eggless: has("eggless") ? cell(c.productId, sizeBand, "eggless") : null };
      }),
    };
    if (gaps > before) gapCakes++;
    return row;
  });
  return { cakes: out, gaps, gapCakes, pauseGaps };
}

// ---- Performance ----

export type OfferRow = {
  vendorId: string;
  vendorName: string;
  state: AssignmentStatus;
  offeredAt: Date | null;
  respondedAt: Date | null;
  handedOverAt: Date | null;
  due: Date | null;
};

const MIN_OFFERS_TO_FLAG = 5;
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function bakeryStats(rows: OfferRow[], vendors: { id: string; name: string }[]) {
  const names = new Map(vendors.map((v) => [v.id, v.name]));
  for (const r of rows) if (!names.has(r.vendorId)) names.set(r.vendorId, r.vendorName);
  return [...names.entries()]
    .map(([vendorId, name]) => {
      const mine = rows.filter((r) => r.vendorId === vendorId);
      const count = (s: AssignmentStatus) => mine.filter((r) => r.state === s).length;
      const accepted = count("ACCEPTED");
      const declined = count("REJECTED");
      const ignored = count("EXPIRED");
      const decided = accepted + declined + ignored;
      const answers = mine
        .filter((r) => (r.state === "ACCEPTED" || r.state === "REJECTED") && r.offeredAt && r.respondedAt)
        .map((r) => (r.respondedAt!.getTime() - r.offeredAt!.getTime()) / 60_000);
      const m = median(answers);
      const handed = mine.filter((r) => r.state === "ACCEPTED" && r.handedOverAt && r.due);
      const latePct = handed.length ? pct(handed.filter((r) => r.handedOverAt! > r.due!).length, handed.length) : null;
      const acceptedPct = pct(accepted, decided);
      const medianMin = m === null ? null : Math.round(m);
      let flag: string | null = null;
      if (mine.length >= MIN_OFFERS_TO_FLAG) {
        if (decided && acceptedPct < 60) flag = `accepts ${Math.round(acceptedPct / 10)} in 10 offers`;
        else if (medianMin !== null && medianMin > 10) flag = `answers in ${medianMin} min`;
        else if (latePct !== null && latePct > 10) flag = `${Math.round(latePct / 10)} in 10 late`;
      }
      return { vendorId, name, offers: mine.length, acceptedPct, declinedPct: pct(declined, decided), ignoredPct: pct(ignored, decided), medianMin, latePct, flag };
    })
    .sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || b.offers - a.offers);
}

// ---- Areas ----

export type MissedOrder = { pincode: string | null; location: unknown; createdAt: Date };
export type LiveBakery = { name: string; latitude: number | null; longitude: number | null; serviceRadiusKm: number };

const round2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

function areaOf(o: MissedOrder): string {
  if (o.pincode?.trim()) return o.pincode.trim();
  const locality = (o.location as { locality?: unknown } | null)?.locality;
  if (typeof locality === "string" && locality.trim()) return locality.trim();
  const p = pointFrom(o.location);
  return p ? `near ${round2(p.lat)}, ${round2(p.lng)}` : "Unknown area";
}

export function missedAreas(orders: MissedOrder[], live: LiveBakery[]) {
  const groups = new Map<string, MissedOrder[]>();
  for (const o of orders) groups.set(areaOf(o), [...(groups.get(areaOf(o)) ?? []), o]);
  return [...groups.entries()]
    .map(([area, list]) => {
      const latest = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const at = latest.map((o) => pointFrom(o.location)).find(Boolean) ?? null;
      let nearest: { name: string; km: number; radiusKm: number } | null = null;
      if (at) {
        for (const b of live) {
          const p = pointFrom(b);
          if (!p) continue;
          const km = Math.round(haversine(at, p) * 10) / 10;
          if (!nearest || km < nearest.km) nearest = { name: b.name, km, radiusKm: b.serviceRadiusKm };
        }
      }
      return { area, count: list.length, last: latest[0].createdAt, nearest };
    })
    .sort((a, b) => b.count - a.count || b.last.getTime() - a.last.getTime());
}

// ---- Tabs row ----

const TAB_LABEL: Record<HubTab, string> = { pipeline: "Pipeline", cakes: "Cakes", performance: "Performance", areas: "Areas" };

/** The hub's tab chips, shaped for components/admin/Filters' FilterChips. A non-default window carries over between Performance and Areas. */
export function hubChips(tab: HubTab, days: 7 | 30 | 90 = 30): { label: string; href: string; active: boolean }[] {
  return TABS.map((t) => {
    const keep = days !== 30 && (t === "performance" || t === "areas");
    return { label: TAB_LABEL[t], href: `/admin/vendors?tab=${t}${keep ? `&days=${days}` : ""}`, active: t === tab };
  });
}
