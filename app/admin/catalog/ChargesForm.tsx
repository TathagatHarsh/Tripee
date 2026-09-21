"use client";

import { useActionState, useEffect, useState } from "react";
import { saveSettings, type ActionResult } from "../actions";
import { useToast } from "@/components/admin/Toast";
import { useUnsavedGuard, UnsavedDialog } from "@/components/admin/UnsavedGuard";
import { aBtn, aMonoField, FormRow } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

export interface Charges {
  tierSurchargePaise: number;
  layerSurchargePaise: number;
  messagePipingPaise: number;
  dripPaise: number;
  sugarFreePaise: number;
  gstBasisPoints: number;
}

/** Paise to a plain rupee string, with the pointless `.00` trimmed. */
const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * The charges that belong to no option.
 *
 * A second tier, a fourth layer, a piped message, a drip, a sugar-free bake:
 * each is work somebody does and time somebody is paid for, and each was a
 * literal in the pricing engine until the portal existed. They sit apart from
 * the catalogue because nobody picks them off a shelf — they are consequences
 * of a cake being built a certain way.
 *
 * GST is here too, as a percentage, because that is how a rate is written down
 * and read aloud. It is stored in basis points so the database never holds a
 * fraction of a paisa.
 *
 * ## One Save for six numbers, unlike an option's price
 *
 * §14 asks for a confirmation on a price change and this form has none, which
 * looks inconsistent and is not. That confirmation exists to catch a decimal
 * point in a figure a customer is quoted directly — ₹2,499 typed as ₹249 —
 * where the wrong number is plausible and lands on the next order. These six
 * are second-order: a tier surcharge is never itemised to a customer as such,
 * they are changed together and rarely, and the page around this form prints
 * all of them as figures, so a mistyped one is visible on the screen it was
 * typed on.
 *
 * What it does have is §25's guard, because six fields is enough typing to
 * resent losing.
 *
 * The field names are unchanged from the version this replaces — `tier`,
 * `layer`, `message`, `drip`, `sugarFree`, `gst` — so `saveSettings` and its
 * Zod schema are untouched by the restyle.
 */
export function ChargesForm({ charges }: { charges: Charges }) {
  const FIELDS = [
    {
      name: "tier",
      label: "Per extra tier",
      hint: "Dowels, boards and the assembly a stacked cake needs.",
      unit: "₹",
      value: rupees(charges.tierSurchargePaise),
    },
    {
      name: "layer",
      label: "Per layer past three",
      hint: "Extra sponge and extra filling, beyond the standard three layers.",
      unit: "₹",
      value: rupees(charges.layerSurchargePaise),
    },
    {
      name: "message",
      label: "Message piping",
      hint: "Charged once, however long the message is.",
      unit: "₹",
      value: rupees(charges.messagePipingPaise),
    },
    {
      name: "drip",
      label: "Drip",
      hint: "The poured chocolate or caramel edge.",
      unit: "₹",
      value: rupees(charges.dripPaise),
    },
    {
      name: "sugarFree",
      label: "Sugar-free bake",
      hint: "A separate bake with a substitute sweetener.",
      unit: "₹",
      value: rupees(charges.sugarFreePaise),
    },
    {
      name: "gst",
      label: "GST",
      hint: "Added to every order. Written as a percentage — 18 means 18%.",
      unit: "%",
      value: (charges.gstBasisPoints / 100).toString(),
    },
  ];

  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.name, f.value])),
  );
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveSettings,
    undefined,
  );
  const { toast } = useToast();

  /*
   * Re-baselined from props after a save: the action revalidates the page, so
   * fresh values arrive and the form stops considering itself dirty against the
   * numbers it just wrote.
   *
   * Done during render rather than in an effect — see OptionForm for the
   * reasoning, which is the same. The six values are joined into one string so
   * the comparison is a single equality rather than six, which also keeps this
   * correct if a seventh charge is ever added.
   */
  const baseline = FIELDS.map((f) => `${f.name}=${f.value}`).join("|");
  const [base, setBase] = useState(baseline);
  if (base !== baseline) {
    setBase(baseline);
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.name, f.value])));
  }

  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);

  const dirty = FIELDS.some((f) => draft[f.name] !== f.value);
  const guard = useUnsavedGuard(dirty && !pending);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-5">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((f) => (
            <FormRow key={f.name} label={f.label} htmlFor={`charge-${f.name}`} hint={f.hint}>
              <div className="relative">
                {/* The unit sits beside the field rather than inside its value,
                    so what is submitted is a plain number and the parser on the
                    server never has to strip a symbol somebody may or may not
                    have typed. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-a-mono text-a-body text-a-faint"
                >
                  {f.unit}
                </span>
                <input
                  id={`charge-${f.name}`}
                  name={f.name}
                  /*
                   * `inputMode="decimal"` rather than `type="number"`, which
                   * brings a spinner nobody wants on a price, scroll-wheel
                   * value changes, and a locale-dependent decimal separator.
                   */
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft[f.name] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                  className={aMonoField("pl-7 text-right")}
                />
              </div>
            </FormRow>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-a-line pt-4">
          <button type="submit" disabled={pending || !dirty} className={aBtn("primary", "md")}>
            {pending ? "Saving…" : "Save charges"}
          </button>

          {dirty && !pending && (
            <button
              type="button"
              onClick={() => setDraft(Object.fromEntries(FIELDS.map((f) => [f.name, f.value])))}
              className={aBtn("quiet", "md")}
            >
              Cancel
            </button>
          )}

          {/* §24's resting state, after the toast has gone. */}
          {!dirty && !pending && result?.ok && (
            <span className="flex items-center gap-1.5 text-a-meta font-medium text-a-good-ink">
              <Icon name="check" size={14} />
              Saved
            </span>
          )}
          {!dirty && !pending && !result && (
            <span className="text-a-meta text-a-faint">No changes yet.</span>
          )}
          {dirty && !pending && (
            <span className="text-a-meta font-medium text-a-warn-ink">Unsaved changes</span>
          )}
        </div>

        {result && !result.ok && (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-a border border-a-bad-line bg-a-bad-wash px-3 py-2 text-a-small font-medium leading-snug text-a-bad-ink"
          >
            <Icon name="alert" size={15} className="mt-px shrink-0" />
            {result.message}
          </p>
        )}
      </form>

      <UnsavedDialog blocking={guard.blocking} onDiscard={guard.discard} onStay={guard.stay} />
    </>
  );
}
