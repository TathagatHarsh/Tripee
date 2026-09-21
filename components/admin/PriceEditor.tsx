"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveOptionPrice } from "@/app/admin/actions";
import { formatINR } from "@/lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { aBtn, aMonoField } from "./ui";
import { Icon } from "./icons";

/**
 * Change a price, out loud.
 *
 * §14 is unusually specific about this one and it is right to be: the sequence
 * is read → Edit → type → Save → *a confirmation naming both numbers* →
 * Confirm. "Do not silently change prices." A price is the one field in this
 * portal that is a commercial commitment rather than a description, and the
 * failure it protects against is not a mis-click — it is a decimal point.
 * ₹2,499 typed as ₹249 is a number that looks entirely plausible in an input
 * box and obviously wrong in a sentence that says "from ₹2,499 to ₹249".
 *
 * ## The three states, and why it is not just an input
 *
 * Reading is the default, because most visits to a catalogue page are to look.
 * An always-editable field on every row is twenty-four focusable inputs whose
 * values are all one keystroke from being changed by somebody scrolling with
 * the keyboard.
 *
 * ## What this deliberately does not say
 *
 * It does not warn that existing orders are unaffected, because they are, and
 * warning about something that cannot happen teaches an owner to distrust the
 * warnings that matter. The toast afterwards states it once as reassurance —
 * see `saveOptionPrice`. The frozen-price guarantee lives in OrderItem and in
 * the fact that nothing joins an order to a catalogue row.
 */

export function PriceEditor({
  id,
  name,
  paise,
  /** "Base price", "Price per piece" — see lib/adminNav's priceLabel. */
  label,
  /** Compact form for a table cell; the full form has its own buttons on a row. */
  compact = false,
}: {
  id: string;
  name: string;
  paise: number;
  label: string;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /* Rupees as typed, not paise. The input is what somebody types into, so it
     holds a string — parsing on every keystroke would fight a half-typed
     "24." and reformatting mid-entry moves the caret. */
  const [draft, setDraft] = useState("");
  const [state, submit, pending] = useActionState(saveOptionPrice, undefined);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /*
   * Set for exactly one submit, by the dialog's Confirm.
   *
   * `requestSubmit()` fires a real submit event, so it re-enters the same
   * `onSubmit` below that opened the dialog in the first place — without this
   * flag, Confirm would call `preventDefault` and reopen the dialog it was
   * dismissing, and the price could never be saved. A ref rather than state
   * because it has to be readable inside the very handler that the same tick
   * triggers, and a state update would not have landed yet.
   */
  const confirmed = useRef(false);

  /*
   * React to a result exactly once, and do the state part during render.
   *
   * `useActionState` returns a fresh object per submission, so comparing it to
   * the last one seen fires once per save. Adjusting state during render is
   * React's documented pattern for this; doing it in the effect below instead
   * commits one render with the dialog still open and then immediately
   * schedules another, which is what react-hooks/set-state-in-effect catches.
   *
   * Only the editor closes on success. A refused price — "Use digits, and at
   * most two decimals" — has to leave it open with what they typed still in it,
   * or the correction means starting again from the read state. The
   * confirmation dialog closes either way, because it has asked its question.
   */
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setConfirming(false);
    if (state?.ok) setEditing(false);
  }

  useEffect(() => {
    if (state) toast(state.message, state.ok);
  }, [state, toast]);

  /* Focus the field when it appears, and select what is in it — the common edit
     is replacing the whole number, not appending to it. */
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const open = () => {
    /* Seeded with plain rupees and no separators: "2499", not "₹2,499.00".
       A field pre-filled with a formatted string is a field somebody has to
       clear before they can type. */
    setDraft(String(Math.round(paise / 100)));
    setEditing(true);
  };

  /* What they typed, as paise, for the confirmation sentence. NaN-safe: an
     unparseable draft shows the confirmation with the same number on both
     sides, and the server refuses it with a real message. */
  const nextPaise = Math.round(Number(draft) * 100);
  const valid = /^\d+(\.\d{1,2})?$/.test(draft.trim());
  const unchanged = valid && nextPaise === paise;

  if (!editing) {
    return (
      <div className={compact ? "flex items-center justify-end gap-2" : "flex flex-wrap items-center gap-3"}>
        <span className="font-a-mono text-a-item font-medium tabular-nums text-a-ink">
          {formatINR(paise)}
        </span>
        <button
          type="button"
          onClick={open}
          className={aBtn("ghost", compact ? "sm" : "md")}
        >
          <Icon name="edit" size={compact ? 13 : 15} />
          {compact ? "Edit" : "Edit price"}
        </button>
      </div>
    );
  }

  return (
    <>
      <form
        ref={formRef}
        action={submit}
        onSubmit={(e) => {
          /*
           * The submit is intercepted so the confirmation can happen first. The
           * form is then submitted programmatically from the dialog's Confirm —
           * `requestSubmit()` rather than `submit()`, because the latter skips
           * validation and, more importantly here, skips React's action
           * handling entirely and does a real page POST.
           */
          /* The confirmed pass falls straight through to the action. */
          if (confirmed.current) {
            confirmed.current = false;
            return;
          }

          e.preventDefault();
          if (!valid) {
            toast("Enter a price using digits, and at most two decimals.", false);
            return;
          }
          if (unchanged) {
            setEditing(false);
            return;
          }
          setConfirming(true);
        }}
        className={compact ? "flex items-center justify-end gap-1.5" : "flex flex-wrap items-end gap-2"}
      >
        <input type="hidden" name="id" value={id} />

        <div className={compact ? "w-28" : "w-40"}>
          {!compact && (
            <label htmlFor={`price-${id}`} className="mb-1 block text-a-meta font-medium text-a-muted">
              {label}
            </label>
          )}
          <div className="relative">
            {/* The rupee sign is chrome, not content: it lives beside the field
                so that what is submitted is a plain number and the parser on the
                server does not have to strip a symbol somebody may or may not
                have typed. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-a-mono text-a-body text-a-faint"
            >
              ₹
            </span>
            <input
              ref={inputRef}
              id={`price-${id}`}
              name="price"
              /*
               * `inputMode="decimal"` rather than `type="number"`, which brings
               * a spinner nobody wants on a price, scroll-wheel value changes,
               * and a locale-dependent decimal separator. This is a text field
               * that summons a numeric keypad on a phone.
               */
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              aria-label={compact ? `${label} for ${name}, in rupees` : undefined}
              aria-invalid={draft.trim() !== "" && !valid}
              className={aMonoField("pl-7 text-right")}
            />
          </div>
        </div>

        <button type="submit" disabled={pending} className={aBtn("primary", compact ? "sm" : "md")}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className={aBtn("quiet", compact ? "sm" : "md")}
        >
          Cancel
        </button>
      </form>

      <ConfirmDialog
        open={confirming}
        tone="primary"
        title={`Change the price of ${name}?`}
        body={
          <>
            <span className="block">
              From{" "}
              <span className="font-a-mono font-medium text-a-ink">{formatINR(paise)}</span> to{" "}
              <span className="font-a-mono font-medium text-a-ink">
                {Number.isFinite(nextPaise) ? formatINR(nextPaise) : "—"}
              </span>
              .
            </span>
            <span className="mt-2 block text-a-small">
              This is what the next customer will be quoted. Orders already placed keep
              the price they agreed to.
            </span>
          </>
        }
        confirmLabel="Confirm change"
        busy={pending}
        onConfirm={() => {
          confirmed.current = true;
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
