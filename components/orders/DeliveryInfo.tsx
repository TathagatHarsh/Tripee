import { entryFor, type CatalogSnapshot } from "@/lib/catalogSnapshot";
import { zoneForPincode } from "@/lib/delivery";
import { formatIST } from "@/lib/format";
import { dueAt, PHASE } from "@/lib/orders";

/** Delivery details are frozen on the order; the live catalogue is only a legacy fallback. */
export function DeliveryInfo({
  order,
  catalog,
  deliveredAt,
}: {
  order: {
    customerName: string | null;
    customerPhone: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    requestedFor?: Date | null;
    requestedWindow?: string | null;
    dueAt?: Date | null;
    confirmedAt?: Date | null;
    deliveryInstructions?: string | null;
    pincode: string | null;
    deliverySlot: string;
    createdAt: Date;
    leadHours: number;
    status: import("@prisma/client").OrderStatus;
  };
  catalog: CatalogSnapshot;
  /** The recorded arrival, when there is one. Beats any estimate. */
  deliveredAt: Date | null;
}) {
  const slot = entryFor(catalog, "delivery", order.deliverySlot);
  const zone = zoneForPincode(order.pincode ?? undefined, catalog);
  const pickup = order.deliverySlot === "pickup";
  const live = PHASE[order.status] === "active";

  return (
    <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
      <Row k={pickup ? "Collected by" : "Delivering to"} v={order.customerName ?? "Not given"} />
      {!pickup && order.addressLine1 && <Row k="Delivery address" v={[order.addressLine1,order.addressLine2,order.landmark,order.city,order.state,order.pincode].filter(Boolean).join(", ")} />}
      {order.requestedFor && <Row k="Requested date" v={formatIST(order.requestedFor)} />}
      {order.deliveryInstructions && <Row k="Delivery instructions" v={order.deliveryInstructions} />}
      <Row k="On this number" v={order.customerPhone ?? "Not given"} mono />
      <Row
        k={pickup ? "Collection" : "Area"}
        v={
          pickup
            ? catalog.bakery.address || "The counter"
            : order.pincode
              ? `${order.pincode}${zone ? ` · ${zone.name}` : ""}`
              : "Taken on the confirmation call"
        }
      />
      <Row k={pickup ? "Counter hours" : "Window"} v={order.requestedWindow ?? (pickup ? catalog.bakery.hours : slot?.slotWindow ?? slot?.name ?? order.deliverySlot)} />

      {deliveredAt ? (
        <Row
          k={pickup ? "Collected" : "Delivered"}
          v={formatIST(deliveredAt)}
          mono
        />
      ) : (
        live && (
          <Row
            k={pickup ? "Ready by" : "Expected by"}
            v={formatIST(dueAt(order))}
            mono
            emphasis
          />
        )
      )}
    </dl>
  );
}

function Row({
  k,
  v,
  mono = false,
  emphasis = false,
}: {
  k: string;
  v: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-s-line py-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0">
      <dt className="font-mono text-[0.6875rem] tracking-[0.13em] text-s-bark uppercase">{k}</dt>
      <dd
        className={[
          "text-[0.9375rem] leading-snug",
          mono ? "font-mono tabular-nums" : "",
          emphasis ? "font-medium text-s-live" : "text-s-cocoa",
        ].join(" ")}
      >
        {v}
      </dd>
    </div>
  );
}
