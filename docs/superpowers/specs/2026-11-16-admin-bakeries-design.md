# Admin bakeries hub — design

Date: 2026-11-16 · Admin redesign, spec 3 of 3. Spec 1 (the "Needs you" home) was PR #73. Spec 2 (the orders workspace) was PR #74.

## Why

Assignment is automatic: nearest bakery first, then the next one if a bakery says no. So the admin's real lever is the **supply side**. They need to know:
- which bakeries are still being onboarded;
- which cakes no bakery can make right now;
- which bakeries keep saying no or answer slowly;
- where orders find no bakery at all.

Today `/admin/vendors` is one table plus an "Add a bakery" form. The cake coverage view, the performance view and the area view don't exist. The admin works equally on phone and laptop.

## Decisions made

- **Approach A:** one hub at `/admin/vendors` with four tabs, kept in the URL as `?tab=`: **Pipeline** (default) · **Cakes** · **Performance** · **Areas**.
- **Reuse:** part 1's `ActionItem`, `FilterChips` and `StatList`, the warm tokens, and sub-project 1's `vendorStage` / `vendorSetupStates`.
- **No map,** no new tables, no migrations. Bakery detail pages (`/admin/vendors/<id>`) are unchanged.

## 1. Tabs row

`FilterChips` with `param="tab"`: Pipeline · Cakes · Performance · Areas. An unknown value falls back to Pipeline. Each tab loads only its own data.

## 2. Pipeline tab (default)

**Grouping.** Bakeries are grouped by `vendorStage`, in this order. Each group has a heading with its count, and empty groups are hidden. Each row is an `ActionItem` whose title links to `/admin/vendors/<id>`.

| Group | Detail line | Action |
| --- | --- | --- |
| Ready for review | "4 of 4 done · N cakes" | **Review** → `/admin/vendors/<id>` (Approve lives there) |
| Setting up | "Needs: pin, cakes" (the missing checklist steps) | **Call** (`tel:` via the shared `telHref`); hidden when there is no phone |
| Invited | "Invite sent N days ago" (invite expiry minus 7 days) | **Resend**: the existing `resendInvite` action, showing the new link and the Send on WhatsApp button in place |
| Invite expired | "Invite expired" | **Resend** |
| Paused | "Not taking orders" | **Call** |
| Live | "N orders today · taking orders" | none (the title link opens the bakery) |

- **Live on phone:** below `sm`, the Live group is collapsed behind "Show N live bakeries", using a native `<details>`.
- **Add bakery:** the existing "Add a bakery" form moves behind an **Add bakery** button at the top (a native `<details>`). The form and its behaviour, including the WhatsApp-code verification and the invite card, are unchanged.

## 3. Cakes tab — coverage

**Columns and rows.** One row per catalogue cake that is on sale. Columns are the sizes that cake's `CakeVariant`s offer.

**Cell values.** Each cell shows two counts, **Egg n · Eggless n**:
- the number of **live** bakeries (`isActive && isAcceptingOrders`)
- whose `VendorInventory` row for that cake, size and egg type `isOfferable` now: on, and not paused.

This is the same rule automatic assignment uses. An egg type the cake doesn't offer shows "—".

**Gaps.**
- A **gap** is a count of 0 for an egg type the cake offers. It is shown in red.
- A gap is **caused by a pause** when at least one live bakery has that variant on but paused.

**Summary line:** "N gaps across M cakes · K caused by pauses".

**Filter chips** (`?show=`): **Gaps only** (the default when any gap exists) · **All cakes**.

**Layout.**
- **Laptop:** a table. Tapping a cell expands, through `<details>`, the names of the bakeries that cover it.
- **Phone:** one card per cake, with a chip per size showing both counts. Gap chips are red.

## 4. Performance tab

**Window chips** (`?days=`): 7 · **30** (default) · 90.

**Per bakery,** from `VendorOrder` rows whose `offeredAt` falls inside the window:
- **Offers:** the number of rows.
- **Accepted % / Said no % / Didn't answer %:** based on `assignmentStatus` ACCEPTED / REJECTED / EXPIRED. Rows that are still OFFERED, or CANCELLED, are excluded from the denominator.
- **Typical answer time:** the median of `respondedAt − offeredAt` over the answered rows (ACCEPTED and REJECTED), shown as "N min".
- **Late:** of the accepted rows that reached handover, the share where the handover time is after the order's due time (`dueAt ?? requestedFor`). Use the `VendorOrder` handover stamp the code already records.

**Flag.** A bakery gets an amber "needs a chat" tag, with the first reason that applies, when it has at least 5 offers in the window and any of these holds:
- accepted under **60%** ("accepts N in 10 offers");
- a typical answer slower than **10 min** ("answers in N min");
- **more than 10%** late ("N in 10 late").

**Order and layout.** Flagged bakeries come first, then by most offers. Bakeries with no offers show "No offers yet" and are never flagged. Laptop shows a table; phone shows cards. A row links to `/admin/vendors/<id>`.

## 5. Areas tab

**Window chips** (`?days=`): 7 · **30** (default) · 90.

**Missed orders.** These are orders in the window with `status = cancelled` and `cancellationReason = UNDELIVERABLE` (from lib/orders).
- **Grouping:** by `Order.pincode` when present, else the delivery address `locality`, else a coordinate square of about 1 km ("near 17.43, 78.40", with latitude and longitude rounded to 2 decimal places).
- **Each line shows:** the area, the count missed, and "last on <date>". It also names the **nearest live bakery** to the group's latest order location: "Sweet Crumbs · 12.4 km (delivers up to 10 km)". Distance is straight-line `haversine` from `lib/assignmentRules`.
- **Sorting:** most missed first.

**Live bakery reach.** One line per live bakery: its name, its locality or coordinates, and "delivers up to N km".

**Stated limit** (shown on the page as a small note): addresses refused at checkout never become orders, so they are not counted here.

## 6. Code layout

- **`lib/bakeriesHub.ts`** (pure):
  - `type HubTab = 'pipeline' | 'cakes' | 'performance' | 'areas'` and `parseTab`
  - `pipelineGroups(rows)`: the stage order, missing-step words, and days since the invite
  - `coverageGrid(cakes, liveRows, now)`: cells, gaps and the pause-caused flag
  - `bakeryStats(rows, now)`: percentages, median, late share and flag reason
  - `missedAreas(orders, liveBakeries)`: the grouping key, counts, latest, and nearest bakery with distance
- **`lib/bakeriesHubData.ts`** (server-only): one loader per tab, each bounded to its window or to live bakeries.
- **`app/admin/vendors/page.tsx`:** the tabs row and the four tab bodies. The Add bakery form moves behind a `<details>`.

## 7. Errors and permissions

- **Empty tabs:**
  - "No bakeries yet: add one to get started"
  - "No gaps: every cake has a bakery right now"
  - "No offers in this window"
  - "No missed orders in this window"
- **Unknown `tab` or `days`:** the default.
- **Database unreachable:** the existing `Notice`.
- **Access:** `requireAdmin()`, unchanged. Resend and Approve reuse the existing actions, which re-check admin.

## 8. Testing

**Unit tests (`tests/bakeriesHub.test.ts`):**
- `parseTab` falls back to pipeline.
- `pipelineGroups` covers stage order, the missing-step words, and the days since the invite.
- `coverageGrid` covers:
  - Egg/Eggless counts;
  - "—" for an egg type the cake doesn't offer;
  - a gap;
  - a pause-caused gap;
  - a non-live bakery not counted.
- `bakeryStats` covers:
  - percentages excluding OFFERED and CANCELLED;
  - the median answer time;
  - the late share;
  - each flag reason;
  - no flag under 5 offers.
- `missedAreas` covers the pincode → locality → coordinate fallback, sorting, and the nearest live bakery with distance.

**Integration test (`tests/bakeriesHub.integration.test.ts`, fresh scratch Postgres):** each loader returns the seeded rows, with asserts scoped to them.

**Browser check at 375px and laptop width:** each tab renders; Resend shows a link; the Cakes cell expands; window chips change the numbers; and old bakery links still work.

## Not doing

- **A map view** of coverage.
- **Recording checkout-refused addresses.**
- **Messaging bakeries from the hub** (calls only).
- **Changing assignment rules,** radius settings or bakery detail pages.
