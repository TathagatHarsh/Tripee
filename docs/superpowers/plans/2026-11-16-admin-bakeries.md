# Admin Bakeries Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/vendors` into a four-tab bakeries hub: Pipeline (onboarding stages with one action each), Cakes (live coverage gaps), Performance (accept/decline/answer time/late), Areas (where orders found no bakery).

**Architecture:**
- Pure maths lives in `lib/bakeriesHub.ts`.
- Server loaders live in `lib/bakeriesHubData.ts`, one per tab, bounded.
- Each tab is rendered by a small server component in `components/admin/bakeries/`, so it is markup-testable.
- `app/admin/vendors/page.tsx` renders the tabs row, then the selected tab.

**Tech Stack:** Next.js App Router (server components), Prisma/PostgreSQL, Tailwind `a-` tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-admin-bakeries-design.md`

## Global Constraints

- **No migrations, no new tables, no map.** `/admin/vendors/<id>` is unchanged.
- **Tabs** (`?tab=`): `pipeline` (default) · `cakes` · `performance` · `areas`. Unknown → `pipeline`.
- **Windows** (`?days=`): `7` · `30` (default) · `90`. Unknown → `30`.
- **Live bakery:** `isActive && isAcceptingOrders`.
- **Offerable:** `isOfferable` from `lib/inventoryRules.ts`.
- **Undeliverable:** `cancellationReason === UNDELIVERABLE` (lib/orders.ts).
- **Pipeline order:** ready_for_review → setting_up → invited → invite_expired → paused → live.
- **Pipeline actions:**
  - Review → `/admin/vendors/<id>`
  - Call → shared `telHref` (lib/needsYou.ts), hidden without a phone
  - Resend → the existing `resendInvite` action (app/admin/actions.ts:1283), with `InviteLink` showing the result
- **Missing-step words:** location → "pin", cakes → "cakes", details → "details". Example: "Needs: pin, cakes".
- **Performance:**
  - Denominator: ACCEPTED + REJECTED + EXPIRED.
  - Answer time: the median of `respondedAt − offeredAt` over ACCEPTED + REJECTED, in whole minutes.
  - Late: of accepted rows with `handedOverAt`, the share where `handedOverAt > (order.dueAt ?? order.requestedFor)`.
  - Flag only when there are ≥ 5 offers. The first matching reason wins:
    - accepted < 60% → "accepts N in 10 offers"
    - median > 10 min → "answers in N min"
    - late > 10% → "N in 10 late"
    - N is rounded to the nearest whole number.
- **Areas:** group by `Order.pincode`, else `deliveryLocation.locality`, else `near <lat2>, <lng2>` (2 decimals). Nearest live bakery uses `haversine` from lib/assignmentRules, with the distance to 1 decimal and "delivers up to N km".
- **Copy (verbatim):**
  - "No bakeries yet: add one to get started"
  - "No gaps: every cake has a bakery right now"
  - "No offers in this window"
  - "No missed orders in this window"
  - "Addresses refused at checkout never become orders, so they are not counted here."
- **Every control ≥ 44px.** Warm `a-` tokens only.
- **Tests:** integration only against scratch Postgres. Never production. No `git stash`.

## Review Focus

1. **A bakery with an offer still OFFERED:** it must not count against acceptance or answer time. Test: Task 1, "pending offers excluded from rates".
2. **A cake whose only bakery has it paused:** shown as a gap and counted as "caused by pauses", not hidden. Test: Task 1, "pause-caused gap".
3. **A missed order with no pincode, no locality and no coordinates:** grouped under "Unknown area", not crashing. Test: Task 1, "missedAreas with no location".
4. **No live bakeries at all:** the Areas lines say "No live bakery" instead of a distance, and Cakes shows every offered type as a gap. Test: Task 1, "no live bakeries".
5. **Resend on an expired invite:** shows the new link in place without leaving the tab. Test: Task 3, "Resend renders InviteLink form for invited and expired".

---

### Task 1: Pure hub maths

**Files:**
- Create: `lib/bakeriesHub.ts` (pure)
- Test: `tests/bakeriesHub.test.ts`

**Interfaces:**
- Consumes: `VendorStage` and `setupSteps` result shape from `lib/onboarding.ts`; `isOfferable` (lib/inventoryRules.ts); `haversine` (lib/assignmentRules.ts); `UNDELIVERABLE` (lib/orders.ts).
- Produces:
  - `type HubTab = 'pipeline'|'cakes'|'performance'|'areas'`; `parseTab(p)`; `parseDays(p): 7|30|90`.
  - `type PipelineRow = { id: string; name: string; phone: string|null; stage: VendorStage; steps: { location: boolean; cakes: boolean; details: boolean; done: number }; inviteExpiresAt: Date|null; availableVariants: number; ordersToday: number }`.
  - `pipelineGroups(rows: PipelineRow[], now: Date): { stage: VendorStage; rows: (PipelineRow & { detail: string })[] }[]`. Empty groups are omitted. The detail strings are those in spec §2. Invited means "Invite sent N days ago", where N = floor((now − (inviteExpiresAt − 7d)) / 1d).
  - `type CoverageCake = { productId: string; name: string; variants: { sizeBand: string; eggType: 'egg'|'eggless' }[] }`; `type CoverageRow = { vendorName: string; productId: string; sizeBand: string; eggType: 'egg'|'eggless'; isAvailable: boolean; pausedUntil: Date|null }` (live bakeries only).
  - `coverageGrid(cakes, rows, now): { cakes: { productId; name; sizes: { sizeBand; egg: Cell|null; eggless: Cell|null }[] }[]; gaps: number; gapCakes: number; pauseGaps: number }`, where `Cell = { count: number; bakeries: string[]; gap: boolean; paused: boolean }`.
  - `type OfferRow = { vendorId; vendorName; state: AssignmentStatus; offeredAt: Date|null; respondedAt: Date|null; handedOverAt: Date|null; due: Date|null }`.
  - `bakeryStats(rows: OfferRow[], vendors: { id; name }[]): { vendorId; name; offers; acceptedPct; declinedPct; ignoredPct; medianMin: number|null; latePct: number|null; flag: string|null }[]`. Sorted flagged first, then by offers desc.
  - `type MissedOrder = { pincode: string|null; location: unknown; createdAt: Date }`; `type LiveBakery = { name; latitude: number|null; longitude: number|null; serviceRadiusKm: number }`.
  - `missedAreas(orders: MissedOrder[], live: LiveBakery[]): { area: string; count: number; last: Date; nearest: { name: string; km: number; radiusKm: number } | null }[]`. Sorted by count desc.

- [ ] **Step 1: Failing tests** in `tests/bakeriesHub.test.ts`, with `now = new Date('2026-11-16T08:00:00Z')`:
  - parseTab('cakes') → 'cakes'; parseTab('x') → 'pipeline'; parseDays('7') → 7; parseDays('5') → 30
  - pipelineGroups: stage order; a setting_up row missing location and cakes → detail "Needs: pin, cakes"; an invited row whose invite expires in 5 days → "Invite sent 2 days ago"; empty groups omitted
  - coverageGrid: Egg 2 · Eggless 0 counts; an egg type the cake lacks → null; "pause-caused gap" (one live bakery has it on but paused → count 0, gap true, paused true, pauseGaps 1); "no live bakeries" (every offered type is a gap)
  - bakeryStats: "pending offers excluded from rates" (2 ACCEPTED, 1 REJECTED, 1 OFFERED → acceptedPct 67); median of answered [2, 4, 30] min → 4; late 1 of 4 handed over → 25; flags "accepts 5 in 10 offers" / "answers in 12 min" / "2 in 10 late"; 4 offers → no flag
  - missedAreas: pincode beats locality beats coords; "missedAreas with no location" → area 'Unknown area'; nearest live bakery picked with km to 1 decimal; with no live bakeries, nearest null; sorted by count
- [ ] **Step 2:** `npx vitest run tests/bakeriesHub.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `lib/bakeriesHub.ts`.
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit with message `feat: bakeries hub maths`.

### Task 2: Loaders

**Files:**
- Create: `lib/bakeriesHubData.ts` (server-only)
- Test: `tests/bakeriesHub.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 types and functions; `vendorSetupStates()` (lib/vendorInvite.ts → `Map<id, {stage, steps}>`); `istDayStart` (lib/needsYou.ts) for orders today.
- Produces:
  - `loadPipeline(now = new Date()): Promise<ReturnType<typeof pipelineGroups>>`
  - `loadCoverage(now = new Date()): Promise<ReturnType<typeof coverageGrid>>`. Cakes on sale with variants, plus `VendorInventory` rows of live bakeries.
  - `loadPerformance(days: 7|30|90, now = new Date()): Promise<ReturnType<typeof bakeryStats>>`. `VendorOrder` rows with `offeredAt ≥ now − days`, including vendor name and order `dueAt`/`requestedFor`.
  - `loadAreas(days, now = new Date()): Promise<{ missed: ReturnType<typeof missedAreas>; reach: { name: string; address: string|null; radiusKm: number }[] }>`

- [ ] **Step 1: Failing integration tests** (fresh-schema-safe, scoped to seeded rows):
  - a seeded inactive vendor ready for review appears in the `ready_for_review` group
  - a seeded live vendor with one paused variant → coverage cell `paused: true`
  - seeded offers (ACCEPTED, REJECTED) → the vendor row has `offers: 2` and `acceptedPct: 50`
  - a seeded UNDELIVERABLE cancelled order with pincode '500034' → missed area '500034'
- [ ] **Step 2:** Run `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx vitest run tests/bakeriesHub.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit with message `feat: bakeries hub loaders`.

### Task 3: Tab components

**Files:**
- Create: `components/admin/bakeries/PipelineTab.tsx`, `CakesTab.tsx`, `PerformanceTab.tsx`, `AreasTab.tsx` (server components; `ResendButton.tsx` client, if needed, wrapping `resendInvite` with `useActionState` and rendering `InviteLink` from the result)
- Test: `tests/bakeriesTabs.test.ts` (`renderToStaticMarkup`; mock actions/Toast/next/navigation as tests/orderPanelView.test.ts does)

**Interfaces:**
- Consumes: Task 2 loader return types; `ActionItem`, `FilterChips`, `StatList`, `EmptyState` (components/admin/ui.tsx); `telHref`.
- Produces: `PipelineTab({ groups })`, `CakesTab({ grid, show: 'gaps'|'all' })`, `PerformanceTab({ rows, days })`, `AreasTab({ missed, reach, days })`. Each renders its spec empty state when empty.
- **Layout:**
  - Cakes: a table at `lg`, cards below. Each cell is a `<details>` listing bakery names.
  - Performance: a table at `lg`, cards below.
  - Pipeline: the Live group wrapped in `<details>` below `sm`.

- [ ] **Step 1: Failing tests:**
  - Pipeline: group headings in order; "Resend renders InviteLink form for invited and expired"; Call `href` is `tel:+…`; no Call without a phone
  - Cakes: a red gap cell, the summary "N gaps across M cakes · K caused by pauses", and the "No gaps…" empty copy
  - Performance: the flag tag text and "No offers in this window"
  - Areas: "Sweet Crumbs · 12.4 km (delivers up to 10 km)", the checkout-limit note, "No missed orders in this window", and "No live bakery" when `nearest` is null
- [ ] **Step 2:** Run `npx vitest run tests/bakeriesTabs.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck` and `npm run lint`.
- [ ] **Step 5:** Commit with message `feat: bakeries hub tab views`.

### Task 4: Wire `/admin/vendors`

**Files:**
- Modify: `app/admin/vendors/page.tsx`

**Interfaces:**
- Consumes: Task 1 `parseTab`/`parseDays`, Task 2 loaders, Task 3 tabs.
- **Behaviour:**
  - `requireAdmin()`. `hasDatabase()` → the existing Notice.
  - The `PageHeader` stays "Vendors"/"Bakeries" as it is now.
  - The tabs row is `FilterChips` (components/admin/Filters `Chip[]`, with explicit `?tab=` hrefs, as the orders page builds view chips).
  - Only the selected tab's loader runs.
  - The existing "Add a bakery" `VendorForm` moves inside `<details><summary>Add bakery</summary>…</details>` at the top, behaviour unchanged.
  - The old vendors table is replaced by the Pipeline tab.
  - Window chips (7/30/90) render for Performance and Areas. Cakes uses Gaps only / All cakes (`?show=`), defaulting to gaps when any exist.

- [ ] **Step 1:** Add a test to `tests/bakeriesTabs.test.ts` for the pure chip builder you add to `lib/bakeriesHub.ts`: `hubChips(tab, days)` returns 4 tab chips with the right `active` and `?tab=` hrefs.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the helper and wire the page.
- [ ] **Step 4:** Run `npx vitest run tests/bakeriesTabs.test.ts tests/bakeriesHub.test.ts`, `npm run typecheck` and `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit with message `feat: bakeries hub tabs on /admin/vendors`.

### Task 5: Verification

- [ ] **Step 1:** Run the unit project, then the integration project on a **fresh** throwaway Postgres (port 5434), `npm run typecheck`, `npm run lint` and `npm run build`. Expected: all green.
- [ ] **Step 2:** Browser pass at 375px and laptop width (launch config `onboarding-worktree`, dev-ticket sign-in) covering spec §8's browser list.
- [ ] **Step 3:** Commit any fixes with message `fix: bakeries hub verification fixes`.
