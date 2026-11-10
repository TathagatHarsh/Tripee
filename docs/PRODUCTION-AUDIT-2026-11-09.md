# Production readiness audit — 9 November 2026

> Follow-up: see [the remediation report](PRODUCTION-FIXES-2026-11-09.md) for implemented fixes, verification and remaining rollout requirements. This document records the original audit.

**What this repo does:** MakeYourCakes sells cake variants and takes guest or signed-in orders, with Razorpay checkout, vendor assignment and fulfilment, WhatsApp commands, and admin/kitchen operations. This audit assumes a small public launch with multiple customers and staff working concurrently, unreliable mobile connections, repeated webhooks, and occasional provider/database failures. It does not assume high-volume traffic.

**Verdict: Do not enable live payments yet.** Fix findings 1–6 and complete the deployment checks below. Razorpay test mode itself is intentional and is not a finding. Switching keys alone will not resolve the payment lifecycle issues.

Audited working tree based on commit `157c161`, including existing local changes. No application fixes were made. Test data was written only to a new isolated PostgreSQL database on localhost. No live orders, refunds, WhatsApp messages, or account changes were made.

An audit cannot prove that no vulnerability or edge case remains. This is a source review plus local verification, not a penetration-test certification or a verification of the deployed environment.

## Must fix before launch

### 1. P1 — A valid payment signature is treated as captured money

- **What this is:** The server validates Razorpay's callback signature and the stored order/amount binding, then creates a confirmed order with `paymentStatus: "paid"`.
- **Problem:** It never fetches the payment's current status, amount, currency or refunded state. An authorised but uncaptured payment can therefore release an order for fulfilment. A valid signature proves the callback is authentic, not that money is currently captured and available.
- **Fix:** Verify the payment against Razorpay and only release fulfilment for a captured payment with the expected order, amount and INR currency. Represent pending authorisation separately; reconcile later state changes through verified events.
- **If we skip it:** Cakes can be fulfilled for payments that are not captured or are subsequently automatically reversed.

Evidence: [signature check](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/razorpay.ts:37), [order handler](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:80), [paid and confirmed assignment](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:423). The paid integration tests mock only order creation and refunds, so they do not test payment-status verification. Razorpay distinguishes authorised from captured payments in its [integration guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps).

### 2. P1 — A successful charge can have no application order

- **What this is:** The browser obtains a Razorpay order, opens Checkout, saves the success proof locally, then posts to `/api/orders`.
- **Problem:** If the tab closes, the phone loses connectivity, or a late payment succeeds before the browser stores the proof, the application receives no confirmation. There is no Razorpay webhook handler or payment reconciliation worker. The server stores a payload hash and gateway intent, but not the full pending checkout needed to rebuild the order.
- **Fix:** Persist the validated pending checkout before opening Razorpay. Add a signature-verified, duplicate-safe payment webhook and recovery job which either completes the order or records and resolves a refund obligation. Keep the browser confirmation as a fast path through the same logic.
- **If we skip it:** A customer can be charged with no order, no kitchen ticket, and no automatic refund. Browser-local recovery cannot recover a callback it never received.

Evidence: [browser payment/confirmation sequence](/Users/tathagatharsh/Desktop/Tripee.nosync/app/checkout/CheckoutForm.tsx:413), [stored intent](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkoutPayment.ts:44), [checkout attempt schema](/Users/tathagatharsh/Desktop/Tripee.nosync/prisma/schema.prisma:295). All API route files were inventoried; the existing webhook is for WhatsApp. Razorpay provides [captured-payment and paid-order events](https://razorpay.com/docs/webhooks/payments).

### 3. P1 — Retried WhatsApp commands can act on a different order

- **What this is:** A vendor can reply with a bare word such as `accept`. The handler selects the one matching pending assignment and uses the reply-outbox row as its duplicate-message marker.
- **Problem:** The order transition commits before that marker is saved. I reproduced: accept order A; fail the reply-outbox write; offer order B; replay the exact same inbound message ID. Order B is also accepted, although the vendor never accepted B.
- **Fix:** Persist the inbound message ID and its selected assignment before executing the command, with durable processing/retry state. Keep the assignment binding fixed on retry and make transition/processed-state recording atomic where possible. Do not use successful reply creation as proof that a command was processed.
- **If we skip it:** A normal webhook retry can accept, reject or advance unintended work. This requires a partial failure, not a malicious vendor or forged webhook.

Evidence: [late duplicate check and target selection](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/whatsappInbound.ts:75), [state transition](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/whatsappInbound.ts:98), [marker written afterwards](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/whatsappInbound.ts:114). The isolated reproduction passed, meaning it demonstrated the incorrect second acceptance; [reproduction source](production-audit-2026-11-09/whatsapp-replay-reproduction.ts.txt) and [result](production-audit-2026-11-09/tripee-audit-repro.log).

### 4. P1 — Missing payment credentials silently enables unpaid confirmed orders

- **What this is:** `paymentsEnabled()` is false when either Razorpay credential is missing. The public order endpoint then calls placement without payment.
- **Problem:** A missing production variable or incomplete key rotation changes the shop to unpaid ordering instead of stopping checkout. Delivery orders are immediately confirmed and eligible for assignment. I reproduced HTTP 201 and database values `status=confirmed`, `paymentStatus=none` in a production build with credentials absent.
- **Fix:** Separate an explicit offline-payment business mode from missing credentials. In the intended prepaid production mode, incomplete credentials must return an unavailable response and prevent fulfilment. Validate environment completeness during deployment.
- **If we skip it:** A deployment mistake can accept and dispatch unpaid orders. This is a configuration-triggered bypass, not a claim that customers can unset server environment variables.

Evidence: [credential detection](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/razorpay.ts:24), [unpaid fallback](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:70), [confirmed status](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:423).

### 5. P1 — The disabled builder is still orderable through the API

- **What this is:** The UI blocks the builder and builder checkout when `NEXT_PUBLIC_BUILDER_ENABLED` is off, but checkout validation still accepts `items[].config`.
- **Problem:** I posted a valid custom configuration directly to `/api/orders` with the builder disabled and received HTTP 201. The order had no product ID. Vendor inventory validation requires a product variant, so this order cannot pass normal vendor assignment. With payments enabled, the same missing feature guard exists before taking payment.
- **Fix:** Reject builder/config items in shared server checkout validation while the feature is disabled, before creating an intent or order. Before enabling the builder, define and test how custom cakes are fulfilled.
- **If we skip it:** Customers or scripts can buy an unavailable product flow and create orders the vendor system cannot fulfil normally.

Evidence: [UI-only gate](/Users/tathagatharsh/Desktop/Tripee.nosync/app/checkout/page.tsx:29), [config accepted in the request schema](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkout.ts:129), [variant requirement](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/inventoryRules.ts:10). Local reproduction created synthetic order `MC-BD8WDG` with `cakeProductId=null` and `assignmentState=MANUAL`.

### 6. P1 — Refund completion and uncertain refunds are not reconciled

- **What this is:** The refund helper reduces a gateway response to `res.ok`; cancellation then marks the order refunded. Other failed-checkout refunds use a string marker in the checkout attempt.
- **Problem:** The response's refund ID and status are discarded. If Razorpay accepts a request but the response times out, or the database write fails afterwards, the app cannot distinguish a completed refund from a failed request. There is no refund-status reconciliation. Also, checkout clears its saved proof for both `refunded:true` and `refunded:false`, so the normal retry path does not retry the failed refund.
- **Fix:** Persist a refund operation and gateway refund ID/status. Treat timeouts as unknown and verify status before retrying; distinguish requested/pending/processed/failed states. Add a durable retry/reconciliation path and make unresolved refunds visible to staff, including attempts with no Order row.
- **If we skip it:** Refunds can remain unresolved, or staff/customer screens can claim the wrong state. Cancellation does show a manual-dashboard fallback for orders still marked paid; that mitigation does not reconcile state or cover every orphaned checkout.

Evidence: [response reduced to boolean](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/razorpay.ts:95), [refund markers](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkoutPayment.ts:152), [cancelled-order update](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkoutPayment.ts:187), [proof cleared even on failed refund](/Users/tathagatharsh/Desktop/Tripee.nosync/app/checkout/CheckoutForm.tsx:452). Razorpay's [refund API](https://razorpay.com/docs/api/refunds/create-normal) returns a refund entity; the application should retain and reconcile it.

## Should fix

### 7. P2 — Delivery-zone extra lead time is not enforced when choosing a date

- **What this is:** Delivery zones add `extraHours` to the base lead time, but the date validator uses only the slot's `cutoffHours`.
- **Problem:** With shipped defaults, the extended zone requires 54 hours, yet a standard delivery exactly 48 hours away passes. I reproduced this using 10 November 10:00 IST as now and 12 November 10:00 IST as the requested delivery. The order stores the longer lead time but its requested delivery remains earlier.
- **Fix:** Derive and enforce the effective zone-aware cutoff in both quote and order validation. Specify how an explicitly configured cutoff relates to production lead time, and test that rule.
- **If we skip it:** Customers receive delivery promises earlier than the configured logistics allowance.

Evidence: [extra hours](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/delivery.ts:107), [base-slot validation](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkoutValidate.ts:235), [cutoff comparison](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/scheduling.ts:62).

### 8. P2 — Changing a catalogue photo deletes photographs retained by existing orders

- **What this is:** Orders snapshot a cake's image URL. Replacing or removing the catalogue image deletes the old Blob object.
- **Problem:** An order placed against photo A retains A's URL; uploading B deletes A without checking order references. The paid order's customer page, vendor ticket and photo download can then lose the reference photograph.
- **Fix:** Keep images referenced by historical or active orders. Delete only unreferenced assets, or store an order-owned copy with a defined retention period.
- **If we skip it:** Staff can lose the image specifying what an existing customer purchased.

Evidence: [order image snapshot](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:366), [old image deleted after replacement](/Users/tathagatharsh/Desktop/Tripee.nosync/app/admin/cakes/actions.ts:703), [old image deleted on removal](/Users/tathagatharsh/Desktop/Tripee.nosync/app/admin/cakes/actions.ts:740). Source-traced; no real Blob assets were deleted during this audit.

### 9. P2 — The seeded express slot cannot pass date validation

- **What this is:** The express delivery default says `Within 4 hours of confirmation`. Scheduling requires a concrete `HH:mm–HH:mm` window.
- **Problem:** Every attempted date for that seeded express slot is rejected as temporarily unavailable. I reproduced this with `DEFAULT_SNAPSHOT`. Whether the deployed slot was manually corrected was not checked.
- **Fix:** Either withdraw express delivery until supported, or define and implement its rolling four-hour scheduling semantics. Validate admin slot inputs against the scheduling rules so free-form text cannot silently disable a slot.
- **If we skip it:** The shop can offer an express option that customers cannot purchase, especially on a freshly seeded deployment.

Evidence: [express default](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/catalogDefaults.ts:188), [required window format](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/scheduling.ts:50), [admin accepts arbitrary window text](/Users/tathagatharsh/Desktop/Tripee.nosync/app/admin/actions.ts:457).

### 10. P2 — Release tests omit integration coverage and contain stale checkout steps

- **What this is:** Five integration suites require `ASSIGNMENT_TEST_DATABASE_URL`. CI runs `npm test` in a job without that variable, while its separate PostgreSQL job runs browser tests only.
- **Problem:** The default command skipped 90 payment, assignment, delivery and WhatsApp tests. They passed when I ran them against isolated PostgreSQL, but CI will not protect them on future changes. The browser authentication suite explicitly does not exercise signed-in Vendor A versus Vendor B access or actual admin/vendor workflows. The current browser suite also failed on stale selectors: it expects size/sponge radios where the single variant is displayed as text, and an exact Phone label whose accessible name now includes help text. Its confirmation accessibility test still requests disabled pickup.
- **Fix:** Update the stale browser journeys to the current delivery-only UI. Run the integration suites serially against CI PostgreSQL with the required variable. Add a staging smoke suite with real test identities for customer, vendor A, vendor B and admin, covering direct URLs and mutations as well as UI navigation.
- **If we skip it:** Payment/concurrency regressions and identity-provider wiring errors can ship behind a green CI result.

Evidence: [CI unit job](/Users/tathagatharsh/Desktop/Tripee.nosync/.github/workflows/ci.yml:27), [integration gate](/Users/tathagatharsh/Desktop/Tripee.nosync/tests/ordersPayment.integration.test.ts:40), [authenticated coverage limitation](/Users/tathagatharsh/Desktop/Tripee.nosync/e2e/auth.spec.ts:43).

### 11. P2 — Development dependencies have known advisories

- **What this is:** The current npm advisory scan reports 21 affected package entries: 3 high, 17 moderate and 1 low. Several entries are transitive effects of the same underlying advisory, not 21 independently exploitable app vulnerabilities.
- **Problem:** High-severity entries include `body-parser`, `systeminformation` and `vite` in development tooling. `npm audit --omit=dev` reports zero known production dependency vulnerabilities. The scan does not demonstrate an exploit against the deployed Next app.
- **Fix:** Update affected tooling and its transitive dependencies to compatible patched releases, rerun checks, and avoid exposing development servers. Review suggested fixes; do not blindly apply forced major changes or downgrades.
- **If we skip it:** Developer/CI tools retain known attack surfaces, even though the production dependency scan is clean.

Evidence: [full advisory report](production-audit-2026-11-09/tripee-audit-deps.json), [production-only report](production-audit-2026-11-09/tripee-audit-prod-deps.json). The full report includes advisory URLs and affected ranges.

## Coverage and verified safeguards

| Area | Reviewed | Result / remaining boundary |
|---|---|---|
| Customer checkout | Product/variant validation, totals, quantity limits, contact/address validation, date checks, capacity locks, idempotency, receipts and tracking | Server-side pricing and duplicate-order protection are present. Findings above cover remaining money/scheduling gaps. |
| Customer privacy | User-scoped order queries, signed guest cookies, tracking/photo endpoints | No straightforward reference-only access to another customer's order found. Guest tracking uses an HMAC-protected HTTP-only cookie. Live identity journeys remain unverified. |
| Vendor | Role/vendor scope, active state, inventory, offers, stale assignment IDs, acceptance, preparation, handover and delivery | Core mutation paths check scope and state. Integration tests pass. WhatsApp partial-failure replay is a confirmed exception. |
| Admin/kitchen | Page/action guards, catalogue/pricing edits, vendor activation/linking, manual assignment, cancellation and uploads | Server guards are present; roles are database-backed, not read from client-writable metadata. Photo/refund findings remain. |
| Payments | Intent binding, signature checks, amount comparison, repeated submissions, failure refunds, cancellation | Existing local tests pass with a mocked provider; captured-state and recovery coverage is insufficient for live-money release. |
| WhatsApp/notifications | Signature validation, phone/vendor matching, transitions, outbox claiming/retries, internal endpoint authentication | Signature checking and outbox leases exist. Inbound-command replay defect reproduced. External delivery and scheduled worker operation not verified. |
| Database | Schema, migrations, uniqueness/foreign keys, transaction locks, row-level-security migrations | Fresh migrations applied successfully. All 90 integration tests passed on local PostgreSQL. Deployed migration/RLS state was not queried. |
| Upload/security boundaries | Image decode/re-encode, input size/pixel limits, escaping, guarded actions, cross-origin checks, secret-file tracking | Uploads are re-encoded with format and pixel limits. No obvious unsafe SQL interpolation, eval path, or raw HTML injection found in searched application paths. Only `.env.example` is tracked among current `.env*` files; this is not a full Git-history secret scan. |
| Operations | Build, dependency advisories, CI, backup workflow, worker endpoints | Build and typecheck pass. Production hosting, worker schedules, backup recovery and alerts still require deployment evidence. |

The existing rate limiter is explicitly per-instance, and the CSP intentionally covers framing rather than script execution. Those are documented limitations, not newly proven exploits. Verify a deployment-wide abuse limit before exposing metered/public endpoints; these local checks do not establish firewall protection.

## Verification performed

- `npm test`: **846 passed; 90 skipped** initially.
- Five database integration files on isolated PostgreSQL, serial execution: **90 passed**. Combined, all **936 existing Vitest tests** passed across those two runs.
- Additional fault-injection reproduction: **1 passed**, demonstrating the wrong-order WhatsApp acceptance. The temporary runnable test was removed; its source is retained as a report attachment.
- `npm run typecheck`: passed.
- `npm run lint`: exit success, **0 errors and 1,103 warnings**, with substantial noise from the generated map worker. This is not a clean warning baseline.
- Fresh `prisma migrate deploy`: passed; scratch database seeded successfully.
- Isolated production build: passed. Build-generated tsconfig additions were removed after verification.
- Production dependency audit: **0 known vulnerabilities**. Full dependency audit: **21 affected package entries**.
- Direct local HTTP reproduction: disabled-builder custom order accepted; missing payment keys produced an unpaid confirmed order.
- Pure scheduling reproductions: ignored extended-zone allowance and unusable seeded express slot.
- Browser/accessibility suite on the local production build: **41 passed, 2 failed, 14 skipped, 1 interrupted, 4 not run**. I stopped the remaining repeated stale-flow tests after diagnosing the shared fixture problem. The two failures are stale test steps, not proof that checkout itself is broken, but the suite is not green and confirmation accessibility was not reached. The first attempt lacked the matching Playwright browser binary; it was installed before the recorded rerun. See [browser results](production-audit-2026-11-09/browser-suite.log).

A temporary copy of the customer browser test, adapted only to current single-variant presentation and the Phone accessible name, **passed the full guest checkout journey**: add/edit cart, confirm delivery, order, refresh receipt, track, and deny access from an unrelated browser/forged guest cookie. It also ran the checkout axe scan. All six adapted customer smoke scenarios passed across targeted runs, including mobile unserviceable-address blocking and preservation after network failure, map-pin persistence, anonymous API rejection, Enter-key safety and reopening the confirmed pin. The mobile test also needed its straight-apostrophe assertion adapted to the UI’s curly apostrophe; the refusal and disabled confirmation button were already correctly displayed. The original committed tests were not changed. This used no live payment provider. [Mobile result](production-audit-2026-11-09/customer-mobile.log), [remaining scenarios](production-audit-2026-11-09/customer-smoke-rest.log), [Result](production-audit-2026-11-09/customer-smoke.log), [temporary test source](production-audit-2026-11-09/customer-smoke.ts.txt).

## Deployment evidence required before opening to customers

These are unresolved release gates, not assertions that the deployment is misconfigured:

1. **Payment recovery drill:** In test mode, complete a payment and close the browser before confirmation; prove the server creates the order or resolves the refund. Test authorised-only, delayed capture, duplicate events, failed refunds and gateway timeout after acceptance. Then verify the same integration settings for live mode.
2. **Worker operation:** Demonstrate scheduled calls to both `/api/internal/assignments` and `/api/internal/notifications`, with authentication, retry and alerting. The repository provides endpoints and an assignment CLI, but no committed hosting scheduler. Vendor/admin transitions enqueue notifications without necessarily dispatching them immediately; without the external worker they can sit pending until unrelated traffic triggers dispatch.
3. **Real role matrix:** On staging, sign in as customer, vendor A, vendor B and admin. Verify direct URL/API/action access, stale forms, deactivated vendors and revoked roles. Test account creation, sign-in/out and guest order recovery. No live credentials were used in this audit.
4. **Production data/settings:** Confirm applied migrations/RLS, active products and accurate variants/allergens, vendor inventory and coverage, realistic capacity/lead times, delivery window syntax, and intended `SERVICE_AREA`/assignment flags. The city-wide coverage override does not prove a bakery can fulfil a particular product.
5. **Backups and incident recovery:** Verify the encrypted backup job actually runs and restore a backup into a separate database. The committed schedule is weekly; confirm that the resulting potential data-loss window is acceptable or use more frequent backups/point-in-time recovery. Live backup configuration was not inspected.
6. **Operational alerts:** Surface orphaned payments, unresolved refunds, failed/outstanding notifications and unassigned/expired orders. Demonstrate alert delivery, not just log output.
7. **Supported devices:** Complete an actual Razorpay test checkout on supported mobile browsers/UPI return paths, plus a signed-in vendor/admin lifecycle. Local Chromium tests do not validate those external-device flows.

## Not checked

No live deployment URL or hosting dashboards were inspected. Live Razorpay capture/refund configuration, Clerk settings and session flows, Meta template approval/delivery, worker schedules, production database data/RLS grants, firewall rules, backup recovery and real payment networks remain unverified. There was no sustained load test, full repository-history secret scan, legal/tax compliance review, or exhaustive visual inspection of every page/state. Rendering shaders and offline asset-generation scripts were not reviewed line by line; review depth concentrated on money, authentication, customer data, writes, state transitions and deployment-critical paths.

**Verdict:** Fix the six launch blockers, verify the deployment gates, then rerun affected regression and staging tests. The passing unit/integration tests and adapted customer checks are useful evidence, but are not sufficient for live-payment approval in the current state.
