import { describe, expect, it } from "vitest";
import type { OrderStatus, VendorOrderStatus } from "@prisma/client";
import {
  deliveryCounts, deliveryDayOf, DELIVERY_DAY_LABEL, DELIVERY_STATE_LABEL,
  isCakeReady, isSameISTDay, istDayOffset, matchesDeliveryState, startOfISTDay,
  type DeliveryDay, type DeliveryState, type DeliveryView,
} from "@/lib/ops";
import { NEXT_STATUS } from "@/lib/orders";
import { VENDOR_NEXT } from "@/lib/vendors";

/**
 * The delivery board's rules, settled without a database, a session or a clock.
 *
 * The sibling of tests/ops.test.ts, and pure for the same reason: every function
 * here takes `now` as an argument, so "which day does this cake go out on"
 * becomes a table rather than something only observable at the right moment of a
 * Tuesday afternoon.
 *
 * What this cannot prove is that app/admin/data.ts hands these functions the
 * right rows — that is a property of code against a live Postgres, which this
 * repository has no harness for. What is testable is every decision that harness
 * would be checking.
 */

/* 09:00 IST on 13 September 2026, which is 03:30 UTC the same day. */
const NOW = new Date("2026-09-13T03:30:00Z");

/** `h` hours from NOW. Negative is in the past. */
const off = (h: number) => new Date(NOW.getTime() + h * 3600_000);

describe("the Hyderabad day", () => {
  /*
   * §8. The server runs in UTC and the bakery does not, and the gap is not
   * academic: 5.5 hours is wide enough that a cake due late in a working evening
   * and one due just after midnight land on different UTC dates from the IST
   * ones somebody is working to.
   */
  it("puts a late-evening delivery on today, not tomorrow", () => {
    // 22:00 IST on the 13th is 16:30 UTC on the 13th.
    expect(deliveryDayOf(new Date("2026-09-13T16:30:00Z"), NOW)).toBe("today");
  });

  it("puts a midnight-slot delivery on tomorrow, not today", () => {
    /*
     * 00:30 IST on the 14th is 19:00 UTC on the **13th**. A server comparing UTC
     * dates would file this under today, report it missed at the end of the day,
     * and leave it off tomorrow morning's run — the exact failure §8 names.
     * `midnight` is a real slot in this product.
     */
    const due = new Date("2026-09-13T19:00:00Z");
    expect(due.getUTCDate()).toBe(13);
    expect(deliveryDayOf(due, NOW)).toBe("tomorrow");
  });

  it("puts an early-morning delivery on today, not yesterday", () => {
    // 02:00 IST on the 13th is 20:30 UTC on the 12th.
    const due = new Date("2026-09-12T20:30:00Z");
    expect(due.getUTCDate()).toBe(12);
    expect(deliveryDayOf(due, NOW)).toBe("today");
  });

  it("counts whole days, not elapsed hours", () => {
    // Thirty hours past 09:00 IST is 15:00 IST tomorrow — one day, not two.
    expect(istDayOffset(off(30), NOW)).toBe(1);
    // Six hours before it is 03:00 the same morning.
    expect(istDayOffset(off(-6), NOW)).toBe(0);
  });

  it("agrees with isSameISTDay wherever they overlap", () => {
    for (const h of [-40, -12, -1, 0, 1, 12, 40]) {
      expect(istDayOffset(off(h), NOW) === 0, `${h}h`).toBe(isSameISTDay(off(h), NOW));
    }
  });

  it("starts the day at midnight IST", () => {
    // 00:00 IST on the 13th is 18:30 UTC on the 12th.
    expect(startOfISTDay(NOW).toISOString()).toBe("2026-09-12T18:30:00.000Z");
  });

  it("buckets every offset into exactly one day", () => {
    const cases: [number, DeliveryDay][] = [
      [-72, "past"], [-24, "past"], [-1, "past"],
      [0, "today"], [1, "tomorrow"], [2, "upcoming"], [30, "upcoming"],
    ];
    for (const [days, expected] of cases) {
      const due = new Date(startOfISTDay(NOW).getTime() + days * 86_400_000 + 3600_000);
      expect(deliveryDayOf(due, NOW), `${days}d`).toBe(expected);
    }
  });

  it("names every day", () => {
    for (const d of ["today", "tomorrow", "upcoming", "past"] as DeliveryDay[]) {
      expect(DELIVERY_DAY_LABEL[d], d).toBeTruthy();
    }
  });
});

describe("whether the cake exists", () => {
  /*
   * Read off the vendor machine, which is the only one that knows. Derived from
   * VENDOR_NEXT rather than listed, so a state added between `ready` and
   * `handed_over` fails here instead of quietly counting as not-baked.
   */
  it("is true for exactly the states after the bakery has finished", () => {
    const ready = (Object.keys(VENDOR_NEXT) as VendorOrderStatus[]).filter(isCakeReady);
    expect(ready.sort()).toEqual(["handed_over", "ready"]);
  });

  it("treats an order no bakery holds as not ready", () => {
    // Not "unknown". Nobody is making it, which is the honest reading.
    expect(isCakeReady(null)).toBe(false);
  });

  it("treats a declined or withdrawn assignment as not ready", () => {
    expect(isCakeReady("rejected")).toBe(false);
    expect(isCakeReady("withdrawn")).toBe(false);
  });
});

/* ------------------------------------------------------------- the filters */

const row = (over: Partial<DeliveryView> = {}): DeliveryView => ({
  status: "confirmed",
  vendorStatus: "in_preparation",
  attention: [],
  ...over,
});

describe("the delivery state filters", () => {
  it("names every state", () => {
    const all: DeliveryState[] = [
      "all", "ready", "not_ready", "out_for_delivery", "delivered", "attention",
    ];
    for (const s of all) expect(DELIVERY_STATE_LABEL[s], s).toBeTruthy();
  });

  it("shows a finished cake that has not left as ready", () => {
    const r = row({ status: "in_kitchen", vendorStatus: "ready" });
    expect(matchesDeliveryState(r, "ready")).toBe(true);
    expect(matchesDeliveryState(r, "not_ready")).toBe(false);
  });

  it("shows an order still being made as not ready", () => {
    const r = row({ vendorStatus: "in_preparation" });
    expect(matchesDeliveryState(r, "not_ready")).toBe(true);
    expect(matchesDeliveryState(r, "ready")).toBe(false);
  });

  it("counts an order with no bakery as not ready", () => {
    expect(matchesDeliveryState(row({ vendorStatus: null }), "not_ready")).toBe(true);
  });

  it("stops calling a delivered cake ready", () => {
    /*
     * The bug this partition exists to prevent. `handed_over` stays on the
     * assignment forever, so "the cake exists" is true of an order delivered last
     * Tuesday — and a Ready filter that listed it would have somebody looking for
     * a box that left the building days ago.
     */
    const done = row({ status: "delivered", vendorStatus: "handed_over" });
    expect(matchesDeliveryState(done, "ready")).toBe(false);
    expect(matchesDeliveryState(done, "not_ready")).toBe(false);
    expect(matchesDeliveryState(done, "delivered")).toBe(true);
  });

  it("puts an order on the road in neither ready bucket", () => {
    const out = row({ status: "out_for_delivery", vendorStatus: "handed_over" });
    expect(matchesDeliveryState(out, "ready")).toBe(false);
    expect(matchesDeliveryState(out, "not_ready")).toBe(false);
    expect(matchesDeliveryState(out, "out_for_delivery")).toBe(true);
  });

  it("partitions every order into exactly one of the four buckets", () => {
    /*
     * The property the counts depend on: ready + not_ready + out + delivered is
     * the whole board, with no order counted twice and none dropped. Walked over
     * every OrderStatus and every VendorOrderStatus rather than a handful, so a
     * value added to either enum is checked here.
     */
    const buckets: DeliveryState[] = ["ready", "not_ready", "out_for_delivery", "delivered"];

    for (const status of Object.keys(NEXT_STATUS) as OrderStatus[]) {
      /* Cancelled orders never reach a delivery board — they are excluded in the
         query itself, §26 — so they are not part of this partition. */
      if (status === "cancelled") continue;

      for (const vendorStatus of [null, ...(Object.keys(VENDOR_NEXT) as VendorOrderStatus[])]) {
        const r = row({ status, vendorStatus });
        const hit = buckets.filter((b) => matchesDeliveryState(r, b));
        expect(hit, `${status} / ${vendorStatus}`).toHaveLength(1);
      }
    }
  });

  it("lets attention cut across the other four", () => {
    // An order can be out for delivery *and* past its window. The board has to be
    // able to say both, which is why this is not a fifth bucket.
    const late = row({ status: "out_for_delivery", attention: ["overdue"] });
    expect(matchesDeliveryState(late, "attention")).toBe(true);
    expect(matchesDeliveryState(late, "out_for_delivery")).toBe(true);
  });

  it("passes everything through on `all`", () => {
    expect(matchesDeliveryState(row({ status: "delivered" }), "all")).toBe(true);
    expect(matchesDeliveryState(row({ status: "draft" }), "all")).toBe(true);
  });
});

describe("the day at a glance", () => {
  const day: DeliveryView[] = [
    row({ status: "confirmed", vendorStatus: "in_preparation" }),
    row({ status: "in_kitchen", vendorStatus: "in_preparation" }),
    row({ status: "in_kitchen", vendorStatus: "ready" }),
    row({ status: "out_for_delivery", vendorStatus: "handed_over" }),
    row({ status: "delivered", vendorStatus: "handed_over" }),
    row({ status: "confirmed", vendorStatus: null, attention: ["unassigned"] }),
    row({ status: "confirmed", vendorStatus: "accepted", attention: ["due_soon"] }),
  ];

  it("counts each figure off the same rows", () => {
    expect(deliveryCounts(day)).toEqual({
      total: 7,
      ready: 1,
      notReady: 4,
      preparing: 3,
      outForDelivery: 1,
      delivered: 1,
      attention: 2,
    });
  });

  it("keeps the four buckets adding up to the total", () => {
    const c = deliveryCounts(day);
    expect(c.ready + c.notReady + c.outForDelivery + c.delivered).toBe(c.total);
  });

  it("counts only the orders a bakery is actually working on as preparing", () => {
    /*
     * "Not ready" and "being made" are different mornings. An order nobody has
     * been given is the first and not the second, and the gap between the two
     * numbers is what the attention list is for.
     */
    const c = deliveryCounts([
      row({ vendorStatus: null }),
      row({ vendorStatus: "accepted" }),
      row({ vendorStatus: "in_preparation" }),
    ]);
    expect(c.notReady).toBe(3);
    expect(c.preparing).toBe(2);
  });

  it("answers an empty day with zeroes rather than nothing", () => {
    expect(deliveryCounts([])).toEqual({
      total: 0, ready: 0, notReady: 0, preparing: 0,
      outForDelivery: 0, delivered: 0, attention: 0,
    });
  });
});
