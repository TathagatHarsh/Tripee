import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth";
import { sizeDiameter, sizeName } from "@/lib/cakes";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { renderSpecSheet } from "@/lib/docket";
import { formatIST, titleCase } from "@/lib/format";
import { dueAt } from "@/lib/orders";
import {
  assignmentHistory, dueUrgency, isVendorFinished, VENDOR_NEXT, VENDOR_STATUS_LABEL,
  VENDOR_STATUS_TONE,
} from "@/lib/vendors";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { aEyebrow, Notice, StatusBadge } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { vendorOrder } from "../../data";
import { DueBadge } from "../../DueBadge";
import { OrderActions } from "../../OrderActions";

/**
 * One order, as a production ticket rather than a database row.
 *
 * §10's ordering, and it is the running order somebody standing at a bench
 * actually asks in: what am I making, when is it due, is there anything here
 * that will hurt somebody, what do I press when I am done. The specification
 * comes after all four, because it is read once while the cake is being built
 * and the other four are read at a glance.
 *
 * ## The photograph leads
 *
 * Which is the change from the previous version of this page, and the reason is
 * that a cake is a physical object somebody has to reproduce. `Order.cakeImageUrl`
 * is frozen at checkout, so this is the cake that was sold and not the row an
 * owner rephotographed this morning — §10's "use the frozen order data", and the
 * same rule the customer's tracking page follows.
 *
 * ## The spec sheet is the kitchen's, with the price taken off
 *
 * `renderSpecSheet(…, { omitPrice: true })` — the same document
 * /admin/orders/[ref]/print produces and the same one the kitchen board opens.
 * One renderer rather than a vendor-shaped copy of it, because a second
 * description of a cake is a second chance to describe it differently, and the
 * two would drift the first time a topping gained a property.
 *
 * `omitPrice` was written for the printed docket and is exactly right here for a
 * different reason: what the customer paid is the shop's business, and §10 is
 * explicit that price is not the vendor's focus. The prices in that section
 * would be *today's catalogue* rather than the frozen ones anyway. A bakery
 * needs the cake, not the invoice.
 *
 * ## Not theirs is a 404
 *
 * `vendorOrder` scopes on the session's own vendor id, so another bakery's
 * reference returns null and this calls `notFound()`. Deliberately not a
 * refusal: "you may not see this" would confirm that the reference exists, and
 * the honest answer to a vendor typing somebody else's reference is that it is
 * not one of their orders.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ ref: string }> },
): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} — Makemycake`, robots: { index: false, follow: false } };
}

export default async function VendorOrderDetail({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const { vendor } = await requireVendor();

  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;

  const [assignment, catalog] = await Promise.all([
    vendorOrder(vendor.id, ref),
    getCatalogSnapshot(),
  ]);

  if (!assignment) notFound();

  const { order, config, status } = assignment;
  const due = dueAt(order);
  const finished = isVendorFinished(status);
  /* One clock for this page, shared with the badge so the panel's edge and the
     countdown inside it can never be two readings taken a moment apart. See the
     note on app/vendor/OrderTicket.tsx. */
  const now = new Date();
  const urgent = !finished && dueUrgency(due, now) !== "later";
  const next = VENDOR_NEXT[status];

  const name = order.cakeName ?? "Custom cake";
  const message = config?.message?.trim();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/vendor"
        className="inline-flex min-h-11 w-fit items-center gap-1.5 text-a-small font-medium text-a-muted hover:text-a-accent-ink"
      >
        <Icon name="arrowLeft" size={15} />
        Kitchen
      </Link>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-a-mono text-a-title font-bold tabular-nums text-a-ink">{order.ref}</h1>
        <StatusBadge label={VENDOR_STATUS_LABEL[status]} tone={VENDOR_STATUS_TONE[status]} />
      </header>

      {/* ── what to make ─────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-a border border-a-line bg-a-surface">
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-a-sm border border-a-line bg-a-sunken sm:w-48">
            <CakePhoto
              src={order.cakeImageUrl}
              alt=""
              config={config}
              sizes="(min-width: 640px) 192px, 100vw"
              priority
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="font-a-sans text-a-title leading-tight font-bold tracking-[-0.015em] text-balance text-a-ink">
              {name}
            </h2>
            <dl className="flex flex-col gap-1.5 text-a-body">
              {config && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-a-muted">Size</dt>
                  <dd className="min-w-0 flex-1 font-medium text-a-ink">
                    {sizeName(config.size)}
                    <span className="ml-2 font-a-mono text-a-small font-normal text-a-muted">
                      {sizeDiameter(config.size)}
                    </span>
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-a-muted">Serves</dt>
                <dd className="min-w-0 flex-1 text-a-ink">
                  {order.servesMin}&ndash;{order.servesMax} people
                </dd>
              </div>
              {message && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-a-muted">Pipe</dt>
                  {/* Letter for letter. See the note on OrderTicket. */}
                  <dd className="min-w-0 flex-1 font-medium text-a-ink">
                    &ldquo;{message}&rdquo;
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {order.allergens.length > 0 && (
          <p className="flex items-start gap-1.5 border-t border-a-warn-line bg-a-warn-wash px-4 py-2.5 text-a-body leading-snug font-medium text-a-warn-ink">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>
              Contains {order.allergens.join(", ")}.{" "}
              <span className="font-normal">The customer was told this when they ordered.</span>
            </span>
          </p>
        )}
      </section>

      {/* ── when, which is the thing that decides the day ────────────────── */}
      <section
        className={`rounded-a border p-4 ${
          urgent ? "border-a-bad-line bg-a-bad-wash" : "border-a-line bg-a-surface"
        }`}
      >
        <h2 className={aEyebrow}>Due</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-a-mono text-a-lede font-semibold tabular-nums text-a-ink">
            {formatIST(due)}
          </p>
          {!finished && <DueBadge dueISO={due.toISOString()} nowISO={now.toISOString()} />}
        </div>
        <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-a-small">
          <div className="flex gap-2">
            <dt className="text-a-muted">Slot</dt>
            <dd className="text-a-ink">{titleCase(order.deliverySlot)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-a-muted">For</dt>
            <dd className="text-a-ink">{order.customerName ?? "No name taken"}</dd>
          </div>
        </dl>
      </section>

      {/* ── what to do next ──────────────────────────────────────────────── */}
      <section className="rounded-a border border-a-line bg-a-surface p-4">
        <h2 className={aEyebrow}>{next.length > 0 ? "What happens next" : "Status"}</h2>
        <p className="mt-1 mb-3 text-a-body leading-relaxed text-a-muted">
          {status === "assigned"
            ? "Makemycake has given you this order. Accept it to take it on, or decline "
              + "and say why so they can find somebody else."
            : status === "accepted"
              ? "Yours. Start preparation when you pick it up."
              : status === "in_preparation"
                ? "Being made. Mark it ready when it is finished and boxed."
                : status === "ready"
                  ? "Finished. Mark it handed over when it leaves you."
                  : status === "rejected"
                    ? "You declined this one. Makemycake will give it to another bakery — "
                      + "there is nothing further to do here."
                    : status === "withdrawn"
                      ? "Makemycake took this order back. It is not yours to make."
                      : "Handed over. Nothing further on this one."}
        </p>
        <OrderActions orderRef={order.ref} next={next} />
      </section>

      {/* ── the full specification ───────────────────────────────────────── */}
      <section className="rounded-a border border-a-line bg-a-surface">
        <div className="border-b border-a-line px-4 py-3">
          <h2 className="font-a-sans text-a-item font-semibold text-a-ink">Full specification</h2>
          <p className="mt-0.5 text-a-small text-a-muted">
            The same sheet the kitchen works from. Everything above is on it too.
          </p>
        </div>
        {config ? (
          /* Mono and scrolling inside itself: this is a document laid out in
             columns by lib/docket, and a proportional face breaks the alignment
             it depends on. On a phone the box scrolls, never the page. */
          <pre className="a-scroll-x px-4 py-3.5 font-a-mono text-a-meta leading-[1.75] text-a-ink">
{renderSpecSheet(config, catalog, {
  ref: order.ref,
  createdAt: order.createdAt,
  omitPrice: true,
})}
          </pre>
        ) : (
          <div className="p-4">
            <Notice tone="bad" icon="alert">
              This order&rsquo;s stored specification cannot be read by the current
              build, so no sheet can be produced. Ring Makemycake and take the
              details by hand before you start.
            </Notice>
          </div>
        )}
      </section>

      {/* ── what has happened to this assignment ─────────────────────────── */}
      <section className="rounded-a border border-a-line bg-a-surface p-4">
        <h2 className={aEyebrow}>History</h2>
        <ul className="mt-2.5 flex flex-col gap-1">
          {assignmentHistory(assignment).map((e) => (
            <li
              key={e.label}
              className="flex flex-wrap items-baseline justify-between gap-x-4 text-a-small"
            >
              <span className="text-a-muted">{e.label}</span>
              <span className="font-a-mono text-a-meta tabular-nums text-a-faint">
                {formatIST(e.at)}
              </span>
            </li>
          ))}
        </ul>
        {assignment.rejectionReason && (
          <p className="mt-2 border-t border-a-line pt-2 text-a-small leading-snug text-a-bad-ink">
            &ldquo;{assignment.rejectionReason}&rdquo;
          </p>
        )}
      </section>
    </div>
  );
}
