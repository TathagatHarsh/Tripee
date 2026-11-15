"use client";

import { useActionState, useEffect, useState } from "react";
import { resendInvite, type ActionResult } from "../actions";
import { useToast } from "@/components/admin/Toast";
import { aBtn } from "@/components/admin/ui";

/** The invite link with Copy, WhatsApp and Resend. `whatsappUrl` is built on the server: lib/onboarding is server-only. */
export function InviteLink({
  vendorId, link: initial, whatsappUrl: initialWa,
}: { vendorId: string; link?: string; whatsappUrl?: string | null }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(resendInvite, undefined);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (result) toast(result.message, result.ok); }, [result, toast]);

  const link = result?.link ?? initial;
  const wa = result?.link ? result.whatsappUrl : initialWa;

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast("Couldn't copy. Select the link and copy it by hand.", false); }
  }

  return (
    <div className="flex flex-col gap-2">
      {link ? (
        <p className="break-all rounded-a border border-a-line px-3 py-2 font-a-mono text-a-meta text-a-ink">{link}</p>
      ) : (
        <p className="text-a-small text-a-muted">The link is only shown once, when it is made. Resend for a fresh one.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {link && <button type="button" onClick={copy} className={aBtn("secondary", "md")}>{copied ? "Copied" : "Copy link"}</button>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" className={aBtn("secondary", "md")}>Send on WhatsApp</a>}
        {vendorId && (
          <form action={formAction}>
            <input type="hidden" name="id" value={vendorId} />
            <button type="submit" disabled={pending} className={aBtn("quiet", "md")}>{pending ? "Making…" : "Resend invite"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
