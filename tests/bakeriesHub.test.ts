import { describe, expect, it } from "vitest";
import {
  bakeryStats,
  coverageGrid,
  missedAreas,
  parseDays,
  parseTab,
  pipelineGroups,
  type OfferRow,
  type PipelineRow,
} from "../lib/bakeriesHub";

const now = new Date("2026-11-16T08:00:00Z");
const DAY = 86_400_000;
const min = (m: number) => m * 60_000;

describe("parse", () => {
  it("tabs and windows fall back to defaults", () => {
    expect(parseTab("cakes")).toBe("cakes");
    expect(parseTab("x")).toBe("pipeline");
    expect(parseTab(undefined)).toBe("pipeline");
    expect(parseDays("7")).toBe(7);
    expect(parseDays("5")).toBe(30);
    expect(parseDays(undefined)).toBe(30);
  });
});

const row = (over: Partial<PipelineRow>): PipelineRow => ({
  id: "v1", name: "Sweet Crumbs", phone: "9876543210", stage: "live",
  steps: { location: true, cakes: true, details: true, done: 4 },
  inviteExpiresAt: null, availableVariants: 18, ordersToday: 3, ...over,
});

describe("pipelineGroups", () => {
  it("orders stages, words details and omits empty groups", () => {
    const groups = pipelineGroups(
      [
        row({ id: "a", stage: "live" }),
        row({ id: "b", stage: "setting_up", steps: { location: false, cakes: false, details: true, done: 2 } }),
        row({ id: "c", stage: "invited", inviteExpiresAt: new Date(now.getTime() + 5 * DAY) }),
        row({ id: "d", stage: "ready_for_review" }),
      ],
      now,
    );
    expect(groups.map((g) => g.stage)).toEqual(["ready_for_review", "setting_up", "invited", "live"]);
    expect(groups[0].rows[0].detail).toBe("4 of 4 done · 18 cakes");
    expect(groups[1].rows[0].detail).toBe("Needs: pin, cakes");
    expect(groups[2].rows[0].detail).toBe("Invite sent 2 days ago");
    expect(groups[3].rows[0].detail).toBe("3 orders today · taking orders");
  });
});

describe("coverageGrid", () => {
  const cakes = [
    { productId: "p1", name: "Truffle", variants: [{ sizeBand: "1kg", eggType: "egg" as const }, { sizeBand: "1kg", eggType: "eggless" as const }] },
    { productId: "p2", name: "Mango", variants: [{ sizeBand: "1kg", eggType: "eggless" as const }] },
  ];
  const r = (vendorName: string, productId: string, eggType: "egg" | "eggless", pausedUntil: Date | null = null, isAvailable = true) =>
    ({ vendorName, productId, sizeBand: "1kg", eggType, isAvailable, pausedUntil });

  it("counts live bakeries per egg type, marks a missing egg type null and a zero as a gap", () => {
    const g = coverageGrid(cakes, [r("A", "p1", "egg"), r("B", "p1", "egg")], now);
    const truffle = g.cakes.find((c) => c.productId === "p1")!.sizes[0];
    expect(truffle.egg).toMatchObject({ count: 2, gap: false, bakeries: ["A", "B"] });
    expect(truffle.eggless).toMatchObject({ count: 0, gap: true, paused: false });
    expect(g.cakes.find((c) => c.productId === "p2")!.sizes[0].egg).toBeNull();
  });

  it("pause-caused gap", () => {
    const g = coverageGrid([cakes[1]], [r("A", "p2", "eggless", new Date(now.getTime() + DAY))], now);
    expect(g.cakes[0].sizes[0].eggless).toMatchObject({ count: 0, gap: true, paused: true });
    expect(g).toMatchObject({ gaps: 1, gapCakes: 1, pauseGaps: 1 });
  });

  it("no live bakeries: every offered type is a gap", () => {
    const g = coverageGrid(cakes, [], now);
    expect(g.gaps).toBe(3);
    expect(g.gapCakes).toBe(2);
    expect(g.pauseGaps).toBe(0);
  });
});

describe("bakeryStats", () => {
  const offer = (state: OfferRow["state"], answerMin: number | null, over: Partial<OfferRow> = {}): OfferRow => ({
    vendorId: "v1", vendorName: "Sweet Crumbs", state,
    offeredAt: new Date(now.getTime() - DAY), respondedAt: answerMin === null ? null : new Date(now.getTime() - DAY + min(answerMin)),
    handedOverAt: null, due: null, ...over,
  });
  const vendors = [{ id: "v1", name: "Sweet Crumbs" }];

  it("pending offers excluded from rates", () => {
    const [s] = bakeryStats([offer("ACCEPTED", 2), offer("ACCEPTED", 4), offer("REJECTED", 30), offer("OFFERED", null)], vendors);
    expect(s).toMatchObject({ offers: 4, acceptedPct: 67, declinedPct: 33, ignoredPct: 0, medianMin: 4 });
  });

  it("late share counts accepted handovers after the due time", () => {
    const due = new Date(now.getTime() - DAY + 3 * 3600_000);
    const late = new Date(due.getTime() + min(20));
    const early = new Date(due.getTime() - min(20));
    const [s] = bakeryStats(
      [offer("ACCEPTED", 2, { due, handedOverAt: late }), ...[1, 2, 3].map(() => offer("ACCEPTED", 2, { due, handedOverAt: early }))],
      vendors,
    );
    expect(s.latePct).toBe(25);
  });

  it("flags with the first matching reason, only at 5+ offers", () => {
    const tenOffers = [
      ...["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED"].map((s) => offer(s as OfferRow["state"], 2)),
      ...["REJECTED", "REJECTED", "REJECTED", "EXPIRED", "EXPIRED"].map((s) => offer(s as OfferRow["state"], s === "EXPIRED" ? null : 2)),
    ];
    expect(bakeryStats(tenOffers, vendors)[0].flag).toBe("accepts 5 in 10 offers");
    expect(bakeryStats([...Array(5)].map(() => offer("ACCEPTED", 12)), vendors)[0].flag).toBe("answers in 12 min");
    const due = new Date(now.getTime());
    const lateRows = [...Array(10)].map((_, i) => offer("ACCEPTED", 2, { due, handedOverAt: new Date(due.getTime() + (i < 2 ? min(5) : -min(5))) }));
    expect(bakeryStats(lateRows, vendors)[0].flag).toBe("2 in 10 late");
    expect(bakeryStats([...Array(4)].map(() => offer("REJECTED", 30)), vendors)[0].flag).toBeNull();
  });

  it("a bakery with no offers is listed, unflagged", () => {
    const s = bakeryStats([], [{ id: "v9", name: "Quiet Oven" }]);
    expect(s[0]).toMatchObject({ name: "Quiet Oven", offers: 0, flag: null, medianMin: null });
  });
});

describe("missedAreas", () => {
  const live = [
    { name: "Sweet Crumbs", latitude: 17.43, longitude: 78.4, serviceRadiusKm: 10 },
    { name: "Far Oven", latitude: 17.9, longitude: 78.9, serviceRadiusKm: 10 },
  ];
  it("groups by pincode, then locality, then coordinates, sorted by count, with the nearest live bakery", () => {
    const out = missedAreas(
      [
        { pincode: "500034", location: { latitude: 17.5, longitude: 78.4 }, createdAt: new Date(now.getTime() - DAY) },
        { pincode: "500034", location: { latitude: 17.5, longitude: 78.4 }, createdAt: now },
        { pincode: null, location: { locality: "Kondapur", latitude: 17.46, longitude: 78.36 }, createdAt: now },
        { pincode: null, location: { latitude: 17.123, longitude: 78.456 }, createdAt: now },
      ],
      live,
    );
    expect(out.map((a) => a.area)).toEqual(["500034", "Kondapur", "near 17.12, 78.46"]);
    expect(out[0]).toMatchObject({ count: 2, last: now, located: true });
    expect(out[0].nearest).toMatchObject({ name: "Sweet Crumbs", radiusKm: 10 });
    expect(Number.isInteger(Math.round(out[0].nearest!.km * 10))).toBe(true);
  });

  it("missedAreas with no location", () => {
    expect(missedAreas([{ pincode: null, location: null, createdAt: now }], live)[0]).toMatchObject({ area: "Unknown area", located: false, nearest: null });
  });

  it("no live bakeries: nearest is null", () => {
    expect(missedAreas([{ pincode: "1", location: { latitude: 17.4, longitude: 78.4 }, createdAt: now }], [])[0].nearest).toBeNull();
  });
});
