import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_SETTINGS } from "@/lib/catalogDefaults";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { ChargesForm } from "../ChargesForm";
import { aBtn, Card, CardHead, Notice, PageHeader, StatCard } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * The charges that are formulas rather than choices.
 *
 * A second tier, a fourth layer, a piped message, a drip, a sugar-free bake:
 * each is work somebody does and time somebody is paid for, and none of them is
 * a thing a customer picks off a shelf — they are consequences of a cake being
 * built a certain way. That is why they are `PricingSettings` and not
 * `CatalogOption` rows, and why they get a page rather than a table: five
 * numbers and a tax rate is a form, not a list.
 *
 * GST is here too, written and read as a percentage because that is how a rate
 * is spoken. It is stored in basis points so the database never holds a
 * fraction of a paisa — see the column comment in prisma/schema.prisma.
 *
 * The minimum order is on the delivery page rather than here, and that is
 * deliberate: it is the smallest order the kitchen will accept, which is an
 * operational limit on what can be delivered rather than a charge added to
 * anything. It sits next to the zones for the same reason.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — Admin",
  robots: { index: false, follow: false },
};

export default async function PricingAdmin() {
  const head = (
    <PageHeader
      title="Pricing"
      blurb="The charges that apply to how a cake is built rather than to a choice somebody makes, plus tax."
    >
      <Link href="/admin/catalog" className={aBtn("secondary", "md")}>
        <Icon name="arrowLeft" size={15} />
        Whole catalogue
      </Link>
    </PageHeader>
  );

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        {head}
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const settings = await db.pricingSettings.findUnique({ where: { id: "singleton" } });

  /*
   * The shipped defaults when the row is missing, which is the same fallback
   * lib/catalogData applies for the whole snapshot: a deployment that has not
   * been seeded should still quote a price rather than a NaN. The notice says
   * so, because a form full of numbers that are not in the database is a form
   * whose Save is the first write.
   */
  const charges = settings
    ? {
        tierSurchargePaise: settings.tierSurchargePaise,
        layerSurchargePaise: settings.layerSurchargePaise,
        messagePipingPaise: settings.messagePipingPaise,
        dripPaise: settings.dripPaise,
        sugarFreePaise: settings.sugarFreePaise,
        gstBasisPoints: settings.gstBasisPoints,
      }
    : {
        tierSurchargePaise: DEFAULT_SETTINGS.tierSurchargePaise,
        layerSurchargePaise: DEFAULT_SETTINGS.layerSurchargePaise,
        messagePipingPaise: DEFAULT_SETTINGS.messagePipingPaise,
        dripPaise: DEFAULT_SETTINGS.dripPaise,
        sugarFreePaise: DEFAULT_SETTINGS.sugarFreePaise,
        gstBasisPoints: Math.round(DEFAULT_SETTINGS.gstRate * 10_000),
      };

  return (
    <div className="flex flex-col gap-5">
      {head}

      {!settings && (
        <Notice tone="warn">
          These are the values the product shipped with — there is no pricing row
          in this database yet. Saving the form below writes one, after which
          these become the bakery&rsquo;s own numbers.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Per extra tier"
          value={formatINR(charges.tierSurchargePaise)}
          note="Dowels, boards and assembly"
        />
        <StatCard
          label="Per layer past three"
          value={formatINR(charges.layerSurchargePaise)}
          note="Extra sponge and extra filling"
        />
        <StatCard
          label="Message piping"
          value={formatINR(charges.messagePipingPaise)}
          note="Charged once, however long the message"
        />
        <StatCard
          label="GST"
          value={`${charges.gstBasisPoints / 100}%`}
          note="Added to every order"
          icon="pricing"
        />
      </div>

      <Card flush>
        <CardHead
          title="Charges and tax"
          note="Each of these was a number in the code until the portal existed. Changing one takes effect on the next quote."
        />
        <div className="p-4 sm:p-5">
          <ChargesForm charges={charges} />
        </div>
      </Card>

      <Notice tone="accent" icon="info">
        Orders already placed are unaffected by anything on this page. Every order
        froze its own price lines when it was taken, so a tier surcharge changed
        today changes what the next customer is quoted and nothing about a cake
        already in the kitchen.
      </Notice>
    </div>
  );
}
