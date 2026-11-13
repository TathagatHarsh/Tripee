# Delivery rules — design

Date: 2026-11-13. Replaces the five placeholder slots (standard, same-day,
express-4hr, midnight, pickup) with the client's delivery model.

## Goal

What the client asked for (2026-11-13):

- Custom cakes (3D builder and the photo-quote form): at least 3 hours, at most 4.
- Ready-made cakes (shop products): at least 2 hours, at most 4.
- Orders are taken 08:00–18:00 IST, every day. Pre-orders for later days are allowed.
- A fixed delivery fee of ₹150 per order.
- The admin can change the times and the fee without a deploy.

Success: a customer can order ASAP or for a chosen window, pays ₹150 delivery,
and the admin changes any of the numbers on `/admin/delivery` and sees checkout
follow on the next page load.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What the customer chooses | **As soon as possible** or **Schedule** (date + time window). |
| Meaning of 08:00–18:00 | When **orders are taken**. An ASAP order at 17:30 may arrive as late as 21:30. Scheduled windows sit inside 08:00–18:00. |
| What counts as custom | Both the 3D builder and the photo-quote form. Shop products are ready-made. |
| Where the rules live | One new `DeliverySettings` row (approach A). |
| Old slots | Withdrawn from new orders (`isAvailable = false`), never deleted, so past orders still show and price correctly. |
| Daily capacity per slot | Dropped. Not asked for; vendor assignment already refuses what a bakery can't make. |
| Pickup | Stays off (`PICKUP_OPEN = false`). |

## Data model (one additive migration)

```prisma
model DeliverySettings {
  id                String   @id @default("singleton")
  feePaise          Int      @default(15000)
  /// "HH:MM" IST. Orders (ASAP and scheduled) are accepted inside this range,
  /// and scheduled windows are laid out inside it.
  ordersFrom        String   @default("08:00")
  ordersUntil       String   @default("18:00")
  readyMinMinutes   Int      @default(120)
  readyMaxMinutes   Int      @default(240)
  customMinMinutes  Int      @default(180)
  customMaxMinutes  Int      @default(240)
  windowMinutes     Int      @default(120)
  preorderDays      Int      @default(14)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

Minutes rather than hours, so "2½ hours" can be stored as a whole number.
The migration inserts the singleton row with the defaults, and sets
`isAvailable = false` on the four old delivery `CatalogOption` rows
(`standard`, `same-day`, `express-4hr`, `midnight`). Pickup is already off.
The migration is written and checked offline. The user runs it on production
the usual way (`migrate deploy` on Supabase port 5432). Nothing is applied to
the live database during development.

`Order.deliverySlot` is already a `String`, so no change is needed there.

## Slot values

`DeliverySlot` (zod, `lib/schema.ts`) gains `"asap"` and `"scheduled"`. The old
five stay in the enum so stored orders and saved designs still parse. New
orders may only use `asap` or `scheduled`. Server validation refuses the old
values for new orders.

## The rule engine — `lib/deliveryRules.ts` (new, pure)

```ts
type CakeKind = "ready" | "custom";

deliveryChoices(now, kind, rules, closedDays): {
  asap: { start: Date; end: Date } | null;   // null when ordering is closed or today is closed
  days: { date: string; windows: { start: Date; end: Date }[] }[]; // today … today + preorderDays
}

checkChoice(choice, now, kind, rules, closedDays):
  | { ok: true; requestedFor: Date; dueAt: Date; window: string }
  | { ok: false; message: string }
```

Rules, all in IST:

- **ASAP** is offered when `ordersFrom ≤ now < ordersUntil` and today isn't a closed
  day. It promises `now + min` to `now + max` for the cake kind.
- **Scheduled windows** run from `ordersFrom` to `ordersUntil` in `windowMinutes`
  steps (08–10, 10–12, 12–14, 14–16, 16–18). If the length doesn't divide the
  day evenly, the last window ends at `ordersUntil`. A window is offered when
  its start is at least `now + min` away. Closed days offer none. Days run from
  today up to today + `preorderDays`.
- A basket with any custom cake uses the custom times. Today, an order is all
  custom (builder checkout) or all ready-made (cart), so this only matters if
  the two are ever mixed.
- `checkChoice` is the server's version of the same rules. It is used at
  checkout and on the photo-quote form, so a forged early time is refused.

One file, pure functions, no database. The client (checkout UI) and the server
(validation) call the same code with the same snapshot, as `lib/delivery` does
today.

## Catalogue snapshot (`lib/catalogSnapshot.ts`, `lib/catalogData.ts`)

`getCatalogSnapshot()` also loads `DeliverySettings` and exposes it as
`catalog.deliveryRules`. It also adds synthetic entries for:

- `catalog.slots.asap` ("As soon as possible") and `catalog.slots.scheduled` ("Scheduled"),
  so every existing screen that prints `catalog.slots[order.deliverySlot].name`
  keeps working.
- `catalog.price.deliveryFee.asap` / `.scheduled` = `feePaise`, so `lib/pricing`
  and `lib/checkout` charge ₹150 without new branches.

Legacy rows stay in the snapshot, as now, so old orders still show their slot and fee.

## Coverage (`lib/delivery.ts`)

Whether we deliver to an address is unchanged: the same serviceability check
(`checkDeliveryServiceability` / `lib/coverage`). The new slots ignore each
zone's slot list and its `extraHours`. The client's times are fixed, so
`resolveSlot` returns `available` for `asap` and `scheduled` whenever the
address is serviceable.

## Checkout (`app/checkout/CheckoutForm.tsx`)

The "Make time for cake" step becomes:

- Two radio cards: **As soon as possible** ("Arrives 2:30–4:30 PM") and **Schedule**.
  When ASAP isn't offered, its card is disabled with a reason: "We take orders
  8 AM–6 PM. Schedule one for tomorrow." (The hours come from the settings.)
- Schedule shows a date picker (today … +preorderDays, closed days blocked) and
  then the available windows for that date as buttons.
- The draft stores `slot: "asap" | "scheduled"`, `requestedDate` and
  `requestedWindow` ("10:00–12:00"). ASAP's window is worked out again when the
  order is placed, not taken from the browser.
- The summary line shows "Delivery ₹150".

## Server (`lib/checkoutValidate.ts`, `lib/checkout.ts`, `lib/placeOrder.ts`)

- `checkChoice` replaces `scheduleVerdict` for new slots. On failure it returns
  422 with `field: "requestedDate"` and a message such as "That time has passed
  — choose a later window."
- The order stores `deliverySlot`, `requestedFor` = window start,
  `dueAt` = window end (for ASAP: now+min and now+max, worked out on the
  server), and `requestedWindow` text.
- `dueAt` = window end is what vendor assignment already checks
  (`meetsDeadline`), so a bakery whose prep plus travel time is more than the
  window is skipped, as it is today.
- Closed days (`FulfillmentBlackout`) are checked as now.

## Photo-quote form (`components/shop/CustomRequestSheet.tsx`, `app/api/custom-requests/route.ts`)

- The due-time picker offers the same Schedule choice (date + window) with the
  custom minimum. ASAP isn't offered, because a quote round-trip (bakery
  quotes, customer pays) can't promise 3–4 h from the request.
- The route replaces the zone-based `leadHours` with `checkChoice(..., "custom")`.
- The quote expiry logic is unchanged (it already uses `dueAt`).

## 3D builder (`app/build/page.tsx`, `lib/schema.ts` `DEFAULT_CAKE`)

The builder's default `delivery` becomes `"asap"`. The `?delivery=` URL
parameter accepts only `asap` or `scheduled`. Old saved designs holding a
legacy slot load as before and switch to `asap` when they reach checkout.

## Admin (`app/admin/delivery`, `app/admin/actions.ts`)

The per-slot table (`SlotRow`) is replaced by one **Delivery rules** form:

| Field | Input | Check |
|---|---|---|
| Delivery fee | ₹ amount | `RupeeAmount`, ≥ 0 |
| Orders taken from / until | `<input type="time">` × 2 | from < until |
| Ready-made: min / max | hours, 0.5 steps | 0 < min ≤ max ≤ 24 |
| Custom: min / max | hours, 0.5 steps | 0 < min ≤ max ≤ 24 |
| Window length | select: 1 h / 2 h / 3 h | one of the three |
| Pre-order up to | days | 0–60 |

The new server action `saveDeliveryRules` is admin only (`requireAdmin`),
validates with zod and updates the singleton. It then calls
`revalidateCatalog()` and `revalidatePath("/admin/delivery")`, the same pattern
as `saveMinOrder`. Closed days, minimum order and zones stay on the page as
they are. A short line under the form explains: "ASAP shows only while orders
are open. Scheduled windows always sit inside these hours."

## Labels and copy

- `slots.asap.name` = "As soon as possible", `slots.scheduled.name` = "Scheduled".
  Admin order lists, kitchen board, vendor ticket, customer order page,
  WhatsApp messages (`lib/notify`, customer templates) and emails
  (`lib/orderEmail`) already print the slot name plus `requestedWindow`, so
  they pick these up through the snapshot. Each one is checked during
  implementation, and any hard-coded legacy slot text is fixed.
- `app/shipping-policy/page.tsx` is rewritten to the new rules, reading the
  numbers from settings rather than repeating them.

## Errors and edge cases

- **Order placed at 17:59:58, server sees 18:00:01:** ASAP is refused with "We
  stopped taking orders for today. Schedule one for tomorrow." The customer
  stays on checkout and chooses again.
- **Window expires while the customer pays:** the order is checked when it's
  placed (before Razorpay), as today. After payment nothing is checked again.
- **Admin sets `ordersFrom` ≥ `ordersUntil`, or min > max:** the form refuses
  to save and names the field.
- **The settings row is missing** (the migration hasn't run yet): the snapshot
  falls back to the defaults above, so checkout works with the client's numbers.
- **Old unpaid checkouts** (`CheckoutAttempt`) holding a legacy slot: payment
  recovery still completes them. Only new checkouts are blocked from legacy slots.

## Testing

- `tests/deliveryRules.test.ts` (unit, fixed `now`):
  - ASAP is offered at 08:00 and 17:59, and not at 07:59 or 18:00.
  - Ready-made at 15:00: ASAP is 17:00–19:00. No window today fits (16–18
    starts before 17:00), so the first is tomorrow 08–10.
  - Custom at 09:30: the earliest start is 12:30, so today's first window is 14–16.
  - On a closed day, nothing is offered for that date.
  - The last pre-order day is included, and the day after isn't.
  - `checkChoice` refuses a legacy slot, a past window, and a window inside the minimum.
- `tests/checkoutValidate` and custom-request route tests are updated for the new
  slots and the ₹150 fee.
- Admin action test: `saveDeliveryRules` refuses non-admins and invalid ranges.
- The e2e checkout runs against the throwaway Postgres container (never live
  Supabase): ASAP and scheduled orders each place with ₹150 delivery.

## Out of scope

Distance-based fees, free delivery above an amount, per-slot daily limits,
pickup, delivery time chosen per item in a mixed basket, and changing the
WhatsApp template wording (the templates already take the window as a variable).
