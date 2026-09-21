import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CatalogUnavailable, getBakeryInfo, getCatalogSnapshot, tryCatalogSnapshot,
} from "@/lib/catalogData";
import { DEFAULT_BAKERY, DEFAULT_SNAPSHOT } from "@/lib/catalogDefaults";
import { maskedPhone } from "@/lib/notify";

/**
 * The two rules that only bite in production, and which therefore have to be
 * proved somewhere that is not production.
 *
 * Both are regressions waiting to happen: each is an `if` guarding a path
 * nobody walks in development, so nothing about running the app locally would
 * ever reveal that one had been deleted.
 */

const REAL_NODE_ENV = process.env.NODE_ENV;
const REAL_DATABASE_URL = process.env.DATABASE_URL;

function pretend(nodeEnv: string, databaseUrl: string | undefined): void {
  // NODE_ENV is typed as a literal union; this is a test deliberately standing
  // somewhere the type system says the application never stands.
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
}

beforeEach(() => pretend("test", undefined));

afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = REAL_NODE_ENV;
  if (REAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = REAL_DATABASE_URL;
});

/**
 * The one that has already cost money once.
 *
 * `DEFAULT_SNAPSHOT` is the prices this repository shipped with, every option
 * marked available, and no delivery zones at all. Served in production it does
 * not degrade — it sells: at the wrong prices, including options the owner
 * withdrew, to pincodes the rider does not reach, under whatever GST rate is in
 * the source tree. And it does so silently, which is the part that turns a bad
 * afternoon into a bad month.
 */
describe("the catalogue refuses to fall back in production", () => {
  it("throws rather than pricing from the shipped defaults when DATABASE_URL is missing", async () => {
    pretend("production", undefined);
    await expect(getCatalogSnapshot()).rejects.toBeInstanceOf(CatalogUnavailable);
  });

  it("says so in a way a route handler can answer with a 503", async () => {
    pretend("production", undefined);
    expect(await tryCatalogSnapshot()).toBeNull();
  });

  it("keeps the development fallback, which is what makes an empty .env usable", async () => {
    pretend("development", undefined);
    expect(await getCatalogSnapshot()).toEqual(DEFAULT_SNAPSHOT);
    expect(await tryCatalogSnapshot()).toEqual(DEFAULT_SNAPSHOT);
  });

  it("carries no price or availability out through the one soft edge", async () => {
    // getBakeryInfo is deliberately tolerant, so a database outage turns a 404
    // into a 404 rather than into an application error. It has to stay narrow:
    // a shop name and a telephone number cannot mis-sell a cake, and nothing
    // else is allowed through this door.
    pretend("production", undefined);

    const bakery = await getBakeryInfo();
    expect(bakery).toEqual(DEFAULT_BAKERY);
    expect(Object.keys(bakery).sort()).toEqual(
      ["address", "email", "fssaiLicence", "hours", "name", "phone"],
    );
  });
});

/**
 * §20. A log drain is not the database: it is retained on somebody else's
 * schedule, readable by anyone with dashboard access, and routinely shipped on
 * to a third party. A guest's mobile number is the most re-identifying thing
 * this product holds about them.
 */
describe("the new-order log line", () => {
  it("keeps only enough of the number to match the line to its order", () => {
    expect(maskedPhone("+919876543210")).toBe("…3210");
    expect(maskedPhone("9876543210")).toBe("…3210");
    expect(maskedPhone("098765 43210")).toBe("…3210");
  });

  it("never lets a whole number through, however it was typed", () => {
    for (const raw of ["+919876543210", "9876543210", "098765-43210", "  9876543210  "]) {
      const masked = maskedPhone(raw) ?? "";
      expect(masked, raw).not.toContain("987654");
      expect(masked.replace(/\D/g, "").length, raw).toBeLessThanOrEqual(4);
    }
  });

  it("does not invent digits it was not given", () => {
    // No number is no number, not an ellipsis standing in for one.
    expect(maskedPhone(null)).toBeNull();
    expect(maskedPhone("")).toBeNull();
    // Too short to end in four digits: says nothing rather than saying all of it.
    expect(maskedPhone("12")).toBe("…");
  });
});
