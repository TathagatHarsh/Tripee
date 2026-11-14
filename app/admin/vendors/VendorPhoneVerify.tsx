"use client";

import { useEffect, useId, useState } from "react";
import { sendVendorPhoneCode } from "../actions";
import { aBtn, aField } from "@/components/admin/ui";
import { indianMobile } from "@/lib/phone";

const RESEND_SECONDS = 30;

/**
 * Send-code step under the bakery phone field. Posts `phoneToken` / `phoneCode`
 * with the form; the save action checks them. Shows nothing unless the number
 * is valid and differs from the saved one.
 */
export function VendorPhoneVerify({ phone, saved }: { phone: string; saved: string | null }) {
  const n = indianMobile(phone);
  if (!n || n === indianMobile(saved ?? "")) return null;
  // Editing the number remounts it, which drops the token and the code.
  return <Step key={n} phone={phone} />;
}

function Step({ phone }: { phone: string }) {
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const inputId = useId();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    setBusy(true);
    setError(null);
    setCode("");
    try {
      const r = await sendVendorPhoneCode(phone);
      if (r.ok) {
        setToken(r.token);
        setWait(RESEND_SECONDS);
      } else {
        setError(r.error);
      }
    } catch {
      setError("We couldn't send the code right now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="phoneToken" value={token} />
      <input type="hidden" name="phoneCode" value={code} />
      {!token ? (
        <>
          <p className="text-a-meta leading-snug text-a-muted">Send a code to this number and enter it to save.</p>
          <button type="button" onClick={send} disabled={busy} aria-busy={busy} className={aBtn("secondary", "md", "self-start")}>
            {busy ? "Sending…" : "Send code on WhatsApp"}
          </button>
        </>
      ) : (
        <>
          <label htmlFor={inputId} className="font-a-sans text-a-small font-medium text-a-ink">
            Code from the bakery
          </label>
          <input
            id={inputId}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              // Enter submits Save only once a full code is typed.
              if (e.key === "Enter" && code.length !== 6) e.preventDefault();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={aField("w-40")}
          />
          <p className="text-a-meta leading-snug text-a-muted">Ask the bakery for the 6-digit code we just sent on WhatsApp.</p>
          <button type="button" onClick={send} disabled={busy || wait > 0} className={aBtn("quiet", "sm", "self-start")}>
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-a-meta text-a-bad-ink">
          {error}
        </p>
      )}
    </div>
  );
}
