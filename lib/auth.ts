import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Prisma, type UserProfile, type UserRole } from "@prisma/client";
import { db, hasDatabase } from "@/lib/db";
import { verdictFor } from "@/lib/roles";

/**
 * Who is asking, and whether they may.
 *
 * The split this file exists to enforce: **Clerk says who you are, this database
 * says what you can do.** Nothing else is allowed to have an opinion. Not the
 * browser, not a form field, not a request body, and specifically not the
 * session token — Clerk exposes `publicMetadata` and `unsafeMetadata` on a user,
 * the second of which the holder of the session can write, so a role kept in
 * either is a role that lives one layer away from the person it governs.
 * `UserProfile.role` is a column only the database owner can write.
 *
 * Every authorisation in the product goes through `requireRole` below. That is
 * on purpose: an `if (role === "ADMIN")` written longhand at eleven call sites
 * is eleven chances to write `||` where `&&` was meant, and the eleventh is the
 * one nobody reviews.
 *
 * ## Why the shape did not change when the provider did
 *
 * This file used to call Supabase. The rules it enforces did not move: they live
 * in lib/roles.ts, which has no dependencies and knows nothing about either
 * provider, and every call site — the two portal guards, the nine admin actions,
 * the kitchen action, the orders route — still calls exactly what it called
 * before. Swapping identity providers touched this file, proxy.ts and the
 * sign-in pages, and nothing else. That is what the seam was for.
 */

/*
 * The rules themselves live in lib/roles.ts, which has no dependencies at all —
 * proxy.ts reads them too and cannot import Prisma. Re-exported here so that a
 * call site guarding a page needs one import rather than two.
 */
export { allows, GUARDED, requirementFor, ROLE_RANK, safeNext } from "@/lib/roles";

/* ---------------------------------------------------------------- reading */

export interface Viewer {
  /** Clerk's user id, e.g. `user_2abc…`. The primary key of UserProfile. */
  userId: string;
  profile: UserProfile;
}

/**
 * The signed-in user's id, or null.
 *
 * `await auth()` — always awaited, which Clerk requires from Next 15 onward.
 * It reads and verifies the session from the request, so it is cheap: no call
 * leaves the machine, because the signature on the session token is what is
 * being checked. `currentUser()` is the one that costs a round trip, which is
 * why it is only called below where a name or an address is actually printed.
 */
export async function getUserId(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch (e) {
    // An unconfigured deployment, or a request that never passed through
    // clerkMiddleware. Signed out is the only safe reading of either.
    console.error("auth_read_failed", e);
    return null;
  }
}

/**
 * Display name only, and only from a field a person is allowed to change.
 *
 * `fullName` is theirs to set, so the single safe thing to do with it is print
 * it back at them. A role read from any Clerk-side field would be a role its
 * subject could influence, which is the whole reason UserProfile exists.
 */
function displayName(user: User | null): string | null {
  const name = (user?.fullName ?? "").trim();
  return name === "" ? null : name.slice(0, 80);
}

/**
 * The application profile for an authenticated user, created on first sight.
 *
 * Lazily here rather than in a Clerk webhook, because this is the one place
 * every route into the product converges, and because a webhook that has not
 * arrived yet is a signed-in person with no row — a race that only shows up in
 * production, on somebody's first visit.
 *
 * **The security property of this function is what it does not write.** `role`
 * appears in neither the create nor an update. A new row therefore takes the
 * column default, which is CUSTOMER, and an existing row's role is never
 * touched by anything on a request path. There is no argument to this function
 * that could carry a role, which is stronger than validating one.
 *
 * `currentUser()` is called only on the miss, so the round trip to Clerk
 * happens once in a person's lifetime rather than on every request.
 */
async function loadProfile(userId: string): Promise<UserProfile | null> {
  if (!hasDatabase()) return null;

  try {
    const existing = await db.userProfile.findUnique({ where: { id: userId } });
    if (existing) return existing;

    const user = await currentUser().catch(() => null);
    return await db.userProfile.create({
      data: { id: userId, name: displayName(user) },
    });
  } catch (e) {
    // Two tabs finishing a sign-in together both miss and both insert; the
    // loser gets a unique violation and simply reads the winner's row. Anything
    // else is a real failure and denies access, because a profile that cannot
    // be read is a role that cannot be checked.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.userProfile.findUnique({ where: { id: userId } }).catch(() => null);
    }
    console.error("profile_load_failed", e);
    return null;
  }
}

/** The signed-in person and their role, or null for a guest. */
export async function getViewer(): Promise<Viewer | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const profile = await loadProfile(userId);
  return profile ? { userId, profile } : null;
}

/**
 * The email to print on a staff header, or null.
 *
 * Separate from `getViewer` and deliberately not folded into it: this is the
 * call that leaves the machine, and only three screens in the product show an
 * address. Everything else — every guard, every action — decides on a userId
 * and a row, and must not pay for a round trip it has no use for.
 */
export async function getViewerEmail(): Promise<string | null> {
  const user = await currentUser().catch(() => null);
  return user?.primaryEmailAddress?.emailAddress ?? null;
}

/* ------------------------------------------------------------ authorising */

/**
 * Let them in, or send them somewhere they can do something about it.
 *
 * Three different outcomes, because they are three different problems:
 *
 *   - no session at all → Clerk's sign-in page, carrying where they were going,
 *     so signing in finishes the journey instead of dumping them on a dashboard;
 *   - a session without the rank → /account?denied=…, which is the one screen
 *     that already knows who they are signed in as and already offers the only
 *     fix there is, which is to sign out and sign in as somebody else;
 *   - a session whose role cannot be read at all → no redirect anywhere. See
 *     below, because this one is not about the person in front of the screen.
 *
 * A 404 would hide the existence of /admin from a customer who guessed the URL.
 * It would also hide it from a baker who mistyped, and this is a staff of a few
 * people who all know both portals exist. Saying so plainly is worth more here
 * than concealing a URL that is already in the source of the admin's own nav.
 *
 * ## Why the unreadable-role case redirects nowhere
 *
 * `loadProfile` returns null when there is no DATABASE_URL on the deployment,
 * or when the database cannot be reached. That is not a fact about the visitor:
 * their session is valid and their row may well say ADMIN. Every redirect
 * available here makes it worse, because each one comes straight back:
 *
 *   - to sign-in → Clerk sees a live session and returns them here, with the
 *     same session and the same unreadable role, about twice a second;
 *   - to /account?denied=… → /account is itself guarded by this function, so
 *     the refusal re-enters the guard that issued it.
 *
 * So it throws, and a misconfigured deployment gets a 500 it can find in its
 * own error tracking instead of a blank page in a loop. This is also why the
 * checks below read the session and the row separately rather than through
 * `getViewer`: that returns null for a guest and for an unreadable row alike,
 * and those are the two cases that must not be treated the same.
 *
 * `getViewer` keeps that conflation on purpose for its own callers — /api/me
 * draws fewer rows when it cannot read a role, which is the safe direction for
 * a menu. A gate is different: one that cannot read the rule must not guess.
 *
 * **Hazard:** this refuses by throwing, which is how `redirect` works in Next.
 * A caller that wraps it in a try/catch swallows the refusal and carries on
 * into the protected code. Call it as the first statement of the function, and
 * never inside a `try`.
 */
export async function requireRole(need: UserRole): Promise<Viewer> {
  const userId = await getUserId();
  const profile = userId ? await loadProfile(userId) : null;

  switch (verdictFor(Boolean(userId), profile?.role, need)) {
    case "allow":
      // Re-checked rather than asserted. An `allow` that arrived without both
      // of these would be a bug in the rules, and the safe reading of a bug in
      // the rules is to refuse — which is what falling through to the throw
      // below does.
      if (userId && profile) return { userId, profile };
      break;

    case "sign-in":
      // Clerk's own parameter, so its sign-in page returns them here afterwards.
      // Derived from the requirement rather than taken from the request, which
      // is what keeps it from becoming an open redirect: nothing a visitor types
      // can reach it.
      redirect(`/sign-in?redirect_url=${encodeURIComponent(areaFor(need))}`);
      break;

    case "denied":
      redirect(`/account?denied=${need.toLowerCase()}`);
      break;

    case "unavailable":
      break;
  }

  // Three causes reach here and the message names all of them, because the
  // first is the one a deployment hits and the other two are the ones an
  // operator would otherwise chase. `loadProfile` has already logged the Prisma
  // error itself if there was one.
  throw new Error(
    "authorisation_unavailable: signed in, but this request's role could not be "
    + "read. Either this deployment has no DATABASE_URL, or the database did not "
    + "answer, or the row names a role this build cannot rank.",
  );
}

/** Where to come back to after signing in. */
function areaFor(need: UserRole): string {
  return need === "ADMIN" ? "/admin" : need === "KITCHEN" ? "/kitchen" : "/account";
}

/** /admin. Owner only. */
export function requireAdmin(): Promise<Viewer> {
  return requireRole("ADMIN");
}

/** /kitchen. Bakers, and the owner — see lib/roles' ROLE_RANK. */
export function requireKitchen(): Promise<Viewer> {
  return requireRole("KITCHEN");
}
