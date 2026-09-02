# Makemycake — UX Audit

**Phase:** read-only. Nothing in `app/`, `lib/` or `components/` was modified.
**Scope:** the code as it stands on `feat/preset-photographs` (`4ba48c0`).
**Business goal it is judged against:** more completed orders finished on-site,
rather than on WhatsApp.

Every claim below carries a `file:line`. Where the code is good, it says so —
there is a lot of it, and an audit that manufactures problems in order to look
thorough is worse than no audit.

**Two corrections to the brief before we start.** `lib/presets.ts` defines
**21** presets (`grep -c 'slug: "'` → 21), not 23, and `public/presets/` holds
exactly 21 matching `.webp` files — no missing images, no orphans. And
`lib/photos.ts:18` is empty *deliberately*, with the reason written at
`lib/photos.ts:1-10`; it is a decision not to lie, not an oversight.

---

## Executive summary

The builder is the best-engineered part of this product and it is not the
problem. Nine steps, one URL each, live 3D, per-option price deltas, derived
allergens, compatibility rules with one-tap fixes, a server-authoritative price,
a real design-token layer, and a `/kitchen` board that closes the loop. That
work holds up.

The problem is at the two ends.

**The order cannot be fulfilled from what the flow collects.** `prisma/schema.prisma:50-87`
stores `customerName`, `customerPhone`, `pincode`, `deliverySlot` and
`leadHours`. There is no delivery **address** field and no delivery **date**
field, anywhere in the schema, the config (`lib/schema.ts:61-89`), or the spec
sheet the kitchen works from (`lib/docket.ts:196-260`). A search for an address
or date field across `lib/ app/ prisma/ components/` returns only the bakery's
own address on the landing page (`app/page.tsx:287`).

So every order placed on this site *requires* a phone call to become a real
order — not because the phone call is nicer, but because the two facts a
delivery physically needs are never asked for. The stated business goal is to
move orders off WhatsApp. Right now the site is architecturally incapable of
completing one. That is finding #1 and it dwarfs everything else in this
document.

**The confirmation does not survive a refresh.** The order reference lives in
component state (`app/build/review/page.tsx:42`, set at `:122`) and the success
screen is a conditional early return (`:169`). There is no `/order/[ref]` route,
no write to storage, no email, no SMS. `app/build/review/page.tsx:400` tells the
customer the reference "is the only thing you need if anything is wrong" — and
F5 destroys it. Worse, `POST /api/orders` has no idempotency key and mints a
fresh `ref` per call (`app/api/orders/route.ts:101`), so a customer who reloads
and presses the button again creates a second order the kitchen cannot tell from
the first (`app/kitchen/page.tsx:53-58` orders by `createdAt` only).

Everything else in this audit is smaller than those two.

---

# Step 1 — Map what exists

## 1.1 Route inventory

| Route | Mode | Job | Renders | State / data | Reachable from |
|---|---|---|---|---|---|
| `/` | Server | Shopfront: hero cake, catalogue counts, how-it-works, 3 featured presets, live docket, bakery details | `HeroReveal`, `HeroCake`→`CakePreview`→`LazyCakeScene`, `PresetCard`×3, `Docket` | `lib/hero.ts` HERO_CAKE (static), `LANDING_PRESETS`, `priceCake`, `resolveSlot` at module scope (`app/page.tsx:24-27`) | entry point |
| `/presets` | Server | Catalogue of all 21 presets as photographs | inline card ×21 + `next/image` + `LoadConfig` | `PRESETS` (`lib/presets.ts`), `public/presets/*.webp` | `/` header + hero + section link (4 hrefs) |
| `/build` | Server | `redirect("/build/shape")` (`app/build/page.tsx:4`) | — | — | typed URL only |
| `/build/layout.tsx` | Server | wraps every step in `BuilderShell` | `BuilderShell` | — | — |
| `/build/shape` | Client | step 1 of 9 — silhouette | `StepHeader`, `OptionGrid`, `ViolationCard` | `useConfig`/`useSetConfig` | `/` (7 hrefs), `/presets`, `/d/*`, 404 page |
| `/build/size` | Client | step 2 — weight, tiers, layers | `OptionGrid` + two hand-rolled grids (`:42`, `:88`) | config; `deltaFor`, `blockerFor`, `servingsLabel` | `StepFooter` |
| `/build/sponge` | Client | step 3 — sponge **+ eggless / sugar-free** | `OptionGrid`, `DietOption`×2 (`:51`) | config | `StepFooter` |
| `/build/filling` | Client | step 4 — filling; bundt note at `:23` | `OptionGrid` | config | `StepFooter` |
| `/build/frosting` | Client | step 5 — frosting + coverage | `OptionGrid`×2 | config | `StepFooter` |
| `/build/finish` | Client | step 6 — colour, finish, drip | `ColorPicker`×2, `OptionGrid`, hand-rolled drip checkbox (`:66`) | config, `FROSTING_MATERIALS[].fixedColor` | `StepFooter` |
| `/build/toppings` | Client | step 7 — up to 4 toppings (24 options) | hand-rolled grid (`:58`); `ToppingBar` renders **on the canvas** via `BuilderShell:153` | config | `StepFooter`, `/presets` "Make it mine" |
| `/build/message` | Client | step 8 — piped message **+ delivery slot + pincode** | `ColorPicker`, `OptionGrid`, two inputs (`:49`, `:110`) | config, `resolveSlot`, `servicePincode`, `useView.composingMessage` | `StepFooter` |
| `/build/review` | Client | step 9 — docket, contact form, place order, save/share, download | `StepHeader`, `ViolationCard`, `PriceBreakdown`, `Placed` (`:383`) | config + local `Stage` (`:21-27`), `POST /api/price`, `POST /api/orders`, `POST /api/designs` | `StepFooter` (dynamic href, 0 literal hrefs) |
| `/d/[slug]` | Server, dynamic | a saved design, from Postgres | `CakePreview`, `PriceBreakdown`, `LoadConfig` | `db.design.findUnique` (`:17`), `migrateConfig`, view counter (`:53`) | the shareable URL only |
| `/d/new?c=…` | Server | a design carried in a base64url query param | same | `decodeConfig` (`lib/share.ts:12`) | `app/build/review/page.tsx:374` |
| `/kitchen` | Server, `force-dynamic`, **noindex**, HTTP Basic | staff order board; advances status | `advanceOrder` server action, `renderSpecSheet` | `db.order.findMany`/`groupBy` | no inbound link — correct, it is staff-only (`proxy.ts:83`) |
| `/lab`, `/lab/[index]` | Client, **noindex** | render lab, dev tooling | `LabGrid`, `LabSolo` | `app/lab/configs.ts` | 1 internal href; dev-only |
| `/shoot/[slug]` | Client, **noindex** | the photo studio `scripts/shoot-presets` drives | `ShootStage` | `presetBySlug` | no inbound link — correct, it is a build tool |
| `/api/price` | POST | authoritative price + violations | — | `priceCake`, `validateCake` | fetched by review page |
| `/api/orders` | POST | validate, price, persist, mint `MC-XXXXXX` | — | Prisma | review page |
| `/api/designs` | POST | save design, return `/d/<slug>` | — | Prisma | review page |
| `app/not-found.tsx` | Server | 404 | — | — | `notFound()` calls |

**Orphans that are correct by design:** `/kitchen` (Basic-auth staff page),
`/shoot/[slug]` (a camera rig for `scripts/shoot-presets.ts`), `/lab/*` (render
lab). All three are `robots: { index: false }` — `app/kitchen/page.tsx:29`,
`app/shoot/[slug]/page.tsx:18`, `app/lab/page.tsx:6`, `app/lab/[index]/page.tsx:9`.
Nothing to fix.

## 1.2 The flows as the code actually runs them

### Flow A — first visit → browse

1. `GET /` — server-rendered. `app/page.tsx:80` hero grid.
2. Hero copy is **hidden until JavaScript hydrates**: `HeroReveal` ships
   `[data-hero-reveal] > * { opacity: 0 }` in an inline `<style>`
   (`components/HeroReveal.tsx:36-42`, injected at `:92`), removed only when the
   layout effect sets `data-hero-shown` (`:85`). There is a `<noscript>` fallback
   (`:93`) and a `prefers-reduced-motion` escape (`:39-41`), but neither covers
   *slow* JS.
3. The hero cake is a lazily-imported WebGL canvas (`components/three/LazyCakeScene.tsx:11`,
   `ssr: false`) inside `h-[clamp(20rem,42vw,38.75rem)]` (`components/HeroCake.tsx:22`).
4. Four exits: `/build/shape` (header, hero, closing CTA — `app/page.tsx:59, 99, 318`),
   `/presets` (header, hero, section link — `:55, 102, 217`), three anchors
   (`:42-44`), and the three featured `PresetCard`s.
5. **The featured cards do not do what they say.** `components/PresetCard.tsx:94-102`
   renders a button labelled **"Make it mine"** whose `href` is `/presets`. On
   `/presets`, the identically-labelled control is a `LoadConfig` that writes the
   config into the store and routes to `/build/toppings` (`app/presets/page.tsx:156-161`).
   So on the landing page — the first screen every Instagram visitor sees — the
   per-cake CTA silently discards the cake you picked and drops you on a grid of 21.

### Flow B — browse → configure

6. `GET /presets` — 21 `next/image` cards, `fill` + `sizes="(min-width:1280px) 25vw, 50vw"`
   (`app/presets/page.tsx:113`), no `priority` on any of them.
7. "Make it mine" → `LoadConfig` (`components/builder/LoadConfig.tsx:39-44`):
   `loadPreset(config)`, `temporal.clear()`, `router.push("/build/toppings")` —
   step **7** of 9, deliberately (the reasoning is at `app/presets/page.tsx:131-155`
   and it is good reasoning).
8. `GET /build/toppings` → `BuilderShell` mounts, `useHydrated()` reads
   sessionStorage (`lib/store.ts:77-95`), `LazyCakeScene` loads.

### Flow C — configure (the nine steps)

9. Each step: `StepHeader` (`<h1>`), an `OptionGrid` as a `role="radiogroup"` with
   roving tabindex and arrow keys (`components/builder/OptionGrid.tsx:68, 82, 53-65`),
   a `ViolationCard`, and a pinned `StepFooter`.
10. Every option card shows its own price delta before you commit —
    `deltaFor(config, patch)` at `OptionGrid.tsx:73`, printed at `:129-135`. Free
    options print nothing, by design (`:29-31`). This is the single best decision
    in the product.
11. Incompatible options are marked *in place* with a plain-language reason
    (`blockerFor` at `:71`, message at `:142-149`), and `blockerFor`
    (`lib/rules.ts:130-146`) only reports violations the option would *introduce*.
12. `StepFooter` (`components/builder/StepNav.tsx:166-244`): Back, price, Next.
    Blocked state names itself and links to the step that owns the field
    (`:202-213`), which is exactly right.
13. Running total: a button on mobile/tablet opening a `<dialog>` sheet
    (`app/build/BuilderShell.tsx:279-349`) and a live `Docket` aside from 1280px
    (`:240-242`). Announced politely to screen readers at `:235-237`.
14. **Step counter, no step navigation, on mobile.** `StepNav` — the nine
    clickable chips — is inside a `hidden … lg:flex` container
    (`app/build/BuilderShell.tsx:76`). The mobile header (`:92-102`) carries only
    the phase name, "Step N of 9", and `PhaseMeters`, which is `aria-hidden`
    (`StepNav.tsx:126`). At ~80% mobile traffic, most customers can only move one
    step at a time.
15. Undo / redo / **Start again** sit in the shell header at all widths
    (`BuilderShell.tsx:268` → `UndoBar`).

### Flow D — "cart" → checkout

There is no cart. One cake per session; the config *is* the cart. For a
single-item custom product that is the right call, and it removes a whole class
of problem.

16. `GET /build/review`. On mount, `POST /api/price` (`app/build/review/page.tsx:71-98`)
    to confirm the client estimate. Stage starts at `checking` (`:42`).
17. Contact form: **2 fields**, both properly `<label>`-wrapped — NAME (`:204-212`),
    PHONE (`:213-222`, `inputMode="tel"`).
18. The ink card: total, a status pill, "No payment now — we call you to confirm",
    `Place order · ₹X`, and two secondary buttons (`:226-286`).
19. `POST /api/orders` → server re-validates config, name, phone, block-level
    rules and **slot availability** (`app/api/orders/route.ts:30-91`), reprices
    authoritatively (`:68`), then creates the row with 5 retries on `ref` collision
    (`:97-136`).

### Flow E — confirmation

20. `setStage({ kind: "placed", ref: data.orderId })` (`:122`) → the `Placed`
    component replaces the step content (`:169-178`, `:383-413`). Reference,
    one sentence about the call, Download docket, "Design another" → `/`.
21. **That is the whole of it.** No route, no URL, no storage write, no email, no
    SMS, no order-lookup. Refresh returns you to a filled-in review form for a
    cake you have already ordered.

### Flow F — post-order

22. Nothing. No `User` model; `Order.userId` is a nullable hook
    (`prisma/schema.prisma:62`). No auth anywhere (`grep -rn 'auth|session|login|jwt'`
    finds only `proxy.ts`'s HTTP Basic for `/kitchen`). No order-lookup route. No
    reorder. The customer's only artefacts are a `.txt` download and a reference
    they may have lost.
23. Staff side works: `/kitchen` lists orders, groups by status, and advances them
    through `NEXT_STATUS` (`lib/orders.ts:15-22`), re-checked server-side
    (`canTransition`, `:28-30`).

## 1.3 Dead ends and missing states

**No route-level loading or error boundaries at all.**
`find app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'global-error.tsx' -o -name 'template.tsx'`
returns nothing. Consequences:

- `app/d/[slug]/page.tsx:15-21` — `load()` calls `db.design.findUnique` with no
  try/catch. `generateMetadata` catches (`:29`); the page body does not (`:45`).
  A database hiccup on a shared design link gives the customer Next's unstyled
  production error page, on the exact URL a friend just forwarded them.
- `/kitchen` handles the no-database case explicitly and well
  (`app/kitchen/page.tsx:44-51`), and has a real empty state (`:72-75`). The
  customer-facing pages have neither.

**States with no UI:**

| State | Handled? | Evidence |
|---|---|---|
| Scene loading | Yes | `SceneSkeleton`, `role="status" aria-live="polite"` (`LazyCakeScene.tsx:20-34`) |
| Store not yet hydrated | Yes | `ControlSkeleton` (`BuilderShell.tsx:210, 370-381`) |
| Price check in flight | Yes | `priceNote` "Confirming with the kitchen…" (`review/page.tsx:181-185`) |
| Order submitting | Yes | button reads "Sending…" and disables (`review/page.tsx:255, 268`) |
| Order failed | Yes | `role="alert"` box (`review/page.tsx:288-292`) |
| Design save failed | Yes | added deliberately (`review/page.tsx:136-148`) |
| Design save **in flight** | **No** | `save()` (`:128`) sets no pending state; the button never changes. A slow save looks like a dead button. |
| Delivered-cake photos | Empty by design | `DELIVERED_PHOTOS.length > 0 &&` (`review/page.tsx:353`), list at `lib/photos.ts:18` |
| Unavailable delivery slot | **Client: no. Server: yes.** | `resolveSlot` returns `available:false` + a reason (`lib/delivery.ts:115-124`); shown as text on `/build/message` (`:137-139`) and `/build/review` (`:341-343`); but `ready` = `canSubmit(config) && contactOk` (`review/page.tsx:68`) never consults it, `lib/rules.ts:15-112` has no slot rule, and `OptionGrid` cannot mark it because `blockerFor` only reads `validateCake`. The refusal lands as a 422 *after* the customer presses Place order (`app/api/orders/route.ts:83-91`). |
| Unserviceable pincode | Text note only | `/build/message:140-144` "We don't deliver to X yet. Store pickup still works." — but `delivery` is not switched to `pickup`, and the order is only refused on submit. |
| Unavailable **date** | **Does not exist** | no date input anywhere: `grep '<input'` across `app/ components/` returns 13 inputs, none of them a date (`app/lab/*` ×3, sponge:69, finish:77, message:49 + :110, review:206 + :215, kitchen hidden ×2, ToppingBar:140 range, ColorPicker:86 color) |
| Out of stock / capacity | Does not exist | no capacity, blackout, or cutoff logic in `lib/delivery.ts` |
| Order not found | N/A | no lookup route exists to 404 from |
| 404 | Yes | `app/not-found.tsx` |
| Broken `/d/new` link | Yes, well | `app/d/new/page.tsx:25-38` — "That link didn't survive the journey" |

**Forms and their validation feedback:**

| Field | Label | Constraint | Visible feedback |
|---|---|---|---|
| Message (`message/page.tsx:49`) | `sr-only` (`:48`) + `GroupHeader` | `maxLength={60}` | live `60/60` counter (`:41-44`) — good |
| Pincode (`message/page.tsx:110`) | visible (`:107-109`) | `pattern`, `maxLength={6}`, digits-only filter (`:117`) | zone/lead line (`:131-136`), "we don't deliver there yet" (`:140`) — good. Nothing for a **partial** pincode: `set({pincode: undefined})` (`:123`) makes the zone line silently revert to the no-pincode default with no "4 more digits" hint. |
| Name (`review/page.tsx:206`) | visible (`:205`) | `name.trim().length >= 2` (`:66`) | **none** |
| Phone (`review/page.tsx:215`) | visible (`:214`) | `/^(?:\+?91\|0)?[6-9]\d{9}$/` (`:67`) | **none** |

The name and phone fields are the last gate before the only conversion event in
the product, and neither says anything. The Place-order button just stays
`disabled:bg-graphite disabled:text-quiet` (`:265`) with no message explaining
why — and it is *also* disabled during `checking`, so its default state on
arrival is "off for reasons unstated".

**Refresh, Back and lost work:**

- Refresh mid-build: survives. `persist` + `sessionStorage` (`lib/store.ts:31-36`),
  `skipHydration` with a manual rehydrate so the default cake never flashes
  (`:36-37`, `:84-92`), and a field-by-field salvage rather than an all-or-nothing
  parse (`:38-55`) — the comment at `:43-47` explains exactly which bug that fixed.
  This is careful, correct work.
- **Close the tab and it is gone.** `sessionStorage`, not `localStorage`
  (`lib/store.ts:33`). Ten minutes of cake does not survive to tomorrow.
- Browser Back mid-build changes the step but not the config — Back and Undo do
  different things and nothing distinguishes them.
- Undo history does not survive a reload: `partialize` keeps only `config`
  (`:34`) and `useHydrated` clears the stack on purpose (`:90`).
- **`Start again` destroys the design with no confirmation and no undo.**
  `components/builder/UndoBar.tsx:59-67`: `reset()` then
  `useCake.temporal.getState().clear()`. It sits in the header, third in a row of
  three 44px controls, and on mobile it is a bare `⟲` glyph (`:65`) next to `↶`
  and `↷`.

---

# Step 2 — Audit, by flow and category

## (a) Flow breaks

**A1 — The landing page's featured cards throw away the cake you clicked.**
`components/PresetCard.tsx:94-102`: `<Link href="/presets" … >Make it mine</Link>`.
On `/presets` the same label loads the config and routes to `/build/toppings`
(`app/presets/page.tsx:156-161`). The landing card is a server component, but
`LoadConfig` is a client component already rendered from a server parent on
`/presets` — so there is no technical reason for the difference. First screen,
Instagram traffic, wrong destination.

**A2 — The confirmation exists only in React state.**
`app/build/review/page.tsx:42` `useState<Stage>`, `:122` `setStage({kind:"placed", ref})`,
`:169` early return. `Stage` is not in `partialize` (`lib/store.ts:34`). No route,
no storage, no email. `:400` promises the reference is "the only thing you need"
and a reload deletes it.

**A3 — Reloading the confirmation lets the customer order twice.**
`POST /api/orders` has no idempotency key and no dedupe on config+phone;
`app/api/orders/route.ts:101` mints a fresh `makeOrderRef()` per call. After a
refresh the review form is fully populated and `Place order` is live again. The
kitchen board (`app/kitchen/page.tsx:53-58`) sorts by `createdAt` with nothing to
mark a duplicate.

**A4 — An unavailable delivery slot is only refused after the customer commits.**
`lib/delivery.ts:115-124` knows it: express is core-only, extended gets
`["standard","pickup"]` (`:63-82`). `/build/message:137-139` and
`/build/review:341-343` print the reason. But `ready` (`review/page.tsx:68`) is
`canSubmit(config) && contactOk` — no slot check — `lib/rules.ts:15-112` has no
slot rule, so `OptionGrid` cannot grey it out, and the block arrives as a 422
(`api/orders/route.ts:83-91`) rendered in the error box (`review/page.tsx:288`).
The error text does not link back to `/build/message`, which is where the fix
lives. The server-side guard is *right* — its comment at `:79-82` says exactly
why it exists — the failure is that the client never mirrors it.

**A5 — `Start again` is a one-tap, unconfirmed, unrecoverable wipe.**
`components/builder/UndoBar.tsx:59-67` — `reset()` and then `temporal.clear()`,
so Undo cannot bring it back. Header position, adjacent to Undo/Redo, bare `⟲`
glyph below `sm` (`:65`).

**A6 — The design dies with the tab.** `lib/store.ts:33` uses `sessionStorage`.
The only durable escape is the `/d/new?c=…` link at the very bottom of the review
page, set in `text-micro` mono below the price breakdown
(`app/build/review/page.tsx:372-377`) — the last element on the longest page in
the flow.

**A7 — Saving a design gives no in-flight feedback.**
`save()` (`review/page.tsx:128-156`) has a good failure branch (added
deliberately, `:136-141`) but sets no pending state, so the button is inert-looking
during the round trip.

**A8 — The review page's primary action is not pinned.** On step 9 `next` is
`undefined`, so `StepFooter` renders Back + price only
(`components/builder/StepNav.tsx:229`). `Place order` lives inside the scrolling
column, below the contact form, above ~8 detail sections and a price breakdown
(`review/page.tsx:226-302` then `:306-377`). On a phone it is off-screen on
arrival, and every other step in the flow has taught the customer that the
forward action is pinned to the bottom.

**Genuinely fine:** the blocked-Next handling. `StepFooter:175-186` figures out
*which* step owns the blocking field and links there with the reason attached
(`:202-213`) instead of disabling Next and pointing at a note that is not on the
page. The comment at `:175-181` describes the bug this replaced. That is better
than most commercial checkouts.

## (b) Decision friction

**B1 — There is no date. Anywhere.** No date input exists (13 `<input>`s in
`app/`+`components/`, none of type `date`); `CakeConfig` (`lib/schema.ts:61-89`)
has no date field; `Order` (`prisma/schema.prisma:50-87`) has no date field. What
the customer gets instead is a **lead time in hours** — "48 hours",
"lead time 50 hours" (`lib/delivery.ts:20`, `resolveSlot:119`) — and a window
string like "10:00–20:00, day after tomorrow" (`:21`). A customer whose
daughter's birthday is Saturday cannot say "Saturday". They must do the
arithmetic, trust it, and then still take a phone call. For a product whose
buyers order birthday cakes 2–5 days out, this is the largest single piece of
friction in the flow.

**B2 — No delivery address.** Same three files, same absence. The docket the
kitchen works from prints `Pincode` and nothing else
(`lib/docket.ts:250`, `:181-186`). The order cannot be delivered from the data
captured.

**B3 — Delivery and pincode are the 8th of 9 steps.** `lib/catalog.ts:216` puts
`message` (which owns delivery + pincode, per `StepNav.tsx:21`) at index 7. A
customer in Ranga Reddy who wants a cake in 4 hours configures shape, size,
sponge, filling, frosting, finish and toppings — seven screens of decisions —
before the app tells them express does not reach them (`lib/delivery.ts:76-81`).
Delivery cost has the same shape: `DELIVERY_FEE` runs ₹0–₹300
(`lib/pricing.ts:116-122`), up to 25% of a 0.5 kg cake, and the customer meets it
on step 8.

**B4 — Nut-free is not expressible.** `eggless` and `sugarFree` are first-class
booleans on the config (`lib/schema.ts:84-85`) with real controls on step 3
(`app/build/sponge/page.tsx:28-43`). There is no nut-free equivalent, and no
free-text note field anywhere. `lib/allergens.ts` is excellent — 10 allergen
types derived per component (`:7-17`), an `eggAlways` vs `eggUnlessEggless`
distinction (`:20-25`), and honest edge cases documented at `:53-55` and `:59-60` —
but it is a **disclosure at step 9** (`review/page.tsx:323-328`), not a **filter at
step 1**. A customer with a nut allergy has to read 24 topping blurbs, 17 filling
blurbs and 14 sponge blurbs and work it out.

**B5 — Servings are present but subordinate.** Real credit: `SIZES` blurbs read
`"7in · serves 8–10"` (`lib/catalog.ts:59-64`), the size step prints
`servingsLabel` under the grid (`app/build/size/page.tsx:32-34`), and it appears
on preset cards (`PresetCard.tsx:78`), the review page (`:309`) and the docket
(`Docket.tsx:78`). The friction is hierarchy, not absence: the card's headline is
`1 kg` at `text-item` (`OptionGrid.tsx:122`) and "serves 8–10" is the `text-meta`
blurb beneath it (`:138`). Buyers count people, not kilos. Also the strings in
`lib/catalog.ts:59-64` are hand-typed and duplicate what `deriveServings`
computes (`lib/servings.ts:30-39`) — they currently agree, but nothing keeps them
agreeing.

**B6 — Diameter is real information that the customer never sees.**
`DIAMETER_IN` (`lib/servings.ts:13-20`) reaches the docket
(`lib/docket.ts:93`, `:213`) and the size blurbs, but the `Row k="Weight"` on
review prints only `config.size` (`review/page.tsx:308`).

**B7 — The one price that is not attributable is GST.** Every option shows its
own delta (`OptionGrid.tsx:129`), tiers and layers show theirs
(`size/page.tsx:67`, `:109`), the drip shows its (`finish/page.tsx:90`), and
`PriceBreakdown` itemises every line with a dotted leader
(`components/docket/PriceBreakdown.tsx:35-44`). The 18% GST
(`lib/pricing.ts:220-222`) is inside every total shown from step 1, labelled
"INCL. GST" — honest, and better than surfacing it late. Worth noting only that
the ₹1,200 "1kg base" on the marketing page and the ₹1,416 the builder shows for
the same cake will read as a discrepancy to someone comparing.

**Genuinely fine:** live pricing. `deltaFor` (`lib/pricing.ts:228-233`) is called
per option per render, the client estimate is checked against the server on the
review page (`review/page.tsx:71-98`), and the server is the authority
(`api/orders/route.ts:67-73`). Nothing about the price is a surprise except its
absence of a date.

## (c) Trust gaps

**C1 — There is no phone number on the site.** `grep -rn 'tel:|wa.me|whatsapp|mailto:|\+91'`
over `app/ components/ lib/` returns **nothing**. The landing page gives an
address and opening hours (`app/page.tsx:287-300`); the review page promises "We
call this number to confirm before we bake" (`:200`); `Placed` says "Someone from
the kitchen calls" (`:398`). The entire model is a phone call the customer cannot
initiate. If nobody rings, there is no recourse and nothing to chase.

**C2 — No cancellation, refund, reschedule or change-of-date policy, anywhere.**
`grep -rni 'refund|cancel|policy|terms|privacy|reschedule'` over `app/ components/ lib/`
hits only `lib/orders.ts`'s internal `cancelled` status and the staff Cancel
button (`app/kitchen/page.tsx:146`). The customer is never told what happens if
they need to change the date, and cannot change anything themselves once placed —
`app/kitchen/actions.ts` is the only mutation path and it is behind HTTP Basic
(`proxy.ts:83`).

**C3 — No FSSAI licence in practice.** The code is scrupulous about this:
`lib/docket.ts:9-15` refuses to invent a number and gates the line on
`NEXT_PUBLIC_FSSAI_LICENCE`. The footer therefore renders the fallback
"FSSAI licence — shown when configured" (`app/page.tsx:334`) — which reads to a
customer as *no licence*, on a site selling food. The engineering decision is
correct; the deployment has not supplied the value.

**C4 — Nothing next to the render calibrates it.** `lib/photos.ts:18` is empty by
design and the consumer is correctly gated (`review/page.tsx:353`). The result is
that the only picture of a "delivered" cake on the whole site is a procedural
WebGL render, and there is no disclaimer saying the render is an approximation.
`/presets` claims its photographs are real (`app/presets/page.tsx:68-71`) but they
are camera renders of the same procedural scene (`app/shoot/[slug]/page.tsx`,
driven by `scripts/shoot-presets.ts`) — the page's own doc comment says so at
`:14-31`. The customer-facing copy ("photographed from a real configuration, not
picked off a stock library") is technically true and will read as a claim about
real cakes.

**C5 — No reviews, testimonials, order count, or social proof of any kind.**
No component, no route, no data model.

**C6 — Two different-looking references for the same order.** The builder header
shows `DESIGN #{docket.ref}` (`BuilderShell.tsx:263`), which is `previewRef` —
`MC-` + a 4-digit hash of the config (`lib/docket.ts:21-23`). It therefore changes
on every option the customer taps. The real order reference is `MC-` + six
base-31 characters (`lib/share.ts:47`). A customer who writes down `MC-4821`
mid-build has written down nothing, and the two formats do not look like
relatives.

**C7 — The downloaded docket's filename does not match the order inside it.**
`review/page.tsx:164` names the file `makemycake-${docket.ref}.txt` using the
*preview* ref (`docket` is built at `:57` with no `ref` option), while the file
*contents* use the real `stage.ref` (`:159`). After ordering, the customer saves
`makemycake-MC-4821.txt` containing `Order ref MC-K3M9PQ`.

**C8 — The price-mismatch state shows the wrong number on the button.** When the
server disagrees, `priceNote` says "Kitchen says ₹X — that is the price that
stands" (`review/page.tsx:184`), but the big total (`:236`) and the button label
(`:268`) both still render `price.total`, the client's number. The customer is
told one price and asked to press a button quoting another. This is a money path;
it should not have two numbers.

**Genuinely fine:** the docket as a trust surface. It is the real component with
the real config on the marketing page rather than a screenshot
(`app/page.tsx:259-267`, and the comment says why), it never collapses a total
(`PriceBreakdown.tsx:6-8`), allergens are derived rather than typed
(`lib/allergens.ts:3-6`), and the safety-critical lines were deliberately taken
off 9.5px type (`Docket.tsx:84-89`). Also: "No payment now" is stated on the
landing page (`app/page.tsx:110`, `:324`), the how-it-works step
(`:195-197`) and the ink card (`review/page.tsx:249`). That is the right way to
handle having no payments.

## (d) Mobile failures

Traffic is ~80% mobile. Measured against that:

**D1 — Playwright never tests a phone.** `playwright.config.ts:38`
`viewport: { width: 1440, height: 900 }` and `:53-55` a single `chromium` project
with `devices["Desktop Chrome"]`. So the a11y suite, the visual baselines and the
happy path all run at desktop width only. The mobile docket sheet
(`BuilderShell.tsx:320-346`), the mobile step header (`:92-102`) and the mobile
`StepFooter` layout are never exercised by any test.

**D2 — No step navigation on mobile.** `StepNav`'s nine chips are inside
`hidden … lg:flex` (`BuilderShell.tsx:76`). The mobile header (`:92-102`) offers
`PhaseMeters`, which is `aria-hidden` and unclickable (`StepNav.tsx:126`). To get
from step 8 back to step 2, a phone user taps Back six times.

**D3 — The cake gets 39dvh and the controls get the rest.**
`BuilderShell.tsx:125`: `h-[39dvh] md:h-[44dvh]`, or `54dvh` on the toppings step.
On a 375×812 phone, 39dvh ≈ 317px minus `p-3` and `p-4` padding (`:112`, `:124`)
≈ 285px of canvas, sharing the viewport with a 60px shell header, a ~64px step
header and a ~76px pinned footer. It fits — the reasoning at `:113-121` shows this
was measured — but the option list below is a separate scroll container
(`:203`), so on a 24-item step like toppings (`toppings/page.tsx:58`, 1 column
below `@md`) the customer scrolls ~1,800px inside a ~250px window.

**D4 — The keyboard covers the message and pincode fields.** Both are on
`/build/message` (`:49`, `:110`) inside `overflow-y-auto` (`BuilderShell.tsx:203`),
under a `position`-static pinned footer, in a `h-dvh overflow-hidden` root
(`:67`). There is no `scrollIntoView` on focus anywhere in the builder
(`grep scrollIntoView` finds only `StepNav.tsx:69`, which centres the *step chip*).
The message field is the one whose entire value is watching the plaque change on
the cake above it (`useView.composingMessage`, `lib/view.ts:22`) — and the
on-screen keyboard is exactly what covers that.

**D5 — Three iOS-zoom-safe fields and one that is not obviously so.**
`field()` is `text-item` = 17px (`lib/ui.ts:98`, `globals.css:76`) — above the 16px
iOS threshold, deliberately. `monoField()` then appends `text-body` = 15px
(`lib/ui.ts:106`) on top of `field()`'s `text-item`. Two font-size utilities from
the same Tailwind theme namespace land in the same layer, so stylesheet order
decides which wins, not attribute order — the same class of bug this codebase
already documents at `app/page.tsx:48-53`. Whichever way it resolves, the phone
and pincode fields' intended size is not the size the helper says it is, and one
of the two outcomes triggers iOS focus-zoom. Worth measuring in the built CSS.

**D6 — 15px body text.** `globals.css:130` sets `font-size: var(--text-body)` =
0.9375rem = 15px on `body`, and `text-meta` (13px) carries 56 of the most-used
strings in the app including every option blurb (`OptionGrid.tsx:138`). On a
phone in daylight that is small for the copy a purchase decision rests on.

**D7 — A `title=` tooltip as the only long-form label on a touch control.**
`ToppingBar.tsx:116` sets both `aria-label={p.name}` and `title={p.name}` on
pills that display abbreviations ("Scatter", "Border", "Cascade" —
`lib/catalog.ts:168-174`). The `aria-label` is correct and reaches screen
readers; a touch user sees only the abbreviation and cannot hover.

**Genuinely fine, and unusually so:**
- Safe-area insets are paid for in both bottom bars — `StepNav.tsx:201`
  `pb-[max(1.125rem,env(safe-area-inset-bottom))]` and `BuilderShell.tsx:341`.
- `h-dvh`/`dvh` throughout rather than `100vh` (`BuilderShell.tsx:67`, `:125`).
- Container queries, not viewport queries, for the option grid
  (`OptionGrid.tsx:44-50`) — correct, because the controls column is narrow on a
  wide screen.
- The mobile docket is a native `<dialog>` with `showModal()` for the focus trap,
  Escape and scrim (`BuilderShell.tsx:286-300`, and the comment at `:289-293`
  explains the eighty lines it avoided).
- `touch-pan-y` on the hero canvas so a phone can scroll past it
  (`HeroCake.tsx:22`).
- `min-h-11` (44px) is enforced as the floor by `lib/ui.ts:24-28`, and every
  option card is `min-h-[76px]` (`OptionGrid.tsx:87`). I found no tap target under
  44px in customer-facing code.
- Horizontal-overflow bugs were found and fixed with the reasoning recorded —
  `app/page.tsx:67-79` (the `minmax(0,…)` fix) and `:129-134` (the glow cap).

## (e) Accessibility

The project's claim — 0 axe WCAG 2.1 AA violations across 9 routes — is real
but narrower than it sounds. `e2e/a11y.spec.ts:9-20` lists **10** routes and
runs axe with `wcag2a, wcag2aa, wcag21a, wcag21aa` (`:25`). Not covered:
`/build/sponge`, `/build/filling`, `/d/[slug]`, `/d/new`, the 404 page, and — the
important ones — **any state axe cannot reach by loading a URL**: the `placed`
confirmation screen, the mobile docket dialog, the error box, and any config
with a blocking violation. The suite is desktop-only (D1). The keyboard test at
`:63-87` is good and specific.

What that leaves. Contrast ratios below are computed from `app/globals.css:17-56`.

**E1 — The Undo / Redo / Start-again buttons have no findable boundary.**
`iconBtn()` is `border border-rule bg-paper` (`lib/ui.ts:83`) and it renders in a
`bg-paper` header (`BuilderShell.tsx:251`). `#C4C0B6` on `#FDFCFA` = **1.77:1**,
against the 3:1 that WCAG 1.4.11 requires for the visual boundary of a control —
and it is 1.77:1 on *both* sides, since the button fill and the header are the
same colour. `globals.css:36` itself says `rule` is for "decorative dividers
only". Three controls, one of them destructive (A5). axe does not check border
contrast, which is why this survived.

**E2 — The price delta on a blocked option card fails AA.**
`optionCard.blocked` is `bg-counter` (`lib/ui.ts:131`) and `optionText.delta(false)`
is `text-brass` (`:139`), rendered at `text-micro` = 11px (`OptionGrid.tsx:131`).
`#8A5A2A` on `#E4E0D6` = **4.45:1** — under 4.5:1, and 11px is not large text.
axe never sees it because no tested route reaches a blocked state.

**E3 — The two "come back later" buttons on the review page have a 1.66:1 edge.**
`review/page.tsx:275` and `:282` are hand-rolled with
`border-graphite … text-quiet` on `bg-ink`. `#3F3D3A` on `#17161A` = **1.66:1**.
The text is fine (`quiet` on ink = 8.54:1); the buttons' *shape* is not visible.
These are Save & share and Download docket — the entire come-back-later path.

**E4 — `border-rule-strong` is marginal on `slab`, which is where the builder
puts it.** `lib/ui.ts:38-43` documents the token as "≥3.0:1 on paper", and that
holds: `#8E887A` on `#FDFCFA` = 3.44:1. But the builder's controls column has no
background of its own (`BuilderShell.tsx:192`, `:203`), so it inherits `bg-slab`
from the root (`:67`), and `StepFooter` is explicitly `bg-slab`
(`StepNav.tsx:201`). Against `#E9E7E2` the same token is **2.85:1**. The affected
controls — the Back button on every step, the `field()` inputs on
`/build/message` — do keep a 3.44:1 inner edge against their own `bg-paper` fill,
so this is arguable rather than clear-cut under 1.4.11's "adjacent colour(s)".
Flagging the number, not asserting the violation: the token's own docstring names
the assumption the layout then breaks.

**E5 — Name and phone have no accessible error announcement.**
`review/page.tsx:204-222`. Correct `<label>` wrapping, but validation
(`:65-67`) produces no message, no `aria-invalid`, no `aria-describedby`, and no
live region. The `disabled` state on the button (`:255`) has no `aria-describedby`
either, so a screen-reader user is told the primary action is unavailable and
never told why.

**E6 — `PhaseMeters` is the only progress indicator on mobile and it is
`aria-hidden`.** `StepNav.tsx:126`. The `aria-hidden` is *correct* — the same two
facts are in adjacent text (`BuilderShell.tsx:94-97`) — but combined with D2 it
means a mobile screen-reader user gets "Step 4 of 9" as text and no way to
navigate to step 2.

**E7 — Colour-only meaning in the price-check pill.**
`review/page.tsx:239-245`: a green `#8FA85E` dot for confirmed, brass for
checking. The dot is `aria-hidden` and the adjacent text says "PRICE CONFIRMED"
/ "CHECKING", so this is *fine*. Noting it only because `#8FA85E` is the single
hardcoded green in the product and exists in no token (see G4).

**Genuinely fine, and better than most:**
- The 3D canvas is a labelled `role="img"` whose alt text is a full generated
  sentence describing the cake (`BuilderShell.tsx:141-145`, `describeCake` at
  `:352-368`), and the same sentence is *visible* as a caption (`:165`) so the two
  cannot drift. The comment at `:128-138` explains why `role="img"` sits on the
  canvas wrapper rather than one level up.
- The price is announced politely, not assertively, on every change
  (`BuilderShell.tsx:230-237`).
- `OptionGrid` is a proper `radiogroup` with roving tabindex and arrow keys
  (`:68`, `:82`, `:53-65`), and blocked options are linked to their reason with
  `aria-describedby` (`:85`, `:144`).
- `:focus-visible` is a global 2px ink outline with an ink-surface override
  (`globals.css:157-167`). One deliberate exception, correctly reasoned
  (`BuilderShell.tsx:193-200`).
- `prefers-reduced-motion` is honoured globally (`globals.css:264-272`), in JS
  where CSS cannot reach (`StepNav.tsx:62-74`), and in the GSAP hero
  (`HeroReveal.tsx:39-41`, `:61-64`) — including a `<noscript>` fallback so the
  page is never blank without script (`:44`, `:93`).
- The `ColorPicker` swatches were moved off `title=` tooltips onto real named
  tiles, with the reason recorded (`ColorPicker.tsx:22-27`).
- Every `next/image` and `<img>` has an `alt` (`app/presets/page.tsx:111`,
  `PresetCard.tsx:62`, `review/page.tsx:362`).
- Heading order is clean: one `<h1>` per step from `StepHeader.tsx:12`, `h2`
  sections below it, `h4` for group headings (`globals.css:152-155`).

## (f) Performance

**F1 — The budget script measures but never asserts.** `scripts/budget.ts:41-44`
`console.log`s the numbers and returns. There is no threshold, no
`process.exit(1)`, and it is not in CI. The "3D bundle under 400 KB gz"
constraint is therefore enforced by nobody. It also only covers `/`,
`/build/shape` and `/presets` (`:51`) — not `/build/review`, the page with the
most components on it.

**F2 — Landing-page LCP is text that starts at `opacity: 0`.**
`HeroReveal.tsx:36-42` ships `[data-hero-reveal] > * { opacity: 0 }` in an inline
`<style>` (`:92`) and only reveals on the hydration layout effect (`:85`). The
`<noscript>` and reduced-motion escapes (`:39-44`) cover script-off and
motion-off, not *slow* script. The LCP candidate is the `text-hero` h1 —
`clamp(3rem, 6.7vw, 6rem)` (`globals.css:88`) — so on an Instagram in-app browser
on a mid-range Android, LCP waits for React. This is the highest-traffic page in
the product.

**F3 — 3.8 MB of preset photography, none of it prioritised.**
`du -sh public/presets` = 3.8M across 21 files; largest `tiramisu-chocolate.webp`
at 289 KB, six files over 200 KB. They are `next/image` with `fill` and correct
`sizes` (`app/presets/page.tsx:109-118`), so Next resizes and serves AVIF/WebP and
lazy-loads below the fold — that part is right. What is missing is `priority` on
the first card, so `/presets`' LCP image is lazily discovered.

**F4 — 21 module-scope `priceCake()` calls per `/presets` render.**
`app/presets/page.tsx:124` and `PresetCard.tsx:92` call `priceCake(p.config)`
inline, and `Design.totalPaise` exists precisely to avoid this
(`prisma/schema.prisma:40-41`) but presets are not DB rows. `priceCake` is pure
and cheap, and `/presets` is a static server component, so this is a real but
almost certainly irrelevant cost. Noted for completeness, not as a problem.

**F5 — Three Google font families on every route.** `app/layout.tsx:9-32`:
Instrument Serif (400 normal + 400 italic), Instrument Sans (variable, all
weights), Martian Mono (400 + 700). All `display: "swap"`, all via `next/font`
so they are self-hosted and preloaded automatically — the right setup. Martian
Mono is a wide-glyph mono and is the *body* face of the docket, which appears on
every builder step; it is the heaviest of the three and the least skippable.

**F6 — `lib/presets.ts` (732 lines) reaches the client.** It is imported by
`app/presets/page.tsx:5` (server, fine) and `app/page.tsx:10` (server, fine) —
but also by `app/shoot/[slug]/page.tsx`, and `LoadConfig` receives full
`CakeConfig` objects as props from a server component, so all 21 configs are
serialised into the RSC payload of `/presets`. That is the correct trade for
"Make it mine" working without a round trip; worth knowing it is ~21 config
objects of props.

**Genuinely fine:**
- The 3D bundle is properly split: `dynamic(() => import("./CakeScene"), { ssr: false })`
  with a skeleton (`LazyCakeScene.tsx:11-14`). `three` is not on the critical path
  of any route.
- `optimizePackageImports: ["@react-three/drei", "three"]` (`next.config.ts:15`).
- `/presets` has **zero** live WebGL contexts now — 21 photographs replaced 21
  canvases, and the reasoning (including what was lost) is written down at
  `app/presets/page.tsx:11-31`. This was the right call and it is the single
  biggest performance decision in the codebase.
- The quality probe (`lib/quality.ts:110-189`) is unusually careful: it waits
  1800ms for the page to settle, takes a *median* frame interval rather than an
  average or a count, discards throttled samples, and gives up after four
  attempts. The reasoning at `:58-108` names three specific ways the naive version
  was wrong.
- `useDisposable` exists for GPU resource cleanup (`components/three/useDisposable.ts`).

**Dead weight worth deleting (not a perf problem, a hygiene one):**
`components/PresetCakeViewer.tsx` — 286 lines, imported by nothing (`grep` finds
only two comment references). Nothing passes the `turntable` prop to `CakeScene`
(`CakeScene.tsx:42`), so `components/three/Turntable.tsx` (166 lines) is reachable
only through a code path no caller takes. Plus four iCloud conflict copies in the
source tree — `lib/ui 2.ts`, `lib/ui 3.ts`, `lib/ui 4.ts` (all three identical,
5,220 bytes, and all three still carrying the *broken* `duration-[--dur-ui]`
shorthand that `lib/ui.ts` fixed), and `tests/slice.test 2.ts`.

## (g) Consistency — the counts

This is the section where the usual argument does not apply. There **is** a
design system: `app/globals.css:17-119` defines 18 colour tokens, 11 named type
sizes, 4 radii, 6 shadows and 5 motion tokens; `lib/ui.ts` provides `btn()` (4
variants × 2 sizes), `iconBtn()`, `field()`, `monoField()`, two eyebrows, and a
three-state `optionCard` language. The docstrings explain what each token means
and, in several cases, which bug motivated it. `btn()`/`iconBtn()` are used at
**24 call sites**.

So the argument for a design system is already won. The finding is that the
system **leaks**, and it leaks at exactly the wrong places.

| Dimension | In the system | Off-system, in use | Where |
|---|---|---|---|
| **Buttons** | 4 variants × 2 sizes = 8, via `btn()` | **5 hand-rolled** + 1 local helper | `app/page.tsx:319` (landing's final CTA), `review/page.tsx:262-266` (**Place order** — the only conversion event), `:275`, `:282`, `BuilderShell.tsx:309` (mobile total), `ToppingBar.tsx:160-168` (`pill()`) |
| **Font sizes** | 11 named (`--text-micro`…`--text-hero`) | **7 arbitrary + 3 raw Tailwind** = 10 more | `app/page.tsx:166` `text-[2.375rem]`, `:200` `text-[2.125rem]`, `:203` `text-[1.375rem]`, `:278` `text-[2rem]`, `review/page.tsx:234` `text-[1.625rem]`, `:393` `text-[0.8em]`, `ColorPicker.tsx:65` + `:83` `text-[0.71875rem]`; `text-sm`/`text-3xl` in `app/lab/*` (dev tooling, fair) |
| **Radii** | 4 (`ticket` 4px, `card` 8px, `panel` 12px, `sheet` 20px) | **5 arbitrary** — `rounded-[4px]`, `[5px]`, `[6px]`×3, `[8px]`, `[10px]` | `ColorPicker.tsx:56, 79, 100`, `OptionGrid.tsx:112`, `StepNav.tsx:98` — several of which are *literally the token value* re-typed as an arbitrary |
| **Colours** | 18 tokens | **12 hardcoded hexes in UI code** (excluding `components/three/*`, where material colours legitimately live) | `ColorPicker.tsx:58` (`#17161A`, `#FDFCFA`), `:59` (`#8E887A`) — all three are tokens re-typed; `review/page.tsx:242` `#8FA85E` (the only green in the product, in no token); `app/page.tsx:264` (`#D8D3C7`, `#E4E0D6`); `finish/page.tsx:108` `#3B2318`; `layout.tsx:46` `#E9E7E2` |
| **Spacing** | Tailwind's scale | **26 distinct values**, incl. 5 arbitrary px | `[3px]`, `[7px]`, `[10px]`, `[18px]`, `[22px]` |
| **Motion durations** | 3 tokens | **15 class strings still use the broken shorthand** | see below |

**G1 — the one that actually shows on screen.** `lib/ui.ts:53-62` documents that
Tailwind v4 dropped the `[--x]` shorthand, so `duration-[--dur-ui]` compiles to
the invalid `transition-duration: --dur-ui` and silently resolves to **0s**. The
comment says "The same shorthand is still in use in about thirty other places
outside this file." It is: **15 live className strings across 11 files** still
carry `duration-[--dur-*]`, and 8 carry `ease-[--ease-*]`. Concretely —
`app/page.tsx:319`, `build/sponge:63`, `build/finish:69`, `build/size:57` and
`:99`, `build/toppings:75`, `build/review:264`, `:275`, `:282`,
`BuilderShell.tsx:309`, `kitchen:178`, `ColorPicker.tsx:56`, `OptionGrid.tsx:89`,
`StepNav.tsx:91`, `:139`. So the selection animation on every option card in the
builder, the phase meter fill, and the landing page's closing CTA all snap
instead of transitioning. `lib/ui.ts` and `PresetCard.tsx` were fixed; the call
sites were not.

**G2 — the token layer is bypassed by the three most important buttons.** The
landing page's closing CTA (`app/page.tsx:319`), `Place order`
(`review/page.tsx:262-266`) and the mobile total (`BuilderShell.tsx:309`) are all
hand-rolled. `review/page.tsx:256-261` shows this was done to fix a real
disabled-contrast bug — but `lib/ui.ts:47-51` had already fixed the same bug in
`OFF`, so the fix exists twice and only one copy is the system's.

**G3 — arbitrary values that are the token, retyped.** `rounded-[8px]` where
`rounded-card` is 8px; `rounded-[4px]` where `rounded-ticket` is 4px; `#17161A`
where `bg-ink` exists. These are the cheapest possible fixes and the clearest
signal that the system is not yet the default reach.

**G4 — one semantic colour with no token.** `#8FA85E` (`review/page.tsx:242`) is
the "price confirmed" green. `globals.css:53-56` states that `seal` means
"blocked, and nothing else" — so a success colour is genuinely missing from the
palette, and its absence is why it got hardcoded.

**Genuinely fine:** the `optionCard` three-state language (`lib/ui.ts:128-145`) is
used consistently by every single-select group in the builder — `OptionGrid`,
both grids on `/build/size`, the toppings grid — so a customer learns it once on
step 1 and reads it for eight more steps. That is the system working exactly as
intended.

---

# Step 3 — Domain pressure-test

Ten failure modes specific to buying a custom cake. Answer, then evidence.

### 1. Is size expressed in servings, not only kg/inches? — **PARTIAL, leaning yes**

Servings exist and are derived, not typed: `deriveServings` (`lib/servings.ts:30-39`)
computes `max = kg×10`, `min = 0.8×max`, and states its own assumption
("based on standard 100g portions", `:37`) rather than hiding it. `servingsLabel`
(`:41-44`) appears on the size step (`app/build/size/page.tsx:32-34`), every
preset card (`PresetCard.tsx:78`, `app/presets/page.tsx:129`), the review page
(`:309`), the docket (`Docket.tsx:78`), the landing hero spec block
(`app/page.tsx:143`) and the downloaded spec sheet (`lib/docket.ts:213`). It is
also frozen onto the order row (`servesMin`/`servesMax`, `prisma/schema.prisma:74-75`).

Why it is only partial: the option card's *headline* is the weight — `"1 kg"` at
`text-item` (`lib/catalog.ts:60`, rendered `OptionGrid.tsx:122`) — and
`"7in · serves 8–10"` is the `text-meta` blurb under it (`:138`). The buyer's own
unit is subordinate to the bakery's. And those blurb strings are hand-typed
(`lib/catalog.ts:59-64`) rather than generated from `deriveServings`, so the two
sources agree today with nothing enforcing it.

*Conversion consequence:* mild. The information is there; a buyer sizing for 25
guests has to read the second line of every card instead of scanning the first.

### 2. Does price update live and visibly, with each add-on attributable? — **YES**

The strongest part of the product. Per-option deltas are computed on the card
itself (`deltaFor`, `lib/pricing.ts:228-233`, called at `OptionGrid.tsx:73`) and
printed in brass at `:129-135`; free options print nothing, deliberately
(`:29-31`). Tiers (`size/page.tsx:67`), layers (`:109`) and the drip
(`finish/page.tsx:90`) do the same. The running total is a pinned control on every
step (`BuilderShell.tsx:221-227` → `MobileTotal:279`) and a live itemised docket
from 1280px (`:240-242`), both animated on change (`price-tick`,
`globals.css:232-235`). `PriceBreakdown` never collapses a line
(`components/docket/PriceBreakdown.tsx:35-44`). The estimate is checked against
`POST /api/price` on the review page (`review/page.tsx:71-98`) and the server is
the authority (`api/orders/route.ts:67-73`).

One flaw, in C8: when client and server disagree, the note says the kitchen's
price stands (`:184`) but the headline (`:236`) and the button (`:268`) still
render the client's number.

*Conversion consequence:* this is the reason to use the site rather than WhatsApp.
Protect it.

### 3. Is lead time and date availability enforced at the START? — **NO. There is no date at all.**

Lead time is enforced, but as *hours*, and at **step 8 of 9**. `DELIVERY_OPTIONS`
and the pincode field both live on `/build/message` (`:99-129`), which
`lib/catalog.ts:216` places at index 7. `lib/delivery.ts` is a good module —
five slots with named windows and honest notes (`:16-52`), three zones with
per-zone slot allow-lists and rider surcharges (`:63-82`), a pincode→zone mapper
(`:84-91`) and a resolver that returns `available` plus a human reason
(`:101-125`).

But: **no date input exists anywhere in the application** (13 `<input>`s across
`app/` + `components/`, none of type `date`); `CakeConfig` has no date field
(`lib/schema.ts:61-89`); `Order` has no date field (`prisma/schema.prisma:50-87`);
and there is no capacity, blackout-date, cutoff or availability check in
`lib/delivery.ts` or anywhere else. The customer is told "lead time 50 hours"
(`resolveSlot:119`) and left to convert that into Saturday themselves.

And the enforcement that *does* exist is late and server-only (A4): the client's
`ready` gate (`review/page.tsx:68`) never reads `slot.available`, so an extended-zone
customer who picks Express 4-hour configures the whole cake, fills in name and
phone, presses the primary action, and receives a 422
(`api/orders/route.ts:83-91`) with no link back to the step that owns the fix.

*Conversion consequence:* severe, and the direct cause of the WhatsApp handoff.
A birthday cake is bought for a **date**. A site that cannot accept one cannot
close the order.

### 4. Can the customer see what they are buying as they configure? — **YES**

Best-in-class here. A live WebGL cake is present on every one of the nine steps
(`BuilderShell.tsx:146-151`), rebuilt from the same `CakeConfig` the price and the
docket read, and the canvas never remounts between steps (the comment at
`globals.css:244-247` explains that this is what makes nine steps feel like one
surface). There is a cutaway that shows sponge and filling
(`BuilderShell.tsx:172-187` → `lib/view.ts:14-15`), the message plaque lifts off
the cake while you type it (`lib/view.ts:17-23`, `message/page.tsx:54-56`),
placement and density controls sit *on* the render rather than under it
(`ToppingBar.tsx:8-27` explains why), and the render is deterministic
(`lib/seed.ts`) so it is the same cake twice.

Two caveats. It is procedural, not a photograph, and nothing on the page says so
— there is no "your cake will look close to this" disclaimer anywhere. And
`lib/photos.ts:18` being empty means there is nothing real beside it to calibrate
against (C4).

### 5. Are dietary and hard requirements first-class filters? — **PARTIAL**

`eggless` and `sugarFree` are first-class fields on the config
(`lib/schema.ts:84-85`), eggless defaults to `true` (`:119`), both have real
controls with honest blurbs on step 3 (`app/build/sponge/page.tsx:28-43`), both
reach the price (`lib/pricing.ts:207-209` — sugar-free is +₹250, eggless is
**free**, which is the right call for the default), the rules engine
(`lib/rules.ts:105-111` blocks sugar-free fondant with a one-tap fix) and the
docket (`lib/docket.ts:160-167`).

Allergens are excellent as *disclosure*: `lib/allergens.ts` derives 10 allergen
types per component (`:7-17`), distinguishes "inherently contains egg" from
"contains egg unless the eggless recipe is chosen" (`:20-25`), emits a specific
caveat when an eggless cake has meringue toppings (`:138-141`), and documents its
own surprising cases (`:53-55` on rabri, `:59-60` on Biscoff being dairy-free).

But allergens are a **read-out at step 9** (`review/page.tsx:323-328`), not a
**filter at step 1**. There is no nut-free toggle, and it would take one: eight
toppings and three fillings carry tree nuts (`lib/allergens.ts:95, 100-105, 62-64`)
and carrot sponge carries walnut (`:37`). There is also **no free-text notes
field anywhere** in the flow — which is unusually disciplined, and also means a
requirement the schema does not model cannot be expressed at all.

*Conversion consequence:* a nut-allergic buyer cannot filter and cannot ask. They
leave and message.

### 6. Reference photo upload — **NO, it does not exist**

`grep -rn 'type="file"|upload|FormData|multipart|cloudinary|uploadthing|s3'` over
`app/ lib/ components/` returns nothing. `prisma/schema.prisma` has no image,
blob, or attachment field on `Design` (`:35-48`) or `Order` (`:50-87`).

This is a defensible product decision — the builder's whole premise is that you
*compose* the cake rather than send a picture of someone else's — but it is also
the single most common thing a customer arrives from Instagram wanting to do.
With no upload and no notes field, "can you make this one?" has exactly one
destination, and it is not this site.

### 7. Save / share / come-back-later for a half-built order — **PARTIAL**

Three mechanisms exist and all three work:
- **Refresh-safe**, via `sessionStorage` + zundo (`lib/store.ts:31-58`), with a
  field-by-field salvage so a half-typed pincode cannot destroy the cake
  (`:38-55`).
- **A short URL**: `POST /api/designs` → `/d/<slug>` (`app/api/designs/route.ts:28-37`),
  rendered by `app/d/[slug]/page.tsx` with a full preview, price breakdown,
  allergens and a "Make this one mine" button (`:99`). Collision-safe (`:28-31`),
  view-counted (`:53`).
- **A URL-only design**: base64url in the query string, no DB row, no expiry
  (`lib/share.ts:4-22`, `app/d/new/page.tsx`), with a proper broken-link state
  (`:25-38`). `encodeConfig` uses base64**url** specifically so it survives a
  WhatsApp forward (`lib/share.ts:3`).

Why partial:
- Both save paths are **only on the review page** (`review/page.tsx:274`, `:374`).
  A customer who wants to send step 4 to their sister cannot; they must complete
  all nine steps first.
- `Save & share` requires a database and returns 503 without one
  (`api/designs/route.ts:15-17`).
- The URL-only escape hatch — the one that always works — is the **last element
  on the page**, in `text-micro` mono (`:372-377`).
- Nothing durable: `sessionStorage` dies with the tab (A6), and there is no
  "email me this design" because there is no email field anywhere in the schema.

### 8. Cancellation, refund, change-of-date policy — **NO, not before or after**

`grep -rni 'refund|cancel|policy|terms|privacy|reschedule|amend'` over
`app/ components/ lib/` hits only the internal `cancelled` order status
(`lib/orders.ts:19-22, 44, 58`) and the staff-only Cancel button
(`app/kitchen/page.tsx:146`). No terms page, no privacy page, no policy copy on
the review page, nothing in the docket (`lib/docket.ts:196-260`), nothing on the
confirmation (`review/page.tsx:383-413`).

The customer also cannot change anything themselves: `app/kitchen/actions.ts` is
the only status mutation path, `canTransition` enforces forward-only
(`lib/orders.ts:15-30`), and the board is behind HTTP Basic (`proxy.ts:83`). With
no payment taken this is lower-stakes than it would otherwise be — but "what if I
need to move it to Sunday" is the question that sends a first-time buyer to
WhatsApp, and the site does not answer it.

### 9. Reorder in one action — **NO**

No `User` model in `prisma/schema.prisma`. `Order.userId` is a nullable hook with
a comment saying so (`:61-62`). No auth of any kind for customers — `grep` for
auth/session/login/jwt/cookie finds only `proxy.ts`'s HTTP Basic for `/kitchen`.
No order-lookup route: `Order.ref` is `@unique` (`:53`) and indexed implicitly, so
a lookup-by-reference page is *cheap* to build, but none exists. `GET /api/orders`
does not exist — only `POST`.

A returning customer's only route back to a past order is a `/d/<slug>` link they
saved before ordering, if they saved one. There is no index on `customerPhone`
either (`:85-86` index `[status, createdAt]` and `[userId]`), so even a
phone-number lookup would need a schema change.

### 10. Where does the flow leak off-site? — **Nowhere in the code, everywhere in reality**

There is no WhatsApp link, no `tel:`, no `mailto:`, no Instagram link, no phone
number in the entire codebase (grep confirms zero hits for
`wa.me|whatsapp|tel:|mailto:|instagram|\+91`). So the leak is not a button someone
added — it is structural, and it has three named causes:

1. **No date field** (#3). A birthday cake needs a date; the site cannot take one.
2. **No delivery address field** (#2 above / B2). `Order` stores `pincode`,
   `deliverySlot`, `leadHours` (`prisma/schema.prisma:69-71`) and nothing else
   locational. `renderSpecSheet` — the document the kitchen works from — prints
   `Pincode: 500081` and no street (`lib/docket.ts:246-251`).
3. **No reference photo and no notes field** (#6). "Can you do this one?" has no
   home.

The product's own copy is honest about the consequence: "We call to confirm"
appears on the landing page twice (`app/page.tsx:196`, `:324`), on the review
card (`:249`), beside the phone field (`:200`) and on the confirmation (`:398`).
The phone call is not a nice touch — it is a **required step**, because the order
row is not fulfillable without it. That is the finding this whole audit turns on:
the WhatsApp habit is not a UX preference the builder needs to out-compete, it is
the only place two mandatory facts can currently be collected.

---

# Step 4 — Ranked

Impact is judged only against **completed orders finished on-site**. Cost is
engineering effort: **S** ≤ half a day, **M** ≤ a week, **L** more than that.
Sorted by impact-per-cost.

| # | Problem | Flow | Impact on on-site completion | Cost | Ref |
|---|---|---|---|---|---|
| 1 | Landing "Make it mine" goes to `/presets` instead of loading that cake | Browse → configure | **High.** First screen, Instagram traffic, and the fix is swapping a `Link` for the `LoadConfig` already used on `/presets` | **S** | A1 |
| 2 | Slot unavailability is a server-only 422 after the customer commits | Checkout | **High.** Add one rule to `lib/rules.ts` and `OptionGrid`, `StepFooter`, `canSubmit` and `ViolationCard` all start honouring it for free | **S** | A4 |
| 3 | Name/phone have no validation message; the primary button is disabled with no reason given | Checkout | **High.** Last gate before the only conversion event | **S** | E5, forms table |
| 4 | `POST /api/orders` has no idempotency key | Confirmation | **High.** Prevents duplicate orders the kitchen cannot distinguish | **S** | A3 |
| 5 | No phone number, and no cancellation / change-of-date policy, anywhere | Trust | **High.** The two questions a first-time buyer asks before committing ₹2,000 | **S** (content) | C1, C2 |
| 6 | 15 className strings still use the dead `duration-[--dur-*]` shorthand, so most builder transitions are 0s | All | **Medium.** Perceived quality on every tap; a `sed` and a visual-baseline run | **S** | G1 |
| 7 | `sessionStorage` — the design dies with the tab | Configure | **Medium.** One word to `localStorage`, plus a "start fresh" affordance | **S** | A6 |
| 8 | FSSAI licence renders as "shown when configured" | Trust | **Medium.** Set `NEXT_PUBLIC_FSSAI_LICENCE`. Deployment, not code | **S** | C3 |
| 9 | Price-mismatch state shows the client's number on the button while the note says the server's stands | Checkout | **Medium.** A money path with two numbers on it | **S** | C8 |
| 10 | Downloaded docket filename uses the preview ref, contents use the real one | Post-order | **Medium.** One expression | **S** | C7 |
| 11 | `Start again` is an unconfirmed, un-undoable wipe next to Undo | Configure | **Medium.** A confirm step or a two-stage press | **S** | A5 |
| 12 | `Place order` is not pinned; it sits above ~8 detail sections | Checkout | **Medium.** Every other step pinned its forward action | **S** | A8 |
| 13 | No mobile step navigation — Back-only, on 80% of traffic | Configure | **Medium** | **S–M** | D2 |
| 14 | `iconBtn` borders at 1.77:1; review's secondary buttons at 1.66:1; blocked-card delta at 4.45:1 | A11y | **Low–medium** direct, and it breaks the project's own stated standard | **S** | E1–E3 |
| 15 | **No delivery date field, anywhere** | Configure → checkout | **Decisive.** The order is not fulfillable without a phone call until this exists | **M** | B1, #3 |
| 16 | **No delivery address field, anywhere** | Configure → checkout | **Decisive**, same reason | **M** | B2, #10 |
| 17 | Confirmation exists only in React state — no `/order/[ref]`, no email, no SMS | Confirmation → post-order | **High.** Also the cheapest fix for #4, because a URL is idempotent | **M** | A2 |
| 18 | Delivery + pincode are step 8 of 9 | Configure | **High.** Price is incomplete and serviceability unknown for 7 screens | **M** | B3 |
| 19 | No nut-free filter and no notes field | Configure | **Medium.** Excellent allergen *derivation* exists; it is disclosure, not filtering | **M** | B4, #5 |
| 20 | Save/share only exists on the review page | Configure | **Medium.** Multi-person decisions happen mid-build | **M** | #7 |
| 21 | Landing LCP is text at `opacity: 0` until hydration | Performance | **Medium** on the highest-traffic page, mobile 3G | **M** | F2 |
| 22 | Playwright never runs a mobile viewport | All | **Low** direct, **high** preventive on 80% of traffic | **S** | D1 |
| 23 | `scripts/budget.ts` measures but never asserts; not in CI | Performance | **Low** direct; it is the only guard on a stated hard constraint | **S** | F1 |
| 24 | No route-level `error.tsx`; `/d/[slug]` DB failure is an unstyled 500 | Browse | **Low–medium.** That URL is the one people forward | **S** | 1.3 |
| 25 | No `priority` on the first `/presets` image | Performance | **Low** | **S** | F3 |
| 26 | ~740 lines of dead code + 4 iCloud conflict copies carrying the *old broken* CSS | Maintenance | **None** on conversion; removes a trap | **S** | F, G1 |
| 27 | No reference-photo upload | Configure | **High** ceiling, but a genuine product decision, not an oversight | **L** | #6 |
| 28 | No order lookup, no reorder, no auth | Post-order | **Low now** (~40 orders/month, few repeats yet); rises with volume. `Order.ref` is already `@unique`, so lookup-by-reference is the cheap half | **M** | #9 |
| 29 | No payments | Checkout | **High** ceiling, out of this audit's scope, and defensible while the phone call is mandatory anyway | **L** | known |

**Read the table this way:** rows 1–14 are all **S** and together they are about a
week. Rows 15–18 are the ones that actually decide whether this business goal is
achievable, and they are one connected change: *collect when and where, then give
the order a URL.*

---

# Step 5 — Proposed structure

## 5.1 Information architecture and route map

The current IA is sound. What follows is a small number of targeted changes, each
justified against a specific finding above. Nothing here renames or removes a
route that has SEO value or a saved link pointing at it.

### Keep unchanged
- `/` and `/presets` — the only two indexed marketing surfaces. `/presets` keeps
  its URL (existing SEO) and every `PRESETS` slug keeps resolving.
- `/d/[slug]` and `/d/new?c=` — hard constraint: every saved design URL keeps
  working. Both are already good pages.
- `/kitchen`, `/lab/*`, `/shoot/[slug]` — correct as noindex tooling.
- `/api/price`, `/api/orders`, `/api/designs`.
- The nine `/build/<slug>` URLs continue to **resolve**; merged ones redirect.

### Merge — 9 steps become 7
- `/build/shape` **+** `/build/size` → **`/build/shape`** ("Shape and size").
  They are already one phase in the code (`StepNav.tsx:34`,
  `Structure: ["shape","size"]`). `/build/size` redirects. *Justified by:* B3 —
  every step removed from the front is runway for the two facts that have to move
  forward.
- `/build/sponge` **+** `/build/filling` → **`/build/flavour`**. Also already one
  phase (`StepNav.tsx:35`). The bundt caveat (`filling/page.tsx:23-28`) reads
  better beside the sponge choice anyway. Old URLs redirect.
- *Not merged:* `/build/frosting` and `/build/finish`. Together they are frosting,
  coverage, colour, finish and drip — five decisions and two `ColorPicker`s. On a
  375px screen that is a long scroll, and D3 says the controls column is already
  the constrained resource.

### Split out — the brief moves to step 2
- **`/build/size` becomes `/build/brief`** — the step that asks *who, when,
  where*: servings-or-weight, **date**, pincode, delivery slot, and the dietary
  hard-nos. It already asks the right question — `lib/catalog.ts:210` sets the hint
  to "How many people are eating?" — it just does not ask the other three.
  *Justified by:* B1, B2, B3, A4, and domain checks #3 and #5. Consequences worth
  stating: the price becomes complete from step 2 (delivery fee is in it), an
  unserviceable pincode is caught before any effort is spent, and the date makes
  the phone call optional rather than mandatory.
- **Shape stays step 1.** Deliberately. The first tap has to be a cake, not a
  form — that is the whole hook, and `lib/catalog.ts:12-22` explains why the
  silhouette picker matters. A brief-first flow would put a date picker in front
  of the product.
- **`/build/message` keeps only the message.** Delivery moves to the brief.
  `FIELD_STEP` (`StepNav.tsx:13-22`) gets `delivery`/`pincode` repointed at
  `brief`, and `StepFooter`'s cross-step blocker linking (`:202-213`) then works
  for delivery violations with no further code.

### Add
- **`/order/[ref]`** — noindex, server-rendered from `Order.ref` (already
  `@unique`, `prisma/schema.prisma:53`). Renders the existing `Docket` with
  `stamped` and `reference` — both props already exist and are currently unused
  (`Docket.tsx:14-16`). Redirect the review page here on success instead of the
  in-place `Placed` return. *Justified by:* A2, A3, C7 — and it makes submission
  idempotent for free, because the customer lands on a URL rather than on a form
  that is still armed.
- **`/order`** — noindex lookup: reference + phone. *Justified by:* #9, C1. Cheap
  because `ref` is unique; would need an index on `customerPhone` to be more than
  a reference lookup.
- **`/policy`** — one static page: cancellation, change-of-date, refund, allergen
  handling, and what "we call to confirm" actually means. Linked from the footer
  and from one line under `Place order`. *Justified by:* C2 — and it is content,
  not engineering.
- **`error.tsx`** at the root and at `app/d/`. *Justified by:* 1.3.
- **`Order.deliveryDate`, `Order.addressLine`, `Order.landmark`** — plus the
  matching lines in `renderSpecSheet` (`lib/docket.ts:246-251`) and the kitchen
  board. **These are order fields, not `CakeConfig` fields.** That distinction is
  load-bearing: putting a date into `CakeConfig` would change every saved
  `/d/[slug]` payload, every config hash and the docket — which is precisely the
  reasoning `lib/view.ts:5-11` uses to keep the cutaway out of the config. A cake
  design is reusable; the date it is wanted on is not part of the cake.

### Cut
- `components/PresetCakeViewer.tsx` (286 lines, zero importers) and
  `components/three/Turntable.tsx` (166 lines, reachable only through a prop
  nothing passes — `CakeScene.tsx:42`).
- `lib/ui 2.ts`, `lib/ui 3.ts`, `lib/ui 4.ts`, `tests/slice.test 2.ts`,
  `UI_REDESIGN_PLAN {2,3,4}.md` — iCloud conflict copies. The three `ui` ones are
  byte-identical to each other and still contain the broken shorthand `lib/ui.ts`
  fixed, which is a live trap for anyone who opens the wrong file.

## 5.2 The redesigned primary flow

| | Current | Proposed |
|---|---|---|
| Page loads, landing → confirmation | **11** (`/` → 9 steps → in-place success) | **10** (`/` → 7 steps → `/build/review` → `/order/[ref]`) |
| Builder steps | 9 | **7** |
| Steps before delivery serviceability is known | 8 | **2** |
| Steps before the price is complete | 8 | **2** |
| Typed fields, whole flow | 4 (message, pincode, name, phone) | **7** (message, pincode, **date**, **address**, **landmark**, name, phone) |
| Facts that must be re-collected by phone | 2 (date, address) | **0** |
| Confirmation survives a refresh | No | Yes |

More fields, fewer steps, and the phone call becomes a courtesy instead of a
dependency. That trade is the whole point: three extra inputs replace an
out-of-band conversation.

1. **`/`** — hero cake, live price, three featured presets. *Featured cards load
   their cake* (fixes A1).
2. **`/build/shape`** — silhouette, then weight, tiers, layers. Servings as the
   card headline, weight as the supporting line (fixes B5). One step, two groups,
   the pattern `/build/size` already uses.
3. **`/build/brief`** — *"Who is it for, and when?"* Servings confirmed, **date**
   (a native `<input type="date">` with `min` derived from
   `resolveSlot().effectiveLeadHours` — no picker library, and the lead-time logic
   already exists), pincode, slot (unavailable slots marked in place by a new
   `lib/rules.ts` rule, so `OptionGrid` handles it for free), and the dietary
   toggles including a new **nut-free** one. Price is now complete.
4. **`/build/flavour`** — sponge, then filling, with the bundt note.
5. **`/build/frosting`** — frosting, coverage.
6. **`/build/finish`** — colour, finish, drip.
7. **`/build/toppings`** — unchanged, including the `ToppingBar` on the render.
8. **`/build/message`** — message and piping colour only.
9. **`/build/review`** — docket, name, phone, address, landmark, `Place order`
   **pinned** in the footer where every other step put its forward action, with a
   one-line link to `/policy`.
10. **`/order/[ref]`** — a real URL. Stamped docket, download, "what happens next"
    with a phone number, and a `Reorder this` button that loads the config back
    into the builder.

Save-and-share moves out of the review page and into the shell header — one
control, available on every step (fixes #7 and A6).

## 5.3 Two approaches for the configurator

### Option A — keep the linear stepper, refined

Seven URLs, one decision-group per screen, the persistent three-region shell
(`BuilderShell.tsx:104-243`) unchanged.

**For.** Every step is a real URL, so back, forward, refresh and deep-link all
work for free — the comment at `StepNav.tsx:55` is not aspirational, it is how the
thing behaves. That property is also what the visual baselines key off
(`e2e/snapshots/`), so it protects a hard constraint directly. It gives one
focused decision per screen, which is right for a first-time buyer who does not
know what "semi-naked" or "combed" means. It is the only shape that works on a
375px viewport, where the canvas and the controls already compete for the whole
screen (D3). And it exists, so the cost is the merges and the new brief step, not
a rebuild.

**Against.** Seven page loads still read as a form to someone who arrived from a
photo on Instagram. A step deep in the flow cannot be reached in one action on
mobile (D2). And the shape structurally invites "configure everything, then
discover" failures — A4 is exactly that, and it will recur.

### Option B — single-page live-preview builder

One `/build` route. Sticky canvas, all decision groups in a scrolling accordion
beside it, docket in the third column. No Next/Back.

**For.** The whole cake is one object on one screen; a customer can go straight to
"I only want to change the toppings", which is the actual behaviour after loading
a preset. It kills the discover-late class of bug outright, because everything is
visible. On desktop it is barely a change: the 1280px shell already shows cake,
controls and docket at once (`BuilderShell.tsx:108`), so ≥1280 is already most of
a single-page builder.

**Against, and these are real.** URLs go from nine to one, so back/forward stop
meaning anything and the e2e visual baselines lose their addressing scheme —
directly against a stated hard constraint. Scroll restoration becomes something
you own rather than something the browser does. The 0-axe-violation result has to
be re-earned: nine `<h1>`s collapse into one page whose heading order, landmark
structure and focus management all change at once. On mobile it is *worse* than
what exists — eight accordion groups above a sticky canvas means either the canvas
covers the controls or the controls push the canvas off-screen, and watching the
cake change while you tap is the one thing this product sells. It also removes the
progress signal, and "Step 4 of 9" is a promise that this ends, which matters to a
first-time buyer.

### Recommendation — **A**, with one borrowing from B

Keep the stepper. The reasons are not sentimental:

1. **Mobile is 80% of traffic and B is worse there.** The strongest thing this
   product does is show the cake changing under your thumb. On a 375px screen a
   single page makes the canvas and the controls fight for the same pixels; the
   stepper is what lets the canvas keep 39dvh permanently.
2. **Two hard constraints point the same way.** Deterministic renders with
   per-route visual baselines, and 0 axe violations across nine routes, are both
   *addressed by URL*. Collapsing to one route risks both to buy something the
   desktop layout already delivers.
3. **The stepper's known weakness is fixable without B.** "Configure everything,
   then discover" is not inherent to steppers — it is what happens when the
   blocking facts are asked for last. Moving delivery to step 2 fixes it, and
   `lib/rules.ts` + `blockerFor` + `StepFooter`'s cross-step linking are already
   the machinery that enforces it.

The one thing worth taking from B: on `xl` (≥1280), where all three regions are
already visible, let the controls column render **all seven groups in a single
scroll with sticky group headers**, keeping the seven URLs as anchors that scroll
and move focus rather than navigate. Desktop gets B's jump-anywhere freedom,
mobile keeps A's one-decision-per-screen, the URLs and the baselines survive
intact, and `useStepPosition()` (`StepNav.tsx:47-53`) is already the hook that
would drive it.

---

## Where the code is simply good

Stated plainly, because it is most of the codebase and because the ranking table
reads harsher than the repository deserves.

- **`CakeConfig` as one source of truth** (`lib/schema.ts:61-89`) flowing to UI,
  renderer, pricing and docket, with a migration seam already written for v2
  (`:124-136`) — and the discipline to keep the cutaway *out* of it
  (`lib/view.ts:5-11`).
- **Money as paise integers, formatted only in `lib/format.ts`.** No float
  arithmetic anywhere in `lib/pricing.ts`.
- **`lib/rules.ts`** — 12 compatibility rules phrased as facts about cake rather
  than about software, with one-tap fixes, and `blockerFor` (`:130-146`) reporting
  only what an option would *newly* break. The comment at `:122-128` explains why
  that distinction matters.
- **`lib/allergens.ts`** — derived, never typed, with the egg cases split
  correctly and the counter-intuitive ones documented (`:53-55`, `:59-60`).
- **`lib/quality.ts:110-189`** — the most careful piece of code in the repository.
- **`lib/store.ts:38-55`** — a field-level salvage on rehydrate instead of
  all-or-nothing, with the exact bug it fixed written down.
- **`lib/share.ts:33-47`** — a birthday-bound collision analysis that correctly
  concluded the retry loop was load-bearing rather than a backstop.
- **`proxy.ts`** — fails closed on a missing password (`:34-46`), splits on the
  first colon only (`:57`), and compares in constant-ish time with the residual
  leak documented (`:18-22`).
- **The comment culture.** Nearly every non-obvious decision here carries the
  reasoning *and* the failure that motivated it — `app/page.tsx:48-53`,
  `BuilderShell.tsx:113-121`, `StepNav.tsx:175-181`,
  `app/presets/page.tsx:131-155`, `lib/quality.ts:191-218`. This audit was
  substantially faster to conduct because of it, and several findings above are
  things the code had already written down about itself.

---

## Method and limits

Every route file, every `lib/` module, every `components/builder/*` and
`components/docket/*` file, `prisma/schema.prisma`, `proxy.ts`,
`playwright.config.ts`, `next.config.ts`, `scripts/budget.ts` and
`e2e/a11y.spec.ts` were read directly. Counts (presets, image bytes, distinct
spacing/type/colour values, `duration-[--dur-*]` occurrences) come from shell
pipelines over the tree, not estimates. Contrast ratios are computed from the
tokens in `app/globals.css:17-56`.

Not done, and worth knowing: nothing was measured in a running browser. LCP (F2),
the built-CSS resolution of the `monoField` font-size collision (D5), and the
actual gzipped 3D bundle were reasoned from source, not observed. `npm run budget`
and a mobile Lighthouse run would settle all three.

*End of read-only phase. No application file was modified. Awaiting review before
any implementation.*
