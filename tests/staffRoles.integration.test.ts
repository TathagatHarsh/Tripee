import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ userId: "nobody", clerk: [] as { id: string }[] }));
vi.mock("../lib/auth", () => ({
  requireAdmin: async () => ({ userId: session.userId, profile: { id: session.userId, role: "ADMIN" } }),
  getViewerEmail: async () => "actor@example.com",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUserList: async () => ({ data: session.clerk }),
      getUser: async () => ({ primaryEmailAddress: { emailAddress: "target@example.com" } }),
    },
  }),
}));
import { db } from "../lib/db";
import { changeAdminRole } from "../lib/staffRoles";
import { grantAdmin, revokeAdmin } from "../app/admin/staff/actions";

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = Date.now();
type Role = "CUSTOMER" | "ADMIN" | "KITCHEN" | "VENDOR";
const user = (role: Role = "CUSTOMER") => db.userProfile.create({ data: { id: `staff-${++serial}`, role } });
const roleOf = async (id: string) => (await db.userProfile.findUniqueOrThrow({ where: { id } })).role;
const change = (move: "grant" | "revoke", actorId: string, targetId: string) =>
  changeAdminRole({ move, actorId, actorEmail: null, targetId, targetEmail: `${targetId}@example.com` });
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.skipIf(!url)("admin role changes on isolated PostgreSQL", () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it("promotes a customer and a baker, and writes who did it", async () => {
    const admin = await user("ADMIN"); const c = await user(); const k = await user("KITCHEN");
    expect(await change("grant", admin.id, c.id)).toMatchObject({ ok: true });
    expect(await change("grant", admin.id, k.id)).toMatchObject({ ok: true });
    expect([await roleOf(c.id), await roleOf(k.id)]).toEqual(["ADMIN", "ADMIN"]);
    const audit = await db.roleChange.findFirstOrThrow({ where: { targetId: k.id } });
    expect(audit).toMatchObject({ actorId: admin.id, fromRole: "KITCHEN", toRole: "ADMIN", targetEmail: `${k.id}@example.com` });
  });

  it("refuses a vendor login, a missing profile, and an actor who is not an admin", async () => {
    const admin = await user("ADMIN"); const v = await user("VENDOR"); const c = await user();
    expect(await change("grant", admin.id, v.id)).toMatchObject({ ok: false });
    expect(await change("grant", admin.id, "never-signed-in")).toMatchObject({ ok: false, message: expect.stringMatching(/sign in once/) });
    expect(await change("grant", c.id, c.id)).toMatchObject({ ok: false });
    expect([await roleOf(v.id), await roleOf(c.id)]).toEqual(["VENDOR", "CUSTOMER"]);
    expect(await db.roleChange.count({ where: { targetId: { in: [v.id, c.id] } } })).toBe(0);
  });

  it("removes another admin but never yourself", async () => {
    const [a, b] = [await user("ADMIN"), await user("ADMIN")];
    expect(await change("revoke", a.id, a.id)).toMatchObject({ ok: false });
    expect(await change("revoke", a.id, b.id)).toMatchObject({ ok: true });
    expect([await roleOf(a.id), await roleOf(b.id)]).toEqual(["ADMIN", "CUSTOMER"]);
    // b's session is still live, but b is no longer an admin in the database.
    expect(await change("revoke", b.id, a.id)).toMatchObject({ ok: false });
    expect(await roleOf(a.id)).toBe("ADMIN");
  });

  it("two admins removing each other at once leaves one of them", async () => {
    for (let i = 0; i < 5; i++) {
      const [a, b] = [await user("ADMIN"), await user("ADMIN")];
      const r = await Promise.all([change("revoke", a.id, b.id), change("revoke", b.id, a.id)]);
      expect(r.filter((x) => x.ok)).toHaveLength(1);
      expect([await roleOf(a.id), await roleOf(b.id)].filter((x) => x === "ADMIN")).toHaveLength(1);
    }
  });

  it("grantAdmin: normalises the email, refuses an unknown one, promotes a known one", async () => {
    const admin = await user("ADMIN"); const c = await user();
    session.userId = admin.id;

    expect(await grantAdmin(undefined, form({ email: "not-an-email" }))).toMatchObject({ ok: false });

    session.clerk = [];
    expect(await grantAdmin(undefined, form({ email: "Nobody@Example.com" }))).toMatchObject({
      ok: false, message: expect.stringMatching(/nobody@example\.com.*sign in once/),
    });

    session.clerk = [{ id: c.id }, { id: "other" }];
    expect(await grantAdmin(undefined, form({ email: "twice@example.com" }))).toMatchObject({ ok: false });

    session.clerk = [{ id: c.id }];
    expect(await grantAdmin(undefined, form({ email: "  New.Admin@Example.com " }))).toMatchObject({ ok: true });
    expect(await roleOf(c.id)).toBe("ADMIN");
    expect(await db.roleChange.findFirstOrThrow({ where: { targetId: c.id } })).toMatchObject({
      actorId: admin.id, actorEmail: "actor@example.com", targetEmail: "new.admin@example.com",
    });
  });

  it("revokeAdmin: demotes another admin, refuses yourself", async () => {
    const [a, b] = [await user("ADMIN"), await user("ADMIN")];
    session.userId = a.id;
    expect(await revokeAdmin(undefined, form({ profileId: a.id }))).toMatchObject({ ok: false });
    expect(await revokeAdmin(undefined, form({ profileId: b.id }))).toMatchObject({ ok: true });
    expect(await roleOf(b.id)).toBe("CUSTOMER");
  });

  it("rate-limits one admin to 10 changes an hour", async () => {
    const admin = await user("ADMIN");
    session.userId = admin.id; session.clerk = [];
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await grantAdmin(undefined, form({ email: "x@example.com" })));
    expect(results[10].message).toMatch(/Too many/);
  });
});
