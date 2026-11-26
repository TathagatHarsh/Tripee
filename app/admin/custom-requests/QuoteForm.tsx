"use client";

import { useActionState, useEffect } from "react";
import { useToast } from "@/components/admin/Toast";
import { aBtn, aField } from "@/components/admin/ui";
import { adminQuoteAction, type QuoteActionResult } from "./actions";

/** Price a request: what the customer pays in all, delivery included. They get Pay now on WhatsApp. */
export function QuoteForm({ id }: { id: string }) {
  const [result, formAction, pending] = useActionState<QuoteActionResult | undefined, FormData>(adminQuoteAction, undefined);
  const { toast } = useToast();
  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <PriceField>
        <button type="submit" disabled={pending} className={aBtn("primary", "md")}>{pending ? "Sending…" : "Send quote"}</button>
      </PriceField>
    </form>
  );
}

/** What the customer pays in all. Delivery is included, and there is no bakery: MakeYourCakes makes custom cakes. */
export function PriceField({ children }: { children: React.ReactNode }) {
  return (
    <>
      <label className="flex flex-col gap-1 font-a-sans text-a-small">
        Customer pays (₹, delivery included)
        <input name="price" type="number" inputMode="numeric" min={100} max={100000} step={1} required className={aField("w-40")} />
      </label>
      {children}
    </>
  );
}
