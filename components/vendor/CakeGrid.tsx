'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn } from '@/components/admin/ui';
import { CakeGridRow, type RowPause } from './CakeGridRow';
import { PauseSheet } from './PauseSheet';
import { sizeLabel, wantedVariants, type GridRow } from './cakeGridModel';

const chip = (on: boolean) => `inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-a-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent ${on ? 'border-a-accent bg-a-accent-wash text-a-accent-ink' : 'border-a-line-strong bg-a-surface text-a-ink hover:bg-a-sunken'}`;
const changed = (a: GridRow, b: GridRow) => { const was = new Set(wantedVariants(a)); const now = new Set(wantedVariants(b)); return [...now].filter(k => !was.has(k)).length + [...was].filter(k => !now.has(k)).length; };

/** Cakes arrive as the loaded state; the page remounts this (key) whenever the server's version moves. */
export function CakeGrid({ vendorId, cakes, version: initialVersion, pauses, stickyAboveTabs }: { vendorId: string; cakes: GridRow[]; version: string | null; pauses: Record<string, RowPause>; stickyAboveTabs: boolean }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(cakes);
  const [rows, setRows] = useState(cakes);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [sheet, setSheet] = useState<{ productId?: string } | null>(null);

  const count = rows.reduce((n, r, i) => n + changed(baseline[i], r), 0);
  const bands = [...new Set(rows.flatMap(r => r.sizes.map(s => s.band)))].sort((a, b) => parseFloat(a) - parseFloat(b));
  const allOn = rows.every(r => r.sizes.every(s => s.on) && r.egg !== false && r.eggless !== false);
  const edit = (fn: (r: GridRow) => GridRow) => { setRows(rs => rs.map(fn)); setSaved(false); };
  const bandOn = (b: string) => rows.every(r => !r.sizes.some(s => s.band === b) || r.sizes.find(s => s.band === b)!.on);

  async function post(body: object) {
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendorId, ...body }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Save failed. Try again.');
    return data as { version?: string | null };
  }
  async function save() {
    setSaving(true); setError('');
    try {
      const grid = rows.filter((r, i) => changed(baseline[i], r) > 0).map(r => ({ productId: r.productId, sizes: r.sizes.filter(s => s.on).map(s => s.band), egg: !!r.egg, eggless: !!r.eggless }));
      const data = await post({ grid, version });
      setVersion(data.version ?? null); setBaseline(rows); setSaved(true); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed. Try again.'); }
    finally { setSaving(false); }
  }
  async function resume(ids: string[]) {
    setResuming(true); setError('');
    try { await post({ resume: { ids } }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Connection failed. Try again.'); setResuming(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-a border border-a-line bg-a-surface p-3 shadow-a-card sm:p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={allOn} className={chip(allOn)} onClick={() => edit(r => ({ ...r, sizes: r.sizes.map(s => ({ ...s, on: !allOn })), egg: r.egg === null ? null : !allOn, eggless: r.eggless === null ? null : !allOn }))}>{allOn ? 'Clear every cake' : 'Select every cake'}</button>
          <button type="button" className={chip(false)} onClick={() => edit(r => ({ ...r, egg: r.egg === null ? null : false }))}>We’re eggless only</button>
          <button type="button" className={aBtn('secondary', 'md', 'ml-auto')} onClick={() => setSheet({})}>Pause</button>
        </div>
        <div role="group" aria-label="Tick a size on every cake" className="flex flex-wrap items-center gap-2">
          <span className="text-a-small font-medium text-a-muted">Every cake:</span>
          {bands.map(b => { const on = bandOn(b); return <button key={b} type="button" aria-pressed={on} className={chip(on)} onClick={() => edit(r => ({ ...r, sizes: r.sizes.map(s => s.band === b ? { ...s, on: !on } : s) }))}>{on && <span aria-hidden="true" className="mr-1">✓</span>}{sizeLabel(b)}</button>; })}
        </div>
      </div>
      {error && <p role="alert" className="rounded-a border border-a-bad-line bg-a-bad-wash p-3 text-a-body font-medium text-a-bad-ink">{error}{error.startsWith('This changed') && <> <button type="button" className="font-semibold underline" onClick={() => router.refresh()}>Reload</button></>}</p>}
      {saved && <p role="status" className="text-a-body font-medium text-a-good-ink">✓ Saved</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => <CakeGridRow key={r.productId} row={r} pause={pauses[r.productId] ?? null} busy={saving || resuming}
          onChange={next => { setRows(rs => rs.map((x, j) => j === i ? next : x)); setSaved(false); }}
          onPause={() => setSheet({ productId: r.productId })} onResume={resume} />)}
      </ul>
      <div className={`sticky z-20 -mx-4 border-t border-a-line bg-a-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-a sm:border ${stickyAboveTabs ? 'bottom-[calc(3.5rem+env(safe-area-inset-bottom))] sm:bottom-2' : 'bottom-0 sm:bottom-2'}`}>
        <button type="button" disabled={count === 0 || saving} className={aBtn('primary', 'lg', 'w-full')} onClick={save}>{saving ? 'Saving…' : `Save changes (${count})`}</button>
      </div>
      {sheet && <PauseSheet vendorId={vendorId} cakes={rows.map(r => ({ id: r.productId, name: r.name }))} sizes={bands} productId={sheet.productId} dirty={count > 0} onClose={() => setSheet(null)} />}
    </div>
  );
}
