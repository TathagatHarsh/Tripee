process.env.TZ = "UTC";
import { describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY_RULES as R, checkChoice, deliveryChoices, windowEndingAt, windowForPaid } from "@/lib/deliveryRules";

const at = (s: string) => new Date(s + "+05:30");

describe("delivery rules", () => {
  it("offers ASAP from 08:00 up to but not including 18:00", () => {
    expect(deliveryChoices(at("2026-11-20T07:59:00"), "ready", R).asap).toBeNull();
    expect(deliveryChoices(at("2026-11-20T08:00:00"), "ready", R).asap?.label).toBe("10:00–12:00");
    expect(deliveryChoices(at("2026-11-20T17:59:00"), "ready", R).asap?.end.toISOString()).toBe("2026-11-20T16:29:00.000Z"); // 21:59 IST
    expect(deliveryChoices(at("2026-11-20T18:00:00"), "ready", R).asap).toBeNull();
  });
  it("ready-made at 15:00: ASAP 17:00–19:00, no window left today, first is tomorrow 08–10", () => {
    const c = deliveryChoices(at("2026-11-20T15:00:00"), "ready", R);
    expect(c.asap?.label).toBe("17:00–19:00");
    expect(c.days[0]).toEqual({ date: "2026-11-20", windows: [] });
    expect(c.days[1].windows.map(w => w.label)).toEqual(["08:00–10:00","10:00–12:00","12:00–14:00","14:00–16:00","16:00–18:00"]);
  });
  it("custom at 09:30: earliest start 12:30, so today's first window is 14:00–16:00", () => {
    expect(deliveryChoices(at("2026-11-20T09:30:00"), "custom", R).days[0].windows[0].label).toBe("14:00–16:00");
  });
  it("a closed day offers no ASAP and no windows", () => {
    const c = deliveryChoices(at("2026-11-20T09:00:00"), "ready", R, new Set(["2026-11-20"]));
    expect(c.asap).toBeNull();
    expect(c.days[0].windows).toEqual([]);
  });
  it("includes today + preorderDays and nothing after", () => {
    const days = deliveryChoices(at("2026-11-20T09:00:00"), "ready", R).days;
    expect(days).toHaveLength(15);
    expect(days.at(-1)!.date).toBe("2026-12-04");
  });
  it("cuts the last window at ordersUntil when the length does not divide the day", () => {
    const w = deliveryChoices(at("2026-11-20T00:00:00"), "ready", { ...R, windowMinutes: 180 }).days[0].windows;
    expect(w.map(x => x.label)).toEqual(["08:00–11:00","11:00–14:00","14:00–17:00","17:00–18:00"]);
  });
  it("checkChoice: ASAP returns now+min .. now+max", () => {
    const v = checkChoice({ slot: "asap" }, at("2026-11-20T11:00:00"), "custom", R);
    expect(v).toMatchObject({ ok: true, window: "14:00–15:00" });
    if (v.ok) expect([v.requestedFor.toISOString(), v.dueAt.toISOString()]).toEqual(["2026-11-20T08:30:00.000Z","2026-11-20T09:30:00.000Z"]);
  });
  it("checkChoice: a scheduled window returns its start and end", () => {
    const v = checkChoice({ slot: "scheduled", date: "2026-11-21", window: "10:00–12:00" }, at("2026-11-20T19:00:00"), "ready", R);
    expect(v).toMatchObject({ ok: true, window: "10:00–12:00" });
    if (v.ok) expect(v.dueAt.toISOString()).toBe("2026-11-21T06:30:00.000Z");
  });
  it("checkChoice refuses ASAP after hours, a window inside the minimum, an unknown window, and a date past pre-order", () => {
    expect(checkChoice({ slot: "asap" }, at("2026-11-20T18:00:01"), "ready", R)).toMatchObject({ ok: false, message: expect.stringMatching(/stopped taking orders/) });
    expect(checkChoice({ slot: "scheduled", date: "2026-11-20", window: "12:00–14:00" }, at("2026-11-20T09:30:00"), "custom", R)).toMatchObject({ ok: false, message: "That time has passed — choose a later window." });
    expect(checkChoice({ slot: "scheduled", date: "2026-11-21", window: "09:00–11:00" }, at("2026-11-20T09:00:00"), "ready", R)).toMatchObject({ ok: false, message: "Choose a delivery window from the list." });
    expect(checkChoice({ slot: "scheduled", date: "2026-12-05", window: "10:00–12:00" }, at("2026-11-20T09:00:00"), "ready", R).ok).toBe(false);
  });
  it("windowForPaid never refuses for timing, only for a malformed choice", () => {
    expect(windowForPaid({ slot: "asap" }, at("2026-11-20T18:00:01"), "ready", R)).toEqual({
      ok: true, requestedFor: at("2026-11-20T20:00:01"), dueAt: at("2026-11-20T22:00:01"), window: "20:00–22:00",
    });
    expect(windowForPaid({ slot: "scheduled", date: "2026-11-20", window: "10:00–12:00" }, at("2026-11-20T15:00:00"), "ready", R)).toEqual({
      ok: true, requestedFor: at("2026-11-20T10:00:00"), dueAt: at("2026-11-20T12:00:00"), window: "10:00–12:00",
    });
    expect(windowForPaid({ slot: "scheduled", date: "2026-11-20", window: "09:00–11:00" }, at("2026-11-20T08:00:00"), "ready", R).ok).toBe(false);
    expect(windowForPaid({ slot: "scheduled", date: "20-11-2026", window: "10:00–12:00" }, at("2026-11-20T08:00:00"), "ready", R).ok).toBe(false);
  });
});

describe("builder defaults", () => {
  it("defaults new cakes to ASAP and only accepts new slots from the URL", async () => {
    const { DEFAULT_CAKE } = await import("@/lib/schema");
    const { deliveryFromParam } = await import("@/lib/deliveryRules");
    expect(DEFAULT_CAKE.delivery).toBe("asap");
    expect(deliveryFromParam("standard")).toBeNull();
    expect(deliveryFromParam("asap")).toBe("asap");
    expect(deliveryFromParam("scheduled")).toBe("scheduled");
    expect(deliveryFromParam(null)).toBeNull();
  });
});

describe("windowEndingAt", () => {
  it("finds the window a stored due time ends", () => {
    const w = windowEndingAt(at("2026-11-20T16:00:00"), R);
    expect(w?.label).toBe("14:00–16:00");
    expect(w?.start.toISOString()).toBe("2026-11-20T08:30:00.000Z");
  });
  it("finds a last window cut short at closing", () => {
    expect(windowEndingAt(at("2026-11-20T18:00:00"), { ...R, windowMinutes: 180 })?.label).toBe("17:00–18:00");
  });
  it("returns null for a time that ends no window", () => {
    expect(windowEndingAt(at("2026-11-20T15:00:00"), R)).toBeNull();
    expect(windowEndingAt(at("2026-11-20T21:30:00"), R)).toBeNull();
  });
});
