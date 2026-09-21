import { entryFor, type CatalogSnapshot } from "@/lib/catalogSnapshot";
import { zoneForPincode } from "@/lib/delivery";
import { formatIST } from "@/lib/format";
import { dueAt, PHASE } from "@/lib/orders";

/**
 * Where it is going, who it is going to, and when.
 *
 * ## Why there is no street address here
 *
 * Because there is none on the order. The Order model carries a name, a phone
 * number, a pincode and a slot, and the address is taken on the phone call the
 * bakery makes to confirm — see the `draft` state, which is literally called
 * "awaiting our call". Printing an "Address" row with a dash in it, or an
 * "Addresses" section in the account that saves nothing, would be an interface
 * describing a feature the product does not have. What is shown is what was
 * actually recorded, and the phone number is shown because that is the thing the
 * bakery will ring and the customer may need to correct.
 */
export function DeliveryInfo({
  order,
  catalog,
  deliveredAt,
}: {
  order: {
    customerName: string | null;
    customerPhone: string | null;
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
      <Row k={pickup ? "Counter hours" : "Window"} v={pickup ? catalog.bakery.hours : slot?.slotWindow ?? slot?.name ?? order.deliverySlot} />

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
