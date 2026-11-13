"use client";

import { useEffect, useState } from "react";
import { indianMobile } from "@/lib/phone";
import { sBtn, sField } from "@/lib/shopUi";

const RESEND_SECONDS = 30;
const COULDNT_SEND =
  "We couldn't send the code right now. Try again in a minute, or write to hello@makeyourcakes.com.";

/**
 * WhatsApp code check under the checkout phone field. Parents give it
 * `key={phone}` so editing the number starts over (idle, token dropped).
 */
export function PhoneVerify({
  phone,
  verified,
  onVerified,
}: {
  phone: string;
  verified: boolean;
  onVerified: (normalised: string) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (verified) {
    return <p className="text-sm font-semibold text-s-berry">✓ Verified on WhatsApp</p>;
  }

  async function send() {
    setBusy(true);
    setError(null);
    setCode("");
    try {
      const res = await fetch("/api/phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (res.ok && data.token) {
        setToken(data.token);
        setWait(RESEND_SECONDS);
      } else {
        setError(data.error ?? COULDNT_SEND);
      }
    } catch {
      setError(COULDNT_SEND);
    } finally {
      setBusy(false);
    }
  }

  async function verify(digits: string) {
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: digits, token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const n = indianMobile(phone);
      if (res.ok && n) onVerified(n);
      else setError(data.error ?? "That code isn't right.");
    } catch {
      setError("That code isn't right.");
    } finally {
      setBusy(false);
    }
  }

  function change(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {!token ? (
        <button type="button" onClick={send} disabled={busy} aria-busy={busy} className={sBtn("outline", "md", "self-start")}>
          {busy ? "Sending…" : "Verify on WhatsApp"}
        </button>
      ) : (
        <>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-semibold">WhatsApp code</span>
            <span className="flex gap-2">
              <input
                value={code}
                onChange={(e) => change(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                placeholder="6-digit code"
                className={sField("min-w-0 flex-1")}
              />
              <button type="button" onClick={() => verify(code)} disabled={busy || code.length !== 6} className={sBtn("primary", "md")}>
                Verify
              </button>
            </span>
          </label>
          <button type="button" onClick={send} disabled={busy || wait > 0} className={sBtn("ghost", "md", "self-start")}>
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
          <p className="text-xs text-s-bark">
            Didn&rsquo;t get it? Check the number is right and has WhatsApp, or write to hello@makeyourcakes.com.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-s-stop">
          {error}
        </p>
      )}
    </div>
  );
}
