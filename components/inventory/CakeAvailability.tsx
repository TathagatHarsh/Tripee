'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn, aField } from '@/components/admin/ui';

type Variant = { id: string; productId: string; productName: string; sizeBand: string; eggType: string };
type Item = Variant & { vendorId: string; vendorName: string; isAvailable: boolean; version: string; history: { id: string; previous: boolean | null; next: boolean; at: string; userId: string }[] };
type Filter = 'all' | 'in' | 'out';
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
const label = (v: Variant) => `${v.sizeBand.replace(/\s*kg$/, ' kg')} · ${v.eggType === 'eggless' ? 'Eggless' : 'Egg'}`;
const matches = (v: Variant, query: string) => query.trim().toLowerCase().split(/\s+/).every(term => normalize(`${v.productName} ${label(v)}`).includes(normalize(term)));

export function CakeAvailability({ items, variants, vendorId, vendors, admin, initialQuery, initialFilter }: { items: Item[]; variants: Variant[]; vendorId?: string; vendors: { id: string; name: string }[]; admin: boolean; initialQuery: string; initialFilter: Filter }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [overrides, setOverrides] = useState<Record<string, { value: boolean; version: string }>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [cake, setCake] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer); }, [message]);
  const current = items.map(i => ({ ...i, isAvailable: overrides[i.id]?.version === i.version ? overrides[i.id].value : i.isAvailable }));
  const inStock = current.filter(i => i.isAvailable).length;
  const shown = current.filter(i => matches(i, query) && (filter === 'all' || i.isAvailable === (filter === 'in')));
  const groups = new Map<string, Item[]>();
  for (const item of shown) { const key = `${item.vendorId}:${item.productId}`; groups.set(key, [...(groups.get(key) ?? []), item]); }
  const remaining = variants.filter(v => !items.some(i => i.vendorId === vendorId && i.productId === v.productId && i.sizeBand === v.sizeBand && i.eggType === v.eggType));
  const cakes = [...new Map(remaining.filter(v => matches(v, pickerQuery)).map(v => [v.productId, v.productName])).entries()];
  async function save(payload: object) {
    const response = await fetch('/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Availability could not be updated. Try again.');
  }
  async function toggle(item: Item) {
    const next = !item.isAvailable;
    setPending(p => [...p, item.id]); setOverrides(p => ({ ...p, [item.id]: { value: next, version: item.version } })); setError('');
    try { await save({ vendorId: item.vendorId, id: item.id, isAvailable: next }); setMessage('✓ Availability updated'); router.refresh(); }
    catch (e) { setOverrides(p => ({ ...p, [item.id]: { value: item.isAvailable, version: item.version } })); setError(e instanceof Error ? e.message : 'Connection failed. Try again.'); }
    finally { setPending(p => p.filter(id => id !== item.id)); }
  }
  return <>
    <div className="grid grid-cols-3 gap-2 sm:gap-4">{([['all', 'Cake variants', current.length], ['in', 'In stock', inStock], ['out', 'Out of stock', current.length - inStock]] as const).map(([value, title, count]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-xl border p-4 text-left shadow-a-card transition-colors sm:p-5 ${filter === value ? 'border-a-accent bg-a-accent-wash' : 'border-a-line bg-a-surface hover:bg-a-canvas'}`}><span className="block text-3xl font-semibold tracking-tight">{count}</span><span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-a-muted sm:text-xs">{title}</span></button>)}</div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="min-w-0 flex-1 basis-64"><span className="sr-only">Search cakes, sizes or variants</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search cakes, sizes or variants…" className={aField('w-full min-h-12')} /></label>
      {vendorId && <button className={aBtn('primary', 'lg')} onClick={() => { setCake(''); setPickerQuery(''); setSelected([]); setError(''); dialog.current?.showModal(); }}>+ Add Cake</button>}
      {admin && <label><span className="sr-only">Bakery</span><select className={aField('min-h-12')} value={vendorId ?? ''} onChange={e => router.push(`/admin/inventory${e.target.value ? `?vendor=${encodeURIComponent(e.target.value)}` : ''}`)}><option value="">All bakeries</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
    </div>
    <div className="flex flex-wrap items-center gap-2" aria-label="Availability filters">{([['all', 'All'], ['in', 'In Stock'], ['out', 'Out of Stock']] as const).map(([value, title]) => <button key={value} aria-pressed={filter === value} className={aBtn(filter === value ? 'primary' : 'secondary', 'md', 'rounded-full')} onClick={() => setFilter(value)}>{title}</button>)}<span className="ml-auto text-sm text-a-muted">{shown.length} variants</span></div>
    <div role="status" className="sr-only">{message}</div>{message && <p aria-hidden="true" className="text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-a-bad bg-a-bad-wash p-4 text-a-bad-ink">{error}</p>}
    {!shown.length && <div className="rounded-xl border border-dashed border-a-line-strong bg-a-surface p-8 text-center"><h2 className="text-xl font-semibold">{items.length ? 'No matching cakes' : 'Which cakes can you make?'}</h2><p className="mt-2 text-a-muted">{items.length ? 'Try another search or choose All.' : vendorId ? 'Add a cake, choose its variants, and you’re ready to receive orders.' : 'Choose a bakery to manage its cake availability.'}</p>{items.length > 0 && <button className={aBtn('secondary', 'md', 'mt-4')} onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filters</button>}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-2">{[...groups.entries()].map(([key, group]) => <section key={key} className="overflow-hidden rounded-xl border border-a-line bg-a-surface shadow-a-card"><header className="border-b border-a-line bg-a-canvas px-5 py-4">{admin && <p className="mb-1 text-xs font-semibold text-a-muted">{group[0].vendorName}</p>}<h2 className="text-lg font-semibold tracking-tight">{group[0].productName}</h2></header><ul className="divide-y divide-a-line">{group.sort((a, b) => parseFloat(a.sizeBand) - parseFloat(b.sizeBand) || a.eggType.localeCompare(b.eggType)).map(item => <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><h3 className="font-medium">{label(item)}</h3><p className={`mt-1 flex items-center gap-2 text-sm font-medium ${item.isAvailable ? 'text-emerald-800' : 'text-red-800'}`}><span className={`h-2 w-2 rounded-full ${item.isAvailable ? 'bg-emerald-600' : 'bg-red-600'}`} />{item.isAvailable ? 'In Stock' : 'Out of Stock'}</p></div><button role="switch" aria-checked={item.isAvailable} aria-label={`${item.productName} ${label(item)}${admin ? `, ${item.vendorName}` : ''}`} aria-busy={pending.includes(item.id)} disabled={pending.includes(item.id)} onClick={() => toggle(item)} className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent disabled:cursor-wait"><span className={`relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${item.isAvailable ? 'bg-emerald-700' : 'bg-stone-400'}`}><span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${item.isAvailable ? 'translate-x-5' : ''}`} /></span></button></li>)}</ul><details className="border-t border-a-line px-5 py-2"><summary className="min-h-11 cursor-pointer py-3 text-sm text-a-muted">Availability history</summary><ol className="divide-y divide-a-line">{group.flatMap(item => item.history.map(h => ({ ...h, variant: label(item) }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map(h => <li key={h.id} className="py-3 text-sm"><p className="font-medium">{h.variant}</p><p>{h.previous === null ? 'Added' : h.previous ? 'In Stock' : 'Out of Stock'} → {h.next ? 'In Stock' : 'Out of Stock'}</p><p className="mt-1 text-xs text-a-muted">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(h.at))} IST{admin ? ` · ${h.userId}` : ''}</p></li>)}</ol>{!group.some(i => i.history.length) && <p className="pb-3 text-sm text-a-muted">Changes will appear here.</p>}</details></section>)}</div>
    <dialog ref={dialog} aria-labelledby="add-cake-title" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-a-line bg-a-surface p-6 text-a-ink shadow-xl backdrop:bg-black/40" onCancel={e => { if (pending.includes('add')) e.preventDefault(); }}>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id="add-cake-title" className="text-2xl font-semibold">Add Cake</h2><button aria-label="Close cake picker" disabled={pending.includes('add')} className={aBtn('quiet', 'md')} onClick={() => dialog.current?.close()}>Close</button></div>
      {!cake ? <><label><span className="sr-only">Search cakes to add</span><input autoFocus type="search" placeholder="Search cakes…" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} className={aField('mb-4 w-full')} /></label><div className="divide-y divide-a-line">{cakes.map(([id, name]) => <button key={id} className="flex min-h-14 w-full items-center justify-between gap-3 px-2 py-3 text-left font-medium hover:bg-a-canvas" onClick={() => { setCake(id); setSelected([]); }}>{name}<span aria-hidden="true">›</span></button>)}</div>{!cakes.length && <p className="py-6 text-a-muted">No cakes to add. Try another search; existing variants already appear on your page.</p>}</> : <>
        <button className={aBtn('quiet', 'md', 'mb-2')} disabled={pending.includes('add')} onClick={() => setCake('')}>‹ All cakes</button><h3 className="text-lg font-semibold">{variants.find(v => v.productId === cake)?.productName}</h3><p className="mb-3 mt-1 text-sm text-a-muted">Select variants. Added variants start In Stock.</p><div className="divide-y divide-a-line">{remaining.filter(v => v.productId === cake).sort((a, b) => parseFloat(a.sizeBand) - parseFloat(b.sizeBand) || a.eggType.localeCompare(b.eggType)).map(v => <label key={v.id} className="flex min-h-12 cursor-pointer items-center gap-3 py-3"><input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={selected.includes(v.id)} disabled={pending.includes('add')} onChange={e => setSelected(s => e.target.checked ? [...s, v.id] : s.filter(id => id !== v.id))} />{label(v)}</label>)}</div>
        <button disabled={!selected.length || pending.includes('add')} className={aBtn('primary', 'lg', 'mt-5 w-full')} onClick={async () => { setPending(p => [...p, 'add']); setError(''); try { await save({ vendorId, variantIds: selected }); dialog.current?.close(); setMessage('✓ Cake variants added'); router.refresh(); } catch(e) { setError(e instanceof Error ? e.message : 'Connection failed. Try again.'); } finally { setPending(p => p.filter(id => id !== 'add')); } }}>{pending.includes('add') ? 'Adding…' : `Add Selected${selected.length ? ` (${selected.length})` : ''}`}</button>
      </>}{error && <p role="alert" className="mt-3 text-sm text-a-bad-ink">{error}</p>}
    </dialog>
  </>;
}
