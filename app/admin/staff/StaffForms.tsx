"use client";

import { useActionState, useEffect, useRef } from "react";
import { grantAdmin, revokeAdmin, type StaffResult } from "./actions";
import { useToast } from "@/components/admin/Toast";
import { aBtn, aField } from "@/components/admin/ui";

/**
 * The two writes on /admin/staff. Neither decides anything: each posts to a
 * Server Action that re-checks `requireAdmin()` and the rules in lib/staffRoles.
 * The client's job is the confirm, the pending state and the message.
 */

function useResult(result: StaffResult | undefined) {
  const { toast } = useToast();
  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);
}

function Failure({ result }: { result: StaffResult | undefined }) {
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

export function GrantAdminForm() {
  const [result, formAction, pending] = useActionState<StaffResult | undefined, FormData>(grantAdmin, undefined);
  useResult(result);

  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        const email = new FormData(e.currentTarget).get("email");
        if (!window.confirm(`Make ${email} an admin? They will be able to change prices, the catalogue, orders and other admins.`)) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-3 rounded-a border border-a-line bg-a-surface px-4 py-3.5"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-a-sans text-a-small font-medium text-a-ink">Make someone an admin</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="Email they sign in with"
            className={aField("w-full")}
          />
        </label>
        <button type="submit" disabled={pending} className={aBtn("primary", "md")}>
          {pending ? "Saving…" : "Make admin"}
        </button>
      </div>
      <p className="font-a-sans text-a-small text-a-muted">
        They need to have signed in once at /sign-in first.
      </p>
      <Failure result={result} />
    </form>
  );
}

export function RevokeAdminButton({ profileId, email }: { profileId: string; email: string }) {
  const [result, formAction, pending] = useActionState<StaffResult | undefined, FormData>(revokeAdmin, undefined);
  useResult(result);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Remove admin access from ${email}? They become an ordinary customer account.`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <button
        type="submit"
        disabled={pending}
        className={aBtn("quiet", "sm", "text-a-bad-ink hover:bg-a-bad-wash")}
      >
        {pending ? "Working…" : "Remove admin"}
      </button>
      <Failure result={result} />
    </form>
  );
}
