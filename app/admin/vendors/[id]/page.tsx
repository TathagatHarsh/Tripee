import { Availability } from "@/components/inventory/Availability";
import { AssignmentRulesForm } from "../AssignmentRulesForm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { clerkClient } from "@clerk/nextjs/server";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatIST } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import {
  isVendorFinished, VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE,
} from "@/lib/vendors";
import {
  aEyebrow, Card, CardHead, EmptyState, Notice, OrderStatusBadge, PageHeader, Ref,
  StatusBadge,
} from "@/components/admin/ui";
import { ActiveToggle, LinkUserForm, UnlinkUserButton, VendorForm } from "../VendorForms";

/**
 * One bakery: who they are, who signs in as them, and what they are holding.
 *
 * Three sections in the order somebody needs them. The details are what you
 * came to edit; the logins are the thing that is easy to forget and impossible
 * to guess at from outside; the orders are the reason you were looking at all.
 *
 * ## What is not here
 *
 * No revenue, no acceptance rate, no average time to ready. Every one of those
 * is a number somebody would start managing a partner by, and Phase 2 is not
 * analytics — the brief says so twice. What the office needs from this page is
 * operational: can they take another order today, and is anything they hold
 * stuck.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  if (!hasDatabase()) return { title: "Vendor — Admin", robots: { index: false, follow: false } };
  const vendor = await db.vendor.findUnique({ where: { id }, select: { name: true } });
  return {
    title: `${vendor?.name ?? "Vendor"} — Admin — Makemycake`,
    robots: { index: false, follow: false },
  };
}

export default async function VendorDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Vendor" back={{ href: "/admin/vendors", label: "Back to vendors" }} />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const vendor = await db.vendor.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        /* Enough to work from, not a lifetime. A bakery that has taken four
           hundred orders does not need all four hundred on a page whose job is
           "what is happening now". */
        take: 30,
        select: {
          id: true,
          status: true,
          assignedAt: true,
          rejectionReason: true,
          order: { select: { ref: true, status: true, deliverySlot: true } },
        },
      },
    },
  });

  if (!vendor) notFound();

  /* Addresses live at Clerk, not here — the same lookup app/admin/staff does,
     and it survives an account having been deleted since. */
  const clerk = await clerkClient();
  const { data: accounts } = vendor.users.length
    ? await clerk.users.getUserList({ userId: vendor.users.map((u) => u.id), limit: 50 })
    : { data: [] };
  const emailOf = new Map(accounts.map((u) => [u.id, u.primaryEmailAddress?.emailAddress]));

  const holding = vendor.assignments.filter((a) => !isVendorFinished(a.status));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={vendor.name}
        back={{ href: "/admin/vendors", label: "Back to vendors" }}
      >
        <StatusBadge
          label={vendor.isActive ? "Active" : "Inactive"}
          tone={vendor.isActive ? "good" : "plain"}
        />
      </PageHeader>

      <Availability key={vendor.updatedAt.toISOString()} vendor={vendor} />
      <Link href={`/admin/inventory?vendor=${vendor.id}`} className="font-semibold underline">View Cake Availability</Link>
      {!vendor.isActive && (
        <Notice tone="warn" icon="alert">
          Deactivated, so this bakery cannot be given new orders and nobody can
          open its dashboard.{" "}
          {holding.length > 0 ? (
            <>
              It is still holding{" "}
              <span className="font-semibold">
                {holding.length} {holding.length === 1 ? "order" : "orders"}
              </span>
              , which nothing has touched — reassign them from each order&rsquo;s own
              page.
            </>
          ) : (
            "It is holding nothing."
          )}
        </Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ══════════════════════════════════════════════ the left column */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card flush>
            <CardHead title="Details" note="How the office reaches this bakery." />
            <VendorForm vendor={vendor} /><AssignmentRulesForm vendor={vendor} />
          </Card>

          <Card flush>
            <CardHead
              title="Orders"
              note={
                vendor.assignments.length === 0
                  ? "Nothing has been assigned to this bakery yet."
                  : `${holding.length} being worked on now. The ${vendor.assignments.length} most `
                    + "recent assignments, newest first."
              }
            />

            {vendor.assignments.length === 0 ? (
              <EmptyState
                icon="orders"
                title="No assignments"
                blurb="Orders are handed to a bakery from the order's own page."
              />
            ) : (
              <ul className="flex flex-col">
                {vendor.assignments.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1.5 border-b border-a-line px-4 py-3 last:border-0 sm:px-5"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Link href={`/admin/orders/${a.order.ref}`}>
                        <Ref className="text-a-accent-ink underline decoration-a-accent-line underline-offset-2">
                          {a.order.ref}
                        </Ref>
                      </Link>
                      <StatusBadge
                        label={VENDOR_STATUS_LABEL[a.status]}
                        tone={VENDOR_STATUS_TONE[a.status]}
                      />
                      {/* The customer's own status, beside the vendor's, because
                          they are two different facts about one docket and the
                          office is the only place both are visible. */}
                      <OrderStatusBadge
                        status={a.order.status}
                        label={STATUS_LABEL[a.order.status]}
                      />
                      <span className="ml-auto font-a-mono text-a-meta text-a-muted">
                        {formatIST(a.assignedAt)}
                      </span>
                    </div>
                    {a.rejectionReason && (
                      <p className="text-a-small leading-snug text-a-bad-ink">
                        &ldquo;{a.rejectionReason}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ═════════════════════════════════════════════ the right column */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className={aEyebrow}>Logins</h2>
            <p className="mt-2 text-a-meta leading-relaxed text-a-muted">
              Accounts that open this bakery&rsquo;s dashboard. They see the orders
              assigned here and nothing else in the portal.
            </p>

            {vendor.users.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {vendor.users.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-a border border-a-line px-3 py-2"
                  >
                    <span className="min-w-0 break-all font-a-mono text-a-meta text-a-ink">
                      {emailOf.get(u.id) ?? "(no longer an account)"}
                    </span>
                    <UnlinkUserButton profileId={u.id} />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 border-t border-a-line pt-3">
              <LinkUserForm vendorId={vendor.id} />
              <p className="mt-2 text-a-meta leading-relaxed text-a-muted">
                They have to sign in once at the shop first — that is what creates
                the account this links to. Linking never grants admin or kitchen
                access, and a staff account cannot be linked here at all.
              </p>
            </div>
          </Card>

          <Card>
            <h2 className={aEyebrow}>{vendor.isActive ? "Stop sending work" : "Start again"}</h2>
            <p className="mt-2 mb-3 text-a-small leading-relaxed text-a-muted">
              {vendor.isActive
                ? "Takes this bakery out of the assign picker and shuts its dashboard. "
                  + "Orders it is already holding are not touched — reassign those one at a time."
                : "Puts this bakery back in the assign picker and reopens its dashboard."}
            </p>
            <ActiveToggle id={vendor.id} isActive={vendor.isActive} />
          </Card>
        </div>
      </div>
    </div>
  );
}
