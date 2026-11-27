import { describe, expect, it } from "vitest";
import { adminReplyBy, canMoveCustom, newCustomRef, newCustomToken, parseQuoteReply, quoteExpiresAt } from "@/lib/customRules";

describe("customRules", () => {

  it("parses quote replies", () => {
    expect(parseQuoteReply("1800")).toEqual({ kind: "quote", paise: 180000 });
    expect(parseQuoteReply("₹1,800")).toEqual({ kind: "quote", paise: 180000 });
    expect(parseQuoteReply("Rs. 1,800 cr-ab12cd")).toEqual({ kind: "quote", paise: 180000, ref: "CR-AB12CD" });
    expect(parseQuoteReply("CR-AB12CD rs 2500")).toEqual({ kind: "quote", paise: 250000, ref: "CR-AB12CD" });
    expect(parseQuoteReply("50")).toEqual({ kind: "out_of_range" });
    expect(parseQuoteReply("200000")).toEqual({ kind: "out_of_range" });
    for (const junk of ["1800.50", "started", "1800 for 2kg", "", "call me"]) expect(parseQuoteReply(junk)).toBeNull();
  });

  it("reads the ways Indian bakers write a price", () => {
    for (const text of ["1200/-", "Rs.1,200/-", "₹1200.00", "1200 only", "Rs 1200/- only", "1200.0", "1200/="])
      expect(parseQuoteReply(text), text).toEqual({ kind: "quote", paise: 120000 });
    expect(parseQuoteReply("1200/- CR-AB12CD")).toEqual({ kind: "quote", paise: 120000, ref: "CR-AB12CD" });
  });

  it("caps quote expiry at 6h or the prep deadline", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    expect(quoteExpiresAt(now, new Date("2026-11-20T10:00:00Z"), 240)).toEqual(new Date("2026-11-11T16:00:00Z"));
    expect(quoteExpiresAt(now, new Date("2026-11-11T14:00:00Z"), 120)).toEqual(new Date("2026-11-11T12:00:00Z"));
  });

  it("gives the admin an hour, counted from 8 am for requests outside 08:00–18:00 IST", () => {
    const by = (iso: string) => adminReplyBy(new Date(iso), "08:00", "18:00").toISOString();
    expect(by("2026-11-11T09:00:00+05:30")).toBe("2026-11-11T04:30:00.000Z"); // 10:00 IST
    expect(by("2026-11-11T17:45:00+05:30")).toBe("2026-11-11T13:15:00.000Z"); // 18:45 IST: arrived while open
    expect(by("2026-11-11T23:10:00+05:30")).toBe("2026-11-12T03:30:00.000Z"); // 09:00 IST next day
    expect(by("2026-11-12T02:00:00+05:30")).toBe("2026-11-12T03:30:00.000Z"); // 09:00 IST same day
    expect(by("2026-11-30T19:00:00+05:30")).toBe("2026-12-01T03:30:00.000Z"); // across a month end
    expect(by("2026-11-11T18:00:00+05:30")).toBe("2026-11-12T03:30:00.000Z"); // closing time itself is closed
  });

  it("allows only the documented moves", () => {
    expect(canMoveCustom("awaiting_quote", "quoted")).toBe(true);
    expect(canMoveCustom("quoted", "paid")).toBe(true);
    expect(canMoveCustom("paid", "cancelled")).toBe(false);
    expect(canMoveCustom("declined", "quoted")).toBe(false);
    // An admin can still quote or cancel a request no bakery took.
    expect(canMoveCustom("no_bakery", "quoted")).toBe(true);
    expect(canMoveCustom("no_bakery", "cancelled")).toBe(true);
    expect(canMoveCustom("no_bakery", "paid")).toBe(false);
  });

  it("makes refs and tokens", () => {
    expect(newCustomRef()).toMatch(/^CR-[A-Z2-7]{6}$/);
    expect(newCustomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
