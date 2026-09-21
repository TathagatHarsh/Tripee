"use client";

import Image from "next/image";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { removeOptionPhoto, uploadOptionPhoto } from "@/app/admin/actions";
import type { ActionResult } from "@/app/admin/actions";
import {
  ACCEPTED_EXTENSIONS, ACCEPTED_TYPES, IMAGE_ASPECT, MAX_UPLOAD_BYTES,
} from "@/lib/imageSpec";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { aBtn, Notice } from "./ui";
import { Icon } from "./icons";

/**
 * The photograph, and the four things somebody can do to it.
 *
 * §10 asks for the current photo, Change and Remove; §11 for a crop; §12 for
 * automatic optimization; §38 for a real error state. The optimization is not
 * here — it is in lib/storage, on the server, which is the only place it can be
 * a guarantee rather than a client-side courtesy. What is here is everything an
 * owner touches.
 *
 * ## Why the crop is 40 lines of pointer maths and not a library
 *
 * react-image-crop and cropperjs both do more than this needs and both are
 * heavier than the entire admin bundle. What is actually required is: a fixed
 * 4:3 window over the image, drag to reposition, a slider to zoom, and four
 * fractions handed to the server. There are no rotate handles, no free aspect
 * ratio and no resize grips, because §11 asks for "crop, reposition, preview"
 * and a consistent aspect ratio — and a free-ratio cropper actively works
 * against the last of those.
 *
 * The crop is expressed as fractions of the source rather than pixels, so the
 * numbers survive being computed against a preview at whatever size the browser
 * laid it out and applied to a 4032px original. See lib/storage's `pixelBox`.
 *
 * ## The object URL, and the one thing that leaks without care
 *
 * `URL.createObjectURL` holds the whole file in memory until it is revoked, so
 * every path that replaces or clears the selection revokes the previous one.
 * A owner cropping five photographs in a row without this is five 6MB buffers
 * that never come back.
 */

/** Where the crop window currently sits, in fractions of the source image. */
interface View {
  /** 1 = the whole of the shorter axis fits the window. Above that, zoomed in. */
  zoom: number;
  /** Centre of the crop window, as a fraction of the source. */
  cx: number;
  cy: number;
}

const START: View = { zoom: 1, cx: 0.5, cy: 0.5 };

/**
 * What a photo action looks like, whatever it is attached to.
 *
 * The two below default to the catalogue option's, which is what this component
 * was written for and still its main caller. /admin/cakes passes its own pair —
 * same signature, same `id` field in the form, a different table underneath.
 *
 * Parameterised rather than copied, because the thing worth reusing here is the
 * five hundred lines of cropper, the object-URL lifecycle and the four error
 * states; a second uploader would be a second place for all of that to be
 * subtly wrong. What it is *not* is a generic abstraction: two callers, one
 * shape, one prop.
 */
export type PhotoAction = (
  prev: ActionResult | undefined,
  form: FormData,
) => Promise<ActionResult>;

export function ImageUploader({
  id,
  name,
  imageUrl,
  /** True when BLOB_READ_WRITE_TOKEN is set. False disables the control and says why. */
  enabled,
  disabledReason,
  uploadAction = uploadOptionPhoto,
  removeAction = removeOptionPhoto,
}: {
  id: string;
  name: string;
  imageUrl: string | null;
  enabled: boolean;
  disabledReason: string;
  uploadAction?: PhotoAction;
  removeAction?: PhotoAction;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** Natural size of the chosen file, once the browser has decoded it. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>(START);
  const [dragOver, setDragOver] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [upState, upload, uploading] = useActionState(uploadAction, undefined);
  const [rmState, remove, rmPending] = useActionState(removeAction, undefined);
  const { toast } = useToast();

  const inputRef = useRef<HTMLInputElement>(null);
  const uploadForm = useRef<HTMLFormElement>(null);
  const removeForm = useRef<HTMLFormElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /*
   * The live object URL, mirrored in a ref.
   *
   * `URL.createObjectURL` holds the whole file in memory until it is revoked,
   * so every path that replaces or clears the selection has to revoke the
   * previous one — an owner cropping five photographs in a row without this is
   * five 6MB buffers that never come back.
   *
   * A ref as well as state because the unmount cleanup needs the value and
   * must not read it through `setState`: a state updater used purely to read
   * the current value is a setState in an effect cleanup, which schedules a
   * render on an unmounting component and is what
   * react-hooks/set-state-in-effect flags. The ref is the source of truth for
   * revocation; the state is what renders.
   */
  const urlRef = useRef<string | null>(null);

  /** Drop the chosen file and free its object URL. */
  const clear = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreview(null);
    setFile(null);
    setNatural(null);
    setView(START);
    setLocalError(null);
    /* The input's value has to be cleared explicitly or choosing the same file
       again fires no change event and the picker appears to do nothing. */
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /*
   * React to each action result once, and keep the state part out of the
   * effect — see components/admin/PriceEditor for the same pattern and the
   * reasoning behind it. `useActionState` hands back a fresh object per
   * submission, so comparing against the last one seen fires exactly once.
   */
  const [seenUp, setSeenUp] = useState(upState);
  if (upState !== seenUp) {
    setSeenUp(upState);
    /*
     * Only the state is reset here. `clear()` also revokes the object URL and
     * blanks the file input, both of which touch a ref — and a ref read during
     * render is its own lint error and its own real hazard, since render can
     * run without committing. So the state goes back to "nothing chosen" now
     * and the cleanup follows in the effect below, which fires once the reset
     * has actually committed.
     */
    if (upState?.ok) {
      setPreview(null);
      setFile(null);
      setNatural(null);
      setView(START);
      setLocalError(null);
    }
  }

  const [seenRm, setSeenRm] = useState(rmState);
  if (rmState !== seenRm) {
    setSeenRm(rmState);
    setRemoving(false);
  }

  useEffect(() => {
    if (upState) toast(upState.message, upState.ok);
  }, [upState, toast]);

  useEffect(() => {
    if (rmState) toast(rmState.message, rmState.ok);
  }, [rmState, toast]);

  /*
   * The other half of the reset above: once there is no preview on screen, the
   * bytes behind it are not needed and the file input has to be blanked or
   * choosing the same photograph again fires no change event and the picker
   * appears to do nothing.
   *
   * Keyed on `preview` rather than on the action result, so it covers every
   * route to an empty state — a successful upload, a Cancel, a rejected file —
   * with one piece of cleanup instead of three. Writes no state.
   */
  useEffect(() => {
    if (preview) return;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (inputRef.current) inputRef.current.value = "";
  }, [preview]);

  /* Revoke on unmount too — navigating away mid-crop should not keep a 6MB
     buffer alive. Reads the ref, writes no state. */
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  /**
   * Accept a file from the picker or from a drop.
   *
   * The type and size checks here are a courtesy, not a boundary: they give an
   * instant answer instead of an 8MB round trip. lib/storage checks both again
   * and, unlike this, checks the *decoded* format rather than the browser's
   * claim about it.
   */
  const accept = useCallback((chosen: File | undefined | null) => {
    if (!chosen) return;
    clear();

    if (!(ACCEPTED_TYPES as readonly string[]).includes(chosen.type)) {
      setLocalError("That file isn't a JPG, PNG or WEBP. Choose a photo.");
      return;
    }
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setLocalError(
        `That photo is ${(chosen.size / 1024 / 1024).toFixed(1)}MB. `
        + `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
      );
      return;
    }

    const url = URL.createObjectURL(chosen);
    urlRef.current = url;
    setFile(chosen);
    setPreview(url);
  }, [clear]);

  /* ── the crop maths ───────────────────────────────────────────────────
   *
   * The window is 4:3. The source is whatever shape it is. `base` is the
   * fraction of the source that fills the window at zoom 1 — computed off
   * whichever axis is the binding constraint, which is what makes a portrait
   * photograph and a panorama both start out fully framed rather than one of
   * them starting cropped to nothing.
   */
  const srcAspect = natural ? natural.w / natural.h : IMAGE_ASPECT;
  /* Fraction of source width and height the window covers, at this zoom. */
  const fracW = Math.min(1, (srcAspect >= IMAGE_ASPECT ? IMAGE_ASPECT / srcAspect : 1) / view.zoom);
  const fracH = Math.min(1, (srcAspect >= IMAGE_ASPECT ? 1 : srcAspect / IMAGE_ASPECT) / view.zoom);

  /* The centre is clamped so the window can never leave the image — half a
     window's width in from each edge. */
  const cx = Math.min(1 - fracW / 2, Math.max(fracW / 2, view.cx));
  const cy = Math.min(1 - fracH / 2, Math.max(fracH / 2, view.cy));

  const crop = {
    x: cx - fracW / 2,
    y: cy - fracH / 2,
    width: fracW,
    height: fracH,
  };

  /*
   * Dragging moves the centre by the pointer's travel, converted from pixels of
   * the *window* into fractions of the source. Pointer events rather than
   * mouse+touch: one code path, and `setPointerCapture` means a drag that
   * leaves the frame keeps tracking instead of sticking.
   */
  const onPointerDown = (e: React.PointerEvent) => {
    if (!natural || fracW >= 1 && fracH >= 1) return;
    const frame = frameRef.current;
    if (!frame) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = frame.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const from = { cx, cy };

    const move = (ev: PointerEvent) => {
      /* A drag right moves the *window* right, which means showing more of the
         right of the image — so the centre increases. */
      setView((v) => ({
        ...v,
        cx: from.cx - ((ev.clientX - startX) / rect.width) * fracW,
        cy: from.cy - ((ev.clientY - startY) / rect.height) * fracH,
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ── not configured ─────────────────────────────────────────────────── */
  if (!enabled) {
    return (
      <div className="flex flex-col gap-3">
        <Photo url={imageUrl} name={name} />
        <Notice tone="warn">{disabledReason}</Notice>
      </div>
    );
  }

  /* ── cropping a newly chosen file ───────────────────────────────────── */
  if (preview) {
    const zoomable = !(fracW >= 1 && fracH >= 1);

    return (
      <form ref={uploadForm} action={upload} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="crop" value={JSON.stringify(crop)} />

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          className={[
            "relative overflow-hidden rounded-a border border-a-line-strong bg-a-nav",
            zoomable ? "cursor-grab active:cursor-grabbing" : "",
          ].join(" ")}
          style={{ aspectRatio: String(IMAGE_ASPECT) }}
        >
          {/*
            A plain <img>, not next/image. The source is a blob: URL that exists
            only in this browser for the next few seconds — the optimizer cannot
            fetch it, cannot cache it and has nothing to optimize.

            `object-cover` with a transform is what shows the crop: the image is
            scaled so the selected region fills the frame, and translated so
            that region is the part on screen.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNatural({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            className="pointer-events-none absolute select-none"
            style={{
              /* The image is laid out as a percentage of the frame such that
                 the crop rectangle is exactly the frame. */
              width: `${100 / fracW}%`,
              height: `${100 / fracH}%`,
              left: `${-(crop.x / fracW) * 100}%`,
              top: `${-(crop.y / fracH) * 100}%`,
              objectFit: "fill",
            }}
          />

          {/* Rule-of-thirds guides. Non-interactive, and only while dragging is
              possible — on an image that cannot be repositioned they are
              decoration over a decision nobody is making. */}
          {zoomable && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
            </div>
          )}
        </div>

        {zoomable && (
          <div className="flex items-center gap-3">
            <label htmlFor={`zoom-${id}`} className="shrink-0 text-a-meta font-medium text-a-muted">
              Zoom
            </label>
            <input
              id={`zoom-${id}`}
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={view.zoom}
              onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))}
              className="h-11 min-w-0 flex-1 accent-[var(--color-a-accent)]"
            />
            <button
              type="button"
              onClick={() => setView(START)}
              className={aBtn("quiet", "sm")}
            >
              Reset
            </button>
          </div>
        )}

        <p className="text-a-meta leading-relaxed text-a-muted">
          {zoomable
            ? "Drag the photo to reposition it, and zoom to fill the frame. What you see is what customers see."
            : "This photo already fits the frame. Zoom in if you want a closer crop."}
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={uploading} className={aBtn("primary", "md")}>
            {uploading ? "Uploading…" : imageUrl ? "Replace photo" : "Save photo"}
          </button>
          <button type="button" onClick={clear} disabled={uploading} className={aBtn("quiet", "md")}>
            Cancel
          </button>
          {file && (
            <span className="flex items-center text-a-meta text-a-faint">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
            </span>
          )}
        </div>
      </form>
    );
  }

  /* ── reading, with or without a photo ───────────────────────────────── */
  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={`photo-${id}`}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={(e) => accept(e.target.files?.[0])}
        className="sr-only"
      />

      {imageUrl ? (
        <>
          <Photo url={imageUrl} name={name} />
          <div className="flex flex-wrap gap-2">
            <label htmlFor={`photo-${id}`} className={aBtn("secondary", "md", "cursor-pointer")}>
              <Icon name="upload" size={15} />
              Change photo
            </label>
            <button
              type="button"
              onClick={() => setRemoving(true)}
              className={aBtn("quiet", "md", "text-a-bad-ink hover:bg-a-bad-wash")}
            >
              <Icon name="trash" size={15} />
              Remove photo
            </button>
          </div>
        </>
      ) : (
        /*
         * The drop zone.
         *
         * A <label> for the file input rather than a div with a click handler,
         * which is what makes it keyboard-operable and correctly labelled with
         * no ARIA at all — Enter or Space on a focused label opens the file
         * dialog because that is what a label for a file input does.
         *
         * `onDragOver` must call preventDefault or the browser navigates to the
         * dropped file, which is the single most common way a drop zone fails.
         */
        <label
          htmlFor={`photo-${id}`}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={[
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-a border-2 border-dashed px-5 py-8 text-center",
            "transition-colors duration-[var(--dur-ui)]",
            dragOver
              ? "border-a-accent bg-a-accent-wash"
              : "border-a-line-strong bg-a-sunken hover:border-a-ghost",
          ].join(" ")}
          style={{ minHeight: "11rem" }}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-a-surface text-a-faint shadow-a-card">
            <Icon name="image" size={19} />
          </span>
          <span className="font-a-sans text-a-body font-semibold text-a-ink">
            {dragOver ? "Drop the photo here" : "Drag a photo here"}
          </span>
          <span className="text-a-meta text-a-muted">
            or <span className="font-medium text-a-accent-ink underline">choose a photo</span>
          </span>
          <span className="text-a-meta text-a-faint">
            JPG, PNG or WEBP · up to {MAX_UPLOAD_BYTES / 1024 / 1024}MB
          </span>
        </label>
      )}

      {/*
        §43's hint, and deliberately a hint. Nothing here validates lighting or
        framing — that would mean refusing a photograph on an aesthetic
        judgement a program cannot make, and an owner whose only picture of the
        pistachio cream is a slightly dim one is better served by a dim picture
        than by none.
      */}
      <p className="text-a-meta leading-relaxed text-a-muted">
        Use a clear, well-lit photo with the {name.toLowerCase()} centred in the frame.
        We crop everything to the same shape so the catalogue stays even.
      </p>

      {localError && (
        <p role="alert" className="flex items-start gap-1.5 text-a-meta font-medium text-a-bad-ink">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {localError}
        </p>
      )}

      {/* §38: a failed upload offers the retry rather than only reporting. */}
      {upState && !upState.ok && (
        <div className="flex flex-wrap items-center gap-2 rounded-a border border-a-bad-line bg-a-bad-wash px-3 py-2.5">
          <p role="alert" className="min-w-0 flex-1 text-a-meta font-medium text-a-bad-ink">
            {upState.message}
          </p>
          <label htmlFor={`photo-${id}`} className={aBtn("secondary", "sm", "cursor-pointer")}>
            Try again
          </label>
        </div>
      )}

      <form ref={removeForm} action={remove} className="hidden">
        <input type="hidden" name="id" value={id} />
      </form>

      <ConfirmDialog
        open={removing}
        title={`Remove the photo from ${name}?`}
        body={
          <>
            Customers will see the colour swatch instead. This cannot be undone —
            you would need to upload the photo again.
          </>
        }
        confirmLabel="Remove photo"
        busy={rmPending}
        onConfirm={() => removeForm.current?.requestSubmit()}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

/**
 * The photograph as customers will see it.
 *
 * `next/image` with a fixed `sizes`, so the CDN serves a variant sized for this
 * box rather than the stored 1024px one — lib/storage already caps the original,
 * and this is the second half of §12.
 *
 * The remote host has to be allowed in next.config, which is the one thing that
 * makes this fail silently if forgotten: an unconfigured host renders nothing
 * and logs on the server only.
 */
function Photo({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded-a border border-a-line bg-a-sunken text-a-ghost"
        style={{ aspectRatio: String(IMAGE_ASPECT) }}
      >
        <div className="flex flex-col items-center gap-1.5">
          <Icon name="image" size={22} />
          <span className="text-a-meta">No photo yet</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-a border border-a-line bg-a-sunken"
      style={{ aspectRatio: String(IMAGE_ASPECT) }}
    >
      <Image
        src={url}
        alt={`${name}, as customers see it`}
        fill
        sizes="(min-width: 1024px) 30rem, 100vw"
        className="object-cover"
      />
    </div>
  );
}
