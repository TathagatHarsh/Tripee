"use client";
import { useEffect, useState } from "react";
export function CustomerAssignmentStatus({ orderRef }: { orderRef: string }) {
  const [state, setState] = useState<{
    label: string;
    note: string;
    status: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(
          `/api/orders/${encodeURIComponent(orderRef)}/assignment`,
          { signal: controller.signal },
        );
        if (r.ok) setState(await r.json());
      } catch {
        /* Existing tracking link remains available. */
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [orderRef]);
  return (
    <p role="status" className="mt-3 rounded-xl bg-s-cream-deep p-4 text-sm">
      {state ? <><strong>{state.label}</strong><span className="mt-1 block">{state.note}</span></> : 'Your order is with MakeYourCakes. Track your order for updates.'}
    </p>
  );
}
