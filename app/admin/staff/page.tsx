import type { Metadata } from "next";
import { clerkClient } from "@clerk/nextjs/server";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatIST } from "@/lib/format";
import { eyebrow } from "@/lib/ui";

export const metadata: Metadata = { title: "Staff — Admin — Makemycake" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", KITCHEN: "Kitchen" };

/**
 * Who has a job here, read off the same rows `npm run role` reads.
 *
 * Nothing on this page writes anything — see scripts/role.ts and lib/auth.ts's
 * `loadProfile` for why a role is deliberately not something a request can set.
 * This exists so it can be seen without a shell; changing it still means the
 * command.
 */
export default async function StaffPage() {
  if (!hasDatabase()) {
    return (
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const staff = await db.userProfile.findMany({
    where: { role: { not: "CUSTOMER" } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  const clerk = await clerkClient();
  const { data } = staff.length
    ? await clerk.users.getUserList({ userId: staff.map((s) => s.id), limit: 100 })
    : { data: [] };
  const emailOf = new Map(data.map((u) => [u.id, u.primaryEmailAddress?.emailAddress]));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className={eyebrow}>Who works here</span>
        <h1 className="text-heading">Staff</h1>
        <p className="font-mono text-micro text-ink-35">{staff.length} with a role above customer</p>
      </header>

      {staff.length === 0 ? (
        <p className="border border-rule bg-paper px-4 py-3.5 text-body text-steel">
          Nobody has a staff role yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-rule bg-paper px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="border border-carbon px-2 py-0.5 font-mono text-micro text-carbon">
                  {ROLE_LABEL[s.role] ?? s.role}
                </span>
                <span className="font-mono text-body">
                  {emailOf.get(s.id) ?? "(no longer a Clerk account)"}
                </span>
              </div>
              <span className="font-mono text-micro text-steel">Since {formatIST(s.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-rule pt-4 font-sans text-meta leading-relaxed text-steel">
        Read-only, on purpose — the same reasoning is in scripts/role.ts. To change
        a role: <code className="font-mono">npm run role -- email ROLE</code>, run
        where DATABASE_URL and CLERK_SECRET_KEY live, never from a browser.
      </p>
    </div>
  );
}
