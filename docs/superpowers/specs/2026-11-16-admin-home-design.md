# Admin shell and "Needs you" home — design

Date: 2026-11-16 · Admin redesign, spec 1 of 3. Spec 2 is the orders workspace; spec 3 is the bakeries hub (onboarding pipeline and cake coverage).

## Why

The admin panel is used equally on a phone, for quick checks and approvals, and on a laptop, for real work. Today, opening it does not say what needs action. The dashboard has two different layouts depending on whether any bakery is live, and pages lay out headers, filters and lists inconsistently. This spec makes the first screen a prioritised list of things to act on, gives admin one navigation that works on both devices, and adds the shared pieces the later specs reuse.

## Decisions made

- **Approach A:** a "Needs you" home plus one consistent shell, split into three specs. This is spec 1.
- **Look:** direction A, "Warm brand". The tokens are already shared with admin since PR #72.
- **Mockup:** `.superpowers/brainstorm/*/content/admin-home.html` (laptop and phone).
- **No URL changes.** No command palette. No new tables.

## 1. "Needs you" home (`/admin`)

**Layout.**
- **Laptop:** header "Needs you" with the date and item count, then filter chips. Below that, two columns: the action list (about 60%) and "At a glance" (about 40%).
- **Phone:** the same order of content in one column, with "At a glance" under the list.

**Categories.** Each open order appears **once**, in its most urgent category, in this order:

1. **Late risk** (red stripe). An order is in this category when all of these hold:
   - its status is `confirmed` or `in_kitchen`, or it is `out_for_delivery` and late;
   - `dueUrgency(order.dueAt ?? order.requestedFor, now)` is `late` or `urgent` (urgent means less than 3 hours to go).

   The tag reads "Late · N min" when late and "Due in N h" when urgent. The line underneath is the bakery name plus where the order stands: baking, ready but not sent, or out for delivery. The action is **Call bakery** (a `tel:` link to the current bakery's phone). If no bakery holds the order the action is **Assign**; if the bakery has no phone it is **Open order**.
2. **Stuck with bakeries** (amber stripe). The order is `confirmed` and one of these holds:
   - it has no current assignment (tag "No bakery");
   - the last offer expired ("Offer expired N min ago");
   - the current assignment was rejected ("Rejected", plus the rejection reason when there is one).

   The action is **Assign**, or **Reassign** when the order was rejected. It links to `/admin/orders/<ref>#assign`. **The whole category is skipped when no bakery is live** (no active bakery).
3. **New** (terracotta stripe). Status is `draft`. The line reads "Placed N min ago" plus the payment method. The action is **Confirm**, which runs the existing confirm transition in place. A secondary **Call** button is a `tel:` link to the customer.
4. **Requests** (grey stripe). Not orders:
   - a bakery whose `vendorStage` is `ready_for_review` → **Review** (links to `/admin/vendors/<id>`);
   - a custom request in `awaiting_quote` → **Quote** (links to `/admin/custom-requests`);
   - a payment recovery or refund that is due for follow-up, using the same rule as `/admin/payments` → **Follow up** (links to `/admin/payments`).

**Sorting.** By category in the order above. Within a category, by due time ascending. Requests are sorted by creation time ascending.

**Filter chips.** All · Late · Stuck · New · Requests, each with its count. The chosen chip is kept in the URL as `?only=late|stuck|new|requests`; any other value means All.

**At a glance.** Each line is counted on the IST calendar day:
- **Orders today:** placed today, excluding cancelled.
- **Baking now:** status `in_kitchen`.
- **Out for delivery.**
- **Live bakeries:** "x of y". x counts active bakeries that are accepting orders; y counts active bakeries.
- **Revenue today:** the sum of order totals placed today, excluding cancelled.

**Empty state.** "All caught up" with a check mark. "At a glance" still shows.

**Freshness.** The page refreshes (`router.refresh()`) whenever the existing admin portal events stream delivers an event. There is no polling.

## 2. Navigation

`lib/adminNav.ts` changes grouping and labels only. Every route stays where it is.

| Group | Items (label → route) |
| --- | --- |
| Home | Home → `/admin` (with count badge) |
| Orders | Orders → `/admin/orders` · Deliveries today → `/admin/orders/today` · Custom requests → `/admin/custom-requests` · Payments → `/admin/payments` |
| Bakeries | Bakeries → `/admin/vendors` · Cake availability → `/admin/inventory` |
| Catalogue | Cakes → `/admin/cakes` · Options & prices → `/admin/catalog` |
| Settings | Shop → `/admin/settings` · Delivery slots → `/admin/delivery` · Staff → `/admin/staff` |

Keep the existing `partnersOnly` behaviour on Cake availability.

**Phone (below `sm`).**
- A fixed bottom tab bar: Home (badge) · Orders · Bakeries · More. "More" opens the existing navigation drawer.
- Respect the safe area at the bottom, and pad the main content so nothing hides behind the bar.
- Every tab target is at least 44px.

**Laptop.** Keep the existing sidebar with the new grouping and the badge on Home.

**Search.** A header button opens the existing `/admin/search`. ⌘K / Ctrl+K navigates to the same page.

**Badge.** The count of "Needs you" items, computed by the same loader as the page.

## 3. Shared pieces (`components/admin/ui.tsx`)

- **`ActionItem({ tone: 'late'|'stuck'|'new'|'request', tag, title, detail, action, secondary? })`.** A coloured stripe, a tag pill, a title line, a muted detail line, a primary action and an optional secondary action. An action is either a link `{ href, label }` or a client control passed in as a node.
- **`FilterChips({ options: { value, label, count }[], selected, param })`.** Plain links that set the URL parameter. The selected chip uses the accent colour.
- **`StatList({ rows: { label, value }[] })`.** The "At a glance" rows.

All three use the existing `a-` tokens and need no client JavaScript, except the action node passed into `ActionItem`.

## 4. Data and code layout

- **`lib/needsYou.ts`** (pure, no db, no server-only):
  - `classifyNeedsYou(input: NeedsYouInput, now: Date): { items: NeedsYouItem[]; counts: Record<'late'|'stuck'|'new'|'requests', number>; total: number }`
  - `glance(input: GlanceInput, now: Date): GlanceStats`
  - `parseOnly(param: string | undefined): NeedsYouFilter`
- **`lib/needsYouData.ts`** (server-only) loads the inputs:
  - open orders (`draft`, `confirmed`, `in_kitchen`, `out_for_delivery`) with their current assignment, the vendor name and phone, and the latest rejection reason;
  - the stage input for each bakery, via the existing `vendorSetupStates`;
  - custom requests in `awaiting_quote`;
  - due payment follow-ups, using the existing payments query extracted into a shared function so the two cannot drift;
  - today's order counts and totals.
- **`app/admin/page.tsx`** is replaced by the new home. **Delete** its old dual-mode layout and the `ops-overview-band` CSS in `app/globals.css`.
- **`AvailabilityToggle.tsx`**: replace its off-palette colour class with tokens.

## 5. Errors and permissions

| Case | Behaviour |
| --- | --- |
| Confirm loses a race (already confirmed or cancelled) | The existing transition refuses; a toast shows its message; the list refreshes. |
| Bakery or customer has no phone | The call action becomes **Open order** (`/admin/orders/<ref>`). |
| Database unreachable | The existing `Notice` with `NO_DATABASE_MESSAGE`. |
| Events stream drops | No change; data is correct on next navigation or reload. |

Access is unchanged: `requireAdmin()` guards the page, and the confirm action re-checks on the server.

## 6. Testing

**Unit tests (`tests/needsYou.test.ts`):**
- one test per category;
- an order that is both late and unassigned appears once, under Late, with the Assign action;
- the 3-hour boundary (2h59m is urgent; 3h00m is not);
- no live bakery means no Stuck items;
- sort order within a category;
- `glance` counts across an IST midnight boundary (an order at 23:50 IST counts for that day);
- `parseOnly` falls back to All for an unknown value;
- a missing phone falls back to Open order.

**Integration test (`tests/needsYou.integration.test.ts`, scratch Postgres):** the loader returns the right categories for seeded orders, a bakery ready for review, and a custom request awaiting a quote.

**Browser check** at 375px and at laptop width on the scratch server: the list renders, chips filter and survive a reload, Confirm works in place and the item disappears, the Call link is correct, the bottom tabs and the More drawer work, and the badge count matches the list.

## Not doing (here)

- **The orders list, order side panel and drawers.** Spec 2.
- **The bakery onboarding pipeline view and the cake × bakery coverage grid.** Spec 3.
- **A command palette, or new analytics and charts.**
- **WhatsApp "nudge" messages from the home page.** Calls only, for now.
