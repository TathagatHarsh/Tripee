import { describe, expect, it } from 'vitest';
import { meetsDeadline, variantNeeds } from '../lib/inventoryRules';
describe('binary variant availability', () => {
  const cake = { cakeProductId: 'chocolate', config: { size: '2kg', eggless: true } };
  it('deduplicates repeated cakes and separates egg type and size', () => {
    expect(variantNeeds({ ...cake, cakes: [cake, cake, { ...cake, config: { size: '2kg', eggless: false } }] })).toEqual([{ productId: 'chocolate', sizeBand: '2kg', eggType: 'eggless' }, { productId: 'chocolate', sizeBand: '2kg', eggType: 'egg' }]);
    expect(variantNeeds({ ...cake, cakes: [] })).toHaveLength(1);
    expect(() => variantNeeds({ ...cake, config: null, cakes: [] })).toThrow('verifiable');
  });
  it('includes travel time in the preparation deadline', () => {
    const now = new Date('2026-09-23T10:00:00Z');
    expect(meetsDeadline(new Date('2026-09-23T12:00:00Z'), 120, 10, now)).toBe(false);
    expect(meetsDeadline(new Date('2026-09-23T12:10:00Z'), 120, 10, now)).toBe(true);
  });
});
