import { describe, expect, it } from "vitest";
import { priceCake as priceWith, deltaFor as deltaWith } from "@/lib/pricing";
import { DEFAULT_SNAPSHOT } from "@/lib/catalogDefaults";
import { DEFAULT_CAKE, type CakeConfig } from "@/lib/schema";

/*
 * The engine takes a catalogue now, and these tests pin it to the one the
 * product shipped with. That makes every rupee below do a second job: it was a
 * test of the arithmetic, and it is now also the proof that the rows the seed
 * writes are the prices this bakery has always charged. Change a default and
 * these fail, which is the intended alarm.
 *
 * Wrapped rather than threaded through all two dozen call sites, so the
 * assertions read exactly as they did before the catalogue moved.
 */
const priceCake = (c: CakeConfig) => priceWith(c, DEFAULT_SNAPSHOT);
const deltaFor = (c: CakeConfig, patch: Partial<CakeConfig>) =>
  deltaWith(c, patch, DEFAULT_SNAPSHOT);

const cake = (patch: Partial<CakeConfig> = {}): CakeConfig => ({ ...DEFAULT_CAKE, ...patch });

describe("priceCake", () => {
  it("prices the default cake deterministically", () => {
    const p = priceCake(DEFAULT_CAKE);
    // 1kg base 1200 + american buttercream 100 + standard delivery 60 = 1360
    expect(p.subtotal).toBe(136000);
    expect(p.gst).toBe(24480);
    expect(p.total).toBe(160480);
    expect(p.currency).toBe("INR");
  });

  it("scales modifiers with size multiplier", () => {
    const oneKg = priceCake(cake({ sponge: "belgian-chocolate" }));
    const twoKg = priceCake(cake({ size: "2kg", sponge: "belgian-chocolate" }));

    const sponge1 = oneKg.lines.find(l => l.label.includes("Belgian"))!.amount;
    const sponge2 = twoKg.lines.find(l => l.label.includes("Belgian"))!.amount;

    expect(sponge1).toBe(25000);          // 250 × 1.0
    expect(sponge2).toBe(40000);          // 250 × 1.6
  });

  it("does not scale the base price twice", () => {
    const p = priceCake(cake({ size: "3kg" }));
    expect(p.lines.find(l => l.kind === "base")!.amount).toBe(320000);
  });

  it("charges tier surcharge per additional tier, not flat", () => {
    const two = priceCake(cake({ size: "2kg", tiers: 2, frosting: "swiss-meringue" }));
    const three = priceCake(cake({ size: "3kg", tiers: 3, frosting: "swiss-meringue" }));

    expect(two.lines.find(l => l.label.includes("tier"))!.amount).toBe(40000);
    expect(three.lines.find(l => l.label.includes("tier"))!.amount).toBe(80000);
  });

  it("charges nothing extra for 3 layers, charges for 4", () => {
    const three = priceCake(cake({ layers: 3 }));
    const four = priceCake(cake({ layers: 4 }));

    expect(three.lines.some(l => l.label.includes("sponge layers"))).toBe(false);
    expect(four.lines.find(l => l.label.includes("sponge layers"))!.amount).toBe(12000);
  });

  it("applies 18% GST to the subtotal", () => {
    const p = priceCake(cake({ size: "5kg", sponge: "pistachio" }));
    expect(p.gstRate).toBe(0.18);
    expect(p.gst).toBe(Math.round(p.subtotal * 0.18));
    expect(p.total).toBe(p.subtotal + p.gst);
  });

  it("exposes payable separately from subtotal so payments can slot in", () => {
    const p = priceCake(DEFAULT_CAKE);
    expect(p.payable).toBe(p.total);
    expect(p.payable).not.toBe(p.subtotal);
  });

  it("returns integer paise for every line", () => {
    const p = priceCake(cake({
      size: "1.5kg",
      sponge: "belgian-chocolate",
      filling: "salted-caramel",
      frosting: "dark-ganache",
      finish: "ruffle",
      hasDrip: true,
      toppings: [
        { kind: "strawberry", placement: "base-border", density: 3 },
        { kind: "gold-leaf", placement: "top-scatter", density: 1 },
      ],
      message: "Happy Birthday Amma",
      sugarFree: true,
    }));

    for (const l of p.lines) expect(Number.isInteger(l.amount)).toBe(true);
    expect(Number.isInteger(p.subtotal)).toBe(true);
    expect(Number.isInteger(p.gst)).toBe(true);
    expect(Number.isInteger(p.total)).toBe(true);
  });

  it("never returns a negative total", () => {
    const p = priceCake(cake({ size: "0.5kg", frosting: "whipped-cream", delivery: "pickup" }));
    expect(p.total).toBeGreaterThan(0);
    for (const l of p.lines) expect(l.amount).toBeGreaterThanOrEqual(0);
  });

  it("produces identical output for identical input (purity)", () => {
    const c = cake({ toppings: [{ kind: "macaron", placement: "crown", density: 4 }] });
    expect(priceCake(c)).toEqual(priceCake(c));
    expect(JSON.stringify(priceCake(c))).toBe(JSON.stringify(priceCake({ ...c })));
  });

  it("scales topping cost with density", () => {
    const low = priceCake(cake({ toppings: [{ kind: "strawberry", placement: "top-ring", density: 1 }] }));
    const high = priceCake(cake({ toppings: [{ kind: "strawberry", placement: "top-ring", density: 5 }] }));

    const l = low.lines.find(x => x.label.startsWith("Strawberry"))!.amount;
    const h = high.lines.find(x => x.label.startsWith("Strawberry"))!.amount;

    expect(l).toBe(9000);    // 150 × 0.6
    expect(h).toBe(27000);   // 150 × 1.8
  });

  it("charges no delivery fee for pickup", () => {
    const p = priceCake(cake({ delivery: "pickup" }));
    expect(p.lines.some(l => l.kind === "delivery")).toBe(false);
  });

  it("ignores a whitespace-only message", () => {
    const p = priceCake(cake({ message: "   " }));
    expect(p.lines.some(l => l.label === "Message piping")).toBe(false);
  });

  it("deltaFor reports the total change a swatch would cause", () => {
    const base = priceCake(DEFAULT_CAKE).total;
    const withGanache = priceCake(cake({ frosting: "dark-ganache" })).total;
    expect(deltaFor(DEFAULT_CAKE, { frosting: "dark-ganache" })).toBe(withGanache - base);
  });

  it("prices every size band without gaps", () => {
    for (const size of ["0.5kg", "1kg", "1.5kg", "2kg", "3kg", "5kg"] as const) {
      const p = priceCake(cake({ size }));
      expect(p.lines.find(l => l.kind === "base")!.amount).toBeGreaterThan(0);
    }
  });
});
