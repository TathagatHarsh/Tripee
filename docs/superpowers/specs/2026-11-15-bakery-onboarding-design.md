# Bakery onboarding and cake setup — design

Date: 2026-11-15 · Sub-project 1 of 2 (sub-project 2: admin panel redesign)

## Why

Real partner bakeries are about to set up on their phones. The 10 Nov audit found 0 of 7 bakeries active and no vendor logins linked. Today a bakery goes live only after six unguided steps across two people, and a hidden admin field blocks orders even when the baker has done everything right. The vendor panel must feel trustworthy, and a baker must be able to finish setup alone.

## Decisions made

- Primary audience: bakers onboarding on a phone.
- Onboarding: the admin sends an invite link, the baker sets up through a checklist, and the admin gives final approval.
- Inventory: the baker says once what they make, then pauses things day to day. Pauses lift by themselves.
- Model: keep the per-variant `VendorInventory` rows and add `pausedUntil`. No new rules engine.
- Look: direction A, "Warm brand" (cream and terracotta, matching the shop). Mockup: `.superpowers/brainstorm/*/content/visual-style.html`.
- No new roles.

## Audit findings this addresses

1. **Hidden product gate.** `lib/assignment.ts:214` and `lib/assignmentRules.ts:77` also require `Vendor.fulfillsAllProducts` or a list of cake IDs that the admin types, comma-separated (`AssignmentRulesForm`). Both default to "nothing". A bakery whose cakes are all switched on still gets no orders.
2. **Linking requires prior sign-up.** `linkVendorUser` fails unless the baker has already signed up on their own.
3. **Inventory is hundreds of switches.** Cakes are added one at a time, with no bulk actions and no temporary pause.
4. **Sent-out orders vanish from the vendor board** (10 Nov audit, P1). `out_for_delivery` cards have no column.
5. **Vendor Profile is a bare paragraph**, and `CakeAvailability.tsx` packs a whole screen into 65 dense lines with styling that is off-system.

## 1. Inviting a bakery

**Admin, Add bakery:** name and WhatsApp number are required. Email and address are optional. New bakeries are created with `isActive = false`.

After creating the bakery, the admin sees the invite link with:
- **Copy link**
- **Send on WhatsApp:** a `https://wa.me/91XXXXXXXXXX?text=…` link that opens the admin's own WhatsApp with a ready-made message. No Meta template is needed.
- **Resend:** issues a new token, which invalidates the old one.

**Token:** 32 random bytes, base64url, in the link. Only its SHA-256 hash is stored, in `Vendor.inviteTokenHash` (unique). `inviteExpiresAt` is now + 7 days. The token is single-use and cleared on acceptance.

**Baker, `/join/[token]`** (public route):
1. Look up the hash. If it is missing or expired, show the error state (§5).
2. Not signed in: show "<Bakery> has been invited to MakeYourCakes" and a **Sign up** button. Clerk sign-up returns to `/join/[token]`.
3. Signed in: in a single transaction, re-check the token, then check the profile:
   - Role must be `CUSTOMER`. An existing `VENDOR` already linked to this same bakery is a no-op success.
   - Refuse `ADMIN` and `KITCHEN`.
   - Refuse a `VENDOR` linked to another bakery.

   Then set `role = VENDOR` and `vendorId`, clear both invite fields, and redirect to `/vendor`.

**Role-change exception.** Until now a role changed only through `npm run role` or an admin server action. Here the baker's own request changes it, authorised by a single-use secret the admin issued. Nothing else in a request can set a role. This exception is documented in `lib/auth.ts` next to `loadProfile`, and covered by the tests in §7.

**"Link by email"** (`linkVendorUser`) stays as a fallback.

**Stages.** These are derived in one pure function, `vendorStage(vendor)`, with no new column. The admin vendor list shows the stage as a pill. Active bakeries are always Live or Paused, whatever their checklist says. The other rows apply only when `!isActive`.

| Stage | Condition |
| --- | --- |
| Invited | no linked user, invite not expired |
| Invite expired | no linked user, invite expired or missing |
| Setting up (n/4) | linked user, checklist incomplete |
| Ready for review | checklist complete, `!isActive` |
| Live | `isActive && isAcceptingOrders` |
| Paused | `isActive && !isAcceptingOrders` |

**Approve** sets `isActive = true` and is enabled only at "Ready for review". Deactivation stays as it is today; fixing it is out of scope (see Not doing).

## 2. Setup checklist and vendor home

`/vendor` shows a checklist card until every step is done:

1. **Account created:** always done, because the baker is signed in.
2. **Pin your shop:** the existing `LocationPicker`. Done when `locationSetAt` is set.
3. **Choose the cakes you make:** links to the Cakes tab. Done when at least one `VendorInventory` row has `isAvailable`.
4. **Bakery details:** `preparationMinutes`, `serviceRadiusKm` and `maxConcurrentOrders`, pre-filled with the current defaults. Saving sets `Vendor.detailsConfirmedAt`.

With steps 1–4 done and `!isActive`, the card reads "Sent to MakeYourCakes for review". Once active, the checklist is gone and a one-time "You're live" note shows.

**Live home:**
- A **Taking orders / Paused** switch for `isAcceptingOrders`. It is disabled with an explanation until the bakery is approved.
- **Today:** offers with their accept-by time, in-progress orders, and **sent-out orders with a Mark delivered action**. This fixes finding 4 by adding an `out_for_delivery` group fed by the existing `handed_over` rows from `vendorBoard()`.
- **Paused right now** strip: active pauses, each with a **Resume** button.

**Tabs:** Home · Orders · Cakes · Profile. On phones the tab bar is fixed at the bottom.

**Profile, rebuilt:** contact details, location (`LocationPicker`), bakery details (same form as step 4), and sign out.

## 3. Cakes grid and pauses

**Cakes tab, "What you make":**
- One row per catalogue cake: photo, name, and a chip for each size that cake offers. A ticked chip means "I make this size".
- Each row has **Egg** and **Eggless** toggles. They are shown only for the egg types the cake's variants offer.
- A row describes a set of variants: (ticked sizes) × (enabled egg types), restricted to variants that exist in `CakeVariant`.
- **Shortcuts:** Select every cake. Tick a whole size column. "We're eggless only", which turns Egg off on every row.
- A sticky **Save changes (n)** bar. One transaction under the existing assignment advisory lock:
  - Upsert rows that should exist with `isAvailable = true`.
  - Set `isAvailable = false` on existing rows that are no longer ticked.
  - Write an `InventoryAvailabilityChange` for every row that changed.
  - Existing optimistic `version` (`updatedAt`) checks apply.
- **New-cake banner:** "N new cakes on the menu. Do you make them?" It lists catalogue cakes with no row for this bakery whose `createdAt` is later than the bakery's latest `InventoryAvailabilityChange.createdAt`.

**Pauses:**
- **Scopes:** one cake, one size across every cake, all eggless. Pausing everything is the Taking orders switch, not a pause.
- **Lengths:** Rest of today (23:59:59 IST), Until tomorrow (07:00 IST next day), or Pick a date (23:59:59 IST that day).
- **Storage:** `VendorInventory.pausedUntil` is set on every matching row with `isAvailable`. Resume sets it to null. Each change writes an `InventoryAvailabilityChange` with `pausedUntil` filled in and `newAvailable` unchanged.
- **Offerable rule.** A pure function in `lib/assignmentRules.ts`, used at `lib/assignment.ts:144` and `:219`:

  ```
  isOfferable(row, now) = row.isAvailable && (row.pausedUntil == null || row.pausedUntil <= now)
  ```

  No worker is needed. An expired pause just stops matching. Expired `pausedUntil` values are left as they are, and the UI treats them as "not paused".
- Accepted orders keep going regardless, as with availability today.

**Removing the hidden gate:**
- Delete the `fulfillsAllProducts` / `supportedProductIds` checks in `lib/assignment.ts:214` and `lib/assignmentRules.ts:77–80`.
- Delete those two fields from `AssignmentRulesForm.tsx` and `assignmentActions.ts`.
- Keep the database columns, marked `/// Deprecated, unread`. No column is dropped on the live database.

**Admin** reuses the same grid with its existing bakery picker (`/admin/inventory?vendor=`). The cross-bakery coverage view belongs to sub-project 2.

## 4. Visual system (direction A)

- Update the `a-` tokens in `app/globals.css` once:
  - canvas `#fbf6ef`
  - surface `#ffffff`
  - line `#eaded0`
  - accent stays `#94472c` / ink `#874027` / wash `#f6e9db`
  - card radius 14px

  Admin inherits the colours now. Its layout work is sub-project 2.
- New vendor components in `components/vendor/`: `ChecklistCard`, `StatusSwitch`, `CakeGridRow`, `PauseSheet` (a native `<dialog>` styled as a bottom sheet), `BottomTabs`.
- Rewrite `components/inventory/CakeAvailability.tsx` as those readable components. Delete the dense one-liner version.
- Every control is at least 44px. The layout works at 360px wide. Focus rings are visible.

## 5. Errors

| Case | Behaviour |
| --- | --- |
| Invite missing, expired or used | "This invite has expired. Ask MakeYourCakes for a new one." plus the shop's WhatsApp contact button. |
| Staff account opens an invite | "This account is MakeYourCakes staff and can't be a bakery. Sign in with a different account." No change. |
| Account linked to another bakery | "This account already belongs to another bakery." No change. |
| Grid save, stale version | "This changed on another device. Reload to see the latest." No partial write. |
| Pause on a cake with nothing switched on | The button is disabled. The server ignores rows without `isAvailable`. |
| Taking-orders switch before approval | Disabled, with the text "Available once MakeYourCakes approves your bakery". |

## 6. Database change

One migration, all additions nullable:

- `Vendor.inviteTokenHash String? @unique`
- `Vendor.inviteExpiresAt DateTime?`
- `Vendor.detailsConfirmedAt DateTime?`
- `VendorInventory.pausedUntil DateTime?`
- `InventoryAvailabilityChange.pausedUntil DateTime?`

The migration also backfills `detailsConfirmedAt = now()` where `isActive = true`.

**Rollout:** the owner runs `migrate deploy` against production (port 5432), then the code deploys. Old code ignores the new columns. Verify the migration offline against the scratch database first.

## 7. Testing

**Unit tests:**
- `vendorStage` for every stage.
- `isOfferable`: on, off, paused, pause ended.
- Pause-length to IST timestamp, including the date rollover after midnight IST.
- Invite token hash and expiry.
- Building the `wa.me` text.

**Integration tests** (scratch Postgres, `ASSIGNMENT_TEST_DATABASE_URL`):
- Invite acceptance: valid; expired; reused; ADMIN refused; KITCHEN refused; vendor of another bakery refused; vendor of the same bakery is a no-op. Covers the role-change exception.
- The grid save writes the right rows and audit entries, and rejects a stale version.
- Assignment skips a paused variant and offers it again once `pausedUntil` has passed.
- Assignment works for a bakery whose `fulfillsAllProducts` is false and `supportedProductIds` is empty (gate removed).
- An accepted order continues after its variant is paused.
- Sent-out orders appear on the vendor home and can be marked delivered.

**Browser check** at 375px on the scratch server with the demo vendor login: invite → sign-up → checklist → grid → pause → resume → admin approve → Taking orders on.

## Not doing (here)

- **Admin panel layout redesign and the cross-bakery cake coverage grid.** These are sub-project 2.
- **A WhatsApp template message on approval.** It needs Meta template approval. Add it when templates are being set up anyway.
- **A public "Become a partner" application form.**
- **Fixing other open 10 Nov audit findings** (deactivation stranding orders, the missing baking notification, etc.). They are separate fixes.
- **Dropping the deprecated `fulfillsAllProducts` / `supportedProductIds` columns.**

## Sub-project 2 outline (admin redesign, own spec later)

- Apply direction A layouts across admin: dashboard, orders, vendors.
- An onboarding pipeline view built on `vendorStage`.
- A cake × bakery coverage grid showing cakes no live bakery makes.
- Clean up the drifted pages.
