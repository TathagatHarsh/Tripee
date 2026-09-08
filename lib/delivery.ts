import type {
  CatalogSnapshot, DeliverySlotInfo, DeliveryZoneInfo,
} from "./catalogSnapshot";
import type { DeliverySlot } from "./schema";

/**
 * What we promise about getting a cake to somebody, and how far that reaches.
 *
 * The slots and the zones used to be constants in this file. They are rows now
 * — a slot's timing on its own CatalogOption row, the zones in DeliveryZone —
 * because "48 hours" and "we don't reach that pincode" are exactly what a
 * bakery revises when it hires a rider or loses one, and neither should need a
 * deploy.
 *
 * So these are pure functions over a snapshot, taking the catalogue as an
 * argument for the same reason lib/pricing does: the same call runs in a
 * browser against a catalogue that may be a moment stale, and on the server
 * where an order is accepted or refused for real. Making the caller name which
 * one it means leaves no global for a server path to read by accident.
 *
 * Named lead times, still. "Fast delivery" means nothing; "arrives within 4
 * hours of confirmation" is a promise someone can hold us to.
 */

/** Retained under its old name — the shape callers already destructure. */
export type SlotInfo = DeliverySlotInfo;

export function zoneForPincode(
  pincode: string | undefined,
  catalog: CatalogSnapshot,
): DeliveryZoneInfo | null {
  if (!pincode || !/^\d{6}$/.test(pincode)) return null;
  const n = Number(pincode);
  return catalog.zones.find((z) => n >= z.pincodeFrom && n <= z.pincodeTo) ?? null;
}

export interface ResolvedSlot extends DeliverySlotInfo {
  available: boolean;
  /** Lead time including the zone's rider surcharge. */
  effectiveLeadHours: number;
  zoneName: string | null;
  unavailableReason: string | null;
}

export function resolveSlot(
  slot: DeliverySlot,
  pincode: string | undefined,
  catalog: CatalogSnapshot,
): ResolvedSlot {
  const base = catalog.slots[slot];
  const zone = zoneForPincode(pincode, catalog);

  if (!zone) {
    return {
      ...base,
      available: true,
      effectiveLeadHours: base.leadHours,
      zoneName: null,
      // No pincode yet is not a refusal — it is a question nobody has answered.
      // A pincode we do not recognise is a refusal, and says so.
      unavailableReason: pincode ? "We don't deliver to that pincode yet." : null,
    };
  }

  const available = zone.slots.includes(slot);
  return {
    ...base,
    available,
    // Pickup is collected from the counter, so no rider crosses the city for it
    // and the zone's travel time does not apply.
    effectiveLeadHours: base.leadHours + (slot === "pickup" ? 0 : zone.extraHours),
    zoneName: zone.name,
    unavailableReason: available
      ? null
      : `${base.name} isn't available in ${zone.name} — the rider can't make the window.`,
  };
}

export function servicePincode(
  pincode: string | undefined,
  catalog: CatalogSnapshot,
): boolean {
  return zoneForPincode(pincode, catalog) !== null;
}
