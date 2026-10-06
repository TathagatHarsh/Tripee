# Checkout address step: pin-first, Blinkit/Zomato style

Date: 2026-10-06. Status: approved. Amended the same day with the delivery fixes chosen after the delivery test run (see "Delivery fixes").
Scope: part A of three (A: checkout address step, B: saved addresses, C: site-wide "Delivering to" header). B and C get their own specs.

## Why

The current delivery address step (`components/shop/LocationPicker.tsx` inside `app/checkout/CheckoutForm.tsx`) is not usable by a customer:

1. Search needs `GEOCODING_URL` (self-hosted Nominatim), which is not configured, so every search fails.
2. "Use my current location" drops a pin but never reverse-geocodes it; the customer types the whole address, pincode included.
3. Tap-to-drop-pin map, instead of the drag-map-under-a-fixed-pin pattern customers know.
4. Three entry buttons, a manual mode, a form, then a separate "Continue to delivery" confirmation.
5. Serviceability is learned only after pincode and date are entered.
6. No way to say the cake goes to someone else, with their phone.

## Goal and success criteria

A customer on a phone, in Hyderabad, gets from "Deliver to" to a complete, serviceable delivery address in under 30 seconds, typing only their flat or house number when GPS or search succeeds.

- Search suggests real Hyderabad places as they type.
- Current location and every map move fill area, city and pincode automatically.
- An undeliverable location is flagged before the customer types anything else.
- Orders store the same fields as today, so order placement, admin and vendor pages need no structural change.

## Customer flow

1. **Deliver-to card.** Delivery shows one card: "Deliver to · Add delivery address ›". Pickup is unchanged.
2. **Location sheet** opens on tap. Full screen under 640px, centred dialog above. Native `<dialog>`.
   - Search box with suggestions (debounced 350ms, min 3 characters, max 5 results).
   - "Use my current location" (browser geolocation).
   - Map with a **fixed centre pin**. The map moves; the pin does not. On `moveend`, the centre is reverse-geocoded (debounced 500ms) and the label under the map updates: line 1 street/locality, line 2 area, city, pincode.
   - Picking a suggestion or using current location recentres the map, which triggers the same lookup.
   - Serviceability is checked for each resolved pincode. Outside the zones: a banner "We don't deliver here yet", Confirm disabled, and a "Switch to pickup" button.
   - "Confirm location" closes the sheet.
3. **Details form** appears inline under the card after confirming:
   - Flat / house no. and floor (required, min 1 character). Maps to `addressLine1`.
   - Building / society name (optional). Prepended to `addressLine2`, which otherwise holds the resolved street.
   - Landmark (optional). `landmark`.
   - Read-only resolved line (area, city, pincode) with an "Edit" link revealing the existing locality, city, state and pincode fields. Used when the lookup was wrong or empty.
   - Receiver: defaults to the customer. Toggle "Ordering for someone else?" reveals receiver name and 10-digit phone.
4. **Collapsed state.** When the required fields are valid the card reads "Deliver to: Flat 4B, Road No 12, Banjara Hills, 500034 · Change". There is no separate confirm button; the address counts as confirmed when the pin is confirmed and the required fields validate. "Change" reopens the sheet at the current pin.

## Geocoding

- New `photon: GeocodingProvider` in `lib/mapping.ts`, calling Photon (`/api` for search, `/reverse` for points). Base URL from `PHOTON_URL`, default `https://photon.komoot.io`.
- Provider selection: `GEOCODING_URL` set means Nominatim (today's behaviour); otherwise Photon. Moving to Ola or Google later is one new provider plus an env change.
- Search is biased and bounded to Hyderabad: `lat=17.385&lon=78.4867&bbox=78.2,17.2,78.7,17.6`, `limit=5`. Results with `countrycode` other than `IN` are dropped.
- Mapping Photon properties to `LocatedAddress` (verified against live responses on 2026-10-06):
  - `address` (label): for search, name, housenumber, street, locality joined; for reverse, `name` is ignored because it is usually a nearby POI.
  - `locality`: `locality`, else `district`, with a leading `Ward <n> ` removed.
  - `city`: `city`, else `"Hyderabad"` when the point is inside the bbox, else `county`.
  - `state`; `pincode` from `postcode`; `placeId` from `osm_type` + `osm_id`.
- `/api/location` keeps its contract (string query or `{lat,lng}`). Its rate limit rises from 15 to 60 per minute per caller to allow typing. No server-side caching in this phase.
- Fair use: the public Photon instance is for the prototype only. Production moves to a paid provider; the owner decides which at that point.

## Serviceability

The existing `checkDeliveryServiceability({ postalCode }, catalog)` from `lib/delivery.ts` decides, run client side against the catalog snapshot checkout already holds. No new endpoint. Vendor service radius remains the assignment engine's concern.

## Map component

`components/assignment/Map.tsx` gains `mode: "pins" | "center"`.
- `pins` (default): current behaviour, used by the admin and vendor views and `CorrectLocation`.
- `center`: no markers; a CSS pin sits over the map centre; emits `onCenter(point)` on `moveend`; accepts a `center` prop to jump to, without animation (keeps the `_leaflet_pos` fix).
Tiles stay on `NEXT_PUBLIC_MAP_TILE_URL` (OSM default).

## Data and API

- Order columns unchanged: `addressLine1`, `addressLine2`, `landmark`, `city`, `state`, `pincode`, `recipientName`. The `deliveryLocation` JSON keeps its keys (`locality`, `latitude`, `longitude`, `source`, `placeId`, `name`, `phone`, ...).
- `source` is `map` or `current_location`. A delivery order always has a pin (see Delivery fixes 2); `manual` is no longer produced for delivery.
- Receiver: `recipientName` is sent as the customer's name today; it becomes the receiver's name when the toggle is on. A new optional `recipientPhone` (10 digits) in the checkout schema fills `deliveryLocation.phone`, which today always holds the customer's phone and still does when no receiver phone is given. No migration.
- Vendor and admin order views show the receiver name and `deliveryLocation.phone` where they show the customer today.

## Delivery fixes

Found by `tests/delivery.integration.test.ts` on 2026-10-06 and chosen by the owner for this phase.

1. **Bakery coverage at checkout.** A pin is serviceable only if its pincode is in a zone (as above) and at least one vendor that is active and accepting orders has the pin within `serviceRadiusKm` by straight-line distance. New `POST /api/serviceability` `{lat,lng}` returns `{ covered: boolean }` (no vendor names or locations leave the server). The location sheet shows the same "We don't deliver here yet" banner when not covered. `app/api/orders` repeats the check for delivery orders and refuses with `not_serviceable`. Routing (OSRM) stays the assignment engine's job; straight line is the cheap gate.
2. **Pin required for delivery.** The checkout schema requires `location {lat,lng}` when `method` is delivery, and `app/api/orders` refuses a delivery order without one. Every delivery order is therefore assignable without an admin correcting the pin.
3. **Bakery events stay off the customer channel.** `event()` in `lib/assignment.ts` writes a `NotificationOutbox` row only for `offered` (`vendor_assigned`, meant for the bakery). Accepted, preparing, ready, handed over and rejected remain in `VendorOrderEvent` and the portal notifications, and no longer go to the outbox as `status_changed`.
4. **No cancelling on the road.** `NEXT_STATUS.out_for_delivery` becomes `["delivered"]`. An order that has left the bakery is finished by delivery, not cancellation.
5. **Pickup is collected from the bakery that made it.**
   - Checkout's pickup panel says the collection address is shared once a bakery accepts, instead of showing the shop's address.
   - The customer order page (`components/orders/DeliveryInfo.tsx`) shows the accepted vendor's name and address under "Collection"; before acceptance, "Shared once a bakery accepts your order".
   - Bakery buttons follow the fulfilment method. The moves are the same as delivery (vendor row `ready` to `handed_over`, which also moves the Order to `out_for_delivery`; then Order to `delivered`), because `applyStatusTransition` only allows `out_for_delivery` after `handed_over`. Only the labels change: "Ready for collection" instead of "Send out for delivery", and "Mark collected" instead of "Mark delivered". The customer already sees these states as "Ready to collect" and "Collected" (`PICKUP_STATUS`). The label lookup takes the fulfilment method; the moves themselves do not change.

## Errors and edge cases

| Case | Behaviour |
|---|---|
| Geolocation denied or unsupported | Note under the button; focus moves to search. |
| Search or reverse lookup fails or is rate limited | The map centre is still a pin, so it stays confirmable; details form opens with area, city and pincode editable and empty. |
| Reverse lookup returns no pincode | Same as above; pincode required. |
| Pincode outside the zones | Banner, Confirm disabled, "Switch to pickup". |
| Pincode edited by hand to an unserviceable one | Existing slot logic refuses it; message shown inline. |
| Out-of-order lookups while dragging | A request counter drops stale responses (pattern already in `LocationPicker`). |

## Components and files

- `components/shop/LocationSheet.tsx` (new, client): dialog, search, geolocation, centre-pin map, serviceability banner. Emits a `LocatedAddress`.
- `components/shop/LocationPicker.tsx`: deleted, replaced by the card and sheet.
- `app/checkout/CheckoutForm.tsx`: address section rewritten as card, sheet, details form and receiver toggle; `confirmedAddress` state and the "Continue to delivery" step removed.
- `lib/mapping.ts`: Photon provider and provider selection.
- `lib/location.ts`: pure `photonToAddress()` mapper.
- `components/assignment/Map.tsx`: `center` mode.
- `app/api/location/route.ts`: rate limit.
- `app/api/orders/route.ts` and the checkout schema: `recipientPhone`.
- Vendor and admin order pages: receiver phone.
- `app/api/serviceability/route.ts` (new) and `lib/coverage.ts` (new, pure `coversPoint(vendors, point)`).
- `lib/assignment.ts` (`event()` outbox), `lib/orders.ts` (`NEXT_STATUS`), `lib/vendors.ts` (`vendorNext` by fulfilment, pickup labels), `app/vendor/actions.ts`, `components/orders/DeliveryInfo.tsx`.

## Testing

- Unit: `photonToAddress()` against the recorded Hyderabad responses (search result with a `Ward 93` district and no city; reverse result with a POI name); provider selection by env.
- Unit: checkout schema accepts a 10-digit `recipientPhone`, rejects others, and allows it to be absent; refuses a delivery without `location`.
- Unit: `coversPoint` inside, on and outside a radius; inactive and not-accepting vendors ignored.
- Unit: `vendorNext` for delivery and pickup; `NEXT_STATUS` has no cancel from `out_for_delivery`.
- Integration (`tests/delivery.integration.test.ts`, isolated database): pickup runs ready, ready for collection, collected; bakery progress writes no customer outbox rows; an uncovered delivery order is refused by the orders API.
- Manual, in the browser preview: search, current location (denied and allowed), dragging, an unserviceable pincode, switch to pickup, and placing an order against a scratch database (never production), then checking the stored fields.

## Out of scope

Saved addresses (B), the site-wide location header (C), paid provider integration, server-side geocode caching, the kitchen board's own status buttons.
