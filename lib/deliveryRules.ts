export type CakeKind = "ready" | "custom";
export interface DeliveryRules {
  feePaise: number;
  ordersFrom: string;
  ordersUntil: string; // "HH:MM"
  readyMinMinutes: number;
  readyMaxMinutes: number;
  customMinMinutes: number;
  customMaxMinutes: number;
  windowMinutes: number;
  preorderDays: number;
}
export const DEFAULT_DELIVERY_RULES: DeliveryRules = {
  feePaise: 15000,
  ordersFrom: "08:00",
  ordersUntil: "18:00",
  readyMinMinutes: 120,
  readyMaxMinutes: 240,
  customMinMinutes: 180,
  customMaxMinutes: 240,
  windowMinutes: 120,
  preorderDays: 14,
};
export const NEW_SLOTS = ["asap", "scheduled"] as const;
export function isNewSlot(s: string): s is "asap" | "scheduled" {
  return (NEW_SLOTS as readonly string[]).includes(s);
}
export interface Window {
  start: Date;
  end: Date;
  label: string;
}
export type DeliveryChoice =
  | { slot: "asap" }
  | { slot: "scheduled"; date: string; window: string };
export type ChoiceVerdict =
  | { ok: true; requestedFor: Date; dueAt: Date; window: string }
  | { ok: false; message: string };

const IST_OFFSET = 19_800_000;
const MIN = 60_000;
const DAY = 86_400_000;

export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}
const istHM = (d: Date) => new Date(d.getTime() + IST_OFFSET).toISOString().slice(11, 16);
const toMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const instant = (date: string, mins: number) => new Date(`${date}T${hm(mins)}:00+05:30`);
const bounds = (k: CakeKind, r: DeliveryRules) =>
  k === "ready"
    ? { min: r.readyMinMinutes * MIN, max: r.readyMaxMinutes * MIN }
    : { min: r.customMinMinutes * MIN, max: r.customMaxMinutes * MIN };

/** Every window of an IST day, ignoring the minimum-notice rule. */
function dayWindows(date: string, r: DeliveryRules): Window[] {
  const out: Window[] = [];
  const until = toMinutes(r.ordersUntil);
  for (let s = toMinutes(r.ordersFrom); s < until; s += r.windowMinutes) {
    const e = Math.min(s + r.windowMinutes, until);
    out.push({ start: instant(date, s), end: instant(date, e), label: `${hm(s)}–${hm(e)}` });
  }
  return out;
}

/** null when open; otherwise the refusal copy. */
function asapRefusal(now: Date, r: DeliveryRules): string | null {
  const date = istDate(now);
  if (now < instant(date, toMinutes(r.ordersFrom)))
    return `We start taking orders at ${r.ordersFrom}. Schedule a time instead.`;
  if (now >= instant(date, toMinutes(r.ordersUntil)))
    return "We stopped taking orders for today. Schedule one for tomorrow.";
  return null;
}

function asapWindow(now: Date, kind: CakeKind, r: DeliveryRules): Window {
  const { min, max } = bounds(kind, r);
  const start = new Date(now.getTime() + min);
  const end = new Date(now.getTime() + max);
  return { start, end, label: `${istHM(start)}–${istHM(end)}` };
}

export function deliveryChoices(
  now: Date,
  kind: CakeKind,
  rules: DeliveryRules,
  closedDays: ReadonlySet<string> = new Set(),
): { asap: Window | null; days: { date: string; windows: Window[] }[] } {
  const today = istDate(now);
  const earliest = now.getTime() + bounds(kind, rules).min;
  const days = Array.from({ length: rules.preorderDays + 1 }, (_, i) => {
    const date = istDate(new Date(new Date(`${today}T00:00:00+05:30`).getTime() + i * DAY));
    const windows = closedDays.has(date)
      ? []
      : dayWindows(date, rules).filter((w) => w.start.getTime() >= earliest);
    return { date, windows };
  });
  const asap =
    closedDays.has(today) || asapRefusal(now, rules) ? null : asapWindow(now, kind, rules);
  return { asap, days };
}

export function checkChoice(
  choice: DeliveryChoice,
  now: Date,
  kind: CakeKind,
  rules: DeliveryRules,
): ChoiceVerdict {
  if (choice.slot === "asap") {
    const refusal = asapRefusal(now, rules);
    if (refusal) return { ok: false, message: refusal };
    const w = asapWindow(now, kind, rules);
    return { ok: true, requestedFor: w.start, dueAt: w.end, window: w.label };
  }
  const unknown = { ok: false as const, message: "Choose a delivery window from the list." };
  const today = istDate(now);
  const last = istDate(new Date(new Date(`${today}T00:00:00+05:30`).getTime() + rules.preorderDays * DAY));
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(choice.date) &&
    !Number.isNaN(new Date(`${choice.date}T00:00:00+05:30`).getTime()) &&
    choice.date >= today &&
    choice.date <= last;
  if (!valid) return unknown;
  const w = dayWindows(choice.date, rules).find((x) => x.label === choice.window);
  if (!w) return unknown;
  if (w.start.getTime() < now.getTime() + bounds(kind, rules).min)
    return { ok: false, message: "That time has passed — choose a later window." };
  return { ok: true, requestedFor: w.start, dueAt: w.end, window: w.label };
}
