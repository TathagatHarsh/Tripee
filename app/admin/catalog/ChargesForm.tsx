"use client";

import { useActionState } from "react";
import { saveSettings, type ActionResult } from "../actions";
import { btn, monoField } from "@/lib/ui";

export interface Charges {
  tierSurchargePaise: number;
  layerSurchargePaise: number;
  messagePipingPaise: number;
  dripPaise: number;
  sugarFreePaise: number;
  gstBasisPoints: number;
}

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * The charges that belong to no option.
 *
 * A second tier, a fourth layer, a piped message, a drip, a sugar-free bake:
 * each is work somebody does and time somebody is paid for, and each was a
 * literal in the pricing engine until now. They sit apart from the catalogue
 * because nobody picks them off a shelf — they are consequences of a cake being
 * built a certain way.
 *
 * GST is here too, as a percentage, because that is how a rate is written down
 * and read aloud. It is stored in basis points so the database never holds a
 * fraction of a paisa.
 */
export function ChargesForm({ charges }: { charges: Charges }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveSettings,
    undefined,
  );

  const fields = [
    { name: "tier", label: "Per extra tier", value: rupees(charges.tierSurchargePaise), unit: "₹" },
    { name: "layer", label: "Per layer past three", value: rupees(charges.layerSurchargePaise), unit: "₹" },
    { name: "message", label: "Message piping", value: rupees(charges.messagePipingPaise), unit: "₹" },
    { name: "drip", label: "Drip", value: rupees(charges.dripPaise), unit: "₹" },
    { name: "sugarFree", label: "Sugar-free bake", value: rupees(charges.sugarFreePaise), unit: "₹" },
    { name: "gst", label: "GST", value: (charges.gstBasisPoints / 100).toString(), unit: "%" },
  ];

  return (
    <form action={formAction} className="border border-rule bg-paper">
      <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.name} className="flex items-baseline justify-between gap-3">
            <label htmlFor={`charge-${f.name}`} className="font-mono text-meta text-steel">
              {f.label}
            </label>
            <span className="flex items-baseline gap-1.5">
              <span aria-hidden="true" className="font-mono text-body text-steel">{f.unit}</span>
              <input
                id={`charge-${f.name}`}
                name={f.name}
                defaultValue={f.value}
                inputMode="decimal"
                className={monoField("w-24 text-right")}
              />
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-rule px-4 py-3">
        <button type="submit" disabled={pending} className={btn("secondary", "md")}>
          {pending ? "Saving" : "Save charges"}
        </button>
        {result && (
          <p
            role="status"
            className={`font-mono text-micro ${result.ok ? "text-carbon" : "text-stamp"}`}
          >
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
