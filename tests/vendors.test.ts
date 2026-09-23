import { describe, expect, it } from "vitest";
import type { VendorOrderStatus } from "@prisma/client";
import {
  assignmentHistory, canVendorTransition, composeRejection, DUE_TONE, dueLabel, dueUrgency,
  isVendorFinished, mayVendorAct, ORDER_STATUS_FOR_VENDOR, REJECTION_REASONS, releasesOrder,
  STAMP, VENDOR_ACTION_LABEL, VENDOR_COLUMNS, VENDOR_EVENT_LABEL, VENDOR_NEXT, VENDOR_OPEN,
  VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE,
} from "@/lib/vendors";
import { canTransition, CUSTOMER_STATUS, NEXT_STATUS } from "@/lib/orders";

/**
 * The vendor fulfilment machine, settled without a database, a session or a
 * browser.
 *
 * The sibling of tests/orders.test.ts and tests/auth.test.ts, and it can be
 * exhaustive for the same reason they can: lib/vendors.ts is pure, so "may a
 * bakery start baking an order they declined" is a table rather than a fixture.
 *
 * What this file cannot prove is that the rules are *wired into* the writes —
 * that lib/vendorTransition asks them before it opens a transaction, and that
 * its WHERE clauses carry the vendor id. That is a property of code against a
 * live Postgres, which this repository has no harness for; what is testable
 * here is every decision that harness would be checking, extracted so it can
 * be. `mayVendorAct` exists precisely so the "not your order" rule is a
 * function with a test rather than a clause in a query.
 */

const STATUSES = Object.keys(VENDOR_NEXT) as VendorOrderStatus[];

describe("the states a vendor assignment can be in", () => {
  it("names every status the schema has, and no others", () => {
    // A status added to the Prisma enum without a row here would make
    // `canVendorTransition` refuse it silently — which fails closed, but fails.
    expect([...STATUSES].sort()).toEqual([
      "accepted", "assigned", "handed_over", "in_preparation", "ready", "rejected", "withdrawn",
    ]);
  });

  it("gives every status a label, an action, an event name, a tone and a timestamp", () => {
    for (const s of STATUSES) {
      expect(VENDOR_STATUS_LABEL[s], s).toBeTruthy();
      expect(VENDOR_ACTION_LABEL[s], s).toBeTruthy();
      expect(VENDOR_EVENT_LABEL[s], s).toBeTruthy();
      expect(VENDOR_STATUS_TONE[s], s).toBeTruthy();
      expect(STAMP[s], s).toBeTruthy();
    }
  });

  it("stamps a different column for each status", () => {
    // Two statuses sharing a timestamp column would make the history claim an
    // assignment was accepted when it was declined.
    const columns = STATUSES.map((s) => STAMP[s]);
    expect(new Set(columns).size).toBe(columns.length);
  });
});

describe("the moves a vendor may make", () => {
  // The brief's sequence, as a table. Everything not listed is refused below.
  const LEGAL: [VendorOrderStatus, VendorOrderStatus][] = [
    ["assigned", "accepted"],
    ["assigned", "rejected"],
    ["accepted", "in_preparation"],
    ["in_preparation", "ready"],
    ["ready", "handed_over"],
  ];

  for (const [from, to] of LEGAL) {
    it(`${from} → ${to}`, () => expect(canVendorTransition(from, to)).toBe(true));
  }

  it("allows nothing else at all", () => {
    const legal = new Set(LEGAL.map(([f, t]) => `${f}→${t}`));
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(canVendorTransition(from, to), `${from} → ${to}`).toBe(legal.has(`${from}→${to}`));
      }
    }
  });

  it("never lets a vendor withdraw an order", () => {
    // Withdrawing is the office taking work back. A vendor posting
    // `to=withdrawn` is refused here as well as by the closed list in
    // app/vendor/actions.ts.
    for (const from of STATUSES) expect(canVendorTransition(from, "withdrawn"), from).toBe(false);
  });

  it("never reopens an order a vendor declined", () => {
    // §REJECTION: the vendor cannot keep modifying an assignment they refused.
    // The route back is the admin assigning somebody else, which is a new row.
    for (const to of STATUSES) expect(canVendorTransition("rejected", to), to).toBe(false);
  });

  it("never moves a finished or withdrawn assignment", () => {
    for (const from of ["handed_over", "withdrawn"] as VendorOrderStatus[]) {
      for (const to of STATUSES) expect(canVendorTransition(from, to), `${from}→${to}`).toBe(false);
    }
  });

  it("never skips preparation", () => {
    // The one shortcut somebody would reach for on a busy morning, and the
    // reason the office's timeline would then be a fiction.
    expect(canVendorTransition("accepted", "ready")).toBe(false);
    expect(canVendorTransition("accepted", "handed_over")).toBe(false);
    expect(canVendorTransition("assigned", "in_preparation")).toBe(false);
  });

  it("never goes backwards", () => {
    expect(canVendorTransition("ready", "in_preparation")).toBe(false);
    expect(canVendorTransition("in_preparation", "accepted")).toBe(false);
    expect(canVendorTransition("accepted", "assigned")).toBe(false);
  });

  it("refuses a status this build cannot name", () => {
    // A row hand-edited in psql, a column widened by a future migration, a
    // string arriving from anywhere at all. Same assertion tests/auth.test.ts
    // makes about a role: the refusal is intended rather than lucky.
    expect(canVendorTransition("baking" as VendorOrderStatus, "ready")).toBe(false);
    expect(canVendorTransition("assigned", "baking" as VendorOrderStatus)).toBe(false);
    expect(canVendorTransition("" as VendorOrderStatus, "accepted")).toBe(false);
  });
});

describe("which assignments are still work", () => {
  it("calls exactly the three terminal states finished", () => {
    for (const s of STATUSES) {
      expect(isVendorFinished(s), s).toBe(
        s === "rejected" || s === "handed_over" || s === "withdrawn",
      );
    }
  });

  it("derives the dashboard's open list from the machine", () => {
    expect([...VENDOR_OPEN].sort()).toEqual(["accepted", "assigned", "in_preparation", "ready"]);
  });
});

describe("which endings hand the order back to the office", () => {
  it("releases on a decline and on a withdrawal, and on nothing else", () => {
    for (const s of STATUSES) {
      expect(releasesOrder(s), s).toBe(s === "rejected" || s === "withdrawn");
    }
  });

  it("keeps a handed-over order attached to the bakery that made it", () => {
    /*
     * The one that is easy to get wrong. Clearing `Order.currentAssignmentId`
     * on `handed_over` would make a finished order read "Unassigned" the moment
     * the cake left, losing the only record of who made it.
     */
    expect(releasesOrder("handed_over")).toBe(false);
  });
});

describe("a vendor may only act on their own assignment", () => {
  const MINE = "vendor-a";
  const THEIRS = "vendor-b";

  it("lets a vendor move an assignment that is theirs", () => {
    expect(mayVendorAct({ vendorId: MINE, status: "assigned" }, MINE, "accepted")).toBe(true);
  });

  it("refuses an assignment belonging to another vendor", () => {
    /*
     * The rule behind "Vendor A cannot open /vendor/orders/<Vendor B's ref>".
     * In the running product they never get this far — every query is scoped by
     * the session's own vendor id, so another bakery's row is not found — and
     * this is the second fence, stated as a function so it can be held to.
     */
    expect(mayVendorAct({ vendorId: THEIRS, status: "assigned" }, MINE, "accepted")).toBe(false);
    expect(mayVendorAct({ vendorId: THEIRS, status: "ready" }, MINE, "handed_over")).toBe(false);
  });

  it("refuses when the scoped lookup found nothing", () => {
    // What a scoped query actually returns for another vendor's reference. It
    // has to read as a refusal rather than as a crash.
    expect(mayVendorAct(null, MINE, "accepted")).toBe(false);
  });

  it("still applies the state machine to an assignment that is theirs", () => {
    expect(mayVendorAct({ vendorId: MINE, status: "rejected" }, MINE, "in_preparation")).toBe(false);
    expect(mayVendorAct({ vendorId: MINE, status: "assigned" }, MINE, "ready")).toBe(false);
  });

  it("refuses an empty vendor id against an empty vendor id", () => {
    // Two missing values are not a match. A bug that left `vendorId` blank on
    // both sides must not read as "these are the same bakery".
    expect(mayVendorAct({ vendorId: "", status: "assigned" }, "", "accepted")).toBe(false);
  });
});

describe("an assignment's history, read off its own columns", () => {
  const at = (h: number) => new Date(`2026-09-13T${String(h).padStart(2, "0")}:00:00Z`);

  it("reads a full run in the order it happened", () => {
    expect(
      assignmentHistory({
        assignedAt: at(9),
        acceptedAt: at(10),
        startedAt: at(11),
        readyAt: at(14),
        handedOverAt: at(15),
      }).map((e) => e.label),
    ).toEqual(["Assigned", "Accepted", "Started preparation", "Ready", "Handed over"]);
  });

  it("sorts by time rather than by column order", () => {
    /*
     * `rejectedAt` is declared above `startedAt` in the schema, so a history
     * that trusted declaration order would put a decline before a preparation
     * that happened first. No row can hold both today; the sort is what keeps
     * that from being load-bearing.
     */
    const entries = assignmentHistory({ assignedAt: at(12), rejectedAt: at(9) });
    expect(entries.map((e) => e.label)).toEqual(["Declined", "Assigned"]);
  });

  it("shows only what was actually recorded", () => {
    // Migration 6's position, applied here: a step with no timestamp gets no
    // line, rather than one invented from `updatedAt`.
    expect(assignmentHistory({ assignedAt: at(9) }).map((e) => e.label)).toEqual(["Assigned"]);
    expect(assignmentHistory({ assignedAt: at(9), acceptedAt: null })).toHaveLength(1);
  });

  it("is empty for a row with no timestamps at all", () => {
    expect(assignmentHistory({})).toEqual([]);
  });

  it("records a withdrawal after the handover it undid", () => {
    // An order taken back off a bakery that had already handed it over keeps
    // both facts, in the order they happened.
    expect(
      assignmentHistory({ assignedAt: at(9), handedOverAt: at(15), withdrawnAt: at(16) })
        .map((e) => e.label),
    ).toEqual(["Assigned", "Handed over", "Taken back by the office"]);
  });
});

/* ------------------------------------------- where the two machines touch */

/**
 * The seam between vendor fulfilment and the customer's order.
 *
 * The rest of this file settles what a bakery may do to their own assignment.
 * This settles the only question that crosses into the other machine: which of
 * their moves, if any, changes what the customer is told. It is a table for the
 * same reason everything above is — `ORDER_STATUS_FOR_VENDOR` is pure, and the
 * wiring that consumes it (lib/vendorTransition) is the part a live Postgres
 * would be needed to test.
 *
 * These are the assertions that would catch somebody "finishing" the mapping
 * later by filling in the nulls, which is exactly the change that would start
 * leaking a vendor's internal churn onto a customer's tracking page.
 */
describe("which vendor moves change what the customer is told", () => {
  it("decides for every vendor status, with no key left out", () => {
    // The Record type already refuses a missing key at build time. This says
    // out loud that `null` is a decision somebody made rather than an omission.
    for (const s of STATUSES) {
      expect(s in ORDER_STATUS_FOR_VENDOR, s).toBe(true);
    }
  });

  it("moves the order only when the bakery starts baking", () => {
    for (const s of STATUSES) {
      expect(ORDER_STATUS_FOR_VENDOR[s], s).toBe(s === "in_preparation" ? "in_kitchen" : null);
    }
  });

  it("keeps a decline and a reassignment invisible to the customer", () => {
    /*
     * §REJECTION: "Vendor A rejected your order" must never reach the person who
     * ordered the cake. Vendor A declining and Vendor B being given it are both
     * no-ops on the order, so the customer keeps the coherent status they had.
     */
    expect(ORDER_STATUS_FOR_VENDOR.rejected).toBeNull();
    expect(ORDER_STATUS_FOR_VENDOR.withdrawn).toBeNull();
    expect(ORDER_STATUS_FOR_VENDOR.assigned).toBeNull();
    expect(ORDER_STATUS_FOR_VENDOR.accepted).toBeNull();
  });

  it("never claims a delivery the office has not dispatched", () => {
    /*
     * The tempting pair, and the reason they are null. A cake finished and
     * collected from a partner bakery is not "out for delivery" to the customer
     * — no rider has been sent. The office moves that one, from the admin page
     * or the kitchen board.
     */
    expect(ORDER_STATUS_FOR_VENDOR.ready).toBeNull();
    expect(ORDER_STATUS_FOR_VENDOR.handed_over).toBeNull();
  });

  it("never lets a vendor cancel a customer's order", () => {
    for (const s of STATUSES) {
      expect(ORDER_STATUS_FOR_VENDOR[s], s).not.toBe("cancelled");
    }
  });

  it("only ever names a status the order machine actually has", () => {
    // A mapping to a status the enum does not carry would be a write that fails
    // at the database rather than a move that is refused.
    for (const s of STATUSES) {
      const to = ORDER_STATUS_FOR_VENDOR[s];
      if (to) expect(to in NEXT_STATUS, `${s} → ${to}`).toBe(true);
    }
  });

  it("only ever names a status the order machine can legally reach", () => {
    /*
     * The invariant that makes the sync safe to wire in at all: every non-null
     * destination has to be reachable by `canTransition` from somewhere, or it
     * would be a move that is refused every single time and a status that
     * silently never syncs. `in_kitchen` is reachable from `confirmed`.
     */
    const reachable = (to: string) =>
      (Object.keys(NEXT_STATUS) as (keyof typeof NEXT_STATUS)[]).some(
        (from) => canTransition(from, to as keyof typeof NEXT_STATUS),
      );

    for (const s of STATUSES) {
      const to = ORDER_STATUS_FOR_VENDOR[s];
      if (to) expect(reachable(to), `${s} → ${to}`).toBe(true);
    }
    expect(canTransition("confirmed", "in_kitchen")).toBe(true);
  });

  it("leaves an unconfirmed order where it is", () => {
    /*
     * A bakery can start baking before the office has rung the customer, and
     * when that happens the order does not move: `draft → in_kitchen` is not a
     * legal edge, so `applyStatusTransition` declines and the assignment's own
     * move still stands. The customer is never told "in the kitchen" by a route
     * that skipped the confirmation they were waiting on.
     */
    expect(canTransition("draft", "in_kitchen")).toBe(false);
  });

  it("does not move an order that is already past the kitchen", () => {
    // A late "start preparation" on an order the office already sent out must
    // not drag the customer's tracking page backwards.
    expect(canTransition("out_for_delivery", "in_kitchen")).toBe(false);
    expect(canTransition("delivered", "in_kitchen")).toBe(false);
    expect(canTransition("cancelled", "in_kitchen")).toBe(false);
  });

  it("has customer-facing wording ready for the status it syncs to", () => {
    // The sync writes a status the customer immediately reads. A destination
    // with no customer wording would be a tracking page with a blank heading.
    for (const s of STATUSES) {
      const to = ORDER_STATUS_FOR_VENDOR[s];
      if (to) {
        expect(CUSTOMER_STATUS[to].label, `${to} label`).toBeTruthy();
        expect(CUSTOMER_STATUS[to].note, `${to} note`).toBeTruthy();
      }
    }
  });

  it("says nothing about a vendor in the words the customer sees", () => {
    /*
     * §"VENDOR INFORMATION": the customer should read "Your cake is being
     * prepared", never "Vendor B". This checks the one string the sync can put
     * in front of them for the vocabulary that must not appear in it.
     */
    const to = ORDER_STATUS_FOR_VENDOR.in_preparation!;
    const words = `${CUSTOMER_STATUS[to].label} ${CUSTOMER_STATUS[to].note}`.toLowerCase();
    for (const leak of ["vendor", "bakery", "assign", "reject", "declin", "partner"]) {
      expect(words.includes(leak), `"${leak}" in customer wording`).toBe(false);
    }
  });
});

/* ────────────────────────────────────────────────── the board's four columns */

describe("the kitchen board's columns", () => {
  it("are statuses the machine has, in the order a cake moves through them", () => {
    // §25's rule made checkable: the board must not invent a status. Anything
    // here that is not a key of VENDOR_NEXT is a fifth column with no machine
    // behind it, which is exactly the second state system the brief forbids.
    expect(VENDOR_COLUMNS.map((c) => c.status)).toEqual([
      "assigned", "accepted", "in_preparation", "ready",
    ]);
  });

  it("show every open status and no closed one", () => {
    /*
     * The board is where work lives, so a status a bakery can still act on and
     * that has no column would be work nobody can see. And the converse: a
     * column for `handed_over` would collect cards that can never move again,
     * because `VENDOR_NEXT.handed_over` is empty.
     */
    expect([...VENDOR_COLUMNS.map((c) => c.status)].sort()).toEqual([...VENDOR_OPEN].sort());
    for (const col of VENDOR_COLUMNS) {
      expect(isVendorFinished(col.status), col.status).toBe(false);
    }
  });

  it("gives every column its own words for being empty", () => {
    // Four identical "Nothing here" boxes is a board that has stopped saying
    // anything. Each column's empty state is a different piece of good news.
    const empties = VENDOR_COLUMNS.map((c) => c.empty);
    expect(new Set(empties).size).toBe(VENDOR_COLUMNS.length);
    for (const col of VENDOR_COLUMNS) {
      expect(col.label, col.status).toBeTruthy();
      expect(col.note, col.status).toBeTruthy();
    }
  });

  it("gives the worker a verb for every column that has a move", () => {
    /*
     * §8: a worker should read a state and be handed a verb, never work the
     * verb out. Every column's status has at least one legal next move, and
     * every one of those moves has an action label on the button.
     */
    for (const col of VENDOR_COLUMNS) {
      const moves = VENDOR_NEXT[col.status];
      expect(moves.length, col.status).toBeGreaterThan(0);
      for (const to of moves) expect(VENDOR_ACTION_LABEL[to], to).toBeTruthy();
    }
  });
});

/* ───────────────────────────────────────────────────── why a bakery said no */

describe("composing a rejection reason", () => {
  it("turns a tapped reason into the sentence the office reads", () => {
    // Never the id. A stored "busy" would need this table in a second place to
    // be legible on the admin's order page.
    expect(composeRejection("busy", null)).toBe("Too busy to take this on.");
    expect(composeRejection("ingredient", null)).toBe("Product unavailable.");
  });

  it("puts the typed note after the stock sentence", () => {
    expect(composeRejection("busy", "Two weddings on Saturday.")).toBe(
      "Too busy to take this on. Two weddings on Saturday.",
    );
  });

  it("is the note alone when the reason was Other", () => {
    // "Other" carries no sentence of its own, so prefixing one would be padding.
    expect(composeRejection("other", "Oven is out until Thursday.")).toBe(
      "Oven is out until Thursday.",
    );
  });

  it("is null when neither half was given", () => {
    /*
     * Declining without explaining is allowed — §12 makes the note optional and
     * a required field only produces a required non-answer. Null rather than an
     * empty string, so the column does not fill with blanks pretending to be
     * reasons.
     */
    expect(composeRejection("", null)).toBeNull();
    expect(composeRejection("other", null)).toBeNull();
    expect(composeRejection("", "   ")).toBeNull();
  });

  it("ignores a reason id this build does not know", () => {
    // The radio group is the only thing that should produce one of these, and a
    // POST does not have to come from the radio group. An unknown id
    // contributes nothing rather than being echoed into the column.
    expect(composeRejection("../../etc/passwd", null)).toBeNull();
    expect(composeRejection("nonsense", "Closed today.")).toBe("Closed today.");
  });

  it("offers Other last, and every other reason a sentence", () => {
    const other = REJECTION_REASONS.at(-1)!;
    expect(other.id).toBe("other");
    expect(other.sentence).toBe("");
    for (const r of REJECTION_REASONS.slice(0, -1)) {
      expect(r.label, r.id).toBeTruthy();
      expect(r.sentence, r.id).toBeTruthy();
    }
  });
});

/* ──────────────────────────────────────────────────────────── how long left */

describe("how long is left on an order", () => {
  const AT = new Date("2026-09-15T06:00:00.000Z");
  const inMinutes = (n: number) => new Date(AT.getTime() + n * 60_000);

  it("bands the gap the way a baker decides", () => {
    expect(dueUrgency(inMinutes(-1), AT)).toBe("late");
    expect(dueUrgency(inMinutes(30), AT)).toBe("urgent");
    expect(dueUrgency(inMinutes(179), AT)).toBe("urgent");
    expect(dueUrgency(inMinutes(181), AT)).toBe("soon");
    expect(dueUrgency(inMinutes(11 * 60), AT)).toBe("soon");
    expect(dueUrgency(inMinutes(13 * 60), AT)).toBe("later");
    expect(dueUrgency(inMinutes(3 * 24 * 60), AT)).toBe("later");
  });

  it("says so in words, and rounds down", () => {
    /*
     * Down is the safe direction: a cake 119 minutes out reads "1 hour", so a
     * baker who believes the label is never late because of it. Rounding up
     * would buy an hour that does not exist.
     */
    expect(dueLabel(inMinutes(119), AT)).toBe("Due in 1 hour");
    expect(dueLabel(inMinutes(120), AT)).toBe("Due in 2 hours");
    expect(dueLabel(inMinutes(45), AT)).toBe("Due in 45 minutes");
    expect(dueLabel(inMinutes(1), AT)).toBe("Due in 1 minute");
    expect(dueLabel(inMinutes(0), AT)).toBe("Due now");
  });

  it("counts days once there is more than one", () => {
    expect(dueLabel(inMinutes(26 * 60), AT)).toBe("Due tomorrow");
    expect(dueLabel(inMinutes(3 * 24 * 60), AT)).toBe("Due in 3 days");
  });

  it("never pretends a missed window is still coming", () => {
    // The one case where the label must not be arithmetic dressed as hope.
    expect(dueLabel(inMinutes(-1), AT)).toBe("Past delivery window");
    expect(dueLabel(inMinutes(-5000), AT)).toBe("Past delivery window");
  });

  it("colours the two urgent bands as problems and the rest calmly", () => {
    // §42: never colour alone — the words above carry it too. This only checks
    // that the colour agrees with them rather than contradicting them.
    expect(DUE_TONE.late).toBe("bad");
    expect(DUE_TONE.urgent).toBe("bad");
    expect(DUE_TONE.soon).toBe("warn");
    expect(DUE_TONE.later).toBe("plain");
  });
});
