import { describe, expect, it } from "vitest";

import { earliestDate, formatDay, parseWhen } from "@/app/film/when";

/** Monday 31 August 2026, 10:00 local. Fixed, so the suite cannot drift. */
const NOW = new Date(2026, 7, 31, 10, 0, 0);

describe("parseWhen", () => {
  it("resolves a weekday to the next one, never today", () => {
    // NOW is a Monday. "MONDAY" must be next Monday, not this morning.
    expect(formatDay(parseWhen("MONDAY", NOW)!.date)).toBe("MON 07 SEP");
    expect(formatDay(parseWhen("SATURDAY", NOW)!.date)).toBe("SAT 05 SEP");
    expect(formatDay(parseWhen("sat", NOW)!.date)).toBe("SAT 05 SEP");
  });

  it("reads a named day in either order", () => {
    expect(formatDay(parseWhen("5 SEP", NOW)!.date)).toBe("SAT 05 SEP");
    expect(formatDay(parseWhen("SEP 5", NOW)!.date)).toBe("SAT 05 SEP");
  });

  it("reads numeric dates day-first, as India writes them", () => {
    expect(formatDay(parseWhen("5/9", NOW)!.date)).toBe("SAT 05 SEP");
    expect(formatDay(parseWhen("05-09-2026", NOW)!.date)).toBe("SAT 05 SEP");
  });

  it("rolls a bare day-month that has already passed into next year", () => {
    expect(parseWhen("1 JAN", NOW)!.date.getFullYear()).toBe(2027);
  });

  it("returns null rather than guessing", () => {
    for (const bad of ["", "soonish", "32/13", "31 FEB", "next week"]) {
      expect(parseWhen(bad, NOW)).toBeNull();
    }
  });
});

describe("earliestDate", () => {
  it("is 48 hours out, floored to the day a cake can go out on", () => {
    expect(formatDay(earliestDate(NOW, 48))).toBe("WED 02 SEP");
  });

  it("puts the next Saturday safely past the lead time", () => {
    const saturday = parseWhen("SATURDAY", NOW)!.date;
    expect(saturday >= earliestDate(NOW, 48)).toBe(true);
  });

  it("catches a day inside the lead time", () => {
    const tomorrow = parseWhen("1 SEP", NOW)!.date;
    expect(tomorrow < earliestDate(NOW, 48)).toBe(true);
  });
});
