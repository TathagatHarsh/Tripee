# Bakery Onboarding and Cake Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bakery invited by the admin can sign up through a link, finish a four-step setup on its phone, choose its cakes in one grid, pause cakes temporarily, and go live after admin approval.

**Architecture:**
- Keep the per-variant `VendorInventory` rows as the single answer to "can this bakery make this cake". Add a self-expiring `pausedUntil` column, and delete the separate product-ID gate.
- Onboarding state is derived from existing columns by pure functions in `lib/onboarding.ts`. The only new state is the invite hash/expiry and a "details confirmed" timestamp.
- An unapproved bakery's baker can reach setup pages (new `requireVendorSetup`), but fulfilment still requires an active bakery (`requireVendor`).

**Tech Stack:** Next.js App Router, server actions and route handlers, Prisma/PostgreSQL, Clerk, Zod, Tailwind `a-` tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-bakery-onboarding-design.md`

## Global Constraints

- **Look: direction A, Warm brand.** Tokens: canvas `#fbf6ef`, surface `#ffffff`, line `#eaded0`, accent `#94472c`, accent-ink `#874027`, accent-wash `#f6e9db`. Card radius 14px.
- **Phone-first.** Every control is at least 44px. Layouts work at 360px wide. Focus rings stay visible.
- **Invite token:** 32 random bytes, base64url. Store only the SHA-256 hex hash. Expires 7 days after issue. Single-use.
- **Pause ends, all IST (UTC+5:30):**
  - "Rest of today" = 23:59:59 today
  - "Until tomorrow" = 07:00 the next day
  - "Pick a date" = 23:59:59 that date
- **Offerable rule:** `isAvailable && (pausedUntil == null || pausedUntil <= now)`
- **Database:**
  - One additive migration, `9o_bakery_onboarding`. All new columns nullable.
  - Never drop `fulfillsAllProducts` / `supportedProductIds`.
  - Never run migrations against the production `DATABASE_URL`. Use the scratch Postgres (`ASSIGNMENT_TEST_DATABASE_URL`, container on port 5433).
- **Do not run `git stash`.** `git status`/`git diff` can hang in this repo, so list changes with `find . -newermt` if needed.
- **Copy, verbatim from the spec:**
  - "This invite has expired. Ask MakeYourCakes for a new one."
  - "This account is MakeYourCakes staff and can't be a bakery. Sign in with a different account."
  - "This account already belongs to another bakery."
  - "This changed on another device. Reload to see the latest."
  - "Available once MakeYourCakes approves your bakery"
  - "Sent to MakeYourCakes for review"
- Run `graphify update .` after code changes (project CLAUDE.md).

## Review Focus

1. **A baker opens the invite while signed in to their customer account from a past order.** That account should become the vendor account. The order history stays, and the baker lands on `/vendor`. Test: Task 5, "customer with orders accepts invite".
2. **The admin presses Resend after the baker already opened the old link in another tab.** The old tab's Accept must fail with the expired copy and must not link. Test: Task 5, "token rotated by resend is refused".
3. **A pause set at 00:30 IST "Rest of today".** It must end at 23:59:59 IST that same IST day, not the previous UTC day. Test: Task 2, `pauseEnd` rollover cases.
4. **The baker saves the grid on two phones.** The second save must get the conflict copy and write nothing. Test: Task 6, "stale grid version writes nothing".
5. **The admin removes a cake from the catalogue after bakeries have rows for it.** The grid must not crash on rows whose cake or variant no longer exists. Those rows are hidden from the grid and keep their stored values. Test: Task 6, "orphan rows are ignored by grid save".

---

### Task 1: Migration and schema

**Files:**
- Create: `prisma/migrations/9o_bakery_onboarding/migration.sql`
- Modify: `prisma/schema.prisma` (`Vendor` ~line 314, `VendorInventory` ~1193, `InventoryAvailabilityChange` ~1210)

**Interfaces:**
- Produces Prisma fields:
  - `Vendor.inviteTokenHash String? @unique`
  - `Vendor.inviteExpiresAt DateTime?`
  - `Vendor.detailsConfirmedAt DateTime?`
  - `VendorInventory.pausedUntil DateTime?`
  - `InventoryAvailabilityChange.pausedUntil DateTime?`

- [ ] **Step 1:** Add the five fields. Mark `fulfillsAllProducts` and `supportedProductIds` with `/// Deprecated, unread since 2026-11-15. Kept so no column is dropped on the live database.`
- [ ] **Step 2:** Write `migration.sql`:
  - `ALTER TABLE … ADD COLUMN …` for the five columns
  - a unique index on `"Vendor"("inviteTokenHash")`
  - `UPDATE "Vendor" SET "detailsConfirmedAt" = now() WHERE "isActive" = true;`
- [ ] **Step 3:** Apply to scratch only.
  Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx prisma migrate deploy && npm run db:generate`
  Expected: `9o_bakery_onboarding` applied, client generated.
- [ ] **Step 4:** Check no drift.
  Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`
  Expected: exit 0 (no difference).
- [ ] **Step 5:** `npm run typecheck`. Expected: clean.
- [ ] **Step 6:** Commit with message `feat: onboarding and pause columns`.

### Task 2: Pure onboarding rules

**Files:**
- Create: `lib/onboarding.ts` (no `server-only`, no db)
- Test: `tests/onboarding.test.ts`

**Interfaces:**
- Produces:
  - `type SetupInput = { isActive: boolean; isAcceptingOrders: boolean; locationSetAt: Date | null; detailsConfirmedAt: Date | null; inviteExpiresAt: Date | null; linkedUsers: number; availableVariants: number }`
  - `setupSteps(v: SetupInput): { account: boolean; location: boolean; cakes: boolean; details: boolean; done: number }`. `done` counts true steps out of 4. `account` = `linkedUsers > 0`.
  - `type VendorStage = 'invited' | 'invite_expired' | 'setting_up' | 'ready_for_review' | 'live' | 'paused'`
  - `vendorStage(v: SetupInput, now: Date): VendorStage`. If active: `live` or `paused`, regardless of checklist. If inactive:
    - no linked users → `invited` while the invite has not expired, otherwise `invite_expired`
    - linked and `done < 4` → `setting_up`
    - otherwise → `ready_for_review`
  - `type PauseLength = 'today' | 'tomorrow' | { date: string /* YYYY-MM-DD, IST */ }`
  - `pauseEnd(length: PauseLength, now: Date): Date`. IST constants as in Global Constraints.
  - `newInviteToken(): { token: string; hash: string; expiresAt: Date }` (`node:crypto` `randomBytes(32)`, `createHash('sha256')`)
  - `hashInviteToken(token: string): string`
  - `whatsappInviteUrl(phone: string, bakery: string, link: string): string` → `https://wa.me/91XXXXXXXXXX?text=…`. Normalise the phone with the existing helper from `tests/vendorPhone.test.ts`'s module. Message text: `Hi! ${bakery} has been invited to MakeYourCakes. Set up your bakery here: ${link}`

- [ ] **Step 1: Write the failing tests.** Cases:
  - **`vendorStage`**, one test per stage: invited, invite_expired (expired and null), setting_up (2/4), ready_for_review, live, paused.
  - **Active bakery with 0 cakes is `live`.**
  - **`pauseEnd`:**
    - `pauseEnd('today', new Date('2026-11-15T19:00:00Z'))` (00:30 IST on 16 Nov) → `2026-11-16T18:29:59.000Z`
    - `pauseEnd('today', new Date('2026-11-15T10:00:00Z'))` → `2026-11-15T18:29:59.000Z`
    - `pauseEnd('tomorrow', new Date('2026-11-15T10:00:00Z'))` → `2026-11-16T01:30:00.000Z`
    - `pauseEnd({date:'2026-11-20'}, …)` → `2026-11-20T18:29:59.000Z`
    - A past date or a malformed date throws `RangeError`.
  - **`hashInviteToken(t.token) === t.hash`**, and `expiresAt` is now + 7 days, to within 1s.
  - **`whatsappInviteUrl('98765 43210', …)`** starts with `https://wa.me/919876543210?text=` and its decoded text contains the link.
- [ ] **Step 2:** `npx vitest run tests/onboarding.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `lib/onboarding.ts`.
- [ ] **Step 4:** Re-run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat: onboarding stage, pause and invite rules`.

### Task 3: Offerable rule and removing the product gate

**Files:**
- Modify:
  - `lib/inventoryRules.ts` (add `isOfferable`)
  - `lib/inventory.ts:16` (`requireOrderAvailability`)
  - `lib/assignment.ts:144`, `:214`, `:219-220`
  - `lib/assignmentRules.ts:77-81`
  - `app/admin/vendors/AssignmentRulesForm.tsx:66-82`
  - `app/admin/vendors/assignmentActions.ts:17-18, 29-31, 45-48`
- Test:
  - `tests/rules.test.ts` (unit)
  - create `tests/pauses.integration.test.ts` (copy the `vi.mock` header and `fixture()` shape from `tests/panels.integration.test.ts`)

**Interfaces:**
- Produces: `isOfferable(row: { isAvailable: boolean; pausedUntil: Date | null } | undefined, now = new Date()): boolean`
- Consumes: Task 1 `pausedUntil`.

- [ ] **Step 1: Unit tests in `tests/rules.test.ts`:**
  - `isOfferable(undefined)` is false
  - off is false
  - on with no pause is true
  - paused until now + 1h is false
  - paused until now − 1s is true
- [ ] **Step 2: Integration tests** (`describe.skipIf(!url)`):
  - "assignment skips a paused variant": `manualAssignment` throws or skips. Use the same assertion style as the panels file.
  - "offered again after pause ends": set `pausedUntil` in the past, and assignment succeeds.
  - "no product gate": the fixture vendor has `fulfillsAllProducts: false, supportedProductIds: []` and is still assigned.
  - "accepted order continues after pause": accept, pause, then `moveFulfillment` to `in_preparation` succeeds.
  - "candidate list explains a pause": the candidate reasons include `unavailable`.
- [ ] **Step 3:** Run `npx vitest run tests/rules.test.ts` and `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npx vitest run tests/pauses.integration.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement:
  - Replace each `!item?.isAvailable` / `item?.isAvailable` check in `lib/assignment.ts` and `lib/inventory.ts` with `isOfferable(item)`.
  - Delete the `fulfillsAllProducts || …` clause from `vendorEligible`, and drop its now-unused `products` parameter at every call site.
  - Delete the `'Product not supported'` line in `lib/assignment.ts`.
  - Remove both fields from the form, the Zod schema and the update.
- [ ] **Step 5:** Run both test files plus `npx vitest run tests/assignment.test.ts tests/vendors.test.ts` and the existing `tests/assignment.integration.test.ts`. Expected: PASS. Fix existing tests that asserted the gate by deleting those assertions.
- [ ] **Step 6:** Commit with message `feat: pauses block offers; drop hidden product gate`.

### Task 4: Setup access for unapproved bakeries

**Files:**
- Modify:
  - `lib/auth.ts:289-303`
  - `app/vendor/layout.tsx`, `app/vendor/page.tsx`, `app/vendor/inventory/page.tsx`, `app/vendor/profile/page.tsx`
  - `app/api/inventory/route.ts:24`
  - `app/api/vendor/availability/route.ts`
- Test: `tests/auth.test.ts`, `tests/inventorySecurity.test.ts`

**Interfaces:**
- Produces: `requireVendorSetup(): Promise<VendorViewer>`. Same as `requireVendor`, but an inactive bakery is allowed. A missing bakery still redirects to `/account?denied=vendor`.
- `requireVendor()` is unchanged and stays on `app/vendor/orders/**` and every action in `app/vendor/actions.ts`.

- [ ] **Step 1: Tests:**
  - `requireVendorSetup` returns the viewer for an inactive bakery.
  - `requireVendor` still redirects for an inactive bakery.
  - Inventory POST by the VENDOR of an inactive bakery succeeds (`inventorySecurity` style).
  - Availability POST with `availability: 'accepting'` for an inactive bakery returns 409 with the copy "Available once MakeYourCakes approves your bakery".
  - Availability POST with prep, capacity and `radiusKm: 8` sets `serviceRadiusKm = 8` and sets `detailsConfirmedAt`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - Add `requireVendorSetup`, and point the layout, home, inventory and profile pages at it.
  - Delete the `VENDOR && !vendor.isActive` refusal in the inventory route.
  - In the availability route: refuse accepting/busy while `!isActive`, accept `radiusKm` (Zod: number, 1–50), and set `detailsConfirmedAt: new Date()` on a successful save.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat: unapproved bakeries can finish setup`.

### Task 5: Invites (issue, accept, approve)

**Files:**
- Create:
  - `lib/vendorInvite.ts` (`server-only`)
  - `app/join/[token]/page.tsx`
  - `app/join/[token]/actions.ts`
  - `app/admin/vendors/InviteLink.tsx` (client)
- Modify:
  - `app/admin/actions.ts` (`addVendor` ~1217; add `resendInvite`, `approveVendor`)
  - `app/admin/vendors/VendorForms.tsx` (phone required)
  - `app/admin/vendors/page.tsx`, `app/admin/vendors/[id]/page.tsx` (stage pill, invite card, Approve)
  - `lib/auth.ts` (exception comment beside `loadProfile`)
- Test: `tests/vendorInvite.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 `newInviteToken`, `hashInviteToken`, `vendorStage`, `setupSteps`, `whatsappInviteUrl`.
- Produces:
  - `issueInvite(vendorId: string): Promise<{ link: string; expiresAt: Date }>`. Writes the hash and expiry, which replaces any old hash. `link = ${siteUrl}/join/${token}`, using the site-URL helper the email/WhatsApp code already uses.
  - `type AcceptResult = { ok: true } | { ok: false; reason: 'expired' | 'staff' | 'other_bakery' }`
  - `acceptInvite(token: string, userId: string): Promise<AcceptResult>`. One `db.$transaction`:
    1. Find the vendor by hash with `inviteExpiresAt > now`. If none → `expired`.
    2. Profile role `ADMIN`/`KITCHEN` → `staff`.
    3. `VENDOR` with a different `vendorId` → `other_bakery`.
    4. Same `vendorId` → `ok`.
    5. Otherwise update the profile to `{ role: 'VENDOR', vendorId }` and null both invite fields.
  - `invitedBakery(token: string): Promise<{ name: string } | null>` for the page.
  - Admin actions, both `(prev, form) => ActionResult`, both `requireAdmin()`:
    - `resendInvite`: returns `message` plus `link`.
    - `approveVendor`: refuses unless `vendorStage === 'ready_for_review'`.

- [ ] **Step 1: Integration tests:**
  - accept valid → role VENDOR, vendorId set, hash null
  - expired → `expired`
  - reused (second accept by another user) → `expired`
  - token rotated by resend is refused
  - ADMIN refused, KITCHEN refused, other bakery refused; none of these change the profile
  - same-bakery vendor → ok, no change
  - customer with orders accepts invite → orders still have the same `userId`
  - `approveVendor` refuses at `setting_up` and succeeds at `ready_for_review`
  - `addVendor` without phone fails; with phone it creates `isActive: false` and returns a link
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `lib/vendorInvite.ts` and the admin actions.
- [ ] **Step 4:** Build `/join/[token]`:
  - Server page. `invitedBakery` null → expired copy, plus a WhatsApp contact button using the shop's support number from settings.
  - Signed out → heading "`<name>` has been invited to MakeYourCakes" and a Sign up link to `/sign-up?redirect_url=/join/<token>`.
  - Signed in → an Accept form posting to `actions.ts`. On `ok`, it redirects to `/vendor`; otherwise it shows the reason's copy.
  - Confirm `/join` is not in the `GUARDED` list (`lib/roles`), so it stays public.
- [ ] **Step 5:** Admin UI:
  - `InviteLink` shows the link with Copy (`navigator.clipboard`), Send on WhatsApp (an `<a href={whatsappInviteUrl(...)} target="_blank">`) and Resend.
  - The vendors list shows a stage pill per bakery, with labels: Invited, Invite expired, Setting up n/4, Ready for review, Live, Paused.
  - The detail page shows Approve only at Ready for review.
- [ ] **Step 6:** Re-run the tests, then `npm run typecheck && npm run lint`. Expected: PASS and clean.
- [ ] **Step 7:** Commit with message `feat: bakery invite links, stages and approval`.

### Task 6: Grid save, pause and resume (server)

**Files:**
- Modify:
  - `lib/inventory.ts` (`recordAvailability` gains `pausedUntil?: Date | null`)
  - `app/api/inventory/route.ts` (three new union members)
- Test: `tests/cakeGrid.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 `pauseEnd`, Task 3 `isOfferable`.
- Produces:
  - Route body variants (Zod, `.strict()`):
    - `{ vendorId, grid: { productId, sizes: string[], egg: boolean, eggless: boolean }[], version: string | null }`
    - `{ vendorId, pause: { scope: { productId } | { sizeBand } | { eggType: 'eggless' }, length: PauseLength } }`
    - `{ vendorId, resume: { ids: string[] } }`
  - `gridVersion(vendorId: string, tx): Promise<string | null>`: the ISO string of the max `updatedAt` over the vendor's rows, or null if there are none.
  - Grid save semantics:
    - If `version` ≠ the current `gridVersion` → `InventoryConflict('This changed on another device. Reload to see the latest.')`.
    - Wanted variants = `CakeVariant` rows matching each grid row's sizes × enabled egg types.
    - Upsert those with `isAvailable: true`. Set `isAvailable: false` on the vendor's other rows whose `productId` appears in the grid.
    - Rows for products not in the grid (orphans) are untouched.
    - One `recordAvailability` per changed row.
  - Pause: set `pausedUntil = pauseEnd(length, now)` on matching rows with `isAvailable: true`, and log each.
  - Resume: set `pausedUntil = null` on the given ids within the vendor, and log each.
  - The success response includes the new `version`.

- [ ] **Step 1: Integration tests:**
  - grid creates the wanted rows and logs
  - unticking turns a row off and logs `previousAvailable: true → false`
  - stale grid version writes nothing (row counts and values unchanged, 409 with the copy)
  - orphan rows are ignored by grid save
  - pause by size affects every cake's rows of that size only
  - pause skips off rows
  - pause writes `pausedUntil` on both the row and the log
  - resume clears it
  - a vendor cannot pause another vendor's rows (403)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. All writes happen inside the existing `lockAssignments(tx)` transaction.
- [ ] **Step 4:** Re-run, plus `tests/inventory.test.ts tests/inventorySecurity.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with message `feat: cake grid save, pause and resume`.

### Task 7: Warm tokens and vendor home, tabs and profile

**Files:**
- Modify:
  - `app/globals.css` (the `--color-a-*` canvas, surface and line tokens; card radius token)
  - `app/vendor/layout.tsx`, `app/vendor/VendorTabs.tsx` (Home · Orders · Cakes · Profile; fixed to the bottom below `sm`)
  - `app/vendor/page.tsx`, `app/vendor/profile/page.tsx`
- Create:
  - `components/vendor/ChecklistCard.tsx`
  - `components/vendor/StatusSwitch.tsx`
  - `components/vendor/DetailsForm.tsx` (replaces `components/inventory/Availability.tsx`; delete that file)
- Test: `tests/panels.integration.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 `setupSteps`/`vendorStage`, Task 4 `requireVendorSetup` and the availability route.
- `ChecklistCard({ steps, stage })` shows four rows with links:
  - location → `/vendor/profile#location`
  - cakes → `/vendor/inventory`
  - details → `/vendor/profile#details`

  When the stage is `ready_for_review`, it shows "Sent to MakeYourCakes for review".
- `StatusSwitch({ vendorId, accepting, active })` posts `availability: accepting|closed`. It is disabled with "Available once MakeYourCakes approves your bakery" when `!active`.

- [ ] **Step 1:** Extend the panels integration test so the home data for an inactive vendor returns its steps, and the sent-out card is still in the board for an active vendor (keeps the 10 Nov regression covered).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The tokens.
  - Home: checklist when not live; otherwise StatusSwitch, then Today (the existing board columns including `VENDOR_SENT_OUT_COLUMN`, restyled), then the "Paused right now" strip (rows with an active pause, each with a Resume button posting `resume`).
  - Profile: contact, `LocationPicker` (`id="location"`), `DetailsForm` (`id="details"`, with prep minutes, radius km and max orders), sign out.
  - "You're live 🎉" note above the StatusSwitch once the bakery is active. Dismissing it stores `mmc-live-seen-<vendorId>` in `localStorage`, wrapped in try/catch. It's a per-device convenience, so no column.
- [ ] **Step 4:** Run the tests, `npm run typecheck`, `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit with message `feat: warm vendor home with setup checklist`.

### Task 8: Cakes grid UI

**Files:**
- Create:
  - `components/vendor/CakeGrid.tsx` (client; owns selection state and the save bar)
  - `components/vendor/CakeGridRow.tsx`
  - `components/vendor/PauseSheet.tsx` (native `<dialog>`, styled as a bottom sheet)
- Modify: `components/inventory/InventoryPage.tsx` (query adds `pausedUntil`, passes `gridVersion` and the catalogue to `CakeGrid`; new-cake banner)
- Delete: `components/inventory/CakeAvailability.tsx`
- Test: `tests/assignmentAvailabilityUI.test.ts` (update to the new component), plus a new `tests/cakeGrid.test.ts` for the pure helper below

**Interfaces:**
- Consumes: Task 6 route bodies.
- Produces: `gridFromRows(variants, rows): GridRow[]`, exported from `CakeGrid.tsx` or a sibling `cakeGridModel.ts`. It builds `{ productId, name, photo, sizes: { band, on }[], egg: boolean | null, eggless: boolean | null }`, where `null` means the cake has no variant of that egg type.
- New-cake banner list: catalogue cakes with no row for this vendor whose `createdAt` is later than the vendor's latest `InventoryAvailabilityChange.createdAt`.

- [ ] **Step 1:** Write `tests/cakeGrid.test.ts` for `gridFromRows`:
  - sizes come out sorted numerically
  - an egg-only cake gives `eggless: null`
  - a row with any on-variant of a size marks that size `on`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the components:
  - Shortcuts: Select every cake; a size column header that ticks that size on every row offering it; "We're eggless only".
  - A sticky "Save changes (n)" bar.
  - The conflict copy on 409.
  - Admin keeps the bakery `<select>` from the old component.
- [ ] **Step 4:** Run the unit tests, `npm run typecheck`, `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit with message `feat: one-screen cake grid with pauses`.

### Task 9: End-to-end verification

**Files:** none (verification only). Fix anything it finds in the owning task's files.

- [ ] **Step 1:** Run the full suite: `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npm test && npm run typecheck && npm run lint`. Expected: all green.
- [ ] **Step 2:** Start `makemycake-scratch` from `.claude/launch.json` (port 3001, scratch DB).
  - Run `npm run demo:logins` against the scratch DB.
  - At 375px: admin adds a bakery → copies the invite → opens `/join/<token>` signed in as the demo vendor → accepts → pins location → saves the grid → pauses "Rest of today" → resumes → confirms details.
  - Admin sees "Ready for review" → Approve → the vendor turns on Taking orders.
  - Screenshot each step.
- [ ] **Step 3:** `graphify update .`
- [ ] **Step 4:** Commit any fixes with message `fix: onboarding verification fixes`.

**Rollout note for the owner:** run `npx prisma migrate deploy` against production (Supabase port 5432) **before** deploying this code.
