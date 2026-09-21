import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT } from "@/lib/catalogDefaults";
import {
  requestedDateToInstant,
  requestedDayRange,
  scheduleVerdict,
  slotWindow,
} from "@/lib/scheduling";
import { dueAt } from "@/lib/orders";

describe("promised delivery date", () => {
  it("rejects rolled-over dates instead of accepting a different day", () => {
    expect(Number.isNaN(requestedDateToInstant("2026-02-31").getTime())).toBe(
      true,
    );
    expect(Number.isNaN(requestedDateToInstant("not-a-date").getTime())).toBe(
      true,
    );
    expect(requestedDateToInstant("2028-02-29").toISOString()).toBe(
      "2028-02-29T04:30:00.000Z",
    );
  });
  it("uses the selected window's start in India, including midnight delivery", () => {
    expect(
      requestedDateToInstant("2026-10-01", "23:30–00:30").toISOString(),
    ).toBe("2026-10-01T18:00:00.000Z");
    expect(
      requestedDateToInstant(
        "2026-10-01",
        "Order before 11:00, arrives 18:00–21:00",
      ).toISOString(),
    ).toBe("2026-10-01T12:30:00.000Z");
  });
  it("checks notice against the actual window, not a hardcoded morning time", () => {
    expect(
      scheduleVerdict(
        "2026-10-01",
        DEFAULT_SNAPSHOT.slots.midnight,
        new Date("2026-09-30T17:59:00Z"),
      ).ok,
    ).toBe(true);
    expect(
      scheduleVerdict(
        "2026-10-01",
        DEFAULT_SNAPSHOT.slots.midnight,
        new Date("2026-09-30T18:01:00Z"),
      ).ok,
    ).toBe(false);
  });
  it("uses Indian calendar boundaries for capacity counting", () => {
    const range = requestedDayRange(new Date("2026-10-01T20:00:00Z"));
    expect(range.gte.toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });
  it("removes relative-day wording once a calendar date is chosen", () => {
    expect(slotWindow(DEFAULT_SNAPSHOT.slots.standard)).toBe("10:00–20:00");
  });
  it("keeps the agreed due date ahead of legacy lead-hour estimates", () => {
    const requestedFor = new Date("2026-10-04T04:30:00Z");
    const fixed = new Date("2026-10-04T05:30:00Z");
    const order = {
      createdAt: new Date("2026-10-01T00:00:00Z"),
      leadHours: 48,
      requestedFor,
      dueAt: fixed,
    };
    expect(dueAt(order)).toEqual(fixed);
    expect(dueAt({ ...order, dueAt: null })).toEqual(requestedFor);
  });
});
