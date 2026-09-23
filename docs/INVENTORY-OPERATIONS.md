# Cake Availability and operations

## Audit and architecture

The application uses Next.js App Router, Clerk identity, database-owned roles, Prisma/PostgreSQL, and server actions. Customer checkout freezes prices and cake configurations into Order/OrderCake. VendorOrder already records assignment attempts and production state; Order.currentAssignmentId identifies the live attempt. NotificationOutbox provides transactional events. Supabase realtime is not installed; current assignment screens refresh every ten seconds.

Existing uncommitted changes include assignment routing, delivery, checkout, and storefront work. This implementation extends those changes without reverting them. Customer statuses remain separate from vendor production statuses. The 3D builder and payment integration are out of scope.

## Plan

1. Track binary `isAvailable` for each bakery/product/size/egg-type combination. Missing rows are unavailable.
2. Recheck exact variants inside assignment and acceptance transactions, sharing the assignment lock with availability edits.
3. Require admin selection by default. Assignment creates an offer requiring vendor acceptance. Offers, acceptance, rejection, expiry, cancellation, reassignment and handover never change availability or create stock reservations.
4. Reuse portal authorization for inventory toggles, candidate selection and operational dashboards. Audit explicit availability changes.
5. Deliver scoped, durable browser notifications from committed database events, with read receipts, sound opt-in and deduplication.

Multiple cakes of the same variant require that variant to be available once. Different sizes, egg types and products must each be available. Bakery capacity remains a separate concurrent-order constraint.

## Deployment and operation

Stop old quantity-writing app instances and workers before applying migrations with `npm run db:deploy`; regenerate Prisma with `npm run db:generate`, then start the updated app and workers. The binary migration is `9f_binary_cake_availability`, after `9d_smart_assignment` and `9e_vendor_inventory`. Do not use `db push` to remove retained legacy tables or columns.

Existing inventory becomes available only when its old `active` flag is true and `totalStock > reservedStock`. Missing inventory remains unavailable. The schema default is intentionally `false`; the Add Cake flow explicitly creates the selected variants as **In Stock** (`isAvailable: true`). Vendors/admins must verify each exact variant in inventory. Historical quantities, reservation records and stock history remain in PostgreSQL for audit but are no longer read or written by assignment operations. Existing accepted work can continue after availability turns off; new offers and acceptance require current availability. Handover does not consume inventory, and admin delivery transitions still require vendor handover.

Rollback requires stopping new writers, deploying the previous app/client and reconciling quantities and reservations for orders processed since cutover. Retained quantities are a pre-cutover snapshot, not current stock; retain the availability audit as well.

Initial assignment requires admin selection. `ASSIGNMENT_AUTO_REASSIGN=false` is the default. With `true`, admin-created rounds queue eligible fallback bakeries; rejection or expiry rechecks exact variant availability, capacity and deadlines before offering to the next bakery. Capacity cannot be bypassed with the current assignment service; availability is always required.

`ASSIGNMENT_RESPONSE_SECONDS` defaults to 900. Run the existing assignment worker regularly to expire unanswered offers even when no vendor is viewing them. The existing protected `/api/internal/assignments` endpoint and `npm run assignments:worker` remain available. Keep the worker secret private.

Browser notifications use authenticated server-sent events over committed PostgreSQL records. Streams check for new events every 2.5 seconds and reconnect every 25 seconds. This is database-backed near-realtime delivery, not Supabase. Each user has durable read receipts. Audio uses a short Web Audio tone after opt-in, with remembered volume, duplicate event suppression, a test button, and a visible blocked-audio message. Visual alerts remain available without audio.

The shared assignment advisory lock is intentionally retained. It serializes short database mutations across dispatch operations; routing provider requests run outside the transaction. Availability edits use the same lock so transaction-time checks see a consistent state. If measured throughput requires it, partition the lock by dispatch region.

## Verification

The PostgreSQL integration suite covers exact variants (A/C available, B unavailable even with other available variants), repeated and simultaneous assignments without decrement, stale-candidate availability rechecks, stale assignment IDs, rejection/reassignment, accepted production after availability turns off, cancellation races, expiry, optional fallback offers, pickup, multi-cake availability and immutable earnings.

Run the database suite only against an isolated scratch database:

```sh
ASSIGNMENT_TEST_DATABASE_URL=postgresql://... npm test
npm run typecheck
npm run lint
npm run build
```

Use an explicitly isolated PostgreSQL scratch database; do not point the integration suite at production. Live authenticated browser testing still requires actual admin/vendor sessions.
