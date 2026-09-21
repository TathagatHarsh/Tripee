import type { FulfillmentMethod } from "@prisma/client";
import type { DeliverySlotInfo } from "./catalogSnapshot";

export interface ScheduleVerdict {
  ok: boolean;
  requestedFor: Date;
  message: string | null;
}

/** Store a requested bakery date as a stable instant in the bakery timezone. */
export function requestedDateToInstant(date: string): Date {
  return new Date(`${date}T10:00:00+05:30`);
}

export function scheduleVerdict(
  requestedDate: string,
  slot: DeliverySlotInfo,
  now = new Date(),
): ScheduleVerdict {
  const requestedFor = requestedDateToInstant(requestedDate);
  if (Number.isNaN(requestedFor.getTime())) {
    return { ok: false, requestedFor, message: "Choose a valid fulfillment date." };
  }

  const earliest = now.getTime() + slot.cutoffHours * 3_600_000;
  if (requestedFor.getTime() < earliest) {
    return {
      ok: false,
      requestedFor,
      message: `${slot.name} needs at least ${slot.cutoffHours} hours' notice. Choose a later date.`,
    };
  }

  return { ok: true, requestedFor, message: null };
}

export function requestedDayRange(requestedFor: Date): { gte: Date; lt: Date } {
  const gte = new Date(requestedFor);
  gte.setUTCHours(0, 0, 0, 0);
  const lt = new Date(gte.getTime() + 86_400_000);
  return { gte, lt };
}

export function blackoutKey(date: Date, method: FulfillmentMethod): string {
  return `${date.toISOString().slice(0, 10)}:${method}`;
}

