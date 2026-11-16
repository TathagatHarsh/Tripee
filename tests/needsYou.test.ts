import { describe, expect, it } from "vitest";
import {
  classifyNeedsYou,
  glance,
  parseOnly,
  type NeedsYouInput,
  type NeedsYouOrder,
} from "@/lib/needsYou";

const now = new Date("2026-11-16T08:00:00Z"); // 13:30 IST
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const ahead = (min: number) => new Date(now.getTime() + min * 60_000);

const asg = (over: Partial<NonNullable<NeedsYouOrder["assignment"]>> = {}) => ({
  vendorName: "Sweet Oven",
  vendorPhone: "+91 98765 43210",
  production: "in_preparation" as const,
  state: "ACCEPTED" as const,
  respondedAt: null,
  expiresAt: null,
  rejectionReason: null,
  ...over,
});

const order = (over: Partial<NeedsYouOrder> = {}): NeedsYouOrder => ({
  ref: "MMC-1",
  status: "confirmed",
  due: ahead(600),
  createdAt: ago(60),
  title: "Mango cake",
  paymentLabel: null,
  customerPhone: "+91 90000 11111",
  assignment: asg(),
  ...over,
});

const run = (over: Partial<NeedsYouInput>) =>
  classifyNeedsYou({ orders: [], liveBakeries: 2, reviews: [], quotes: [], followUps: [], ...over }, now);

describe("late", () => {
  it("late order whose offer was rejected or expired falls back to Assign", () => {
    for (const state of ["REJECTED", "EXPIRED", "CANCELLED"] as const) {
      const { items } = run({ orders: [order({ due: ago(5), assignment: asg({ state }) })] });
      expect(items[0]).toMatchObject({ category: "late", detail: "No bakery yet", action: { label: "Assign" } });
    }
  });

  it("late in_kitchen order nobody holds opens the order instead of Assign", () => {
    const { items } = run({ orders: [order({ status: "in_kitchen", due: ago(5), assignment: null })] });
    expect(items[0]).toMatchObject({ category: "late", detail: "Baking", action: { label: "Open order", href: "/admin/orders/MMC-1" } });
    const out = run({ orders: [order({ status: "out_for_delivery", due: ago(5), assignment: null })] });
    expect(out.items[0]).toMatchObject({ detail: "Out for delivery", action: { label: "Open order" } });
  });

  it("order items link to the order", () => {
    expect(run({ orders: [order({ due: ago(5) })] }).items[0].href).toBe("/admin/orders/MMC-1");
  });

  it("confirmed order due 20 min ago", () => {
    const { items } = run({ orders: [order({ due: ago(20) })] });
    expect(items[0]).toMatchObject({
      category: "late",
      tag: "Late · 20 min",
      detail: "Sweet Oven · baking",
      action: { kind: "link", href: "tel:919876543210", label: "Call bakery" },
    });
  });

  it("2h59m is urgent, 3h00m is not", () => {
    expect(run({ orders: [order({ due: ahead(179) })] }).items[0]).toMatchObject({ category: "late", tag: "Due in 2 h" });
    expect(run({ orders: [order({ due: ahead(180) })] }).items).toHaveLength(0);
  });

  it("late and unassigned appears once, under late, with Assign", () => {
    const { items } = run({ orders: [order({ due: ago(5), assignment: null })] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: "late",
      detail: "No bakery yet",
      action: { href: "/admin/orders/MMC-1#assign", label: "Assign" },
    });
  });

  it("stage words", () => {
    const d = (o: Partial<NeedsYouOrder>) => run({ orders: [order({ due: ago(5), ...o })] }).items[0].detail;
    expect(d({ assignment: asg({ production: "ready" }) })).toBe("Sweet Oven · ready, not sent");
    expect(d({ status: "out_for_delivery" })).toBe("Sweet Oven · out for delivery");
  });

  it("out for delivery is only late once actually late", () => {
    expect(run({ orders: [order({ status: "out_for_delivery", due: ahead(30) })] }).items).toHaveLength(0);
  });

  it("orders without a due time are never late", () => {
    expect(run({ orders: [order({ due: null })] }).items).toHaveLength(0);
    expect(run({ orders: [order({ due: null, assignment: null })] }).items[0].category).toBe("stuck");
  });

  it("blank phone falls back to Open order", () => {
    const { items } = run({ orders: [order({ due: ago(5), assignment: asg({ vendorPhone: "  " }) })] });
    expect(items[0].action).toEqual({ kind: "link", href: "/admin/orders/MMC-1", label: "Open order" });
  });
});

describe("stuck", () => {
  it("a cancelled assignment shows No bakery rather than dropping the order", () => {
    const { items } = run({ orders: [order({ assignment: asg({ state: "CANCELLED" }) })] });
    expect(items[0]).toMatchObject({ category: "stuck", tag: "No bakery" });
  });

  it("no bakery, expired, rejected", () => {
    const { items } = run({
      orders: [
        order({ ref: "A", assignment: null }),
        order({ ref: "B", assignment: asg({ state: "EXPIRED", expiresAt: ago(12) }) }),
        order({ ref: "C", assignment: asg({ state: "REJECTED", rejectionReason: "out of mango" }) }),
      ],
    });
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(by["stuck:A"]).toMatchObject({ tag: "No bakery", action: { label: "Assign" } });
    expect(by["stuck:B"].tag).toBe("Offer expired 12 min ago");
    expect(by["stuck:C"]).toMatchObject({ tag: "Rejected", action: { label: "Reassign" } });
    expect(by["stuck:C"].detail).toContain("out of mango");
  });

  it("no live bakery: stuck omitted", () => {
    const r = run({ liveBakeries: 0, orders: [order({ assignment: null })] });
    expect(r.items).toHaveLength(0);
    expect(r.counts.stuck).toBe(0);
  });
});

describe("new and requests", () => {
  it("draft order", () => {
    const { items } = run({ orders: [order({ status: "draft", createdAt: ago(4), paymentLabel: "UPI", assignment: null })] });
    expect(items[0].detail).toBe("Placed 4 min ago · UPI");
    expect(items[0].action).toEqual({ kind: "confirm", ref: "MMC-1", label: "Confirm" });
    expect(items[0].secondary).toMatchObject({ href: "tel:919000011111", label: "Call" });
  });

  it("review, quote, follow-up links", () => {
    const { items } = run({
      reviews: [{ vendorId: "v1", name: "Oven", createdAt: ago(3) }],
      quotes: [{ id: "q1", title: "Photo cake", createdAt: ago(2) }],
      followUps: [{ id: "f1", kind: "refund", label: "MMC-9", createdAt: ago(1) }],
    });
    expect(items.map((i) => i.action)).toEqual([
      { kind: "link", href: "/admin/vendors/v1", label: "Review" },
      { kind: "link", href: "/admin/custom-requests", label: "Quote" },
      { kind: "link", href: "/admin/payments", label: "Follow up" },
    ]);
  });
});

describe("ordering and totals", () => {
  it("categories in order, earlier due first within late", () => {
    const r = run({
      reviews: [{ vendorId: "v1", name: "Oven", createdAt: ago(3) }],
      orders: [
        order({ ref: "D", status: "draft", assignment: null }),
        order({ ref: "S", assignment: null }),
        order({ ref: "L2", due: ago(5) }),
        order({ ref: "L1", due: ago(50) }),
      ],
    });
    expect(r.items.map((i) => i.key)).toEqual(["late:L1", "late:L2", "stuck:S", "new:D", "review:v1"]);
  });

  it("total equals items and sum of counts", () => {
    const r = run({ liveBakeries: 0, orders: [order({ assignment: null }), order({ ref: "X", status: "draft" })] });
    expect(r.total).toBe(r.items.length);
    expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(r.total);
  });
});

describe("glance", () => {
  it("counts across IST midnight, excludes cancelled", () => {
    const g = glance(
      {
        todays: [
          { status: "confirmed", totalPaise: 100, createdAt: new Date("2026-11-15T18:20:00Z") },
          { status: "confirmed", totalPaise: 200, createdAt: new Date("2026-11-15T18:35:00Z") },
          { status: "cancelled", totalPaise: 400, createdAt: new Date("2026-11-15T18:40:00Z") },
        ],
        baking: 1,
        outForDelivery: 2,
        liveBakeries: 2,
        activeBakeries: 3,
      },
      now,
    );
    expect(g).toEqual({ ordersToday: 1, bakingNow: 1, outForDelivery: 2, liveBakeries: "2 of 3", revenueTodayPaise: 200 });
  });
});

describe("parseOnly", () => {
  it("maps values", () => {
    expect(parseOnly("late")).toBe("late");
    expect(parseOnly("bogus")).toBe("all");
    expect(parseOnly(undefined)).toBe("all");
    expect(parseOnly(["new"])).toBe("new");
  });
});
