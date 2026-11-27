import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { aBtn, Card, EmptyState, Notice, PageHeader, Ref, StatusBadge, type BadgeTone } from "@/components/admin/ui";
import { formatDue } from "@/lib/whatsappMessages";
import { requestSheetData } from "@/components/shop/QuoteButton";
import { siteUrl } from "@/lib/whatsapp";
import { cancelCustomRequestAction } from "./actions";
import { CopyLink } from "./CopyLink";
import { NewQuoteForm } from "./NewQuoteForm";
import { QuoteForm } from "./QuoteForm";

export const dynamic = "force-dynamic";

const TONE: Record<string, BadgeTone> = { no_bakery: "bad", paid: "good", quoted: "accent", awaiting_quote: "warn", cancelled: "plain", expired: "plain", declined: "plain" };

export default async function CustomRequestsAdmin() {
  await requireAdmin();
  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;
  const requests = await db.customRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: { select: { ref: true } },
      notifications: { where: { status: "failed" }, select: { id: true }, take: 1 },
    },
  });
  // The same gate as the website's form: a quote needs WhatsApp to arrive and online payment to be paid.
  const sheet = await requestSheetData();
  return (
    <div className="space-y-6">
      <PageHeader title="Custom requests" blurb="Every custom cake request, newest first (latest 100). Price one here, or reply to its WhatsApp message with what the customer pays. Follow up on any with a failed message." />
      <Card>
        <details>
          <summary className="cursor-pointer font-a-sans text-a-body font-medium">New quote for a customer who phoned</summary>
          <div className="pt-4">
            {sheet ? <NewQuoteForm {...sheet} /> : (
              <p className="font-a-sans text-a-small text-a-muted">Needs WhatsApp, photo storage and online payment to be set up.</p>
            )}
          </div>
        </details>
      </Card>
      {!requests.length && <EmptyState title="No custom requests yet" />}
      <ul className="space-y-3">
        {requests.map((r) => {
          const area = r.address as { locality?: string; city?: string };
          const facts: [string, string][] = [
            ["Size", `${r.sizeKg.toString()} kg`],
            ["Flavour", r.flavour],
            ["On the cake", r.cakeMessage || "—"],
            ["Delivery", formatDue(r.dueAt)],
            ["Area", area.locality || area.city || "—"],
            ["Requested", formatDue(r.createdAt)],
          ];
          return (
          <li key={r.id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <a href={r.photoUrl} target="_blank" rel="noreferrer" className="shrink-0" title="Open the full photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.photoUrl} alt="The customer's cake photo" className="size-24 rounded-a-sm object-cover" />
              </a>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Ref>{r.ref}</Ref>
                  <StatusBadge label={r.status.replace("_", " ")} tone={TONE[r.status] ?? "plain"} />
                  {r.notifications.length > 0 && <StatusBadge label="message failed" tone="bad" />}
                </div>
                <p className="font-a-sans text-a-body">{r.name} · {r.phone}</p>
                {r.quotePaise != null && <p className="font-a-sans text-a-small text-a-muted">Customer pays {formatINR(r.quotePaise)}</p>}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 font-a-sans text-a-small sm:grid-cols-4">
                  {facts.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-a-muted">{label}</dt>
                      <dd className="break-words text-a-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                {r.status === "quoted" && <CopyLink url={`${siteUrl()}/c/${r.token}`} />}
                {r.order && <Link href={`/admin/orders/${r.order.ref}`} className="font-a-sans text-a-small underline">Order {r.order.ref}</Link>}
                {(r.status === "awaiting_quote" || r.status === "no_bakery") && (
                  <div className="pt-2"><QuoteForm id={r.id} /></div>
                )}
              </div>
              {(r.status === "awaiting_quote" || r.status === "quoted" || r.status === "no_bakery") && (
                <form action={cancelCustomRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={aBtn("danger", "md")}>Cancel</button>
                </form>
              )}
            </Card>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
