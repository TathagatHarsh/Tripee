import { describe, expect, it } from "vitest";
import { checkoutIntent } from "../lib/checkout";
import { cakeKindOf, choiceFromFulfillment } from "../lib/deliveryRules";
import { DEFAULT_CAKE } from "../lib/schema";

const body = (slot: string, requestedWindow: string) =>
  ({
    customerName: "Asha",
    customerPhone: "9876543210",
    items: [{ cakeSlug: "truffle", variantId: "v1", qty: 1, choices: { delivery: slot } }],
    fulfillment: {
      method: "delivery", slot, recipientName: "Asha", addressLine1: "12 Street",
      city: "Hyderabad", state: "Telangana", pincode: "500081",
      requestedDate: "2026-11-20", requestedWindow,
    },
  }) as unknown as Parameters<typeof checkoutIntent>[0];

describe("checkout delivery", () => {
  it("cakeKindOf: builder config is custom, cart products are ready", () => {
    expect(cakeKindOf([{}, {}])).toBe("ready");
    expect(cakeKindOf([{}, { config: DEFAULT_CAKE }])).toBe("custom");
  });

  it("choiceFromFulfillment maps asap/scheduled and returns null for legacy", () => {
    expect(choiceFromFulfillment({ slot: "asap", requestedDate: "2026-11-20", requestedWindow: "asap" })).toEqual({ slot: "asap" });
    expect(choiceFromFulfillment({ slot: "scheduled", requestedDate: "2026-11-21", requestedWindow: "10:00–12:00" }))
      .toEqual({ slot: "scheduled", date: "2026-11-21", window: "10:00–12:00" });
    expect(choiceFromFulfillment({ slot: "standard", requestedDate: "2026-11-21", requestedWindow: "x" })).toBeNull();
  });

  it("checkoutIntent differs when the scheduled window differs", () => {
    const a = checkoutIntent(body("scheduled", "10:00–12:00"));
    const b = checkoutIntent(body("scheduled", "12:00–14:00"));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("checkoutIntent still ignores requestedWindow for asap", () => {
    const a = checkoutIntent(body("asap", "asap"));
    const b = checkoutIntent(body("asap", "13:00–15:00"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
