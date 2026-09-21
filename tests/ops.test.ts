import { describe, expect, it } from "vitest";
import type { OrderStatus, VendorOrderStatus } from "@prisma/client";
import {
  ATTENTION_LABEL, ATTENTION_NOTE, ATTENTION_TONE, attentionFor, byLoad, openTotal,
  OPS, RANK, worstAttention, type AttentionReason, type OpsOrder, type VendorLoad,
} from "@/lib/ops";

/**
 * The operations rules, settled without a database, a session or a clock.
 *
 * `attentionFor` takes `now` as an argument precisely so this file can exist:
 * "is this order stuck" becomes a table rather than something only observable at
 * the right moment of a Tuesday afternoon. The sibling of tests/orders.test.ts
 * and tests/vendors.test.ts, and pure for the same reason.
 *
 * What this cannot prove is that app/admin/data.ts feeds it the right rows —
 * that is a property of code against a live Postgres, which this repository has
 * no harness for. What is testable is every decision that harness would check.
 */

const NOW = new Date("2026-09-13T12:00:00Z");
/** `h` hours from NOW. Negative is in the past. */
const off = (h: number) => new Date(NOW.getTime() + h * 3600_000);

/** A healthy order: confirmed, with a bakery baking it, due comfortably later. */
const OK: OpsOrder = {
  status: "confirmed",
  dueAt: off(24),
  assignmentStatus: "in_preparation",
  assignedAt: off(-3),
  hadPriorAssignment: true,
};

const ALL_REASONS: AttentionReason[] = [
  "overdue", "unassigned", "declined", "awaiting_vendor", "due_soon",
];

describe("the attention vocabulary", () => {
  it("gives every reason a label, a note, a tone and a rank", () => {
    for (const r of ALL_REASONS) {
      expect(ATTENTION_LABEL[r], r).toBeTruthy();
      expect(ATTENTION_NOTE[r], r).toBeTruthy();
      expect(ATTENTION_TONE[r], r).toBeTruthy();
      expect(RANK.includes(r), r).toBe(true);
    }
  });

  it("ranks every reason exactly once", () => {
    expect([...RANK].sort()).toEqual([...ALL_REASONS].sort());
    expect(new Set(RANK).size).toBe(RANK.length);
  });
});

describe("an order that needs nobody", () => {
  it("raises nothing at all", () => {
    expect(attentionFor(OK, NOW)).toEqual([]);
    expect(worstAttention([])).toBeNull();
  });

  it("stays quiet while a bakery has not been given long enough to answer", () => {
    // Just inside the threshold. The boundary is the whole point of a constant.
    const justAssigned: OpsOrder = {
      ...OK,
      assignmentStatus: "assigned",
      assignedAt: off(-(OPS.vendorAnswerHours - 0.5)),
    };
    expect(attentionFor(justAssigned, NOW)).toEqual([]);
  });
});

describe("a finished order is never on the list", () => {
  /*
   * The load-bearing first line of `attentionFor`. A cancelled order is
   * permanently past its window, and without this it would sit at the top of
   * the attention list forever — which is how people learn to stop reading one.
   */
  for (const status of ["delivered", "cancelled"] as OrderStatus[]) {
    it(`says nothing about a ${status} order, however late`, () => {
      expect(
        attentionFor({ ...OK, status, dueAt: off(-100), assignmentStatus: null }, NOW),
      ).toEqual([]);
    });
  }
});

describe("nobody is making this cake", () => {
  it("flags a confirmed order with no bakery as unassigned", () => {
    expect(
      attentionFor(
        { ...OK, assignmentStatus: null, assignedAt: null, hadPriorAssignment: false },
        NOW,
      ),
    ).toContain("unassigned");
  });

  it("calls it declined once a bakery has already had it", () => {
    /*
     * §5: "Vendor rejected an assignment and no replacement exists." Both cases
     * are the same null pointer and two different jobs — one is an order nobody
     * has got to, the other is one a bakery actively refused — so they are
     * different reasons rather than one bucket.
     */
    const declined = attentionFor(
      { ...OK, assignmentStatus: null, assignedAt: null, hadPriorAssignment: true },
      NOW,
    );
    expect(declined).toContain("declined");
    expect(declined).not.toContain("unassigned");
  });

  it("never nags about an unconfirmed draft", () => {
    // An order the office has not rung the customer about is not late to be
    // assigned. Flagging it would make this list a duplicate of the inbox.
    expect(
      attentionFor(
        { ...OK, status: "draft", assignmentStatus: null, assignedAt: null, hadPriorAssignment: false },
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("a bakery sitting on an order", () => {
  it("flags an assignment left unanswered past the threshold", () => {
    expect(
      attentionFor(
        { ...OK, assignmentStatus: "assigned", assignedAt: off(-(OPS.vendorAnswerHours + 1)) },
        NOW,
      ),
    ).toContain("awaiting_vendor");
  });

  it("says nothing once they have accepted it", () => {
    expect(
      attentionFor(
        { ...OK, assignmentStatus: "accepted", assignedAt: off(-48) },
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("the window closing in", () => {
  it("flags an order due soon with no cake ready", () => {
    expect(
      attentionFor({ ...OK, dueAt: off(OPS.readyByHours - 1) }, NOW),
    ).toContain("due_soon");
  });

  it("says nothing when the cake is already ready", () => {
    // `ready` and `handed_over` mean the cake exists. Chasing them would be
    // chasing the one thing that is actually finished.
    for (const s of ["ready", "handed_over"] as VendorOrderStatus[]) {
      expect(
        attentionFor({ ...OK, dueAt: off(1), assignmentStatus: s }, NOW),
        s,
      ).not.toContain("due_soon");
    }
  });

  it("does not add due_soon on top of overdue", () => {
    // Saying "due soon" about something already late is noise on top of the
    // reason that matters.
    const late = attentionFor({ ...OK, dueAt: off(-1) }, NOW);
    expect(late).toContain("overdue");
    expect(late).not.toContain("due_soon");
  });
});

describe("an order can be wrong in more than one way", () => {
  it("reports every reason, worst first", () => {
    const bad = attentionFor(
      {
        status: "confirmed",
        dueAt: off(-2),
        assignmentStatus: null,
        assignedAt: null,
        hadPriorAssignment: true,
      },
      NOW,
    );
    expect(bad).toEqual(["overdue", "declined"]);
    expect(worstAttention(bad)).toBe("overdue");
  });

  it("puts overdue ahead of everything else", () => {
    const sorted = [...ALL_REASONS].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b));
    expect(sorted[0]).toBe("overdue");
  });
});

describe("vendor workload", () => {
  const v = (over: Partial<VendorLoad>): VendorLoad => ({
    id: "v", name: "Sweet Crust", isActive: true,
    assigned: 0, accepted: 0, inPreparation: 0, ready: 0, ...over,
  });

  it("totals everything still in the bakery's hands", () => {
    expect(openTotal(v({ assigned: 2, accepted: 1, inPreparation: 3, ready: 1 }))).toBe(7);
    expect(openTotal(v({}))).toBe(0);
  });

  it("puts the busiest bakery first", () => {
    const busy = v({ id: "a", name: "A", inPreparation: 5 });
    const quiet = v({ id: "b", name: "B", inPreparation: 1 });
    expect([quiet, busy].sort(byLoad).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("breaks a tie on who is waiting to be answered", () => {
    const waiting = v({ id: "a", name: "A", assigned: 2 });
    const working = v({ id: "b", name: "B", inPreparation: 2 });
    expect([working, waiting].sort(byLoad).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("sinks a deactivated bakery below every active one", () => {
    // They cannot be given work, so their load is not a question the office is
    // asking — however much they happen to be holding.
    const gone = v({ id: "a", name: "A", isActive: false, inPreparation: 9 });
    const on = v({ id: "b", name: "B", isActive: true });
    expect([gone, on].sort(byLoad).map((x) => x.id)).toEqual(["b", "a"]);
  });
});
