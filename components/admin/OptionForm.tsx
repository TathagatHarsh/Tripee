"use client";

import { useActionState, useEffect, useState } from "react";
import type { CatalogCategory } from "@prisma/client";
import { saveOption } from "@/app/admin/actions";
import { useToast } from "./Toast";
import { useUnsavedGuard, UnsavedDialog } from "./UnsavedGuard";
import { aBtn, aField, FormRow } from "./ui";
import { Icon } from "./icons";

/**
 * What an option is called and how it is described — everything about it that
 * is not money, a photograph or a switch.
 *
 * Those three are elsewhere on the same page and each saves on its own, which
 * is the deliberate shape: a price needs a confirmation (§14), a photo needs an
 * upload and a crop (§10), availability needs one press and no ceremony (§19).
 * Folding all four into one Save would mean confirming a price change in order
 * to fix a typo, and it would mean an owner who has cropped a photograph and
 * then changed their mind about the blurb losing the crop.
 *
 * ## The save state
 *
 * §24 asks for Saving / Saved / Failed and asks that it not be a modal. So
 * three signals, each doing a different job: the button says "Saving…" while
 * the action is in flight, a toast says what happened, and the button returns to
 * disabled-because-nothing-has-changed once it has. That last one is the honest
 * resting state — a Save button that is always live invites the press that finds
 * out whether anything needed saving.
 */

export function OptionForm({
  id,
  category,
  value,
  name,
  blurb,
  imageAlt,
  hasPhoto,
}: {
  id: string;
  category: CatalogCategory;
  value: string;
  name: string;
  blurb: string;
  imageAlt: string | null;
  /** The alt-text field only appears where there is a photograph to describe. */
  hasPhoto: boolean;
}) {
  /*
   * The server's values are the baseline; the draft is what is on screen. Dirty
   * is the comparison of the two, so reverting a change by hand un-dirties the
   * form and the unsaved-changes guard stops firing — which is what somebody
   * who typed a character and deleted it expects.
   */
  const [draft, setDraft] = useState({ name, blurb, imageAlt: imageAlt ?? "" });
  const [state, submit, pending] = useActionState(saveOption, undefined);
  const { toast } = useToast();

  /*
   * Re-baselined from props after a save.
   *
   * The action revalidates the page, so the server sends fresh values down, and
   * without this the form would still consider itself dirty against the values
   * it just successfully wrote — the Save button would stay live and the
   * unsaved-changes guard would keep firing.
   *
   * Done during render rather than in an effect, which is React's documented
   * way to adjust state when an input changes: an effect here commits the stale
   * draft first and then schedules a second render to replace it, which is what
   * react-hooks/set-state-in-effect is about. The guard compares against the
   * server's values, so a person mid-edit is unaffected — only a change in what
   * the server holds resets anything.
   */
  const [base, setBase] = useState({ name, blurb, imageAlt: imageAlt ?? "" });
  if (base.name !== name || base.blurb !== blurb || base.imageAlt !== (imageAlt ?? "")) {
    const next = { name, blurb, imageAlt: imageAlt ?? "" };
    setBase(next);
    setDraft(next);
  }

  useEffect(() => {
    if (state) toast(state.message, state.ok);
  }, [state, toast]);

  const dirty =
    draft.name !== name
    || draft.blurb !== blurb
    || draft.imageAlt !== (imageAlt ?? "");

  const guard = useUnsavedGuard(dirty && !pending);

  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <>
      <form action={submit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={id} />
        {/* Both re-checked on the server against lib/schema's Zod enums — see
            saveOption. They are here because the action needs to know which row
            it is writing, not because the client is trusted with them. */}
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="value" value={value} />

        <FormRow
          label="Name"
          htmlFor={`name-${id}`}
          hint="What customers see on the option they are choosing."
        >
          <input
            id={`name-${id}`}
            name="name"
            value={draft.name}
            onChange={set("name")}
            maxLength={60}
            required
            className={aField()}
          />
        </FormRow>

        <FormRow
          label="Description"
          htmlFor={`blurb-${id}`}
          hint="One line, under the name. What it actually is — not a sales pitch."
        >
          <textarea
            id={`blurb-${id}`}
            name="blurb"
            value={draft.blurb}
            onChange={set("blurb")}
            maxLength={200}
            required
            rows={2}
            className={aField("resize-y leading-relaxed")}
          />
        </FormRow>

        {hasPhoto && (
          <FormRow
            label="Photo description"
            htmlFor={`alt-${id}`}
            hint="Read aloud to customers using a screen reader, and shown if the photo fails to load. Leave it blank to use the name."
          >
            <input
              id={`alt-${id}`}
              name="imageAlt"
              value={draft.imageAlt}
              onChange={set("imageAlt")}
              maxLength={160}
              placeholder={draft.name}
              className={aField()}
            />
          </FormRow>
        )}
        {/*
          When there is no photo the field is not rendered, so the action would
          receive no `imageAlt` at all and — since its schema requires the key —
          would refuse the save. A hidden input carrying the stored value keeps
          the description intact through an unrelated edit rather than silently
          clearing it.
        */}
        {!hasPhoto && <input type="hidden" name="imageAlt" value={imageAlt ?? ""} />}

        <div className="flex flex-wrap items-center gap-3 border-t border-a-line pt-4">
          <button
            type="submit"
            disabled={pending || !dirty}
            className={aBtn("primary", "md")}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>

          {dirty && !pending && (
            <button
              type="button"
              onClick={() => setDraft({ name, blurb, imageAlt: imageAlt ?? "" })}
              className={aBtn("quiet", "md")}
            >
              Cancel
            </button>
          )}

          {/* The resting acknowledgement. The toast has come and gone by now,
              and this is what tells somebody returning to the tab that the
              form holds what the server holds. */}
          {!dirty && !pending && state?.ok && (
            <span className="flex items-center gap-1.5 text-a-meta font-medium text-a-good-ink">
              <Icon name="check" size={14} />
              Saved
            </span>
          )}
          {!dirty && !pending && !state && (
            <span className="text-a-meta text-a-faint">No changes yet.</span>
          )}
          {dirty && !pending && (
            <span className="text-a-meta font-medium text-a-warn-ink">Unsaved changes</span>
          )}
        </div>
      </form>

      <UnsavedDialog blocking={guard.blocking} onDiscard={guard.discard} onStay={guard.stay} />
    </>
  );
}
