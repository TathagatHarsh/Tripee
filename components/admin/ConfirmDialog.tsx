"use client";

import { useEffect, useRef } from "react";
import { aBtn } from "./ui";
import { Icon } from "./icons";

/**
 * "This cannot be undone." — asked properly, and only where it is warranted.
 *
 * §26 lists what needs one (delete an option, remove a photo) and §26 also says
 * not to use one for every normal save. So there are exactly three callers in
 * the portal: removing a photograph, changing a price (§14 asks for that one by
 * name, because a price is a commercial commitment rather than a typo fix), and
 * leaving a form with unsaved edits.
 *
 * ## Why the native `<dialog>`
 *
 * `showModal()` brings four things that are genuinely hard to get right by hand
 * and are each their own bug when they are missing: the focus trap, the inert
 * backdrop, Escape-to-close, and returning focus to whatever opened it. A
 * hand-rolled modal in a div gets the visuals in ten minutes and the focus
 * management never.
 *
 * `::backdrop` is styled in globals.css because it cannot be reached from a
 * class on the element.
 */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** The consequence, in one or two sentences. Never just "Are you sure?". */
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for anything that destroys; `primary` for a change that is merely committing. */
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /*
     * `open` is driven by React and `showModal()` is imperative, so the two are
     * reconciled here rather than by rendering the `open` attribute — setting
     * that attribute directly produces a non-modal dialog with no backdrop and
     * no focus trap, which looks identical and behaves like a div.
     */
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /*
   * Escape fires `cancel` rather than going through the Cancel button, so the
   * parent's state has to be told. Without this the dialog closes and `open`
   * stays true, and it can never be reopened.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onCancelEvent = (e: Event) => {
      e.preventDefault();
      /* A dialog that is mid-write must not be dismissable — the action is
         already in flight and closing the dialog would leave the person
         believing they had stopped it. */
      if (!busy) onCancel();
    };
    el.addEventListener("cancel", onCancelEvent);
    return () => el.removeEventListener("cancel", onCancelEvent);
  }, [busy, onCancel]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="a-confirm-title"
      /*
       * Positioned by the browser's own modal centring rather than by fixed
       * inset-0 + flex, which fights `showModal`'s top-layer placement. `m-auto`
       * is what centres a dialog element.
       */
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-a border border-a-line bg-a-surface p-0 text-a-ink shadow-a-pop backdrop:bg-a-ink/45"
    >
      <div className="flex items-start gap-3 p-5">
        <span
          className={[
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
            tone === "danger" ? "bg-a-bad-wash text-a-bad-ink" : "bg-a-accent-wash text-a-accent-ink",
          ].join(" ")}
        >
          <Icon name="alert" size={18} />
        </span>
        <div className="min-w-0">
          <h2
            id="a-confirm-title"
            className="font-a-sans text-a-item font-semibold leading-snug text-a-ink"
          >
            {title}
          </h2>
          <div className="mt-1.5 text-a-body leading-relaxed text-a-muted">{body}</div>
        </div>
      </div>

      {/*
        Cancel first in the DOM, so it is the first thing Tab reaches and — more
        importantly — the first thing `showModal()` autofocuses. The destructive
        button being focused by default is how somebody deletes a cake by
        pressing Enter twice.
      */}
      <div className="flex flex-wrap justify-end gap-2 border-t border-a-line bg-a-sunken px-5 py-3.5">
        <button type="button" onClick={onCancel} disabled={busy} className={aBtn("secondary", "md")}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={aBtn(tone === "danger" ? "danger" : "primary", "md")}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
