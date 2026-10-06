import { describe, expect, it } from 'vitest';
import { latest } from '@/lib/latest';

describe('only the newest lookup may answer', () => {
  it('retires every request once a newer one starts', () => {
    const r = latest();
    const a = r.next();
    const b = r.next();
    expect(r.isCurrent(a)).toBe(false);
    expect(r.isCurrent(b)).toBe(true);
  });
});
