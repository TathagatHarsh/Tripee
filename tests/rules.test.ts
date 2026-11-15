import { describe, expect, it } from "vitest";
import { blockerFor, canSubmit, validateCake } from "@/lib/rules";
import { isOfferable } from "@/lib/inventoryRules";
import { DEFAULT_CAKE, type CakeConfig } from "@/lib/schema";

const cake = (patch: Partial<CakeConfig> = {}): CakeConfig => ({ ...DEFAULT_CAKE, ...patch });
const ids = (c: CakeConfig) => validateCake(c).map(v => v.id);

describe("validateCake", () => {
  it("passes the default cake", () => {
    expect(validateCake(DEFAULT_CAKE)).toEqual([]);
    expect(canSubmit(DEFAULT_CAKE)).toBe(true);
  });

  it("blocks whipped cream on a tiered cake and offers a fix", () => {
    const c = cake({ size: "2kg", tiers: 2, frosting: "whipped-cream" });
    const v = validateCake(c).find(x => x.id === "whipped-cream-tiers")!;
    expect(v.severity).toBe("block");
    expect(v.fix!.patch).toEqual({ frosting: "swiss-meringue" });
    expect(canSubmit({ ...c, ...v.fix!.patch })).toBe(true);
  });

  it("blocks tiers below 1.5kg", () => {
    expect(ids(cake({ tiers: 2, frosting: "swiss-meringue" }))).toContain("tiers-too-small");
    expect(ids(cake({ size: "0.5kg", tiers: 2, frosting: "swiss-meringue" }))).toContain("tiers-too-small");
    expect(ids(cake({ size: "1.5kg", tiers: 2, frosting: "swiss-meringue" }))).not.toContain("tiers-too-small");
  });

  it("blocks three tiers below 3kg", () => {
    expect(ids(cake({ size: "2kg", tiers: 3, frosting: "swiss-meringue" }))).toContain("three-tier-size");
    expect(ids(cake({ size: "3kg", tiers: 3, frosting: "swiss-meringue" }))).not.toContain("three-tier-size");
    expect(ids(cake({ size: "5kg", tiers: 3, frosting: "swiss-meringue" }))).not.toContain("three-tier-size");
  });

  it("blocks a drip on a naked cake", () => {
    expect(ids(cake({ coverage: "naked", hasDrip: true }))).toContain("naked-drip");
  });

  it("blocks non-smooth fondant and mirror glaze", () => {
    expect(ids(cake({ frosting: "fondant", finish: "ruffle" }))).toContain("fondant-finish");
    expect(ids(cake({ frosting: "mirror-glaze", finish: "rustic" }))).toContain("glaze-finish");
    expect(ids(cake({ frosting: "fondant", finish: "smooth" }))).not.toContain("fondant-finish");
  });

  it("blocks naked fondant and naked mirror glaze", () => {
    expect(ids(cake({ coverage: "naked", frosting: "fondant" }))).toContain("naked-fondant");
    expect(ids(cake({ coverage: "naked", frosting: "mirror-glaze" }))).toContain("naked-fondant");
    expect(ids(cake({ coverage: "naked", frosting: "cream-cheese" }))).not.toContain("naked-fondant");
  });

  it("blocks sugar-free fondant", () => {
    expect(ids(cake({ sugarFree: true, frosting: "fondant" }))).toContain("sugarfree-fondant");
  });

  it("warns about whipped cream in transit but does not block it", () => {
    const c = cake({ frosting: "whipped-cream", delivery: "standard" });
    const v = validateCake(c).find(x => x.id === "whipped-cream-transit")!;
    expect(v.severity).toBe("warn");
    expect(canSubmit(c)).toBe(true);
    expect(ids(cake({ frosting: "whipped-cream", delivery: "pickup" }))).not.toContain("whipped-cream-transit");
  });

  it("warns about flowers on a midnight slot", () => {
    const c = cake({
      delivery: "midnight",
      toppings: [{ kind: "edible-flower", placement: "top-scatter", density: 2 }],
    });
    expect(ids(c)).toContain("flowers-midnight");
    expect(canSubmit(c)).toBe(true);
  });

  it("warns at four toppings", () => {
    const c = cake({
      toppings: [
        { kind: "strawberry", placement: "top-ring", density: 2 },
        { kind: "macaron", placement: "crown", density: 2 },
        { kind: "sprinkles", placement: "top-scatter", density: 2 },
        { kind: "oreo", placement: "base-border", density: 2 },
      ],
    });
    expect(ids(c)).toContain("topping-overload");
    expect(canSubmit(c)).toBe(true);
  });

  it("warns about a long message on a small cake", () => {
    expect(ids(cake({ size: "0.5kg", message: "Happy Birthday To My Favourite Person" })))
      .toContain("message-too-long");
    expect(ids(cake({ size: "0.5kg", message: "Happy Birthday" })))
      .not.toContain("message-too-long");
  });

  it("does not throw on an empty message", () => {
    expect(() => validateCake(cake({ message: "" }))).not.toThrow();
    expect(ids(cake({ message: "" }))).not.toContain("message-too-long");
  });

  it("canSubmit is false only when a block exists", () => {
    expect(canSubmit(cake({ coverage: "naked", hasDrip: true }))).toBe(false);
    expect(canSubmit(cake({ frosting: "whipped-cream" }))).toBe(true);
  });

  it("blockerFor reports the violation a swatch would cause, preferring the changed field", () => {
    const c = cake({ size: "2kg", tiers: 2, frosting: "swiss-meringue" });
    const b = blockerFor(c, { frosting: "whipped-cream" })!;
    expect(b.id).toBe("whipped-cream-tiers");
    expect(b.field).toBe("frosting");
    expect(blockerFor(c, { frosting: "dark-ganache" })).toBeNull();
  });

  it("blockerFor stays quiet about a block the cake already has", () => {
    // Already broken: whipped cream on two tiers.
    const broken = cake({ size: "2kg", tiers: 2, frosting: "whipped-cream" });

    // An unrelated option must not repeat someone else's problem.
    expect(blockerFor(broken, { coverage: "full" })).toBeNull();
    expect(blockerFor(broken, { finish: "rustic" })).toBeNull();

    // A second, genuinely new problem still shows up.
    expect(blockerFor(broken, { coverage: "naked", hasDrip: true })?.id).toBe("naked-drip");
  });

  it("every fix actually clears the violation it belongs to", () => {
    const broken: CakeConfig[] = [
      cake({ size: "2kg", tiers: 2, frosting: "whipped-cream" }),
      cake({ tiers: 2, frosting: "swiss-meringue" }),
      cake({ size: "2kg", tiers: 3, frosting: "swiss-meringue" }),
      cake({ coverage: "naked", hasDrip: true }),
      cake({ frosting: "fondant", finish: "ruffle" }),
      cake({ frosting: "mirror-glaze", finish: "rustic" }),
      cake({ coverage: "naked", frosting: "fondant" }),
      cake({ sugarFree: true, frosting: "fondant" }),
    ];

    for (const c of broken) {
      const v = validateCake(c).find(x => x.severity === "block")!;
      expect(v.fix, `no fix on ${v.id}`).toBeDefined();
      const fixed = { ...c, ...v.fix!.patch };
      expect(ids(fixed), `${v.id} not cleared by its own fix`).not.toContain(v.id);
    }
  });
});

describe("isOfferable", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  const on = { isAvailable: true, pausedUntil: null };
  it("needs a row that is on", () => {
    expect(isOfferable(undefined, now)).toBe(false);
    expect(isOfferable({ ...on, isAvailable: false }, now)).toBe(false);
    expect(isOfferable(on, now)).toBe(true);
  });
  it("a pause blocks until it ends", () => {
    expect(isOfferable({ ...on, pausedUntil: new Date(now.getTime() + 3600000) }, now)).toBe(false);
    expect(isOfferable({ ...on, pausedUntil: new Date(now.getTime() - 1000) }, now)).toBe(true);
  });
});
