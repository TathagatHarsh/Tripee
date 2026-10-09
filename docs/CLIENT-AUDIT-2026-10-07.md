# Client review audit — 7 October 2026

This audit covers the current working tree, including the uncommitted map, location and portal changes. Product code was reviewed without applying fixes. All synthetic orders and transaction tests used a newly created local PostgreSQL database. No real payments or external notifications were sent.

**Assessment: several important flows work, but this version should not yet be presented as ready for production payments and fulfillment.** Passing unit tests do not cover the gaps between checkout, product specifications, assignment and the kitchen.

## Verification

| Check | Result |
|---|---|
| TypeScript | Passed |
| ESLint | Passed |
| Unit + database integration tests | 729 passed across 44 files; gateway calls mocked |
| Fresh database migrations | All 19 applied successfully |
| Fresh catalogue seed | 95 options, 21 presets and 21 cake products |
| Isolated production build | Passed |
| Browser / accessibility tests | Across the completed checks: 37 passed, 11 failed, 14 skipped; see breakdown below |
| Dependency scan, full installation | 30 affected package entries: 3 critical, 21 high, 6 moderate |
| Dependency scan, production dependency graph | 11 affected package entries: 2 critical, 9 high |

The first build against the already-configured database emitted `EMAXCONNSESSION` errors with a session-pool limit of 15, although the build completed. The isolated build did not. An initial browser run was discarded because reusing the build directory carried cached catalogue data between database environments; the authoritative browser run uses a fresh directory.

## Fix before production use

### 1. Payment can succeed without any order being created — P1

**Trigger:** a customer pays, then closes the tab or loses the gateway callback before the browser posts the order.

**Impact:** money is taken without an order, and no server process reliably creates the order or refunds it. Saving payment proof in the browser only helps if that browser receives and preserves the callback.

**Evidence:** [CheckoutForm.tsx](/Users/tathagatharsh/Desktop/Tripee.nosync/app/checkout/CheckoutForm.tsx:414) saves proof and posts `/api/orders` after the client callback. There is no gateway webhook/reconciliation route. The [payment design document](/Users/tathagatharsh/Desktop/Tripee.nosync/docs/superpowers/specs/2026-10-06-razorpay-checkout-design.md:129) explicitly defers this until before going live.

**Fix:** persist the complete checkout intention server-side, verify gateway events, and reconcile captured payments into an order or a tracked refund. This was traced in code; no live payment was made.

### 2. Newly created cakes can be sold but cannot be assigned — P1

**Trigger:** an admin creates a cake with a valid production specification and no optional 3D configuration. This is a supported product shape.

**Impact:** checkout accepts it, but matching bakery inventory cannot make the order assignable.

**Evidence:** [configForVariant](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/cakes.ts:382) returns null for this product shape; [order creation](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:356) saves that null configuration. [variantNeeds](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/inventoryRules.ts:6) requires size and eggless inside the visual configuration and throws otherwise. A synthetic order was accepted with status 201; the inventory helper reproduced “Order has no verifiable product variant.”

**Fix:** freeze structured product/variant details independently of the optional visual configuration, and use those details for inventory and assignment.

### 3. Paid cake messages disappear for these products — P1

**Trigger:** buy the same product with a personalized message.

**Impact:** the customer pays for piping, but the baker never receives the words.

**Evidence:** a synthetic pickup order with “Happy Birthday Client” returned 201. Its saved cake had `config: null`, a `1kg · Eggless` label and an ₹80 “Message piping” charge, but no saved message text. [OrderCake creation](/Users/tathagatharsh/Desktop/Tripee.nosync/app/api/orders/route.ts:354) has no independent message field.

**Fix:** retain customer customization separately from the optional 3D configuration, and display it on every production ticket.

### 4. Kitchen tickets omit additional cakes and saved production instructions — P1

**Trigger:** purchase several cakes, or a product with an authored production specification and no visual configuration.

**Impact:** the kitchen sees only the first legacy configuration, or an unreadable-configuration notice. Other cakes and the authoritative instructions are missing from this workstation.

**Evidence:** [Kitchen query](/Users/tathagatharsh/Desktop/Tripee.nosync/app/kitchen/page.tsx:123) does not include `Order.cakes`; [ticket rendering](/Users/tathagatharsh/Desktop/Tripee.nosync/app/kitchen/page.tsx:241) reads only `Order.config`, and [its specification](/Users/tathagatharsh/Desktop/Tripee.nosync/app/kitchen/page.tsx:352) is regenerated instead of using saved per-cake production records. The parent order carries only the first cake's configuration.

**Fix:** render all saved cake rows with their frozen production specifications, ordered variant details and customer customization. The vendor detail already has a suitable per-cake rendering path.

### 5. Recovery after a lost order response can be blocked by a new quote — P1

**Trigger:** an order commits but the response is lost. Before retry, capacity fills, the date becomes invalid or the product is withdrawn.

**Impact:** the browser refuses to retry even though the server can recover the existing order. For paid checkout this can strand the customer with a saved payment proof.

**Evidence:** [Checkout readiness](/Users/tathagatharsh/Desktop/Tripee.nosync/app/checkout/CheckoutForm.tsx:293) requires a current quote and a present product; [place()](/Users/tathagatharsh/Desktop/Tripee.nosync/app/checkout/CheckoutForm.tsx:371) returns before making a request when those checks fail. The server correctly [replays completed attempts](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkoutValidate.ts:193) before mutable availability checks, but this UI path cannot reach it.

**Fix:** recover an existing submitted attempt before requiring new availability or payment.

### 6. Runtime dependencies have critical published advisories — P1

The installed Next.js 16.2.12 and MapLibre GL 5.24.0 fall within affected version ranges reported by `npm audit`. MapLibre's attribution sanitizer is affected by an XSS bypass; this app loads third-party map styles. Next's image optimization stack is affected by an AVIF-related advisory. Sharp also has high-severity dependency advisories.

Primary sources: [MapLibre advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579), [Next image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).

**Fix:** update to compatible patched releases and rerun build, image, map and checkout checks. The advisory counts are affected dependency entries, not 30 independently demonstrated exploits. Reachability depends on the affected feature and deployment; no exploit was attempted. Avoid a blind `npm audit fix --force`: some suggested fixes change major versions or downgrade tooling.

## Other confirmed defects

| Priority | Defect and concrete consequence | Evidence / fix direction |
|---|---|---|
| P2 | Two simultaneous requests for the same payment intention can return different gateway orders; the later write overwrites the earlier binding and the earlier payment cannot complete checkout normally. | [checkoutPayment.ts:68](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/checkoutPayment.ts:68). Serialize creation and preserve the first valid binding. |
| P2 | Enabling the 3D builder does not restore a working order journey: its submit body lacks required fulfillment details and the payment flow. | [review/page.tsx:126](/Users/tathagatharsh/Desktop/Tripee.nosync/app/build/review/page.tsx:126). Schema validation reproduced missing `fulfillment`; use the current checkout flow. Currently gated off, so this is conditional. |
| P2 | The photo UI permits 8MB files, but original files are posted through Server Actions with Next's default 1MB request-body limit. Phone photos fail before application validation. | [imageSpec.ts:60](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/imageSpec.ts:60), [next.config.ts:16](/Users/tathagatharsh/Desktop/Tripee.nosync/next.config.ts:16). Align transport, hosting and displayed limits or upload directly through an authorized storage path. |
| P2 | EXIF portrait photographs can crop the wrong area or fail completely. Calling `metadata()` after scheduling `.rotate()` still reports original dimensions. | [storage.ts:144](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/storage.ts:144). A 120×80 orientation-6 image produced an 80×120 oriented image, while the current crop calculation caused `extract_area: bad extract area`. Use oriented dimensions. |
| P2 | Unanswered pickup offers are excluded from worker expiry; they remain offered and can occupy capacity. | [assignment.ts:548](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/assignment.ts:548). Include supported pickup orders in expiry discovery. |
| P2 | A process interruption after claiming a notification leaves it permanently `sending`; future workers only select pending/failed rows. | [notifications.ts:58](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/notifications.ts:58), [claim at line 71](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/notifications.ts:71). Use an expiring claim and recover stale claims with the same idempotency key. |
| P2 | The configured database pool reached its 15-client session limit during the production build. The application creates a default connection pool per process without an explicit pool budget. | [db.ts:24](/Users/tathagatharsh/Desktop/Tripee.nosync/lib/db.ts:24). Budget connections across build workers and runtime instances and verify deployment pool capacity. Build success does not prove load resilience. |
| P2 | The homepage hero image link has no accessible name when its cake has no photo. The fallback drawing discards the supplied alt text. | [Home hero](/Users/tathagatharsh/Desktop/Tripee.nosync/app/page.tsx:97), [CakePhoto fallback](/Users/tathagatharsh/Desktop/Tripee.nosync/components/shop/CakePhoto.tsx:45). Axe reproduced a serious `link-name` violation with the valid synthetic product. Give the link an explicit cake name. |
| P2 | Checkout success tests use delivery bodies with no location, despite the mandatory pin requirement. Shop browser tests also expect a 0.5kg Pineapple variant which the fresh seed does not create. These tests fail before exercising the intended journey. | [checkout.spec.ts:32](/Users/tathagatharsh/Desktop/Tripee.nosync/e2e/checkout.spec.ts:32), [shop.spec.ts:27](/Users/tathagatharsh/Desktop/Tripee.nosync/e2e/shop.spec.ts:27). Update fixtures and keep a separate rejection check for missing pins. |
| P3 | Handoff documentation is stale: README says payments, login and admin are not started, although they exist. Some configuration comments also describe superseded auth/payment behavior. | [README.md:13](/Users/tathagatharsh/Desktop/Tripee.nosync/README.md:13). Rewrite the current feature/configuration and verification sections before handoff. |

## Coverage and limits

Reviewed storefront/product variants, cart add/edit/persistence, delivery-location and checkout state, pricing and capacity, payment/refund/idempotency handling, receipts/guest tracking, builder gate/submission, admin/vendor actions, inventory and assignment, kitchen tickets, lifecycle transitions, uploads, notification workers, role guards, API authorization, deployment configuration and test coverage.

No confirmed cross-account access or admin privilege escalation was found in the reviewed guards. Anonymous portal access and guest-order separation were exercised by browser tests. This is not a claim that every authenticated session or every deployment configuration was tested.

Live Clerk customer/admin/vendor sessions, real gateway capture/refund behavior, deployed worker scheduling, notification delivery, live hosting request limits, provider domain restrictions, load testing and all-device visual baselines remain unverified. Builder interaction tests are skipped when its flag is off; its submit defect was verified through code and schema validation. Payment integration tests use a mocked gateway.

The local environment is a demo configuration: Clerk development keys, Razorpay test keys, and the builder disabled. Blob credentials, the assignment-worker secret and external notification configuration are absent locally. These facts do not establish the configuration of any deployed site; confirm them there before promising uploads, unattended offer expiry or external messages to the client.

Mobile smoke checks at 390×844 served the homepage, shop, product and checkout successfully, found no horizontal page overflow or uncaught JavaScript errors, and reached an enabled pickup order button. Screenshots are saved in `docs/client-audit-2026-10-07/`.

### Browser result detail

The full run completed accessibility, anonymous authorization and checkout API tests. The slow shop tests were rerun separately with a 20-second timeout after the first one established that their expected size did not exist. Combined unique results are **37 passed, 11 failed, 14 skipped** out of 62 tests. Four failed checkout checks use outdated bodies missing the mandatory pin; five failed shop checks stop at the unavailable 0.5kg selector. The two accessibility failures are the same unnamed hero-link defect, observed on the homepage and with its account menu open. Skipped checks require the disabled builder or a live Clerk configuration.

The existing temporary map suite was also attempted: three tests failed on the initial exact “Add to cart” selector before reaching the map. One case was interrupted and one did not run after the repeated setup error was established. It does not provide map regression proof in this seed environment.

An independent mobile walkthrough using a real seeded product reached map address selection and confirmation, created a delivery order with HTTP 201, and preserved its confirmation after refresh. Location/geocoding responses were stubbed; actual order placement used the scratch database, and the map used the raster fallback. Live Ola rendering/geocoding was not claimed as verified here.

A separate guest-tracking check created a synthetic pickup order, waited for its exact reference heading to render, refreshed and verified the same reference again. A different browser context received 503 from the unconfigured-auth refusal path. This confirms the guest cookie path in the isolated server, while signed-in tracking remains outside the runtime coverage.

Evidence logs and dependency reports are saved alongside the screenshots. The first discarded browser run is not included in the pass/fail totals.

Before the client review, use a known seeded cake for the demo, show the builder as upcoming, and describe payment/fulfillment completion as pending these fixes. Before launch, resolve the P1 findings, the upload and worker failures, and establish a passing current browser suite and a real authenticated/gateway walkthrough.
