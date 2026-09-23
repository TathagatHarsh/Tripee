/** Read-only checkout browser checks. Every order POST is intercepted. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { db } from '../lib/db';
const browser = await chromium.launch();
try {
  const cake = await db.cakeProduct.findFirstOrThrow({ where: { isAvailable: true }, include: { variants: true } });
  for (const scenario of ['success', 'reduced', 'api-error', 'network-error', 'refresh-during', 'back-during']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: scenario === 'reduced' ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await page.addInitScript(({ slug, variantId }) => {
      if (sessionStorage.getItem('qa-celebration')) return;
      sessionStorage.setItem('qa-celebration', '1');
      localStorage.setItem('makemycake.cart', JSON.stringify({ state: { lines: [{ id: 'qa', slug, variantId, qty: 1, choices: { delivery: 'pickup' } }] }, version: 0 }));
      sessionStorage.setItem('makemycake.checkoutDraft.v2', JSON.stringify({
        name: 'QA Celebration', phone: '9876543210', email: '', method: 'pickup', slot: 'pickup',
        addressLine1: '', addressLine2: '', landmark: '', city: 'Hyderabad', state: 'Telangana', pincode: '',
        requestedDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        deliveryInstructions: '', customerNotes: '', occasion: '', location: null,
      }));
    }, { slug: cake.slug, variantId: cake.variants[0].id });
    const keys: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/orders', async route => {
      const body = route.request().postDataJSON();
      keys.push(body.idempotencyKey);
      if (keys.length === 1 && scenario === 'api-error') return route.fulfill({ status: 503, json: { error: 'QA order failed. Please retry.' } });
      if (keys.length === 1 && scenario === 'network-error') return route.abort('timedout');
      await gate;
      await route.fulfill({ status: scenario === 'network-error' ? 200 : 201, json: { order: {
        ref: 'MC-ABC234', totalPaise: body.quotedOrderTotalPaise,
        date: '2026-12-24', window: '10:00–20:00', address: 'Server saved address, Hyderabad 500081', method: 'delivery',
        items: [{ name: 'Server saved cake', variant: '1 kg · Eggless', qty: 1 }],
      } } });
    });
    await page.goto(`${process.env.QA_BASE_URL ?? 'http://localhost:3119'}/checkout`);
    await expect(page.getByText(/Pickup available/)).toBeVisible();
    await page.getByRole('button', { name: /^Place order/ }).click();
    if (scenario.endsWith('error')) {
      await expect(page.getByRole('alert').filter({ hasText: scenario === 'api-error' ? 'QA order failed' : "We couldn't confirm the result" })).toBeVisible();
      await expect(page.locator('.celebration-cake')).toHaveCount(0);
      await page.getByRole('button', { name: /^Place order/ }).click();
      await expect.poll(() => keys.length).toBe(2);
      assert.equal(keys[0], keys[1], 'Retry must reuse the original idempotency key');
    } else await expect.poll(() => keys.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Placing your order…' })).toBeDisabled();
    await page.locator('form.checkout-form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await expect(page.locator('.celebration-cake')).toHaveCount(0);
    const requests = keys.length;
    release();
    await expect(page.locator('.celebration-cake')).toBeVisible();
    if (scenario === 'refresh-during' || scenario === 'back-during') {
      await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeHidden();
      if (scenario === 'back-during') {
        await page.goto(`${process.env.QA_BASE_URL ?? 'http://localhost:3119'}/shop`);
        await page.goBack();
      } else await page.reload();
      await expect(page.locator('.is-celebrating')).toHaveCount(0);
    } else if (scenario !== 'reduced') {
      await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeHidden();
    }
    await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible({ timeout: scenario === 'reduced' ? 1000 : 4000 });
    await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeFocused();
    await expect(page.getByText('Server saved address, Hyderabad 500081', { exact: true })).toBeVisible();
    await expect(page.getByText('24 December 2026')).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (scenario === 'success' || scenario === 'reduced') {
      const audit = await new AxeBuilder({ page }).include('.order-celebration').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v => v.id), []);
    }
    if (scenario === 'success') {
      await page.screenshot({ path: '/tmp/mmc-celebration-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: '/tmp/mmc-celebration-desktop.png', fullPage: true });
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
    await expect(page.locator('.is-celebrating')).toHaveCount(0);
    assert.equal(keys.length, requests, 'Repeated submit and refresh must not create another request');
    console.log(`${scenario}: passed`);
    await context.close();
  }
} finally { await browser.close(); await db.$disconnect(); }
