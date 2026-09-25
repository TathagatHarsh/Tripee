/** Isolated browser regression: mounts the real component; never connects to a database. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const root = process.cwd();
const temp = await mkdtemp(resolve(tmpdir(), 'cake-availability-'));
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CakeAvailability} from '${root}/components/inventory/CakeAvailability';
const variants = [
{id:'a',productId:'blueberry',productName:'American Blueberry',sizeBand:'1kg',eggType:'egg'},
{id:'b',productId:'blueberry',productName:'American Blueberry',sizeBand:'1kg',eggType:'eggless'},
{id:'c',productId:'blueberry',productName:'American Blueberry',sizeBand:'2kg',eggType:'eggless'},
{id:'d',productId:'biscoff',productName:'Biscoff Cheesecake',sizeBand:'2kg',eggType:'eggless'}];
let items=variants.slice(0,3).map((v,i)=>({...v,vendorId:'bakery',vendorName:'Test Bakery',isAvailable:i!==1,version:'initial',history:[]}));
window.refreshAvailability=()=>render();
window.applyAvailability=(input)=>{if(input.id)items=items.map(i=>i.id===input.id?{...i,isAvailable:input.isAvailable,version:String(Date.now())}:i);else items.push(...variants.filter(v=>input.variantIds.includes(v.id)).map(v=>({...v,vendorId:'bakery',vendorName:'Test Bakery',isAvailable:true,version:String(Date.now()),history:[]})));};
const target=createRoot(document.getElementById('root'));function render(){target.render(<main className="admin-shell p-4 sm:p-8"><h1 className="mb-2 text-3xl font-semibold">Cake Availability</h1><p className="mb-6">Tell MakeYourCakes which cakes your bakery can currently fulfil.</p><div className="flex flex-col gap-5"><CakeAvailability items={items} variants={variants} vendorId="bakery" vendors={[]} admin={false} initialQuery="" initialFilter="all" /></div></main>);}render();`;
const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, bundle: true, write: false, jsx: 'automatic', plugins: [{ name: 'next-stubs', setup(b) { b.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path.endsWith('navigation') ? 'export const useRouter=()=>({refresh:()=>window.refreshAvailability(),push:()=>{}});' : 'export default function Link(){return null;}' })); } }] });
const css = await postcss([tailwind({ base: root })]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') });
await writeFile(resolve(temp, 'app.js'), result.outputFiles[0].contents);
await writeFile(resolve(temp, 'app.css'), css.css);
const server = createServer(async (req, res) => { if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('content-type', req.url.endsWith('js') ? 'text/javascript' : 'text/css'); res.end(await readFile(resolve(temp, req.url.slice(1)))); } else res.end('<!doctype html><html lang="en"><head><title>Cake Availability QA</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); });
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address() as { port: number };
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let fail = false;
    await page.route('**/api/inventory', async route => { if (fail) return route.fulfill({ status: 409, json: { error: 'Could not update availability. Try again.' } }); const input = route.request().postDataJSON(); await page.evaluate(input => (window as unknown as { applyAvailability: (i: unknown) => void }).applyAvailability(input), input); await route.fulfill({ json: { ok: true } }); });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole('switch')).toHaveCount(3);
    const search = page.getByRole('searchbox', { name: 'Search cakes, sizes or variants' });
    for (const [query, count] of [['blueberry',3],['2kg',1],['eggless',2],['1 kg',2],['no match',0]] as const) { await search.fill(query); await expect(page.getByRole('switch')).toHaveCount(count); }
    await search.fill('');
    await page.getByRole('button', { name: 'Out of Stock', exact: true }).click();
    await expect(page.getByRole('switch')).toHaveCount(1);
    await page.getByRole('switch').click();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'American Blueberry 1 kg · Eggless', exact: true })).toHaveAttribute('aria-checked','true');
    fail = true;
    await page.getByRole('switch').first().click();
    await expect(page.getByRole('alert')).toContainText('Could not update');
    await expect(page.getByRole('switch').first()).toHaveAttribute('aria-checked','true');
    fail = false;
    await page.getByRole('button', { name: '+ Add Cake' }).click();
    await page.getByRole('searchbox', { name: 'Search cakes to add' }).fill('biscoff');
    await page.getByRole('button', { name: 'Biscoff Cheesecake' }).click();
    await page.getByRole('checkbox', { name: '2 kg · Eggless' }).check();
    await page.getByRole('button', { name: 'Add Selected (1)' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('switch')).toHaveCount(4);
    await expect(page.getByRole('switch', { name: 'Biscoff Cheesecake 2 kg · Eggless' })).toHaveAttribute('aria-checked','true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.screenshot({ path: resolve(temp, `availability-${width}.png`), fullPage: true });
    console.log(`PASS ${width}px: search, filters, toggle, rollback, picker, a11y, layout`);
    await context.close();
  }
  console.log(`Screenshots: ${temp}`);
} finally { await browser.close(); server.close(); await rm(resolve(temp,'app.js')); await rm(resolve(temp,'app.css')); }
