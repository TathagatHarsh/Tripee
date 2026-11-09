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

/** Minutes after placing an order in which the customer may cancel for a refund (/refund-policy). */
export const CANCEL_WINDOW_MIN = 30;

/** How long ago an order came in: "just now", "12 min ago", "3 h ago", or the date after a day. */
export function placedAgo(d: Date, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return formatIST(d);
}

/** Whether an order is still inside the customer's cancel-for-refund window. */
export function inCancelWindow(d: Date, now: Date): boolean {
  return now.getTime() - d.getTime() < CANCEL_WINDOW_MIN * 60_000;
}
