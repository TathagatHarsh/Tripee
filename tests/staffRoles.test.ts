import { describe, expect, it } from "vitest";
import { normaliseEmail, roleChangeProblem } from "../lib/staffRoles";

const admins = ["a1", "a2"];
const problem = (move: "grant" | "revoke", target: { id: string; role: "CUSTOMER" | "KITCHEN" | "ADMIN" | "VENDOR" }, actorId = "a1", list = admins) =>
  roleChangeProblem({ move, actorId, admins: list, target });

describe("roleChangeProblem", () => {
  it("lets an admin promote a customer or a baker", () => {
    expect(problem("grant", { id: "u", role: "CUSTOMER" })).toBeNull();
    expect(problem("grant", { id: "u", role: "KITCHEN" })).toBeNull();
  });

  it("refuses to promote a vendor login or an existing admin", () => {
    expect(problem("grant", { id: "u", role: "VENDOR" })).toMatch(/Unlink/);
    expect(problem("grant", { id: "a2", role: "ADMIN" })).toMatch(/already an admin/);
  });

  it("refuses everything from an actor who is no longer an admin", () => {
    expect(problem("grant", { id: "u", role: "CUSTOMER" }, "gone")).toMatch(/no longer an admin/);
    expect(problem("revoke", { id: "a2", role: "ADMIN" }, "gone")).toMatch(/no longer an admin/);
  });

  it("lets an admin remove another admin", () => {
    expect(problem("revoke", { id: "a2", role: "ADMIN" })).toBeNull();
  });

  it("refuses removing yourself, a non-admin, or the last admin", () => {
    expect(problem("revoke", { id: "a1", role: "ADMIN" })).toMatch(/your own/);
    expect(problem("revoke", { id: "u", role: "KITCHEN" })).toMatch(/not an admin/);
    expect(problem("revoke", { id: "a2", role: "ADMIN" }, "a2", ["a2"])).toMatch(/your own/);
    // The last-admin guard is behind the self check today; kept so a later change to it can't empty the shop.
    expect(roleChangeProblem({ move: "revoke", actorId: "a1", admins: ["a1"], target: { id: "a1", role: "ADMIN" } })).not.toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Owner@MakeYourCakes.com ")).toBe("owner@makeyourcakes.com");
  });

  it("rejects anything that is not one address", () => {
    for (const bad of [null, "", "   ", "owner", "a@b", "a@b.com, c@d.com", `${"x".repeat(250)}@b.com`]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });
});
