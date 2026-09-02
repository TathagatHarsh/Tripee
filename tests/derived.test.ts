import { describe, expect, it } from "vitest";
import { allergenLine, deriveAllergens } from "@/lib/allergens";
import { resolveSlot, servicePincode, zoneForPincode } from "@/lib/delivery";
import { buildDocket, deriveLayers, previewRef, renderSpecSheet } from "@/lib/docket";
import { formatDelta, formatINR } from "@/lib/format";
import { canSubmit } from "@/lib/rules";
import { decodeConfig, encodeConfig, makeOrderRef } from "@/lib/share";
import { mulberry32, scatterDisc, seedFrom } from "@/lib/seed";
import { CakeConfig, DEFAULT_CAKE, migrateConfig, type CakeConfig as Cfg } from "@/lib/schema";
import { deriveHandling, deriveServings } from "@/lib/servings";
import { PRESETS } from "@/lib/presets";

const cake = (patch: Partial<Cfg> = {}): Cfg => ({ ...DEFAULT_CAKE, ...patch });

describe("allergens", () => {
  it("declares milk and wheat for a plain vanilla cake", () => {
    const r = deriveAllergens(DEFAULT_CAKE);
    expect(r.allergens).toContain("Milk");
    expect(r.allergens).toContain("Wheat (gluten)");
  });

  it("omits egg when the cake is eggless", () => {
    expect(deriveAllergens(cake({ eggless: true })).allergens).not.toContain("Egg");
    expect(deriveAllergens(cake({ eggless: false })).allergens).toContain("Egg");
  });

  it("still declares egg from meringue toppings on an eggless cake, with a caveat", () => {
    const r = deriveAllergens(cake({
      eggless: true,
      toppings: [{ kind: "meringue-kiss", placement: "crown", density: 2 }],
    }));
    expect(r.allergens).toContain("Egg");
    expect(r.egglessCaveat).toBeTruthy();
  });

  it("picks up hazelnut from nutella filling", () => {
    expect(deriveAllergens(cake({ filling: "nutella" })).allergens)
      .toContain("Tree nuts (hazelnut)");
  });

  it("picks up soy from the drip", () => {
    expect(deriveAllergens(cake({ hasDrip: true })).allergens).toContain("Soy");
  });

  it("renders a docket-ready line", () => {
    expect(allergenLine(DEFAULT_CAKE)).toMatch(/^EGGLESS · CONTAINS: /);
  });
});

describe("servings and handling", () => {
  it("derives 12–15 servings from 1.5kg", () => {
    const s = deriveServings(cake({ size: "1.5kg" }));
    expect(s).toMatchObject({ min: 12, max: 15 });
  });

  it("shortens shelf life for perishable builds", () => {
    expect(deriveHandling(cake({ frosting: "whipped-cream" })).bestBeforeHours).toBe(24);
    expect(deriveHandling(cake({ frosting: "dark-ganache" })).bestBeforeHours).toBe(48);
    expect(deriveHandling(cake({ filling: "fresh-fruit" })).bestBeforeHours).toBe(24);
  });
});

describe("delivery", () => {
  it("maps Hyderabad pincodes to zones", () => {
    expect(zoneForPincode("500081")!.id).toBe("core");
    expect(zoneForPincode("500500")!.id).toBe("outer");
    expect(zoneForPincode("501401")!.id).toBe("extended");
    expect(zoneForPincode("110001")).toBeNull();
    expect(servicePincode("500081")).toBe(true);
  });

  it("adds rider time in outer zones and withdraws express", () => {
    expect(resolveSlot("standard", "500081").effectiveLeadHours).toBe(48);
    expect(resolveSlot("standard", "500500").effectiveLeadHours).toBe(50);
    expect(resolveSlot("express-4hr", "500500").available).toBe(false);
    expect(resolveSlot("express-4hr", "500500").unavailableReason).toBeTruthy();
  });

  it("never charges rider time against a pickup", () => {
    expect(resolveSlot("pickup", "501401").effectiveLeadHours).toBe(24);
  });
});

describe("seeded randomness", () => {
  it("returns the same seed for the same config", () => {
    expect(seedFrom(DEFAULT_CAKE)).toBe(seedFrom({ ...DEFAULT_CAKE }));
  });

  it("changes the seed when the config changes", () => {
    expect(seedFrom(DEFAULT_CAKE)).not.toBe(seedFrom(cake({ hasDrip: true })));
  });

  it("produces a repeatable scatter", () => {
    const a = scatterDisc(mulberry32(42), 12, 1, 0.2);
    const b = scatterDisc(mulberry32(42), 12, 1, 0.2);
    expect(a).toEqual(b);
    expect(a.length).toBe(12);
  });
});

describe("money formatting", () => {
  it("formats paise as rupees", () => {
    expect(formatINR(160480)).toContain("1,604.80");
  });

  it("labels a zero delta as included", () => {
    expect(formatDelta(0)).toBe("included");
    expect(formatDelta(20000)).toContain("+");
    expect(formatDelta(-20000)).toContain("−");
  });
});

describe("share links", () => {
  it("round-trips a config through the URL encoding", () => {
    const c = cake({ message: "Happy Birthday Amma", toppings: [{ kind: "macaron", placement: "crown", density: 3 }] });
    expect(decodeConfig(encodeConfig(c))).toEqual(c);
  });

  it("returns null for junk", () => {
    expect(decodeConfig("not-a-real-payload")).toBeNull();
  });

  it("produces URL-safe output", () => {
    expect(encodeConfig(cake())).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("order references", () => {
  it("uses an alphabet a customer can read back down a phone line", () => {
    // No O/0 and no I/l/1 — a reference gets read aloud and written down.
    expect(makeOrderRef()).toMatch(/^MC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("draws from a space large enough that the retry loop stays a backstop", () => {
    // Order.ref is UNIQUE and /api/orders retries only five times. The old
    // scheme had 9,000 possible values, so this many draws collided thousands
    // of times and the constraint became a hard ceiling on the whole product.
    const refs = new Set(Array.from({ length: 5000 }, makeOrderRef));
    expect(refs.size).toBeGreaterThan(4990);
  });
});

describe("schema migration", () => {
  it("accepts a valid v1 config", () => {
    expect(migrateConfig(JSON.parse(JSON.stringify(DEFAULT_CAKE)))).toEqual(DEFAULT_CAKE);
  });

  it("rejects a config with an unknown enum value", () => {
    expect(migrateConfig({ ...DEFAULT_CAKE, sponge: "durian" })).toBeNull();
  });

  it("rejects a config missing the version", () => {
    const rest: Record<string, unknown> = { ...DEFAULT_CAKE };
    delete rest.version;
    expect(migrateConfig(rest)).toBeNull();
  });

  it("rejects an out-of-range tier count", () => {
    expect(CakeConfig.safeParse({ ...DEFAULT_CAKE, tiers: 4 }).success).toBe(false);
  });
});

describe("docket", () => {
  it("keeps the preview reference stable for a config", () => {
    expect(previewRef(DEFAULT_CAKE)).toBe(previewRef({ ...DEFAULT_CAKE }));
    expect(previewRef(DEFAULT_CAKE)).toMatch(/^MC-\d{4}$/);
  });

  it("lists a row for every choice that has been made", () => {
    const d = buildDocket(cake({ hasDrip: true, message: "Hi", toppings: [{ kind: "oreo", placement: "base-border", density: 2 }] }));
    const keys = d.rows.map(r => r.key);
    expect(keys).toEqual(expect.arrayContaining(["shape", "size", "sponge", "frosting", "drip", "message", "topping-oreo", "delivery"]));
  });

  it("renders a spec sheet containing the total, servings and handling", () => {
    const sheet = renderSpecSheet(cake({ size: "1.5kg", sponge: "belgian-chocolate" }));
    expect(sheet).toContain("TOTAL");
    expect(sheet).toContain("Serves");
    expect(sheet).toContain("Best before");
    expect(sheet).toContain("Contains");
  });

  it("prints no FSSAI line unless a real licence number is configured", () => {
    // Inventing a food-safety registration number would be a lie about a
    // registration that does not exist, so the line is opt-in.
    expect(renderSpecSheet(DEFAULT_CAKE)).not.toContain("FSSAI");
  });
});

describe("presets", () => {
  it("every preset is a valid, buildable cake", () => {
    for (const p of PRESETS) {
      expect(CakeConfig.safeParse(p.config).success, `${p.slug} failed schema`).toBe(true);
      expect(canSubmit(p.config), `${p.slug} is blocked`).toBe(true);
    }
  });

  it("has unique slugs", () => {
    expect(new Set(PRESETS.map(p => p.slug)).size).toBe(PRESETS.length);
  });
});

describe("layers", () => {
  it("puts filling in the gaps between the sponge slabs", () => {
    const l = deriveLayers(cake({ layers: 3, sponge: "belgian-chocolate", filling: "chocolate-mousse" }));
    expect(l.map(x => `${x.flavor} ${x.type}`)).toEqual([
      "Belgian Chocolate sponge",
      "Chocolate Mousse filling",
      "Belgian Chocolate sponge",
      "Chocolate Mousse filling",
      "Belgian Chocolate sponge",
    ]);
  });

  it("lists sponge only when nothing is filled between the layers", () => {
    const l = deriveLayers(cake({ layers: 2, filling: "none" }));
    expect(l).toEqual([
      { type: "sponge", flavor: "Vanilla" },
      { type: "sponge", flavor: "Vanilla" },
    ]);
  });
});
