/**
 * "When does it go out?"
 *
 * The field takes a day rather than a date, because that is how somebody
 * ordering a cake actually holds the information — you know it is Saturday
 * before you know it is the fifth. A native date input would parse for free and
 * would also arrive as a box with a calendar icon in it, which is the one thing
 * every input on this page is not, and it would have to be labelled "Select a
 * date" rather than shown an example.
 *
 * So: "SATURDAY" resolves to the next Saturday, "5 SEP" and "05/09" resolve to
 * themselves, and the resolved day prints back onto the ticket so nobody has to
 * trust that we heard them.
 */

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function formatDay(d: Date): string {
  const day = DAYS[d.getDay()].slice(0, 3);
  return `${day} ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The first day a cake can go out, given a lead time in hours. */
export function earliestDate(now: Date, leadHours: number): Date {
  return midnight(new Date(now.getTime() + leadHours * 3600_000));
}

/**
 * Resolve what somebody typed into a day. Returns null rather than guessing —
 * a wrong date silently accepted is worse than a field that has not been
 * answered yet.
 */
export function parseWhen(input: string, now: Date): { date: Date; label: string } | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;

  // A weekday name, full or three-letter: the next one, never today.
  const dayIndex = DAYS.findIndex(d => d === raw || d.slice(0, 3) === raw);
  if (dayIndex !== -1) {
    const today = midnight(now);
    const ahead = (dayIndex - today.getDay() + 7) % 7 || 7;
    const date = new Date(today);
    date.setDate(today.getDate() + ahead);
    return { date, label: formatDay(date) };
  }

  // "5 SEP" or "SEP 5", in either order.
  const named = raw.match(/^(\d{1,2})\s*([A-Z]{3,})$|^([A-Z]{3,})\s*(\d{1,2})$/);
  if (named) {
    const dayNum = Number(named[1] ?? named[4]);
    const monthName = (named[2] ?? named[3]).slice(0, 3);
    const month = MONTHS.indexOf(monthName);
    if (month !== -1 && dayNum >= 1 && dayNum <= 31) {
      const today = midnight(now);
      let date = new Date(today.getFullYear(), month, dayNum);
      if (date < today) date = new Date(today.getFullYear() + 1, month, dayNum);
      if (date.getMonth() === month) return { date, label: formatDay(date) };
    }
    return null;
  }

  // "5/9", "05-09", "5/9/2026" — day first, which is how India writes it.
  const numeric = raw.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (numeric) {
    const dayNum = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const today = midnight(now);
    let year = numeric[3] ? Number(numeric[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    if (month < 0 || month > 11 || dayNum < 1 || dayNum > 31) return null;
    let date = new Date(year, month, dayNum);
    if (!numeric[3] && date < today) date = new Date(year + 1, month, dayNum);
    if (date.getMonth() !== month) return null;
    return { date, label: formatDay(date) };
  }

  return null;
}
