"use client";

import Image from "next/image";
import { useActionState, useEffect } from "react";
import {
  addCakeGalleryPhoto, makeCakePhotoPrimary, moveCakePhoto, removeCakeGalleryPhoto,
} from "@/app/admin/cakes/actions";
import type { ActionResult } from "@/app/admin/actions";
import type { CakeImageView } from "@/lib/cakes";
import { ImageUploader } from "./ImageUploader";
import { useToast } from "./Toast";
import { aBtn } from "./ui";
import { Icon } from "./icons";

/**
 * The extra photographs of one cake.
 *
 * ## What is reused and what is new
 *
 * Adding a photograph is `<ImageUploader>` — the same five hundred lines of
 * cropper, object-URL lifecycle and error handling the cover photo and the
 * catalogue options use, pointed at a different action. It is handed
 * `imageUrl={null}` so it always shows its choose-a-file state: this control
 * appends rather than replaces, and a preview of "the current photo" would be
 * asking which of four.
 *
 * What is written here is the list underneath it, because a list is what
 * `ImageUploader` has never had.
 *
 * ## Four buttons, and no drag handle
 *
 * Make cover, earlier, later, remove. Reordering by buttons rather than by drag
 * is the choice worth defending: a pointer-driven reorder needs a drag library,
 * a keyboard path written by hand and a live region to be usable at all, and it
 * buys speed on a list capped at eight. Two arrows are all of that for nothing,
 * and they work on a phone.
 *
 * Every one of them is a plain `<form action={...}>` posting an id. No optimistic
 * state and no local copy of the list: the page is `force-dynamic`, the actions
 * revalidate it, and the order an owner sees is therefore always the order the
 * database holds rather than a guess this component made and might take back.
 *
 * ## Why removal is not behind a confirmation
 *
 * `ConfirmDialog` guards the destructive controls elsewhere in this portal, and
 * the ones it guards delete a *cake* or change a price. Removing one of several
 * photographs of a cake that is still on the shelf costs an owner a re-upload of
 * a file they still have, and a dialog on every one of eight thumbnails is how
 * people learn to dismiss dialogs. The cover photograph, which cannot be removed
 * from here at all, is the one this panel treats as precious.
 */
export function CakeGalleryManager({
  id,
  name,
  gallery,
}: {
  id: string;
  name: string;
  gallery: CakeImageView[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <ImageUploader
        id={id}
        name={`${name} — another photo`}
        /* Always the empty state: this adds, it does not replace. */
        imageUrl={null}
        enabled
        disabledReason=""
        uploadAction={addCakeGalleryPhoto}
        /* Never reached — with no current image the uploader shows no Remove
           control. Passed because the prop exists, and pointed at the real
           action rather than a no-op that would silently do nothing if the
           component ever grew a path to it. */
        removeAction={removeCakeGalleryPhoto}
      />

      {gallery.length === 0 ? (
        <p className="text-a-small text-a-muted">
          No extra photographs yet. The cake&rsquo;s page shows the cover on its own
          until there are.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {gallery.map((image, i) => (
            <li
              key={image.id}
              className="flex flex-wrap items-center gap-3 rounded-a border border-a-line bg-a-sunken p-3"
            >
              <div className="relative size-20 shrink-0 overflow-hidden rounded-a-sm border border-a-line bg-a-surface">
                <Image
                  src={image.url}
                  /* Empty: the position below names it, and each control beside
                     it is individually labelled. */
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* "+2" because the cover is photo 1 on the customer's page.
                    Numbering these from 1 would make "move earlier" on the first
                    one look as though it should displace the cover. */}
                <span className="font-a-sans text-a-body font-medium text-a-ink">
                  Photo {i + 2}
                </span>
                <span className="text-a-meta text-a-muted">
                  {image.alt || "No description — the cake's name is used instead."}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <PhotoButton
                  action={makeCakePhotoPrimary}
                  fields={{ imageId: image.id }}
                  label="Make cover"
                  icon="star"
                />
                <PhotoButton
                  action={moveCakePhoto}
                  fields={{ imageId: image.id, direction: "up" }}
                  label="Move earlier"
                  icon="arrowUp"
                  iconOnly
                  disabled={i === 0}
                />
                <PhotoButton
                  action={moveCakePhoto}
                  fields={{ imageId: image.id, direction: "down" }}
                  label="Move later"
                  icon="arrowDown"
                  iconOnly
                  disabled={i === gallery.length - 1}
                />
                <PhotoButton
                  action={removeCakeGalleryPhoto}
                  fields={{ imageId: image.id }}
                  label="Remove"
                  icon="trash"
                  iconOnly
                  danger
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One control, one action, one set of hidden fields.
 *
 * A form rather than an `onClick` that calls the action: a submit button inside
 * a `<form action>` is what gives `useActionState` its pending flag, and it is
 * also what makes each of these an independent submission — pressing "later" on
 * photo two must not put "remove" on photo three into a pending state.
 *
 * The result is announced through the portal's existing toast rather than
 * printed beside the button, because these four sit in a 40px row and a sentence
 * appearing in it would reflow the list under a pointer that is still moving.
 */
function PhotoButton({
  action,
  fields,
  label,
  icon,
  iconOnly = false,
  danger = false,
  disabled = false,
}: {
  action: (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: string;
  icon: string;
  iconOnly?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [state, run, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state) toast(state.message, state.ok);
  }, [state, toast]);

  return (
    <form action={run}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={disabled || pending}
        /* The visible label is dropped on the icon-only variants, so the
           accessible name has to come from somewhere — and `title` as well, for
           the pointer user who cannot guess an arrow's meaning either. */
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={aBtn(danger ? "danger" : "ghost", "sm")}
      >
        <Icon name={icon} size={14} />
        {!iconOnly && label}
      </button>
    </form>
  );
}
