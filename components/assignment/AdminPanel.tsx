import { CorrectLocation } from "./CorrectLocation";
import type {
  AssignmentState,
  VendorOrder,
  VendorOrderEvent,
} from "@prisma/client";
import { pointFrom } from "@/lib/assignmentRules";
import { AssignmentMap, type MapPin } from "./Map";
import { AssignmentRefresh } from "./Refresh";
import { formatIST } from "@/lib/format";
type Attempt = VendorOrder & {
  vendor: { name: string; latitude: number | null; longitude: number | null };
  events: VendorOrderEvent[];
};
export function AdminAssignmentPanel({
  state,
  note,
  location,
  attempts,
  createdAt,
  orderRef,
}: {
  orderRef: string;
  state: AssignmentState;
  note: string | null;
  location: unknown;
  attempts: Attempt[];
  createdAt: Date;
}) {
  const customer = pointFrom(location),
    accepted = attempts.find((a) => a.assignmentStatus === "ACCEPTED");
  const pins: MapPin[] = customer
    ? [{ ...customer, label: "Customer", kind: "customer" }]
    : [];
  const mapped = new Set<string>();
  for (const a of attempts) {
    if (mapped.has(a.vendorId)) continue;
    mapped.add(a.vendorId);
    const point = pointFrom(a.vendor);
    if (point)
      pins.push({
        ...point,
        label: a.vendor.name,
        kind: a.vendorId === accepted?.vendorId ? "assigned" : "bakery",
      });
  }
  const timeline = attempts
    .flatMap((a) =>
      a.events.map((e) => ({
        id: e.id,
        at: e.createdAt,
        label: `${a.vendor.name} · ${e.reason ?? e.toStatus.replaceAll("_", " ")}`,
      })),
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return (
    <section className="rounded-xl border border-a-line bg-a-surface p-5 shadow-a-card">
      <AssignmentRefresh />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-a-muted">
            Vendor assignment
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {accepted
              ? `✓ ${accepted.vendor.name}`
              : state === "MANUAL"
                ? "Main bakery attention needed"
                : state === "OFFERED"
                  ? "Awaiting vendor response"
                  : "Awaiting admin vendor selection"}
          </h2>
          {note && <p className="mt-2 text-sm text-a-warn-ink">{note}</p>}
        </div>
        <span className="rounded-full bg-a-accent-wash px-3 py-1 text-xs font-semibold text-a-accent-ink">
          {state}
        </span>
      </div>
      {state === "MANUAL" && <details className="my-4"><summary className="cursor-pointer text-sm">Correct delivery location</summary><CorrectLocation orderRef={orderRef} /></details>}
      {pins.length > 0 && <AssignmentMap pins={pins} />}
      <ol className="mt-5 divide-y divide-a-line">
        {[...attempts]
          .sort((a, b) => a.sequence - b.sequence)
          .map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <p className="font-semibold">
                  {a.sequence}. {a.vendor.name}
                </p>
                <p className="text-xs text-a-muted">
                  {a.distanceKm?.toFixed(1) ?? "—"} km ·{" "}
                  {a.estimatedMinutes == null
                    ? "—"
                    : Math.ceil(a.estimatedMinutes)}{" "}
                  min
                  {a.routeSource === "haversine_estimate"
                    ? " · Approximate"
                    : ""}
                </p>
                {a.rejectionReason && (
                  <p className="text-xs text-a-muted">{a.rejectionReason}</p>
                )}
              </div>
              <span
                className={
                  a.assignmentStatus === "ACCEPTED"
                    ? "font-semibold text-a-good-ink"
                    : "text-sm text-a-muted"
                }
              >
                {!a.offeredAt ? "○ Not contacted" : a.assignmentStatus}
              </span>
            </li>
          ))}
      </ol>
      <h3 className="mt-6 font-semibold">Assignment timeline</h3>
      <ol className="mt-3 ml-2 border-l-2 border-a-accent-line pl-5 text-sm">
        <li className="relative pb-4">
          <p>Order placed</p>
          <time className="text-xs text-a-muted">{formatIST(createdAt)}</time>
        </li>
        <li className="pb-4">Awaiting admin vendor selection</li>
        {timeline.map((e) => (
          <li key={e.id} className="relative pb-4">
            <span className="absolute -left-[27px] top-1 size-2.5 rounded-full bg-a-accent-ink" />
            <p>{e.label}</p>
            <time className="text-xs text-a-muted">{formatIST(e.at)}</time>
          </li>
        ))}
        {accepted && (
          <li className="font-semibold text-a-good-ink">✓ Order assigned</li>
        )}
        {state === "MANUAL" && (
          <li className="text-a-warn-ink">Returned to main bakery</li>
        )}
      </ol>
    </section>
  );
}
