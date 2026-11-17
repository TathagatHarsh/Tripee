import Link from 'next/link';
import type { setupSteps, VendorStage } from '@/lib/onboarding';

/* Type-only imports: lib/onboarding is server-only, so this stays a server component fed by props. */
const ROWS = [
  { key: 'location', label: 'Set your bakery location', href: '/vendor/profile#location' },
  { key: 'cakes', label: 'Choose the cakes you bake', href: '/vendor/inventory' },
  { key: 'details', label: 'Confirm prep time and capacity', href: '/vendor/profile#details' },
] as const;

export function ChecklistCard({ steps, stage }: { steps: ReturnType<typeof setupSteps>; stage: VendorStage }) {
  const review = stage === 'ready_for_review';
  return (
    <section aria-labelledby="setup-title" className="rounded-a border border-a-line bg-a-surface p-4 shadow-a-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-title" className="font-a-sans text-a-lede font-bold text-a-ink">{review ? 'You’re all set up' : 'Finish setting up'}</h2>
        <span className="rounded-full border border-a-accent-line bg-a-accent-wash px-2.5 py-1 text-a-meta font-semibold text-a-accent-ink">{steps.done} of 4</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-a-accent-wash" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={steps.done} aria-label="Setup progress">
        <div className="h-full rounded-full bg-a-accent" style={{ width: `${steps.done * 25}%` }} />
      </div>
      {review && <p className="mt-3 text-a-body font-semibold text-a-good-ink">Sent to MakeYourCakes for review</p>}
      <ol className="mt-4 flex flex-col gap-2">
        <Row done n={1} label="Create your account" />
        {ROWS.map((r, i) => <Row key={r.key} done={steps[r.key]} n={i + 2} label={r.label} href={r.href} />)}
      </ol>
    </section>
  );
}

function Row({ done, n, label, href }: { done: boolean; n: number; label: string; href?: string }) {
  const body = (
    <>
      <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-a-small font-bold ${done ? 'bg-a-good text-white' : 'border border-a-accent-line bg-a-accent-wash text-a-accent-ink'}`}>{done ? '✓' : n}</span>
      <span className={`flex-1 text-a-body font-medium ${done ? 'text-a-muted' : 'text-a-ink'}`}>{label}<span className="sr-only">{done ? ' (done)' : ' (to do)'}</span></span>
      {href && !done && <span aria-hidden="true" className="text-a-accent-ink">→</span>}
    </>
  );
  const cls = 'flex min-h-11 items-center gap-3 rounded-a border border-a-line px-3';
  return <li>{href && !done ? <Link href={href} className={`${cls} bg-a-canvas hover:border-a-accent-line`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}
