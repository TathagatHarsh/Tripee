import { allergenLine } from "@/lib/allergens";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { cakeSubtitle, cakeTitle } from "@/lib/docket";
import { formatINR } from "@/lib/format";
import type { CakeConfig } from "@/lib/schema";
import { CakeMark } from "./CakeMark";

/**
 * What was ordered.
 *
 * One item, always, and that is not a simplification of a cart — this product
 * sells one assembled cake per order, which is why Order has a `config` column
 * rather than a line-items relation. The OrderItem rows are the *price* lines of
 * that one cake and are shown as such by `<OrderSummary>`; presenting them here
 * as five products would tell a customer they bought a sponge, a filling and a
 * delivery separately.
 *
 * The quantity is stated anyway. "1 cake" is the answer to a question every
 * order list trains people to ask, and leaving it out to avoid printing a 1 is
 * cleverness at the reader's expense.
 */
export function OrderItems({
  config,
  catalog,
  amountPaise,
  servesMin,
  servesMax,
}: {
  config: CakeConfig | null;
  catalog: CatalogSnapshot;
  /** The cake's own share of the total — delivery and GST are the summary's. */
  amountPaise: number;
  servesMin: number;
  servesMax: number;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <div className="flex size-28 shrink-0 items-center justify-center border border-rule bg-counter">
        <CakeMark config={config} className="size-full" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/*
          Sentence case and sans, against the base rule that sets every heading
          in the product mono and uppercase. That rule is about labels on a
          working document — "ORDER SUMMARY", "IN THE KITCHEN" — and this is the
          customer's own cake being read back to them, the same class of text as
          the piped message under it and the email address on the account page,
          both of which this system already leaves alone. It also has to match
          the name on the card in the list, which is the same string.
        */}
        <h3 className="font-sans text-group leading-tight tracking-normal text-ink normal-case">
          {config ? cakeTitle(config, catalog) : "Custom cake"}
        </h3>

        {config && (
          <p className="font-sans text-body leading-snug text-steel">
            {cakeSubtitle(config, catalog)}
          </p>
        )}

        <p className="font-mono text-micro tracking-[0.06em] tabular-nums text-graphite">
          Quantity 1 · serves {servesMin}–{servesMax}
        </p>

        {/* The message is the customer's own words, piped onto the cake. Quoted
            rather than restyled, because getting it wrong is the complaint. */}
        {config?.message && (
          <p className="mt-1 border-l-2 border-rule-strong pl-3 font-sans text-body leading-snug text-ink">
            Piped: &ldquo;{config.message}&rdquo;
          </p>
        )}

        {config && (
          <p className="mt-1 font-sans text-meta leading-relaxed text-steel">
            {allergenLine(config)}
          </p>
        )}
      </div>

      <p className="shrink-0 font-mono text-item tabular-nums text-ink sm:text-right">
        {formatINR(amountPaise)}
      </p>
    </div>
  );
}
