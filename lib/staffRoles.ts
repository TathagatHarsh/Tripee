import type { UserRole } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Admins making and removing admins, from /admin/staff.
 *
 * scripts/role.ts explains why roles were once command-only: an endpoint that
 * can grant ADMIN is one bug away from anybody granting themselves ADMIN. This
 * is the narrow exception, and it is only safe because of four rules:
 *
 *   1. **Only an admin, re-checked in the database.** The actions call
 *      `requireAdmin()` first, and this function re-reads the admin set inside
 *      the transaction, so an admin removed a moment ago with a live session is
 *      refused.
 *   2. **The role is a literal.** ADMIN or CUSTOMER is written here; nothing
 *      from a form reaches the column. KITCHEN is still the command's job.
 *   3. **It cannot invent an account.** The target must already have a
 *      UserProfile, i.e. must have signed in once.
 *   4. **There is always an admin left.** Every admin row is locked
 *      (`FOR UPDATE`, in id order) before anything is decided, so two admins
 *      removing each other at once run one after the other and the second finds
 *      it is no longer an admin.
 *
 * Every change writes a RoleChange row in the same transaction.
 */

export type RoleMove = "grant" | "revoke";

/** Why this change may not happen, or null if it may. Pure, so the rules are unit-tested. */
export function roleChangeProblem(o: {
  move: RoleMove;
  actorId: string;
  /** Every current admin id, read under lock. */
  admins: string[];
  target: { id: string; role: UserRole };
}): string | null {
  if (!o.admins.includes(o.actorId)) return "You are no longer an admin, so you can't change roles.";

  if (o.move === "grant") {
    if (o.target.role === "ADMIN") return "That account is already an admin.";
    if (o.target.role === "VENDOR") {
      return "That account signs in as a partner bakery. Unlink it on the bakery's page first, then make it an admin.";
    }
    return null;
  }

  if (o.target.id === o.actorId) return "You can't remove your own admin access. Ask another admin to do it.";
  if (o.target.role !== "ADMIN") return "That account is not an admin.";
  if (o.admins.length <= 1) return "That is the last admin, so it can't be removed.";
  return null;
}

const Email = z.string().email().max(254);

/** Trimmed and lowercased, or null if it is not one plausible address. */
export function normaliseEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return Email.safeParse(email).success ? email : null;
}

export type RoleChangeResult = { ok: true; from: UserRole } | { ok: false; message: string };

export async function changeAdminRole(input: {
  move: RoleMove;
  actorId: string;
  actorEmail: string | null;
  targetId: string;
  targetEmail: string;
}): Promise<RoleChangeResult> {
  return db.$transaction(async (tx): Promise<RoleChangeResult> => {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "UserProfile" WHERE role = 'ADMIN' ORDER BY id FOR UPDATE`;
    // Locked too, so a vendor link landing at the same moment can't be overwritten.
    const [target] = await tx.$queryRaw<{ id: string; role: UserRole }[]>`
      SELECT id, role::text AS role FROM "UserProfile" WHERE id = ${input.targetId} FOR UPDATE`;

    if (!target) {
      return {
        ok: false,
        message: "That account has never opened the shop, so it has no profile yet. Ask them to sign in once, then try again.",
      };
    }

    const problem = roleChangeProblem({
      move: input.move,
      actorId: input.actorId,
      admins: admins.map((a) => a.id),
      target,
    });
    if (problem) return { ok: false, message: problem };

    const toRole: UserRole = input.move === "grant" ? "ADMIN" : "CUSTOMER";
    await tx.userProfile.update({ where: { id: target.id }, data: { role: toRole, vendorId: null } });
    await tx.roleChange.create({
      data: {
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        targetId: target.id,
        targetEmail: input.targetEmail,
        fromRole: target.role,
        toRole,
      },
    });
    return { ok: true, from: target.role };
  });
}
