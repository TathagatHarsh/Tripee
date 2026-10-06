# Razorpay Test Payments at Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers pay with Razorpay (test mode) before an order exists; only verified, paid orders reach the admin queue, and failed or cancelled paid orders are refunded.

**Architecture:** Checkout calls `POST /api/payments/intent`, which runs the same validation as `/api/orders` (extracted to `lib/checkoutValidate.ts`) and binds a Razorpay order to the `CheckoutAttempt`. After the Razorpay modal succeeds, `/api/orders` verifies the signature, checks the binding inside `createOrder`'s transaction and stores the payment ids; any failure after a valid signature refunds. `applyStatusTransition` refunds a paid order after a committed cancel. With no keys configured, everything behaves as today.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 on Postgres, zod, vitest, Playwright. Razorpay REST API via `fetch`; `node:crypto` HMAC. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-razorpay-checkout-design.md`

## Global Constraints

- No new npm dependency. Razorpay API base `https://api.razorpay.com/v1`, basic auth `RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET`. Checkout script `https://checkout.razorpay.com/v1/checkout.js`.
- Amounts are integer paise, currency `INR`. Razorpay order `receipt` = the checkout `idempotencyKey` (UUID, 36 chars, under Razorpay's 40 limit). Refunds are always full refunds (`refund(paymentId)`, no amount), which is the only kind the spec needs.
- Signature: `HMAC_SHA256(razorpayOrderId + "|" + razorpayPaymentId, RAZORPAY_KEY_SECRET)` hex, compared with `crypto.timingSafeEqual`.
- `RAZORPAY_KEY_SECRET` is read only in `lib/razorpay.ts`, which starts with `import "server-only"`. The key id reaches the browser only in the intent response.
- `paymentsEnabled()` = both env vars non-empty. When false, `/api/orders` and checkout behave exactly as before this plan, and `/api/payments/intent` returns 404.
- Database: the only `.env` `DATABASE_URL` is production Supabase. Never run a migration or an integration test against it. Scratch Postgres: `docker run --name mmc-e2e --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:latest`, URL `postgresql://postgres:postgres@localhost:5433/postgres`. Integration tests read it from `ASSIGNMENT_TEST_DATABASE_URL` and `describe.skipIf(!url)`. Production gets the migration only on the user's explicit go, after Task 8.
- The payments-off e2e runs (Tasks 3 and 6) need no Razorpay keys in `.env.local`. If the user has already added keys, ask before commenting them out for the run.
- Test mode hint copy, verbatim: `Card 4111 1111 1111 1111, any future expiry, any CVV · UPI success@razorpay`.
- No em dashes in new customer-facing strings.
- After every task: `npx tsc --noEmit`, `npx eslint <touched files>`, `npx vitest run` all clean. `git status`/`git diff` can hang in this repo: commit by explicit path (`git commit -- <paths>`), never `git add -A`, never `git stash`.

## Review Focus

1. **Paid, then the confirm request is lost** (network drop, tab reload during "Confirming payment…"). Pressing the button again must resend the saved proof, not open a second payment. Owned by Task 6 Step 2 (saved proof) and checked by hand in Task 8.
2. **Double click on Pay / two intents for one attempt** must reuse one Razorpay order. Task 3 test `reuses the Razorpay order for the same key and amount`.
3. **Price changes between intent and confirm** must refund and let the customer pay the new amount. Task 4 test `amount mismatch refunds and clears the attempt`; Task 3 test `creates a new Razorpay order when the amount changes`.
4. **Razorpay API down at intent** must say nothing was charged and write no attempt binding. Task 3 test `returns unavailable when Razorpay fails`.
5. **A valid proof replayed when its order already exists** (a retried confirm whose first copy succeeded, or the same key with a changed basket) must never refund a payment an order holds. Task 4 test `never refunds a payment an order already holds`.

---

### Task 1: Payment id columns and scratch database

**Files:**
- Modify: `prisma/schema.prisma` (model `Order`, next to `paymentStatus`)
- Create: `prisma/migrations/9g_razorpay_payment_ids/migration.sql`

**Interfaces:**
- Produces: `Order.razorpayOrderId: string | null` (unique), `Order.razorpayPaymentId: string | null`.

- [ ] **Step 1: Add the columns** to `Order`, replacing the "Hook for Razorpay later" comment on `paymentStatus` with one saying payment is taken by Razorpay when keys are configured and is `none` otherwise:

```prisma
  razorpayOrderId   String? @unique
  razorpayPaymentId String?
```

- [ ] **Step 2: Write the migration** `prisma/migrations/9g_razorpay_payment_ids/migration.sql`:

```sql
ALTER TABLE "Order" ADD COLUMN "razorpayOrderId" TEXT, ADD COLUMN "razorpayPaymentId" TEXT;
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");
```

- [ ] **Step 3: Apply to scratch only.** Start the container (Global Constraints), then:

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx prisma migrate deploy && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx prisma migrate status`
Expected: `9g_razorpay_payment_ids` applied; status "Database schema is up to date".

- [ ] **Step 4: Seed scratch and regenerate the client**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npm run db:seed && npx prisma generate && npx tsc --noEmit`
Expected: seed completes, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/9g_razorpay_payment_ids/migration.sql
git commit -m "feat: Order stores Razorpay order and payment ids" -- prisma/schema.prisma prisma/migrations/9g_razorpay_payment_ids/migration.sql
```

---

### Task 2: Razorpay client and payment proof

**Files:**
- Create: `lib/razorpay.ts`
- Modify: `lib/checkout.ts` (add `PaymentProof`, client-safe)
- Modify: `.env.example` (add `RAZORPAY_KEY_ID=` and `RAZORPAY_KEY_SECRET=` with a one-line comment: test keys from the Razorpay dashboard in Test Mode; leave empty to take no payment)
- Test: `tests/razorpay.test.ts`

**Interfaces:**
- Produces, in `lib/checkout.ts` (importable by client code):
  - `PaymentProof = z.object({ razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]+$/), razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/), razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/) })`, `type PaymentProof`.
- Produces, in `lib/razorpay.ts` (server only):
  - `IntentRecord = z.object({ razorpayOrderId: z.string(), amountPaise: z.number().int().positive() })`, `type IntentRecord`. The shape stored in `CheckoutAttempt.response` between intent and order.
  - `paymentsEnabled(): boolean`
  - `isTestKey(): boolean` (key id starts with `rzp_test_`)
  - `keyId(): string`
  - `verifySignature(proof: PaymentProof): boolean`
  - `paymentMatches(attemptResponse: unknown, proof: PaymentProof, totalPaise: number): boolean` (parses `IntentRecord`; true only when order id and amount both match)
  - `createRazorpayOrder(amountPaise: number, receipt: string): Promise<string | null>` (`POST /orders` with `{ amount, currency: "INR", receipt }`; returns `id`; `null` on non-2xx, network error or a body without `id`; logs `razorpay_order_failed`)
  - `refund(paymentId: string): Promise<boolean>` (`POST /payments/{id}/refund` with `{}`; true on 2xx; logs `refund_failed` otherwise)

- [ ] **Step 1: Write the failing tests** in `tests/razorpay.test.ts`. Mock `server-only` as `tests/delivery.integration.test.ts` does; `vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc")`, `vi.stubEnv("RAZORPAY_KEY_SECRET", "secret")`; stub `fetch` with `vi.stubGlobal`. Good signature: `createHmac("sha256", "secret").update("order_A|pay_B").digest("hex")`.
  - `verifySignature accepts the HMAC of order|payment`: true.
  - `verifySignature rejects a tampered payment id`: same signature with `pay_C` → false.
  - `paymentsEnabled needs both keys`: true with both; false when `RAZORPAY_KEY_SECRET` is `""`.
  - `isTestKey`: true for `rzp_test_abc`, false for `rzp_live_abc`.
  - `paymentMatches binds order id and amount`: record `{ razorpayOrderId: "order_A", amountPaise: 124900 }`, proof for `order_A`, total `124900` → true; total `125000` → false; record for `order_Z` → false; `null` → false.
  - `createRazorpayOrder posts paise, INR and the receipt`: fetch resolves 200 `{ id: "order_A" }` → `"order_A"`; URL `https://api.razorpay.com/v1/orders`; body `{ amount: 124900, currency: "INR", receipt }`; `Authorization` is `Basic ` + base64 `rzp_test_abc:secret`.
  - `createRazorpayOrder returns null when Razorpay fails`: fetch rejects → `null`; fetch 500 → `null`.
  - `refund reports success and failure`: 200 → true, URL ends `/payments/pay_B/refund`; 400 → false.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/razorpay.test.ts`
Expected: FAIL, cannot resolve `../lib/razorpay`.

- [ ] **Step 3: Implement** `lib/razorpay.ts` and `PaymentProof` per Interfaces. Read env inside each function (not at module load) so `vi.stubEnv` works. Use `log` from `lib/log`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/razorpay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/razorpay.ts lib/checkout.ts .env.example tests/razorpay.test.ts
git commit -m "feat: Razorpay order, signature and refund client" -- lib/razorpay.ts lib/checkout.ts .env.example tests/razorpay.test.ts
```

---

### Task 3: Shared checkout validation and the intent endpoint

**Files:**
- Create: `lib/checkoutValidate.ts`
- Create: `lib/checkoutPayment.ts`
- Create: `app/api/payments/intent/route.ts`
- Modify: `app/api/orders/route.ts` (lines 47-123 and 143-301 move out; behaviour unchanged)
- Test: `tests/payments.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 `createRazorpayOrder`, `IntentRecord`, `paymentsEnabled`, `keyId`.
- Produces, `lib/checkoutValidate.ts` (moved from the route, then exported; Next route files may only export handlers):
  - `CREATED` (add `paymentStatus: true, razorpayPaymentId: true` to the select), `type CreatedOrder`, `responseFor(order: CreatedOrder)`, `asJson(value: unknown)`, `payloadHash(value: unknown): Promise<string>`, `type SuccessfulReview`.
  - `type Checked = { body: CheckoutRequest; hash: string; customerName: string; customerPhone: string; review: SuccessfulReview; requestedFor: Date }`
  - `validateCheckout(raw: unknown): Promise<{ kind: "problem"; response: Response } | { kind: "replay"; order: CreatedOrder } | { kind: "checked"; checked: Checked }>`: everything the route does today from the `hasDatabase()` check through the coverage check, same order, same status codes and bodies. `"replay"` is today's completed-attempt branch; the caller still calls `rememberGuestOrders` and responds `{ ...responseFor(order), duplicate: true }`.
- Produces, `lib/checkoutPayment.ts`:
  - `openPaymentIntent(key: string, hash: string, amountPaise: number): Promise<{ kind: "ok"; record: IntentRecord } | { kind: "conflict" } | { kind: "unavailable" }>`

- [ ] **Step 1: Move validation out of the route.** `POST` in `app/api/orders/route.ts` keeps cross-site, rate limit and JSON parsing, calls `validateCheckout(raw)`, and continues from `getViewer()` as today. No behaviour change.

- [ ] **Step 2: Prove the refactor changed nothing.** Scratch running, no Razorpay keys in `.env.local`:

Run: `export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres && npm run build && npm run e2e`
Expected: same pass count as before the change (checkout, happy-path and double-submit specs pass).

- [ ] **Step 3: Write the failing integration tests** in `tests/payments.integration.test.ts` (`describe.skipIf(!process.env.ASSIGNMENT_TEST_DATABASE_URL)`, mock `server-only`, env as Task 2, stub `fetch`; keys are fresh `crypto.randomUUID()`; `afterAll` deletes the suite's `CheckoutAttempt` rows):
  - `creates one Razorpay order and stores the binding`: fetch → `{ id: "order_A" }`; `openPaymentIntent(key, "h1", 124900)` → `{ kind: "ok", record: { razorpayOrderId: "order_A", amountPaise: 124900 } }`; attempt row has `status: "processing"`, `payloadHash: "h1"`, `response` equal to the record.
  - `reuses the Razorpay order for the same key and amount`: same call again → same record; fetch called once in total.
  - `creates a new Razorpay order when the amount changes`: `openPaymentIntent(key, "h1", 125000)` with fetch → `{ id: "order_B" }` → record `order_B` / `125000`.
  - `refuses a different basket on the same key`: `openPaymentIntent(key, "h2", 124900)` → `{ kind: "conflict" }`, fetch not called.
  - `returns unavailable when Razorpay fails`: fresh key, fetch rejects → `{ kind: "unavailable" }`, no attempt row for that key.

- [ ] **Step 4: Run to verify they fail**

Run: `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx vitest run tests/payments.integration.test.ts`
Expected: FAIL, cannot resolve `../lib/checkoutPayment`.

- [ ] **Step 5: Implement `openPaymentIntent`.** Read the attempt; hash differs → conflict; `IntentRecord` in `response` with the same amount and status not `completed` → reuse; otherwise `createRazorpayOrder(amountPaise, key)` (null → unavailable, nothing written), then upsert the attempt (`create`: `payloadHash`, `status: "processing"`, `expiresAt` now + 30 days, `response: record`; `update`: `status: "processing"`, `lastError: null`, `response: record`). No database transaction around the network call; mark the read with `// ponytail: no lock, two concurrent intents can make two Razorpay orders; the last stored wins and the client guards double clicks.`

- [ ] **Step 6: Implement `app/api/payments/intent/route.ts`** `POST`: `paymentsEnabled()` false → 404 `{ error: "Payments are not enabled.", code: "payments_disabled" }`. Then cross-site (403), `rateLimit("payment-intent", callerKey(req), LIMITS.orders)`, JSON parse (400), `validateCheckout`. `problem` → its response. `replay` → `rememberGuestOrders`, 200 `{ ...responseFor(order), duplicate: true }`. `checked` → `openPaymentIntent(body.idempotencyKey, hash, review.totalPaise)`: `conflict` → 409 `idempotency_conflict` (same copy as `/api/orders`); `unavailable` → 502 `{ error: "Payments are unavailable right now. Nothing was charged. Please try again.", code: "payment_unavailable" }`; `ok` → 200 `{ keyId: keyId(), razorpayOrderId, amountPaise }`.

- [ ] **Step 7: Run to verify they pass**, then the whole suite

Run: the Step 4 command, then `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/checkoutValidate.ts lib/checkoutPayment.ts app/api/payments/intent/route.ts app/api/orders/route.ts tests/payments.integration.test.ts
git commit -m "feat: payment intent endpoint sharing checkout validation" -- lib/checkoutValidate.ts lib/checkoutPayment.ts app/api/payments/intent/route.ts app/api/orders/route.ts tests/payments.integration.test.ts
```

---

### Task 4: Verify payment and refund on failure in `/api/orders`

**Files:**
- Modify: `app/api/orders/route.ts`
- Modify: `lib/checkoutPayment.ts`
- Modify: `lib/checkoutValidate.ts` (`responseFor` adds `payment`)
- Modify: `lib/orderReceipt.ts`
- Test: `tests/ordersPayment.test.ts`, `tests/payments.integration.test.ts`, `tests/orderReceipt.test.ts`

**Interfaces:**
- Consumes: Task 2 `PaymentProof`, `verifySignature`, `paymentMatches`, `refund`, `IntentRecord`; Task 3 `validateCheckout`, `CREATED`.
- Produces:
  - `refundUnlessOk(res: Response, key: string, proof: PaymentProof): Promise<Response>` in `lib/checkoutPayment.ts`.
  - `OrderReceipt` gains `payment: z.object({ id: z.string(), paise: z.number().int().nonnegative() }).nullable().optional()`. `responseFor` sets `{ id: razorpayPaymentId, paise: totalPaise }` when `paymentStatus === "paid"`, else `null`.

- [ ] **Step 1: Write the failing route tests** in `tests/ordersPayment.test.ts` (no database: these return before `hasDatabase()`). Mock `server-only`, `../lib/auth` (`getViewer: async () => null`), `../lib/guestOrders` (`rememberGuestOrders: async () => {}`); env as Task 2; call `POST` from `../app/api/orders/route` with `new Request("http://localhost/api/orders", { method: "POST", body })`.
  - `payments on: no proof is 402 payment_required`: body `{}` → 402, `code: "payment_required"`.
  - `payments on: a bad signature is 400 payment_invalid`: `{ idempotencyKey: <uuid>, payment: { razorpayOrderId: "order_A", razorpayPaymentId: "pay_B", razorpaySignature: "0".repeat(64) } }` → 400, `code: "payment_invalid"`, fetch not called.
  - `payments off: a body without proof is not 402`: `RAZORPAY_KEY_SECRET` `""`, body `{}` → status is not 402.

- [ ] **Step 2: Write the failing integration tests** in `tests/payments.integration.test.ts`, `describe("refundUnlessOk")`:
  - `passes a success through untouched`: `new Response("{}", { status: 201 })` → same status, fetch not called.
  - `refunds a failure and clears the attempt`: attempt seeded with `openPaymentIntent` (124900); `Response.json({ error: "That slot has reached its cake capacity.", code: "capacity_unavailable" }, { status: 409 })` → 409, body `refunded: true`, `code: "capacity_unavailable"`, `error` = `We couldn't place the order, so your payment of ₹1,249 has been refunded. That slot has reached its cake capacity.`; fetch called with `/payments/pay_B/refund`; attempt now `status: "failed"`, `lastError: "refunded"`, `response: null`.
  - `amount mismatch refunds and clears the attempt`: same with a 409 `payment_mismatch` response.
  - `never refunds a payment an order already holds`: create an `Order` (minimal required fields: `ref` with prefix `PAY-`, `priceBreakdown: {}`, `totalPaise`, `payablePaise`, `deliverySlot`, `leadHours`) with `razorpayPaymentId: "pay_B"`; a 409 response → returned unchanged, fetch not called. `afterAll` deletes `PAY-` orders.
  - `reports a failed refund honestly`: refund fetch 400 → body `refunded: false`, `error` starts `We couldn't place the order and couldn't refund your payment automatically. Contact us with payment pay_B.`

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run tests/ordersPayment.test.ts` and the Task 3 Step 4 command.
Expected: FAIL.

- [ ] **Step 4: Implement.**
  - `refundUnlessOk`: `res.ok` → return it. An `Order` with this `razorpayPaymentId` exists → return `res`. Otherwise read the attempt's `IntentRecord`, `refund(proof.razorpayPaymentId)`, and on success set the attempt (`where: { id: key, status: { not: "completed" } }`) to `status: "failed"`, `lastError: "refunded"`, `response: Prisma.DbNull`. Return `Response.json({ ...originalBody, refunded, error }, { status: res.status })`. The amount comes from the record via `formatINR` (`lib/format`); with no record the success message is `We couldn't place the order, so your payment has been refunded. {reason}`.
  - Route `POST`, after JSON parse and only when `paymentsEnabled()`: `z.object({ idempotencyKey: z.string().uuid(), payment: PaymentProof }).safeParse(raw)` fails → 402 `{ error: "Payment is required to place this order.", code: "payment_required" }`; `!verifySignature(proof)` → 400 `{ error: "We couldn't verify that payment.", code: "payment_invalid" }`. The rest of the handler becomes a local `place(raw, proof: PaymentProof | null): Promise<Response>`; return `refundUnlessOk(await place(raw, proof), idempotencyKey, proof)`. An exception escaping `place` is caught and turned into the existing 500 body before `refundUnlessOk`.
  - `createOrder` gets `payment: PaymentProof | null`. Inside the transaction, after the replay check and before the upsert: `payment && !paymentMatches(previous?.response, payment, input.review.totalPaise)` → `throw new PaymentMismatch()`, mapped in `POST` to 409 `{ error: "The order total changed while you were paying.", code: "payment_mismatch" }`. Order data: `paymentStatus: payment ? "paid" : "none"`, `razorpayOrderId` and `razorpayPaymentId` from the proof.
  - `OrderReceipt` and `responseFor` per Interfaces. In `tests/orderReceipt.test.ts`: a receipt with `payment: { id: "pay_B", paise: 124900 }` parses; one without `payment` still parses.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run` and the Task 3 Step 4 command.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/orders/route.ts lib/checkoutPayment.ts lib/checkoutValidate.ts lib/orderReceipt.ts tests/ordersPayment.test.ts tests/payments.integration.test.ts tests/orderReceipt.test.ts
git commit -m "feat: orders require a verified Razorpay payment and refund on failure" -- app/api/orders/route.ts lib/checkoutPayment.ts lib/checkoutValidate.ts lib/orderReceipt.ts tests/ordersPayment.test.ts tests/payments.integration.test.ts tests/orderReceipt.test.ts
```

---

### Task 5: Refund a paid order when it is cancelled

**Files:**
- Modify: `lib/orderTransition.ts`
- Modify: `lib/checkoutPayment.ts`
- Test: `tests/payments.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 `refund`.
- Produces: `refundCancelledOrder(ref: string): Promise<void>` in `lib/checkoutPayment.ts`.

- [ ] **Step 1: Write the failing tests**, `describe("refund on cancel")`, with `applyStatusTransition` from `../lib/orderTransition`:
  - `cancelling a paid order refunds it`: `PAY-` order, `status: "confirmed"`, `paymentStatus: "paid"`, `razorpayPaymentId: "pay_C"`; fetch 200; `applyStatusTransition(ref, "cancelled", null, "Customer asked")` → true; `paymentStatus` now `"refunded"`; fetch URL ends `/payments/pay_C/refund`.
  - `a failed refund leaves the order paid`: fetch 400 → transition still true, status `cancelled`, `paymentStatus` still `"paid"`.
  - `an unpaid cancel calls nothing`: `paymentStatus: "none"` → fetch not called.

- [ ] **Step 2: Run to verify they fail** (Task 3 Step 4 command). Expected: FAIL on the refund assertions.

- [ ] **Step 3: Implement.** In `applyStatusTransition`, keep the transaction result in `moved`; after it resolves, `if (moved && to === "cancelled") await refundCancelledOrder(ref)`, then return `moved`. `refundCancelledOrder` loads `paymentStatus` and `razorpayPaymentId`; only when `paid` with an id, calls `refund`; on success `updateMany({ where: { ref, paymentStatus: "paid" }, data: { paymentStatus: "refunded" } })`. It never throws (log and return), so a Razorpay outage cannot fail a cancel that has already committed.

- [ ] **Step 4: Run to verify they pass**, plus `tests/delivery.integration.test.ts` and `tests/assignment.integration.test.ts` (same env), which also drive `applyStatusTransition`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orderTransition.ts lib/checkoutPayment.ts tests/payments.integration.test.ts
git commit -m "feat: cancelling a paid order refunds it" -- lib/orderTransition.ts lib/checkoutPayment.ts tests/payments.integration.test.ts
```

---

### Task 6: Checkout page pays with Razorpay

**Files:**
- Create: `components/shop/payWithRazorpay.ts`
- Modify: `app/checkout/page.tsx`
- Modify: `app/checkout/CheckoutForm.tsx` (Props line 109, `keyFor`/`place` lines 263-375, submit button 795-806, summary 905-916)
- Modify: `components/shop/OrderPlaced.tsx`

**Interfaces:**
- Consumes: Task 2 `PaymentProof`, `paymentsEnabled`, `isTestKey`; Task 3 intent response `{ keyId, razorpayOrderId, amountPaise }` or a replay carrying `order`; Task 4 `refunded` flag and `Receipt.payment`.
- Produces:
  - `payWithRazorpay(opts: { keyId: string; razorpayOrderId: string; amountPaise: number; name: string; phone: string; email?: string }): Promise<{ kind: "paid"; proof: PaymentProof } | { kind: "dismissed" } | { kind: "failed"; message: string } | { kind: "unavailable" }>`. Loads `checkout.js` once by appending a `<script>` (`unavailable` on `onerror` or when `window.Razorpay` is missing); opens the modal with `key`, `order_id`, `amount`, `currency: "INR"`, `name: "MakeMyCake"`, `prefill: { name, contact: phone, email }`; `handler` → `paid` (map the `razorpay_*` fields to `PaymentProof`), `modal.ondismiss` → `dismissed`, `payment.failed` → `failed` with `error.description`.
  - `CheckoutForm` Props gain `payments: { enabled: boolean; testMode: boolean }`; `app/checkout/page.tsx` passes `{ enabled: paymentsEnabled(), testMode: isTestKey() }`.

- [ ] **Step 1: Write `payWithRazorpay`** per Interfaces.

- [ ] **Step 2: Two-step `place()` when `payments.enabled`** (unchanged path when not):
  1. Saved proof: extend the `makemycake.checkoutAttempt` localStorage object to `{ signature, key, proof? }`. If a proof exists for the current key, skip to 4.
  2. Stage `"paying"`: `POST /api/payments/intent` with the same JSON `/api/orders` gets. Not ok → `setError(data.error ?? "We couldn't start the payment. Nothing has been charged.")`, stop. A response carrying `order` → existing success path (it was already placed).
  3. `payWithRazorpay`. `dismissed` → `Payment cancelled. Nothing was charged.`; `failed` → its message; `unavailable` → `We couldn't open the payment window. Check your connection or turn off ad blockers, then try again.`; `paid` → save the proof with the attempt.
  4. Stage `"confirming"`: `POST /api/orders` with `payment: proof`. Not ok → show `data.error`; when `typeof data.refunded === "boolean"`, drop the saved proof. Network error → keep the proof; message `We couldn't confirm your order. Your payment is safe. Press the button again to finish; you won't be charged twice.` Success → existing receipt path, which already clears the attempt.

- [ ] **Step 3: Copy and layout** (payments enabled only; disabled renders exactly as today):
  - New last form section before the errors, same `checkout-section ${sCard}` wrapper, heading `Payment`, text `Pay securely with Razorpay · UPI, cards, netbanking`. In test mode, a `Test mode` badge and the hint copy from Global Constraints.
  - Button: `"paying"` → `Opening payment…`; `"confirming"` → `Confirming payment…`; saved proof → `Finish placing order`; otherwise `Pay ${formatINR(quote.totalPaise)}` (`Pay` with no quote).
  - Summary: label `To pay` instead of `Total`; note `Verified with the bakery. You'll be charged once, when you pay.`
  - `OrderPlaced`: when `receipt.payment`, a line `Paid ${formatINR(receipt.payment.paise)} · ${receipt.payment.id}`.

- [ ] **Step 4: Verify payments-off is unchanged**

Run: `npx tsc --noEmit && npx eslint app/checkout components/shop/payWithRazorpay.ts components/shop/OrderPlaced.tsx`, then the Task 3 Step 2 e2e command.
Expected: clean; e2e pass count unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/shop/payWithRazorpay.ts app/checkout/page.tsx app/checkout/CheckoutForm.tsx components/shop/OrderPlaced.tsx
git commit -m "feat: checkout pays with Razorpay" -- components/shop/payWithRazorpay.ts app/checkout/page.tsx app/checkout/CheckoutForm.tsx components/shop/OrderPlaced.tsx
```

---

### Task 7: Payment status on order pages

**Files:**
- Modify: `app/admin/orders/[ref]/page.tsx` (Payment row, lines 248-260) and `app/admin/orders/[ref]/data.ts` if its query selects fields explicitly
- Modify: `app/orders/[ref]/page.tsx` (summary note, lines 266-273) and `app/orders/data.ts` if its query selects fields explicitly

**Interfaces:**
- Consumes: Task 1 columns.

- [ ] **Step 1: Admin Payment row.** `none` → unchanged (`Nothing taken online — on delivery`). `paid` → `Paid · {razorpayPaymentId}`. `refunded` → `Refunded · {razorpayPaymentId}`. `status === "cancelled" && paymentStatus === "paid"` → `Paid, not refunded. Refund it from the Razorpay dashboard.` Update the comment above the row; it no longer holds that nothing is paid online.

- [ ] **Step 2: Customer order page note.** `none` → unchanged text and comment. `paid` → `Paid ${formatINR(totalPaise)} online with Razorpay.` `refunded` → `Refunded ${formatINR(totalPaise)} to your original payment method. Refunds take 5 to 7 working days to reach you.`

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint "app/admin/orders/[ref]" "app/orders/[ref]" && npx vitest run`
Expected: clean. Visual check is Task 8.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/orders/[ref]" "app/orders/[ref]" app/orders/data.ts
git commit -m "feat: order pages show payment and refund status" -- "app/admin/orders/[ref]" "app/orders/[ref]" app/orders/data.ts
```

---

### Task 8: Demo run with test keys

Needs the user first: they create a Razorpay account, switch to Test Mode, generate keys, and write `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` into `.env.local` themselves.

- [ ] **Step 1: Run the app against scratch.** Add a `makemycake-scratch` entry to `.claude/launch.json` (`npm run dev`, port 3000, env `DATABASE_URL` = scratch URL, `SERVICE_AREA=hyderabad`) and start it with `preview_start`.

- [ ] **Step 2: Walk the flows in the browser pane** (Hyderabad address, any cake):
  - Card `4111 1111 1111 1111` → placed screen shows `Paid ₹… · pay_…`; the order is in `/admin/orders` with Payment `Paid · pay_…`.
  - UPI `success@razorpay` → same.
  - UPI `failure@razorpay` → error shown, button re-enabled, no order created.
  - Close the modal → `Payment cancelled. Nothing was charged.`
  - Pay, then go offline before confirm (DevTools offline or stop the server mid-request) → the network message, then `Finish placing order` completes with no second payment.
  - Cancel a paid order in admin → Payment `Refunded · pay_…`; the Razorpay test dashboard shows the refund.
  - Assign to a vendor, reject with a reason in `/vendor` → admin sees the reason; payment stays `Paid`.

- [ ] **Step 3: Report** each check with a screenshot or the page text, including any that failed.

- [ ] **Step 4: Production migration, only on the user's explicit go.** `npx prisma migrate deploy` against the `.env` URL applies `9g_razorpay_payment_ids`. Not part of this plan's completion.
