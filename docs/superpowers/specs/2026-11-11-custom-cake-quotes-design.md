# Custom cake quotes over WhatsApp — design

Date: 2026-11-11 · Status: approved in chat, awaiting spec review

## Goal

A customer who wants a custom cake fills in one form on `/custom-cakes` and is
told "We'll contact you shortly on WhatsApp". The nearest bakery quotes a price
on WhatsApp, the customer gets that price plus our margin on WhatsApp, pays in
full on our site, and the request becomes a normal order already assigned to
that bakery.

MakeYourCakes is the middleman. The customer and the bakery only ever talk to
our WhatsApp business number. Before payment neither side sees the other's
name, phone number or street address.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Price the customer sees | Bakery quote + fixed margin (default 15%), rounded **up** to the next ₹10. The bakery never sees the customer price. |
| "How much I want" | Size in kg (required) + optional budget, plus flavour and the message on the cake. |
| Customer doesn't like the price | Two buttons: **Pay now** / **Not for me**. "Not for me" and any typed text go to the admin, never to the bakery. No negotiation in the bot. |
| Payment | 100% upfront through Razorpay, like normal orders. |
| Architecture | New `CustomRequest` record for the quote stage, which becomes a normal `Order` once paid. |

Out of scope: counter-offers, part payments, collecting several quotes at once,
customer↔bakery chat, editing a quote after it is sent.

## Flow

```
customer form ─► CustomRequest(awaiting_quote) ─► custom_offer template ─► nearest bakery
                                                                             │ replies "1800"
                         ┌── no reply in 60 min / "Can't do it" ◄────────────┤
                         ▼                                                   ▼
               next-nearest bakery (max 3)                       CustomRequest(quoted)
                         │ none left                          custom_quote template ─► customer
                         ▼                                       │                 │
               no_bakery → admin alert                     Pay now            Not for me / text
                                                                 ▼                 ▼
                                                    /c/<token> Razorpay      forwarded to admin
                                                                 ▼
                                         Order + accepted VendorOrder, CustomRequest(paid)
                                                                 ▼
                                         existing started / ready / handed-over flow
```

## 1. Customer form

- On `/custom-cakes`, "Send us your cake photo" opens a sheet (the same
  `<dialog>`/`.s-sheet` pattern as `CustomEnquiry`) with:
  - a cake photo (required; same type and size limits as `lib/imageSpec`)
  - size: 0.5 / 1 / 1.5 / 2 / 3 / 4 / 5 kg
  - an optional budget in rupees
  - flavour (free text, short)
  - the message on the cake (optional)
  - delivery date and time slot
  - delivery address, using the checkout address/map picker (`LocatedAddress`)
  - name and WhatsApp number (must pass `indianMobile`)
  - a consent tick box: "OK to message me on WhatsApp about this cake" (required)
- `POST /api/custom-requests` (multipart):
  - rate-limited per IP with the existing `rateLimit` from `lib/apiGuard`
  - validates with zod
  - checks the address is deliverable (the same serviceability check as checkout) and the date respects the lead time
  - stores the photo through `lib/storage.ts`
  - creates the `CustomRequest`, then kicks off the first offer in the background (like checkout's `after()` work)
- Success screen: **"Thanks! We'll contact you shortly on WhatsApp."** with the
  `CR-` reference.
- When WhatsApp is not configured (`whatsappConfigured()` false), the page keeps
  today's `wa.me` button instead of the form.

## 2. Bakery offer and quote

**Who gets the offer:** the nearest active bakery that has a location set and
hasn't already been tried. This uses the same distance and eligibility rules as
`assignmentCandidates`, factored into a helper both callers share; it is not a
copy.

**The offer message.** New template `custom_offer`:
- header: the cake photo, using the stored image link (already a public link nobody can guess)
- body: ref, size, flavour, message on the cake, delivery date and time, area (locality only), and the budget or "no budget given"
- quick-reply button: **Can't do it**, payload `cq_no:<requestId>`
- footer text: "Reply with your price, e.g. 1800"

**Reading the reply.** In `handleInbound`, before the existing order commands:
- A bakery message that is mostly a rupee amount (`1800`, `₹1,800`,
  `Rs 1800`, `1800 CR-1234`) is a quote for that bakery's one open offer. With
  more than one open offer and no ref, reply asking for the ref, the same way
  orders do.
- Accepted range is ₹100–₹1,00,000; anything outside it gets "Please send the
  price in rupees, e.g. 1800."
- `cq_no:<id>` (or the typed words "can't do it" / "no" with a `CR-` ref) is a
  decline.
- Reuses the `WhatsAppCommand` once-only key so a re-delivered webhook is never
  applied twice.

**Timeouts and fallback.**
- An offer lasts 60 minutes (`CUSTOM_OFFER_MINUTES`, default 60).
- On a decline or a timeout, the next bakery is offered.
- After 3 bakeries, or when none are left, the status becomes `no_bakery` and the
  admin numbers get an `order_update`-style alert with the ref and customer phone.
- Timeouts are processed by the existing `/api/internal/assignments` pinger,
  which also calls `runCustomRequestWorker()`.

**Replies to the bakery.**
- On a quote: "✅ Quote ₹1,800 sent for CR-1234. We'll tell you if the customer pays."
- On a timeout: "CR-1234 has been passed on."

## 3. Customer quote

- `quotePaise = ceil(vendorQuotePaise × (1 + margin) / 1000) × 1000`, which
  rounds up to the next ₹10. Margin comes from `BakerySettings.customMarginPct`
  (new field, default 15).
- New template `custom_quote` to the customer:
  - header: their photo
  - body: ref, size, delivery time, price
  - URL button **Pay now** → `/c/<token>`
  - quick reply **Not for me**, payload `cq_decline:<requestId>`
- The quote is valid for 24 hours (`quoteExpiresAt`), or until the delivery
  lead time would be missed, whichever is sooner.
- **Customer replies.** `handleInbound` checks, before the "this number is for
  bakery partners" reply, whether the sender's number has a request in
  `quoted`/`awaiting_quote`:
  - "Not for me" sets `declined` and tells the customer "No problem — our team may
    message you."
  - Any other text: the admin numbers get "Customer on CR-1234 says: …"
  - In both cases the admin is notified, and the bakery is told nothing beyond
    "the customer passed on CR-1234".

## 4. Payment becomes an order

- `/c/<token>` is a public page with an unguessable token (`randomBytes(24)`,
  base64url). It shows the photo, the details, the price and when the quote
  expires, plus a Pay button. Expired, declined, cancelled or paid requests show
  a matching message instead of the button.
- Payment reuses `openPaymentIntent` with the key `custom:<requestId>` and the
  Razorpay checkout script already used by `CheckoutForm`.
- On a verified payment (client callback **or** the existing Razorpay webhook,
  whichever comes first; `recoverPayment` sends receipts starting `custom:` here
  instead of to checkout recovery), one transaction, guarded by an advisory lock on the
  request:
  1. Re-read the request. If it is not `quoted`, or the quote has expired → mark the payment
     for refund through the existing `refundPayment` and stop.
  2. Create an `Order`:
     - total = `quotePaise`, paid
     - due time, address, name and phone from the request
     - one `OrderItem` "Custom cake (size)", with the photo and the message on the cake
     - status `confirmed`
  3. Create a `VendorOrder` for the quoting bakery with `assignmentStatus ACCEPTED`, and set it as
     `currentAssignment`. Set its money fields, which vendor earnings already read:
     - `orderValuePaise = quotePaise`
     - `vendorEarningPaise = vendorQuotePaise`
     - `commissionPaise = quotePaise − vendorQuotePaise`
     - `feePaise = 0`
  4. Set the request to `paid` and store `orderId`.
- After the transaction:
  - the bakery gets "✅ Customer paid — CR-1234 is now order MC-xxxx" through
    `acceptedMessage` (Started button)
  - the customer gets the normal order confirmation
  - the admin gets the normal new-order alert
- From here on it is an ordinary order: panels, status buttons, refunds and earnings.

## Data model (one additive migration)

```prisma
enum CustomRequestStatus { awaiting_quote quoted paid declined expired no_bakery cancelled }

model CustomRequest {
  id               String              @id @default(cuid())
  ref              String              @unique          // CR-1234
  token            String              @unique          // /c/<token>
  status           CustomRequestStatus @default(awaiting_quote)
  name             String
  phone            String                               // normalized, 91XXXXXXXXXX
  photoUrl         String
  sizeKg           Decimal             @db.Decimal(4, 1)
  budgetPaise      Int?
  flavour          String
  cakeMessage      String?
  dueAt            DateTime
  address          Json                                 // LocatedAddress
  vendorId         String?                              // bakery currently offered / that quoted
  vendor           Vendor?             @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  triedVendorIds   String[]
  offerExpiresAt   DateTime?
  vendorQuotePaise Int?
  quotePaise       Int?
  quoteExpiresAt   DateTime?
  orderId          String?             @unique
  order            Order?              @relation(fields: [orderId], references: [id], onDelete: SetNull)
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  @@index([status, offerExpiresAt])
  @@index([phone, status])
}
```

Two more changes ride along in the same migration:
- `BakerySettings.customMarginPct Int @default(15)`.
- `NotificationOutbox.orderId` becomes nullable, with a new nullable `customRequestId`
  plus a `custom_request` `NotificationKind`, so quote-stage messages get the
  same retry/once-only delivery as order messages. Relaxing `NOT NULL` is safe
  on existing rows. Prod migration is run by the user, per the usual process.

## Admin

`/admin/custom-requests` shows a list, newest first:
- ref, status, photo thumbnail, customer name and phone
- current or quoting bakery, bakery quote, customer price
- link to the order once paid

Each row has a **Cancel** action (sets `cancelled`, tells the bakery if it is
currently offered). The page appears in the admin nav. Nothing more for v1;
manual follow-up happens on the admin's own WhatsApp.

## Errors and edge cases

- **The same webhook arrives twice:** `WhatsAppCommand` key, plus outbox `dedupeKey`.
- **A late quote** (the offer expired or moved on): "That request isn't waiting on you any more."
- **Payment after expiry, cancellation, or a second payment:** refund through
  existing code; the page shows "This quote is no longer available".
- **The customer's number isn't on WhatsApp:** the outbox row ends `failed`; the
  admin list shows "message failed" so the admin can call.
- **The bakery that quoted is deactivated before the customer pays:** the payment
  transaction checks the bakery is still active. If not, the payment is refunded,
  the request is marked `cancelled` and the admin is alerted.
- **Customer privacy:** the bakery sees the locality only until payment. After
  payment it sees what it sees for any order.

## Meta setup (user)

Two new templates in the live WABA, created and approved like the existing three:
- `custom_offer` (utility; image header; 7 body variables; one quick-reply button)
- `custom_quote` (utility; image header; 4 body variables; URL button with a
  dynamic suffix `/c/{{1}}`; one quick-reply button)

The final wording goes into `docs/WHATSAPP.md` next to the others.

## Testing

- **Unit** (vitest):
  - reading a quote out of a reply (`1800`, `₹1,800`, `Rs. 1,800 CR-12`, junk)
  - margin rounding
  - the request state transitions, including which moves are allowed
  - token generation
- **Integration** (scratch Postgres):
  - submit → offer → quote → pay → `Order` + accepted `VendorOrder`
  - decline, then timeout, then the next bakery, then `no_bakery`
  - customer "Not for me" goes to the admin
  - payment after expiry → refund path
- **Build and typecheck** against the scratch DB before the PR, per the usual process.
