# WhatsApp Order Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orders auto-offer to the nearest in-stock vendor; vendors get the order (with cake photo) on WhatsApp and answer/progress it by button or typed word; the admin's personal WhatsApp gets every step.

**Architecture:** One Meta client (`lib/whatsapp.ts`), pure message builders (`lib/whatsappMessages.ts`), DB-aware event→message glue (`lib/whatsappEvents.ts`) hooked into the existing `event()` / transition / checkout writes, and inbound handling (`lib/whatsappInbound.ts`) that calls the existing `respondToAssignment` / `moveFulfillment`. Outgoing messages ride the existing `NotificationOutbox` with `channel: "whatsapp"`. No migration.

**Tech Stack:** Next.js 16 route handlers, Prisma/PostgreSQL, vitest, `sharp` (installed), Meta WhatsApp Cloud API (Graph `v23.0`).

**Spec:** `docs/superpowers/specs/2026-10-09-whatsapp-order-desk-design.md`

## Global Constraints

- No Prisma migration. No new npm dependency.
- Graph endpoint `https://graph.facebook.com/v23.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`; template language code `en`.
- WhatsApp is **off** (nothing queued, nothing sent) unless both `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set. Auto-start is off unless `ASSIGNMENT_AUTO_START=true`.
- Template parameters never contain `\n`/`\t`, never runs of whitespace, never empty (empty → `-`).
- Template names exactly: `order_offer`, `admin_new_order`, `order_update`. Button payloads exactly `accept:<id>`, `reject:<id>`, `start:<id>`, `ready:<id>`, `handover:<id>`.
- Site origin: `process.env.NEXT_PUBLIC_SITE_URL ?? "https://makeyourcakes.com"` (same default as `app/layout.tsx`), no trailing slash.
- **The only `DATABASE_URL` in `.env` is production.** Integration tests run only against the docker scratch DB:
  `docker run --name mmc-wa --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:latest`, then
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx prisma migrate deploy`, then
  `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx vitest run <file>`. No Docker → skip and say so.
- The working tree carries unrelated uncommitted work. Commit with explicit paths only (`git commit -m … -- <paths>`). Never `git add -A`, never `git stash`. `git status`/`git diff` with no path can hang here — always pass paths.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Match surrounding style: `lib/assignment.ts` is dense; comments only where the why is non-obvious.

## Review Focus

1. Vendor phones saved in mixed formats (`98765 43210`, `+91-98765-43210`, `09876543210`, `040 2345 6789`) must all match the sender's `wa_id` → normalizePhone tests (Task 1).
2. Vendors type with emoji, caps or punctuation (`Started ✅`, `READY!!`) → still parsed (Task 6 parse tests).
3. A vendor accepted on the website, then types `started` on WhatsApp → works (Task 6 integration).
4. Multi-cake orders have no `Order.cakeImageUrl` → photo comes from the first `OrderCake` with one, and the cake line names every cake (Task 5 + Task 8 tests).
5. The admin's number is also a vendor's phone → treated as that vendor, not as "admin self" (Task 6 integration).

---

### Task 1: Meta client — `lib/whatsapp.ts`

**Files:**
- Create: `lib/whatsapp.ts`
- Test: `tests/whatsapp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TemplateComponent = Record<string, unknown>;
  export type WhatsAppMessage =
    | { type: "template"; name: "order_offer" | "admin_new_order" | "order_update"; components: TemplateComponent[] }
    | { type: "text"; body: string }
    | { type: "buttons"; body: string; buttons: { id: string; title: string }[] };
  export function whatsappConfigured(): boolean;
  export function normalizePhone(raw: string | null | undefined): string | null;
  export function adminNumbers(): string[];            // WHATSAPP_ADMIN_NUMBERS, normalised, deduped
  export function siteUrl(): string;
  export function verifySignature(rawBody: string, header: string | null): boolean;
  export function photoSignature(orderId: string): string;
  export function photoUrl(orderId: string): string;    // `${siteUrl()}/api/whatsapp/photo/${orderId}?s=${photoSignature(orderId)}`
  export async function sendWhatsApp(to: string, message: WhatsAppMessage): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests** (`vi.mock('server-only', () => ({}))` at top, like `tests/notifications.test.ts`)

```ts
describe('normalizePhone', () => {
  it.each([
    ['98765 43210', '919876543210'], ['+91-98765-43210', '919876543210'], ['09876543210', '919876543210'],
    ['919876543210', '919876543210'], ['040 2345 6789', '914023456789'], ['+44 7700 900123', '447700900123'],
  ])('%s → %s', (raw, want) => expect(normalizePhone(raw)).toBe(want));
  it.each([null, undefined, '', '12345', 'abc'])('%s → null', raw => expect(normalizePhone(raw)).toBeNull());
});
it('adminNumbers normalises, drops junk and dedupes', () => {
  vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '98765 43210, +919876543210,xx, 9000000001');
  expect(adminNumbers()).toEqual(['919876543210', '919000000001']);
});
describe('verifySignature', () => {
  const sig = (body: string) => 'sha256=' + createHmac('sha256', 'app-secret').update(body).digest('hex');
  beforeEach(() => vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret'));
  it('accepts Meta’s signature', () => expect(verifySignature('{"a":1}', sig('{"a":1}'))).toBe(true));
  it('rejects a tampered body', () => expect(verifySignature('{"a":2}', sig('{"a":1}'))).toBe(false));
  it('rejects missing or short headers without throwing', () => {
    expect(verifySignature('x', null)).toBe(false); expect(verifySignature('x', 'sha256=ab')).toBe(false);
  });
  it('rejects everything when the secret is unset', () => { vi.stubEnv('WHATSAPP_APP_SECRET', ''); expect(verifySignature('x', sig('x'))).toBe(false); });
});
it('photoUrl is signed and stable', () => {
  vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret'); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cakes.test');
  expect(photoUrl('ord1')).toBe(`https://cakes.test/api/whatsapp/photo/ord1?s=${photoSignature('ord1')}`);
  expect(photoSignature('ord1')).toMatch(/^[A-Za-z0-9_-]{22}$/); expect(photoSignature('ord2')).not.toBe(photoSignature('ord1'));
});
describe('sendWhatsApp', () => {
  // stub WHATSAPP_ACCESS_TOKEN='tok', WHATSAPP_PHONE_NUMBER_ID='PNID', fetch → { ok: true, json: async () => ({}) }
  it('posts text to the Graph messages endpoint', async () => {
    await sendWhatsApp('919876543210', { type: 'text', body: 'hi' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/PNID/messages');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '919876543210', type: 'text', text: { body: 'hi', preview_url: false } });
  });
  it('maps buttons to an interactive reply message', async () => { /* body.interactive equals
    { type: 'button', body: { text: 'b' }, action: { buttons: [{ type: 'reply', reply: { id: 'start:1', title: 'Started' } }] } } */ });
  it('maps templates with language en', async () => { /* body.template equals { name: 'order_update', language: { code: 'en' }, components: [] } */ });
  it('throws whatsapp_<status>_<metaCode> on failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 131026 } }) });
    await expect(sendWhatsApp('91…', { type: 'text', body: 'x' })).rejects.toThrow('whatsapp_400_131026');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/whatsapp.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/whatsapp.ts`** (`import "server-only"`).
  - `normalizePhone`: strip non-digits; 10 digits → `91`+digits; `0`+10 digits → `91`+last 10; 11–15 digits → as is; else `null`.
  - `verifySignature`: header must be `sha256=<hex>`; compare with `crypto.timingSafeEqual` after an equal-length check; `false` when `WHATSAPP_APP_SECRET` is empty.
  - `photoSignature`: HMAC-SHA256(`WHATSAPP_APP_SECRET`, `photo:${orderId}`) base64url, first 22 chars.
  - `sendWhatsApp`: `fetch` with `cache: "no-store"`, `signal: AbortSignal.timeout(10_000)`; on `!ok` read `error.code` from JSON if parsable.
- [ ] **Step 4: Run** `npx vitest run tests/whatsapp.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git add lib/whatsapp.ts tests/whatsapp.test.ts && git commit -m "feat: WhatsApp Cloud API client" -- lib/whatsapp.ts tests/whatsapp.test.ts`

---

### Task 2: Outbox sends WhatsApp rows — `lib/notifications.ts`

**Files:**
- Modify: `lib/notifications.ts` (`OutboxInput`, `outboxCreate`, the send call inside `dispatchPendingNotifications`)
- Test: `tests/notifications.test.ts`

**Interfaces:**
- Consumes: `sendWhatsApp`, `WhatsAppMessage` (Task 1).
- Produces: `OutboxInput.channel?: "webhook" | "whatsapp"` (default `"webhook"`). Rows with `channel === "whatsapp"` go to `sendWhatsApp(destination, payload)`; others to the existing webhook. Missing destination → throw `whatsapp_destination_missing` (normal failure/backoff path).

- [ ] **Step 1: Write the failing tests** — add `channel: string` to the test's `Row` type (default `'webhook'` in `beforeEach`), then:

```ts
it('sends whatsapp rows to Meta, not the webhook', async () => {
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
  Object.assign(row, { channel: 'whatsapp', destination: '919876543210', payload: { type: 'text', body: 'hi' } });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  expect(await dispatchPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v23.0/PNID/messages');
});
it('fails a whatsapp row with no destination', async () => {
  Object.assign(row, { channel: 'whatsapp', destination: null });
  expect(await dispatchPendingNotifications()).toEqual({ sent: 0, failed: 1 });
  expect(row.lastError).toBe('whatsapp_destination_missing');
});
```
- [ ] **Step 2: Run** `npx vitest run tests/notifications.test.ts` — Expected: the two new tests FAIL, old ones PASS.
- [ ] **Step 3: Implement** the channel option and routing.
- [ ] **Step 4: Run** `npx vitest run tests/notifications.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `lib/notifications.ts tests/notifications.test.ts` — `feat: outbox routes whatsapp rows to Meta`.

---

### Task 3: Message builders — `lib/whatsappMessages.ts`

**Files:**
- Create: `lib/whatsappMessages.ts`
- Test: `tests/whatsappMessages.test.ts`

**Interfaces:**
- Consumes: Task 1 (`WhatsAppMessage`, `photoUrl`, `normalizePhone`, `whatsappConfigured`), Task 2 (`outboxCreate` with `channel`).
- Produces:
  ```ts
  export interface OrderFacts { orderId: string; ref: string; totalPaise: number; dueAt: Date | null; area: string; cake: string }
  export function cleanParam(value: string | null | undefined, max?: number): string;   // default max 120
  export function rupees(paise: number): string;
  export function formatDue(at: Date | null): string;
  export function offerMessage(f: OrderFacts, o: { assignmentId: string; distanceKm: number | null; earningPaise: number | null; replyMinutes: number }): WhatsAppMessage;
  export function adminNewOrderMessage(f: OrderFacts): WhatsAppMessage;
  export function updateMessage(ref: string, text: string): WhatsAppMessage;
  export function acceptedMessage(ref: string, assignmentId: string): WhatsAppMessage;
  export function textMessage(body: string): WhatsAppMessage;
  export async function queueWhatsApp(tx: Prisma.TransactionClient, input: {
    orderId: string; vendorId?: string | null; kind: NotificationKind;
    to: (string | null | undefined)[]; dedupeKey: string; message: WhatsAppMessage;
  }): Promise<number>;   // rows written; 0 when not configured
  ```

- [ ] **Step 1: Write the failing tests**

```ts
const facts = { orderId: 'ord1', ref: 'MC-AB12CD', totalPaise: 125000, dueAt: new Date('2026-10-10T10:30:00Z'), area: 'Jubilee Hills, Hyderabad 500033', cake: 'Chocolate Truffle · 1kg · eggless · message "Happy\nBirthday"' };
const params = (m: WhatsAppMessage, type: string) => (m as any).components.find((c: any) => c.type === type).parameters;
it('cleanParam flattens whitespace, caps length, never returns empty', () => {
  expect(cleanParam('a\n\tb    c')).toBe('a b c'); expect(cleanParam('')).toBe('-'); expect(cleanParam(null)).toBe('-');
  expect(cleanParam('x'.repeat(200), 10)).toBe('x'.repeat(9) + '…');
});
it('rupees uses Indian grouping', () => { expect(rupees(125000)).toBe('1,250'); expect(rupees(189950)).toBe('1,899.50'); expect(rupees(10000000)).toBe('1,00,000'); });
it('formatDue is IST', () => { expect(formatDue(new Date('2026-10-10T10:30:00Z'))).toBe('Sat 10 Oct, 4:00 pm'); expect(formatDue(null)).toBe('not set'); });
it('offerMessage: photo header, 7 clean params, accept/reject payloads', () => {
  const m = offerMessage(facts, { assignmentId: 'as1', distanceKm: 2.04, earningPaise: 100000, replyMinutes: 15 });
  expect(m).toMatchObject({ type: 'template', name: 'order_offer' });
  expect(params(m, 'header')[0].image.link).toContain('/api/whatsapp/photo/ord1?s=');
  const body = params(m, 'body').map((p: any) => p.text);
  expect(body).toEqual(['MC-AB12CD', 'Chocolate Truffle · 1kg · eggless · message "Happy Birthday"', 'Sat 10 Oct, 4:00 pm', 'Jubilee Hills, Hyderabad 500033', '2.0', '1,000', '15']);
  const payloads = (m as any).components.filter((c: any) => c.type === 'button').map((c: any) => [c.index, c.parameters[0].payload]);
  expect(payloads).toEqual([['0', 'accept:as1'], ['1', 'reject:as1']]);
});
it('offerMessage handles unknown distance and earning', () => { /* body[4] === '?', body[5] === '-' */ });
it('adminNewOrderMessage: photo + [ref, rupees, cake, due, area]', () => { /* name 'admin_new_order', body ['MC-AB12CD','1,250', cake, due, area] */ });
it('updateMessage: [ref, text]', () => { expect(params(updateMessage('MC-1', 'Sweet Crumbs accepted'), 'body').map((p: any) => p.text)).toEqual(['MC-1', 'Sweet Crumbs accepted']); });
it('acceptedMessage offers the three steps', () => {
  expect(acceptedMessage('MC-1', 'as1')).toEqual({ type: 'buttons', body: 'MC-1 is yours. Tap each step as you go.',
    buttons: [{ id: 'start:as1', title: 'Started' }, { id: 'ready:as1', title: 'Ready' }, { id: 'handover:as1', title: 'Handed over' }] });
});
describe('queueWhatsApp', () => {
  const tx = { notificationOutbox: { upsert: vi.fn() } } as any;
  it('writes nothing when WhatsApp is not configured', async () => { expect(await queueWhatsApp(tx, { orderId: 'o', kind: 'status_changed', to: ['9876543210'], dedupeKey: 'k', message: textMessage('x') })).toBe(0); expect(tx.notificationOutbox.upsert).not.toHaveBeenCalled(); });
  it('one idempotent whatsapp row per unique normalised number', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    expect(await queueWhatsApp(tx, { orderId: 'o', kind: 'status_changed', to: ['98765 43210', '+919876543210', null, 'junk'], dedupeKey: 'k', message: textMessage('x') })).toBe(1);
    expect(tx.notificationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: 'k:919876543210' }, update: {},
      create: expect.objectContaining({ channel: 'whatsapp', destination: '919876543210', dedupeKey: 'k:919876543210' }) }));
  });
});
```
- [ ] **Step 2: Run** `npx vitest run tests/whatsappMessages.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Every template parameter passes through `cleanParam` (`updateMessage` text uses max 400). `formatDue` builds from `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts`, lower-cased day period, to the exact shape above. Template components follow Meta's JSON: header `{ type: 'header', parameters: [{ type: 'image', image: { link } }] }`, body `{ type: 'body', parameters: [{ type: 'text', text }] }`, buttons `{ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload }] }`.
- [ ] **Step 4: Run** `npx vitest run tests/whatsappMessages.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `lib/whatsappMessages.ts tests/whatsappMessages.test.ts` — `feat: WhatsApp message builders and outbox queueing`.

---

### Task 4: Auto-offer the nearest vendor — `startAssignment`

**Files:**
- Modify: `lib/assignment.ts:231-236` (`startAssignment`)
- Test: `tests/assignment.integration.test.ts`

**Interfaces:**
- Consumes: existing `findEligibleBakeries`, `manualAssignment`, `AssignmentConflict`.
- Produces: `startAssignment(ref)` unchanged signature. With `ASSIGNMENT_AUTO_START=true` it offers the first eligible bakery; none → `assignmentState: 'MANUAL'`, `assignmentNote: 'No eligible bakery for this order. Main bakery intervention required.'`. Task 5 adds the admin alert in that branch.

- [ ] **Step 1: Write the failing tests.** In `afterEach` also `delete process.env.ASSIGNMENT_AUTO_START` and reset the `getDistanceMatrix` mock to its 2 km default (hoist the default impl with `vi.hoisted` so the `vi.mock` factory and `afterEach` share it). Helper for "vendor i is nearer the higher i is":

```ts
const nearerByIndex = () => vi.mocked(getDistanceMatrix).mockImplementation(async (origins: { lat: number }[]) =>
  origins.map(o => ({ distanceKm: 5 - (o.lat - 17.43) * 1000, estimatedMinutes: 10, source: 'test' })));
const auto = () => { process.env.ASSIGNMENT_AUTO_START = 'true'; process.env.ASSIGNMENT_AUTO_REASSIGN = 'true'; };

it('auto start offers the nearest in-stock bakery and queues the rest nearest-first', async () => {
  auto(); nearerByIndex(); const { order, vendors } = await fixture(true, 3);
  await startAssignment(order.ref);
  expect((await current(order.id)).vendorId).toBe(vendors[2].id);
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).assignmentState).toBe('OFFERED');
  const queued = await db.vendorOrder.findMany({ where: { orderId: order.id, assignmentStatus: 'PENDING' }, orderBy: { sequence: 'asc' } });
  expect(queued.map(r => r.vendorId)).toEqual([vendors[1].id, vendors[0].id]);
});
it('auto start skips a nearer bakery that is out of stock', async () => {
  auto(); nearerByIndex(); const { order, vendors } = await fixture(true, 3);
  await db.vendorInventory.updateMany({ where: { vendorId: vendors[2].id }, data: { isAvailable: false } });
  await startAssignment(order.ref); expect((await current(order.id)).vendorId).toBe(vendors[1].id);
});
it('auto start with no eligible bakery hands the order to the admin', async () => {
  auto(); const { order } = await fixture(false); await startAssignment(order.ref);
  expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ assignmentState: 'MANUAL', assignmentNote: 'No eligible bakery for this order. Main bakery intervention required.' });
  expect(await db.vendorOrder.count({ where: { orderId: order.id } })).toBe(0);
});
it('concurrent auto starts create exactly one offer', async () => {
  auto(); const { order } = await fixture(true, 3);
  await Promise.all([startAssignment(order.ref), startAssignment(order.ref)]);
  expect(await db.vendorOrder.count({ where: { orderId: order.id, assignmentStatus: 'OFFERED' } })).toBe(1);
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).assignmentState).toBe('OFFERED');
});
it('auto start leaves unconfirmed and admin-held orders alone', async () => {
  auto(); const { order, product } = await fixture(true, 2);
  await db.order.update({ where: { id: order.id }, data: { status: 'draft' } }); await startAssignment(order.ref);
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).assignmentState).toBe('PENDING');
  const held = await newOrder(product.id); await db.order.update({ where: { id: held.id }, data: { assignmentState: 'MANUAL' } });
  await startAssignment(held.ref); expect(await db.vendorOrder.count({ where: { orderId: { in: [order.id, held.id] } } })).toBe(0);
});
```
- [ ] **Step 2: Run** (scratch DB, see Global Constraints) `… npx vitest run tests/assignment.integration.test.ts` — Expected: the 5 new tests FAIL; existing ones (incl. "checkout waits for admin") PASS.
- [ ] **Step 3: Implement.** Flag off → current body unchanged. Flag on:

```ts
const order = await db.order.findUnique({ where: { ref }, select: { status: true, currentAssignmentId: true, assignmentState: true } });
if (!order || !['confirmed', 'in_kitchen'].includes(order.status) || order.currentAssignmentId || !['PENDING', 'ASSIGNING'].includes(order.assignmentState)) return;
for (const candidate of await findEligibleBakeries(ref)) {
  try { await manualAssignment(ref, candidate.vendorId, null, null); return; }
  catch (error) {
    if (!(error instanceof AssignmentConflict)) throw error;
    // A concurrent start won the race: stop rather than walk the list and end in MANUAL.
    if ((await db.order.findUnique({ where: { ref }, select: { currentAssignmentId: true } }))?.currentAssignmentId) return;
  }
}
await db.order.updateMany({ where: { ref, currentAssignmentId: null, assignmentState: { in: ['PENDING', 'ASSIGNING'] } }, data: { assignmentState: 'MANUAL', assignmentNote: 'No eligible bakery for this order. Main bakery intervention required.' } });
```
- [ ] **Step 4: Run** the integration file — Expected: all PASS.
- [ ] **Step 5: Commit** `lib/assignment.ts tests/assignment.integration.test.ts` — `feat: auto-offer new orders to the nearest in-stock vendor`.

---

### Task 5: Outgoing WhatsApp for every step — `lib/whatsappEvents.ts` + hooks

**Files:**
- Create: `lib/whatsappEvents.ts`
- Modify: `lib/assignment.ts` (`event()` after `portalEvent`; `advance()` beside the `manual:` outbox upsert; the no-candidate branch of `startAssignment`), `lib/orderTransition.ts` (after the status outbox create, ~line 110), `app/api/orders/route.ts` (after the `new_order` outbox create, ~line 519)
- Test: `tests/whatsapp.integration.test.ts` (new; same `describe.skipIf(!url)` + fixture/cleanup pattern as `tests/assignment.integration.test.ts`, vendors created with `phone: '98765 43210'` unless a test says otherwise)

**Interfaces:**
- Consumes: Task 1 (`whatsappConfigured`, `adminNumbers`, `siteUrl`), Task 3 (all builders, `queueWhatsApp`, `OrderFacts`), `VENDOR_STATUS_LABEL` from `lib/vendors.ts`.
- Produces (every function returns immediately, before any query, when `!whatsappConfigured()`):
  ```ts
  type Tx = Prisma.TransactionClient;
  export async function loadOrderFacts(tx: Tx, orderId: string): Promise<OrderFacts>;
  export async function whatsappAssignmentEvent(tx: Tx, e: { orderId: string; assignmentId: string; eventId: string; name: string; reason?: string | null }): Promise<void>;
  export async function whatsappNoBakery(tx: Tx, orderId: string, dedupeKey: string): Promise<void>;
  export async function whatsappNewOrder(tx: Tx, orderId: string): Promise<void>;
  export async function whatsappOrderStatus(tx: Tx, e: { orderId: string; to: OrderStatus; vendorId?: string | null; vendorPhone?: string | null; reason?: string | null }): Promise<void>;
  ```
- Facts: `cake` = each `OrderCake` (fallback: the order's own `cakeName`/config) as `${name} · ${sizeBand} · ${eggType}`, joined ` + `, then ` · message "<msg>"` for the first non-empty message; `area` = `[addressLine2, city, pincode]` non-empty joined `, `; `dueAt` = `dueAt ?? requestedFor`.
- Admin copy (`updateMessage(ref, text)` to `adminNumbers()`), keyed by `name`:
  `offered` → `Offered to ${vendor} (${km} km)` + (no normalisable vendor phone ? ` - no WhatsApp number on file` : ``) · `accepted` → `${vendor} accepted` · `rejected` → `${vendor} rejected: ${reason ?? 'no reason'}` · `expired` → `${vendor} did not reply in time` · `reassigned` → `Taken from ${vendor} and reassigned` · `in_preparation` → `${vendor} started preparing` · `ready` → `${vendor} marked it ready` · `handed_over` → `${vendor} handed it over` · anything else → `${vendor}: ${name.replaceAll('_', ' ')}`.
- `offered` also sends `offerMessage` to the vendor's phone; `replyMinutes` = round((expiresAt − offeredAt)/60000), fallback `ASSIGNMENT_RESPONSE_SECONDS/60` (900 → 15).
- No bakery → admin `⚠️ No vendor can take this order. Assign it at ${siteUrl()}/admin/orders/${ref}`.
- Order status → admin: `confirmed` → `Confirmed`, `out_for_delivery` → `Out for delivery`, `delivered` → `Delivered`, `cancelled` → `Cancelled` + (reason ? `: ${reason}` : ``); `draft`/`in_kitchen` → nothing. `cancelled` with a vendor phone also sends the vendor `updateMessage(ref, 'Cancelled. Please stop work on this order.')`.
- Dedupe keys: `wa:event:${eventId}:vendor`, `wa:event:${eventId}:admin`, `wa:order:${orderId}:${to}`, `wa:order:${orderId}:new`; no-bakery keys `wa:manual:${orderId}:${lastRowId ?? 'none'}` (advance) and `wa:manual:${orderId}:start` (startAssignment).
- Kinds: offer → `vendor_assigned`; new order → `new_order`; cancellation → `order_cancelled`; the rest → `status_changed`.

- [ ] **Step 1: Write the failing tests** (`beforeEach`: stub `WHATSAPP_ACCESS_TOKEN=tok`, `WHATSAPP_PHONE_NUMBER_ID=PNID`, `WHATSAPP_APP_SECRET=secret`, `WHATSAPP_ADMIN_NUMBERS=9000000001`; helper `wa(orderId)` = outbox rows with `channel: 'whatsapp'` for that order; `bodyText(row)` = the body params' `text` values)

```ts
it('an offer queues the vendor template and an admin update', async () => {
  const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null);
  const rows = await wa(order.id); const offer = await current(order.id);
  const toVendor = rows.find(r => r.destination === '919876543210')!;
  expect(toVendor.payload).toMatchObject({ type: 'template', name: 'order_offer' });
  expect(JSON.stringify(toVendor.payload)).toContain(`accept:${offer.id}`);
  expect(bodyText(rows.find(r => r.destination === '919000000001')!)).toEqual([order.ref, 'Offered to Test Bakery 0 (2.0 km)']);
});
it('a vendor without a phone is flagged to the admin', async () => { /* vendor phone null → no vendor row; admin text ends ' - no WhatsApp number on file' */ });
it('rejection, acceptance and every production step reach the admin', async () => {
  /* reject (reason 'Oven unavailable') → admin 'Test Bakery 0 rejected: Oven unavailable';
     reassign to vendors[1], accept, moveFulfillment in_preparation → ready → handed_over →
     admin texts include 'Test Bakery 1 accepted', 'Test Bakery 1 started preparing', 'Test Bakery 1 marked it ready', 'Test Bakery 1 handed it over' */
});
it('cancellation tells the admin and the vendor that held it', async () => {
  /* accept, then applyStatusTransition(order.ref, 'cancelled', null, 'Customer asked') →
     admin 'Cancelled: Customer asked'; vendor row text 'Cancelled. Please stop work on this order.' */
});
it('no bakery left alerts the admin with the order link', async () => {
  /* ASSIGNMENT_AUTO_START=true, fixture(false), startAssignment → admin text contains `/admin/orders/${order.ref}` and starts with '⚠️' */
});
it('new order: admin template with the signed photo link and every cake named', async () => {
  /* add two OrderCake rows ('Chocolate Truffle' 1kg eggless, 'Red Velvet' 500g egg) to the order;
     db.$transaction(tx => whatsappNewOrder(tx, order.id)) → admin row name 'admin_new_order',
     header link contains `/api/whatsapp/photo/${order.id}?s=`, body[2] contains 'Chocolate Truffle' and 'Red Velvet' */
});
it('nothing is queued when WhatsApp is not configured', async () => {
  vi.unstubAllEnvs(); const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null);
  expect(await wa(order.id)).toHaveLength(0);
});
```
- [ ] **Step 2: Run** `… npx vitest run tests/whatsapp.integration.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/whatsappEvents.ts`** to the copy and keys above.
- [ ] **Step 4: Wire the hooks** — `event()`: `await whatsappAssignmentEvent(tx, { orderId, assignmentId: id, eventId: row.id, name, reason })`; `advance()` and `startAssignment`'s no-candidate branch: `whatsappNoBakery` (the latter with `db`, after its `updateMany` reports `count === 1`); `applyStatusTransition`: `whatsappOrderStatus(tx, { orderId: order.id, to, vendorId, vendorPhone, reason })` using the already-selected `currentAssignment.vendor`; checkout tx: `whatsappNewOrder(tx, order.id)`.
- [ ] **Step 5: Run** both integration files and `npx vitest run` — Expected: PASS.
- [ ] **Step 6: Commit** `lib/whatsappEvents.ts lib/assignment.ts lib/orderTransition.ts app/api/orders/route.ts tests/whatsapp.integration.test.ts` — `feat: WhatsApp messages for every order step`.

---

### Task 6: Vendor replies — `lib/whatsappInbound.ts`

**Files:**
- Create: `lib/whatsappInbound.ts`
- Test: `tests/whatsappInbound.test.ts` (pure), `tests/whatsapp.integration.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 (`normalizePhone`, `adminNumbers`, `sendWhatsApp`), Task 3 (`queueWhatsApp`, `acceptedMessage`, `textMessage`), `respondToAssignment`, `moveFulfillment`, `AssignmentConflict` (`lib/assignment.ts`), `VENDOR_STATUS_LABEL` (`lib/vendors.ts`), `log` (`lib/log.ts`).
- Produces:
  ```ts
  export type InboundAction = "accept" | "reject" | "start" | "ready" | "handover";
  export interface ParsedInbound { action: InboundAction; assignmentId?: string; ref?: string }
  export function parseInbound(input: { text?: string | null; payload?: string | null }): ParsedInbound | null;
  export interface OpenRow { id: string; orderId: string; ref: string; assignmentStatus: AssignmentStatus; status: VendorOrderStatus }
  export function pickTarget(action: InboundAction, rows: OpenRow[], ref?: string):
    { kind: "one"; row: OpenRow } | { kind: "none" } | { kind: "many"; refs: string[] };
  export interface InboundMessage { id: string; from: string; text?: string | null; payload?: string | null }
  export async function handleInbound(msg: InboundMessage): Promise<void>;
  ```
- Words (after lower-casing, removing the ref, stripping everything but `a-z`, spaces; whole-string match): accept `accept|yes|ok|okay`; reject `reject|no`; start `start|started|order started|start order`; ready `ready|order ready`; handover `handed over|handover|picked up|done`. Ref pattern `/\bmc-[a-z0-9]+\b/i`, returned upper-case. A payload matching `^(accept|reject|start|ready|handover):(\S+)$` wins over text.
- `pickTarget` fit: accept/reject → `assignmentStatus === 'OFFERED'`; start → `ACCEPTED` + `status === 'accepted'`; ready → `in_preparation`; handover → `ready`. With `ref`, filter to it first.
- `handleInbound` flow and exact copy:
  1. Active vendors whose `normalizePhone(phone)` equals `normalizePhone(from)` (vendor match wins over admin). 0 and sender is an admin number → `This number only sends updates. Use the admin page to act on orders.`; 0 otherwise → `This number is for MakeYourCakes bakery partners. For your order, use the link in your confirmation.`; >1 → `This number is linked to more than one bakery. Please contact the admin.`
  2. `parseInbound` null → `Reply with: accept, reject, started, ready or handed over. Add the order number if you have more than one, e.g. started MC-1234.`
  3. Open rows: that vendor's `VendorOrder`s whose `currentFor` order is `confirmed`/`in_kitchen`. A payload id not among them → `That order isn't waiting on you any more.`
  4. `none` → `Nothing to mark ${WORD} right now.` (WORD: accepted / rejected / started / ready / handed over); `many` → `Which order? Reply *${REPLY} ${refs[0]}* or tap the button on that order. Open: ${refs.join(', ')}` (REPLY: accept / reject / started / ready / handed over).
  5. `one`: accept → `respondToAssignment(vendorId, ref, id, 'ACCEPTED')` → `acceptedMessage(ref, id)`; reject → `respondToAssignment(…, 'REJECTED', 'Rejected on WhatsApp')` → `Okay, ${ref} has been passed on.`; start/ready/handover → `moveFulfillment(vendorId, ref, 'in_preparation' | 'ready' | 'handed_over', id)` → true: `✅ ${ref}: ${VENDOR_STATUS_LABEL[to]}`, false: `That step isn't possible for ${ref} right now.` A `{ ok: false, message }` result or an `AssignmentConflict` → its message.
  6. Step 5 replies are order-linked: `queueWhatsApp(db, { orderId, vendorId, kind: 'status_changed', to: [from], dedupeKey: `wa-reply:${msg.id}`, message })` — a retried webhook can't double-reply. Steps 1–4 have no order row for the outbox: `sendWhatsApp(from, textMessage(…))` directly, failures logged as `whatsapp_reply_failed` (a retried webhook may repeat these; harmless).

- [ ] **Step 1: Write the failing unit tests** (`tests/whatsappInbound.test.ts`, mock `server-only`, `@/lib/db`, `@/lib/assignment`)

```ts
it.each([
  [{ payload: 'accept:as1' }, { action: 'accept', assignmentId: 'as1' }], [{ payload: 'handover:as1', text: 'Handed over' }, { action: 'handover', assignmentId: 'as1' }],
  [{ text: 'Order started' }, { action: 'start' }], [{ text: 'STARTED mc-ab12cd' }, { action: 'start', ref: 'MC-AB12CD' }],
  [{ text: 'Started ✅' }, { action: 'start' }], [{ text: 'READY!!' }, { action: 'ready' }], [{ text: 'picked up' }, { action: 'handover' }],
  [{ text: 'ok' }, { action: 'accept' }], [{ text: 'No' }, { action: 'reject' }],
])('parses %j', (input, want) => expect(parseInbound(input)).toEqual(want));
it.each([{ text: 'hello' }, { text: '' }, { payload: 'delete:as1' }, {}])('ignores %j', input => expect(parseInbound(input)).toBeNull());
const row = (id: string, ref: string, assignmentStatus: string, status: string) => ({ id, orderId: `o-${id}`, ref, assignmentStatus, status }) as OpenRow;
it('pickTarget: none / one / many / ref filter / step fit', () => {
  const offered = [row('a', 'MC-1', 'OFFERED', 'assigned'), row('b', 'MC-2', 'OFFERED', 'assigned')];
  expect(pickTarget('start', offered)).toEqual({ kind: 'none' });
  expect(pickTarget('accept', offered)).toEqual({ kind: 'many', refs: ['MC-1', 'MC-2'] });
  expect(pickTarget('accept', offered, 'MC-2')).toEqual({ kind: 'one', row: offered[1] });
  expect(pickTarget('ready', [row('c', 'MC-3', 'ACCEPTED', 'in_preparation')])).toMatchObject({ kind: 'one' });
  expect(pickTarget('handover', [row('c', 'MC-3', 'ACCEPTED', 'in_preparation')])).toEqual({ kind: 'none' });
});
```
- [ ] **Step 2: Run** `npx vitest run tests/whatsappInbound.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write the failing integration tests** (append to `tests/whatsapp.integration.test.ts`; stub `fetch` → `{ ok: true, json: async () => ({}) }` to capture direct replies; `directTexts()` = parsed `text.body` of each fetch call)

```ts
it('accept by button accepts and replies with the step buttons', async () => {
  const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null); const offer = await current(order.id);
  await handleInbound({ id: 'wamid.1', from: '919876543210', payload: `accept:${offer.id}` });
  expect((await current(order.id)).assignmentStatus).toBe('ACCEPTED');
  const reply = await db.notificationOutbox.findUniqueOrThrow({ where: { dedupeKey: 'wa-reply:wamid.1:919876543210' } });
  expect(reply.payload).toMatchObject({ type: 'buttons', buttons: [{ id: `start:${offer.id}` }, {}, {}] });
});
it('typed "order started" after a website accept starts preparation', async () => {
  /* manualAssignment, respondToAssignment(vendor, ref, id, 'ACCEPTED') (portal path), then
     handleInbound({ id: 'wamid.2', from: '919876543210', text: 'Order started' }) →
     current.status 'in_preparation', order.status 'in_kitchen' */
});
it('a retried webhook message gets one reply', async () => { /* same message id twice → one 'wa-reply:wamid.3:…' row; still ACCEPTED */ });
it("another vendor's assignment id is refused", async () => {
  /* vendors[1].phone '9123456789'; offer to vendors[0]; handleInbound from '919123456789' payload accept:<vendor0 offer id>
     → vendor0 offer still OFFERED; directTexts() contains "That order isn't waiting on you any more." */
});
it('the admin number that is also a vendor acts as that vendor', async () => {
  /* WHATSAPP_ADMIN_NUMBERS=9876543210 (same as vendors[0]); 'yes' → ACCEPTED, no admin-only reply */
});
it('a stranger gets the fixed line', async () => { /* from '919999999999' text 'hi' → directTexts() equals the stranger copy */ });
```
- [ ] **Step 4: Implement `lib/whatsappInbound.ts`.**
- [ ] **Step 5: Run** both test files — Expected: PASS.
- [ ] **Step 6: Commit** `lib/whatsappInbound.ts tests/whatsappInbound.test.ts tests/whatsapp.integration.test.ts` — `feat: vendors accept and progress orders by WhatsApp reply`.

---

### Task 7: Webhook route — `app/api/whatsapp/webhook/route.ts`

**Files:**
- Create: `app/api/whatsapp/webhook/route.ts`
- Test: `tests/whatsappWebhook.test.ts`

**Interfaces:**
- Consumes: `verifySignature` (Task 1), `handleInbound` (Task 6), `dispatchPendingNotifications` (`lib/notifications.ts`), `maskedPhone` (`lib/notify.ts`), `log`, `after` (`next/server`).
- Produces: `GET(req: Request)`, `POST(req: Request)`; `export const maxDuration = 30`. Not behind sign-in (`lib/roles.ts` GUARDED has no `/api/whatsapp`).
- Message mapping from `entry[].changes[].value.messages[]`: `{ id: m.id, from: m.from, text: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? null, payload: m.button?.payload ?? m.interactive?.button_reply?.id ?? null }`. `statuses[]` with `status === 'failed'` → `log('error', 'whatsapp_delivery_failed', { id, recipient: maskedPhone(recipient_id), code: errors?.[0]?.code })`.

- [ ] **Step 1: Write the failing tests** (mock `@/lib/whatsappInbound`, `@/lib/notifications`, `@/lib/log`; mock `next/server` keeping the original module but `after: (fn: () => unknown) => fn()`; sign bodies with `WHATSAPP_APP_SECRET=secret`)

```ts
it('answers the verify handshake', async () => {
  vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'tok');
  const res = await GET(new Request('https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42'));
  expect(res.status).toBe(200); expect(await res.text()).toBe('42');
});
it('refuses a wrong verify token', async () => { /* hub.verify_token=nope → 403 */ });
it('rejects an unsigned POST without parsing it', async () => { /* bad signature → 401; handleInbound not called */ });
it('hands a signed button tap to handleInbound and dispatches', async () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '919876543210', type: 'button', button: { payload: 'accept:as1', text: 'Accept' } }] } }] }] });
  const res = await POST(signed(body)); expect(res.status).toBe(200);
  expect(handleInbound).toHaveBeenCalledWith({ id: 'wamid.1', from: '919876543210', text: 'Accept', payload: 'accept:as1' });
  expect(dispatchPendingNotifications).toHaveBeenCalled();
});
it('logs failed deliveries with a masked number', async () => {
  /* statuses: [{ id: 'wamid.9', status: 'failed', recipient_id: '919876543210', errors: [{ code: 131026 }] }]
     → log called with ('error', 'whatsapp_delivery_failed', { id: 'wamid.9', recipient: '…3210', code: 131026 }) */
});
it('returns 500 so Meta retries when handling throws', async () => { /* handleInbound rejects → 500 */ });
```
- [ ] **Step 2: Run** `npx vitest run tests/whatsappWebhook.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** `GET`: 200 with `hub.challenge` as text only when `hub.mode === 'subscribe'` and `hub.verify_token` equals a non-empty `WHATSAPP_VERIFY_TOKEN`, else 403. `POST`: `await req.text()`, signature check on that exact string (401), `JSON.parse`, handle messages sequentially, `after(() => dispatchPendingNotifications(10))`, 200 `{ ok: true }`; any thrown error → log `whatsapp_webhook_failed`, 500.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `app/api/whatsapp/webhook/route.ts tests/whatsappWebhook.test.ts` — `feat: WhatsApp webhook endpoint`.

---

### Task 8: Cake photo as JPEG — `app/api/whatsapp/photo/[orderId]/route.ts`

**Files:**
- Create: `app/api/whatsapp/photo/[orderId]/route.ts`
- Test: `tests/whatsappPhoto.test.ts`

**Interfaces:**
- Consumes: `photoSignature`, `siteUrl` (Task 1), `db`.
- Produces: `GET(req: Request, ctx: { params: Promise<{ orderId: string }> })` → `image/jpeg`, `cache-control: public, max-age=86400`. Bad/missing `s` or unknown order → 404 (signature checked before any DB read).
- Source: first `OrderCake.cakeImageUrl` that is set, else `Order.cakeImageUrl`. Fetched via `new URL(src, siteUrl())` with `AbortSignal.timeout(8000)`; converted with `sharp(bytes).rotate().resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 })`.
- No source, fetch failure, non-ok, or sharp error → name card: 800×800 SVG, cream `#FFF7EC` background, the cake name (first cake's `cakeName` ?? order `cakeName` ?? `Custom cake`, XML-escaped, max 40 chars) centred, rendered to JPEG by `sharp`.

- [ ] **Step 1: Write the failing tests** (mock `server-only`, `@/lib/db` → `order.findUnique`; stub `fetch`; make a real WebP in the test with `sharp({ create: { width: 50, height: 50, channels: 3, background: '#a0522d' } }).webp().toBuffer()`)

```ts
const call = (orderId: string, s: string) => GET(new Request(`https://x/api/whatsapp/photo/${orderId}?s=${s}`), { params: Promise.resolve({ orderId }) });
const isJpeg = async (res: Response) => { const b = new Uint8Array(await res.arrayBuffer()); return b[0] === 0xff && b[1] === 0xd8; };
it('404s a bad signature without reading the database', async () => { expect((await call('ord1', 'nope')).status).toBe(404); expect(findUnique).not.toHaveBeenCalled(); });
it('converts the first cake photo to JPEG', async () => {
  findUnique.mockResolvedValue({ cakeName: null, cakeImageUrl: null, cakes: [{ cakeName: 'A', cakeImageUrl: null }, { cakeName: 'B', cakeImageUrl: 'https://blob.test/b.webp' }] });
  fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => webp });
  const res = await call('ord1', photoSignature('ord1'));
  expect(res.status).toBe(200); expect(res.headers.get('content-type')).toBe('image/jpeg'); expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  expect(fetchMock.mock.calls[0][0].toString()).toBe('https://blob.test/b.webp'); expect(await isJpeg(res)).toBe(true);
});
it('falls back to a name card when there is no photo', async () => { /* no urls → 200 JPEG, fetch not called */ });
it('falls back to a name card when the fetch fails', async () => { /* fetch rejects, and separately { ok: false } → 200 JPEG */ });
it('escapes awkward cake names', async () => { /* cakeName '<b>&"Cake' with no photo → 200 JPEG */ });
it('404s an unknown order', async () => { /* findUnique → null → 404 */ });
```
- [ ] **Step 2: Run** `npx vitest run tests/whatsappPhoto.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `app/api/whatsapp/photo/[orderId]/route.ts tests/whatsappPhoto.test.ts` — `feat: serve order cake photos as JPEG for WhatsApp`.

---

### Task 9: Setup docs, env and full verification

**Files:**
- Create: `docs/WHATSAPP.md`
- Modify: `.env.example` (block after the `ASSIGNMENT_*` lines), `docs/SMART-BAKERY-ASSIGNMENT.md` (Providers list: add `ASSIGNMENT_AUTO_START`; step 5 of the demo notes that with it on, checkout offers the nearest bakery; link `WHATSAPP.md`)

- [ ] **Step 1: `.env.example`** — commented entries for `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ADMIN_NUMBERS`, `ASSIGNMENT_AUTO_START`, one line each saying what it is and that WhatsApp is off without the first two. No real values.
- [ ] **Step 2: `docs/WHATSAPP.md`** — copy from the spec: the admin's 8 Meta setup steps, the three template texts exactly as in the spec's *Message shapes* table (category Utility, language English, Accept/Reject quick-reply buttons on `order_offer`), the variables table, the pinger (cron-job.org: two jobs, every minute, `POST`, header `Authorization: Bearer <secret>`, URLs `/api/internal/assignments` and `/api/internal/notifications`), the test-number dry run, and the rollout order.
- [ ] **Step 3: Verify** — run each and read the output:
  - `npm run typecheck` → exit 0
  - `npm run lint` → no errors
  - `npx vitest run` → all pass (integration files skip without the env var)
  - scratch DB: `ASSIGNMENT_TEST_DATABASE_URL=… npx vitest run tests/assignment.integration.test.ts tests/whatsapp.integration.test.ts` → all pass
  - `npm run build` → succeeds. If the build needs a DB, point `DATABASE_URL` at the scratch DB (seeded with `npm run db:seed`), never the `.env` production URL.
  - Stop the container: `docker rm -f mmc-wa`.
- [ ] **Step 4: Commit** `docs/WHATSAPP.md .env.example docs/SMART-BAKERY-ASSIGNMENT.md` — `docs: WhatsApp order desk setup`.
