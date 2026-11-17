'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn, aField } from '@/components/admin/ui';
import type { PauseLength } from '@/lib/onboarding'; // type only, erased
import { sizeLabel } from './cakeGridModel';

type Scope = 'cake' | 'size' | 'eggless';
const LENGTHS = [['today', 'Rest of today'], ['tomorrow', 'Until tomorrow'], ['date', 'Pick a date']] as const;
const radio = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-a border border-a-line bg-a-canvas px-3 text-a-body font-medium text-a-ink has-[:checked]:border-a-accent has-[:checked]:bg-a-accent-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-a-accent';

/** A bottom sheet on phones, a centred card from sm up. `productId` pre-selects (and locks to) one cake. */
export function PauseSheet({ vendorId, cakes, sizes, productId, dirty, onClose }: { vendorId: string; cakes: { id: string; name: string }[]; sizes: string[]; productId?: string; dirty: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<Scope>('cake');
  const [cake, setCake] = useState(productId ?? cakes[0]?.id ?? '');
  const [size, setSize] = useState(sizes[0] ?? '');
  const [length, setLength] = useState<'today' | 'tomorrow' | 'date'>('today');
  const [date, setDate] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  // Today in IST, so the picker never offers a date the server would refuse.
  const [today] = useState(() => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10));

  async function submit() {
    const body = { vendorId, pause: {
      scope: scope === 'cake' ? { productId: cake } : scope === 'size' ? { sizeBand: size } : { eggType: 'eggless' as const },
      length: (length === 'date' ? { date } : length) satisfies PauseLength,
    } };
    setPending(true); setError('');
    try {
      const res = await fetch('/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not pause. Try again.');
      router.refresh(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed. Try again.'); setPending(false); }
  }

  return (
    <dialog ref={dialog} aria-labelledby="pause-title" onClose={onClose} onCancel={e => { if (pending) e.preventDefault(); }}
      className="mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[1.25rem] border border-a-line bg-a-surface p-5 text-a-ink shadow-a-pop backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-a">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pause-title" className="font-a-sans text-a-lede font-bold">Pause orders</h2>
        <button type="button" className={aBtn('quiet', 'md')} disabled={pending} onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <p className="mt-1 text-a-small text-a-muted">Orders for what you pause go to other bakeries until it ends. Orders you already accepted carry on.</p>
      <fieldset className="mt-4 flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-a-body font-semibold">What to pause</legend>
        {!productId && <label className={radio}><input type="radio" name="scope" className="size-5 accent-a-accent" checked={scope === 'cake'} onChange={() => setScope('cake')} />One cake</label>}
        {scope === 'cake' && (productId
          ? <p className="text-a-body font-medium">{cakes.find(c => c.id === productId)?.name}</p>
          : <select aria-label="Cake" className={aField('min-h-11')} value={cake} onChange={e => setCake(e.target.value)}>{cakes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
        {!productId && <>
          <label className={radio}><input type="radio" name="scope" className="size-5 accent-a-accent" checked={scope === 'size'} onChange={() => setScope('size')} />A size on all cakes</label>
          {scope === 'size' && <select aria-label="Size" className={aField('min-h-11')} value={size} onChange={e => setSize(e.target.value)}>{sizes.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}</select>}
          <label className={radio}><input type="radio" name="scope" className="size-5 accent-a-accent" checked={scope === 'eggless'} onChange={() => setScope('eggless')} />All eggless</label>
        </>}
      </fieldset>
      <fieldset className="mt-4 flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-a-body font-semibold">For how long</legend>
        {LENGTHS.map(([value, title]) => <label key={value} className={radio}><input type="radio" name="length" className="size-5 accent-a-accent" checked={length === value} onChange={() => setLength(value)} />{title}</label>)}
        {length === 'date' && <input type="date" aria-label="Pause until the end of" min={today} value={date} onChange={e => setDate(e.target.value)} className={aField('min-h-11')} />}
      </fieldset>
      {dirty && <p className="mt-4 text-a-small text-a-warn-ink">You have unsaved changes. Pausing will discard them.</p>}
      {error && <p role="alert" className="mt-3 text-a-small font-medium text-a-bad-ink">{error}</p>}
      <button type="button" disabled={pending || (length === 'date' && !date) || (scope === 'cake' && !cake)} className={aBtn('primary', 'lg', 'mt-5 w-full')} onClick={submit}>{pending ? 'Pausing…' : 'Pause'}</button>
    </dialog>
  );
}
