import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cakeData', () => ({ listCakes: async () => [{ slug: 'chocolate-truffle' }, { slug: 'pineapple-delight' }] }));

const { default: robots } = await import('../app/robots');
const { default: sitemap } = await import('../app/sitemap');

const SITE = 'https://makeyourcakes.com';
const disallowed = () => {
  const rules = robots().rules;
  return (Array.isArray(rules) ? rules : [rules]).flatMap((r) => [r.disallow ?? []].flat());
};

describe('robots.txt', () => {
  it('keeps staff and customer areas out and points at the sitemap', () => {
    for (const p of ['/admin', '/kitchen', '/vendor', '/account', '/checkout', '/api/']) expect(disallowed()).toContain(p);
    expect(robots().sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});

describe('sitemap.xml', () => {
  it('lists every public page, each of which exists, plus every cake', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const u of urls.filter((x) => !x.includes('/cakes/'))) {
      const path = u.slice(SITE.length) || '/';
      expect(existsSync(path === '/' ? 'app/page.tsx' : `app${path}/page.tsx`), path).toBe(true);
    }
    expect(urls).toContain(`${SITE}/cakes/chocolate-truffle`);
    expect(urls).toContain(`${SITE}/cakes/pineapple-delight`);
  });

  it('lists nothing robots.txt blocks', async () => {
    for (const { url } of await sitemap()) {
      const path = url.slice(SITE.length) || '/';
      expect(disallowed().some((d) => path.startsWith(d)), path).toBe(false);
    }
  });
});
