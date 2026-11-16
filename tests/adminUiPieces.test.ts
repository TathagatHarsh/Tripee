import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionItem, FilterChips, StatList } from '../components/admin/ui';

const opts = [
  { value: 'all', label: 'All', count: 7 },
  { value: 'late', label: 'Late', count: 2 },
];

describe('FilterChips', () => {
  it('marks the selected chip with aria-current and links All to the bare path', () => {
    const html = renderToStaticMarkup(createElement(FilterChips, { options: opts, selected: 'late', param: 'f', basePath: '/admin' }));
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/admin?f=late"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>[^<]*Late/);
  });

  it('shows counts', () => {
    const html = renderToStaticMarkup(createElement(FilterChips, { options: opts, selected: 'all', param: 'f', basePath: '/admin' }));
    expect(html).toContain('>7<');
    expect(html).toContain('>2<');
  });
});

describe('ActionItem', () => {
  it('renders tag, title, detail and the action node', () => {
    const html = renderToStaticMarkup(createElement(ActionItem, {
      tone: 'late', tag: 'Late', title: 'Order #12', detail: 'Due 4pm', action: createElement('a', { href: '/x' }, 'Open'),
    }));
    for (const s of ['Late', 'Order #12', 'Due 4pm', 'href="/x"']) expect(html).toContain(s);
  });
});

describe('ActionItem href', () => {
  it('links the title when href is given', () => {
    const html = renderToStaticMarkup(createElement(ActionItem, {
      tone: 'late', tag: 'Late', title: 'MMC-1 · Cake', detail: 'd', href: '/admin/orders/MMC-1', action: null,
    }));
    expect(html).toMatch(/<a[^>]*href="\/admin\/orders\/MMC-1"[^>]*>MMC-1 · Cake<\/a>/);
  });
});

describe('StatList', () => {
  it('renders dt/dd pairs', () => {
    const html = renderToStaticMarkup(createElement(StatList, { rows: [{ label: 'Orders', value: '9' }] }));
    expect(html).toContain('<dl');
    expect(html).toContain('<dt');
    expect(html).toContain('Orders');
    expect(html).toContain('>9<');
  });
});
