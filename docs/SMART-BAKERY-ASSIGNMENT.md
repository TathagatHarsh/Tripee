# Smart bakery assignment

The existing `Vendor`, `VendorOrder`, `VendorOrderEvent`, `Order`, pricing snapshots and Clerk roles remain the authorities. `VendorOrder` is the order-assignment model; there is no duplicate `OrderAssignment` table. The 3D builder remains disabled.

## Setup and complete demo

Use a development/staging database, not your live order book:

```sh
npm ci
npm run db:deploy
npm run db:seed
npm run demo:assignments
npm run dev
```

Set `ASSIGNMENT_WORKER_SECRET` in the app environment. In another terminal:

```sh
npm run assignments:worker -- --watch
```

`ASSIGNMENT_APP_URL` defaults to `http://localhost:3000`. The demo worker polls every 15 seconds. For production, schedule authenticated POSTs to `/api/internal/assignments` every 15–30 seconds. With `ASSIGNMENT_AUTO_REASSIGN=true`, rejections advance immediately in the same transaction; otherwise they return to admin selection. Expiry/recovery require this worker. Offers expire by server time even if the worker is late, so late acceptance cannot win.

1. Seed creates **Sweet Crumbs (A)**, **Cake Studio (B)** and **Oven House (C)** near Jubilee Hills without overwriting existing vendor settings. It selects an available catalogue cake and logs its exact size and egg type; new inventory rows mark A/C available and B unavailable. Re-running preserves existing availability flags. Create a catalogue cake first if none exists.
2. Use `/admin/vendors` to link separate signed-in Clerk accounts. Verify each bakery's acceptance, capacity, service radius and capabilities. New demo vendors accept all products within 25 road km with capacity 20; exact variant availability is still required.
3. Open **Cake Availability** and verify the logged variant: A/C **In Stock**, B **Out of Stock**. Availability of a different product, size or egg type does not satisfy this variant.
4. Order that exact variant near **17.431, 78.407**, Jubilee Hills, Hyderabad, Telangana **500033**, with a complete postal address, delivery pin and date.
5. Open `/admin/orders/MC-…`. A/C should be eligible if all other rules pass; B should be unavailable. Checkout leaves selection to the admin. Explicitly assign A; it receives an offer requiring acceptance.
6. Reject A's offer with **Too busy**. By default the order returns to admin selection; assign C and accept from C's account. To demonstrate automatic fallback instead, set `ASSIGNMENT_AUTO_REASSIGN=true` before assigning A. B is excluded in either mode.
7. Repeat with another order for the same variant. Availability stays unchanged; concurrent-order capacity still applies. Turn C's exact variant off after loading candidates and try assigning it: the server must reject the stale selection. Turning it off after an offer also prevents acceptance.
8. An already accepted order can continue through **Start preparation → Ready → Handed over**, even if availability is later switched off. Handover never decrements availability. The admin/kitchen then dispatches and delivers; customer tracking shows the accepted bakery and production state.
9. Reject or let all offers expire to return the order to main bakery attention. Manual reassignment also creates an offer requiring vendor acceptance; it never bypasses variant availability or capacity.
10. To demonstrate expiry, set `ASSIGNMENT_RESPONSE_SECONDS=15`, restart the app and leave an offer unanswered while the worker runs. Restore 900 afterward.

Road ranking depends on real routes and `ASSIGNMENT_STRATEGY`; seed labels are not hardcoded ranking overrides. Provider failures show clearly marked approximate distances. No tile/geocoder/notification service is required to run dispatch for an order with a valid pin.

If the delivery address cannot be geocoded unambiguously, the order stays confirmed and returns to the main bakery. The admin can verify coordinates with the customer, save the corrected pin on the order page and start a new round. Existing attempts remain in the history.

## Providers

`lib/mapping.ts` owns `GeocodingProvider` and `RoutingProvider`. Its public functions are `getCoordinatesFromAddress`, `getRouteDistance`, `getTravelTime` and `getDistanceMatrix`. Components and actions never construct provider API calls.

- `GEOCODING_URL`: hosted/self-hosted Nominatim-compatible base URL. No default public Nominatim endpoint. Search is explicit submission, not autocomplete. Configure `GEOCODING_USER_AGENT` with your operations contact. To use a different protocol, implement `GeocodingProvider` and change the server's default provider.
- `ROUTING_URL`: OSRM-compatible base URL. The public OSRM demo is the development default. Production should use a hosted/self-hosted service with suitable coverage and capacity. The table service batches 40 origins and requests both distance and duration. Known unreachable routes are excluded. Timeouts/provider failures fall back to marked Haversine estimates at an assumed 20 km/h.
- `NEXT_PUBLIC_MAP_TILE_URL`: Leaflet-compatible raster tile URL, default OSM standard tiles. Set `NEXT_PUBLIC_MAP_ATTRIBUTION` to the attribution required by your provider. These are build-time values. Tiles are solely visual and never influence assignment.
- `ASSIGNMENT_STRATEGY`: `distance` (default) or `time`; stable distance/vendor-ID tie breaking.
- `ASSIGNMENT_RESPONSE_SECONDS`: integer 10–86400, default 900.

Provider deployment must follow the service's limits and privacy terms. See [OSRM table documentation](https://project-osrm.org/docs/v26.6.1/http), [Leaflet attribution documentation](https://leafletjs.com/reference), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/). Public demo endpoints are not production SLAs. Customer addresses go only to the explicitly configured geocoder.

## Database and invariants

Migrations: `9d_smart_assignment`, `9e_vendor_inventory`, then `9f_binary_cake_availability`. See [inventory operations](INVENTORY-OPERATIONS.md) for cutover, legacy audit retention and rollback.

- Vendor location, accepting-orders switch, road service radius, maximum concurrent orders, temporary unavailability, supported product IDs/all-products opt-in, commission basis points and fixed fee in paise.
- `VendorOrder.assignmentStatus`: `PENDING`, `OFFERED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`; separate from the unchanged production status enum.
- Sequence, route source/distance/duration, offer/deadline/response timestamps and order-value/commission/fee/earning snapshots on each attempt.
- `Order.assignmentState`: `PENDING → ASSIGNING → OFFERED → ASSIGNED`, or `MANUAL` when intervention is required. New delivery orders are confirmed server-side at checkout. Pickup keeps its prior confirmation workflow.
- Existing FK history and the single current-assignment pointer are reused. A unique `(orderId, sequence)` index and a PostgreSQL partial unique index enforce one live offer/accepted assignment per order. Expiry and vendor/status indexes support queues.
- Assignment transactions take one short deployment-wide advisory lock, then the order row. This serializes capacity checks across orders and prevents acceptance/rejection/reassignment/cancellation races. Network requests run outside the lock. Partition the lock by dispatch region if measured throughput warrants it.
- `VendorInventory.isAvailable` is authoritative for the exact product, size and egg type; absent rows fail closed. The Add Cake flow explicitly creates selected variants as **In Stock**; the schema default remains intentionally false. There are no stock reservations or quantity deductions. Repeated same-variant cakes only require one available variant.
- Capacity counts current offered/accepted production commitments until handed over or the order closes. It is a conservative concurrent-order limit, not a cake/day/calendar forecast. Recheck eligibility before offer, acceptance and manual assignment.
- Vendor earnings = frozen product subtotal − rounded commission − applied fixed fee. Commission is in basis points; fees cap at the remaining subtotal. Tax and the customer's delivery charge are excluded. Changing vendor rules cannot rewrite a previous quote.
- Previous attempts and timestamps are migrated. Historical earnings stay **not recorded** rather than being guessed. Existing unassigned orders are left for the main bakery; existing vendors must explicitly opt into automatic offers.
- All assignment events use the existing durable notification outbox. Event payloads distinguish offered, accepted, rejected, expired, reassigned, manual assignment/intervention and location correction. A notification provider is optional.

## APIs and actions

All writes validate server-side; ownership is taken from the session. Conflicting/stale acceptance returns HTTP 409. Vendor forms use the exact assignment ID, so a stale page cannot accept a replacement offer.

| Endpoint/action | Scope | Purpose |
|---|---|---|
| `POST /api/location` | Public, rate-limited, same-origin | Explicit geocoding search/reverse lookup |
| `GET /api/assignments/:ref` | Admin | Full attempt/event history and current state |
| `GET /api/assignments/:ref?eligible=true` | Admin | Fresh eligible bakery ranking |
| `POST /api/assignments/:ref` `{action:"start"}` | Admin | Idempotent initialization/recovery; initial selection stays with admin |
| Same endpoint `{action:"advance"}` | Admin | Expire a due offer and advance; cannot prematurely expire it |
| Same endpoint `{action:"manual",vendorId}` | Admin | Manual assignment/reassignment |
| Same endpoint `{action:"location",lat,lng}` | Admin | Correct an unassigned delivery pin and start another round |
| Same endpoint `{action:"respond",assignmentId,response,reason?}` | Vendor | Accept/reject own live offer; `response` is `ACCEPTED` or `REJECTED` |
| `GET /api/vendor/earnings?cursor=…` | Active vendor | Own persisted financial snapshots, paginated |
| `GET /api/orders/:ref/assignment` | Owning customer or signed guest cookie | Customer-safe status and accepted bakery only |
| `POST /api/internal/assignments` | Bearer worker secret | Recover starts and expire due offers; bounded batches |
| Existing `moveAssignment`, `assignVendor` actions | Existing vendor/admin guards | Portal controls routed through the same services |
| `saveAssignmentRules` | Admin | Vendor location/capability/capacity/commission configuration |

## Verification

```sh
npm run typecheck
npm run lint
npm test
# Dedicated migrated, empty test database; fixtures are cleaned afterward.
ASSIGNMENT_TEST_DATABASE_URL=postgresql://… npx vitest run tests/assignment.integration.test.ts
npm run build
# Uses a seeded scratch DB; existing Playwright guard refuses production hosts.
DATABASE_URL=postgresql://… npm run e2e
```

Integration tests use real PostgreSQL transactions: exact A/C-available, B-unavailable variant filtering; repeated and concurrent assignments without inventory decrement; transaction-time out-of-stock rejection; stale responses; rejection/reassignment; expiry; capacity; immutable earnings; cancellation races; pickup; multi-cake availability; and delivery-pin correction. Unit tests cover eligibility, variant resolution and money boundaries. Authenticated admin/vendor walkthrough requires the Clerk accounts described above.

Primary implementation files: `lib/assignment.ts`, `lib/assignmentRules.ts`, `lib/mapping.ts`, `lib/vendorTransition.ts`, `lib/orderTransition.ts`; new assignment/location/earnings API routes; `components/assignment/*`; existing checkout, vendor request/detail and admin/customer order pages; vendor assignment-rules form/action; Prisma schema/migration; demo/worker scripts; assignment tests and updated checkout browser tests. Unrelated in-progress checkout/catalog changes were preserved.
