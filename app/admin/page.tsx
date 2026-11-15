import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { hasDatabase, NO_DATABASE_MESSAGE } from '@/lib/db';
import { formatINR } from '@/lib/format';
import { parseOnly, type NeedsYouAction } from '@/lib/needsYou';
import { loadNeedsYou } from '@/lib/needsYouData';
import { ActionItem, Card, EmptyState, FilterChips, Notice, PageHeader, StatList, aBtn } from '@/components/admin/ui';
import { ConfirmButton } from './ConfirmButton';

const TONE = { late: 'late', stuck: 'stuck', new: 'new', requests: 'request' } as const;

function istDate(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
}

function renderAction(a: NeedsYouAction, variant: 'primary' | 'secondary') {
  if (a.kind === 'confirm') return <ConfirmButton orderRef={a.ref} />;
  const cls = aBtn(variant, 'md');
  // tel: is not a route, so it skips next/link.
  return a.href.startsWith('tel:') ? <a href={a.href} className={cls}>{a.label}</a> : <Link href={a.href} className={cls}>{a.label}</Link>;
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ only?: string | string[] }> }) {
  await requireAdmin();
  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;
  const only = parseOnly((await searchParams).only);
  // No arguments, so the layout badge and this page share one cached load.
  const { result, glance } = await loadNeedsYou();
  const items = only === 'all' ? result.items : result.items.filter((i) => i.category === only);
  const { counts, total } = result;

  return <div className="flex flex-col gap-6">
    <PageHeader title="Needs you" blurb={`${istDate(new Date())} · ${total} ${total === 1 ? 'thing' : 'things'}, most urgent first`} />
    <FilterChips param="only" basePath="/admin" selected={only} options={[
      { value: 'all', label: 'All', count: total },
      { value: 'late', label: 'Late', count: counts.late },
      { value: 'stuck', label: 'Stuck', count: counts.stuck },
      { value: 'new', label: 'New', count: counts.new },
      { value: 'requests', label: 'Requests', count: counts.requests },
    ]} />
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-3">
        {items.length === 0
          ? <EmptyState icon="check" title="All caught up" blurb="New orders and problems show up here the moment they happen." />
          : items.map((i) => <ActionItem key={i.key} tone={TONE[i.category]} tag={i.tag} title={i.title} detail={i.detail}
              action={renderAction(i.action, 'primary')} secondary={i.secondary && renderAction(i.secondary, 'secondary')} />)}
      </div>
      <Card>
        <h2 className="font-a-sans text-a-body font-semibold text-a-ink">At a glance</h2>
        <StatList rows={[
          { label: 'Orders today', value: String(glance.ordersToday) },
          { label: 'Baking now', value: String(glance.bakingNow) },
          { label: 'Out for delivery', value: String(glance.outForDelivery) },
          { label: 'Bakeries live', value: glance.liveBakeries },
          { label: 'Revenue today', value: formatINR(glance.revenueTodayPaise) },
        ]} />
      </Card>
    </div>
  </div>;
}
