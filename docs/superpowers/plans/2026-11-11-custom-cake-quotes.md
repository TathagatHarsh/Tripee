# Custom Cake Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer submits a custom-cake request on `/custom-cakes`, the nearest bakery quotes on WhatsApp, the customer gets quote + margin on WhatsApp, pays on `/c/<token>`, and the request becomes a normal pre-accepted order.

**Architecture:** New `CustomRequest` table with its own small state machine, in `lib/customRequests.ts` (DB side) and `lib/customRules.ts` (pure rules). WhatsApp offers and quotes go through the existing outbox (`queueWhatsApp`), and inbound replies are routed in `lib/whatsappInbound.ts`. Payment reuses `openPaymentIntent` / `refundPayment` / `recoverPayment`. On payment one transaction creates an `Order` plus an `ACCEPTED` `VendorOrder`, so everything downstream is the existing order flow.

**Tech Stack:** Next.js App Router, Prisma/Postgres, zod, vitest, Razorpay, WhatsApp Cloud API, Vercel Blob.

**Spec:** `docs/superpowers/specs/2026-11-11-custom-cake-quotes-design.md`

## Global Constraints

- Customer and bakery never see each other's name, phone or street address before payment. The bakery sees `address.locality` (or `city` when there is no locality) only.
- Customer price = `ceil(vendorQuotePaise × (100 + customMarginPct) / 100 / 1000) × 1000` (rounded up to the next ₹10). `customMarginPct` default **15**.
- Bakery quote must be ₹100–₹1,00,000 (`10_000`–`10_000_000` paise), whole rupees.
- Offer window: `CUSTOM_OFFER_MINUTES` env, default **60**, allowed 5–1440. Max **3** bakeries per request.
- Quote valid until the earlier of 24 h after quoting and `dueAt − vendor.preparationMinutes`.
- Sizes: 0.5, 1, 1.5, 2, 3, 4, 5 kg. Full payment upfront.
- Refs `CR-` + 6 uppercase base32 chars. Token: `randomBytes(24).toString("base64url")`.
- Button payloads: bakery decline `cq_no:<requestId>`, customer decline `cq_decline:<requestId>`.
- Template names: `custom_offer`, `custom_quote`.
- The whole feature is hidden unless `whatsappConfigured()`. Then `/custom-cakes` keeps today's `wa.me` button.
- Production DB is live: the migration is created with `prisma migrate dev --create-only` against the **scratch** DB only. Never run `migrate deploy` on prod; the user does that.
- Integration tests run on scratch Postgres via `ASSIGNMENT_TEST_DATABASE_URL`, following `tests/whatsapp.integration.test.ts`.

## Review Focus

1. **Two payments race** (client callback and webhook at once, or a double tap): exactly one `Order`, and no refund of the payment that bought it. Covered by a test in Task 7.
2. **A bakery quoting on an offer that has already expired or moved on** gets "That request isn't waiting on you any more"; no quote is stored. Test in Task 5.
3. **A customer whose number also belongs to a bakery:** bakery routing wins; customer routing only applies to non-bakery numbers. Test in Task 5.
4. **The date is too soon for any bakery's `preparationMinutes`:** that bakery is skipped, and with none left the request goes to `no_bakery` rather than offering an impossible cake. Test in Task 3.
5. **Prices typed with spaces, commas, `₹`, `Rs.` or a ref in either order** are parsed; decimals and anything else are not treated as quotes. Test in Task 2.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (new enum + model; `BakerySettings`; `NotificationOutbox`; `NotificationKind`; back-relations on `Vendor` and `Order`)
- Create: `prisma/migrations/<timestamp>_custom_requests/migration.sql` (generated)
- Modify: `lib/notifications.ts` (`OutboxInput.orderId` optional, add `customRequestId?`)
- Modify: `lib/whatsappMessages.ts` (`queueWhatsApp` input: `orderId?: string | null; customRequestId?: string | null`)

**Interfaces:**
- Produces: Prisma `CustomRequest`, `CustomRequestStatus`; `NotificationKind.custom_request`; `BakerySettings.customMarginPct`; `queueWhatsApp(tx, { orderId?, customRequestId?, vendorId?, kind, to, dedupeKey, message })`.

- [ ] **Step 1:** Add exactly the model and enum from the spec's "Data model" section.
  - Add `customRequests CustomRequest[]` to `Vendor`, and `customRequest CustomRequest?` to `Order`.
  - Add `customMarginPct Int @default(15)` to `BakerySettings`.
  - In `NotificationOutbox`: make `orderId String?` and `order Order?`; add `customRequestId String?` with relation `onDelete: Cascade` and `@@index([customRequestId])`.
  - Append `custom_request` to `NotificationKind`.
- [ ] **Step 2:** Run `npx prisma validate`. Expected: "The schema at prisma/schema.prisma is valid".
- [ ] **Step 3:** Generate the migration against scratch only:
  `DATABASE_URL=$ASSIGNMENT_TEST_DATABASE_URL npx prisma migrate dev --create-only --name custom_requests`
  Then apply it there: `DATABASE_URL=$ASSIGNMENT_TEST_DATABASE_URL npx prisma migrate deploy`.
  Expected: the SQL contains `ALTER COLUMN "orderId" DROP NOT NULL`, with no `DROP TABLE` and no `DROP COLUMN`.
- [ ] **Step 4:** Make `outboxCreate` and `queueWhatsApp` pass `orderId ?? null` and `customRequestId ?? null`. Run `npx tsc --noEmit`. Fix every place that read `notification.orderId` as non-null (expected: the dispatcher and admin views). Expected: 0 errors.
- [ ] **Step 5:** Run `npm test`. Expected: all existing tests pass.
- [ ] **Step 6:** Commit: `feat: CustomRequest schema and outbox rows without an order`.

### Task 2: Pure rules

**Files:**
- Create: `lib/customRules.ts` (no `server-only`, no DB)
- Test: `tests/customRules.test.ts`

**Interfaces:**
- Produces:
  - `CUSTOM_SIZES_KG: readonly number[]`, `MAX_BAKERIES = 3`, `QUOTE_MIN_PAISE = 10_000`, `QUOTE_MAX_PAISE = 10_000_000`
  - `parseQuoteReply(text: string): { kind: "quote"; paise: number; ref?: string } | { kind: "out_of_range" } | null`
  - `customerPricePaise(vendorPaise: number, marginPct: number): number`
  - `customOfferMinutes(): number` (throws on an invalid env, like `offerExpiresAt`)
  - `quoteExpiresAt(now: Date, dueAt: Date, preparationMinutes: number): Date`
  - `canMoveCustom(from: CustomRequestStatus, to: CustomRequestStatus): boolean`
  - `newCustomRef(): string`, `newCustomToken(): string`

- [ ] **Step 1: Write failing tests.**
```ts
expect(parseQuoteReply("1800")).toEqual({ kind: "quote", paise: 180000 });
expect(parseQuoteReply("₹1,800")).toEqual({ kind: "quote", paise: 180000 });
expect(parseQuoteReply("Rs. 1,800 cr-ab12cd")).toEqual({ kind: "quote", paise: 180000, ref: "CR-AB12CD" });
expect(parseQuoteReply("CR-AB12CD rs 2500")).toEqual({ kind: "quote", paise: 250000, ref: "CR-AB12CD" });
expect(parseQuoteReply("50")).toEqual({ kind: "out_of_range" });
expect(parseQuoteReply("200000")).toEqual({ kind: "out_of_range" });
for (const junk of ["1800.50", "started", "1800 for 2kg", "", "call me"]) expect(parseQuoteReply(junk)).toBeNull();
expect(customerPricePaise(180000, 15)).toBe(207000);   // 2070 exactly
expect(customerPricePaise(180100, 15)).toBe(208000);   // 2071.15 → 2080
expect(customerPricePaise(100000, 0)).toBe(100000);
const now = new Date("2026-11-11T10:00:00Z");
expect(quoteExpiresAt(now, new Date("2026-11-20T10:00:00Z"), 240)).toEqual(new Date("2026-11-12T10:00:00Z"));
expect(quoteExpiresAt(now, new Date("2026-11-11T20:00:00Z"), 240)).toEqual(new Date("2026-11-11T16:00:00Z"));
expect(canMoveCustom("awaiting_quote", "quoted")).toBe(true);
expect(canMoveCustom("quoted", "paid")).toBe(true);
expect(canMoveCustom("paid", "cancelled")).toBe(false);
expect(canMoveCustom("declined", "quoted")).toBe(false);
expect(newCustomRef()).toMatch(/^CR-[A-Z2-7]{6}$/);
expect(newCustomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
```
  Also test that `customOfferMinutes()` defaults to 60 and throws for `CUSTOM_OFFER_MINUTES=2`.
- [ ] **Step 2:** Run `npx vitest run tests/customRules.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Allowed moves:
  - `awaiting_quote → quoted | no_bakery | cancelled`
  - `quoted → paid | declined | expired | cancelled`
  - all other statuses are terminal

  `parseQuoteReply`: lower-case; pull out at most one `\bcr-[a-z0-9]+\b` ref; remove `₹`, `rs.`, `rs`, `inr`, commas and whitespace. What remains must match `^\d+$`, otherwise return `null`. Ref randomness uses `crypto.getRandomValues`, mapped to the base32 alphabet `A-Z2-7`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: custom quote rules`.

### Task 3: Choosing the nearest bakery

**Files:**
- Modify: `lib/assignment.ts`. Extract the vendor-level checks from `assignmentCandidates` (inactive, no location, not accepting, unavailable, at capacity) into an exported helper, and call it there.
- Create: `lib/customRequests.ts` (starts with `nextBakery`)
- Test: `tests/customRequests.integration.test.ts`

**Interfaces:**
- Produces:
  - `export async function vendorBlockers(tx: Tx | typeof db, vendor: Vendor, now: Date): Promise<string[]>` in `lib/assignment.ts`, with the same reason strings as today
  - `export async function nextBakery(tx: Tx, request: CustomRequest): Promise<{ vendor: Vendor; distanceKm: number } | null>` in `lib/customRequests.ts`

`nextBakery` rules:
- Skip vendors in `triedVendorIds`.
- `vendorBlockers` must be empty.
- The straight-line distance (`haversine`/`pointFrom`) from the vendor to `address` (lat/lng) must be ≤ `serviceRadiusKm`.
- `meetsDeadline(dueAt, preparationMinutes, distanceKm / 20 * 60)` must hold.
- Return the nearest. Distance Matrix is not used here: a quote is not a route promise.

- [ ] **Step 1: Write failing integration tests.** Fixture: 3 vendors 0.1/1/30 km away, with radius 20.
  - The nearest vendor is returned.
  - With the nearest in `triedVendorIds`, the next one is returned.
  - The 30 km vendor is never returned.
  - A vendor with `locationSetAt: null` is skipped.
  - Review Focus #4: with `dueAt` 1 h away and every vendor at `preparationMinutes: 240`, the result is `null`.
- [ ] **Step 2:** Run `ASSIGNMENT_TEST_DATABASE_URL=… npx vitest run tests/customRequests.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Extract `vendorBlockers`, use it in `assignmentCandidates` unchanged in behaviour, and implement `nextBakery`.
- [ ] **Step 4:** Run the new test, `tests/assignment.integration.test.ts` and `tests/panels.integration.test.ts`. Expected: all PASS (the refactor changes nothing existing).
- [ ] **Step 5:** Commit: `feat: nearest bakery for a custom request`.

### Task 4: WhatsApp message builders, templates documented

**Files:**
- Modify: `lib/whatsapp.ts` (add `"custom_offer" | "custom_quote"` to the template `name` union)
- Modify: `lib/whatsappMessages.ts`
- Modify: `docs/WHATSAPP.md` (two template rows plus their wording, in the existing table style)
- Test: `tests/whatsappMessages.test.ts` (extend the existing file)

**Interfaces:**
- Produces:
  - `customOfferMessage(r: { id: string; ref: string; photoUrl: string; sizeKg: string; flavour: string; cakeMessage: string | null; dueAt: Date; area: string; budgetPaise: number | null }): WhatsAppMessage`
    - body params, in order: ref, `${sizeKg} kg`, flavour, cakeMessage or "-", `formatDue(dueAt)`, area, budget as `rupees()` or "no budget given"
    - image header link: `photoUrl`
    - `quickReply(0, "cq_no:<id>")`
  - `customQuoteMessage(r: { id: string; ref: string; token: string; photoUrl: string; sizeKg: string; dueAt: Date; quotePaise: number }): WhatsAppMessage`
    - body params: ref, `${sizeKg} kg`, `formatDue`, `rupees(quotePaise)`
    - URL button `{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: token }] }`
    - `quickReply(1, "cq_decline:<id>")`

- [ ] **Step 1:** Write failing tests that assert those exact component arrays (deep-equal), including that a cake message containing newlines comes out flattened by `cleanParam`.
- [ ] **Step 2:** Run `npx vitest run tests/whatsappMessages.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Turn the existing `header(orderId)` into an image-header helper that takes a link: keep `header(orderId)` calling `photoUrl(orderId)`, and add `imageHeader(link)`. Write the template wording into `docs/WHATSAPP.md`:
  - `custom_offer` footer: "Reply with your price, e.g. 1800"
  - `custom_quote` URL: `https://makeyourcakes.com/c/{{1}}`
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: custom offer and quote WhatsApp messages`.

### Task 5: Request lifecycle and inbound replies

**Files:**
- Modify: `lib/customRequests.ts`
- Modify: `lib/whatsappInbound.ts`
- Modify: `app/api/internal/assignments/route.ts` (call `runCustomRequestWorker()` too; return both results)
- Test: `tests/customRequests.integration.test.ts`

**Interfaces:**
- Consumes: `nextBakery` (Task 3), the message builders (Task 4), `parseQuoteReply` / `customerPricePaise` / `quoteExpiresAt` / `customOfferMinutes` / `canMoveCustom` / `MAX_BAKERIES` (Task 2).
- Produces:
  - `offerNext(requestId: string): Promise<void>`
    - Locks the row (`SELECT … FOR UPDATE`).
    - If the next bakery exists and `triedVendorIds.length < MAX_BAKERIES`: set `vendorId`, push to `triedVendorIds`, set `offerExpiresAt`, queue `customOfferMessage` to the vendor's phone.
    - Otherwise: set `no_bakery` and queue `updateMessage(ref, "No bakery could quote this custom cake. Customer: <name> <phone>")` to `adminNumbers()`.
  - `recordQuote(vendorId: string, requestId: string, vendorPaise: number): Promise<{ ok: true; quotePaise: number } | { ok: false; message: string }>`
    - Valid only when status is `awaiting_quote`, `vendorId` matches and the offer has not expired.
    - Sets `vendorQuotePaise`, `quotePaise` (margin read from `BakerySettings`) and `quoteExpiresAt`, and moves to `quoted`.
    - Queues `customQuoteMessage` to the customer, plus the admin `updateMessage`.
  - `declineOffer(vendorId: string, requestId: string): Promise<{ ok: boolean; message: string }>` → then `offerNext`.
  - `customerReply(phone: string, text: string | null, payload: string | null): Promise<boolean>`
    - Returns false when the number has no `awaiting_quote` or `quoted` request.
    - `cq_decline` → `declined`, customer told "No problem — our team may message you.", admin told.
    - Any other text → admin gets "Customer on CR-… says: …".
    - The bakery that quoted (if any) gets "The customer passed on CR-…" only on a decline.
  - `cancelCustomRequest(requestId: string): Promise<boolean>` (Task 8 uses it)
  - `runCustomRequestWorker(): Promise<{ offers: number; quotes: number }>`
    - Expired offers → `offerNext`, after telling the old bakery "CR-… has been passed on."
    - Expired quotes → `expired`.
  - Every outbox row uses `kind: "custom_request"` and `customRequestId`, with dedupe keys `cr:<id>:offer:<vendorId>`, `cr:<id>:quote`, `cr:<id>:nobakery`, `cr:<id>:say:<msgId>`.

`handleInbound` changes, for a sender who matches exactly one vendor, checked **before** `parseInbound`:
- payload `cq_no:<id>` → `declineOffer`
- `parseQuoteReply(text)`:
  - a quote → find that vendor's `awaiting_quote` requests (filtered by `ref` if one was given). Exactly one → `recordQuote`; several → reply "Which request? Reply *1800 CR-…*. Open: …"; none → fall through to the existing order handling.
  - `out_of_range` → reply "Please send the price in rupees, e.g. 1800."
- typed "can't do it" / "cant do it" / "no" **with** a `CR-` ref → `declineOffer`

Reply texts: "✅ Quote ₹1,800 sent for CR-…. We'll tell you if the customer pays." and "That request isn't waiting on you any more." Use the existing `whatsAppCommand` key so a re-delivered webhook is never applied twice: store `action: "quote" | "cq_no"` and `orderRef: <CR ref>`.

For a sender with no vendor match: call `customerReply` before the existing "bakery partners" reply, and return if it handled the message.

- [ ] **Step 1: Write failing integration tests** (WhatsApp env stubbed as in `whatsapp.integration.test.ts`; assert on `notificationOutbox` rows):
  - `offerNext` offers the nearest vendor with `custom_offer`.
  - The vendor texts "1800" → `quoted`, `quotePaise 207000`, customer row with `custom_quote`.
  - The vendor taps `cq_no` → the second vendor is offered.
  - Offers expire twice → third vendor; expire again → `no_bakery` plus an admin row.
  - Review Focus #2: a quote after `offerExpiresAt` → no change, and a reply row containing "isn't waiting".
  - The same message id delivered twice → one quote, one reply.
  - The customer taps `cq_decline` → `declined`, admin row, vendor row.
  - The customer types "can you do 1500?" → admin row containing the text; the vendor gets nothing.
  - Review Focus #3: a number that is both a vendor's and a customer's, texting "1800" with an open offer → treated as the vendor's quote.
  - An expired quote → `expired` after `runCustomRequestWorker`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement as above.
- [ ] **Step 4:** Run this file, `tests/whatsapp.integration.test.ts` and `tests/whatsappWebhook.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: bakery quotes and customer replies over WhatsApp`.

### Task 6: Submit API and customer form

**Files:**
- Create: `app/api/custom-requests/route.ts`
- Modify: `lib/customRequests.ts` (add `createCustomRequest`)
- Create: `components/shop/CustomRequestSheet.tsx`
- Modify: `app/custom-cakes/page.tsx`. Use `CustomRequestSheet` when `whatsappConfigured()`, otherwise keep `CustomEnquiry`. Gallery "Ask" tiles stay on `CustomEnquiry`.
- Test: `tests/customRequests.integration.test.ts` (create path), `tests/customRequestRoute.test.ts` (validation, with DB mocked)

**Interfaces:**
- Produces:
  - `createCustomRequest(input: CustomRequestInput, photo: Buffer): Promise<{ ref: string }>`
    - Stores the photo with `store(await optimize(photo), "custom", ref)` (`lib/storage.ts`).
    - Creates the row, then `after(() => offerNext(id))`.
  - `CustomRequestInput` zod schema, exported from `lib/customRules.ts`:
    - `name` 1–80
    - `phone` must pass `indianMobile`
    - `sizeKg` one of `CUSTOM_SIZES_KG`
    - `budgetRupees` int 100–100000, optional
    - `flavour` 1–60
    - `cakeMessage` ≤ 60, optional
    - `dueAt` ISO date
    - `address` must match `LocatedAddress` with `inHyderabad`
    - `consent` literal `true`
- Route `POST /api/custom-requests` (multipart: field `data` = JSON, field `photo` = file):
  - 429 via `rateLimit("custom-requests", callerKey(req), { limit: 5, windowSeconds: 3600 })`
  - 400 on invalid input, with a `fieldErrors` map
  - 413 over `MAX_UPLOAD_BYTES`, 415 for a type not in `ACCEPTED_TYPES`
  - 422 "We don't deliver there yet" when `checkDeliveryServiceability` fails for the pincode
  - 422 "Please choose a later date" when `dueAt` is earlier than now + the checkout minimum lead hours
  - 503 when `!whatsappConfigured() || !hasImageStore()`
  - 201 `{ ref }`
- The sheet uses the `.s-sheet` `<dialog>` pattern from `CustomEnquiry`:
  - photo input with preview
  - size `<select>`, budget `<input type=number>`, flavour, message
  - `<input type="date">` plus the existing time-slot options from `lib/customEnquiry` `TIMES`
  - an address button that opens `LocationSheet` (the page passes `getCatalogSnapshot()`)
  - name, phone, consent checkbox
  - on 201 it replaces the form with: **"Thanks! We'll contact you shortly on WhatsApp."** plus "Your reference: CR-…"

- [ ] **Step 1:** Write failing tests:
  - Route unit tests: missing photo → 400; `consent: false` → 400; a 9-digit phone → 400; a non-serviceable pincode → 422; WhatsApp off → 503.
  - Integration: `createCustomRequest` stores the row with a `CR-` ref and calls `offerNext` (spy).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the route, `createCustomRequest`, the sheet and the page switch.
- [ ] **Step 4:** Run the tests plus `npx tsc --noEmit` and `npm run lint`. Expected: PASS, 0 errors.
- [ ] **Step 5:** Manual check: `preview_start` the dev server (scratch DB, WhatsApp env stubbed), open `/custom-cakes`, submit a request, and see the thank-you screen and a new `CustomRequest` row. Check the layout at 375 px wide.
- [ ] **Step 6:** Commit: `feat: custom cake request form`.

### Task 7: Pay page and turning a payment into an order

**Files:**
- Create: `app/c/[token]/page.tsx`, `app/c/[token]/PayButton.tsx`
- Create: `app/api/custom-requests/[token]/intent/route.ts`, `app/api/custom-requests/[token]/pay/route.ts`
- Modify: `lib/customRequests.ts` (add `payCustomRequest`)
- Modify: `lib/paymentRecovery.ts` (receipt `custom:` branch)
- Test: `tests/customRequests.integration.test.ts`

**Interfaces:**
- Consumes: `openPaymentIntent(key, hash, amountPaise)`, `verifySignature`, `refundPayment(proof)`, `refForAttempt`, `whatsappNewOrder`, `acceptedMessage`.
- Produces: `payCustomRequest(requestId: string, proof: PaymentProof): Promise<{ kind: "paid"; orderRef: string } | { kind: "refunded" | "already_paid" }>`.

Routes:
- **Intent:** looks the request up by token. Unless it is `quoted` and not expired → 409 "This quote is no longer available". Then `openPaymentIntent("custom:" + id, "custom:" + id, quotePaise)` → `{ razorpayOrderId, amountPaise, keyId }`.
- **Pay:** body is a `PaymentProof`. `verifySignature`, else 400. Then `payCustomRequest` → `{ orderRef }` or 409.
- **`recoverPayment`:** after fetching `gatewayOrder`, if `receipt.startsWith("custom:")` call `payCustomRequest(receipt.slice(7), proof)` and return.

`payCustomRequest`, inside `db.$transaction(…, ASSIGNMENT_TX)`:
1. `pg_advisory_xact_lock(hashtext('checkout:custom:' + id))`, the same lock key `openPaymentIntent` uses.
2. Re-read the request. An order already holds this payment id → `already_paid`. Status not `quoted`, quote expired, or vendor inactive → mark `cancelled` (or `expired`) and remember to refund after the transaction.
3. Otherwise create the `Order`:
   - `ref = refForAttempt("custom:" + id, 0, n)` (retry on collision like `placeOrder`)
   - `cakeName "Custom cake · <sizeKg> kg"`, `cakeImageUrl photoUrl`
   - `config { custom: true, sizeKg, flavour, cakeMessage, budgetPaise }`
   - `priceBreakdown { custom: { vendorQuotePaise, quotePaise } }`
   - `totalPaise`, `payablePaise` and `productSubtotalPaise` all = `quotePaise`
   - `status confirmed`, `paymentStatus paid`, `confirmedAt now`
   - `dueAt` and `requestedFor` = `dueAt`; `deliverySlot "custom"`; `leadHours = round((dueAt − createdAt) / 1h)`
   - customer name and phone; `deliveryLocation { latitude, longitude }`
   - `addressLine1 = address.address`, plus `city`, `state`, `pincode`
   - `customerNotes = cakeMessage`
   - Razorpay ids from the proof; `assignmentState ASSIGNED`
4. Create the `VendorOrder`: `vendorId`, `assignmentStatus ACCEPTED`, `status accepted`, `offeredAt`/`assignedAt` now, `orderValuePaise quotePaise`, `vendorEarningPaise vendorQuotePaise`, `commissionPaise quotePaise − vendorQuotePaise`, `feePaise 0`, `sequence 0`.
5. Set it as `currentAssignmentId`. Write the `orderEvent` draft→confirmed. Mark `checkoutAttempt` `completed` with `orderId`. Set the request to `paid` + `orderId`.
6. `whatsappNewOrder(tx, order.id)` for the customer and admin. Queue `acceptedMessage(order.ref, vendorOrder.id)` to the vendor, preceded by the text "✅ Customer paid — CR-… is now order MC-…".

After the transaction: `refundPayment(proof)` when step 2 asked for it → `refunded`.

The page at `/c/[token]` is a server component:
- `notFound()` for an unknown token.
- Shows the photo, size, flavour, message, due time and price.
- Shows "Valid until <formatDue(quoteExpiresAt)>".
- `PayButton` loads Razorpay checkout the same way `CheckoutForm` does, posts the proof to `/pay`, then redirects to `/orders/<ref>`.
- For `paid` it links to the order; for every other status it shows "This quote is no longer available".

- [ ] **Step 1: Write failing integration tests** (Razorpay calls mocked as in `tests/payments.integration.test.ts`):
  - A quoted request, then `payCustomRequest` → one `Order` with `totalPaise = quotePaise`, an `ACCEPTED` `VendorOrder` with the earning/commission split, the request `paid`, and vendor/customer/admin outbox rows.
  - Calling `payCustomRequest` again with the same proof → `already_paid`, still one order.
  - Review Focus #1: two concurrent `payCustomRequest` calls (`Promise.all`) → exactly one order, and `refundPayment` is not called.
  - An expired quote → `refunded`, no order.
  - An inactive vendor → `refunded`, request `cancelled`.
  - `recoverPayment` with a `custom:` receipt reaches `payCustomRequest`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement as above.
- [ ] **Step 4:** Run this file plus `tests/payments.integration.test.ts` and `tests/ordersPayment.integration.test.ts`. Expected: PASS.
- [ ] **Step 5:** Manual check with Razorpay test keys on the dev server: open `/c/<token>` for a seeded quoted request, pay with a test card, land on `/orders/MC-…`, and see the order in `/vendor` for the quoting bakery.
- [ ] **Step 6:** Commit: `feat: pay a custom quote and turn it into an order`.

### Task 8: Admin list

**Files:**
- Create: `app/admin/custom-requests/page.tsx`, `app/admin/custom-requests/actions.ts`
- Modify: `lib/adminNav.ts` (add `{ href: "/admin/custom-requests", label: "Custom requests", icon: "cake", nested: true }` under Orders)
- Test: `tests/customRequests.integration.test.ts` (cancel)

**Interfaces:**
- Consumes: `cancelCustomRequest(requestId)` (Task 5).

What it shows:
- The page is admin-only, like the other `/admin` pages.
- Newest 100 requests.
- Columns: ref, status, thumbnail, customer name and phone, bakery name, vendor quote, customer price, and an order link once paid.
- A "message failed" badge when any `notificationOutbox` row for the request is `failed`.
- Cancel button only on `awaiting_quote` / `quoted`. The server action calls `cancelCustomRequest`.

- [ ] **Step 1:** Write a failing test: `cancelCustomRequest` on a `quoted` request → `cancelled`, and a vendor outbox row "CR-… was cancelled"; on a `paid` request → false and nothing changes.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the action, page and nav entry.
- [ ] **Step 4:** Run the test plus `npx tsc --noEmit` and `npm run lint`. Expected: PASS. Then `preview_start` the dev server and load `/admin/custom-requests` signed in as the test admin.
- [ ] **Step 5:** Commit: `feat: admin custom requests list`.

### Task 9: Whole-branch verification

- [ ] Run `npm test` (unit) and the integration suite against scratch. Expected: all pass.
- [ ] Run `npx tsc --noEmit && npm run lint`. Expected: 0 errors.
- [ ] Run `DATABASE_URL=$ASSIGNMENT_TEST_DATABASE_URL npm run build`. Expected: build succeeds (PR previews fail without a DB, so build locally).
- [ ] Run `graphify update .`.
- [ ] Commit any fixes. Leave the prod migration and the two Meta templates as stated user to-dos in the PR description.
