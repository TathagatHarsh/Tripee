# Admin orders workspace — design

Date: 2026-11-16 · Admin redesign, spec 2 of 3. Spec 1 (the "Needs you" home) was merged as PR #73. Spec 3 is the bakeries hub.

## Why

Finding the right orders and acting on them takes too many clicks, especially on a phone. Today:
- the list needs three rows of filter chips;
- every action means opening the order page and scrolling a column of about ten cards.

The admin works equally on phone and laptop.

**Assignment is automatic.** A new order is offered to the nearest bakery, and if that bakery rejects it or times out, to the next nearest. The admin does not assign orders. They watch the progress and step in by phoning the customer or the bakery.

## Decisions made

- **Approach A:** a list plus a quick-view panel. On laptop the panel sits beside the list. On phone it is a full-screen sheet. It is driven by the URL (`?open=<ref>`).
- **Panel actions:** Confirm (new orders only) · Call customer · WhatsApp customer · Call bakery · Open full order. There is no assign action and no status-advance action in the panel.
- **Mockup:** `.superpowers/brainstorm/*/content/orders-workspace-v2.html`.
- **No new tables or migrations. No new routes.** Existing `/admin/orders` filter links keep working.

## 1. Views and filters (`/admin/orders`)

**One chip row** (`FilterChips`, param `view`):

| View | Orders |
| --- | --- |
| **Needs action** (default) | Exactly the orders in the "Needs you" list from `loadNeedsYou()`, in that list's order. |
| **Today** | Due today, on the IST calendar day (`dueAt ?? requestedFor`), status not `cancelled`. |
| **Upcoming** | Due after today (IST), status not `delivered` or `cancelled`. |
| **All** | Every order, newest first, with the existing `LIMIT` and "show more" paging. |

An unknown `view` falls back to Needs action. The "Needs action" chip shows that list's count.

**More filters** is a sheet: a native `<dialog>` on phone, an inline popover on laptop. It holds the existing status, date (`days`), delivery slot (`slot`) and bakery/stage (`production`) filters, built from the existing `components/admin/Filters.tsx`.
- When any of the legacy params `status`, `days`, `slot`, `due` or `production` is present, they apply exactly as today and **override** the view, so old links behave the same.
- "More filters" shows a count of active filters and a "Clear" link.

**Search** (`q`) is unchanged and combines with any view.

## 2. List rows

Each row is one link to `?open=<ref>`, keeping the current view and filters. It shows:
- the cake photo (the existing `Thumb`);
- `<ref>`;
- cake name · size;
- the customer's first name;
- the delivery window, or "Pickup";
- the **bakery line**;
- a status tag (the existing `OrderStatusBadge`).

The row that is open in the panel is highlighted.

**The bakery line** comes from the pure function `bakeryLine(order, attempts, now)` in `lib/orderViews.ts`:
- **Offer pending** → "finding a bakery" on the first attempt, or "finding a bakery (Nth try)" from the second attempt on.
- **Accepted or in production** → "<bakery> · <stage>", with stage "accepted", "baking", "ready" or "sent out".
- **Cancelled after every bakery declined** (`cancellationReason` present and no accepted attempt) → "No bakery could take it".
- **No attempts and status `draft`** → "waiting for confirmation".
- **Otherwise** → empty.

## 3. Quick-view panel (`?open=<ref>`)

**Loader.** `loadOrderPanel(ref)` in `lib/orderPanelData.ts` (server-only) makes one query for:
- the order and its cakes (name, size, egg type, message, photo);
- customer name and phone;
- delivery address and window, or pickup;
- payment status and total;
- every `VendorOrder` attempt, in sequence, with the bakery's name and phone, `assignmentStatus`, `status`, `offeredAt`, `respondedAt`, `expiresAt` and `rejectionReason`.

It reuses `assignmentHistory()` from `lib/vendors.ts` for the attempt wording where that function fits.

**Content, top to bottom:**
1. **Header:** `<ref>`, status tag, "placed N min ago", payment state, total, and a close control (✕ on laptop, ← on phone).
2. **The cake(s):** name · size · egg/eggless, the message on the cake (in a dashed box), and the photo.
3. **Delivery:** window and address, or "Pickup".
4. **Customer:** name and phone.
5. **Bakery progress:** one line per attempt, oldest first:
   - "Offered to X · waiting N min"
   - "Accepted by X · <time>"
   - "X said no (<reason>) · <time>"
   - "X didn't answer in time · <time>"
   - "No bakery could take it", when cancelled for that reason

**Action bar,** fixed at the bottom of the panel:
- **Confirm:** only when the status is `draft`. Reuses `app/admin/ConfirmButton.tsx`.
- **Call customer:** a `tel:` link. Hidden when there is no customer phone.
- **WhatsApp customer:** a `wa.me` link built on the server with the existing `whatsappHref`. Hidden when the number is invalid.
- **Call bakery:** a `tel:` link to the bakery that currently holds the order, or else the most recently offered one. Hidden when there is no phone.
- **Open full order →:** `/admin/orders/<ref>`.

Every control is at least 44px.

**Layout.**
- **Laptop (`lg` and up):** the page becomes two columns: the list on the left, and the panel as a sticky right column of about 380px. The list stays scrollable and clickable.
- **Below `lg`:** the panel is a full-screen sheet over the list.
- **Closing** links to the same URL without `open`. The browser back button also closes it, because opening it was a navigation.
- The list keeps its scroll position. Rows use links with `scroll={false}`, and closing does the same.

**Not found.** An unknown `ref` shows the panel with "Order not found" and a close link. The list is unaffected.

## 4. Fix to the live home page (spec 1)

In `lib/needsYou.ts`, the Stuck category's action becomes **Open order**, linking to `/admin/orders?view=needs&open=<ref>`. Assign and Reassign are removed, because assignment is automatic.

Tags and details stay as they are: "No bakery", "Offer expired N min ago", and "Rejected" with the reason. The Late category's **Assign** fallback becomes **Open order** too, with the same link.

## 5. Code layout

- **`lib/orderViews.ts`** (pure):
  - `type OrderView = 'needs' | 'today' | 'upcoming' | 'all'`
  - `parseView(p: string | string[] | undefined): OrderView`
  - `viewWhere(view: Exclude<OrderView, 'needs'>, now: Date): Prisma.OrderWhereInput`, which reuses `istDayStart` from `lib/needsYou.ts`
  - `bakeryLine(...)`
- **`lib/orderPanelData.ts`** (server-only): `loadOrderPanel(ref: string): Promise<OrderPanelData | null>`.
- **`components/admin/OrderPanel.tsx`:** a server component rendering `OrderPanelData`. Interactive children are `ConfirmButton` and the existing `Toast`.
- **`app/admin/orders/page.tsx`:** views, the More filters sheet, the new rows, and the panel slot. Legacy params are preserved.
- **`lib/needsYou.ts`:** the §4 change.

## 6. Errors and permissions

| Case | Behaviour |
| --- | --- |
| Unknown or garbled `open` | "Order not found" panel; the list is unaffected. |
| No customer or bakery phone | That button is hidden. |
| Confirm loses a race | Toast with the server message, then the list and panel refresh (same as spec 1). |
| Database unreachable | The existing `Notice` with `NO_DATABASE_MESSAGE`. |

Access is unchanged: `requireAdmin()`, and server actions re-check it.

## 7. Testing

**Unit tests:**
- `parseView` falls back to `needs`.
- `viewWhere` builds the Today and Upcoming windows across IST midnight (an order due at 23:50 IST belongs to that day).
- `bakeryLine` covers every branch.
- The `needsYou` stuck and late items now carry "Open order" with the `?view=needs&open=` link.

**Integration test (scratch Postgres):** `loadOrderPanel` returns the attempts in sequence for an order that was offered, rejected through the real respond path, and re-offered. It returns null for an unknown ref.

**Browser check at 375px and laptop width (scratch server):**
- views switch and survive a reload;
- an old link such as `?status=confirmed&days=7` still filters;
- More filters works;
- a row opens the panel, which shows the cake, delivery, customer and bakery progress;
- Confirm works in the panel;
- the Call and WhatsApp links are correct;
- back or close returns to the same list position;
- `?open=NOPE` shows "Order not found";
- the home page's stuck item opens the panel.

## Not doing (here)

- **Manual assignment UI.** Assignment is automatic. The full order page keeps its existing tools untouched.
- **Changing status from the panel.** It stays on the full order page.
- **Bulk actions, column customisation, CSV export.**
- **The bakeries hub.** That is spec 3.
