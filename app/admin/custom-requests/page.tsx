import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { aBtn, Card, EmptyState, Notice, PageHeader, Ref, StatusBadge, type BadgeTone } from "@/components/admin/ui";
import { cancelCustomRequestAction } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, BadgeTone> = { no_bakery: "bad", paid: "good", quoted: "accent", awaiting_quote: "warn", cancelled: "plain", expired: "plain", declined: "plain" };

export default async function CustomRequestsAdmin() {
  await requireAdmin();
  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;
  const requests = await db.customRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      vendor: { select: { name: true } },
      order: { select: { ref: true } },
      notifications: { where: { status: "failed" }, select: { id: true }, take: 1 },
    },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Custom requests" blurb="Every custom cake request, newest first (latest 100). Follow up on any with a failed message." />
      {!requests.length && <EmptyState title="No custom requests yet" />}
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.photoUrl} alt="" className="size-16 shrink-0 rounded-a-sm object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Ref>{r.ref}</Ref>
                  <StatusBadge label={r.status.replace("_", " ")} tone={TONE[r.status] ?? "plain"} />
                  {r.notifications.length > 0 && <StatusBadge label="message failed" tone="bad" />}
                </div>
                <p className="font-a-sans text-a-body">{r.name} · {r.phone}</p>
                <p className="font-a-sans text-a-small text-a-muted">
                  {r.vendor?.name ?? "No bakery yet"}
                  {r.vendorQuotePaise != null && ` · bakery ${formatINR(r.vendorQuotePaise)}`}
                  {r.quotePaise != null && ` · customer ${formatINR(r.quotePaise)}`}
                </p>
                {r.order && <Link href={`/admin/orders/${r.order.ref}`} className="font-a-sans text-a-small underline">Order {r.order.ref}</Link>}
              </div>
              {(r.status === "awaiting_quote" || r.status === "quoted") && (
                <form action={cancelCustomRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={aBtn("danger", "md")}>Cancel</button>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
