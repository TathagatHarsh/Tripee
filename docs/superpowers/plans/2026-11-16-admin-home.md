# Admin Shell and "Needs you" Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin dashboard with a prioritised "Needs you" action list, regroup the admin navigation with phone bottom tabs and a count badge, and add the shared UI pieces later admin specs reuse.

**Architecture:**
- A pure classifier (`lib/needsYou.ts`) turns plain inputs into sorted, categorised items and counts.
- A server-only loader (`lib/needsYouData.ts`) feeds it from Prisma. The page, the nav badge and the phone tabs all use that one loader.
- Live refresh already exists: `PortalAlerts` in the admin layout calls `router.refresh()` on every portal event.

**Tech Stack:** Next.js App Router (server components and server actions), Prisma/PostgreSQL, Tailwind `a-` tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-admin-home-design.md`

## Global Constraints

- **No route or URL changes.** No new database tables or migrations. No command palette.
- **Category order:** late → stuck → new → requests.
  - Each order appears **once**, in its most urgent category.
  - Within a category, sort by due time ascending. Sort requests by `createdAt` ascending.
- **Late risk:**
  - The order is `confirmed` or `in_kitchen`, or `out_for_delivery` and late.
  - `dueUrgency(order.dueAt ?? order.requestedFor, now)` (lib/vendors.ts) is `late` or `urgent`. Urgent means < 3 h.
  - Orders with no due time are never late risk.
- **Stuck:**
  - `confirmed` with no current assignment, or whose current assignment is `EXPIRED` or `REJECTED`.
  - Skip the whole category when no bakery has `isActive`.
- **New** = status `draft`.
- **Requests:**
  - bakeries whose `vendorStage` is `ready_for_review`;
  - custom requests whose status is `awaiting_quote`;
  - payment follow-ups, using the same rule as /admin/payments.
- **Filter param:** `?only=late|stuck|new|requests`. Anything else means All.
- **"Today"** means the IST calendar day (UTC+5:30). Cancelled orders are excluded from "Orders today" and "Revenue today".
- **Copy (verbatim):**
  - "Needs you"
  - "All caught up"
  - tags "Late · N min", "Due in N h", "No bakery", "Offer expired N min ago", "Rejected", "New"
  - actions "Call bakery", "Assign", "Reassign", "Confirm", "Call", "Review", "Quote", "Follow up", "Open order"
  - chips "All", "Late", "Stuck", "New", "Requests"
  - nav labels exactly as in spec §2
- **Phone:** tab targets are at least 44px, with safe-area bottom padding. The bottom bar shows below the `sm` breakpoint only.
- **Tests:** integration tests run only against the scratch Postgres `postgresql://postgres:postgres@localhost:5433/postgres`. Never the production DB.
- **Git:** no `git stash`. Run `graphify update .` after code changes if `graphify-out/` exists.

## Review Focus

1. **An order with no `dueAt` and no `requestedFor`** must never crash the classifier or show as late. It can still be New or Stuck. Test: Task 1, "orders without a due time are never late".
2. **A bakery or customer with an empty or whitespace phone** must get **Open order**, not a `tel:` link to nothing. Test: Task 1, "blank phone falls back to Open order".
3. **Confirm pressed twice, or on an order someone else just confirmed:** a toast shows the refusal and nothing breaks. Test: Task 4, "ConfirmButton shows the server message on failure".
4. **The badge count must equal the list's All count,** including when Stuck is hidden because no bakery is live. Test: Task 1, "total excludes skipped categories".
5. **An unknown `?only=` value** shows All and does not hide everything. Test: Task 1, `parseOnly`.

---

### Task 1: Pure classifier `lib/needsYou.ts`

**Files:**
- Create: `lib/needsYou.ts` (no db, no `server-only`; may import `dueUrgency` from `lib/vendors.ts` if that module is client-safe, otherwise copy the 3-hour and late thresholds as named constants with a comment)
- Test: `tests/needsYou.test.ts`

**Interfaces:**
- Produces (exact names):
  - `type NeedsYouFilter = 'all' | 'late' | 'stuck' | 'new' | 'requests'`
  - `type NeedsYouOrder = { ref: string; status: OrderStatus; due: Date | null; createdAt: Date; title: string; paymentLabel: string | null; customerPhone: string | null; assignment: null | { vendorName: string; vendorPhone: string | null; production: VendorOrderStatus; state: AssignmentStatus; respondedAt: Date | null; expiresAt: Date | null; rejectionReason: string | null } }`
  - `type NeedsYouInput = { orders: NeedsYouOrder[]; liveBakeries: number; reviews: { vendorId: string; name: string; createdAt: Date }[]; quotes: { id: string; title: string; createdAt: Date }[]; followUps: { id: string; kind: 'refund' | 'recovery'; label: string; createdAt: Date }[] }`
  - `type NeedsYouAction = { kind: 'link'; href: string; label: string } | { kind: 'confirm'; ref: string; label: 'Confirm' }`
  - `type NeedsYouItem = { key: string; category: Exclude<NeedsYouFilter,'all'>; tag: string; title: string; detail: string; action: NeedsYouAction; secondary?: NeedsYouAction; sortAt: Date }`
  - `classifyNeedsYou(input: NeedsYouInput, now: Date): { items: NeedsYouItem[]; counts: Record<Exclude<NeedsYouFilter,'all'>, number>; total: number }`
  - `type GlanceInput = { todays: { status: OrderStatus; totalPaise: number; createdAt: Date }[]; baking: number; outForDelivery: number; liveBakeries: number; activeBakeries: number }`
  - `glance(input: GlanceInput, now: Date): { ordersToday: number; bakingNow: number; outForDelivery: number; liveBakeries: string /* "x of y" */; revenueTodayPaise: number }`
  - `parseOnly(param: string | string[] | undefined): NeedsYouFilter`
  - `istDayStart(now: Date): Date`: UTC instant of 00:00 IST for `now`'s IST day (the loader uses it too).
- **Links:**
  - Call → `tel:` + digits of the phone; Assign/Reassign → `/admin/orders/<ref>#assign`.
  - Review → `/admin/vendors/<id>`; Quote → `/admin/custom-requests`; Follow up → `/admin/payments`.
  - Open order → `/admin/orders/<ref>`.
- **New items:** detail is `Placed N min ago` plus ` · <paymentLabel>` when present. Action is `{kind:'confirm'}`. Secondary is "Call" to the customer when the phone is non-blank.
- **Late items:** detail is the bakery name plus the stage word ("baking" for `in_preparation`/`accepted`/`assigned`, "ready, not sent" for `ready`, "out for delivery" for `out_for_delivery` orders). With no assignment the detail is "No bakery yet".

- [ ] **Step 1: Write the failing tests** in `tests/needsYou.test.ts`. Use a fixed `now = new Date('2026-11-16T08:00:00Z')` (13:30 IST). Tests:
  - "late: confirmed order due 20 min ago → category late, tag 'Late · 20 min', action Call bakery tel:91…"
  - "urgent: due in 2h59m → late with tag 'Due in 2 h'; due in 3h00m → not late"
  - "late and unassigned appears once, under late, action Assign"
  - "stuck: confirmed with no assignment → 'No bakery' + Assign; EXPIRED → 'Offer expired N min ago'; REJECTED with reason 'out of mango' → tag 'Rejected', detail contains reason, action Reassign"
  - "no live bakery: stuck items are omitted and counts.stuck is 0"
  - "total excludes skipped categories": `total` equals `items.length` and the sum of counts
  - "new: draft placed 4 min ago → detail starts 'Placed 4 min ago', action confirm, secondary Call"
  - "requests: review / quote / follow-up produce Review / Quote / Follow up links"
  - "sort: within late, earlier due first; categories in order late, stuck, new, requests"
  - "orders without a due time are never late" (a `confirmed` order with `due: null` and an assignment → not in items; with no assignment and live bakeries → stuck)
  - "blank phone falls back to Open order" (vendorPhone `'  '` → action href `/admin/orders/<ref>`, label 'Open order')
  - "glance counts across IST midnight": an order created `2026-11-15T18:20:00Z` (23:50 IST on the 15th) is not counted when now is 13:30 IST on the 16th; one created `2026-11-15T18:35:00Z` (00:05 IST on the 16th) is counted; cancelled ones are excluded from both count and revenue; `liveBakeries` is `'2 of 3'`
  - "parseOnly: 'late' → 'late'; 'bogus' → 'all'; undefined → 'all'; ['new'] → 'new'"
- [ ] **Step 2:** `npx vitest run tests/needsYou.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `lib/needsYou.ts` per the Interfaces block.
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit with message `feat: Needs-you classifier`.

### Task 2: Shared UI pieces

**Files:**
- Modify: `components/admin/ui.tsx` (append three exports)
- Test: `tests/adminUiPieces.test.ts` (render with `react-dom/server` `renderToStaticMarkup`, as other markup tests in `tests/` do)

**Interfaces:**
- Produces:
  - `ActionItem({ tone, tag, title, detail, action, secondary }: { tone: 'late'|'stuck'|'new'|'request'; tag: string; title: string; detail: string; action: React.ReactNode; secondary?: React.ReactNode })`
  - `FilterChips({ options, selected, param, basePath }: { options: { value: string; label: string; count?: number }[]; selected: string; param: string; basePath: string })`. Each chip is a `<Link href="basePath?param=value">`; the `'all'` value links to `basePath` with no param; the selected chip has `aria-current="page"`.
  - `StatList({ rows }: { rows: { label: string; value: string }[] })`, rendered as a `<dl>`.
- Stripe colours via tokens:
  - `late` → `a-bad`
  - `stuck` → `a-warn`
  - `new` → `a-accent`
  - `request` → `a-idle` (or nearest existing token)
- Every interactive element is at least 44px (`min-h-11`).

- [ ] **Step 1: Failing tests:**
  - "FilterChips marks the selected chip with aria-current and links All to the bare path"
  - "FilterChips shows counts"
  - "ActionItem renders tag, title, detail and the action node"
  - "StatList renders dt/dd pairs"
- [ ] **Step 2:** Run `npx vitest run tests/adminUiPieces.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the three components with existing `a-` classes (look at `StatusBadge`, `Card`, `EmptyState` in the same file for patterns).
- [ ] **Step 4:** Re-run. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit with message `feat: ActionItem, FilterChips and StatList`.

### Task 3: Data loader and shared payments query

**Files:**
- Create: `lib/paymentFollowUp.ts` (server-only). Move `followUpCutoff` and the two queries from `app/admin/payments/page.tsx` into `paymentFollowUps(): Promise<{ refunds: RefundOperation[]; recoveries: PaymentRecovery[] }>`, and make the payments page use it. Behaviour unchanged.
- Create: `lib/needsYouData.ts` (server-only)
- Test: `tests/needsYou.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `istDayStart`; `vendorSetupStates()` from `lib/vendorInvite.ts`, which returns `Map<vendorId, { stage, steps }>`.
- Produces:
  - `loadNeedsYou(now = new Date()): Promise<{ result: ReturnType<typeof classifyNeedsYou>; glance: ReturnType<typeof glance> }>`
  - `needsYouCount(): Promise<number>`, which returns `(await loadNeedsYou()).result.total` (deliberately the same code path).
- **Queries:**
  - Open orders: status in `draft`, `confirmed`, `in_kitchen`, `out_for_delivery`. Include `currentAssignment` with vendor `name` and `phone`.
  - `title` comes from `cakeName` (fallback "Cake") plus the size from the order's config when present.
  - `paymentLabel` uses the existing payment-status label map in `lib/orders.ts` if one exists, otherwise `null`.
  - `liveBakeries` counts vendors with `isActive && isAcceptingOrders`; `activeBakeries` counts vendors with `isActive`.
  - Reviews are the vendors whose stage is `ready_for_review`, with names.
  - Quotes are custom requests with status `awaiting_quote`.
  - Follow-ups come from `paymentFollowUps()`.
  - Today's orders are those with `createdAt >= istDayStart(now)`.

- [ ] **Step 1: Failing integration test** (`describe.skipIf(!process.env.ASSIGNMENT_TEST_DATABASE_URL)`; copy the mock header and fixture style from `tests/panels.integration.test.ts`). It seeds:
  - a draft order;
  - a confirmed order with no assignment;
  - a confirmed order due in 1 h with an accepted assignment;
  - an inactive vendor that is ready for review (location, details, one available row, one linked user);
  - a custom request awaiting a quote.

  It asserts that `loadNeedsYou()` returns at least one item in each category with the right refs/ids, and that `needsYouCount()` equals `result.total`. **Scope the asserts to the seeded refs:** the scratch DB holds other rows.
- [ ] **Step 2:** `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx vitest run tests/needsYou.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `lib/paymentFollowUp.ts` and `lib/needsYouData.ts`, and switch the payments page to `paymentFollowUps()`.
- [ ] **Step 4:** Re-run the integration test. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit with message `feat: Needs-you loader; shared payment follow-up query`.

### Task 4: The new home page

**Files:**
- Modify: `app/admin/page.tsx` (replace entirely)
- Create: `app/admin/ConfirmButton.tsx` (client)
- Modify: `app/globals.css` (delete every `ops-overview` rule)
- Modify: `components/admin/AvailabilityToggle.tsx` (off-palette colour class → `a-` token)
- Test: `tests/confirmButton.test.ts`

**Interfaces:**
- Consumes:
  - Task 2's components;
  - Task 3's `loadNeedsYou`;
  - Task 1's `parseOnly`;
  - `advanceOrderStatus(prev, form)` from `app/admin/actions.ts`, called with form fields `ref` and `to='confirmed'`, returning `ActionResult { ok, message }`;
  - `useToast` from `components/admin/Toast`.
- **Page:**
  - `requireAdmin()`; `hasDatabase()` → `Notice` with `NO_DATABASE_MESSAGE`.
  - `PageHeader` title "Needs you", blurb "<weekday d Mon> · N things, most urgent first".
  - `FilterChips` with `param="only"` and `basePath="/admin"`.
  - On laptop, a grid of the filtered `ActionItem` list (about 60%) and the `StatList` "At a glance" (about 40%). On phone, one column.
  - Empty list: `EmptyState` with title "All caught up".
- **ConfirmButton:** `({ ref }: { ref: string })` → a `useActionState` form posting to `advanceOrderStatus` with hidden `ref` and `to=confirmed`. It shows "Confirm" / "Confirming…", toasts `result.message`, and calls `router.refresh()` on success.

- [ ] **Step 1: Failing test** `tests/confirmButton.test.ts`:
  - "ConfirmButton posts ref and to=confirmed";
  - "ConfirmButton shows the server message on failure".

  Mock `../app/admin/actions` and `components/admin/Toast` the way existing client tests in `tests/` do. If no client-component test harness exists, test the form's hidden inputs through markup and move the failure-toast check to the Task 6 browser pass; say so in the report.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the page, the button, the CSS deletion and the token fix.
- [ ] **Step 4:** Run `npx vitest run tests/confirmButton.test.ts tests/needsYou.test.ts`, `npm run typecheck` and `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit with message `feat: Needs-you admin home`.

### Task 5: Navigation regroup, badge and phone tabs

**Files:**
- Modify: `lib/adminNav.ts` (sections and labels per spec §2; same hrefs; keep `partnersOnly`)
- Modify: `components/admin/Shell.tsx` (badge on Home; phone bottom tabs; "More" opens the existing drawer; ⌘K / Ctrl+K pushes `/admin/search`)
- Modify: `app/admin/layout.tsx` (compute `needsYouCount()` and pass it to Shell; on a db error pass `null`, which shows no badge)
- Test: `tests/adminNav.test.ts` (extend if it exists, else create)

**Interfaces:**
- Consumes: Task 3's `needsYouCount`.
- Shell prop: `needsYouCount: number | null`.
- Bottom tabs (below `sm`): Home (`/admin`, badge) · Orders (`/admin/orders`) · Bakeries (`/admin/vendors`) · More (button, opens the drawer).
  - Fixed to the bottom with `pb-[env(safe-area-inset-bottom)]`. The main content gets bottom padding.
  - Each target is at least 44px.
  - The active tab uses the same active rule as the sidebar (`isActive` in lib/adminNav).

- [ ] **Step 1: Failing tests:**
  - "nav groups and labels match the spec": section labels are `['Home','Orders','Bakeries','Catalogue','Settings']`, and the item labels and hrefs match spec §2 in order;
  - "every href existed before" (compare against the list of current admin routes).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the nav, Shell and layout changes.
- [ ] **Step 4:** Run `npx vitest run tests/adminNav.test.ts`, `npm run typecheck` and `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit with message `feat: regrouped admin nav, Needs-you badge, phone tabs`.

### Task 6: Verification

**Files:** none. Fix anything found in the owning task's files.

- [ ] **Step 1:** Run `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npm test`, `npm run typecheck`, `npm run lint` and `npm run build` (scratch DB). Expected: all green.
- [ ] **Step 2:** Browser pass on the scratch dev server (launch config `onboarding-worktree`, port 3002, Clerk development ticket sign-in, no passwords), at 375px and at laptop width:
  - `/admin` lists the seeded items;
  - each chip filters, and the filter survives a reload;
  - Confirm on a New item removes it and shows the toast;
  - the Call bakery `href` is `tel:`;
  - the bottom tabs show on phone only; More opens the drawer;
  - the badge equals the "All" count;
  - ⌘K opens `/admin/search`;
  - creating an order in another tab makes `/admin` update without a reload (PortalAlerts refresh).
- [ ] **Step 3:** Commit any fixes with message `fix: admin home verification fixes`.
