# Order Confirmation Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email the customer once, from `orders@makeyourcakes.com`, when their order becomes `confirmed` and they gave an email at checkout.

**Architecture:** A new `lib/orderEmail.ts` renders the email and upserts one `NotificationOutbox` row (`channel: "email"`) inside the confirming transaction, mirroring `whatsappNewOrder`/`queueWhatsApp`. The existing dispatcher routes `email` rows to a new `lib/email.ts`, which makes one `fetch` to Resend. No migration, no new dependency.

**Tech Stack:** Next.js, TypeScript, Prisma, Vitest, Resend REST API.

**Spec:** `docs/superpowers/specs/2026-11-11-order-confirmation-email-design.md`

## Global Constraints

- From: `process.env.EMAIL_FROM` (production value `MakeYourCakes <orders@makeyourcakes.com>`); Reply-To: `hello@makeyourcakes.com`.
- Feature is off (nothing queued) when `RESEND_API_KEY` is unset.
- Subject exactly: `Your MakeYourCakes order <ref> is confirmed`.
- Tracking link: `${process.env.NEXT_PUBLIC_SITE_URL}/orders/<ref>`.
- Dedupe key: `email:order:<orderId>:confirmed`. Outbox `kind`: `new_order`.
- No schema change, no new npm dependency, tests never call the real Resend API, integration tests only against `ASSIGNMENT_TEST_DATABASE_URL` (scratch Postgres, never production).
- Logs never contain the full email address or the email body.

**Deviation from spec (decided while planning):** trigger 3 (custom-cake quote paid, `lib/customRequests.ts`) is dropped. `CustomRequest` stores only name and phone, and the order it creates has no `customerEmail`, so the call could never send. Collecting an email on the custom-request form is a separate change.

## Review Focus

1. Customer name/notes containing `<script>` or `&` — html part must show them escaped, text part verbatim. (Task 1 test.)
2. Whitespace-only or empty `customerEmail` — must queue nothing. (Task 1 test.)
3. Same order confirmed twice (retry / replayed checkout) — still exactly one email row. (Task 1 unit via upsert, Task 3 integration.)
4. Resend returns 429/5xx — row goes `failed` and retries via existing backoff; order unaffected. (Task 2 test.)
5. Pickup order (no address) — email says pickup and omits the address block. (Task 1 test.)

---

### Task 1: Render and queue the confirmation email

**Files:**
- Create: `lib/orderEmail.ts`
- Test: `tests/orderEmail.test.ts`

**Interfaces:**
- Consumes: `outboxCreate` from `lib/notifications.ts`; `formatINR` from `lib/format.ts`; `formatDue` from `lib/whatsappMessages.ts`.
- Produces:
  - `export interface ConfirmationFacts { ref: string; customerName: string | null; cakes: string[]; totalPaise: number; pickup: boolean; dueAt: Date | null; slot: string | null; address: string | null; }`
  - `export interface RenderedEmail { subject: string; text: string; html: string }`
  - `export function orderConfirmationEmail(f: ConfirmationFacts): RenderedEmail`
  - `export function emailConfigured(): boolean` — `Boolean(process.env.RESEND_API_KEY)`
  - `export async function queueOrderConfirmationEmail(tx: Prisma.TransactionClient, orderId: string): Promise<boolean>` — true when a row was upserted.
  - No email-masking helper: the dispatcher's logs carry only row id, kind and error code, never `destination`; keep it that way.

- [ ] **Step 1: Write the failing tests** (`vi.mock('server-only', () => ({}))`; `tx` is a plain object with `order.findUniqueOrThrow` and `notificationOutbox.upsert` as `vi.fn()`)

```ts
const facts = { ref: 'MYC-ABC123', customerName: 'Asha <b>&</b>', cakes: ['Chocolate truffle · 1 kg'], totalPaise: 129900, pickup: false, dueAt: new Date('2026-11-12T10:30:00Z'), slot: 'morning', address: '12 MG Road, Hyderabad, Telangana, 500001' };

it('subject, total, ref, cake, address and tracking link', () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://makeyourcakes.com');
  const e = orderConfirmationEmail(facts);
  expect(e.subject).toBe('Your MakeYourCakes order MYC-ABC123 is confirmed');
  for (const part of [e.text, e.html]) {
    expect(part).toContain('MYC-ABC123'); expect(part).toContain('1,299');
    expect(part).toContain('Chocolate truffle'); expect(part).toContain('12 MG Road');
    expect(part).toContain('https://makeyourcakes.com/orders/MYC-ABC123');
  }
});
it('escapes customer text in html only', () => {
  const e = orderConfirmationEmail(facts);
  expect(e.html).toContain('Asha &lt;b&gt;&amp;&lt;/b&gt;'); expect(e.html).not.toContain('<b>&</b>');
  expect(e.text).toContain('Asha <b>&</b>');
});
it('pickup says pickup and has no address', () => {
  const e = orderConfirmationEmail({ ...facts, pickup: true, address: null });
  expect(e.text).toMatch(/pick ?up/i); expect(e.text).not.toContain('12 MG Road');
});
it('queues nothing without RESEND_API_KEY, or with a blank email', async () => {
  /* no key */ expect(await queueOrderConfirmationEmail(tx, 'o1')).toBe(false);
  vi.stubEnv('RESEND_API_KEY', 're_test'); order.customerEmail = '   ';
  expect(await queueOrderConfirmationEmail(tx, 'o1')).toBe(false);
  expect(tx.notificationOutbox.upsert).not.toHaveBeenCalled();
});
it('upserts one email row keyed on the order', async () => {
  vi.stubEnv('RESEND_API_KEY', 're_test'); order.customerEmail = ' Asha@Example.com ';
  expect(await queueOrderConfirmationEmail(tx, 'o1')).toBe(true);
  const arg = tx.notificationOutbox.upsert.mock.calls[0][0];
  expect(arg.where).toEqual({ dedupeKey: 'email:order:o1:confirmed' });
  expect(arg.update).toEqual({});
  expect(arg.create).toMatchObject({ orderId: 'o1', kind: 'new_order', channel: 'email', destination: 'asha@example.com' });
  expect(arg.create.payload.subject).toContain('is confirmed');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/orderEmail.test.ts` — Expected: FAIL, module `../lib/orderEmail` not found.

- [ ] **Step 3: Implement `lib/orderEmail.ts`** (`import "server-only"`). `queueOrderConfirmationEmail` loads the order with `select: { ref, customerName, customerEmail, cakeName, totalPaise, fulfillmentMethod, dueAt, requestedFor, deliverySlot, addressLine1, addressLine2, city, state, pincode, cakes: { orderBy: { position: 'asc' }, select: { cakeName: true } } }`; `cakes` = non-null `cakes[].cakeName`, falling back to `[cakeName]`; `dueAt ?? requestedFor`; address = non-empty parts joined with `, ` (null for pickup). Destination is `customerEmail.trim().toLowerCase()`. Write with `tx.notificationOutbox.upsert({ where: { dedupeKey }, update: {}, create: outboxCreate({...}) })`, exactly like `queueWhatsApp`. Escape `& < > " '` in every interpolated value of the html part. Plain inline-styled html, no images.

- [ ] **Step 4: Run** `npx vitest run tests/orderEmail.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit** `git add lib/orderEmail.ts tests/orderEmail.test.ts && git commit -m "feat: render and queue order confirmation email"`

---

### Task 2: Send email rows through Resend

**Files:**
- Create: `lib/email.ts`
- Modify: `lib/notifications.ts:12` (channel union), `lib/notifications.ts:94` (dispatch branch)
- Test: `tests/email.test.ts`, `tests/notifications.test.ts` (one new case)

**Interfaces:**
- Consumes: `RenderedEmail` (Task 1) as the row payload.
- Produces: `export async function sendEmail(row: { id: string; destination: string | null; payload: Prisma.JsonValue }): Promise<void>`; `OutboxInput.channel` becomes `"webhook" | "whatsapp" | "email"`.

- [ ] **Step 1: Write the failing tests** (`fetch` stubbed with `vi.stubGlobal`, as in `tests/notifications.test.ts`)

```ts
const row = { id: 'n1', destination: 'asha@example.com', payload: { subject: 'S', text: 'T', html: '<p>H</p>' } };
beforeEach(() => { vi.stubEnv('RESEND_API_KEY', 're_test'); vi.stubEnv('EMAIL_FROM', 'MakeYourCakes <orders@makeyourcakes.com>'); fetchMock.mockResolvedValue({ ok: true, status: 200 }); });

it('posts one Resend email with idempotency key, from and reply-to', async () => {
  await sendEmail(row);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(init.method).toBe('POST');
  expect(init.headers.authorization).toBe('Bearer re_test');
  expect(init.headers['idempotency-key']).toBe('n1');
  expect(JSON.parse(init.body)).toEqual({ from: 'MakeYourCakes <orders@makeyourcakes.com>', to: ['asha@example.com'], reply_to: 'hello@makeyourcakes.com', subject: 'S', text: 'T', html: '<p>H</p>' });
});
it('maps failures to error codes', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 429 });
  await expect(sendEmail(row)).rejects.toThrow('email_provider_429');
  await expect(sendEmail({ ...row, destination: null })).rejects.toThrow('email_destination_missing');
  vi.stubEnv('RESEND_API_KEY', '');
  await expect(sendEmail(row)).rejects.toThrow('email_provider_unconfigured');
});
```

In `tests/notifications.test.ts` add: `it('routes email rows to Resend', ...)` — set `row.channel = 'email'`, `row.destination = 'asha@example.com'`, `row.payload = { subject: 'S', text: 'T', html: 'H' }`, stub `RESEND_API_KEY`/`EMAIL_FROM`; expect `{ sent: 1, failed: 0 }` and `fetchMock.mock.calls[0][0] === 'https://api.resend.com/emails'`. And a 503 response gives `{ sent: 0, failed: 1 }` with `row.lastError === 'email_provider_503'`.

- [ ] **Step 2: Run** `npx vitest run tests/email.test.ts tests/notifications.test.ts` — Expected: FAIL (module missing; email row sent to the webhook).

- [ ] **Step 3: Implement** `lib/email.ts` (`import "server-only"`, headers lower-case as in `sendWebhook`, `cache: "no-store"`, `signal: AbortSignal.timeout(10_000)`, reply-to constant `hello@makeyourcakes.com`). In `dispatchPendingNotifications` replace the ternary with: `email` → `sendEmail`, `whatsapp` → `sendWhatsAppRow`, else `sendWebhook`.

- [ ] **Step 4: Run** `npx vitest run tests/email.test.ts tests/notifications.test.ts` — Expected: PASS, all existing notification tests still pass.

- [ ] **Step 5: Commit** `git add lib/email.ts lib/notifications.ts tests/email.test.ts tests/notifications.test.ts && git commit -m "feat: deliver email outbox rows through Resend"`

---

### Task 3: Queue the email where orders become confirmed

**Files:**
- Modify: `lib/placeOrder.ts` (after `await whatsappNewOrder(tx, order.id);`, ~line 461)
- Modify: `lib/orderTransition.ts` (just before `await whatsappOrderStatus(...)`, ~line 124)
- Test: `tests/ordersPayment.integration.test.ts`, `tests/whatsapp.integration.test.ts`

**Interfaces:**
- Consumes: `queueOrderConfirmationEmail(tx, orderId)` (Task 1).

- [ ] **Step 1: Write the failing integration tests** (both files already `describe.skipIf(!url)` on `ASSIGNMENT_TEST_DATABASE_URL`; stub `RESEND_API_KEY='re_test'` in the new tests)

- `ordersPayment.integration.test.ts`: `it('queues one confirmation email for a paid delivery order with an email')` — post the file's existing paid delivery `body` with `fulfillment.contactEmail: 'asha@example.com'`; expect `db.notificationOutbox.count({ where: { orderId, channel: 'email' } })` to be `1` and the row's `destination` `'asha@example.com'`; replay the same request (same idempotency key) and expect the count still `1`. Without `contactEmail`, count is `0`.
- `whatsapp.integration.test.ts`: `it('queues the confirmation email when a pickup order is confirmed')` — from `fixture()`, set the order to `status: 'draft', fulfillmentMethod: 'pickup', customerEmail: 'asha@example.com'`; `applyStatusTransition` to `confirmed`; expect exactly one `channel: 'email'` row with `dedupeKey: 'email:order:<id>:confirmed'`.

- [ ] **Step 2: Run** `ASSIGNMENT_TEST_DATABASE_URL=<scratch url> npx vitest run tests/ordersPayment.integration.test.ts tests/whatsapp.integration.test.ts` — Expected: the two new tests FAIL (count 0). Start the scratch Postgres per the project's e2e notes; never point this at production.

- [ ] **Step 3: Add the calls** — `placeOrder`: `if (input.fulfillment.method === "delivery") await queueOrderConfirmationEmail(tx, order.id);` `orderTransition`: `if (to === "confirmed") await queueOrderConfirmationEmail(tx, order.id);`

- [ ] **Step 4: Run** the same command — Expected: PASS. Then `npm test` and `npx tsc --noEmit` — Expected: all green, no type errors.

- [ ] **Step 5: Commit** `git add lib/placeOrder.ts lib/orderTransition.ts tests/ordersPayment.integration.test.ts tests/whatsapp.integration.test.ts && git commit -m "feat: email customers when their order is confirmed"`

---

### Task 4: Configuration docs and go-live checklist

**Files:**
- Modify: `.env.example` (add `RESEND_API_KEY=` and `EMAIL_FROM="MakeYourCakes <orders@makeyourcakes.com>"` with a one-line comment each)
- Create: `docs/EMAIL.md` — the manual go-live steps below, nothing else.

- [ ] **Step 1: Write `docs/EMAIL.md`** with these steps, in order:
  1. Zoho admin → Users → hello@ → add email alias `orders@makeyourcakes.com`.
  2. Resend → create account → Domains → add `makeyourcakes.com` (region closest to India).
  3. GoDaddy DNS → add exactly the records Resend shows: TXT `resend._domainkey`, MX `send` (priority 10), TXT `send` SPF. Do **not** edit root MX or the root SPF (Zoho).
  4. Resend → Verify domain; create an API key (sending access, this domain only).
  5. Production env → set `RESEND_API_KEY`, `EMAIL_FROM`; redeploy.
  6. Place one real delivery order with your email; confirm the email arrives from orders@, and Gmail "Show original" shows DKIM pass for makeyourcakes.com.
- [ ] **Step 2: Commit** `git add .env.example docs/EMAIL.md && git commit -m "docs: order confirmation email setup"`
