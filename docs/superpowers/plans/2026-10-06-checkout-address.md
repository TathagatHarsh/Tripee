# Checkout Address Step and Delivery Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace checkout's broken address step with a Blinkit/Zomato-style pin-first flow, and fix the five delivery problems found by the delivery test run.

**Architecture:** A free Photon geocoder joins the existing `GeocodingProvider` interface; a new `LocationSheet` (native `<dialog>`, Leaflet map in a new centre-pin mode) yields a confirmed pin that checkout turns into the same order fields as today. Serviceability becomes pincode zone plus straight-line bakery coverage, checked in the sheet and again in `app/api/orders`. Delivery state fixes are small edits to `lib/orders`, `lib/vendors`, `lib/assignment`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Prisma 7 on Postgres, zod, Leaflet, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-checkout-address-design.md`

## Global Constraints

- No Prisma schema change and no migration. The only database is production Supabase; integration tests run only against `ASSIGNMENT_TEST_DATABASE_URL` (scratch Docker Postgres, `postgresql://postgres:postgres@localhost:5433/postgres`).
- Geocoding default `PHOTON_URL` = `https://photon.komoot.io`; `GEOCODING_URL` set means Nominatim.
- Hyderabad bias and bounds: `lat=17.385&lon=78.4867&bbox=78.2,17.2,78.7,17.6`, `limit=5`; drop results whose `countrycode` is not `IN`.
- Search debounce 350ms, min 3 characters; reverse lookup debounce 500ms after map `moveend`.
- `/api/location` and `/api/serviceability` rate limit 60 per minute per caller.
- Map stays animation-free (`zoomAnimation`, `fadeAnimation`, `markerZoomAnimation` false; `animate: false`).
- Receiver phone: 10 digits, optional, stored as `deliveryLocation.phone` (falls back to the customer phone).
- Coverage: vendor `isActive && isAcceptingOrders`, `haversine(vendor, pin) <= serviceRadiusKm`; vendor names and coordinates never leave the server.
- Copy: no em dashes in new customer-facing strings. Banner text "We don't deliver here yet".
- After every task: `npx tsc --noEmit`, `npx eslint <touched files>`, `npx vitest run` all clean.

## Review Focus

1. **Leaflet inside a `<dialog>` that was closed at mount** renders grey tiles: the map must be created (or `invalidateSize()` called) after the dialog opens. Pinned in Task 6, step 4 (manual check).
2. **Typing or dragging fast** must never show an older lookup's address over a newer one. Pinned in Task 6, step 1 (`latest()` test).
3. **GPS fix outside Hyderabad** (travelling customer, desktop IP geolocation) must recentre and show "We don't deliver here yet", not error or snap back. Pinned in Task 2 (far-point test) and Task 6, step 4.
4. **Photon down or rate limited** must leave the pin confirmable with empty, editable area, city and pincode. Pinned in Task 7, step 4.
5. **Switching delivery to pickup and back** must not submit a stale pin with a pickup order, nor lose the pin on return. Pinned in Task 7, step 2.

---

### Task 1: Photon geocoder

**Files:**
- Modify: `lib/location.ts` (add `photonToAddress`, `HYDERABAD_BBOX`, `PhotonFeature` type)
- Modify: `lib/mapping.ts` (add `photon` provider and `geocoder()`; `getCoordinatesFromAddress` defaults to `geocoder()`)
- Modify: `app/api/location/route.ts` (rate limit `max: 60`)
- Test: `tests/photon.test.ts`

**Interfaces:**
- Produces: `photonToAddress(feature: PhotonFeature, kind: "search" | "reverse"): LocatedAddress | null` (null when `countrycode !== "IN"`); `HYDERABAD_BBOX = [78.2, 17.2, 78.7, 17.6] as const`; `geocoder(): GeocodingProvider`.

- [ ] **Step 1: Write the failing tests** using the live responses recorded on 2026-10-06:

```ts
const search = { geometry: { coordinates: [78.4322629, 17.4140777] }, properties: { housenumber: 'Plot No 70', street: 'Road No 12 Koushik Co-Operative Society, Banjara Hills', district: 'Ward 93 Banjara Hills', locality: 'Bhavani Nagar', city: 'Hyderabad', state: 'Telangana', postcode: '500034', countrycode: 'IN', osm_type: 'N', osm_id: 1 } };
const reverse = { geometry: { coordinates: [78.4392, 17.4126] }, properties: { name: 'Gowri Shankar Nagar(Mini)', street: 'Banjara Hills Road Number 11', locality: 'Gaffar Khan Colony', district: 'Ward 93 Banjara Hills', county: 'Shaikpet mandal', state: 'Telangana', postcode: '500034', countrycode: 'IN', osm_type: 'N', osm_id: 11985840880 } };

it('maps a search hit', () => expect(photonToAddress(search, 'search')).toMatchObject({ lat: 17.4140777, lng: 78.4322629, locality: 'Bhavani Nagar', city: 'Hyderabad', pincode: '500034', placeId: 'N1' }));
it('ignores the POI name on reverse and defaults city inside the bbox', () => {
  const a = photonToAddress(reverse, 'reverse')!;
  expect(a.address).not.toContain('Gowri Shankar');
  expect(a.address).toContain('Banjara Hills Road Number 11');
  expect(a.city).toBe('Hyderabad');
});
it('strips the ward prefix when locality is missing', () =>
  expect(photonToAddress({ ...reverse, properties: { ...reverse.properties, locality: undefined } }, 'reverse')!.locality).toBe('Banjara Hills'));
it('drops results outside India', () =>
  expect(photonToAddress({ ...search, properties: { ...search.properties, countrycode: 'PK' } }, 'search')).toBeNull());
it('uses Nominatim only when GEOCODING_URL is set', () => {
  vi.stubEnv('GEOCODING_URL', 'https://geo.example'); expect(geocoder()).toBe(nominatim);
  vi.stubEnv('GEOCODING_URL', ''); expect(geocoder()).toBe(photon);
});
```

(`lib/mapping.ts` imports `server-only`; mock it with `vi.mock('server-only', () => ({}))` as the integration tests do.)

- [ ] **Step 2: Run** `npx vitest run tests/photon.test.ts`. Expected: FAIL, `photonToAddress` not exported.
- [ ] **Step 3: Implement** `photonToAddress` (pure) per the spec's mapping rules, and `photon` in `lib/mapping.ts`: strings call `{PHOTON_URL}/api?q=&lat=17.385&lon=78.4867&bbox=78.2,17.2,78.7,17.6&limit=5`, points call `{PHOTON_URL}/reverse?lat=&lon=&limit=1`, both through the existing `json(url)` helper; map features through `photonToAddress` and drop nulls.
- [ ] **Step 4: Run** the file, then the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: free Photon geocoder for the prototype`.

### Task 2: Bakery coverage

**Files:**
- Create: `lib/coverage.ts`
- Create: `app/api/serviceability/route.ts`
- Test: `tests/coverage.test.ts`

**Interfaces:**
- Consumes: `haversine(a: Point, b: Point): number` from `lib/assignmentRules.ts`.
- Produces: `coversPoint(vendors: CoverageVendor[], point: Point): boolean`, with `CoverageVendor = { latitude: number | null; longitude: number | null; serviceRadiusKm: number; isActive: boolean; isAcceptingOrders: boolean }`; `isCovered(point: Point): Promise<boolean>` (server-only, one `db.vendor.findMany` selecting those five fields); `POST /api/serviceability` body `{lat,lng}` returns `{ covered: boolean }`, 400 on bad input, `crossSite` and `rateLimit` exactly as `/api/location`.

- [ ] **Step 1: Write the failing tests** for `coversPoint` with pin `{lat: 17.431, lng: 78.401}`: vendor at `17.43, 78.4`, radius 10, true; vendor whose distance equals its radius, true; vendor at `17.68, 78.4`, radius 10, false; same near vendor with `isActive: false`, false; with `isAcceptingOrders: false`, false; with null coordinates, false; empty list, false.
- [ ] **Step 2: Run** `npx vitest run tests/coverage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `coversPoint`, `isCovered` and the route.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: straight-line bakery coverage check`.

### Task 3: Order input: pin required, receiver phone, coverage refused

**Files:**
- Modify: `lib/checkout.ts` (`FulfillmentInput`)
- Modify: `app/api/orders/route.ts` (coverage refusal; `deliveryLocation.phone`)
- Modify: `tests/deliveryAddress.test.ts` (its "accepts a structured manual address without coordinates" case now expects refusal for delivery)
- Test: `tests/deliveryAddress.test.ts`, `tests/delivery.integration.test.ts`

**Interfaces:**
- Consumes: `isCovered(point)` from Task 2.
- Produces: `FulfillmentInput` gains `recipientPhone: z.string().regex(/^\d{10}$/).optional()`; when `method === "delivery"` a missing `location` is an issue at path `["location"]`, message "Choose your delivery location on the map." Orders API refuses an uncovered delivery pin with status 422, `{ code: "not_serviceable", error: "We don't deliver here yet." }`.

- [ ] **Step 1: Write the failing tests:** delivery without `location` refused; the same payload with `method: 'pickup', slot: 'pickup'` accepted; `recipientPhone: '9876543210'` accepted, `'98765'` refused, absent accepted. Integration (isolated DB, vendors table empty for that run or only a far vendor): `isCovered({lat: 17.431, lng: 78.401})` is false and a delivery order built through the orders route handler gets `not_serviceable` (mock the session/auth module the way `assignment.integration.test.ts` mocks `lib/auth`).
- [ ] **Step 2: Run** `npx vitest run tests/deliveryAddress.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema change, the refusal (after the existing slot check, delivery only), and `phone: input.fulfillment.recipientPhone ?? input.customerPhone` in the `deliveryLocation` JSON.
- [ ] **Step 4: Run** unit and integration suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat: delivery orders need a covered pin; receiver phone`.

### Task 4: Delivery state fixes

**Files:**
- Modify: `lib/orders.ts` (`NEXT_STATUS.out_for_delivery = ["delivered"]`)
- Modify: `lib/assignment.ts` (`event()` writes its `notificationOutbox` row only when `name === "offered"`)
- Modify: `lib/vendors.ts` (add `vendorMoveLabel(move: VendorMove, pickup: boolean): string`)
- Modify: `app/vendor/data.ts` (select `fulfillmentMethod`), `app/vendor/OrderActions.tsx` (prop `pickup: boolean`), `app/vendor/OrderTicket.tsx`, `app/vendor/orders/[ref]/page.tsx` (pass `pickup`; pickup status copy "Ready for collection" / "Collected"), `app/vendor/actions.ts` (success message via `vendorMoveLabel`; look up the order's `fulfillmentMethod`)
- Test: `tests/vendors.test.ts`, `tests/orders.test.ts`, `tests/delivery.integration.test.ts`

**Interfaces:**
- Consumes: `vendorNext`, `VENDOR_MOVE_LABEL`, `VendorMove` (already in `lib/vendors.ts`).
- Produces: `vendorMoveLabel(move, pickup)`: pickup maps `handed_over` and `out_for_delivery` to "Ready for collection", `delivered` to "Mark collected"; otherwise `VENDOR_MOVE_LABEL[move]`.

- [ ] **Step 1: Write the failing tests:** `canTransition('out_for_delivery','cancelled')` is false; `vendorMoveLabel('handed_over', true)` is "Ready for collection"; `vendorMoveLabel('delivered', true)` is "Mark collected"; `vendorMoveLabel('delivered', false)` is "Mark delivered". Integration: after accept, prepare, ready and handover, the count of `status_changed` rows with `dedupeKey` starting `assignment-event:` is 0 and the `vendor_assigned` row exists; the pickup test runs on to `delivered` (handover, `out_for_delivery`, `delivered` all succeed).
- [ ] **Step 2: Run** `npx vitest run tests/vendors.test.ts tests/orders.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the library edits and thread `pickup` through the vendor components. Drop the `startsWith: 'order:'` filter and its comment from the lifecycle test, since those rows no longer exist.
- [ ] **Step 4: Run** unit and integration suites. Expected: PASS.
- [ ] **Step 5: Commit** `fix: pickup wording, no cancel on the road, bakery events off the customer channel`.

### Task 5: Pickup address and receiver on order views

**Files:**
- Modify: `app/checkout/CheckoutForm.tsx` (pickup panel copy only: "Collect from the bakery that makes your cake. We'll share its address once a bakery accepts your order.")
- Modify: `app/orders/data.ts` (`getOrder` include `currentAssignment: { select: { assignmentStatus: true, vendor: { select: { name: true, address: true } } } }`) and `components/orders/DeliveryInfo.tsx`
- Modify: `app/vendor/OrderTicket.tsx`, `app/vendor/orders/[ref]/page.tsx`, `app/admin/orders/[ref]/page.tsx` (show `recipientName` and `deliveryLocation.phone` when they differ from the customer's)

**Interfaces:**
- Produces: `DeliveryInfo` "Collection" row is `${vendor.name}, ${vendor.address}` when `currentAssignment.assignmentStatus === "ACCEPTED"`, else "Shared once a bakery accepts your order".

- [ ] **Step 1: Implement** the include and the render changes.
- [ ] **Step 2: Run** `npx tsc --noEmit`, lint and the suite. Expected: clean. Visual check happens in Task 8.
- [ ] **Step 3: Commit** `feat: pickup shows the making bakery; receiver details for the bakery`.

### Task 6: Map centre-pin mode and LocationSheet

**Files:**
- Create: `lib/latest.ts`, test `tests/latest.test.ts`
- Modify: `components/assignment/Map.tsx`
- Create: `components/shop/LocationSheet.tsx`

**Interfaces:**
- Produces: `latest(): { next(): number; isCurrent(id: number): boolean }`. `AssignmentMap` props gain `mode?: "pins" | "center"` (default `"pins"`), `center?: Point`, `onCenter?: (p: Point) => void`. `LocationSheet` props: `{ open: boolean; initial: Point | null; catalog: CatalogSnapshot; onClose(): void; onConfirm(a: LocatedAddress): void; onPickup(): void }`.

- [ ] **Step 1: Write the failing test:** `const r = latest(); const a = r.next(); const b = r.next(); expect(r.isCurrent(a)).toBe(false); expect(r.isCurrent(b)).toBe(true);` Run, see FAIL, implement, see PASS.
- [ ] **Step 2: Implement** `center` mode: no markers; a CSS pin centred over the container (`pointer-events-none`); `moveend` emits `map.getCenter()`; a `center` prop change calls `map.setView(center, Math.max(map.getZoom(), 16), { animate: false })` in its own effect, without re-creating the map. `pins` mode unchanged.
- [ ] **Step 3: Implement** `LocationSheet`: native `<dialog>` opened with `showModal()`, full screen under 640px; search (350ms debounce, min 3 characters) posting to `/api/location`; "Use my current location"; the map mounts only once the dialog is open; each settled centre (500ms) runs `/api/location {lat,lng}` and `/api/serviceability` in parallel, both guarded by `latest()`; zone check with `checkDeliveryServiceability({ postalCode }, catalog)`; when zone or coverage fails, banner "We don't deliver here yet" and a "Switch to pickup" button calling `onPickup`; Confirm enabled once lookups settle (a failed address lookup still settles) and coverage is true. A failed address lookup confirms with empty `city`, `state`, `pincode`.
- [ ] **Step 4: Manual check in the preview:** open the sheet, tiles render (not grey), drag updates the label, search picks a place, denied location focuses search, a GPS point outside Hyderabad (devtools sensor override, e.g. Mumbai) shows the banner.
- [ ] **Step 5: Commit** `feat: centre-pin map and location sheet`.

### Task 7: Checkout address section

**Files:**
- Modify: `app/checkout/CheckoutForm.tsx` (address section, draft schema, submit payload)
- Delete: `components/shop/LocationPicker.tsx`

**Interfaces:**
- Consumes: `LocationSheet` (Task 6), `FulfillmentInput.recipientPhone` (Task 3).

- [ ] **Step 1: Replace** `LocationPicker`, `addressMode`, `confirmedAddress` and the "Continue to delivery" button with: the Deliver-to card; `LocationSheet`; details form (Flat / house no. and floor, required, to `addressLine1`; Building / society, optional, prepended to `addressLine2`; Landmark; read-only resolved line with "Edit" revealing locality, city, state, pincode); receiver toggle "Ordering for someone else?" with name and 10-digit phone. Collapsed card: `Deliver to: <addressLine1>, <addressLine2>, <locality>, <pincode> · Change`. The address is complete when `location` is set, `addressLine1` is non-empty and the pincode is 6 digits.
- [ ] **Step 2: Method switching:** the payload carries `location` only for delivery; switching to pickup keeps `draft.location` in state so switching back restores the card; `onPickup` sets `method: "pickup"` and closes the sheet.
- [ ] **Step 3: Run** `npx tsc --noEmit`, lint and the suite. Expected: clean. `grep -rn LocationPicker app components` returns nothing.
- [ ] **Step 4: Manual check** with `photon.komoot.io` blocked in devtools: the pin is confirmable, area, city and pincode are editable, and the summary shows the typed pincode.
- [ ] **Step 5: Commit** `feat: pin-first checkout address step`.

### Task 8: End-to-end verification on the scratch database

- [ ] **Step 1:** On the scratch DB, create a vendor at `17.43, 78.4`, `serviceRadiusKm 10`, `isAcceptingOrders true`, `fulfillsAllProducts true`, with inventory for one seeded cake.
- [ ] **Step 2:** In a temporary git worktree (own `.next`, so the user's running preview is untouched), start `next dev -p 3100` with `DATABASE_URL` set to the scratch URL. Place a delivery order through the new flow (search, drag, details, someone else as receiver) and a pickup order. Remove the worktree afterwards with `git worktree remove`.
- [ ] **Step 3:** Read both orders back with `psql`: the delivery order has `deliveryLocation.latitude/longitude`, `phone` equal to the receiver phone, and `source` of `map` or `current_location`; the pickup order has no location.
- [ ] **Step 4:** Report to the user with screenshots of the sheet in range and showing "We don't deliver here yet".
