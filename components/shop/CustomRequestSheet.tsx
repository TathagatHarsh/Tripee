"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocationSheet } from "@/components/shop/LocationSheet";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { CUSTOM_SIZES_KG } from "@/lib/customRules";
import { deliveryChoices } from "@/lib/deliveryRules";
import type { LocatedAddress } from "@/lib/location";
import { sBtn, sField } from "@/lib/shopUi";

/**
 * "Send us your cake photo": the quoted-custom-cake request form. Posts the photo and details to
 * /api/custom-requests; a bakery quotes over WhatsApp. Same `<dialog>` `.s-sheet` as CustomEnquiry.
 */
export function CustomRequestSheet({ catalog, closedDays, buttonClassName, children }: { catalog: CatalogSnapshot; closedDays: string[]; buttonClassName: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {children}
      </button>
      {open && (
        <Sheet
          catalog={catalog}
          closedDays={closedDays}
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

function Err({ errors, name }: { errors: Record<string, string[]>; name: string }) {
  return errors[name]?.length ? <span role="alert" className="text-[0.8125rem] font-normal text-s-berry">{errors[name][0]}</span> : null;
}

function Sheet({ catalog, closedDays, onClose }: { catalog: CatalogSnapshot; closedDays: string[]; onClose: () => void }) {
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

  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [address, setAddress] = useState<LocatedAddress | null>(null);
  const [pickAddress, setPickAddress] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueWindow, setDueWindow] = useState("");
  // Custom cakes need the longer lead time: the picker only offers windows the server will accept.
  const days = useMemo(() => deliveryChoices(new Date(), "custom", catalog.deliveryRules, new Set(closedDays)).days, [catalog.deliveryRules, closedDays]);
  const pickedDay = days.find((d) => d.date === dueDate);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const local: Record<string, string[]> = {};
    if (!photo) local.photo = ["Add a photo of the cake you have in mind"];
    if (!address) local.address = ["Choose where to deliver"];
    if (!pickedDay?.windows.some((w) => w.label === dueWindow)) local.dueAt = ["Choose a delivery date and window"];
    setErrors(local);
    setProblem("");
    if (!photo || !address || local.dueAt) return;
    const data = {
      name: s("name"), phone: s("phone"), sizeKg: Number(s("sizeKg")), flavour: s("flavour"),
      ...(s("budget") ? { budgetRupees: Number(s("budget")) } : {}),
      ...(s("cakeMessage") ? { cakeMessage: s("cakeMessage") } : {}),
      dueDate, dueWindow,
      address, consent: f.get("consent") === "on",
    };
    const body = new FormData();
    body.set("data", JSON.stringify(data));
    body.set("photo", photo.file);
    setBusy(true);
    try {
      const res = await fetch("/api/custom-requests", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (res.status === 201) return setRef(json.ref);
      setErrors(json.fieldErrors ?? {});
      setProblem(json.error ?? "Something went wrong. Please try again.");
    } catch {
      setProblem("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={mount}
      className="s-root s-sheet"
      aria-labelledby="request-title"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dismiss();
      }}
    >
      <div className="s-sheet-body flex max-h-[85dvh] flex-col">
        <span aria-hidden className="s-sheet-grip" />
        <div className="flex items-start gap-4 border-b border-s-line px-5 pt-4 pb-4 sm:px-7 sm:pt-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="request-title" className="text-[1.25rem] leading-tight sm:text-[1.4375rem]">Your own cake design</h2>
            <p className="text-[0.875rem] leading-snug text-s-bark">Send a photo and the details. A bakery near you quotes the price on WhatsApp.</p>
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

        {ref ? (
          <div className="flex flex-col gap-3 px-5 py-8 sm:px-7" role="status">
            <p className="font-display text-[1.5rem] leading-tight text-s-cocoa">Thanks! We&rsquo;ll contact you shortly on WhatsApp.</p>
            <p className="text-s-bark">Your reference: <span className="font-mono font-semibold text-s-cocoa">{ref}</span></p>
            <button type="button" onClick={dismiss} className={sBtn("primary", "lg", "mt-2 w-full")}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-7">
            <label className={label}>
              Photo of the cake you want
              <input
                name="photo" type="file" accept="image/jpeg,image/png,image/webp" required
                className="text-[0.875rem] font-normal file:mr-3 file:min-h-11 file:rounded-s-sm file:border file:border-s-line-strong file:bg-s-shell file:px-4"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setPhoto(file ? { file, url: URL.createObjectURL(file) } : null);
                }}
              />
              <Err errors={errors} name="photo" />
            </label>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise
              <img src={photo.url} alt="Your chosen cake photo" className="max-h-48 w-full rounded-s-sm bg-s-cream-deep object-contain" />
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Size
                <select name="sizeKg" required defaultValue="1" className={sField()}>
                  {CUSTOM_SIZES_KG.map((n) => <option key={n} value={n}>{n} kg</option>)}
                </select>
                <Err errors={errors} name="sizeKg" />
              </label>
              <label className={label}>
                Budget in ₹ <span className="font-normal text-s-bark">(optional)</span>
                <input name="budget" type="number" inputMode="numeric" min={100} max={100000} step={1} className={sField()} />
                <Err errors={errors} name="budgetRupees" />
              </label>
            </div>

            <label className={label}>
              Flavour
              <input name="flavour" required maxLength={60} placeholder="Chocolate, pineapple, red velvet…" className={sField()} />
              <Err errors={errors} name="flavour" />
            </label>

            <label className={label}>
              Message on the cake <span className="font-normal text-s-bark">(optional)</span>
              <input name="cakeMessage" maxLength={60} placeholder="Happy Birthday Aarav" className={sField()} />
              <Err errors={errors} name="cakeMessage" />
            </label>

            <label className={label}>
              Delivery date
              <input
                name="date" type="date" required value={dueDate} className={sField()}
                min={days[0]?.date} max={days[days.length - 1]?.date}
                onChange={(e) => { setDueDate(e.target.value); setDueWindow(""); }}
              />
            </label>
            {dueDate && (pickedDay?.windows.length ? (
              <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <legend className="mb-2 text-[0.875rem] font-semibold text-s-cocoa">Delivery window</legend>
                {pickedDay.windows.map((w) => (
                  <label
                    key={w.label}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-s-sm border px-3 text-sm tabular-nums has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-s-cocoa ${dueWindow === w.label ? "border-s-cocoa bg-s-cream-deep font-semibold" : "border-s-line"}`}
                  >
                    <input type="radio" name="window" value={w.label} checked={dueWindow === w.label} onChange={() => setDueWindow(w.label)} className="sr-only" />
                    {w.label}
                  </label>
                ))}
              </fieldset>
            ) : (
              <p role="status" className="text-[0.8125rem] text-s-bark">{closedDays.includes(dueDate) ? "We're closed that day." : "No windows left that day. Choose another date."}</p>
            ))}
            <Err errors={errors} name="dueAt" />

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.875rem] font-semibold text-s-cocoa">Delivery address</span>
              <button type="button" onClick={() => setPickAddress(true)} className={sBtn("outline", "md", "w-full !justify-start text-left")}>
                {address ? `${address.address || address.locality}, ${address.pincode}` : "Choose on map"}
              </button>
              <Err errors={errors} name="address" />
            </div>

            <label className={label}>
              Your name
              <input name="name" required maxLength={80} autoComplete="name" className={sField()} />
              <Err errors={errors} name="name" />
            </label>
            <label className={label}>
              WhatsApp number
              <input name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="98765 43210" className={sField()} />
              <Err errors={errors} name="phone" />
            </label>

            <label className="flex items-start gap-3 text-[0.875rem] text-s-bark">
              <input name="consent" type="checkbox" required className="mt-1 size-5 shrink-0" />
              <span>I agree to be contacted on WhatsApp about this request.</span>
            </label>
            <Err errors={errors} name="consent" />

            {problem && <p role="alert" className="rounded-s-sm bg-s-cream-deep px-3 py-2 text-[0.875rem] text-s-berry">{problem}</p>}
            <button type="submit" disabled={busy} className={sBtn("primary", "lg", "w-full")}>
              {busy ? "Sending…" : "Send request"}
            </button>
            <p className="-mt-2 text-center text-[0.8125rem] text-s-bark">Nothing is charged until you accept a quote.</p>
          </form>
        )}
      </div>
      {/* Outside the form: pressing Enter in the sheet's search box must not submit the request. */}
      <LocationSheet
        open={pickAddress}
        initial={address ? { lat: address.lat, lng: address.lng } : null}
        catalog={catalog}
        onClose={() => setPickAddress(false)}
        onConfirm={(a) => { setAddress(a); setPickAddress(false); }}
      />
    </dialog>
  );
}
