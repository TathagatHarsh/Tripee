import { describe, expect, it } from "vitest";
import {
  attemptLines,
  bakeryLine,
  callBakeryPhone,
  hasLegacyFilters,
  parseView,
  viewWhere,
  type Attempt,
} from "../lib/orderViews";
import { formatIST } from "../lib/format";

const now = new Date("2026-11-16T08:00:00Z"); // 13:30 IST
const ago = (m: number) => new Date(now.getTime() - m * 60_000);

const attempt = (over: Partial<Attempt>): Attempt => ({
  vendorName: "Sweet Crumbs",
  vendorPhone: "+91 98765 43210",
  state: "OFFERED",
  production: "assigned",
  sequence: 0,
  offeredAt: ago(5),
  respondedAt: null,
  expiresAt: null,
  rejectionReason: null,
  ...over,
});

describe("parseView", () => {
  it("accepts known views and falls back to needs", () => {
    expect(parseView("today")).toBe("today");
    expect(parseView("x")).toBe("needs");
    expect(parseView(undefined)).toBe("needs");
    expect(parseView(["upcoming"])).toBe("upcoming");
  });
});

describe("hasLegacyFilters", () => {
  it("is true for any old filter param and false otherwise", () => {
    expect(hasLegacyFilters({ status: "confirmed" })).toBe(true);
    expect(hasLegacyFilters({ days: "7" })).toBe(true);
    expect(hasLegacyFilters({ view: "today", q: "riya" })).toBe(false);
    expect(hasLegacyFilters({ status: "" })).toBe(false);
  });
});

describe("viewWhere", () => {
  const start = new Date("2026-11-15T18:30:00Z");
  const end = new Date("2026-11-16T18:30:00Z");

  it("today covers the IST calendar day and excludes cancelled", () => {
    const w = JSON.stringify(viewWhere("today", now));
    expect(w).toContain(start.toISOString());
    expect(w).toContain(end.toISOString());
    expect(w).toContain("cancelled");
    expect(w).toContain("dueAt");
    expect(w).toContain("requestedFor");
  });

  it("upcoming starts at the next IST midnight and excludes delivered and cancelled", () => {
    const w = JSON.stringify(viewWhere("upcoming", now));
    expect(w).toContain(end.toISOString());
    expect(w).not.toContain(start.toISOString());
    expect(w).toContain("delivered");
    expect(w).toContain("cancelled");
  });
});

describe("bakeryLine", () => {
  const confirmed = { status: "confirmed" as const, cancellationReason: null };

  it("first pending offer: finding a bakery", () => {
    expect(bakeryLine(confirmed, [attempt({})], now)).toBe("finding a bakery");
  });

  it("second try counts attempts", () => {
    const a = [attempt({ state: "REJECTED", sequence: 0, vendorName: "Cocoa Lane" }), attempt({ sequence: 1 })];
    expect(bakeryLine(confirmed, a, now)).toBe("finding a bakery (2nd try)");
  });

  it("accepted and baking: bakery · stage", () => {
    const a = [attempt({ state: "ACCEPTED", production: "in_preparation" })];
    expect(bakeryLine({ status: "in_kitchen", cancellationReason: null }, a, now)).toBe("Sweet Crumbs · baking");
  });

  it("cancelled after every bakery declined", () => {
    const a = [attempt({ state: "REJECTED" }), attempt({ state: "EXPIRED", sequence: 1 })];
    expect(bakeryLine({ status: "cancelled", cancellationReason: "No bakery near you can make this order in time" }, a, now)).toBe(
      "No bakery could take it",
    );
  });

  it("draft with no attempts: waiting for confirmation", () => {
    expect(bakeryLine({ status: "draft", cancellationReason: null }, [], now)).toBe("waiting for confirmation");
  });

  it("otherwise empty", () => {
    expect(bakeryLine(confirmed, [], now)).toBe("");
  });
});

describe("attemptLines", () => {
  it("words each state, oldest first", () => {
    const responded = ago(30);
    const lines = attemptLines(
      [
        attempt({ sequence: 2, state: "OFFERED", offeredAt: ago(5) }),
        attempt({ sequence: 0, state: "REJECTED", vendorName: "Cocoa Lane", rejectionReason: "out of mango", respondedAt: responded }),
        attempt({ sequence: 1, state: "EXPIRED", vendorName: "Oven Co", expiresAt: ago(15) }),
      ],
      now,
    );
    expect(lines[0]).toBe(`Cocoa Lane said no (out of mango) · ${formatIST(responded)}`);
    expect(lines[1]).toContain("Oven Co didn't answer in time · ");
    expect(lines[2]).toBe("Offered to Sweet Crumbs · waiting 5 min");
  });

  it("accepted reads Accepted by X", () => {
    const at = ago(10);
    expect(attemptLines([attempt({ state: "ACCEPTED", respondedAt: at })], now)).toEqual([`Accepted by Sweet Crumbs · ${formatIST(at)}`]);
  });

  it("attemptLines keeps cancelled attempts in sequence", () => {
    const lines = attemptLines(
      [attempt({ sequence: 0, state: "REJECTED", vendorName: "A", respondedAt: ago(40) }), attempt({ sequence: 1, state: "CANCELLED", vendorName: "B" })],
      now,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("A said no");
    expect(lines[1]).toContain("B");
  });
});

describe("callBakeryPhone", () => {
  it("prefers the accepted bakery", () => {
    const a = [attempt({ state: "REJECTED", vendorPhone: "111" }), attempt({ state: "ACCEPTED", sequence: 1, vendorPhone: "222" })];
    expect(callBakeryPhone(a)).toBe("222");
  });

  it("callBakeryPhone picks latest offered when none holds", () => {
    const a = [attempt({ state: "OFFERED", sequence: 0, vendorPhone: "111" }), attempt({ state: "CANCELLED", sequence: 1, vendorPhone: "333" }), attempt({ state: "OFFERED", sequence: 2, vendorPhone: "222" })];
    expect(callBakeryPhone(a)).toBe("222");
    expect(callBakeryPhone([attempt({ state: "REJECTED", sequence: 0, vendorPhone: "111" }), attempt({ state: "CANCELLED", sequence: 1, vendorPhone: "333" })])).toBe("333");
  });

  it("blank phone is null", () => {
    expect(callBakeryPhone([attempt({ state: "ACCEPTED", vendorPhone: "  " })])).toBeNull();
    expect(callBakeryPhone([])).toBeNull();
  });
});
