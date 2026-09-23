"use client";
import { useActionState } from "react";
import type { Vendor } from "@prisma/client";
import { saveAssignmentRules } from "./assignmentActions";
import { aBtn, aField } from "@/components/admin/ui";
export function AssignmentRulesForm({ vendor: v }: { vendor: Vendor }) {
  const [result, action, pending] = useActionState(
    saveAssignmentRules,
    undefined,
  );
  const fields = [
    ["latitude", "Latitude", v.latitude],
    ["longitude", "Longitude", v.longitude],
    ["serviceRadiusKm", "Service radius (road km)", v.serviceRadiusKm],
    [
      "maxConcurrentOrders",
      "Concurrent orders (0 pauses offers)",
      v.maxConcurrentOrders,
    ],
    ["commissionBps", "Commission (basis points: 2000 = 20%)", v.commissionBps],
    ["assignmentFeePaise", "Fixed fee (paise)", v.assignmentFeePaise],
  ] as const;
  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-a-line bg-a-surface p-5"
    >
      <h2 className="text-lg font-semibold">Smart assignment</h2>
      <input type="hidden" name="id" value={v.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([name, label, value]) => (
          <label key={name} className="text-sm">
            {label}
            <input
              className={aField("mt-1 w-full")}
              name={name}
              type="number"
              step={
                name === "latitude" ||
                name === "longitude" ||
                name === "serviceRadiusKm"
                  ? "any"
                  : "1"
              }
              required
              defaultValue={value ?? ""}
            />
          </label>
        ))}
      </div>
      <label className="block">
        <input
          type="checkbox"
          name="isAcceptingOrders"
          defaultChecked={v.isAcceptingOrders}
        />{" "}
        Accepting new orders
      </label>
      <label className="block">
        <input
          type="checkbox"
          name="fulfillsAllProducts"
          defaultChecked={v.fulfillsAllProducts}
        />{" "}
        Can fulfill all products and custom cakes
      </label>
      <label className="block text-sm">
        Otherwise, supported product IDs (comma separated)
        <input
          name="supportedProductIds"
          className={aField("mt-1 w-full")}
          defaultValue={v.supportedProductIds.join(", ")}
        />
      </label>
      <label className="block text-sm">
        Unavailable until (UTC)
        <input
          name="unavailableUntil"
          type="datetime-local"
          className={aField("mt-1 w-full")}
          defaultValue={v.unavailableUntil?.toISOString().slice(0, 16) ?? ""}
        />
      </label>
      <button disabled={pending} className={aBtn("primary", "md")}>
        {pending ? "Saving…" : "Save assignment rules"}
      </button>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
    </form>
  );
}
