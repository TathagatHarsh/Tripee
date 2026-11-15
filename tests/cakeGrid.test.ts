import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CakeGrid } from '../components/vendor/CakeGrid';
import { gridFromRows, wantedVariants } from '../components/vendor/cakeGridModel';

const cake = { productId: 'c1', name: 'Truffle', photo: '/t.jpg' };
const v = (sizeBand: string, eggType: 'egg' | 'eggless') => ({ ...cake, sizeBand, eggType });
const on = (sizeBand: string, eggType: string, isAvailable = true) => ({ productId: 'c1', sizeBand, eggType, isAvailable });

describe('gridFromRows', () => {
  it('sorts sizes numerically', () => {
    const [row] = gridFromRows([v('1.5kg', 'egg'), v('0.5kg', 'egg'), v('10kg', 'egg'), v('1kg', 'egg')], []);
    expect(row.sizes.map(s => s.band)).toEqual(['0.5kg', '1kg', '1.5kg', '10kg']);
  });

  it('gives null for an egg type the cake has no variant of', () => {
    const [row] = gridFromRows([v('1kg', 'egg')], []);
    expect(row.eggless).toBeNull();
    expect(row.egg).toBe(false);
  });

  it('marks a size on when any variant of it is on', () => {
    const [row] = gridFromRows([v('1kg', 'egg'), v('1kg', 'eggless'), v('2kg', 'egg'), v('2kg', 'eggless')], [on('1kg', 'eggless'), on('2kg', 'egg', false)]);
    expect(row.sizes).toEqual([{ band: '1kg', on: true }, { band: '2kg', on: false }]);
    expect(row.egg).toBe(false);
    expect(row.eggless).toBe(true);
  });

  it('wantedVariants is ticked sizes times enabled egg types, only variants that exist', () => {
    const [row] = gridFromRows([v('1kg', 'egg'), v('1kg', 'eggless'), v('2kg', 'egg')], [on('1kg', 'egg'), on('2kg', 'egg'), on('1kg', 'eggless')]);
    expect(wantedVariants(row)).toEqual(['1kg|egg', '1kg|eggless', '2kg|egg']);
    expect(wantedVariants({ ...row, egg: false })).toEqual(['1kg|eggless']);
  });
});

describe('CakeGrid markup', () => {
  it('starts with Save disabled, the shortcuts, and a paused pill with Resume', () => {
    const cakes = gridFromRows([v('1kg', 'egg'), v('1kg', 'eggless')], [on('1kg', 'egg')]);
    const html = renderToStaticMarkup(createElement(CakeGrid, { vendorId: 'v', cakes, version: null, stickyAboveTabs: true, pauses: { c1: { ids: ['r1'], label: 'Paused until Tue, 17 Nov, 7:00 am' } } }));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save changes \(0\)<\/button>/);
    for (const copy of ['Select every cake', 'We’re eggless only', 'Paused until Tue, 17 Nov, 7:00 am', 'Resume', 'Truffle']) expect(html).toContain(copy);
    expect(html).toContain('aria-pressed="true"');
  });
});
