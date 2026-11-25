"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { enquiryHref, SIZES, TIMES, type Enquiry } from "@/lib/customEnquiry";
import { ACCEPTED_TYPES } from "@/lib/imageSpec";
import { sBtn, sField } from "@/lib/shopUi";

/**
 * "Ask for this cake": a popup that asks for size, quantity, sponge, date and
 * address, then opens WhatsApp with all of it already written, so the bakery
 * can quote from the first message. Uses the same `<dialog>` sheet as
 * AddToCartSheet (`.s-sheet`), which handles Escape and focus.
 */
export function CustomEnquiry({
  to,
  cakeLink,
  thumb,
  title,
  canUpload = false,
  buttonClassName,
  children,
}: {
  /** The bakery's WhatsApp number, digits with country code. */
  to: string;
  /** The gallery cake's photo URL; null when it's their own design. */
  cakeLink: string | null;
  thumb?: { src: string; alt: string };
  title: string;
  /** A photo store is set up, so their own photo can be attached here instead of in the chat. */
  canUpload?: boolean;
  buttonClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {children}
      </button>
      {open && (
        <Sheet
          to={to}
          cakeLink={cakeLink}
          thumb={thumb}
          title={title}
          canUpload={canUpload && !cakeLink}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

const label = "flex flex-col gap-1.5 text-[0.875rem] font-semibold text-s-cocoa";
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Phone photos can be 5MB+ (and HEIC on iPhones); a 1600px JPEG is plenty to quote from and fits the upload limit. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no()), "image/jpeg", 0.88));
  } catch {
    return file;
  }
}

type Photo = { preview: string; url?: string; error?: string };

function Sheet({
  to, cakeLink, thumb, title, canUpload, onClose,
}: {
  to: string;
  cakeLink: string | null;
  thumb?: { src: string; alt: string };
  title: string;
  canUpload: boolean;
  onClose: () => void;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const uploading = Boolean(photo && !photo.url && !photo.error);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo?.preview]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setPhoto(null);
    const preview = URL.createObjectURL(file);
    setPhoto({ preview });
    const body = new FormData();
    body.append("photo", await shrink(file), "photo.jpg");
    try {
      const res = await fetch("/api/enquiry-photo", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      setPhoto((p) => (p?.preview === preview ? (json.url ? { preview, url: json.url } : { preview, error: json.error ?? "We couldn't upload that photo. Please try again." }) : p));
    } catch {
      setPhoto((p) => (p?.preview === preview ? { preview, error: "We couldn't upload that photo. Check your connection and try again." } : p));
    }
  }
  const dialog = useRef<HTMLDialogElement | null>(null);
  const mount = useCallback((el: HTMLDialogElement | null) => {
    dialog.current = el;
    if (el && !el.open) el.showModal();
  }, []);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onClose]);
  const dismiss = () => dialog.current?.close();

  function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    const enquiry: Enquiry = {
      name: s("name"),
      size: s("size"),
      quantity: Math.max(1, Math.min(50, Number(s("quantity")) || 1)),
      sponge: s("sponge") === "With egg" ? "With egg" : "Eggless",
      flavour: s("flavour"),
      message: s("message"),
      date: s("date"),
      time: s("time"),
      address: s("address"),
      pincode: s("pincode"),
      notes: s("notes"),
    };
    const href = enquiryHref(to, enquiry, cakeLink ?? photo?.url ?? null);
    /* A new tab on a computer; on a phone this hands over to the WhatsApp app. */
    if (!window.open(href, "_blank", "noopener")) window.location.assign(href);
    dismiss();
  }

  return (
    <dialog
      ref={mount}
      className="s-root s-sheet"
      aria-labelledby="enquiry-title"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dismiss();
      }}
    >
      <div className="s-sheet-body flex max-h-[85dvh] flex-col">
        <span aria-hidden className="s-sheet-grip" />
        <div className="flex items-start gap-4 border-b border-s-line px-5 pt-4 pb-4 sm:px-7 sm:pt-6">
          {thumb && (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-s-sm bg-s-cream-deep sm:size-20">
              <Image src={thumb.src} alt="" fill sizes="80px" className="object-cover" />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="enquiry-title" className="text-[1.25rem] leading-tight sm:text-[1.4375rem]">{title}</h2>
            <p className="text-[0.875rem] leading-snug text-s-bark">
              Tell us the basics and we&rsquo;ll quote on WhatsApp. Everything below goes into the chat for you.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-s-sm text-s-bark transition-colors hover:bg-s-cream-deep hover:text-s-cocoa"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden focusable="false">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={send} className="flex flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-7">
          <label className={label}>
            Your name
            <input name="name" required maxLength={60} autoComplete="name" className={sField()} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Size
              <select name="size" required defaultValue="1 kg" className={sField()}>
                {SIZES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className={label}>
              How many cakes
              <input name="quantity" type="number" min={1} max={50} defaultValue={1} required className={sField()} />
            </label>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[0.875rem] font-semibold text-s-cocoa">Sponge</legend>
            <div className="grid grid-cols-2 gap-3">
              {(["Eggless", "With egg"] as const).map((v, i) => (
                <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-s-sm border border-s-line px-3 has-[:checked]:border-s-cocoa has-[:checked]:bg-s-cream-deep">
                  <input type="radio" name="sponge" value={v} defaultChecked={i === 0} />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className={label}>
            Flavour <span className="font-normal text-s-bark">(optional)</span>
            <input name="flavour" maxLength={80} placeholder="Chocolate, pineapple, red velvet…" className={sField()} />
          </label>

          <label className={label}>
            Message on the cake <span className="font-normal text-s-bark">(optional)</span>
            <input name="message" maxLength={80} placeholder="Happy Birthday Aarav" className={sField()} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Delivery date
              <input name="date" type="date" required min={todayIST()} className={sField()} />
            </label>
            <label className={label}>
              Time
              <select name="time" defaultValue={TIMES[0]} className={sField()}>
                {TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <label className={label}>
            Delivery address
            <textarea name="address" required maxLength={240} rows={2} autoComplete="street-address" placeholder="House, street, area, landmark" className={sField("py-2")} />
          </label>

          <label className={label}>
            Pincode
            <input name="pincode" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="postal-code" placeholder="500001" title="Six digits" className={sField()} />
          </label>

          <label className={label}>
            Anything else <span className="font-normal text-s-bark">(optional)</span>
            <textarea name="notes" maxLength={300} rows={2} placeholder="Colours, theme, budget, changes to the design" className={sField("py-2")} />
          </label>

          {canUpload ? (
            <div className="flex flex-col gap-1.5">
              <label className={label}>
                Photo of the cake you want <span className="font-normal text-s-bark">(optional)</span>
                <input name="photo" type="file" accept={ACCEPTED_TYPES.join(",")} onChange={pick} className="text-[0.875rem] font-normal text-s-bark file:mr-3 file:min-h-11 file:rounded-s-sm file:border file:border-s-line file:bg-s-cream-deep file:px-3 file:font-medium file:text-s-cocoa" />
              </label>
              {photo && (
                <div className="flex items-center gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-s-sm bg-s-cream-deep">
                    <Image src={photo.preview} alt="Your cake photo" fill unoptimized className="object-cover" />
                  </div>
                  <p role="status" className={`text-[0.875rem] ${photo.error ? "text-s-berry" : "text-s-bark"}`}>
                    {photo.error ?? (photo.url ? "Photo attached. The bakery will see it in your message." : "Uploading photo…")}
                  </p>
                </div>
              )}
            </div>
          ) : !cakeLink && (
            <p className="rounded-s-sm bg-s-cream-deep px-3 py-2 text-[0.875rem] text-s-bark">
              WhatsApp can&rsquo;t attach a photo from here, so send your design photo in the chat that opens.
            </p>
          )}

          <button type="submit" disabled={uploading} className={sBtn("primary", "lg", "w-full")}>
            {uploading ? "Uploading photo…" : <>Place enquiry on WhatsApp <span aria-hidden>↗</span></>}
          </button>
          <p className="-mt-2 text-center text-[0.8125rem] text-s-bark">
            Nothing is charged. We confirm the price and design with you in the chat.
          </p>
        </form>
      </div>
    </dialog>
  );
}
