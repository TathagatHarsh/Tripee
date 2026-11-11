"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { payWithRazorpay } from "@/components/shop/payWithRazorpay";
import type { PaymentProof } from "@/lib/checkout";
import { sBtn } from "@/lib/shopUi";

const STOPPED = {
  dismissed: "Payment cancelled. Nothing was charged.",
  unavailable: "We couldn't open the payment window. Nothing was charged. Please try again.",
} as const;

const post = async (url: string, body?: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { res, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

/**
 * Pays the quote in Razorpay's window, then confirms it here. A payment already
 * taken is kept, so pressing again after a failed confirm re-sends it rather
 * than charging twice.
 */
export function PayButton({ token, name, phone, amount }: { token: string; name: string; phone: string; amount: string }) {
  const router = useRouter();
  const [proof, setProof] = useState<PaymentProof | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/custom-requests/${encodeURIComponent(token)}`;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      let paid = proof;
      if (!paid) {
        const intent = await post(`${base}/intent`);
        if (!intent.res.ok) return setError(String(intent.data.error ?? "We couldn't start the payment. Nothing has been charged."));
        const result = await payWithRazorpay({
          keyId: String(intent.data.keyId), razorpayOrderId: String(intent.data.razorpayOrderId),
          amountPaise: Number(intent.data.amountPaise), name, phone,
        });
        if (result.kind !== "paid") return setError(result.kind === "failed" ? result.message : STOPPED[result.kind]);
        paid = result.proof;
        setProof(paid);
      }
      const { res, data } = await post(`${base}/pay`, paid);
      if (res.ok && typeof data.orderRef === "string") return router.push(`/orders/${data.orderRef}`);
      // A refund or a refused proof ends this payment; anything else keeps it for another press.
      if (res.status === 409 || res.status === 400) setProof(null);
      setError(String(data.error ?? "We couldn't confirm your payment. Your payment is safe; press Pay again to finish."));
    } catch {
      setError("We couldn't reach our server. If you paid, your payment is safe; press Pay again to finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={pay} disabled={busy} className={sBtn("primary", "lg")}>
        {busy ? "Working…" : proof ? "Finish payment" : `Pay ${amount}`}
      </button>
      {error && <p role="alert" className="text-s-berry">{error}</p>}
    </div>
  );
}
