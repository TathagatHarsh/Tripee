import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The footer's own rule: it links only to pages that exist, because a footer
 * full of 404s is worse than a short one. These are the pages a payment
 * provider and a customer both look for, so each must be linked and must exist.
 */
const POLICIES = ['/privacy', '/terms', '/refund-policy', '/shipping-policy', '/contact'];
const footer = readFileSync('components/shop/ShopFooter.tsx', 'utf8');

describe('policy pages', () => {
  it.each(POLICIES)('%s is linked from the footer and has a page', (href) => {
    expect(footer).toContain(`"${href}"`);
    expect(existsSync(`app${href}/page.tsx`)).toBe(true);
  });
  it.each(POLICIES)('%s takes its contact details from the bakery settings', (href) => {
    const page = readFileSync(`app${href}/page.tsx`, 'utf8');
    expect(page).toContain('getBakeryInfo()');
    expect(page).not.toMatch(/\+91 ?9\d{4} ?\d{5}|@makeyourcakes\.com/);
  });
});
