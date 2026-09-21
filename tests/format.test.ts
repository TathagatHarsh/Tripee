import { describe, expect, it } from "vitest";
import { formatINR, rollCells } from "@/lib/format";

/** What the roll actually prints: cells come back right-hand end first. */
const shown = (text: string) => rollCells(text).map((c) => c.char).reverse().join("");

/** The cell occupying a given distance from the ones end. */
const at = (text: string, place: number) => rollCells(text).find((c) => c.place === place)!;

describe("rollCells", () => {
  it("prints back exactly the price it was given", () => {
    const text = formatINR(270500);
    expect(shown(text)).toBe(text);
  });

  it("numbers columns from the ones end, not from the start of the string", () => {
    // "₹999.00" → paise ones, paise tens, point, rupee ones, tens, hundreds, symbol
    expect(at("₹999.00", 0)).toEqual({ char: "0", digit: 0, place: 0 });
    expect(at("₹999.00", 3)).toEqual({ char: "9", digit: 9, place: 3 });
    expect(at("₹999.00", 6)).toEqual({ char: "₹", digit: null, place: 6 });
  });

  it("keeps a column on the same place when the total gains digits", () => {
    // ₹999 → ₹1,050 adds two characters at the FRONT. Numbering from the left
    // would slide the rupees across two columns and roll the wrong wheels —
    // the hundreds digit would land in the tens window and the price would
    // appear to scramble rather than count.
    expect(at("₹999.00", 3).char).toBe("9"); // rupee ones
    expect(at("₹1,050.00", 3).char).toBe("0"); // still rupee ones
    expect(at("₹999.00", 4).char).toBe("9"); // rupee tens
    expect(at("₹1,050.00", 4).char).toBe("5"); // still rupee tens
  });

  it("marks separators as columns that do not roll", () => {
    const fixed = rollCells("₹1,050.00").filter((c) => c.digit === null);
    expect(fixed.map((c) => c.char)).toEqual([".", ",", "₹"]);
  });
});
