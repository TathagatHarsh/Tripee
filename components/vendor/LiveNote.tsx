'use client';
import { useState, useSyncExternalStore } from 'react';

/** "You're live" until dismissed; the dismissal is per device, so it lives in localStorage and not a column. */
export function LiveNote({ vendorId }: { vendorId: string }) {
  const key = `mmc-live-seen-${vendorId}`;
  const [dismissed, setDismissed] = useState(false);
  // Server and first client render say "seen" so nothing flashes; the browser then reports the truth.
  const seen = useSyncExternalStore(() => () => {}, () => { try { return !!localStorage.getItem(key); } catch { return false; } }, () => true);
  if (seen || dismissed) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-a border border-a-good-line bg-a-good-wash p-4">
      <p className="text-a-body font-semibold text-a-good-ink">You&apos;re live 🎉 MakeYourCakes can now send you orders.</p>
      <button type="button" className="min-h-11 shrink-0 rounded-a-sm px-3 text-a-body font-semibold text-a-good-ink underline" onClick={() => { try { localStorage.setItem(key, '1'); } catch { /* private mode: it just returns next visit */ } setDismissed(true); }}>Got it</button>
    </div>
  );
}
