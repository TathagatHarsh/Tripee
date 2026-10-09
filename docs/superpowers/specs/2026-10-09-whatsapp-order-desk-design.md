# WhatsApp order desk — design

**Date:** 2026-10-09 · **Status:** awaiting review · **Path:** architectural

## What the admin asked for

The admin has a new phone number, not yet on WhatsApp, and wants to run the order
desk through it:

- A new order goes **automatically to the nearest vendor that has the cake in stock**.
- Vendors receive the order on WhatsApp, **with the cake photo**, from the admin's number.
- The admin **follows every step** of every order on WhatsApp.
- A vendor can reply **"Order started"** (and the other steps) and the website updates.

## Decisions taken while brainstorming

| Question | Decision |
|---|---|
| Provider | **Meta WhatsApp Cloud API, directly.** No reseller, no unofficial WhatsApp-Web bridge (ToS ban risk, needs an always-on server). |
| The new number | Becomes the **API-only business number**. It cannot also be opened in the WhatsApp app (coexistence only applies to numbers already on the WhatsApp Business app, and India support is unclear). The admin receives everything on his **personal** WhatsApp, sent from the new number. |
| Vendor says no / doesn't reply | **Offer the next-nearest in-stock vendor automatically.** Message the admin only when no vendor is left. |
| Admin's feed | **Every step** of every order. |
| Every-minute timer (offer expiry, retries) | **Free external pinger** (cron-job.org or similar) calling the two existing secret-protected worker URLs every minute. Vercel Hobby crons are daily only. |

Cost at Meta's India rates (Oct 2026): ₹0.115 + GST per utility template or
in-window service message; first 1,000 service messages per number per month
free. About ₹1–2 per order all-in.

## Behaviour

1. **Order confirmed** (at checkout, or after payment). The vendors are ranked with
   the rules already in `lib/assignment.ts → assignmentCandidates`: exact cake / size /
   egg type in stock, accepting orders, under capacity, inside radius, can meet the
   deadline; non-busy first, then **nearest by road**.
2. **Offer to the nearest.**
   - *Vendor:* template with the cake photo, ref, cake + size + egg type, cake
     message, due time, delivery area + distance, their earning, reply window.
     Buttons **Accept** / **Reject**.
   - *Admin:* photo + "New order MC-XXXX ₹1,250, due Sat 4 pm", then
     "offered to Sweet Crumbs (2.1 km)".
3. **Vendor answers.**
   - *Accept* → vendor gets "MC-XXXX is yours" with buttons **Started / Ready /
     Handed over**; admin gets "Sweet Crumbs accepted MC-XXXX".
   - *Reject* or *no reply within `ASSIGNMENT_RESPONSE_SECONDS`* (default 15 min) →
     next-nearest eligible vendor gets the same offer; admin is told.
   - *Nobody left* → admin gets "⚠️ No vendor can take MC-XXXX — assign it here:
     <admin order link>".
4. **Progress.** *Started* / *Ready* / *Handed over* (button or typed) run exactly
   what the vendor portal's buttons run. The admin gets each step.
5. **Admin-side steps** (out for delivery, delivered, cancelled) stay on the
   website; the admin gets each on WhatsApp, and a cancellation also tells the
   vendor who held the order.

**Typed words** (case-insensitive, an optional `MC-XXXX` anywhere in the text):

| Action | Words |
|---|---|
| accept | accept, yes, ok |
| reject | reject, no |
| start | start, started, order started |
| ready | ready |
| handover | handed over, handover, picked up, done |

If the word fits exactly one of that vendor's orders, it applies. If it fits
none: "Nothing to mark *started* right now." If it fits several: "Which order?
Reply *started MC-1234* or tap the button on that order." Anything else gets a
short help message listing the words. A message from a number that isn't an
active vendor gets one fixed line: "This number is for MakeYourCakes bakery
partners. For your order, use the link in your confirmation."

**The website stays the record.** WhatsApp is a second way to press the same
buttons, through the same checks (stock, capacity, deadline, stale or expired
offers). Assignment never waits on WhatsApp: if Meta is down, offers still
expire and move on, and messages retry from the outbox.

## Architecture

No database migration. Everything rides on existing tables: `NotificationOutbox`
(its `channel` is already a free string and `destination` already exists),
`Vendor.phone` (already editable in `/admin/vendors`), `VendorOrder*`.

### New units

| File | Does | Depends on |
|---|---|---|
| `lib/whatsapp.ts` | The only code that talks to Meta. `send(to, message)` → Graph API `/{phone-number-id}/messages`; `verifySignature(rawBody, header)` (HMAC-SHA256 with the app secret, timing-safe); `normalizePhone(raw)` → digits with country code (10-digit → `91…`); `whatsappConfigured()`. | env only |
| `lib/whatsappMessages.ts` | Pure builders: event + order facts → the message body stored in the outbox (`template` / `text` / `buttons`). Enforces Meta's parameter rules (no newlines/tabs, ≤4 consecutive spaces, length caps). Also `queueWhatsApp(tx, …)`: writes outbox rows with `channel: "whatsapp"`, one per destination; no-op when WhatsApp isn't configured. | `lib/notifications.ts` |
| `lib/whatsappInbound.ts` | `parseInbound(text \| buttonPayload)` → `{ action, assignmentId?, ref? }` (pure). `handleInbound(message)` → finds the active vendor by normalised phone, picks the target assignment, calls `respondToAssignment` / `moveFulfillment`, queues the reply. | `lib/assignment.ts` |
| `app/api/whatsapp/webhook/route.ts` | `GET`: Meta's verify handshake (`hub.verify_token`). `POST`: verify signature on the raw body (401 if bad) → for each message, `handleInbound` → `after()` dispatches pending notifications. Delivery-status callbacks: log failures (e.g. vendor not on WhatsApp), ignore the rest. | above |
| `app/api/whatsapp/photo/[orderId]/route.ts` | Serves the order's cake photo as **JPEG** (WhatsApp images must be JPEG/PNG; our Blob photos are WebP). Signed URL (`?s=` HMAC of the order id) so it can't be enumerated. Uses the first `OrderCake.cakeImageUrl` (or legacy `Order.cakeImageUrl`), resizes to ≤1080 px with `sharp` (already a dependency). No photo (builder orders) → a plain generated JPEG with the cake name. | `sharp` |

### Changed units

- **`lib/assignment.ts → startAssignment`**: when `ASSIGNMENT_AUTO_START=true`, and the
  order is open with no current assignment and `assignmentState` PENDING/ASSIGNING,
  take `findEligibleBakeries(ref)` (already nearest-first) and call
  `manualAssignment(ref, vendorId, null, null)` on the first; on
  `AssignmentConflict` try the next. With `ASSIGNMENT_AUTO_REASSIGN=true`,
  `manualAssignment` already queues the remaining eligible vendors as PENDING
  fallbacks, and `advance()` re-checks stock/eligibility before each one. No
  eligible vendor → MANUAL + admin alert. Flag off → today's behaviour (admin
  picks). Concurrent calls (checkout + worker) are already serialised by the
  advisory lock and `manualAssignment`'s expected-assignment check.
- **`lib/assignment.ts → event()`**: the one place every assignment and vendor
  progress event passes through. Adds `queueWhatsApp` for the vendor
  (offer template) and the admin numbers (update) in the same transaction.
- **`lib/assignment.ts → advance()`** (no vendor left) and the no-candidate branch
  of `startAssignment`: admin alert with the admin order link.
- **`lib/orderTransition.ts`**: admin update on confirmed / out for delivery /
  delivered / cancelled; cancellation also messages the vendor that held it.
- **`app/api/orders/route.ts`**: admin "new order" template with photo, next to the
  existing `new_order` outbox row.
- **`lib/notifications.ts`**: `outboxCreate` takes an optional `channel`;
  `dispatchPendingNotifications` sends `channel === "whatsapp"` rows through
  `lib/whatsapp.ts` and everything else through the existing webhook. Retries,
  leases and backoff unchanged.

### Message shapes

Business-initiated messages (offers, admin updates, cancellation notice) must be
Meta-approved **templates**. Replies to a vendor's tap/text are inside the 24-hour
window, so they are plain text or interactive buttons — no template needed.

| Template (Utility, `en`) | Header | Body (params never contain newlines) | Buttons |
|---|---|---|---|
| `order_offer` | image | New order {{1}} 🎂 {{2}}. Due {{3}}. Deliver to {{4}} ({{5}} km). Your earning ₹{{6}}. Please reply within {{7}} minutes. | quick reply **Accept**, **Reject** (payload `accept:<assignmentId>` / `reject:<assignmentId>`, set per send) |
| `admin_new_order` | image | New order {{1}} for ₹{{2}}: {{3}}. Due {{4}}, delivery to {{5}}. Assignment has started. | — |
| `order_update` | — | Update on order {{1}}: {{2}}. Details are on the admin page. | — |

The "accepted" reply is an interactive message with reply buttons
`start:<id>`, `ready:<id>`, `handover:<id>`. Old buttons keep working days
later: a tap is an inbound message, which reopens the window.

### Inbound safety

- Every POST is signature-checked against `WHATSAPP_APP_SECRET` before parsing.
- The vendor is identified only by the sender's number (WhatsApp guarantees it)
  matched to an **active** vendor's normalised `Vendor.phone`. Two active vendors
  sharing a number → reply "contact the admin", no action.
- A button payload's assignment id is never trusted alone: `respondToAssignment`
  and `moveFulfillment` already check it belongs to that vendor and is still live.
  Their `AssignmentConflict` messages are already customer-safe and go back as the reply.
- Meta retries webhooks. Each reply is queued with `dedupeKey: wa-reply:<message id>`,
  so a retried delivery can't produce a second reply; the action itself is
  idempotent (second attempt conflicts, and its reply collides with the first's key).
- Rejections via WhatsApp use reason "Rejected on WhatsApp" (the existing rule
  requires a reason).

## Configuration

| Variable | Notes |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | System-user permanent token. Secret. |
| `WHATSAPP_PHONE_NUMBER_ID` | From WhatsApp → API Setup. Its absence turns all WhatsApp sending off. |
| `WHATSAPP_APP_SECRET` | App → Basic. Secret. Webhook signatures + photo URL signing. |
| `WHATSAPP_VERIFY_TOKEN` | Any random string, also typed into Meta's webhook form. |
| `WHATSAPP_ADMIN_NUMBERS` | Comma-separated, with country code (`9198…`). |
| `ASSIGNMENT_AUTO_START=true` | New. Offer the nearest eligible vendor at confirmation. |
| `ASSIGNMENT_AUTO_REASSIGN=true` | Existing. Fall back to the next vendor. |
| `ASSIGNMENT_WORKER_SECRET`, `NOTIFICATION_WORKER_SECRET` | Existing; the pinger sends them. |

**Pinger** (cron-job.org, every minute, POST with `Authorization: Bearer …`):
`/api/internal/assignments` and `/api/internal/notifications`. Messages from website
actions can therefore lag up to a minute; messages triggered by WhatsApp replies and
by checkout go out immediately.

## Admin's one-time Meta setup (he does these; we can't)

1. business.facebook.com → create a Business portfolio.
2. developers.facebook.com → Create app (Business) → add **WhatsApp**.
3. WhatsApp → API Setup → **Add phone number** → the new number, display name
   "MakeYourCakes", verify by SMS/voice OTP.
4. WhatsApp Manager → add a payment method.
5. Business settings → System users → create one, assign the app + WhatsApp account,
   generate a non-expiring token with `whatsapp_business_messaging` and
   `whatsapp_business_management` → `WHATSAPP_ACCESS_TOKEN`.
6. App → Basic → App secret → `WHATSAPP_APP_SECRET`. Add the site's privacy policy URL;
   switch the app to **Live**.
7. WhatsApp → Configuration → Webhook: `https://<site>/api/whatsapp/webhook`, the
   verify token, subscribe to **messages**.
8. WhatsApp Manager → Message templates → create the three templates above.

Business verification isn't needed to start; the unverified limit (250 recipients/day)
is far above a few vendors plus the admin.

## Errors

- **WhatsApp not configured** → nothing queued, site behaves exactly as today.
- **Send fails** (Meta down, bad token) → existing outbox backoff, up to 8 attempts,
  then `failed` with `lastError`; logged.
- **Vendor has no phone / not on WhatsApp** → no vendor row (or Meta reports the
  failure, which we log); the offer still shows in the vendor portal and still
  expires on time; the admin's "offered to" message says "(no WhatsApp number on file)".
- **Template rejected or edited by Meta** → template names and parameter order live
  only in `lib/whatsappMessages.ts`.
- **Photo can't be loaded or converted** → the photo route serves the generated
  name-card JPEG instead, so a bad photo never blocks the offer.

## Testing

- **Unit (vitest):** `normalizePhone`; `parseInbound` (every word, payloads, ref
  extraction, junk); target picking (none / one / many); `verifySignature` (good, bad,
  missing); message builders (no newlines in params, caps, rupee formatting); photo
  URL signing.
- **Integration (scratch Postgres, existing harness):** auto-start offers the nearest
  in-stock vendor and skips out-of-stock B; reject and expiry each move to the next;
  none left → MANUAL + admin row; WhatsApp rows for vendor + admin when configured,
  none when not; inbound accept / start / ready / handover change state exactly like
  the portal; retried webhook gives one reply; foreign assignment id is refused.
- **Webhook route:** signed fixture → 200 + state change; bad signature → 401;
  verify handshake.
- **Manual, before the real number:** Meta's free test number (sends to ≤5 verified
  phones) against a Vercel preview + the demo Supabase. Full loop: order → vendor
  photo + buttons → Accept → Started → admin feed.

## Rollout

1. Ship with all new flags unset: no behaviour change in production.
2. Admin completes the Meta setup; templates approved.
3. Test end-to-end on preview + demo DB with Meta's test number.
4. Production: set WhatsApp env, check every vendor's phone, set up the pinger,
   then `ASSIGNMENT_AUTO_START=true` and `ASSIGNMENT_AUTO_REASSIGN=true`.

## Out of scope

Customer WhatsApp updates; admin commands over WhatsApp (assigning by reply);
reading chats on the new number in the WhatsApp app; stock updates over WhatsApp;
languages other than English.
