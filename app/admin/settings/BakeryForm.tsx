"use client";

import { useActionState } from "react";
import { saveBakery, type ActionResult } from "../actions";
import { aBtn, aField } from "@/components/admin/ui";

export interface Bakery {
  name: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  fssaiLicence: string;
  orderNotifyEmail: string | null;
}

const FIELDS: { name: keyof Bakery; label: string; hint?: string; type?: string }[] = [
  { name: "name", label: "Bakery name" },
  { name: "phone", label: "Phone", hint: "The number a customer rings when something is wrong." },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", hint: "Where a pickup order is collected from." },
  { name: "hours", label: "Opening hours", hint: "Written the way you would say it out loud." },
];

export function BakeryForm({ bakery }: { bakery: Bakery }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveBakery,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-a border border-a-line bg-a-surface px-4 py-4">
        {FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1">
            <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
              {f.label}
            </span>
            <input
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={String(bakery[f.name] ?? "")}
              className={aField("w-full max-w-prose")}
            />
            {f.hint && <span className="font-a-sans text-a-meta text-a-muted">{f.hint}</span>}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-a border border-a-line bg-a-surface px-4 py-4">
        <h2 className="text-a-item">On the documents</h2>

        <label className="flex flex-col gap-1">
          <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
            FSSAI licence number
          </span>
          <input
            name="fssaiLicence"
            defaultValue={bakery.fssaiLicence}
            maxLength={40}
            className={aField("w-full max-w-md")}
          />
          {/*
            The one field here better left empty than guessed at. A licence
            number is a real registration, and a plausible-looking wrong one on
            a public docket is a worse document than no line at all.
          */}
          <span className="font-a-sans text-a-meta leading-relaxed text-a-muted">
            Printed on every docket. Leave it empty and no line appears — better
            an absent licence than an invented one.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-a border border-a-line bg-a-surface px-4 py-4">
        <h2 className="text-a-item">When an order arrives</h2>

        <label className="flex flex-col gap-1">
          <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
            Notify this address
          </span>
          <input
            name="orderNotifyEmail"
            type="email"
            defaultValue={bakery.orderNotifyEmail ?? ""}
            className={aField("w-full max-w-md")}
          />
          <span className="font-a-sans text-a-meta leading-relaxed text-a-muted">
            Saved, and not yet sent to. Every order already writes a{" "}
            <code className="font-a-mono">new_order</code> line to the server log,
            which is what an alert would read; wiring a real email needs a
            sending account, so this holds the address until there is one.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={aBtn("primary", "md")}>
          {pending ? "Saving" : "Save"}
        </button>
        {result && (
          <p
            role="status"
            className={`font-a-mono text-a-meta ${result.ok ? "text-a-accent-ink" : "text-a-bad-ink"}`}
          >
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
