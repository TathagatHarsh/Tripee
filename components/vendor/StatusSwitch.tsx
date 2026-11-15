'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type Availability = 'accepting' | 'busy' | 'closed';
const OPTIONS: { value: Availability; label: string }[] = [
  { value: 'accepting', label: 'Accepting' },
  { value: 'busy', label: 'Busy' },
  { value: 'closed', label: 'Closed' },
];

/** Posts availability alone; prep time and capacity live in DetailsForm. */
export function StatusSwitch({ vendorId, accepting, active }: { vendorId: string; accepting: Availability; active: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(accepting);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function choose(next: Availability) {
    if (next === value || pending) return;
    setPending(true); setError('');
    try {
      const res = await fetch('/api/vendor/availability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendorId, availability: next }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save failed. Try again.');
      setValue(next); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed. Try again.'); }
    finally { setPending(false); }
  }

  return (
    <section aria-labelledby="status-switch" className="rounded-a border border-a-line bg-a-surface p-4 shadow-a-card sm:p-5">
      <h2 id="status-switch" className="font-a-sans text-a-item font-semibold text-a-ink">Orders right now</h2>
      <div role="radiogroup" aria-labelledby="status-switch" className="mt-3 grid grid-cols-3 gap-1 rounded-a border border-a-line bg-a-canvas p-1">
        {OPTIONS.map((o) => {
          const on = value === o.value;
          const blocked = !active && o.value !== 'closed';
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={blocked || pending}
              onClick={() => choose(o.value)}
              className={`min-h-11 rounded-[0.625rem] px-2 font-a-sans text-a-body font-semibold transition-colors disabled:cursor-not-allowed disabled:text-a-faint ${on ? 'bg-a-accent text-white' : 'text-a-muted hover:bg-a-accent-wash'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {!active && <p className="mt-3 text-a-small text-a-muted">Available once MakeYourCakes approves your bakery</p>}
      {error && <p role="alert" className="mt-3 text-a-small font-medium text-a-bad-ink">{error}</p>}
    </section>
  );
}
