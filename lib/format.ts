/**
 * Money is paise, as integers, everywhere except here. Format only at the
 * render boundary.
 */
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatINR(paise: number): string {
  return INR.format(paise / 100);
}

export function formatDelta(paise: number): string {
  if (paise === 0) return "included";
  const sign = paise > 0 ? "+" : "−";
  return `${sign}${INR_WHOLE.format(Math.abs(Math.round(paise / 100)))}`;
}

/** Right-aligned rupee column for the docket. Plain digits, no symbol clash. */
export function docketAmount(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * One price, split into the columns a rolling counter turns.
 *
 * Returned right-hand end first, and `place` is the distance from that end
 * rather than the index into the string. That is the entire point of the
 * function. A total crossing ₹999 → ₹1,050 gains characters at the *front*, so
 * numbering from the left slides every column along by two and rolls the rupees
 * into the paise. Numbering from the right keeps the ones column the ones
 * column — which is what a counter does, and also what lets React keep the same
 * DOM node for it. A strip that is replaced cannot transition.
 *
 * Separators — the symbol, the thousands commas, the decimal point — come back
 * with a null digit. They are printed once and never move.
 */
export interface RollCell {
  char: string;
  /** 0-9 where the column rolls; null where it is punctuation. */
  digit: number | null;
  /** Distance from the right-hand end. 0 is the paise ones column. */
  place: number;
}

export function rollCells(text: string): RollCell[] {
  return [...text].reverse().map((char, place) => ({
    char,
    digit: char >= "0" && char <= "9" ? Number(char) : null,
    place,
  }));
}

export function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function formatIST(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(d).replace(",", "") + " IST";
}
