import Link from "next/link";
import type { Metadata } from "next";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { openTotal } from "@/lib/ops";
import {
  aBtn, Card, CardHead, DataTable, EmptyState, Notice, PageHeader, StatusBadge, Td, Th, Tr,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { vendorLoads } from "../data";
import { VendorForm } from "./VendorForms";

/**
 * The partner bakeries.
 *
 * A short list by design — the business model is two or three of them — which
 * is why the add form sits on this page rather than behind a "New vendor"
 * route. A page somebody visits four times in the shop's lifetime should not
 * make them navigate to do the thing they came for.
 *
 * The only number on each row is how many orders that bakery is currently
 * holding, because that is the question the office is actually asking when it
 * opens this: who has capacity today. Totals, revenue and lifetime counts are
 * analytics, which Phase 2 is explicitly not.
 */

export const metadata: Metadata = {
  title: "Vendors — Admin — MakeYourCakes",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Vendors" />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  /*
   * The same counts the dashboard's workload panel draws, from the same
   * function — see app/admin/data.ts. A second `groupBy` here would be a second
   * chance for the two screens to disagree about how many orders a bakery has,
   * which is the one number this page exists to report.
   *
   * Already sorted busiest-first with inactive bakeries at the bottom, which is
   * the order the office reads it in: the question is who can take the next one.
   */
  const [vendors, contacts] = await Promise.all([
    vendorLoads(),
    db.vendor.findMany({ select: { id: true, phone: true, email: true } }),
  ]);

  /* Contact details are not part of a workload, so `VendorLoad` does not carry
     them and this joins the two by id rather than widening a type about counts
     into a type about phone numbers. */
  const contactOf = new Map(contacts.map((c) => [c.id, c]));
  const active = vendors.filter((v) => v.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Vendors"
        blurb={
          "The bakeries that make the cakes. An order is assigned to one of them "
          + "from its own page, and they see it on their own dashboard."
        }
      />

      <Card flush>
        <CardHead
          title="Partner bakeries"
          note={
            vendors.length === 0
              ? "None yet."
              : `${active} active of ${vendors.length}. Deactivating one takes it out of the picker `
                + "and leaves the orders it already holds alone."
          }
        />

        {vendors.length === 0 ? (
          <EmptyState
            icon="vendor"
            title="No bakeries yet"
            blurb={
              "Add the first one below. Until there is at least one active vendor, "
              + "orders cannot be assigned and stay in the shop's own hands."
            }
          />
        ) : (
          <DataTable
            /* Eight columns need the room. The table scrolls inside itself —
               the page never does, which is what keeps this readable on a
               tablet in the office. */
            minWidth="56rem"
            caption="Partner bakeries, busiest first, inactive last"
            head={
              <>
                <Th>Bakery</Th>
                <Th>Contact</Th>
                {/* The four open states, as four columns rather than one total.
                    Each is a different job — answer it, start it, finish it,
                    hand it over — which is the same reason lib/vendors'
                    VENDOR_BUCKET splits a bakery's own dashboard four ways. */}
                <Th align="right">To answer</Th>
                <Th align="right">Preparing</Th>
                <Th align="right">Ready</Th>
                <Th align="right">Open</Th>
                <Th>Status</Th>
                <Th />
              </>
            }
          >
            {vendors.map((v) => (
              <Tr key={v.id} className={v.isActive ? "" : "bg-a-sunken"}>
                <Td>
                  <Link
                    href={`/admin/vendors/${v.id}`}
                    className="font-medium text-a-accent-ink underline decoration-a-accent-line underline-offset-2 hover:decoration-a-accent"
                  >
                    {v.name}
                  </Link>
                </Td>
                <Td>
                  <span className="font-a-mono text-a-meta tabular-nums text-a-muted">
                    {contactOf.get(v.id)?.phone ?? contactOf.get(v.id)?.email ?? "—"}
                  </span>
                </Td>
                {/* Amber only when somebody is waiting on this bakery — the one
                    number here that is a job rather than a fact. */}
                <Td align="right">
                  <span
                    className={`font-a-mono tabular-nums ${
                      v.assigned > 0 ? "font-medium text-a-warn-ink" : "text-a-faint"
                    }`}
                  >
                    {v.assigned === 0 ? "—" : v.assigned}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-a-mono tabular-nums">
                    {v.inPreparation === 0 ? "—" : v.inPreparation}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-a-mono tabular-nums">
                    {v.ready === 0 ? "—" : v.ready}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-a-mono font-medium tabular-nums">
                    {openTotal(v) === 0 ? "—" : openTotal(v)}
                  </span>
                </Td>
                <Td>
                  <StatusBadge
                    label={v.isActive ? "Active" : "Inactive"}
                    tone={v.isActive ? "good" : "plain"}
                  />
                </Td>
                <Td align="right">
                  <Link href={`/admin/vendors/${v.id}`} className={aBtn("quiet", "sm")}>
                    Open
                    <Icon name="chevronRight" size={14} />
                  </Link>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card flush>
        <CardHead
          title="Add a bakery"
          note="Only the name is required. The rest is how the office reaches them."
        />
        <VendorForm />
      </Card>
    </div>
  );
}
