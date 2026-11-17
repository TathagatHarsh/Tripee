"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewerEmail, requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/apiGuard";
import { hasDatabase } from "@/lib/db";
import { log } from "@/lib/log";
import { changeAdminRole, normaliseEmail, type RoleMove } from "@/lib/staffRoles";

/**
 * Make or remove an admin from /admin/staff. The rules live in lib/staffRoles;
 * this file turns a form into a user id and back into a sentence.
 *
 * `requireAdmin()` is the first statement of each, never inside a `try`: a
 * layout does not run for an action, and it refuses by throwing a redirect.
 * CSRF is Next's own check — an action is a POST that Next refuses unless its
 * Origin matches the Host — so there is no token to add here.
 */

export interface StaffResult {
  ok: boolean;
  message: string;
}

const NO_DB: StaffResult = { ok: false, message: "This deployment has no database, so nothing can be saved." };

/** ponytail: per-instance in-memory limit, same as the rest of the admin portal. */
function tooFast(actorId: string): StaffResult | null {
  const limit = rateLimit("role-change", actorId, { max: 10, windowSeconds: 3600 });
  if (limit.ok) return null;
  const minutes = Math.max(1, Math.ceil(limit.retryAfter / 60));
  return { ok: false, message: `Too many role changes. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.` };
}

async function finish(
  move: RoleMove,
  actorId: string,
  targetId: string,
  targetEmail: string,
): Promise<StaffResult> {
  const result = await changeAdminRole({ move, actorId, actorEmail: await getViewerEmail(), targetId, targetEmail });
  if (!result.ok) return result;

  log("warn", "role_changed", { actorId, targetId, from: result.from, to: move === "grant" ? "ADMIN" : "CUSTOMER" });
  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: move === "grant"
      ? `${targetEmail} is now an admin. They'll see the admin portal next time they open /admin.`
      : `${targetEmail} is no longer an admin.`,
  };
}

export async function grantAdmin(_prev: StaffResult | undefined, form: FormData): Promise<StaffResult> {
  const viewer = await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const email = normaliseEmail(form.get("email"));
  if (!email) return { ok: false, message: "Enter the email address they sign in with." };

  const limited = tooFast(viewer.userId);
  if (limited) return limited;

  // Addresses live at Clerk, not here — the same lookup scripts/role.ts does.
  const clerk = await clerkClient();
  const { data: found } = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
  if (found.length === 0) {
    return {
      ok: false,
      message: `Nobody has signed in on ${email} yet. Ask them to sign in once at /sign-in, then try again.`,
    };
  }
  if (found.length > 1) {
    return { ok: false, message: `${email} matches more than one account. Use \`npm run role\` instead.` };
  }

  return finish("grant", viewer.userId, found[0].id, email);
}

export async function revokeAdmin(_prev: StaffResult | undefined, form: FormData): Promise<StaffResult> {
  const viewer = await requireAdmin();
  if (!hasDatabase()) return NO_DB;

  const profileId = String(form.get("profileId") ?? "");
  if (!profileId) return { ok: false, message: "That form is missing an account." };

  const limited = tooFast(viewer.userId);
  if (limited) return limited;

  const clerk = await clerkClient();
  const email = await clerk.users.getUser(profileId)
    .then((u) => u.primaryEmailAddress?.emailAddress ?? null)
    .catch(() => null);

  return finish("revoke", viewer.userId, profileId, email ?? "(no longer a Clerk account)");
}
