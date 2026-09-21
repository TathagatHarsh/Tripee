"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addVendor, linkVendorUser, saveVendor, setVendorActive, unlinkVendorUser,
  type ActionResult,
} from "../actions";
import { useToast } from "@/components/admin/Toast";
import { aBtn, aField } from "@/components/admin/ui";

/**
 * Every write on the two vendor pages.
 *
 * One file rather than one per form, because they are four small forms sharing
 * one layout and one result-handling convention — the same reason
 * DeliveryForms.tsx exists for the delivery page.
 *
 * None of these decides anything. Each is a `<form action={…}>` posting to a
 * Server Action in ../actions.ts that re-checks `requireAdmin()` for itself, so
 * a button rendered by mistake is still a button that cannot do anything. The
 * client's whole job here is the pending state and the toast.
 */

export interface VendorFields {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

const FIELDS: {
  name: keyof VendorFields;
  label: string;
  hint?: string;
  type?: string;
  wide?: boolean;
}[] = [
  { name: "name", label: "Bakery name" },
  { name: "phone", label: "Phone", hint: "The number the office rings about an order." },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", wide: true },
];

/** Announce a result and print it, for the reason StatusActions does both. */
function useAnnounce(result: ActionResult | undefined) {
  const { toast } = useToast();
  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);
}

function Failure({ result }: { result: ActionResult | undefined }) {
  if (!result || result.ok) return null;
  return (
    <p
      role="alert"
      className="rounded-a border border-a-bad-line bg-a-bad-wash px-3 py-2 text-a-small font-medium leading-snug text-a-bad-ink"
    >
      {result.message}
    </p>
  );
}

/**
 * Add a bakery, or edit one.
 *
 * The same four fields either way, so it is the same component: a `vendor` prop
 * means edit and its absence means add. Two components would be two places for
 * a fifth field to be forgotten.
 *
 * Only the name is required. A partner who has given the shop a phone number
 * and nothing else is a real partner — see the note in ../actions.ts on why the
 * other three become null rather than "".
 */
export function VendorForm({ vendor }: { vendor?: VendorFields & { id: string } }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    vendor ? saveVendor : addVendor,
    undefined,
  );
  useAnnounce(result);

  const formRef = useRef<HTMLFormElement>(null);

  /* Clear the fields after a bakery is added, so the form is ready for the next
     one rather than holding the last one's name. Never on edit, where the
     values on screen are the row. */
  useEffect(() => {
    if (!vendor && result?.ok) formRef.current?.reset();
  }, [result, vendor]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4 p-4 sm:p-5">
      {vendor && <input type="hidden" name="id" value={vendor.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.name} className={`flex flex-col gap-1 ${f.wide ? "sm:col-span-2" : ""}`}>
            <span className="font-a-sans text-a-small font-medium text-a-ink">{f.label}</span>
            <input
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={vendor?.[f.name] ?? ""}
              required={f.name === "name"}
              className={aField("w-full")}
            />
            {f.hint && <span className="text-a-meta leading-snug text-a-muted">{f.hint}</span>}
          </label>
        ))}
      </div>

      <Failure result={result} />

      <div>
        <button type="submit" disabled={pending} className={aBtn("primary", "md")}>
          {pending ? "Saving…" : vendor ? "Save vendor" : "Add vendor"}
        </button>
      </div>
    </form>
  );
}

/**
 * Withdraw a bakery from the picker, or put it back.
 *
 * No confirmation dialog, because this is the reversible one: the button beside
 * it puts them straight back, and nothing about an order they are already
 * holding changes either way. The sentence under it says so, since "deactivate"
 * on its own reads like it might cancel work in progress.
 */
export function ActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    setVendorActive,
    undefined,
  );
  useAnnounce(result);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={aBtn("secondary", "md", isActive ? "text-a-bad-ink" : "")}
      >
        {pending ? "Working…" : isActive ? "Deactivate" : "Reactivate"}
      </button>
      <Failure result={result} />
    </form>
  );
}

/**
 * Give somebody the keys to this bakery's dashboard.
 *
 * An email, because that is what a person knows about their own account, and
 * the lookup happens at Clerk on the server — see `linkVendorUser` in
 * ../actions.ts for why this one form is allowed to write a role when nothing
 * else on a request path is.
 */
export function LinkUserForm({ vendorId }: { vendorId: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    linkVendorUser,
    undefined,
  );
  useAnnounce(result);

  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-a-sans text-a-small font-medium text-a-ink">
            Email they sign in with
          </span>
          <input
            name="email"
            type="email"
            required
            placeholder="baker@sweetcrust.in"
            className={aField("w-full")}
          />
        </label>
        <button type="submit" disabled={pending} className={aBtn("secondary", "md")}>
          {pending ? "Linking…" : "Link account"}
        </button>
      </div>
      <Failure result={result} />
    </form>
  );
}

/** Take the keys back. Their assignment history stays — see ../actions.ts. */
export function UnlinkUserButton({ profileId }: { profileId: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    unlinkVendorUser,
    undefined,
  );
  useAnnounce(result);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="profileId" value={profileId} />
      <button
        type="submit"
        disabled={pending}
        className={aBtn("quiet", "sm", "text-a-bad-ink hover:bg-a-bad-wash")}
      >
        {pending ? "Working…" : "Unlink"}
      </button>
      <Failure result={result} />
    </form>
  );
}
