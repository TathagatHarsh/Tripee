import { requireAdmin } from "@/lib/auth";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { Notice, PageHeader } from "@/components/admin/ui";
export const dynamic = "force-dynamic";
function followUpCutoff() { return new Date(Date.now() - 15 * 60000); }
export default async function PaymentsAdmin() {
  await requireAdmin();
  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;
  const [refunds, recoveries] = await Promise.all([
    db.refundOperation.findMany({ where: { status: { not: "processed" } }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.paymentRecovery.findMany({ where: { status: { not: "completed" }, createdAt: { lt: followUpCutoff() } }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  return <div className="space-y-6">
    <PageHeader title="Payment follow-up" blurb="Unsettled refunds and checkouts awaiting reconciliation. Check Razorpay before taking any manual payment or refund action." />
    <section><h2 className="text-lg font-semibold">Refunds ({refunds.length})</h2>
      {!refunds.length && <p>No unsettled refunds recorded.</p>}
      <ul className="space-y-3">{refunds.map(r => <li key={r.paymentId} className="rounded border p-3"><p>{r.paymentId} · {r.status}</p><p>{r.refundId ?? "Awaiting gateway confirmation"}</p>{r.lastError && <p>Automatic retry needs attention. Check the gateway and server logs.</p>}</li>)}</ul>
    </section>
    <section><h2 className="text-lg font-semibold">Unfinished checkouts ({recoveries.length})</h2>
      <p>These can include abandoned checkouts with no charge. Verify the gateway receipt before acting. Showing up to 100 oldest records.</p>
      <ul className="space-y-3">{recoveries.map(r => <li key={r.id} className="rounded border p-3">{r.id} · {r.status}{r.lastError && " · Reconciliation needs attention"}</li>)}</ul>
    </section>
  </div>;
}
