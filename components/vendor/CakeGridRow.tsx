'use client';
import { useRef } from 'react';
import { aBtn } from '@/components/admin/ui';
import { CakePhoto } from '@/components/shop/CakePhoto';
import { sizeLabel, type GridRow } from './cakeGridModel';

export type RowPause = { label: string; ids: string[] };
const toggle = (on: boolean) => `inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-a border px-3.5 text-a-body font-semibold transition-colors duration-[var(--dur-ui)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent ${on ? 'border-a-accent bg-a-accent text-white' : 'border-a-line-strong bg-a-surface text-a-ink hover:bg-a-sunken'}`;

export function CakeGridRow({ row, pause, busy, onChange, onPause, onResume }: { row: GridRow; pause: RowPause | null; busy: boolean; onChange: (next: GridRow) => void; onPause: () => void; onResume: (ids: string[]) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <li className="rounded-a border border-a-line bg-a-surface p-3 shadow-a-card sm:p-4">
      <div className="flex items-center gap-3">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-a-sm bg-a-sunken">
          <CakePhoto src={row.photo} alt="" sizes="48px" className="!p-1" />
        </span>
        <h3 className="min-w-0 flex-1 font-a-sans text-a-item font-semibold leading-snug text-a-ink">{row.name}</h3>
        <details ref={menu} className="relative">
          <summary aria-label={`More actions for ${row.name}`} className="grid size-11 cursor-pointer list-none place-items-center rounded-a border border-transparent text-a-lede text-a-muted hover:bg-a-idle-wash focus-visible:outline-2 focus-visible:outline-a-accent [&::-webkit-details-marker]:hidden">⋯</summary>
          <div className="absolute right-0 top-12 z-10 w-44 rounded-a border border-a-line bg-a-surface p-1 shadow-a-pop">
            <button type="button" className={aBtn('quiet', 'md', 'w-full justify-start')} onClick={() => { if (menu.current) menu.current.open = false; onPause(); }}>Pause this cake</button>
          </div>
        </details>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Sizes of ${row.name}`}>
        {row.sizes.map(s => (
          <button key={s.band} type="button" aria-pressed={s.on} disabled={busy} className={toggle(s.on)}
            onClick={() => onChange({ ...row, sizes: row.sizes.map(x => x.band === s.band ? { ...x, on: !x.on } : x) })}>
            {s.on && <span aria-hidden="true">✓</span>}{sizeLabel(s.band)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Egg types of ${row.name}`}>
        {row.egg !== null && <button type="button" aria-pressed={row.egg} disabled={busy} className={toggle(row.egg)} onClick={() => onChange({ ...row, egg: !row.egg })}>{row.egg && <span aria-hidden="true">✓</span>}Egg</button>}
        {row.eggless !== null && <button type="button" aria-pressed={row.eggless} disabled={busy} className={toggle(row.eggless)} onClick={() => onChange({ ...row, eggless: !row.eggless })}>{row.eggless && <span aria-hidden="true">✓</span>}Eggless</button>}
      </div>
      {pause && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-a border border-a-warn-line bg-a-warn-wash px-3 py-1.5">
          <span className="text-a-small font-semibold text-a-warn-ink">{pause.label}</span>
          <button type="button" disabled={busy} className={aBtn('secondary', 'md')} onClick={() => onResume(pause.ids)}>Resume</button>
        </div>
      )}
    </li>
  );
}
