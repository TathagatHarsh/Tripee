import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/admin/actions', () => ({ resendInvite: vi.fn() }));
vi.mock('../components/admin/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AreasTab, CakesTab, PerformanceTab, PipelineTab } from '../components/admin/bakeries/HubTabs';
import { coverageGrid, hubChips, pipelineGroups, type PipelineRow } from '../lib/bakeriesHub';

const now = new Date('2026-11-16T08:00:00Z');
const row = (over: Partial<PipelineRow>): PipelineRow => ({
  id: 'v1', name: 'Sweet Crumbs', phone: '9876543210', stage: 'live',
  steps: { location: true, cakes: true, details: true, done: 4 }, inviteExpiresAt: null, availableVariants: 3, ordersToday: 2, ...over,
});
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe('PipelineTab', () => {
  it('Resend renders InviteLink form for invited and expired', () => {
    const groups = pipelineGroups([
      row({ id: 'i', name: 'Invited Oven', stage: 'invited', inviteExpiresAt: new Date(now.getTime() + 86400000) }),
      row({ id: 'e', name: 'Expired Oven', stage: 'invite_expired' }),
      row({ id: 's', name: 'Setup Oven', stage: 'setting_up', steps: { location: false, cakes: true, details: true, done: 3 } }),
      row({ id: 'n', name: 'No Phone', stage: 'paused', phone: null }),
    ], now);
    const out = html(createElement(PipelineTab, { groups }));
    expect(out.indexOf('Setting up')).toBeLessThan(out.indexOf('Invited'));
    expect((out.match(/name="id" value="(i|e)"/g) ?? []).length).toBe(2);
    expect(out).toContain('href="tel:+919876543210"');
    expect(out).toContain('Needs: pin');
  });

  it('invited and expired rows share one Invites section, so Resend keeps its link when the stage flips', () => {
    const groups = pipelineGroups([
      row({ id: 'i', stage: 'invited', inviteExpiresAt: new Date(now.getTime() + 86400000) }),
      row({ id: 'e', stage: 'invite_expired' }),
    ], now);
    const out = html(createElement(PipelineTab, { groups }));
    expect(out).toContain('Invites (2)');
    expect((out.match(/<section/g) ?? []).length).toBe(1);
  });

  it('no Call without a phone; empty state', () => {
    const out = html(createElement(PipelineTab, { groups: pipelineGroups([row({ stage: 'paused', phone: null })], now) }));
    expect(out).not.toContain('tel:');
    expect(html(createElement(PipelineTab, { groups: [] }))).toContain('No bakeries yet: add one to get started');
  });
});

describe('CakesTab', () => {
  const cakes = [{ productId: 'p1', name: 'Truffle', variants: [{ sizeBand: '1kg', eggType: 'egg' as const }, { sizeBand: '1kg', eggType: 'eggless' as const }] }];
  it('shows red gaps and the summary', () => {
    const grid = coverageGrid(cakes, [{ vendorName: 'A', productId: 'p1', sizeBand: '1kg', eggType: 'egg', isAvailable: true, pausedUntil: null }], now);
    const out = html(createElement(CakesTab, { grid, show: 'all' }));
    expect(out).toContain('1 gap across 1 cake · 0 caused by pauses');
    expect(out).toMatch(/data-gap="true"/);
    expect(out).toContain('Truffle');
  });
  it('empty copy when there are no gaps and Gaps only', () => {
    const grid = coverageGrid([cakes[0]], ['egg', 'eggless'].map((e) => ({ vendorName: 'A', productId: 'p1', sizeBand: '1kg', eggType: e as 'egg', isAvailable: true, pausedUntil: null })), now);
    expect(html(createElement(CakesTab, { grid, show: 'gaps' }))).toContain('No gaps: every cake has a bakery right now');
  });
});

describe('PerformanceTab', () => {
  it('shows the flag and the empty state', () => {
    const out = html(createElement(PerformanceTab, { rows: [{ vendorId: 'v', name: 'Slow Oven', offers: 6, acceptedPct: 50, declinedPct: 50, ignoredPct: 0, medianMin: 3, latePct: null, flag: 'accepts 5 in 10 offers' }], days: 30 }));
    expect(out).toContain('accepts 5 in 10 offers');
    expect(out).toContain('href="/admin/vendors/v"');
    expect(html(createElement(PerformanceTab, { rows: [], days: 30 }))).toContain('No offers in this window');
  });
});

describe('AreasTab', () => {
  it('shows the nearest bakery, the checkout note, the no-live-bakery line and the empty state', () => {
    const out = html(createElement(AreasTab, {
      missed: [
        { area: '500034', count: 2, last: now, located: true, nearest: { name: 'Sweet Crumbs', km: 12.4, radiusKm: 10 } },
        { area: 'Kondapur', count: 1, last: now, located: true, nearest: null },
        { area: 'Unknown area', count: 1, last: now, located: false, nearest: null },
      ],
      reach: [{ name: 'Sweet Crumbs', address: 'Road 3', radiusKm: 10 }], days: 30,
    }));
    expect(out).toContain('Sweet Crumbs · 12.4 km (delivers up to 10 km)');
    expect(out).toContain('No live bakery');
    expect(out).toContain('Unknown area · 1 order missed</p><p class="text-a-muted">Last on');
    expect(out).toMatch(/Unknown area[\s\S]*?No location to measure from/);
    expect(out).toContain('Addresses refused at checkout never become orders, so they are not counted here.');
    expect(html(createElement(AreasTab, { missed: [], reach: [], days: 30 }))).toContain('No missed orders in this window');
  });
});

describe('hubChips', () => {
  it('builds four tab chips with ?tab= links and the active one', () => {
    const chips = hubChips('cakes');
    expect(chips.map((c) => c.label)).toEqual(['Pipeline', 'Cakes', 'Performance', 'Areas']);
    expect(chips.find((c) => c.active)?.label).toBe('Cakes');
    expect(chips[2].href).toBe('/admin/vendors?tab=performance');
  });
  it('keeps a non-default window on the windowed tabs only', () => {
    const chips = hubChips('areas', 7);
    expect(chips[2].href).toBe('/admin/vendors?tab=performance&days=7');
    expect(chips[3].href).toBe('/admin/vendors?tab=areas&days=7');
    expect(chips[0].href).toBe('/admin/vendors?tab=pipeline');
  });
});
