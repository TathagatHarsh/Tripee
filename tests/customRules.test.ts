import { afterEach, describe, expect, it } from "vitest";
import {
  canMoveCustom, customerPricePaise, customOfferMinutes, newCustomRef, newCustomToken, parseQuoteReply, quoteExpiresAt,
} from "@/lib/customRules";

describe("customRules", () => {
  afterEach(() => { delete process.env.CUSTOM_OFFER_MINUTES; });

  it("parses quote replies", () => {
    expect(parseQuoteReply("1800")).toEqual({ kind: "quote", paise: 180000 });
    expect(parseQuoteReply("₹1,800")).toEqual({ kind: "quote", paise: 180000 });
    expect(parseQuoteReply("Rs. 1,800 cr-ab12cd")).toEqual({ kind: "quote", paise: 180000, ref: "CR-AB12CD" });
    expect(parseQuoteReply("CR-AB12CD rs 2500")).toEqual({ kind: "quote", paise: 250000, ref: "CR-AB12CD" });
    expect(parseQuoteReply("50")).toEqual({ kind: "out_of_range" });
    expect(parseQuoteReply("200000")).toEqual({ kind: "out_of_range" });
    for (const junk of ["1800.50", "started", "1800 for 2kg", "", "call me"]) expect(parseQuoteReply(junk)).toBeNull();
  });

  it("adds margin and rounds up to the next 10 rupees", () => {
    expect(customerPricePaise(180000, 15)).toBe(207000);
    expect(customerPricePaise(180100, 15)).toBe(208000);
    expect(customerPricePaise(100000, 0)).toBe(100000);
  });

  it("caps quote expiry at 24h or the prep deadline", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    expect(quoteExpiresAt(now, new Date("2026-11-20T10:00:00Z"), 240)).toEqual(new Date("2026-11-12T10:00:00Z"));
    expect(quoteExpiresAt(now, new Date("2026-11-11T20:00:00Z"), 240)).toEqual(new Date("2026-11-11T16:00:00Z"));
  });

  it("allows only the documented moves", () => {
    expect(canMoveCustom("awaiting_quote", "quoted")).toBe(true);
    expect(canMoveCustom("quoted", "paid")).toBe(true);
    expect(canMoveCustom("paid", "cancelled")).toBe(false);
    expect(canMoveCustom("declined", "quoted")).toBe(false);
  });

  it("makes refs and tokens", () => {
    expect(newCustomRef()).toMatch(/^CR-[A-Z2-7]{6}$/);
    expect(newCustomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("reads CUSTOM_OFFER_MINUTES", () => {
    expect(customOfferMinutes()).toBe(60);
    process.env.CUSTOM_OFFER_MINUTES = "2";
    expect(() => customOfferMinutes()).toThrow();
  });
});
