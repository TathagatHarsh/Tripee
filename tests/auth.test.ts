import { describe, expect, it } from "vitest";
import type { UserRole } from "@prisma/client";
import {
  allows, GUARDED, homeFor, requirementFor, ROLE_RANK, safeNext, verdictFor,
} from "@/lib/roles";

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
    expect(ROLES.sort()).toEqual(["ADMIN", "CUSTOMER", "KITCHEN", "VENDOR"]);
  });

  it("puts the owner above the baker above the customer", () => {
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.KITCHEN);
    expect(ROLE_RANK.KITCHEN).toBeGreaterThan(ROLE_RANK.CUSTOMER);
  });

  it("lets every role do its own job", () => {
    for (const role of ROLES) expect(allows(role, role), role).toBe(true);
  });
});

/**
 * The one role that is not a rank.
 *
 * lib/roles' ROLE_RANK puts VENDOR at the customer's rung, which is about which
 * refusal page it can be sent to and nothing else; `allows` is what stops that
 * rung meaning anything more. These are the assertions that hold that line — if
 * somebody ever deletes the `need === "VENDOR"` clause, the rank alone would let
 * a baker and an owner into a partner bakery's orders, and this is where that is
 * caught.
 */
describe("who gets into a partner bakery's portal", () => {
  const EXPECTED: [UserRole | null, boolean][] = [
    [null, false],
    ["CUSTOMER", false],
    ["KITCHEN", false],
    // Emphatically. An owner has no bakery — `vendorId` is null on every row
    // that is not a vendor — so admitting them would render a screen scoped to
    // nothing.
    ["ADMIN", false],
    ["VENDOR", true],
  ];

  for (const [role, expected] of EXPECTED) {
    it(`${role ?? "a guest"} is ${expected ? "allowed" : "denied"}`, () => {
      expect(allows(role, "VENDOR")).toBe(expected);
    });
  }

  it("does not let a vendor into the other two portals", () => {
    expect(allows("VENDOR", "ADMIN")).toBe(false);
    expect(allows("VENDOR", "KITCHEN")).toBe(false);
  });

  it("does let a vendor reach their own account page", () => {
    /*
     * Load-bearing rather than a nicety. `requireRole` sends a denied request to
     * /account, which is itself guarded at CUSTOMER — a VENDOR that failed this
     * would be refused from the page it was refused to, about twice a second.
     * The same property the `denied` note in lib/roles relies on.
     */
    expect(allows("VENDOR", "CUSTOMER")).toBe(true);
  });

  it("sends every rank this build can name somewhere it can actually land", () => {
    // The general form of the case above, so a fifth role cannot reintroduce the
    // redirect loop: /account is where `denied` goes, so every nameable role has
    // to clear it.
    for (const role of ROLES) {
      expect(verdictFor(true, role, "CUSTOMER"), role).not.toBe("denied");
    }
  });
});

describe("who gets into the admin portal", () => {
  // §14 of the brief, as a table: guest denied, customer denied, kitchen
  // denied, admin allowed.
  const EXPECTED: [UserRole | null, boolean][] = [
    [null, false],
    ["CUSTOMER", false],
    ["KITCHEN", false],
    ["VENDOR", false],
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
    // A partner bakery is not a baker on this shop's payroll, and the kitchen
    // board carries every customer's name and phone number.
    ["VENDOR", false],
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
        /* VENDOR is off the ladder in one direction — see the suite above — so
           the rank comparison describes every pair except the ones needing it.
           Written as an exception rather than skipped, so that widening the
           exception fails here. */
        const expected = need === "VENDOR"
          ? held === "VENDOR"
          : ROLE_RANK[held] >= ROLE_RANK[need];
        expect(allows(held, need), `${held} -> ${need}`).toBe(expected);
      }
    }
  });
});

describe("which paths are guarded", () => {
  it("guards both staff portals and the account page", () => {
    expect(requirementFor("/admin")).toBe("ADMIN");
    expect(requirementFor("/kitchen")).toBe("KITCHEN");
    expect(requirementFor("/account")).toBe("CUSTOMER");
    expect(requirementFor("/vendor")).toBe("VENDOR");
  });

  it("guards everything nested under them", () => {
    expect(requirementFor("/admin/catalog")).toBe("ADMIN");
    expect(requirementFor("/admin/orders/MC-4471")).toBe("ADMIN");
    expect(requirementFor("/kitchen/anything/at/all")).toBe("KITCHEN");
    expect(requirementFor("/vendor/orders/MC-4471")).toBe("VENDOR");
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

describe("a role that cannot be read is not a refusal", () => {
  /*
   * The regression this table exists for. A signed-in person whose row could
   * not be read — no DATABASE_URL on the deployment, or a database that did not
   * answer — used to be indistinguishable from a guest, so the guard sent them
   * to sign in, Clerk saw a live session and sent them back, and production
   * served a blank page at about two round trips per second until they gave up.
   *
   * The property being pinned is narrow and is the whole fix: of the four
   * outcomes, only `sign-in` and `denied` may redirect, and neither of them is
   * reachable while holding a session with an unreadable role.
   */
  it("tells a guest apart from a session whose role is unreadable", () => {
    for (const need of ROLES) {
      expect(verdictFor(false, null, need), `guest wanting ${need}`).toBe("sign-in");
      expect(verdictFor(true, null, need), `session wanting ${need}`).toBe("unavailable");
    }
  });

  it("never redirects a session whose role is unreadable", () => {
    // Both of the redirecting outcomes route somewhere that re-enters this same
    // guard, which is why neither may be the answer here.
    for (const need of ROLES) {
      const verdict = verdictFor(true, undefined, need);
      expect(verdict).not.toBe("sign-in");
      expect(verdict).not.toBe("denied");
    }
  });

  it("treats a role this build cannot rank as unreadable, not as a refusal", () => {
    // `denied` routes to /account, which is itself guarded — so answering
    // `denied` here would refuse somebody from the page they were refused to,
    // which is the same loop wearing different clothes. Every rank this build
    // can name clears /account, so the redirect can never eat itself.
    const unknown = "OWNER" as UserRole;
    for (const need of ROLES) {
      expect(verdictFor(true, unknown, need), `unknown role wanting ${need}`)
        .toBe("unavailable");
    }
    expect(ROLE_RANK[unknown]).toBeUndefined();
  });

  it("still admits and still refuses the ranks it can read", () => {
    // The existing matrix, restated through the guard's own decision so the new
    // outcomes cannot quietly change who gets in.
    expect(verdictFor(true, "ADMIN", "ADMIN")).toBe("allow");
    expect(verdictFor(true, "ADMIN", "KITCHEN")).toBe("allow");
    expect(verdictFor(true, "KITCHEN", "KITCHEN")).toBe("allow");
    expect(verdictFor(true, "KITCHEN", "ADMIN")).toBe("denied");
    expect(verdictFor(true, "CUSTOMER", "ADMIN")).toBe("denied");
    expect(verdictFor(true, "CUSTOMER", "KITCHEN")).toBe("denied");
    expect(verdictFor(true, "CUSTOMER", "CUSTOMER")).toBe("allow");
  });

  it("agrees with `allows` wherever a role is readable", () => {
    // Two rules that disagree would be one rule and a bug, so this holds the
    // new outcomes against the boolean the rest of the product already reads.
    for (const role of ROLES) {
      for (const need of ROLES) {
        expect(verdictFor(true, role, need) === "allow", `${role} -> ${need}`)
          .toBe(allows(role, need));
      }
    }
  });

  it("never answers `allow` without a session", () => {
    for (const role of EVERYONE) {
      for (const need of ROLES) {
        expect(verdictFor(false, role, need), `${role ?? "guest"} wanting ${need}`)
          .toBe("sign-in");
      }
    }
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

describe("where a role belongs after signing in", () => {
  it("sends each role to its own portal", () => {
    expect(homeFor("ADMIN")).toBe("/admin");
    expect(homeFor("KITCHEN")).toBe("/kitchen");
    // The regression this function was written for: a partner bakery used to
    // land on /account, the customer's order history, with none of their work
    // on it. They can open that page — ROLE_RANK puts VENDOR on the customer's
    // rung — which is exactly why the wrong destination was silent.
    expect(homeFor("VENDOR")).toBe("/vendor");
    expect(homeFor("CUSTOMER")).toBe("/account");
  });

  it("sends anything it cannot rank to the one page every rank can open", () => {
    /*
     * A role this build cannot name, or no row at all, must not be aimed at a
     * door that will refuse it — that is the redirect loop `verdictFor`'s
     * `unavailable` note describes. /account is the only one of the four that
     * every rank clears, which is what makes it the safe fallback rather than
     * merely the customer's.
     */
    expect(homeFor(null)).toBe("/account");
    expect(homeFor(undefined)).toBe("/account");
    expect(homeFor("SUPERUSER" as UserRole)).toBe("/account");
  });

  it("only ever names a route the guard table knows about", () => {
    // A destination with no entry in GUARDED would be an unguarded page being
    // treated as a portal, which is how a staff area quietly becomes public.
    for (const role of EVERYONE) {
      expect(requirementFor(homeFor(role)), String(role)).not.toBeNull();
    }
  });
});
