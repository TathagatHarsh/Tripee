# Admin and vendor functionality audit — 10 November 2026

What this repo does: MakeYourCakes takes cake orders, lets the admin select a partner bakery, and lets that bakery accept, prepare, dispatch and complete deliveries. This review assumes a small launch with multiple staff sessions and concurrent orders, not large marketplace traffic.

**Verdict: not ready for unconditional production sign-off. The isolated core workflow works, but four reproduced code defects and three additional browser findings remain. Fix the disappearing delivery cards, resolve bakery deactivation handling, and restore the deployed Payment follow-up page before launch. Authenticated admin browsing now works; the live vendor journey remains unverified. All seven deployed bakeries were inactive during this check.**

Scope: local working tree at commit `519c67e`, including the user's pre-existing uncommitted files. This is not proof that the production deployment runs the same code. The earlier production audit and remediation report were read as context. No application code was changed, no production records were modified, and no payment or notification was sent.

## Must fix

### 1. Sent-out orders disappear from the vendor's working board — P1

**What this is:** The vendor must mark an order delivered after sending it out.

**Problem:** `vendorBoard()` returns `handed_over` assignments whose orders are `out_for_delivery`, but the page renders only the four `VENDOR_COLUMNS`: assigned, accepted, in preparation and ready. The card disappears immediately after dispatch, even though `vendorNext()` still returns `delivered`. Filtering the board to “Sent out” also produces no cards. Counts can say an active order exists while every column is empty.

**Evidence:** `app/vendor/data.ts:47`, `app/vendor/page.tsx:102`, `lib/vendors.ts` (`VENDOR_COLUMNS`, `VENDOR_DELIVERY_NEXT`). The isolated reproduction completed acceptance → preparation → ready → dispatch, read one active board row with `delivered` as its next action, and found zero matching rendered columns.

**Fix:** Render an out-for-delivery column or section using the returned handed-over cards. Preserve the retry action for a handover whose automatic customer-status update did not finish.

**If we skip it:** Vendors can miss the completion step and customers continue seeing out-for-delivery. Workaround: open Order history, then the order detail, and mark delivered there. This workaround is less reliable once history exceeds its limit; see finding 4.

### 2. Deactivating a bakery can strand its accepted orders — P2

**What this is:** Admin can deactivate a vendor while it still holds orders.

**Problem:** The action changes only `isActive` and says existing orders are untouched. Vendor access and fulfillment then refuse the inactive bakery. An admin cannot dispatch a ready assignment either: the shared transition requires `handed_over`. The worker handles pending assignments and expired offers, not accepted assignments held by inactive vendors.

**Evidence:** `app/admin/actions.ts:1206`, `lib/auth.ts:300`, `lib/assignment.ts:545`, `lib/orderTransition.ts:44`, and `lib/assignment.ts:566`. Reproduction: accept → prepare → ready → deactivate. Vendor handover returned false, admin dispatch returned false, and the assignment worker left the same current assignment in place.

**Fix:** The smallest safe change is to refuse deactivation while the bakery holds unfinished orders and show the affected references. Use the existing “Not accepting orders” setting to pause new work while existing deliveries finish. If emergency access revocation is needed, provide an explicit admin recovery path rather than silently stranding work.

**If we skip it:** The admin must reactivate the bakery or reassign eligible work to another bakery. Reassignment can restart production and may be impossible near the deadline. This is an operational dead end until staff intervene, not permanent database corruption.

### 3. Vendor-started preparation omits the customer's baking notification — P2

**What this is:** Customers have an implemented “Your cake is being baked now” update.

**Problem:** Vendor preparation writes the customer order status directly in `moveFulfillment()`. It records the order event but skips the customer notification work in `applyStatusTransition()`. The assignment event informs staff; it does not enqueue the customer's baking message. The same customer status therefore produces different notifications depending on who moved it.

**Evidence:** `lib/assignment.ts:553–561`, `lib/orderTransition.ts:124`, and `lib/whatsappEvents.ts` (`whatsappAssignmentEvent`, `whatsappOrderStatus`). With fake WhatsApp configuration and no worker/network sends, vendor preparation produced zero customer `in_kitchen` outbox rows. An admin transition on a separate order produced one.

**Fix:** Enqueue the customer status notification in the same transaction when vendor preparation actually changes the order status, using the existing deduplication key. Preserve atomicity and avoid calling the separate transaction recursively.

**If we skip it:** The tracking page updates, but the customer misses the preparation message. Later dispatch/delivery notifications still use the shared transition path.

### 4. Vendor history search cannot find older orders — P2

**What this is:** The vendor Orders page advertises every order and offers reference, customer, cake, status and date filters.

**Problem:** `vendorHistory()` first takes only the latest 60 assignments. The page then applies search and filters to that subset. There is no pagination or load-more path, so an exact reference for an older order returns an empty result despite the order still being accessible by its detail URL. Long-running active orders can also fall outside the history subset.

**Evidence:** `app/vendor/data.ts:135–142`, `app/vendor/orders/page.tsx:48`, and `app/vendor/QueueFilters.tsx`. Reproduction created an older assignment and 60 newer assignments on distinct orders. The old reference was absent from history but still returned by `vendorOrder()`.

**Fix:** Apply search/date/status filters in the database before limiting results and add pagination. Fetch active work independently so historical volume cannot hide it.

**If we skip it:** After 60 assignments, vendors cannot reliably look up older customer orders from the panel. The dispatch-card defect becomes harder to work around.

## Verification and coverage

| Area | Result and limits |
| --- | --- |
| Existing unit suite | 856 passed. The default run skipped 105 integration tests; these were run separately. |
| Existing PostgreSQL integration suites | All 105 passed across assignment, delivery, payments, paid order routes and WhatsApp. Fresh isolated local database; migrations applied successfully. |
| Additional audit reproductions | 5 passed: one positive full workflow/cross-vendor denial check and four assertions confirming the defects above. These are evidence assertions, not passing regression tests for desired behavior. |
| TypeScript | Passed before the temporary reproduction harness was added. Application source was unchanged. |
| Core vendor lifecycle | Real local database: assign → accept → prepare → ready → handover → delivered succeeded. An unrelated vendor could neither read the detail nor start preparation. Identity and routing providers were mocked. |
| Assignment safeguards | Reviewed exact assignment IDs, capacity, inventory, availability, deadline checks, expiry, rejection, reassignment, earnings snapshots and transaction locking. Existing integration coverage passed. |
| Admin and vendor authorization | Reviewed database-backed roles, page/action guards, scoped inventory writes, assignment endpoints, portal scope and vendor earnings access. A live admin session was verified in the browser follow-up. Separate live vendor sessions were not established. |
| Catalogue and operations | Reviewed cake creation/editing/variants, availability, photo handling, vendor setup/linking, pricing, zones, delivery slots, closed days, order status/cancellation and payment follow-up. Source review and existing tests were supplemented by the read-only deployed browser checks below. Saving forms and live state transitions were not tested. |
| Notifications | Reviewed portal updates and assignment/customer WhatsApp paths. Reproductions inspected queued records; no real messages were sent. |
| Production build, lint, dependency audit | Not rerun in this focused audit. Their previous passes are documented in the earlier fix report, not counted as new verification here. |

Evidence: [unit log](admin-vendor-audit-2026-11-10/unit-tests.log), [integration log](admin-vendor-audit-2026-11-10/integration-tests.log), [reproduction log](admin-vendor-audit-2026-11-10/reproductions.log), [typecheck log](admin-vendor-audit-2026-11-10/typecheck.log), [migration log](admin-vendor-audit-2026-11-10/migrations.log), and [reproduction source](admin-vendor-audit-2026-11-10/panelsAudit.repro.test.ts.txt).

The reproduction source is retained outside `tests/` so ordinary test runs do not execute audit fixtures. To rerun, copy it back to `tests/panelsAudit.repro.test.ts` and run Vitest against the explicitly guarded disposable local database. It intentionally asserts existing defects; convert assertions to desired behavior when fixing them. It must never run against production.

## Deployed browser follow-up — 10 November 2026

The earlier account-load failure was superseded by a successful authenticated admin session at `https://makeyourcakes.com/admin`. It is no longer recorded as an unresolved general access blocker. These checks used the existing Brave session and the visible UI. They did not modify deployed records or send payments/messages.

### 5. Payment follow-up fails to load on the deployment — P1

**Problem:** `/admin/payments` repeatedly displayed “A BRIEF INTERRUPTION” / “We couldn’t load this page.” The admin navigation shell remained visible. Both “Try again” and fresh direct navigation reproduced the failure while other admin pages loaded.

**Impact:** Staff cannot use this page to inspect payment recovery and refund follow-up during launch. This observation does not prove payment collection itself is broken.

**Evidence:** Live browser rendering and screenshot during this audit. The page reads payment recovery/refund data, but the browser error does not identify the failing query or service.

**Fix/verification:** Inspect the corresponding server exception, verify the deployed schema/migrations and runtime configuration, fix the actual cause, then confirm this page loads with the same admin account. A missing migration is only a hypothesis, not an established diagnosis.

### 6. Vendor management disappears from navigation when no bakery is active — P2

**Problem:** All seven bakeries were inactive. The sidebar omitted both Vendors and Cake Availability, although direct `/admin/vendors` and `/admin/inventory` access worked. An administrator trying to onboard or reactivate the first bakery has no visible sidebar entry to that management page.

**Evidence:** Browser sidebar and vendor list; `lib/adminNav.ts:101–102` marks these links `partnersOnly`, `app/admin/layout.ts:95–100` supplies `hasActivePartners()`, and `components/admin/Shell.ts:245` filters those links out.

**Fix:** Keep vendor management reachable regardless of active-bakery count. An empty-state prompt can explain how to activate the first bakery.

### 7. Delivered order still says “Waiting for vendor response” — P3

**Problem:** Delivered order `MC-EZU933` showed its assigned bakery and an accepted assignment history, but the assignment panel still displayed “Waiting for vendor response.” This gives staff conflicting information about the current state.

**Evidence:** Live order detail. Manual assignment sets this note in `lib/assignment.ts`; acceptance changes `assignmentState` to `ASSIGNED` without clearing the note. `components/assignment/AdminPanel.tsx` renders the note without checking whether it is still current.

**Fix:** Clear or replace the pending-response note when acceptance succeeds, or render that message only for a genuinely pending response. Preserve historical events.

## Deployment readiness observations

- **No active bakery:** `/admin/vendors` showed **0 active of 7**. The vendor-driven launch needs a deliberately configured, active real bakery with a linked vendor login, service coverage and inventory. An “accepting orders” availability setting on an inactive bakery does not make it active. No bakery was activated by this audit.
- **Photo uploads unavailable:** Both the cake list and editor displayed “Photo uploads aren't set up on this deployment yet,” with instructions to create a Vercel Blob store and redeploy. Existing cake images rendered, but admin photo upload/replacement is not ready. Configure storage and verify an upload if this capability is required at launch.

- **Vendor login setup remains incomplete:** Staff listed only one admin and no vendor-role users. The current admin account is correctly denied the partner portal; a linked active-vendor account is required for the remaining live checks.
- **Bakery email/alerts setup:** Settings contain `orders@makemycake.example`. Public branding normalizes this legacy domain in some views, so this is not proof that all customer pages display an invalid address. Replace the stored placeholder with the intended real address. The notification setting explicitly states email sending is not wired up; do not rely on it for order alerts. Live-update status did connect during this check; real event/sound delivery was not exercised.

## Browser coverage and limitations

| Page / interaction | Observed result |
| --- | --- |
| Admin dashboard | Loaded; empty current-work state rendered. |
| Orders and status filters | Loaded; 0 open, 3 delivered and 7 cancelled; all-status view showed 10 records. |
| Delivered order detail | Loaded saved cake specifications, payment state, timeline and assignment history. Stale response note recorded as finding 7. |
| Vendors, direct URL | Loaded all 7 inactive records; management links missing from sidebar (finding 6). |
| Bakery detail | Loaded availability, capacity, coverage, commercial settings and assignment history. No save/reactivation performed. |
| Cake availability | Loaded 4 in-stock variants; out-of-stock filter correctly showed an empty result; clearing filters restored rows. |
| Add Cake inventory picker | Opened and selected a cake; existing variant combinations were excluded, remaining combinations offered; Add Selected disabled without selection. Closed without saving. |
| Payment follow-up | Repeated page-load failure (finding 5). |
| Delivery slots and zones | Loaded configured fees, lead times, slots and 3 active zones. No edits; checkout enforcement was not retested here. |
| Cake catalogue | Loaded 21 cakes (20 on, 1 off); photo-storage warning shown. |
| Cake editor | Loaded recipe/allergen fields, variant prices and existing image. Order-linked cake showed deletion restriction. No save or upload performed. |
| Staff | After unlock, loaded successfully: one admin listed, no vendor-role users shown. Role management is intentionally read-only here. |
| Bakery settings | Loaded identity/contact fields. Stored email is `orders@makemycake.example`; order-email notification field explicitly says sending is not implemented. No save performed. |
| Daily deliveries | Today correctly showed 0; Earlier showed 3 delivered orders and excluded cancelled orders. Selecting ZZ Test Bakery reduced the list to 1 of 3. |
| Vendor panel | Navigating to `/vendor` with the admin session redirected to `/account?denied=vendor` with an explicit account-not-linked explanation. This verified denial for this account, not a vendor login. Live board, history, earnings, stock writes and fulfillment clicks remain unverified. |

The browser checks verify rendering and the specific read-only interactions above, not successful saves, assignment/reassignment, cancellation, fulfillment, notification delivery or refund execution. Browser findings describe the deployed behavior observed; its exact commit was not established.

Before launch, fix/retest the blockers and verify a real admin account plus two separate vendor accounts on the intended deployment: sign-in, assignment, acceptance, every fulfillment step, rejection/reassignment, inventory changes, deactivation safeguards and cross-vendor denial. Use explicitly disposable orders for state-changing tests. Confirm the deployed commit and migrations match the reviewed code. The earlier report's gateway/webhook/worker rollout checks still apply.

Not checked: mobile interaction/accessibility, actual Meta/Razorpay delivery, deployed worker schedules, production secrets, backup/restore, or sustained load. This is a focused functional audit with explicit coverage, not a guarantee that every possible edge case is absent.
