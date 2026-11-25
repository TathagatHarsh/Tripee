"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { aBtn, aField } from "@/components/admin/ui";
import { LocationSheet } from "@/components/shop/LocationSheet";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { CUSTOM_SIZES_KG } from "@/lib/customRules";
import { deliveryChoices } from "@/lib/deliveryRules";
import type { LocatedAddress } from "@/lib/location";
import { newQuoteAction, type QuoteActionResult } from "./actions";
import { PriceFields } from "./QuoteForm";

const label = "flex flex-col gap-1 font-a-sans text-a-small";

/**
 * A customer who phoned instead of using the website: the admin types what was agreed and the
 * customer gets the same WhatsApp quote with Pay now, from our number. Never offered to bakeries.
 */
export function NewQuoteForm({ catalog, closedDays, bakeries }: { catalog: CatalogSnapshot; closedDays: string[]; bakeries: { id: string; name: string }[] }) {
  const [form, setForm] = useState(0); // bumped after a quote goes out, to clear every field
  const [address, setAddress] = useState<LocatedAddress | null>(null);
  const [pickAddress, setPickAddress] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueWindow, setDueWindow] = useState("");
  const [result, formAction, pending] = useActionState<QuoteActionResult | undefined, FormData>(async (prev, fd) => {
    const res = await newQuoteAction(prev, fd);
    if (res.ok) {
      setForm((n) => n + 1);
      setAddress(null);
      setDueDate("");
      setDueWindow("");
    }
    return res;
  }, undefined);
  const { toast } = useToast();
  const days = useMemo(() => deliveryChoices(new Date(), "custom", catalog.deliveryRules, new Set(closedDays)).days, [catalog.deliveryRules, closedDays]);
  const pickedDay = days.find((d) => d.date === dueDate);

  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);

  if (!bakeries.length) return <p className="font-a-sans text-a-small text-a-muted">Add an active bakery with a WhatsApp number first.</p>;

  // onSubmit, not a form action: React resets a form after its action, which would wipe a failed attempt.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!address) return toast("Choose the delivery address on the map.", false);
    if (!dueWindow) return toast("Choose a delivery date and window.", false);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    fd.set("data", JSON.stringify({
      name: s("name"), phone: s("phone"), sizeKg: Number(s("sizeKg")), flavour: s("flavour"),
      ...(s("cakeMessage") ? { cakeMessage: s("cakeMessage") } : {}),
      dueDate, dueWindow, address, consent: fd.get("consent") === "on",
    }));
    startTransition(() => formAction(fd));
  }

  return (
    <>
      <form key={form} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Customer&rsquo;s name
          <input name="name" required maxLength={80} className={aField()} />
        </label>
        <label className={label}>
          Customer&rsquo;s WhatsApp number
          <input name="phone" type="tel" inputMode="tel" required placeholder="98765 43210" className={aField()} />
        </label>
        <label className={label}>
          Size
          <select name="sizeKg" defaultValue="1" className={aField()}>
            {CUSTOM_SIZES_KG.map((n) => <option key={n} value={n}>{n} kg</option>)}
          </select>
        </label>
        <label className={label}>
          Flavour
          <input name="flavour" required maxLength={60} className={aField()} />
        </label>
        <label className={label}>
          Message on the cake (optional)
          <input name="cakeMessage" maxLength={60} className={aField()} />
        </label>
        <label className={label}>
          Photo of the cake (optional)
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="font-a-sans text-a-small" />
        </label>
        <label className={label}>
          Delivery date
          <input
            type="date" required value={dueDate} min={days[0]?.date} max={days[days.length - 1]?.date} className={aField()}
            onChange={(e) => { setDueDate(e.target.value); setDueWindow(""); }}
          />
        </label>
        <label className={label}>
          Delivery window
          <select value={dueWindow} onChange={(e) => setDueWindow(e.target.value)} required disabled={!pickedDay?.windows.length} className={aField()}>
            <option value="">{!dueDate ? "Pick a date first" : pickedDay?.windows.length ? "Choose a window" : "No windows that day"}</option>
            {pickedDay?.windows.map((w) => <option key={w.label} value={w.label}>{w.label}</option>)}
          </select>
        </label>
        <div className={`${label} sm:col-span-2`}>
          Delivery address
          <button type="button" onClick={() => setPickAddress(true)} className={aBtn("secondary", "md", "justify-start text-left")}>
            {address ? `${address.address || address.locality}, ${address.pincode}` : "Choose on map"}
          </button>
        </div>
        <label className="flex items-start gap-2 font-a-sans text-a-small sm:col-span-2">
          <input name="consent" type="checkbox" required className="mt-0.5 size-4" />
          The customer agreed on the call to get WhatsApp messages about this cake.
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <PriceFields bakeries={bakeries}>
            <button type="submit" disabled={pending} className={aBtn("primary", "md")}>{pending ? "Sending…" : "Save and send quote"}</button>
          </PriceFields>
        </div>
      </form>
      {/* Outside the form: Enter in the map's search box must not submit it. */}
      <LocationSheet
        open={pickAddress}
        initial={address ? { lat: address.lat, lng: address.lng } : null}
        catalog={catalog}
        onClose={() => setPickAddress(false)}
        onConfirm={(a) => { setAddress(a); setPickAddress(false); }}
      />
    </>
  );
}
