# Cake availability and delivery locations

The production-hardening migration added nullable CakeProduct.productionSpec.
It left recipe-backed cakes enabled and delegated backfilling to seedCakes.
The affected database had 21 enabled cakes, 252 enabled variants and 21 null
specifications. Both BuyPanel and reviewBasket correctly rejected null specs.
This was a missing data backfill, not a pricing or ingredient-option failure.

Run `npx tsx scripts/repairCakeAvailability.ts` after deploying older databases.
It validates every record first, fills only missing specifications from the
existing saved recipe using the same conversion as the seed, and preserves
prices and existing specifications. Invalid specs and missing recipes stop the
transaction for manual review. `--enable-all` also enables existing cakes and
variants for testing; it does not invent new sizes or prices. Restart/redeploy
running storefront instances after maintenance to clear their catalogue cache.
The normal admin save continues to validate ingredients, allergens, kitchen
instructions and allergen review. Runtime checkout never fabricates a spec.

## Maps deployment

Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID before
building. Enable billing, Maps JavaScript API, Places API (New), and Geocoding
API in the same Google Cloud project. Restrict the browser key to the actual
HTTPS storefront referrers (and localhost only for development), and those
APIs. It is intentionally public, never a server secret. Rebuild after changes.
Uses Google's PlaceAutocompleteElement, with India-filtered suggestions:
https://developers.google.com/maps/documentation/javascript/place-autocomplete-new

No Google credentials are required for manual checkout. Browser geolocation
requires HTTPS or localhost and is requested only after a customer action.
Maps/geocoding failures leave manual address entry available.

Coverage continues to come exclusively from configured DeliveryZone pincodes
and allowed slots through checkDeliveryServiceability / resolveSlot. No radius,
city or coordinates can override that coverage. The price and order endpoints
load server catalogue data and revalidate the delivery slot, pricing, products,
schedule and capacity. Estimated delivery remains the existing requested window;
the coverage helper invents no estimate.

Order.deliveryLocation now holds the structured delivery snapshot (including
nullable coordinates, source, locality, recipient and contact information).
Existing address columns remain populated for downstream compatibility.
The server builds the formatted address from validated fields. No profile
lookup is used to display an existing order. Old coordinate-only snapshots
continue to render. Admin and kitchen provide an Open in Maps link where valid
coordinates exist. Location source is descriptive, never proof of coverage.

## Verification

`npm test` and `npm run typecheck` cover validation and existing flows.
For a read-only browser check, start the local dev server on port 3117 with
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=qa-placeholder and
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=qa-map (command environment only), then run
`npx tsx scripts/checkDeliveryLocation.mts`. The script intercepts every Google
Maps request and blocks order submission. It checks map selection, current
location, denied permission, timeout, unavailable location, unsupported browsers
and Maps API failure with manual fallback. Never deploy the placeholder values.
The order snapshot persistence assertions in e2e/checkout.spec.ts require a
scratch database, as enforced by playwright.config.ts.
