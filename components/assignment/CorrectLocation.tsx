"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function CorrectLocation({ orderRef }: { orderRef: string }) {
  const router = useRouter(),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 rounded-lg border border-a-line p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setPending(true);
        setMessage("");
        try {
          const r = await fetch(
            `/api/assignments/${encodeURIComponent(orderRef)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "location",
                lat: Number(form.get("lat")),
                lng: Number(form.get("lng")),
              }),
            },
          );
          const data = await r.json();
          setMessage(
            r.ok
              ? "Delivery pin saved. Choose an eligible bakery."
              : (data.error ?? "Could not save the delivery pin."),
          );
          if (r.ok) router.refresh();
        } catch {
          setMessage("Could not save. Please retry.");
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="font-semibold">
        Verify delivery location with the customer
      </p>
      <p className="mt-1 text-xs">
        Enter the confirmed coordinates before choosing a bakery.
        Previous attempts remain in the history.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <label>
          Latitude
          <input
            name="lat"
            type="number"
            min={-90}
            max={90}
            step="any"
            required
            className="block w-36 rounded border p-2"
          />
        </label>
        <label>
          Longitude
          <input
            name="lng"
            type="number"
            min={-180}
            max={180}
            step="any"
            required
            className="block w-36 rounded border p-2"
          />
        </label>
      </div>
      <button
        disabled={pending}
        className="mt-3 rounded bg-a-accent-ink px-3 py-2 text-white"
      >
        {pending ? "Saving…" : "Save verified pin and retry"}
      </button>
      {message && (
        <p role="status" className="mt-2">
          {message}
        </p>
      )}
    </form>
  );
}
