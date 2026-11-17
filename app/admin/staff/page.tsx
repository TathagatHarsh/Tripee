import { requireAdmin } from "@/lib/auth";
import type { Metadata } from "next";
import { clerkClient } from "@clerk/nextjs/server";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatIST } from "@/lib/format";
import { Notice, PageHeader } from "@/components/admin/ui";
import { GrantAdminForm, RevokeAdminButton } from "./StaffForms";

export const metadata: Metadata = { title: "Staff — Admin — MakeYourCakes" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", KITCHEN: "Kitchen" };

/**
 * Who has a job here, read off the same rows `npm run role` reads.
 *
 * Admins can make and remove admins here (see lib/staffRoles for the rules that
 * make that safe); KITCHEN is still set with the command. Every change, from
 * either place, is listed at the bottom.
 */
export default async function StaffPage() {
  const viewer = await requireAdmin();
  if (!hasDatabase()) {
    return (
      <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
    );
  }

  const staff = await db.userProfile.findMany({
    where: { role: { not: "CUSTOMER" } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  const changes = await db.roleChange.findMany({ orderBy: { createdAt: "desc" }, take: 20 });

  const clerk = await clerkClient();
  const { data } = staff.length
    ? await clerk.users.getUserList({ userId: staff.map((s) => s.id), limit: 100 })
    : { data: [] };
  const emailOf = new Map(data.map((u) => [u.id, u.primaryEmailAddress?.emailAddress]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        blurb={
          `Who has a job here. ${staff.length} ${staff.length === 1 ? "person has" : "people have"} `
          + "a role above customer."
        }
      />

      {staff.length === 0 ? (
        <p className="rounded-a border border-a-line bg-a-surface px-4 py-3.5 text-a-body text-a-muted">
          Nobody has a staff role yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-a border border-a-line bg-a-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="border border-a-accent-line px-2 py-0.5 font-a-mono text-a-meta text-a-accent-ink">
                  {ROLE_LABEL[s.role] ?? s.role}
                </span>
                <span className="font-a-mono text-a-body">
                  {emailOf.get(s.id) ?? "(no longer a Clerk account)"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-a-mono text-a-meta text-a-muted">Since {formatIST(s.createdAt)}</span>
                {s.role === "ADMIN" && s.id !== viewer.userId && (
                  <RevokeAdminButton profileId={s.id} email={emailOf.get(s.id) ?? "this account"} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <GrantAdminForm />

      {changes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-a-sans text-a-body font-semibold text-a-ink">Recent role changes</h2>
          <ul className="flex flex-col gap-1">
            {changes.map((c) => (
              <li key={c.id} className="font-a-mono text-a-meta text-a-muted">
                {formatIST(c.createdAt)} · {c.targetEmail}: {c.fromRole ?? "no profile"} → {c.toRole} · by{" "}
                {c.actorId ? (c.actorEmail ?? c.actorId) : "command line"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="border-t border-a-line pt-4 font-a-sans text-a-small leading-relaxed text-a-muted">
        Kitchen access is still set by your developer with <code>npm run role</code>.
      </p>
    </div>
  );
}
