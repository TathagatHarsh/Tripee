import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import {
  ACTION_LABEL, buildProgress, buildTimeline, canTransition, CUSTOMER_STATUS,
  customerStatus, dueAt, HAPPY_PATH, isClosed, NEXT_STATUS, PHASE, STATUS_LABEL,
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

describe("what the customer is told a status is", () => {
  it("can name every state the enum has, twice", () => {
    // A status added to the Prisma enum without a customer label would render a
    // tracker node with an empty face and a timeline row with no heading.
    for (const s of ALL) {
      expect(CUSTOMER_STATUS[s]?.label, `label.${s}`).toBeTruthy();
      expect(CUSTOMER_STATUS[s]?.note, `note.${s}`).toBeTruthy();
      expect(PHASE[s], `phase.${s}`).toBeTruthy();
    }
  });

  it("says something different to the kitchen and to the customer", () => {
    // The board's voice is an instruction to staff — "Awaiting our call" is not
    // a sentence to print at the person being called.
    expect(CUSTOMER_STATUS.draft.label).not.toBe(STATUS_LABEL.draft);
  });

  it("does not tell somebody collecting from the counter their cake is out for delivery", () => {
    expect(customerStatus("out_for_delivery").label).toBe(CUSTOMER_STATUS.out_for_delivery.label);
    expect(customerStatus("out_for_delivery", true).label).not.toBe(
      CUSTOMER_STATUS.out_for_delivery.label,
    );
    expect(customerStatus("delivered", true).label).toBe("Collected");
    // Everything else reads the same either way — this overrides two states, not
    // a second vocabulary.
    for (const s of ALL) {
      if (s === "out_for_delivery" || s === "delivered") continue;
      expect(customerStatus(s, true), s).toEqual(CUSTOMER_STATUS[s]);
    }
  });

  it("sorts exactly the open statuses into the active tab", () => {
    for (const s of ALL) {
      expect(PHASE[s] === "active", s).toBe(!isClosed(s));
    }
  });
});

describe("the tracker's steps", () => {
  const PLACED = new Date("2026-09-08T08:26:00.000Z");
  const at = (min: number) => new Date(PLACED.getTime() + min * 60_000);

  it("derives the forward path from the state machine itself", () => {
    // Not asserted against a literal list on purpose: the property that matters
    // is that every step is a legal move from the one before it, which is what
    // makes a hardcoded second copy unnecessary.
    expect(HAPPY_PATH[0]).toBe("draft");
    expect(HAPPY_PATH.at(-1)).toBe("delivered");
    expect(HAPPY_PATH).not.toContain("cancelled");
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      expect(canTransition(HAPPY_PATH[i], HAPPY_PATH[i + 1])).toBe(true);
    }
  });

  it("marks one step current, the ones behind it done and the rest upcoming", () => {
    const steps = buildProgress(
      { status: "in_kitchen", createdAt: PLACED },
      [
        { toStatus: "confirmed", fromStatus: "draft", createdAt: at(6) },
        { toStatus: "in_kitchen", fromStatus: "confirmed", createdAt: at(40) },
      ],
    );

    expect(steps.map((s) => s.state)).toEqual([
      "done", "done", "current", "upcoming", "upcoming",
    ]);
    expect(steps.filter((s) => s.state === "current")).toHaveLength(1);
  });

  it("takes every timestamp from a recorded event, and invents none", () => {
    const steps = buildProgress(
      { status: "confirmed", createdAt: PLACED },
      [{ toStatus: "confirmed", fromStatus: "draft", createdAt: at(6) }],
    );

    // Placed comes off the order's own column; confirmed off the event row.
    expect(steps[0].at).toEqual(PLACED);
    expect(steps[1].at).toEqual(at(6));
    // Nothing after it has happened, so nothing after it has a time.
    expect(steps.slice(2).every((s) => s.at === null)).toBe(true);
  });

  it("shows a status reached before events were recorded as done without a time", () => {
    /*
     * The case prisma/schema.prisma is explicit about: an order delivered before
     * OrderEvent existed. Every step is done, because the status column says so,
     * and only the one timestamp that was never in doubt is printed.
     */
    const steps = buildProgress({ status: "delivered", createdAt: PLACED }, []);
    // Every node a tick, including the last: a delivered order is not "out for
    // delivery, happening now".
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps[0].at).toEqual(PLACED);
    expect(steps.slice(1).every((s) => s.at === null)).toBe(true);
  });

  it("stops a cancelled order where it was actually cancelled from", () => {
    const steps = buildProgress(
      { status: "cancelled", createdAt: PLACED },
      [
        { toStatus: "confirmed", fromStatus: "draft", createdAt: at(6) },
        { toStatus: "cancelled", fromStatus: "confirmed", createdAt: at(30) },
      ],
    );

    // Placed and confirmed happened; the kitchen and the road never did.
    expect(steps.map((s) => s.state)).toEqual([
      "done", "done", "stopped", "stopped", "stopped", "current",
    ]);
    expect(steps.at(-1)?.status).toBe("cancelled");
    expect(steps.at(-1)?.at).toEqual(at(30));
  });

  it("does not mutate the events it was handed", () => {
    const events = [
      { toStatus: "delivered" as OrderStatus, fromStatus: "out_for_delivery" as OrderStatus, createdAt: at(400) },
      { toStatus: "confirmed" as OrderStatus, fromStatus: "draft" as OrderStatus, createdAt: at(6) },
    ];
    buildProgress({ status: "delivered", createdAt: PLACED }, events);
    expect(events[0].toStatus).toBe("delivered");
  });

  it("reads the same however the events arrive", () => {
    const forwards = buildProgress({ status: "delivered", createdAt: PLACED }, [
      { toStatus: "confirmed", fromStatus: "draft", createdAt: at(6) },
      { toStatus: "delivered", fromStatus: "out_for_delivery", createdAt: at(400) },
    ]);
    const backwards = buildProgress({ status: "delivered", createdAt: PLACED }, [
      { toStatus: "delivered", fromStatus: "out_for_delivery", createdAt: at(400) },
      { toStatus: "confirmed", fromStatus: "draft", createdAt: at(6) },
    ]);
    expect(backwards).toEqual(forwards);
  });
});

describe("when an order is due", () => {
  it("adds the lead time frozen onto the order and consults no clock", () => {
    const createdAt = new Date("2026-09-08T08:00:00.000Z");
    expect(dueAt({ createdAt, leadHours: 48 })).toEqual(
      new Date("2026-09-10T08:00:00.000Z"),
    );
    // Called twice, hours apart in real time, it is still the same promise.
    expect(dueAt({ createdAt, leadHours: 4 })).toEqual(dueAt({ createdAt, leadHours: 4 }));
  });
});

describe("a finished order", () => {
  const PLACED = new Date("2026-09-08T08:26:00.000Z");

  it("has no step still happening", () => {
    const steps = buildProgress({ status: "delivered", createdAt: PLACED }, [
      { toStatus: "delivered", fromStatus: "out_for_delivery", createdAt: PLACED },
    ]);
    expect(steps.some((s) => s.state === "current")).toBe(false);
    expect(steps.at(-1)?.state).toBe("done");
  });
});
