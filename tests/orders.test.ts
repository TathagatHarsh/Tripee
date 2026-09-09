import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import {
  ACTION_LABEL, buildTimeline, canTransition, isClosed, NEXT_STATUS, STATUS_LABEL,
} from "@/lib/orders";

const ALL = Object.keys(NEXT_STATUS) as OrderStatus[];

describe("order status machine", () => {
  it("walks a docket from placed to delivered", () => {
    const path: OrderStatus[] = [
      "draft", "confirmed", "in_kitchen", "out_for_delivery", "delivered",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("never moves a docket backwards", () => {
    // A cake that has left the kitchen cannot be un-baked, and a board people
    // trust is one where a row never quietly regresses.
    const order: OrderStatus[] = [
      "draft", "confirmed", "in_kitchen", "out_for_delivery", "delivered",
    ];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(canTransition(order[i], order[j]), `${order[i]} -> ${order[j]}`).toBe(false);
      }
    }
  });

  it("lets anything still open be cancelled, and nothing closed", () => {
    for (const s of ALL) {
      expect(canTransition(s, "cancelled"), s).toBe(!isClosed(s));
    }
  });

  it("treats delivered and cancelled as terminal", () => {
    expect(isClosed("delivered")).toBe(true);
    expect(isClosed("cancelled")).toBe(true);
    expect(NEXT_STATUS.delivered).toEqual([]);
    expect(NEXT_STATUS.cancelled).toEqual([]);
  });

  it("never offers a transition to a status it cannot name", () => {
    // Adding a status to the enum without labelling it would otherwise ship a
    // button with an empty face.
    for (const s of ALL) {
      expect(STATUS_LABEL[s], `STATUS_LABEL.${s}`).toBeTruthy();
      expect(ACTION_LABEL[s], `ACTION_LABEL.${s}`).toBeTruthy();
    }
  });

  it("only ever offers transitions to real statuses", () => {
    for (const s of ALL) {
      for (const next of NEXT_STATUS[s]) {
        expect(ALL, `${s} -> ${next}`).toContain(next);
      }
    }
  });
});

describe("an order's timeline", () => {
  const PLACED = new Date("2026-09-08T08:26:00.000Z");
  const at = (min: number) => new Date(PLACED.getTime() + min * 60_000);

  it("starts at the moment the order was placed", () => {
    const [first] = buildTimeline(PLACED, []);
    expect(first.label).toBe("Order placed");
    expect(first.at).toEqual(PLACED);
  });

  it("invents nothing for an order with no recorded events", () => {
    /*
     * The whole point of the "never fabricate history" rule. Every order placed
     * before OrderEvent existed was confirmed, baked and delivered by people
     * who wrote none of it down, and a timeline that filled those in from the
     * current status would be fiction on a page an owner uses to answer a
     * customer.
     */
    expect(buildTimeline(PLACED, [])).toHaveLength(1);
  });

  it("names each move the way the board names that state", () => {
    const timeline = buildTimeline(PLACED, [
      { toStatus: "confirmed", createdAt: at(6), actorName: "Priya" },
      { toStatus: "in_kitchen", createdAt: at(19), actorName: null },
    ]);
    expect(timeline.map((t) => t.label)).toEqual([
      "Order placed", STATUS_LABEL.confirmed, STATUS_LABEL.in_kitchen,
    ]);
    expect(timeline[1].actorName).toBe("Priya");
    // Null when the account that moved it has since been removed — the event
    // survives having lost the name attached to it.
    expect(timeline[2].actorName).toBeNull();
  });

  it("reads oldest first however the events arrive", () => {
    // The query orders these already; a function that quietly depended on that
    // would render a history out of sequence the first time somebody changed it.
    const timeline = buildTimeline(PLACED, [
      { toStatus: "delivered", createdAt: at(400), actorName: null },
      { toStatus: "confirmed", createdAt: at(6), actorName: null },
      { toStatus: "out_for_delivery", createdAt: at(300), actorName: null },
    ]);
    const times = timeline.map((t) => t.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(timeline.at(-1)?.label).toBe(STATUS_LABEL.delivered);
  });

  it("does not mutate the events it was handed", () => {
    const events = [
      { toStatus: "delivered" as OrderStatus, createdAt: at(400), actorName: null },
      { toStatus: "confirmed" as OrderStatus, createdAt: at(6), actorName: null },
    ];
    buildTimeline(PLACED, events);
    expect(events[0].toStatus).toBe("delivered");
  });
});
