# Production audit fixes — completed 10 November 2026

The identified application defects have been addressed locally. **Do not enable live payments until the deployment steps and staging checks below are complete.** Razorpay remains in test mode; no production database, payment, refund, account or WhatsApp operation was performed.

This is the remediation report for [the original audit](PRODUCTION-AUDIT-2026-11-09.md). The original report describes the pre-fix code; its old line references are historical.

## Changes

| Audit finding | Implemented change |
| --- | --- |
| 1. Signature mistaken for captured funds | Browser confirmation fetches authoritative payment status, ID, gateway order, amount, currency and refunded amount. Only captured, unrefunded INR payments can fulfill an order. Pending/unverifiable payments preserve browser proof. Full refunds allow the browser to clear proof safely. Recovery performs the same financial checks. |
| 2. Browser loss after charging | Validated checkout and customer ownership are persisted before opening Razorpay. Browser and recovery use the same placement transaction. A raw-body signature-verified webhook handles `payment.captured` and `order.paid`. Polling recovers saved intents; a webhook can recover a gateway order whose ID was never saved, using its receipt. Duplicate events do not create duplicate orders. |
| 3. WhatsApp replay targets another order | A durable message/sender record binds the command to its original vendor, assignment, action and order before any transition. A retry after reply persistence fails cannot select a newly offered order. Messages with no matching order or ambiguous targets are also durably kept non-actionable. |
| 4. Missing keys silently permit unpaid orders | Missing/partial Razorpay keys disable checkout. Unpaid checkout requires explicit `PAYMENT_MODE=offline` and both keys empty. New production charges additionally require webhook and payment-worker secrets. |
| 5. Disabled builder accepted by APIs | Shared checkout validation and quote APIs reject builder configurations while the builder flag is off, before taking payment. |
| 6. Refund uncertainty and lost proof | Durable refund operations retain gateway refund IDs and pending/processed/failed states. Creation retries use the same `X-Refund-Idempotency` key; known refunds are fetched rather than created again. Only processed refunds are reported as refunded. The worker recovers cancellation/refund interruptions. Browser proof survives failed/pending refunds. `/admin/payments` shows unsettled refunds and unfinished checkouts. |
| 7. Zone lead time ignored | Zone extra hours now extend the cutoff used by server validation, quotes and checkout date/window selection. |
| 8. Historical images deleted | Catalogue edits retain immutable uploaded images. This avoids both existing-order breakage and read/delete races with concurrent checkout. Storage cleanup is intentionally deferred to a separate retention-aware process. |
| 9. Invalid express promise | Unsupported rolling window text is unavailable for checkout, and admin edits must supply an explicit clock range. **Rolling “within four hours” delivery is not implemented or enabled.** No different delivery promise was silently substituted. |
| 10. Integration and browser gaps | CI now executes the real PostgreSQL integration suites serially. Customer fixtures use the current single-variant UI and delivery flow. The confirmation accessibility test places a delivery order. Anonymous access checks include payment follow-up and the new worker. |
| 11. Dependency advisories | Compatible dependency patches applied. Removed the unused shadcn generation CLI, which brought unpatched deepmerge. Scoped a patched minimatch override to TypeScript ESLint. Clean `npm ci` succeeds; full and production dependency audits report zero known vulnerabilities. |

Final browser testing also exposed and fixed a map timing issue: location confirmation is now disabled throughout map movement, and the delivery picker stops at the released pin without inertial coasting, so the previous pin cannot be saved while a drag is still settling. The regression test checks this disabled interval and verifies the confirmed pin is restored when reopening the address sheet.

Payment-intent creation is also serialized with the existing checkout advisory lock, preventing competing gateway intents from concurrent submits. The changes preserve the user's existing local work.

## Verification

- Fresh disposable PostgreSQL database: all 24 migrations applied successfully.
- Unit tests: 856 passed; integration tests are intentionally skipped in this command and run separately.
- PostgreSQL integration tests: 105 passed across assignment, delivery, payments, paid order routes and WhatsApp suites. The expanded paid-route suite independently passed all 21 tests.
- TypeScript: passed. ESLint: zero errors and zero warnings.
- Production build: passed with explicit local database and offline test configuration.
- Browser verification: 49 passed, 21 intentionally skipped for disabled-builder or unconfigured-Clerk cases. After the map timing fix, all 6 customer-flow tests passed again; the rerun is recorded separately.
- Clean lockfile install: passed. Full dependency audit: 0. Production dependency audit: 0.

Regression coverage includes signed but authorized/created/failed payments, wrong amount/currency, partial/full refunds, missing payment credentials, disabled-builder requests, simultaneous intents, browser loss, a lost gateway-intent write, duplicate recovery, pending refunds, timeout retries with the same idempotency key, cancellation recovery and WhatsApp reply-write failure followed by a new order offer.

All provider calls in money/WhatsApp integration tests were mocked. Browser tests used a disposable local database and explicit offline payments. They did not charge cards or send messages.

## Required rollout steps

1. Back up the target database and verify the deployment uses the intended database. Apply `npm run db:deploy` before deploying the new application. This adds `WhatsAppCommand`, `PaymentRecovery` and `RefundOperation`; it does not rewrite existing order data. Deploy all instances together and drain the old version before resuming webhook traffic.
2. Keep the existing Razorpay test keys while validating. Leave `PAYMENT_MODE` unset for the prepaid shop. Configure independent, random `RAZORPAY_WEBHOOK_SECRET` and `PAYMENT_WORKER_SECRET` secrets in the deployment environment.
3. In the Razorpay dashboard, configure `https://YOUR_DOMAIN/api/webhooks/razorpay` for `payment.captured` and `order.paid`, with exactly the configured webhook secret. Confirm delivery succeeds and retries are enabled. Test and live mode webhook configuration must each be verified; setting an environment variable alone does not register a webhook.
4. Schedule an authenticated POST to `/api/internal/payments` at least once per minute, with `Authorization: Bearer <PAYMENT_WORKER_SECRET>`. An alternative long-running process is `npm run payments:worker -- --watch`, configured with `PAYMENT_APP_URL` and the secret. Do not expose the secret in browser code. Continue scheduling the existing assignment and notification workers as documented in `.env.example`.
5. Monitor `/admin/payments`, webhook failures and worker responses. Polling is a bounded backup (one checkout and up to three pending refunds per invocation); webhooks are the primary recovery path. Increase worker invocation frequency/capacity if the oldest pending item grows under actual traffic. A failed gateway refund requires operator review; do not create a second refund manually without checking the stored gateway ID and Razorpay first.
6. Complete the staging checks below. Then change to live Razorpay keys and verify the live-mode webhook, capture settings and first live order/refund. The code does not change test keys automatically.

### Staging checks still required

- Use real Clerk customer, Vendor A, Vendor B and admin accounts to verify sign-in, role redirects, cross-customer order denial and Vendor A's inability to read or modify Vendor B's assignment. Local tests prove the code rules and anonymous guards, not the deployed Clerk/session configuration.
- With Razorpay test mode, complete payment while closing the browser before confirmation; verify exactly one paid order appears via webhook/worker. Replay an event. Cancel a paid order and follow the refund through to processed in both dashboards. Verify a pending authorization never starts fulfillment.
- Verify the actual Meta webhook signature, templates, partner phone routing and notification-worker delivery with designated test recipients.
- Verify production backups/restore, deployed secrets, hostname/HTTPS, delivery zones/capacity, bakery availability and monitoring. These provider/dashboard settings were not changed by this work.

Historical checkout attempts created before this deployment have no saved recovery payload; reconcile any old captured payments without orders manually before launch. Immutable images and financial recovery records are retained; establish a retention policy before deleting them. No audit or test run can establish that every possible production edge case is absent.

## Rollback

The migrations are additive: retain the new tables and their financial records when rolling application code back. Do not drop them to roll back a release. Older application code contains the audited payment/replay defects; pause checkout and inbound actions at the deployment/router level during an emergency rollback. In particular, clearing payment keys on the old version would reopen its unpaid checkout behavior. Resume only after deploying a version with the safeguards or explicitly managing the outstanding payments.

## References

- [Razorpay capture verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps)
- [Razorpay refund idempotency](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md)
- [Patched minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [Unpatched deepmerge advisory removed with the unused generator](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
