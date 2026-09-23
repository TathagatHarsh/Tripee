import { pointFrom } from "@/lib/assignmentRules";
import { AssignmentMap } from "./Map";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
export interface EarningSnapshot {
  status?: string;
  orderValuePaise: number | null;
  commissionPaise: number | null;
  feePaise: number | null;
  vendorEarningPaise: number | null;
  distanceKm: number | null;
  estimatedMinutes: number | null;
  routeSource: string | null;
  expiresAt: Date | null;
}
export function Earnings({
  snapshot: s,
  address,
  location,
  map = false,
}: {
  snapshot: EarningSnapshot;
  address: string;
  location: unknown;
  map?: boolean;
}) {
  const point = pointFrom(location);
  return (
    <section className="space-y-3 rounded-xl border border-a-line bg-a-surface p-4">
      <p className="text-sm text-a-muted">
        Delivery · {address || "Bakery pickup"}
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt>Distance</dt>
          <dd className="font-semibold">
            {s.distanceKm == null
              ? "Not recorded"
              : `${s.distanceKm.toFixed(1)} km`}
          </dd>
        </div>
        <div>
          <dt>Estimated travel</dt>
          <dd className="font-semibold">
            {s.estimatedMinutes == null
              ? "Not recorded"
              : `${Math.ceil(s.estimatedMinutes)} min`}
          </dd>
        </div>
        <div>
          <dt>Order value</dt>
          <dd>
            {s.orderValuePaise == null
              ? "Not recorded"
              : money(s.orderValuePaise)}
          </dd>
        </div>
        <div>
          <dt>Commission / fees</dt>
          <dd>
            {s.commissionPaise == null
              ? "Not recorded"
              : `${money(s.commissionPaise)} / ${money(s.feePaise ?? 0)}`}
          </dd>
        </div>
        <div className="col-span-2 rounded-lg bg-a-good-wash p-3">
          <dt>Your earnings</dt>
          <dd className="text-2xl font-semibold text-a-good-ink">
            {s.vendorEarningPaise == null
              ? "Not recorded for this historical order"
              : money(s.vendorEarningPaise)}
          </dd>
          <p className="mt-1 text-xs">
            Product subtotal less commission and fees. Tax and customer delivery
            charges are excluded.
          </p>
        </div>
      </dl>
      {s.routeSource === "haversine_estimate" && (
        <p className="text-xs text-a-warn-ink">
          Approximate straight-line distance and travel time; routing was
          unavailable.
        </p>
      )}
      {s.expiresAt && s.status === "assigned" && (
        <p className="text-xs">
          Response deadline:{" "}
          {s.expiresAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
          IST
        </p>
      )}
      {map && point && (
        <AssignmentMap
          pins={[{ ...point, kind: "customer", label: "Customer delivery" }]}
        />
      )}
    </section>
  );
}
