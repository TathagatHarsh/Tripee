"use client";

import { useState } from "react";
import { aBtn } from "@/components/admin/ui";

/** The quote's Pay-now page, to send by hand when WhatsApp didn't deliver it. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
    setTimeout(() => setCopied(null), 2000);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="min-w-0 break-all font-a-mono text-a-meta text-a-muted">{url}</span>
      <button type="button" onClick={copy} className={aBtn("secondary", "sm")}>
        {copied ? "Copied" : copied === false ? "Select and copy by hand" : "Copy payment link"}
      </button>
    </div>
  );
}
