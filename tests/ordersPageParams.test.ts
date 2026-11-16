import { describe, expect, it } from "vitest";
import { closeHref, effectiveMode, rowHref } from "../lib/orderViews";

describe("orders page URL helpers", () => {
  it("closeHref drops only open", () => {
    expect(closeHref({ view: "today", q: "riya", open: "MC-1" })).toBe("/admin/orders?view=today&q=riya");
    expect(closeHref({ open: "MC-1" })).toBe("/admin/orders");
  });

  it("rowHref adds open and keeps filters", () => {
    expect(rowHref({ view: "upcoming", q: "riya" }, "MC-9")).toBe("/admin/orders?view=upcoming&q=riya&open=MC-9");
    expect(rowHref({ view: "today", open: "MC-1" }, "MC-2")).toBe("/admin/orders?view=today&open=MC-2");
  });

  it("legacy params override view", () => {
    expect(effectiveMode({ status: "confirmed", view: "today" })).toBe("legacy");
    expect(effectiveMode({ view: "today" })).toEqual({ kind: "view", view: "today" });
  });

  it("a search with no explicit view searches all; a bare page is needs", () => {
    expect(effectiveMode({ q: "riya" })).toEqual({ kind: "view", view: "all" });
    expect(effectiveMode({})).toEqual({ kind: "view", view: "needs" });
    expect(effectiveMode({ q: "riya", view: "today" })).toEqual({ kind: "view", view: "today" });
  });
});
