"use client";

import { useActionState } from "react";
import type { CatalogCategory } from "@prisma/client";
import { saveOption, setAvailability, type ActionResult } from "../actions";
import { btn, monoField } from "@/lib/ui";

export interface Row {
  id: string;
  category: CatalogCategory;
  value: string;
  name: string;
  blurb: string;
  priceInputPaise: number;
  isAvailable: boolean;
}

/**
 * One option, editable in place.
 *
 * The whole row is one form and the price is a plain text input at its natural
 * size, because the job this screen exists for is changing 200 to 225 and then
 * leaving. Anything that puts a dialog, a second page or a mode between the
 * number and the keyboard is charging the bakery for the privilege of running
 * its own shop.
 *
 * Rupees in the field, paise in the database. Nobody who prices a cake thinks
 * in paise, and the conversion belongs where the machine is, not where the
 * person is.
 *
 * Availability is its own form rather than a field in this one, so withdrawing
 * a flavour is one click and never depends on whether the price beside it
 * happens to be valid.
 */
export function OptionRow({ row, priceLabel }: { row: Row; priceLabel: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveOption,
    undefined,
  );

  const rupees = (row.priceInputPaise / 100).toFixed(2).replace(/\.00$/, "");

  return (
    <li className={`border-b border-rule last:border-0 ${row.isAvailable ? "" : "bg-sunken"}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3">
        <form
          action={formAction}
          className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-2"
        >
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="category" value={row.category} />
          <input type="hidden" name="value" value={row.value} />

          <div className="min-w-0 flex-1 basis-64">
            <label className="sr-only" htmlFor={`name-${row.id}`}>Name</label>
            <input
              id={`name-${row.id}`}
              name="name"
              defaultValue={row.name}
              maxLength={60}
              className={monoField("w-full")}
            />

            <label className="sr-only" htmlFor={`blurb-${row.id}`}>Description</label>
            <input
              id={`blurb-${row.id}`}
              name="blurb"
              defaultValue={row.blurb}
              maxLength={200}
              className="mt-1 w-full border-0 border-b border-transparent bg-transparent px-0 py-1 font-sans text-meta text-steel hover:border-rule focus:border-ink focus:outline-none"
            />

            {/* The enum key. Shown because it is what the 3D, the allergen
                table and every saved design call this option — the name above
                is only what the customer reads. */}
            <p className="mt-1 font-mono text-micro text-ink-35">{row.value}</p>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span aria-hidden="true" className="font-mono text-body text-steel">₹</span>
            <label className="sr-only" htmlFor={`price-${row.id}`}>{priceLabel}</label>
            <input
              id={`price-${row.id}`}
              name="price"
              defaultValue={rupees}
              inputMode="decimal"
              className={monoField("w-28 text-right")}
            />
          </div>

          <button type="submit" disabled={pending} className={btn("secondary", "md")}>
            {pending ? "Saving" : "Save"}
          </button>
        </form>

        <form action={setAvailability}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="next" value={String(!row.isAvailable)} />
          <button type="submit" className={btn(row.isAvailable ? "quiet" : "primary", "md")}>
            {row.isAvailable ? "Withdraw" : "Offer again"}
          </button>
        </form>
      </div>

      {(result || !row.isAvailable) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3">
          {!row.isAvailable && (
            <p className="font-mono text-micro uppercase tracking-[0.1em] text-stamp">
              Withdrawn — customers cannot choose this. Orders that already have it are unchanged.
            </p>
          )}
          {result && (
            <p
              role="status"
              className={`font-mono text-micro ${result.ok ? "text-carbon" : "text-stamp"}`}
            >
              {result.message}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
