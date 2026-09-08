import { DEFAULT_BAKERY } from "@/lib/catalogDefaults";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { eyebrow } from "@/lib/ui";
import { BakeryForm } from "./BakeryForm";

/**
 * Who the bakery is.
 *
 * Kept apart from the catalogue because nothing here changes a total: this is
 * the letterhead, and the reason it gets its own screen is that somebody
 * editing an address should be in no danger of editing a price.
 *
 * There is no currency setting, on purpose. Every amount in this product is
 * paise and every format is formatINR, so a currency dropdown would change a
 * symbol and quietly misdescribe the arithmetic underneath it. When there is a
 * second currency there will be a real conversion to go with it.
 */

export const dynamic = "force-dynamic";

export default async function SettingsAdmin() {
  if (!hasDatabase()) {
    return (
      <p className="border border-rule bg-paper px-4 py-3.5 text-body leading-snug text-steel">
        {NO_DATABASE_MESSAGE}
      </p>
    );
  }

  const row = await db.bakerySettings.findUnique({ where: { id: "singleton" } });
  const bakery = row ?? { ...DEFAULT_BAKERY, orderNotifyEmail: null };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className={eyebrow}>The bakery</span>
        <h1 className="text-heading">Name, number, address</h1>
        <p className="max-w-prose text-body leading-relaxed text-steel">
          What goes on the documents a customer keeps and the kitchen works from.
          None of it changes a price.
        </p>
      </header>

      <BakeryForm
        bakery={{
          name: bakery.name,
          phone: bakery.phone,
          email: bakery.email,
          address: bakery.address,
          hours: bakery.hours,
          fssaiLicence: bakery.fssaiLicence,
          orderNotifyEmail: bakery.orderNotifyEmail ?? null,
        }}
      />
    </div>
  );
}
