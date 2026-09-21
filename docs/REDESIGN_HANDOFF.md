# MakeMyCake — Celebration redesign

Implemented September 2026. This is an implementation handoff, not a repeat of the earlier technical audit.

## Experience

The storefront now uses Fraunces for editorial headings and Manrope for controls, prose and prices. Warm ivory, forest olive, caramel and butter gold replace the previous visual identity. The homepage uses actual catalogue categories, products, photography and prices; it does not invent ratings, offers, testimonials or revenue.

Product configuration happens before adding to the cart. The configuration sheet supports available sizes/egg options, quantity and a message, with animated pricing. Cart editing reopens the same configuration component. Product recipes and allergens use production specifications and variant information.

Checkout separates contact details, confirmed delivery address, requested date/window and the final review. Its desktop summary stays alongside the form; mobile stacks the sections. Delivery is charged once per order, and the final quote remains server authoritative. Confirmation persists across refresh, shows the reference and actual total, and offers explicit tracking/continue-shopping links. No online payment is represented as completed.

The vendor board has operational metrics, status columns and search/status/date/priority filters over the vendor's authorized assignments. Tickets and detail pages include every cake in the order, frozen specifications, allergens, due dates and notes. Admin uses the same brand with denser layouts, an olive navigation shell, real product/vendor/order counts and existing order, pricing, product and assignment controls.

The 3D builder remains Coming Soon. Razorpay has not been added.

## Brand kit and reuse

Canonical tokens are in `app/globals.css`. `s-*` and `a-*` keep storefront and operations component APIs compatible while sharing the brand.

| Role | Value / implementation |
| --- | --- |
| Primary | Caramel `#9a472b`, `--brand-primary` |
| Secondary / primary text | Olive `#263b2d` |
| Accent | Butter gold `#e8c879` |
| Background | Ivory `#faf7ef` |
| Surface / elevated | `#fffdf7` / `#ffffff` |
| Muted text / border | `#625d50` / `#ddd5c5` |
| Success / warning | `#286243` / `#805716` |
| Error / information | `#a12e32` / `#315c76` |
| Sale | `#914521`; reserved for genuine catalogue offers |
| Display | Fraunces, 56–101px hero; fluid line-height 1.02 |
| H1 | Fraunces, typically 40–52px storefront; 28–40px operations |
| H2 / H3 / H4 | Fraunces, 24–40px / 20–24px / 18–20px |
| Body large / body / small | Manrope 17–18px / 15–16px / 13–14px |
| Caption / label | Manrope 12–13px; short uppercase eyebrows use letter spacing |
| Button | Manrope, medium/semibold, minimum 44px main touch targets |
| Price | Manrope tabular numerals; `PriceRoll` for changing totals |
| Discount price | Same price system; no fabricated strike-through price |
| Dashboard metric | Manrope 36px, tabular numerals |
| Radius | Storefront 12px / controls 6px; operations 8px / 5px |
| Spacing | 4px base; forms use 20–28px padding; section spacing scales by breakpoint |
| Containers | Storefront 84rem; operations up to 90rem |
| Breakpoints | Tailwind 640 / 768 / 1024 / 1280px, plus 359px navigation adjustment |
| Motion | 160ms controls, 480–620ms entrances; transform/opacity primitives, reduced-motion override |

Reuse `sBtn`, `sField`, product cards, `VariantPicker`, `AddToCartSheet`, `PriceRoll`, admin `Card`/`StatCard`/`DataTable`/status badges, `LocationPicker`, and shared loading/error surfaces. Scroll reveals retain full text contrast. Native dialogs/popovers retain platform keyboard behavior; order success moves focus to its heading. State labels accompany semantic colors.

## Reliability changes

- Guest tracking remains available when Clerk is unconfigured; the tracking page still verifies the signed cookie and scopes the database query to its references.
- Completed checkout attempts are recovered before mutable catalogue, price or scheduling checks. Attempt identity excludes quote estimates and server-owned delivery-window prose. The transactional duplicate check and PostgreSQL advisory locks remain authoritative for concurrent requests.
- Advisory-lock queries return a supported scalar rather than PostgreSQL `void`, fixing a real Prisma order-placement failure found by integration tests.
- Aggregate quote validation detects delivery or total changes. Quote checks now include blackouts and slot capacity; placement rechecks capacity under its lock.
- Calendar dates reject rollover values such as February 31. Scheduling uses the selected window's start in India. Customer, vendor and admin views prefer the frozen due/requested date over legacy lead-hour calculations. Confirmation preserves an agreed requested date.
- Slots without an explicit clock range are unavailable for date-based checkout, rather than silently promising a fabricated arrival time. Configure an actual `HH:mm–HH:mm` range in the delivery-slot editor; the legacy express description needs this review.
- Checkout drafts survive refresh. Successful order storage failures cannot be reported as failed order placement. Manual address changes invalidate address confirmation and clear stale location coordinates.
- Optional contact email and delivery coordinates are validated and saved with the order.
- New route error boundaries offer recovery without disclosing infrastructure details.

## Maps configuration

Set both public build-time variables before building:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_restricted_key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=your_javascript_map_id
```

Enable Maps JavaScript API and Geocoding API. Restrict the browser key to intended website origins and the required APIs. The map loads only after an explicit request. Search uses geocoding restricted to India; customers can move the advanced marker, reverse-geocode a pin, or explicitly request browser location. They then confirm the address before ordering. Google Maps receives search/location input when these features are used. Manual address entry remains available without a provider key or permission.

The pin supplies coordinates, not the business serviceability verdict. The backend validates the entered pincode against active delivery zones and validates the date/slot/capacity. No live Google key was available for provider-backed verification in this session.

Provider references: [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview), [draggable advanced markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/draggable-markers), [geocoding](https://developers.google.com/maps/documentation/javascript/geocoding).

## Database and release prerequisites

The configured external database was not migrated or written to. A build against it reported missing `CakeProduct.productionSpec`, so the current application cannot be considered launch-ready on that database yet.

Fresh-install verification used a disposable local PostgreSQL 17 container. All 14 migrations and the 21-cake seed completed successfully. This exposed and fixed the duplicate `Order.pincode` addition in the existing `9b_production_hardening` migration; that column already exists in `0_init`. New `9c_checkout_contact_location` adds nullable email and JSON location columns without rewriting order history.

Before release, review migration status and take a backup of the target. Apply the outstanding migrations to staging first and verify existing-order preservation and production specifications. If an environment has already recorded the original `9b` migration, review that history/checksum explicitly before rollout; do not reset a production database or blindly mark migrations resolved. Deploy schema changes before this application build. Nullable new columns allow the previous application to keep reading existing records.

Review real bakery contact details, pickup address, hours, delivery zones, blackout dates, capacity, delivery clock ranges and product recipes. Seed defaults are development fixtures, not confirmation of business facts. Configure and verify the notification webhook; local QA intentionally disabled outbound notifications. Review pending outbox entries after enabling a provider.

Authenticated admin/vendor visual and workflow checks require real staging Clerk sessions with the relevant roles. Anonymous access-control checks do not replace those checks. Google Maps behavior needs a restricted staging key. No production deployment was performed.

## Verification

See `REDESIGN_QA.md` for final commands, results and remaining configuration-dependent checks. Use a scratch database for the end-to-end suite: it creates synthetic orders. The Playwright configuration refuses a nonlocal target unless explicitly marked disposable. `NEXT_DIST_DIR` permits an isolated build without overwriting an existing development server's output.
