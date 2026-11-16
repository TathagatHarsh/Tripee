import Link from "next/link";
import { ConfirmButton } from "@/app/admin/ConfirmButton";
import { DeliveryAddressSnapshot } from "@/components/DeliveryAddressSnapshot";
import { OrderStatusBadge, aBtn } from "@/components/admin/ui";
import { formatINR, placedAgo, titleCase } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import type { OrderPanelData } from "@/lib/orderPanelData";

/**
 * The orders workspace's quick view: a sticky column beside the list on a
 * laptop, a full-screen sheet on a phone. Assignment is automatic, so this
 * shows the bakery attempts and offers only calls, Confirm and the full page.
 */
const SHELL =
  "fixed inset-0 z-40 flex flex-col bg-a-surface lg:sticky lg:top-4 lg:inset-auto lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[380px] lg:shrink-0 lg:rounded-a lg:border lg:border-a-line lg:shadow-a-card";

function Close({ href }: { href: string }) {
  return (
    <Link href={href} scroll={false} aria-label="Close order" className={aBtn("quiet", "md", "size-11 px-0")}>
      <span aria-hidden className="lg:hidden">←</span>
      <span aria-hidden className="hidden lg:inline">✕</span>
    </Link>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 py-1.5">
      <dt className="text-a-small text-a-muted">{k}</dt>
      <dd className="min-w-0 text-a-body text-a-ink">{children}</dd>
    </div>
  );
}

export function OrderPanel({ data, closeHref }: { data: OrderPanelData | null; closeHref: string }) {
  if (!data) {
    return (
      <aside aria-label="Order" className={SHELL}>
        <div className="flex items-center justify-between gap-3 border-b border-a-line p-4">
          <h2 className="font-a-sans text-a-item font-semibold text-a-ink">Order not found</h2>
          <Close href={closeHref} />
        </div>
        <p className="p-4 text-a-body text-a-muted">It may have been removed, or the link is wrong.</p>
      </aside>
    );
  }

  const pickup = data.fulfillmentMethod === "pickup" || data.deliverySlot === "pickup";
  const secondary = aBtn("secondary", "md", "w-full");

  return (
    <aside aria-label={`Order ${data.ref}`} className={SHELL}>
      <div className="flex items-start justify-between gap-3 border-b border-a-line p-4">
        <div className="min-w-0">
          <h2 className="font-a-mono text-a-item font-semibold text-a-ink">{data.ref}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-a-small text-a-muted">
            <OrderStatusBadge status={data.status} label={STATUS_LABEL[data.status]} />
            <span>{placedAgo(data.createdAt, new Date())}</span>
            <span>· {titleCase(data.paymentStatus.replace(/_/g, " "))}</span>
            <span>· {formatINR(data.totalPaise)}</span>
          </p>
        </div>
        <Close href={closeHref} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {data.cakes.map((c, i) => (
          <div key={i} className="mb-3 flex gap-3">
            {c.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- small thumbnail from the order snapshot
              <img src={c.photoUrl} alt="" className="size-16 shrink-0 rounded-a object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-a-ink">
                {c.name}
                {c.size ? ` · ${c.size}` : ""}
                {c.eggType ? ` · ${c.eggType === "eggless" ? "Eggless" : "Egg"}` : ""}
              </p>
              {c.message && (
                <p className="mt-1 rounded-a border border-dashed border-a-accent-line bg-a-canvas px-2 py-1 text-a-small">
                  On cake: “{c.message}”
                </p>
              )}
            </div>
          </div>
        ))}

        <dl className="divide-y divide-a-line">
          <Row k={pickup ? "Pickup" : "Deliver"}>{data.deliveryWindow}</Row>
          {!pickup && (
            <Row k="Address">
              <DeliveryAddressSnapshot value={data.deliveryLocation} />
            </Row>
          )}
          <Row k="Customer">{data.customerName ?? data.customerPhone ?? "—"}</Row>
        </dl>

        <h3 className="mt-4 text-a-small font-semibold uppercase tracking-wide text-a-muted">Bakery progress</h3>
        {data.attemptLines.length ? (
          <ol className="mt-2 flex flex-col gap-1.5 text-a-body">
            {data.attemptLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-a-body text-a-muted">{data.bakeryLine || "No bakery offers yet."}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-a-line bg-a-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {data.status === "draft" && <ConfirmButton orderRef={data.ref} />}
        {data.callCustomerHref && (
          <a href={data.callCustomerHref} className={secondary}>
            Call customer
          </a>
        )}
        {data.whatsappHref && (
          <a href={data.whatsappHref} target="_blank" rel="noopener noreferrer" className={secondary}>
            WhatsApp customer
          </a>
        )}
        {data.callBakeryHref && (
          <a href={data.callBakeryHref} className={secondary}>
            Call bakery
          </a>
        )}
        <Link href={`/admin/orders/${data.ref}`} className="col-span-2 py-2 text-center text-a-body font-medium text-a-accent-ink underline">
          Open full order →
        </Link>
      </div>
    </aside>
  );
}
