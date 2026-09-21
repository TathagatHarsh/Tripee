import { allergenLine } from "@/lib/allergens";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { cakeSubtitle } from "@/lib/docket";
import { formatINR } from "@/lib/format";
import type { CakeConfig } from "@/lib/schema";
import { cakeDisplayName, sizeLabel } from "@/lib/shop";
import { CakeThumb } from "./CakeThumb";

/**
 * What was ordered.
 *
 * One item, always, and that is not a simplification of a cart — this backend
 * stores one assembled cake per order, which is why Order has a `config` column
 * rather than a line-items relation, and why a basket of three cakes becomes
 * three orders (see app/checkout). The OrderItem rows are the *price* lines of
 * that one cake and are shown as such by `<OrderSummary>`; presenting them here
 * as five products would tell a customer they bought a sponge, a filling and a
 * delivery separately.
 *
 * The quantity is stated anyway. "Quantity 1" is the answer to a question every
 * order list trains people to ask, and leaving it out to avoid printing a 1 is
 * cleverness at the reader's expense.
 */
export function OrderItems({
  config,
  catalog,
  amountPaise,
  servesMin,
  servesMax,
  cakeName,
  cakeImageUrl,
  allergens,
}: {
  config: CakeConfig | null;
  catalog: CatalogSnapshot;
  /** The cake's own share of the total — delivery and GST are the summary's. */
  amountPaise: number;
  servesMin: number;
  servesMax: number;
  /** `Order.cakeName` — what this cake was called when it was bought. */
  cakeName?: string | null;
  /** `Order.cakeImageUrl` — and what it looked like. */
  cakeImageUrl?: string | null;
  /** Explicit allergen snapshot from the validated production specification. */
  allergens?: string[];
}) {
  /* Both frozen values win over anything derived. An order is a record of what
     was agreed, and renaming or rephotographing the cake tomorrow must not
     rewrite it — see the note on these columns in prisma/schema.prisma. */
  const name = cakeDisplayName(config, catalog, cakeName);
  const size = sizeLabel(config, catalog);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      {/* Empty alt: the name is the h3 immediately beside it, and a picture
          that repeats the heading it sits next to is read twice. */}
      <CakeThumb config={config} alt="" sizes="128px" frozenImageUrl={cakeImageUrl} className="size-28" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-[1.1875rem] leading-tight">{name}</h3>

        {config && (
          <p className="text-[0.9375rem] leading-snug text-s-bark">
            {cakeSubtitle(config, catalog)}
          </p>
        )}

        {/* The size and the sponge are the variant that was bought, read off the
            order's own frozen config. Editing or deleting the cake tomorrow
            cannot reach either — see the note at the top of this component. */}
        <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-s-bark uppercase tabular-nums">
          Quantity 1{size && ` · ${size}`}
          {config && ` · ${config.eggless ? "Eggless" : "With egg"}`}
          {" · "}serves {servesMin}-{servesMax}
        </p>

        {/* The message is the customer's own words, piped onto the cake. Quoted
            rather than restyled, because getting it wrong is the complaint. */}
        {config?.message && (
          <p className="mt-1 border-l-2 border-s-berry/40 pl-3 text-[0.9375rem] leading-snug text-s-cocoa">
            Piped: &ldquo;{config.message}&rdquo;
          </p>
        )}

        {(allergens?.length || config) && (
          <p className="mt-1 text-[0.875rem] leading-relaxed text-s-bark">
            {allergens
              ? allergens.length > 0 ? `Contains: ${allergens.join(", ")}.` : "No declared allergens."
              : allergenLine(config!)}
          </p>
        )}
      </div>

      <p className="shrink-0 font-mono text-[1.0625rem] tabular-nums text-s-cocoa sm:text-right">
        {formatINR(amountPaise)}
      </p>
    </div>
  );
}
