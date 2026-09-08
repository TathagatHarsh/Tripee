import Link from "next/link";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { eyebrow } from "@/lib/ui";
import {
  AddZone, MinOrderForm, SlotRow, ZoneRow,
  type SlotRowData, type ZoneRowData,
} from "./DeliveryForms";

/**
 * What we promise, and how far it reaches.
 *
 * Two halves that only make sense beside each other: a slot says how long
 * something takes, a zone says who can have it. Express can be four hours on
 * this page and unreachable in half the city on the same page, and seeing both
 * at once is what stops that being a surprise — so each slot prints the zones
 * that actually offer it, and a slot no zone lists says so out loud.
 *
 * Whether a slot is offered at all is not here. That is availability, it lives
 * on the catalogue page beside every other option's availability, and one
 * switch in two places is how the two come to disagree.
 */

export const dynamic = "force-dynamic";

export default async function DeliveryAdmin() {
  if (!hasDatabase()) {
    return (
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const [slotRows, zoneRows, settings] = await Promise.all([
    db.catalogOption.findMany({
      where: { category: "delivery" },
      orderBy: { sortOrder: "asc" },
    }),
    db.deliveryZone.findMany({ orderBy: { sortOrder: "asc" } }),
    db.pricingSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const slots: SlotRowData[] = slotRows.map((s) => ({
    id: s.id,
    value: s.value,
    name: s.name,
    priceInputPaise: s.priceInputPaise,
    leadHours: s.leadHours ?? 0,
    slotWindow: s.slotWindow ?? "",
    slotNote: s.slotNote ?? "",
    isAvailable: s.isAvailable,
  }));

  const zones: ZoneRowData[] = zoneRows.map((z) => ({
    id: z.id,
    name: z.name,
    pincodeFrom: z.pincodeFrom,
    pincodeTo: z.pincodeTo,
    extraHours: z.extraHours,
    slots: z.slots,
    isActive: z.isActive,
  }));

  /** Which live zones carry each slot — the answer to "who can actually pick this". */
  const offeredIn = (value: string) =>
    zones.filter((z) => z.isActive && z.slots.includes(value)).map((z) => z.name).join(", ");

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <span className={eyebrow}>Delivery</span>
        <h1 className="text-heading">Windows, and how far they reach</h1>
        <p className="max-w-prose text-body leading-relaxed text-steel">
          A lead time here is the promise the builder quotes and the clock the
          board measures lateness against, so shortening one shortens what the
          kitchen has agreed to. Orders already placed keep the lead time they
          were quoted.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-item">Minimum order</h2>
        <MinOrderForm minOrderPaise={settings?.minOrderPaise ?? 0} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-item">Slots</h2>
          <p className="font-mono text-micro text-steel">
            Turn a slot on or off on the{" "}
            <Link href="/admin/catalog#delivery" className="underline underline-offset-2">
              catalogue page
            </Link>
          </p>
        </div>
        <ul className="border border-rule bg-paper">
          {slots.map((s) => (
            <SlotRow key={s.id} slot={s} offeredIn={offeredIn(s.value)} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-item">Zones</h2>
          <p className="font-mono text-micro text-steel">
            {zones.filter((z) => z.isActive).length} delivering · {zones.length} total
          </p>
        </div>

        {zones.length === 0 ? (
          <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
            No zones. With none set up the site falls back to the map it shipped
            with rather than refusing every pincode — add one below to take over.
          </p>
        ) : (
          <ul className="border border-rule bg-paper">
            {zones.map((z) => (
              <ZoneRow key={z.id} zone={z} slots={slots} />
            ))}
          </ul>
        )}

        <p className="max-w-prose font-sans text-meta leading-relaxed text-steel">
          A pincode in no zone is refused at the builder, before anybody spends
          ten minutes designing a cake we cannot get to them. Ranges are
          inclusive and are checked in the order shown.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-item">Add a zone</h2>
        <AddZone slots={slots} />
      </section>
    </div>
  );
}
