import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { CUSTOM_CAKES, CUSTOM_GROUPS, HOME_CUSTOM_IDS, customPoster, customSrc, likeThisEnquiry, whatsappHref } from '../lib/customCakes';

const pub = (p: string) => `public${p}`;

describe('custom cakes gallery', () => {
  it('every entry has its file, a poster if it is a video, alt text and a group', () => {
    for (const c of CUSTOM_CAKES) {
      expect(existsSync(pub(customSrc(c))), c.id).toBe(true);
      if (c.video) expect(existsSync(pub(customPoster(c))), c.id).toBe(true);
      expect(c.alt.length, c.id).toBeGreaterThan(10);
      expect(CUSTOM_GROUPS.map((g) => g.id)).toContain(c.group);
    }
  });

  it('ids are unique, every group has cakes, and the home page picks exist', () => {
    const ids = CUSTOM_CAKES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of CUSTOM_GROUPS) expect(CUSTOM_CAKES.some((c) => c.group === g.id), g.id).toBe(true);
    for (const id of HOME_CUSTOM_IDS) expect(ids).toContain(id);
  });

  it('ships no file in public/custom that the gallery does not show', () => {
    const used = new Set(CUSTOM_CAKES.flatMap((c) => [customSrc(c), ...(c.video ? [customPoster(c)] : [])]));
    for (const f of readdirSync('public/custom')) expect(used, f).toContain(`/custom/${f}`);
  });
});

describe('whatsappHref', () => {
  it('opens a chat with the settings number and names the cake', () => {
    const cake = CUSTOM_CAKES[0];
    const href = whatsappHref('+91 99897 91579', likeThisEnquiry(cake))!;
    expect(href.startsWith('https://wa.me/919989791579?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toContain(`/custom-cakes#${cake.id}`);
  });
  it('adds India to a bare ten-digit number and refuses something that is not a phone', () => {
    expect(whatsappHref('99897 91579', 'hi')).toBe('https://wa.me/919989791579?text=hi');
    expect(whatsappHref('call us', 'hi')).toBeNull();
  });
});
