import type { FulfillmentMethod } from "@prisma/client";
import type { DeliverySlotInfo } from "./catalogSnapshot";

const IST_OFFSET = 5.5 * 3_600_000;
export interface ScheduleVerdict {
  ok: boolean;
  requestedFor: Date;
  message: string | null;
}

/** Strip relative-day prose: the customer chooses an explicit calendar date. */
export function slotWindow(slot: Pick<DeliverySlotInfo, "window">): string {
  return (
    slot.window
      .match(/\b([01]\d|2[0-3]):[0-5]\d\s*[–—-]\s*([01]\d|2[0-3]):[0-5]\d/)?.[0]
      .replace(/\s*[–—-]\s*/, "–") ?? slot.window
  );
}

/** A promised slot starts on this date in the bakery's timezone. */
export function requestedDateToInstant(
  date: string,
  window = "10:00–20:00",
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(NaN);
  const calendar = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== date
  )
    return new Date(NaN);
  const start =
    window.match(/\b([01]\d|2[0-3]):[0-5]\d\s*[–—-]/)?.[0].slice(0, 5) ??
    "10:00";
  return new Date(`${date}T${start}:00+05:30`);
}

export function scheduleVerdict(
  requestedDate: string,
  slot: DeliverySlotInfo,
  now = new Date(),
): ScheduleVerdict {
  const requestedFor = requestedDateToInstant(requestedDate, slot.window);
  if (Number.isNaN(requestedFor.getTime()))
    return {
      ok: false,
      requestedFor,
      message: "Choose a valid fulfillment date.",
    };
  if (
    !/\b([01]\d|2[0-3]):[0-5]\d\s*[–—-]\s*([01]\d|2[0-3]):[0-5]\d/.test(
      slot.window,
    )
  ) {
    return {
      ok: false,
      requestedFor,
      message:
        "This delivery window is temporarily unavailable. Choose another slot.",
    };
  }
  const earliest = now.getTime() + slot.cutoffHours * 3_600_000;
  if (requestedFor.getTime() < earliest)
    return {
      ok: false,
      requestedFor,
      message: `${slot.name} needs at least ${slot.cutoffHours} hours' notice. Choose a later date.`,
    };
  return { ok: true, requestedFor, message: null };
}

export function requestedDayRange(requestedFor: Date): { gte: Date; lt: Date } {
  const date = new Date(requestedFor.getTime() + IST_OFFSET)
    .toISOString()
    .slice(0, 10);
  const gte = new Date(`${date}T00:00:00+05:30`);
  return { gte, lt: new Date(gte.getTime() + 86_400_000) };
}

export function blackoutKey(date: Date, method: FulfillmentMethod): string {
  return `${new Date(date.getTime() + IST_OFFSET).toISOString().slice(0, 10)}:${method}`;
}
