# Razorpay test payments at checkout

Date: 2026-10-06. Status: approved in chat, spec awaiting review.

## Why

The client's brief:

> user order → admin review and assign to nearest vendor → vendor accepts or rejects → if accepts goes through → if rejects it comes back to admin with message (reject should have message). Improve the checkout page with Razorpay, use Razorpay test keys.

Everything up to the payment already exists on this branch:

| Brief | Where it lives |
|---|---|
| User, vendor, admin accounts | `UserRole` (CUSTOMER / KITCHEN / ADMIN / VENDOR), `/account`, `/vendor`, `/admin` |
| Admin assigns nearest vendor | `app/admin/orders/QuickAssign.tsx`, `components/assignment/Map.tsx`, `lib/assignment.ts` |
| Vendor accepts or rejects | `VendorOrder` `assigned → accepted / rejected` (`lib/vendors.ts`) |
| Rejection needs a message | `app/vendor/actions.ts` refuses a decline without a reason; `respondToAssignment` refuses too |
| Rejection returns to admin with the message | Admin dashboard "Vendor responses", order page, `AdminPanel`; order goes back to the assign queue |

What is missing is money. Orders are created with `paymentStatus: "none"` and the site takes no payment.

## Goal and success criteria

A customer pays with Razorpay (test mode) before the order exists, and only a paid order reaches the admin queue.

- An order is created only after a payment whose signature the server has verified, for exactly the amount the server prices the basket at.
- Admin, vendor, kitchen and capacity code see no unpaid orders, without any of their queries changing.
- A payment that cannot become an order is refunded automatically.
- Cancelling a paid order refunds it.
- With no Razorpay keys configured, checkout behaves exactly as it does today.

## Decision: pay first, create the order after

Rejected alternative: create the order as "awaiting payment" and confirm it on payment. `createOrder` writes the admin portal event, the new-order outbox row and (via `startAssignment`) the assignment state in the same breath, and capacity counts every non-cancelled order. An unpaid row would appear in admin, hold slot capacity when abandoned, and need a filter in every admin, vendor and capacity query.

Paying first keeps the `Order` table meaning "a real order".

## Flow

1. **Customer clicks "Pay ₹X"** (replaces "Place order" when payments are on).
2. **`POST /api/payments/intent`** with the exact body `/api/orders` takes today (including `idempotencyKey`).
   - Runs the same checks as `/api/orders`: cross-site, rate limit, schema, name/phone, schedule, basket review, quoted total, slot, coverage. These move into one shared function (`lib/checkoutValidate.ts`) that both routes call, so the two can never disagree.
   - If the `CheckoutAttempt` for this key is already `completed`, returns the order (same as `/api/orders` replay) so a double click after success does not charge twice.
   - Creates a Razorpay order: `amount = review.totalPaise`, `currency = INR`, `receipt = idempotencyKey`, `notes = { payloadHash }`.
   - Upserts the `CheckoutAttempt` (status `processing`) and stores `{ razorpayOrderId, amountPaise }` in its `response` JSON. Re-calling intent for the same key, same payload and same amount reuses the stored Razorpay order instead of creating another.
   - Returns `{ keyId, razorpayOrderId, amountPaise }`.
3. **Client** loads `https://checkout.razorpay.com/v1/checkout.js` (via `next/script`, on demand) and opens the modal with `order_id`, `amount`, name `MakeMyCake`, prefill name / phone / email.
   - Modal dismissed: button returns to "Pay ₹X", message "Payment cancelled. Nothing was charged."
   - `payment.failed`: shows Razorpay's description, button re-enabled.
4. **On success**, client `POST /api/orders` with the same body plus `payment: { razorpayOrderId, razorpayPaymentId, razorpaySignature }`.
5. **`/api/orders`**, when payments are on:
   - Missing `payment` → 402 `payment_required`.
   - Signature: `HMAC_SHA256(razorpayOrderId + "|" + razorpayPaymentId, RAZORPAY_KEY_SECRET)`, compared with `crypto.timingSafeEqual`. Mismatch → 400 `payment_invalid`, no refund (an unsigned claim is not a payment we know about).
   - Replay of a completed attempt returns the order and does not refund (it is the same paid order).
   - The `CheckoutAttempt` for `idempotencyKey` must hold this `razorpayOrderId` and `amountPaise === review.totalPaise`. Otherwise → refund, 409 `payment_mismatch`.
   - `createOrder` as today, with `paymentStatus: "paid"`, `razorpayOrderId`, `razorpayPaymentId`.
   - Rule: **once a valid signature has been seen, every non-success response refunds.** That covers `createOrder` throwing (capacity filled while paying, ref exhausted, blackout, server error) and the pre-create checks failing after payment (price changed, slot unavailable, not serviceable). The response carries the original error plus `refunded: true`. Client message: "We couldn't place the order, so your payment of ₹X has been refunded. {reason}"
6. **Success screen** shows "Paid ₹X" and the payment id.

## Refunds

`lib/razorpay.ts#refund(paymentId, amountPaise)` → `POST /v1/payments/{id}/refund`. Razorpay auto-captures payments by default. If the payment is still only `authorized`, the refund call fails; the payment is left to expire, and Razorpay releases uncaptured payments on its own. Logged either way.

**On cancel.** `applyStatusTransition` (`lib/orderTransition.ts`) is the single path every cancel goes through (admin, kitchen, vendor callers). After its transaction commits with `to === "cancelled"`, if the order is `paid` with a `razorpayPaymentId`, it calls `refund` and sets `paymentStatus: "refunded"`. Network calls stay outside the database transaction. A failed refund leaves `paymentStatus: "paid"`, logs `refund_failed`, and the admin order page shows "Cancelled · payment not refunded — refund from the Razorpay dashboard".

A vendor rejection does **not** refund: the order goes back to admin to reassign, as the brief says.

## Payments off

`paymentsEnabled()` is true when both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. When false:

- `/api/payments/intent` returns 404.
- `/api/orders` ignores `payment` and creates the order with `paymentStatus: "none"`, exactly as today.
- Checkout shows "Place order" and no payment section. The page learns this from a server prop (`paymentsEnabled`, `testMode`) passed by `app/checkout/page.tsx`.

The existing e2e suite and keyless environments keep working unchanged.

## Checkout page

- **Payment section** (last form section): "Pay securely with Razorpay · UPI, cards, netbanking". In test mode, a "Test mode" badge and the hint "Card 4111 1111 1111 1111, any future expiry, any CVV · UPI success@razorpay".
- **Button**: "Pay ₹1,249" with the server-quoted total; disabled until the form is `ready` (unchanged rule); "Opening payment…" while the intent call runs; "Confirming payment…" while `/api/orders` runs.
- **Summary**: total labelled "To pay" and the line "You'll be charged once, when you pay." Error copy changes from "Nothing has been charged" to the refund-aware messages above when payments are on.
- **Order placed screen**: "Paid ₹X · pay_…" line.
- **Badges**: payment status on `/admin/orders/[ref]` and `/orders/[ref]` (Paid / Refunded). `none` shows nothing, so orders placed without payments look as they do today.

## Configuration

`.env.local` (and `.env.example` with empty values):

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

The user creates a Razorpay account, switches to Test Mode, generates keys, and writes them into `.env.local` themselves. The key id reaches the browser in the intent response; the secret never leaves the server.

## Schema

Two nullable columns on `Order`:

```prisma
razorpayOrderId   String? @unique
razorpayPaymentId String?
```

Additive and nullable, so existing rows are untouched. The only configured `DATABASE_URL` is production Supabase: the migration is generated and applied to the scratch Postgres (port 5433) for development and the demo, and applied to production only on an explicit go from the user.

## Units

| File | Does | Depends on |
|---|---|---|
| `lib/razorpay.ts` | `paymentsEnabled`, `isTestKey`, `createRazorpayOrder`, `verifySignature`, `refund`. REST via `fetch` + basic auth, `node:crypto`. No SDK. | env |
| `lib/checkoutValidate.ts` | The validation `/api/orders` does today up to `createOrder`, returning either a problem `Response` or the validated input. | existing `lib/checkout`, `lib/scheduling`, `lib/coverage` |
| `app/api/payments/intent/route.ts` | Step 2. | the two above |
| `app/api/orders/route.ts` | Uses `checkoutValidate`; payment verification and refund-on-failure around `createOrder`. | the above |
| `lib/orderTransition.ts` | Refund after a committed cancel. | `lib/razorpay` |
| `app/checkout/CheckoutForm.tsx` | Payment section, two-step submit, modal. | `/api/payments/intent`, `/api/orders` |

## Testing

- `tests/razorpay.test.ts`: signature verify accepts a signature built with the test secret, rejects a tampered payment id and a wrong-length signature; `isTestKey`; `paymentsEnabled` with and without env.
- Integration (scratch DB, Razorpay HTTP stubbed by replacing `fetch`): intent creates and reuses one Razorpay order per key; `/api/orders` with a valid signature creates a `paid` order carrying both ids; wrong signature → 400 and no order; amount mismatch → refund called, no order; capacity failure after payment → refund called; replay → no refund, same order; payments off → order `none`, no Razorpay call.
- Cancel of a paid order calls refund and sets `refunded`; refund failure leaves `paid`.
- Manual: the Razorpay modal is a cross-origin iframe and is not automated. Verified by hand in the browser with test keys: success with test card, success with `success@razorpay`, failure with `failure@razorpay`, dismissing the modal.

## Out of scope

- **Webhook** (`payment.captured`). Catches a customer who pays and closes the tab before step 4. Needs a public URL, so it cannot run on localhost. Add before going live.
- Partial refunds, saved payment methods, a payments page in `/account`, COD.
- Live keys.
