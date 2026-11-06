import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAPSHOT } from '@/lib/catalogDefaults';
import { buildDocket, renderSpecSheet } from '@/lib/docket';
import { DEFAULT_CAKE } from '@/lib/schema';

/*
 * The docket prints the FSSAI number the owner saved at /admin/settings, not
 * only the build-time env var, which production never had set.
 */
describe('docket FSSAI line', () => {
  const withNumber = { ...DEFAULT_SNAPSHOT, bakery: { ...DEFAULT_SNAPSHOT.bakery, fssaiLicence: '23624029001006' } };

  it('takes the number from the bakery settings', () => {
    expect(buildDocket(DEFAULT_CAKE, withNumber).fssai).toBe('23624029001006');
    expect(renderSpecSheet(DEFAULT_CAKE, withNumber)).toContain('FSSAI No. 23624029001006');
  });

  it('prints no line when no number is saved', () => {
    const none = { ...DEFAULT_SNAPSHOT, bakery: { ...DEFAULT_SNAPSHOT.bakery, fssaiLicence: '' } };
    expect(renderSpecSheet(DEFAULT_CAKE, none)).not.toContain('FSSAI');
  });
});
