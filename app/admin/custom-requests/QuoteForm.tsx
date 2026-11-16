"use client";

import { useActionState, useEffect } from "react";
import { useToast } from "@/components/admin/Toast";
import { aBtn, aField } from "@/components/admin/ui";
import { adminQuoteAction, type QuoteActionResult } from "./actions";

/** Price a request yourself: pick the bakery that will bake it and type that bakery's price. */
export function QuoteForm({ id, bakeries, defaultBakery }: { id: string; bakeries: { id: string; name: string }[]; defaultBakery?: string | null }) {
  const [result, formAction, pending] = useActionState<QuoteActionResult | undefined, FormData>(adminQuoteAction, undefined);
  const { toast } = useToast();
  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);

  if (!bakeries.length) return <p className="font-a-sans text-a-small text-a-muted">Add an active bakery with a WhatsApp number to quote this yourself.</p>;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 font-a-sans text-a-small">
        Bakery
        <select name="vendorId" defaultValue={defaultBakery ?? bakeries[0].id} className={aField("min-w-40")}>
          {bakeries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-a-sans text-a-small">
        Bakery&rsquo;s price (₹)
        <input name="price" type="number" inputMode="numeric" min={100} max={100000} step={1} required className={aField("w-32")} />
      </label>
      <button type="submit" disabled={pending} className={aBtn("primary", "md")}>{pending ? "Sending…" : "Send quote"}</button>
      <p className="w-full font-a-sans text-a-small text-a-muted">The customer pays this plus your margin, rounded up to ₹10, plus delivery.</p>
    </form>
  );
}
