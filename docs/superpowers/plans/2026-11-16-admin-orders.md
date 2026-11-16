# Admin Orders Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make orders fast to find and act on: one row of views, richer rows, and a URL-driven quick-view panel (beside the list on laptop, full-screen on phone) showing the automatic bakery attempts, with Confirm / Call / WhatsApp / Call bakery actions.

**Architecture:**
- Pure helpers in `lib/orderViews.ts` cover views, legacy-filter detection, the bakery line and the attempt wording.
- A server-only `loadOrderPanel(ref)` feeds a server `OrderPanel` component.
- `app/admin/orders/page.tsx` renders the list plus the panel when `?open=` is set.
- "Needs action" reuses spec 1's `loadNeedsYou()`.

**Tech Stack:** Next.js App Router (server components), Prisma/PostgreSQL, Tailwind `a-` tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-admin-orders-design.md`

## Global Constraints

- **No new tables, migrations or routes.** Existing `/admin/orders` links with `status`, `days`, `slot`, `due`, `production` and `q` keep working exactly as today. When any of the first five is present it **overrides** `view`.
- **Views** (`?view=`): `needs` (default), `today`, `upcoming`, `all`. Any unknown value means `needs`.
  - **Today:** due on the IST calendar day (`dueAt ?? requestedFor`), not cancelled.
  - **Upcoming:** due after today (IST), not delivered or cancelled.
  - **All:** newest first, with the existing `LIMIT` and paging.
- **Panel** (`?open=<ref>`): `lg` and up → a sticky right column of about 380px. Below `lg` → a full-screen sheet. Closing means the same URL without `open`. Links use `scroll={false}`.
- **Panel actions:** Confirm (only for `draft`, reusing `app/admin/ConfirmButton.tsx` with prop `orderRef`) · Call customer (`tel:`) · WhatsApp customer (server-built `whatsappHref`) · Call bakery (`tel:` to the current holder, else the latest offered) · Open full order (`/admin/orders/<ref>`). No assign and no status advance.
- **Copy (verbatim):**
  - chips "Needs action", "Today", "Upcoming", "All"
  - "More filters", "Clear", "Order not found", "Open full order →"
  - bakery line: "finding a bakery", "finding a bakery (Nth try)", "<bakery> · <stage>" with stage accepted / baking / ready / sent out, "No bakery could take it", "waiting for confirmation"
  - attempts: "Offered to X · waiting N min", "Accepted by X · <time>", "X said no (<reason>) · <time>", "X didn't answer in time · <time>"
- **Assignment is automatic:** no UI may offer manual assignment from the list or panel.
- **Every control ≥ 44px.** Warm `a-` tokens only.
- **Tests:** integration only on the scratch Postgres `postgresql://postgres:postgres@localhost:5433/postgres`. Never production.
- **Git:** no `git stash`.
- **Note:** spec §3 suggested reusing `assignmentHistory()`. That function describes production stamps of one `VendorOrder`, not the offer sequence, so the attempt wording is the new pure `attemptLines` (Task 1).

## Review Focus

1. **An order with several attempts where the latest is CANCELLED** (e.g. the order was cancelled while an offer was pending). The panel must still list the earlier attempts truthfully, and Call bakery must target the latest offered bakery. Test: Task 1, "attemptLines keeps cancelled attempts in sequence"; Task 2, "callBakeryPhone picks latest offered when none holds".
2. **`?open=` combined with a view and filters:** closing keeps the view and filters, and the open row stays highlighted. Test: Task 4, "closeHref drops only open".
3. **An old bookmark `?status=confirmed&days=7`** must filter exactly as before, with the views row showing no chip selected. Test: Task 1, "hasLegacyFilters", and Task 4, "legacy params override view".
4. **A pickup order** has no address. The panel shows "Pickup" and no empty address row. Test: Task 3, "pickup shows Pickup".
5. **An invalid customer phone** for WhatsApp: the button is hidden, never a broken `wa.me` link. Test: Task 2, "whatsapp href null for invalid phone".

---

### Task 1: Pure helpers and the home-page action fix

**Files:**
- Create: `lib/orderViews.ts` (pure; no db, no server-only)
- Modify: `lib/needsYou.ts` (Stuck and Late "Assign"/"Reassign" → "Open order" linking to `/admin/orders?view=needs&open=<ref>`)
- Test: `tests/orderViews.test.ts`; update `tests/needsYou.test.ts`

**Interfaces:**
- Produces:
  - `type OrderView = 'needs' | 'today' | 'upcoming' | 'all'`
  - `parseView(p: string | string[] | undefined): OrderView`
  - `hasLegacyFilters(params: Record<string, string | string[] | undefined>): boolean`, true if any of `status`, `days`, `slot`, `due`, `production` is non-empty
  - `viewWhere(view: 'today' | 'upcoming', now: Date): Prisma.OrderWhereInput`. Uses `istDayStart` from `lib/needsYou.ts`, matching on `dueAt` or, when `dueAt` is null, `requestedFor`.
  - `type Attempt = { vendorName: string; vendorPhone: string | null; state: AssignmentStatus; production: VendorOrderStatus; sequence: number; offeredAt: Date | null; respondedAt: Date | null; expiresAt: Date | null; rejectionReason: string | null }`
  - `bakeryLine(order: { status: OrderStatus; cancellationReason: string | null }, attempts: Attempt[], now: Date): string`
  - `attemptLines(attempts: Attempt[], now: Date): string[]`, oldest first by `sequence`. Times are formatted with the existing `formatIST` from `lib/format.ts`.
  - `callBakeryPhone(attempts: Attempt[]): string | null`. Returns the phone of the attempt with state `ACCEPTED`, else the highest-`sequence` attempt in `OFFERED`/`PENDING`, else the highest-`sequence` attempt. Blank phones count as null.

- [ ] **Step 1: Failing tests** in `tests/orderViews.test.ts`, with `now = new Date('2026-11-16T08:00:00Z')`:
  - parseView: 'today' → 'today'; 'x' → 'needs'; undefined → 'needs'
  - hasLegacyFilters: {status:'confirmed'} → true; {view:'today', q:'riya'} → false
  - viewWhere('today') bounds are 2026-11-15T18:30:00Z ≤ due < 2026-11-16T18:30:00Z, and the status excludes cancelled
  - viewWhere('upcoming') has due ≥ 2026-11-16T18:30:00Z and excludes delivered and cancelled
  - bakeryLine, one test per branch:
    - one OFFERED → "finding a bakery"
    - REJECTED then OFFERED → "finding a bakery (2nd try)"
    - ACCEPTED with production in_preparation → "Sweet Crumbs · baking"
    - cancelled with a reason and no accepted attempt → "No bakery could take it"
    - draft with no attempts → "waiting for confirmation"
  - attemptLines: OFFERED 5 min ago → "Offered to Sweet Crumbs · waiting 5 min"; REJECTED with reason 'out of mango' → "Cocoa Lane said no (out of mango) · <formatIST>"; EXPIRED → "… didn't answer in time · …"
  - "attemptLines keeps cancelled attempts in sequence"
  - "callBakeryPhone picks latest offered when none holds"; a blank phone → null
- [ ] **Step 2:** Update `tests/needsYou.test.ts`. The stuck and late-unheld items now have action label 'Open order' and href `/admin/orders?view=needs&open=<ref>`. Nothing says 'Assign' or 'Reassign' any more.
- [ ] **Step 3:** Run `npx vitest run tests/orderViews.test.ts tests/needsYou.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement `lib/orderViews.ts` and the `lib/needsYou.ts` change.
- [ ] **Step 5:** Re-run. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 6:** Commit with message `feat: order views, bakery line, attempt wording; home stuck items open the order`.

### Task 2: Panel loader

**Files:**
- Create: `lib/orderPanelData.ts` (server-only)
- Test: `tests/orderPanel.integration.test.ts` (copy the mock header and fixtures from `tests/needsYou.integration.test.ts` / `tests/panels.integration.test.ts`; scope asserts to seeded rows)

**Interfaces:**
- Consumes: Task 1's `Attempt`, `attemptLines`, `bakeryLine`, `callBakeryPhone`; `whatsappHref` from `lib/customCakes.ts`.
- Produces:
  - `type OrderPanelData = { ref: string; status: OrderStatus; createdAt: Date; paymentStatus: PaymentStatus; totalPaise: number; cakes: { name: string; size: string | null; eggType: EggType | null; message: string | null; photoUrl: string | null }[]; fulfillmentMethod: FulfillmentMethod; deliverySlot: string; due: Date | null; deliveryLocation: unknown; customerName: string | null; customerPhone: string | null; attempts: Attempt[]; bakeryLine: string; attemptLines: string[]; callCustomerHref: string | null; whatsappHref: string | null; callBakeryHref: string | null }`
  - `loadOrderPanel(ref: string): Promise<OrderPanelData | null>`. One `findUnique` by `ref` that includes the cakes, every `VendorOrder` attempt ordered by `sequence` asc with vendor `name`/`phone`, and the fields above. Photo URLs come from the cake's existing image field (as the order list's `photoOf` does).
- **`tel:` hrefs:** digits only, with the country code kept, as in lib/needsYou.ts. Null when there are no digits.

- [ ] **Step 1: Failing integration tests:**
  - an order offered to A, rejected through `respondToAssignment(..., 'REJECTED')`, then re-offered to B → `attempts.length === 2`, `attemptLines[0]` contains "said no", `bakeryLine` is 'finding a bakery (2nd try)', `callBakeryHref` is B's tel
  - unknown ref → null
  - "whatsapp href null for invalid phone" (customerPhone '123')
- [ ] **Step 2:** Run `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx vitest run tests/orderPanel.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit with message `feat: order quick-view panel loader`.

### Task 3: OrderPanel component

**Files:**
- Create: `components/admin/OrderPanel.tsx` (server component)
- Test: `tests/orderPanelView.test.ts` (`renderToStaticMarkup`)

**Interfaces:**
- Consumes: Task 2's `OrderPanelData`; `ConfirmButton` (`orderRef` prop); the existing `OrderStatusBadge`, `formatINR`, `DeliveryAddressSnapshot` (components/DeliveryAddressSnapshot.tsx) for the address, and the existing delivery-slot label helper used on the order page.
- Produces: `OrderPanel({ data, closeHref }: { data: OrderPanelData | null; closeHref: string })`.
  - When `data` is null it renders "Order not found" and a close link.
  - Otherwise it renders the header, cakes (with the message in a dashed box), delivery, customer, "Bakery progress" lines, and the bottom action bar.
  - Buttons whose href is null are omitted. Confirm shows only when status is `draft`.
  - Layout classes: `fixed inset-0 z-40 lg:sticky lg:top-4 lg:inset-auto lg:w-[380px]`, or the equivalent. Close is ← below `lg` and ✕ at `lg`.

- [ ] **Step 1: Failing tests:**
  - "not found renders 'Order not found' and close link to closeHref"
  - "draft shows Confirm; confirmed does not"
  - "pickup shows Pickup" (no address block)
  - "hides Call bakery when callBakeryHref is null"
  - "renders attempt lines in order"
  - "Open full order links to /admin/orders/<ref>"
  - "no element offers manual assignment": the markup contains no 'Assign'
- [ ] **Step 2:** Run `npx vitest run tests/orderPanelView.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, matching the v2 mockup (`.superpowers/brainstorm/*/content/orders-workspace-v2.html` in the main checkout `/Users/tathagatharsh/Desktop/Tripee.nosync`) with `a-` tokens.
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck` and `npm run lint`.
- [ ] **Step 5:** Commit with message `feat: OrderPanel quick view`.

### Task 4: Orders page — views, More filters, rows, panel slot

**Files:**
- Modify: `app/admin/orders/page.tsx`
- Create, if helpful: `app/admin/orders/MoreFilters.tsx` (built from the existing `components/admin/Filters.tsx` chips inside a native `<dialog>` below `lg` and an inline `<details>` popover at `lg`)
- Test: `tests/ordersPageParams.test.ts`

**Interfaces:**
- Consumes:
  - Task 1's `parseView`, `hasLegacyFilters`, `viewWhere`, `bakeryLine`;
  - Task 2's `loadOrderPanel`;
  - Task 3's `OrderPanel`;
  - spec 1's `loadNeedsYou()` (call with NO arguments; it is React-cached) for the `needs` view: its order items' refs, in order;
  - `FilterChips` with `param="view"`.
- Produces two pure helpers, exported from `lib/orderViews.ts` (add them there and test them in this task):
  - `rowHref(params, ref): string`: current params plus `open=<ref>`
  - `closeHref(params): string`: current params minus `open`
- **Behaviour:**
  - When `hasLegacyFilters`, the page applies today's existing filter logic unchanged, and the views row shows no selected chip.
  - Otherwise it applies the view: `needs` uses the refs from `loadNeedsYou()`; `today` and `upcoming` use `viewWhere`; `all` uses the existing all-orders query.
  - `q` combines with either.
  - Rows link with `rowHref` and `scroll={false}`. The open row is highlighted with `aria-current="true"`.
  - Rows show the photo, ref, cake · size, the customer's first name, the delivery window or "Pickup", `bakeryLine`, and the status badge.
  - When `open` is present, the page renders `<OrderPanel data={await loadOrderPanel(open)} closeHref={closeHref(params)} />`. At `lg` the page layout becomes two columns.
  - The bakery line on rows needs each row's attempts. Extend the list query with `assignments` (ordered by sequence, the minimal fields of `Attempt`) so `bakeryLine` can run per row. No per-row queries.

- [ ] **Step 1: Failing tests** in `tests/ordersPageParams.test.ts`:
  - "closeHref drops only open": `{view:'today', q:'riya', open:'MC-1'}` → `?view=today&q=riya`
  - "rowHref adds open and keeps filters"
  - "legacy params override view": a helper decision `effectiveMode(params)` returns 'legacy' for `{status:'confirmed', view:'today'}` and `{kind:'view', view:'today'}` for `{view:'today'}` (export `effectiveMode` from `lib/orderViews.ts`)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the helpers and the page changes. Keep existing behaviour for legacy params byte-for-byte where possible (reuse the existing code path).
- [ ] **Step 4:** Run `npx vitest run tests/ordersPageParams.test.ts tests/orderViews.test.ts`, `npm run typecheck` and `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit with message `feat: orders views, richer rows and quick-view panel`.

### Task 5: Verification

**Files:** none. Fixes go to the owning task's files.

- [ ] **Step 1:** Run `npx vitest run --project unit`, the integration project on a **fresh** throwaway Postgres (`docker run --rm -d -p 5434:5432 …`, `prisma migrate deploy`, then `ASSIGNMENT_TEST_DATABASE_URL=…5434… npx vitest run --project integration`), `npm run typecheck`, `npm run lint` and `npm run build`. Expected: all green.
- [ ] **Step 2:** Browser pass on the scratch server (launch config `onboarding-worktree`, port 3002, Clerk dev-ticket sign-in, no passwords) at 375px and laptop width, covering every item in spec §7's browser list.
- [ ] **Step 3:** Commit any fixes with message `fix: orders workspace verification fixes`.
