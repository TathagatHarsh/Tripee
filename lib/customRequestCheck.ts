import "server-only";
import { getCatalogSnapshot } from "./catalogData";
import type { CustomRequestInput } from "./customRules";
import { db } from "./db";
import { checkDeliveryServiceability } from "./delivery";
import { checkChoice } from "./deliveryRules";

/** The checks a new request must pass, from the website or the admin: delivery area, date and window, closed days. */
export async function checkCustomRequest(input: CustomRequestInput): Promise<{ ok: true; dueAt: Date } | { ok: false; field: "address" | "dueAt"; message: string }> {
  const catalog = await getCatalogSnapshot();
  if (!checkDeliveryServiceability({ postalCode: input.address.pincode }, catalog).serviceable) return { ok: false, field: "address", message: "We don't deliver there yet" };
  const verdict = checkChoice({ slot: "scheduled", date: input.dueDate, window: input.dueWindow }, new Date(), "custom", catalog.deliveryRules);
  if (!verdict.ok) return { ok: false, field: "dueAt", message: verdict.message };
  // Same date convention as placeOrder's blackout check.
  if (await db.fulfillmentBlackout.findUnique({ where: { date_method: { date: new Date(`${input.dueDate}T00:00:00.000Z`), method: "delivery" } } }))
    return { ok: false, field: "dueAt", message: "We're closed that day." };
  return { ok: true, dueAt: verdict.dueAt };
}
