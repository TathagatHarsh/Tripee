import { describe, expect, it } from "vitest";
import type { UserRole } from "@prisma/client";
import { allows, GUARDED, requirementFor, ROLE_RANK, safeNext } from "@/lib/roles";

/**
 * The whole authorisation matrix, settled without a database, a session or a
 * browser.
 *
 * This is what lib/roles.ts exists to make possible: the rules are pure, so
 * "can a customer open /admin" is a table rather than a fixture. What this file
 * cannot prove is that the rules are wired into the routes — that is
 * e2e/auth.spec.ts, which walks an anonymous browser at both portals.
 */

const ROLES = Object.keys(ROLE_RANK) as UserRole[];
/** A guest is the absence of a role, and is tested as one of the cases. */
const EVERYONE: (UserRole | null)[] = [null, ...ROLES];

describe("role ranking", () => {
  it("names every role the schema has, and no others", () => {
    // Adding a role to the Prisma enum without ranking it here would make
    // `allows` refuse it silently — which fails closed, but fails.
    expect(ROLES.sort()).toEqual(["ADMIN", "CUSTOMER", "KITCHEN"]);
  });

  it("puts the owner above the baker above the customer", () => {
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.KITCHEN);
    expect(ROLE_RANK.KITCHEN).toBeGreaterThan(ROLE_RANK.CUSTOMER);
  });

  it("lets every role do its own job", () => {
    for (const role of ROLES) expect(allows(role, role), role).toBe(true);
  });
});

describe("who gets into the admin portal", () => {
  // §14 of the brief, as a table: guest denied, customer denied, kitchen
  // denied, admin allowed.
  const EXPECTED: [UserRole | null, boolean][] = [
    [null, false],
    ["CUSTOMER", false],
    ["KITCHEN", false],
    ["ADMIN", true],
  ];

  for (const [role, expected] of EXPECTED) {
    it(`${role ?? "a guest"} is ${expected ? "allowed" : "denied"}`, () => {
      expect(allows(role, "ADMIN")).toBe(expected);
    });
  }
});

describe("who gets into the kitchen board", () => {
  // §15: guest denied, customer denied, kitchen allowed, admin allowed.
  const EXPECTED: [UserRole | null, boolean][] = [
    [null, false],
    ["CUSTOMER", false],
    ["KITCHEN", true],
    ["ADMIN", true],
  ];

  for (const [role, expected] of EXPECTED) {
    it(`${role ?? "a guest"} is ${expected ? "allowed" : "denied"}`, () => {
      expect(allows(role, "KITCHEN")).toBe(expected);
    });
  }
});

describe("failing closed", () => {
  it("refuses a guest everything", () => {
    for (const need of ROLES) expect(allows(null, need), need).toBe(false);
    for (const need of ROLES) expect(allows(undefined, need), need).toBe(false);
  });

  it("refuses a role this build cannot name", () => {
    // A row hand-edited in psql, a column widened by a future migration, a
    // string arriving from anywhere at all. `NaN >= n` happens to be false;
    // this asserts the refusal is intended rather than lucky.
    for (const need of ROLES) {
      expect(allows("OWNER" as UserRole, need), need).toBe(false);
      expect(allows("" as UserRole, need), need).toBe(false);
      expect(allows("admin" as UserRole, need), need).toBe(false);
    }
  });

  it("never lets a lower rank reach a higher one", () => {
    for (const held of ROLES) {
      for (const need of ROLES) {
        expect(allows(held, need), `${held} -> ${need}`).toBe(
          ROLE_RANK[held] >= ROLE_RANK[need],
        );
      }
    }
  });
});

describe("which paths are guarded", () => {
  it("guards both staff portals and the account page", () => {
    expect(requirementFor("/admin")).toBe("ADMIN");
    expect(requirementFor("/kitchen")).toBe("KITCHEN");
    expect(requirementFor("/account")).toBe("CUSTOMER");
  });

  it("guards everything nested under them", () => {
    expect(requirementFor("/admin/catalog")).toBe("ADMIN");
    expect(requirementFor("/admin/orders/MC-4471")).toBe("ADMIN");
    expect(requirementFor("/kitchen/anything/at/all")).toBe("KITCHEN");
  });

  it("leaves the customer's half of the product alone", () => {
    // The guest-first guarantee, as an assertion. If any of these ever starts
    // demanding a role, somebody has put a wall in front of the thing the
    // bakery sells.
    for (const open of [
      "/", "/build", "/build/shape", "/build/review", "/presets",
      "/d/abc1234", "/d/new", "/login", "/auth/callback",
      "/api/price", "/api/orders", "/api/designs", "/api/catalog",
    ]) {
      expect(requirementFor(open), open).toBeNull();
    }
  });

  it("does not mistake a lookalike path for a guarded one", () => {
    // The same predicate decides whether a `?next=` is safe to redirect to, so
    // a sloppy prefix match here would be an open redirect there.
    for (const impostor of [
      "/administrate", "/admin@evil.com", "/adminx", "//evil.com",
      "/kitchens", "/accounts", "https://evil.com/admin", "/x/admin",
    ]) {
      expect(requirementFor(impostor), impostor).toBeNull();
    }
  });

  it("keeps one list, so the proxy and the pages cannot disagree", () => {
    for (const { prefix, need } of GUARDED) {
      expect(requirementFor(prefix), prefix).toBe(need);
    }
  });
});

describe("where sign-in sends people afterwards", () => {
  it("honours a destination inside a guarded area", () => {
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/kitchen")).toBe("/kitchen");
    expect(safeNext("/admin/orders?status=draft")).toBe("/admin/orders?status=draft");
  });

  it("refuses to be an open redirect", () => {
    for (const hostile of [
      "https://evil.com",
      "//evil.com",
      "http://localhost:3000@evil.com",
      "/admin@evil.com",
      "javascript:alert(1)",
      "",
      undefined,
    ]) {
      expect(safeNext(hostile), String(hostile)).toBe("/account");
    }
  });

  it("sends somebody with no particular destination to their own account", () => {
    expect(safeNext(undefined)).toBe("/account");
    expect(safeNext("/build/shape")).toBe("/account");
  });
});

describe("privilege escalation", () => {
  it("answers only from the row, never from what was claimed", () => {
    // The guarantee is structural rather than a validation: `allows` takes a
    // role and a requirement and returns a boolean. There is no argument
    // anywhere in lib/roles that a request could populate, and the only writer
    // of UserProfile.role is scripts/role.ts, which needs DATABASE_URL.
    for (const claimed of EVERYONE) {
      // Whatever a browser might claim to be, the answer comes from the row.
      expect(allows(claimed, "ADMIN")).toBe(claimed === "ADMIN");
    }
  });

});
