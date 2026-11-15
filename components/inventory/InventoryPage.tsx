import { db } from '@/lib/db';
import { gridVersion } from '@/lib/inventory';
import { PageHeader, aField } from '@/components/admin/ui';
import { AssignmentRefresh } from '@/components/assignment/Refresh';
import { CakeGrid } from '@/components/vendor/CakeGrid';
import { gridFromRows } from '@/components/vendor/cakeGridModel';
import type { RowPause } from '@/components/vendor/CakeGridRow';

const until = (d: Date) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export async function InventoryPage({ vendorId, query, admin = false }: { vendorId?: string; query: { vendor?: string; q?: string; stock?: string }; admin?: boolean }) {
  const scope = vendorId ?? query.vendor;
  const vendors = admin ? await db.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];
  const header = <PageHeader title="What you make" blurb={admin ? 'Choose a bakery to see and change the cakes it makes.' : 'Tick the sizes you bake, then choose Egg or Eggless. Save when you are done.'} />;
  const picker = admin && (
    <form className="flex flex-col gap-1.5">
      <label htmlFor="bakery" className="text-a-body font-medium text-a-ink">Bakery</label>
      <div className="flex gap-2">
        <select id="bakery" name="vendor" defaultValue={scope ?? ''} className={aField('min-h-11 flex-1')}><option value="">Choose a bakery…</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        <button className="min-h-11 rounded-a border border-a-accent bg-a-accent px-4 font-semibold text-white">Show</button>
      </div>
    </form>
  );
  if (!scope) return <div className="flex flex-col gap-5"><AssignmentRefresh />{header}{picker}<p className="rounded-a border border-dashed border-a-line-strong bg-a-surface p-8 text-center text-a-muted">Choose a bakery to manage its cakes.</p></div>;

  const now = new Date();
  const [cakes, rows, version, lastChange] = await Promise.all([
    db.cakeProduct.findMany({ where: { isAvailable: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, primaryImageUrl: true, createdAt: true, variants: { select: { sizeBand: true, eggType: true } } } }),
    db.vendorInventory.findMany({ where: { vendorId: scope }, select: { id: true, productId: true, sizeBand: true, eggType: true, isAvailable: true, pausedUntil: true } }),
    gridVersion(scope, db),
    db.inventoryAvailabilityChange.aggregate({ where: { inventory: { vendorId: scope } }, _max: { createdAt: true } }),
  ]);
  const grid = gridFromRows(cakes.flatMap(c => c.variants.map(v => ({ productId: c.id, name: c.name, photo: c.primaryImageUrl, sizeBand: v.sizeBand, eggType: v.eggType }))), rows);

  // Only an offered row can be paused; an expired pause counts as not paused.
  const pauses: Record<string, RowPause> = {};
  for (const c of grid) {
    const on = rows.filter(r => r.productId === c.productId && r.isAvailable);
    const live = on.filter(r => r.pausedUntil && r.pausedUntil > now);
    if (!live.length) continue;
    const first = new Date(Math.min(...live.map(r => r.pausedUntil!.getTime())));
    pauses[c.productId] = { ids: live.map(r => r.id), label: `${live.length === on.length ? 'Paused' : 'Partly paused'} until ${until(first)}` };
  }

  // Cakes added to the catalogue since this bakery last touched its menu. A brand-new bakery has no history, so no banner.
  const last = lastChange._max.createdAt;
  const fresh = last ? cakes.filter(c => c.createdAt > last && !rows.some(r => r.productId === c.id)) : [];

  return <div className="flex flex-col gap-5">
    <AssignmentRefresh />
    {header}
    {picker}
    {fresh.length > 0 && <p className="rounded-a border border-a-accent-line bg-a-accent-wash p-3 text-a-body font-semibold text-a-accent-ink">{fresh.length} new {fresh.length === 1 ? 'cake' : 'cakes'} on the menu. Do you make {fresh.length === 1 ? 'it' : 'them'}? <span className="font-medium">{fresh.map(c => c.name).join(', ')}</span></p>}
    <CakeGrid key={`${scope}:${version}`} vendorId={scope} cakes={grid} version={version} pauses={pauses} stickyAboveTabs={!admin} />
  </div>;
}
