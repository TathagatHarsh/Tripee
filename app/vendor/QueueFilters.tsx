import Link from "next/link";
import { aBtn, aField } from "@/components/admin/ui";
import { dueAt } from "@/lib/orders";
import { dueUrgency, VENDOR_STATUS_LABEL } from "@/lib/vendors";
import type { VendorCard } from "./data";
export type QueueQuery = {
  q?: string;
  status?: string;
  date?: string;
  priority?: string;
};
export function filterQueue(cards: VendorCard[], query: QueueQuery, now: Date) {
  const needle = (query.q ?? "").trim().toLowerCase();
  return cards
    .filter((card) => {
      const date = new Date(dueAt(card.order).getTime() + 19800000)
        .toISOString()
        .slice(0, 10);
      return (
        (!needle ||
          [
            card.order.ref,
            card.order.customerName,
            card.order.cakeName,
            ...card.order.cakes.map((c) => c.cakeName),
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)) &&
        (!query.status || card.status === query.status) &&
        (!query.date || query.date === date) &&
        (!query.priority ||
          (query.priority === "urgent"
            ? ["urgent", "soon"].includes(dueUrgency(dueAt(card.order), now))
            : dueUrgency(dueAt(card.order), now) === query.priority))
      );
    })
    .sort((a, b) => dueAt(a.order).getTime() - dueAt(b.order).getTime());
}
export function QueueFilters({
  query,
  action = "/vendor",
}: {
  query: QueueQuery;
  action?: string;
}) {
  return (
    <form
      action={action}
      className="grid items-end gap-3 rounded-a border border-a-line bg-a-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
    >
      <label className="flex flex-col gap-1.5 text-a-small text-a-muted">
        Search orders
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Reference, customer or cake"
          className={aField()}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-a-small text-a-muted">
        Status
        <select
          name="status"
          defaultValue={query.status ?? ""}
          className={aField()}
        >
          <option value="">All statuses</option>
          {Object.entries(VENDOR_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-a-small text-a-muted">
        Due date
        <input
          name="date"
          type="date"
          defaultValue={query.date}
          className={aField()}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-a-small text-a-muted">
        Priority
        <select
          name="priority"
          defaultValue={query.priority ?? ""}
          className={aField()}
        >
          <option value="">All priorities</option>
          <option value="late">Overdue</option>
          <option value="urgent">Due soon</option>
          <option value="later">Upcoming</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button className={aBtn("primary")}>Apply</button>
        <Link href={action} className={aBtn("ghost")}>
          Reset
        </Link>
      </div>
    </form>
  );
}
