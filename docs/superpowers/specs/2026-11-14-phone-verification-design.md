# Phone verification at checkout (WhatsApp code)

Date: 2026-11-14. Status: design approved in chat, awaiting review of this written spec.

## Problem

Checkout only checks that the phone number *looks* like an Indian mobile (`phoneOk`, `lib/checkout.ts`). Every online order is paid on Razorpay before it is created, so a mistyped or someone else's number leaves the bakery holding a paid order with no way to reach the customer: no WhatsApp updates, and the delivery partner can't call.

## Goal

With the feature on, no order can be paid for (or placed, when online payment is off) until the customer has proved they receive WhatsApp messages on the number they entered.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Method | 6-digit code sent with a Meta **Authentication** template, typed back on the checkout page | What customers know from other apps; the code arrives as a notification without leaving the page; works on desktop because the code goes to the phone. About ₹0.12–0.15 + GST per code (third-party figures; Meta's rate card not checked). |
| Rejected | Customer messages us first (wa.me link) | Free and needs no approval, but the customer must leave the browser and come back. Kept as the fallback if Meta refuses the Authentication template. |
| Rejected | SMS code | Needs TRAI DLT registration and a new provider. |
| Rejected | Clerk phone verification | Doesn't cover guest checkout. |
| Rejected | Detect only (alert on undelivered confirmation) | Doesn't catch someone else's valid number, and only fires after payment. |
| Code doesn't arrive | **Block.** The customer can't pay until verified; the page shows how to reach us | Every order must have a reachable number. The env flag is the only bypass. |
| Photo-quote form | **Out of scope** | It already proves the number: the quote and Pay link reach only that WhatsApp, so a wrong number never becomes an order. |
| "For someone else" receiver's phone | Not verified | A third party can't be asked for a code. |
| Signed-in customers | Same flow as guests | One path; the remembered cookie covers repeat customers. |

## Customer experience

Only when `PHONE_VERIFICATION=on`. Contact step of `app/checkout/CheckoutForm.tsx`:

1. Once the phone field holds a valid number (`phoneOk`), a **Verify on WhatsApp** button appears under it. The pay / place-order button stays disabled until the number is verified, the same way it already waits for `contactOk`.
2. Tapping it sends the code and shows a 6-digit input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`) with a **Verify** button. Entering the sixth digit verifies without a tap.
3. Success: the input is replaced by **✓ Verified on WhatsApp** next to the number.
4. **Resend code** unlocks 30 seconds after each send. Under it: "Didn't get it? Check the number is right and has WhatsApp, or write to hello@makeyourcakes.com."
5. Errors, shown inline under the field:
   - wrong code: "That code isn't right."
   - expired: "That code has expired. Send a new one."
   - send failed (Meta error or not configured): "We couldn't send the code right now. Try again in a minute, or write to hello@makeyourcakes.com."
   - rate limited: the existing `tooMany` message.
6. Editing the phone after verifying removes the tick. The new number must be verified.
7. A verified number is remembered in this browser for 30 days. The checkout page reads the cookie on the server and passes the remembered number to `CheckoutForm` as `verifiedPhone`, so a repeat customer with the same number sees the tick straight away.

Comparison of numbers always uses the normalised form `indianMobile()` returns (`91XXXXXXXXXX`), so `98765 43210`, `+91 98765 43210` and `098765 43210` are the same number.

## Server

### WhatsApp template

`verify_code`: category **Authentication**, language `en`, **copy code** button, security disclaimer on, code expiry 10 minutes. The body is Meta's fixed text ("<code> is your verification code."). Nothing else can be customised.

`lib/whatsapp.ts`: add `"verify_code"` to the template-name union. `lib/whatsappMessages.ts`: a `verifyCodeMessage(code)` builder that returns the template with the code in both places Meta requires for copy-code templates:

```ts
components: [
  { type: "body", parameters: [{ type: "text", text: code }] },
  { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
]
```

The code is sent directly with `sendWhatsApp`, not through the notification outbox: a code is useless after 10 minutes, and the customer is waiting on the page.

### `lib/phoneVerify.ts` (new, pure functions + cookie helpers)

- `issueCode(phone)` → `{ code, token }`. `code` comes from `crypto.randomInt(0, 1_000_000)`, zero-padded to 6 digits. `token` = `${expiresAt}.${sig}`, where `expiresAt` = now + 10 min (ms) and `sig` = HMAC-SHA256(`otp:${phone}:${code}:${expiresAt}`), base64url.
- `checkCode(phone, code, token, now)` → `"ok" | "wrong" | "expired"`. Recomputes the signature with `timingSafeEqual`. A malformed token counts as `"wrong"`.
- `provenCookie(phone, now)` → cookie value `${phone}.${expiresAt}.${sig}`, where `expiresAt` = now + 30 days and `sig` = HMAC(`pv:${phone}:${expiresAt}`).
- `provenPhone(cookieValue, now)` → the phone, or null when missing, expired or tampered.
- Key: `WHATSAPP_APP_SECRET`, separated from other uses by the `otp:` / `pv:` prefixes (the same pattern as `photoSignature`). Fails closed: with no secret, nothing verifies.
- Cookie: name `myc_phone`, `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`, `maxAge` 30 days.

No code or token is stored server-side, so no migration is needed.

### `POST /api/phone/send` — body `{ phone }`

1. `crossSite` → 403.
2. `PHONE_VERIFICATION` not on → 404.
3. `indianMobile(phone)` null → 400, `field: "customerPhone"`.
4. `rateLimit("phone-send", callerKey(req), { max: 20, windowSeconds: 3600 })` and `rateLimit("phone-send-number", phone, { max: 3, windowSeconds: 3600 })` → `tooMany`.
5. `issueCode`, then `sendWhatsApp(phone, verifyCodeMessage(code))`. If it throws → 503 with the "couldn't send" message, and the error is logged (`phone_code_send_failed`, without the code).
6. 200 `{ token }`.

### `POST /api/phone/verify` — body `{ phone, code, token }`

1. `crossSite`, flag, and `indianMobile` as above.
2. `rateLimit("phone-verify", `${callerKey(req)}:${phone}`, { max: 5, windowSeconds: 600 })`.
3. `checkCode`: `"wrong"` → 400, `"expired"` → 410.
4. `"ok"` → set the `myc_phone` cookie from `provenCookie`; 200 `{ phone }`.

`ponytail:` both limits are the existing per-instance in-memory `rateLimit`, so the real ceiling is limit × warm instances. Acceptable here: guessing a 6-digit code inside 10 minutes still needs on the order of 10⁵ requests, and a successful guess only lets someone order a cake with a number that isn't theirs. Upgrade path: the Vercel Firewall rule or shared counter already named in `lib/apiGuard.ts`.

### Enforcement in `validateCheckout` (`lib/checkoutValidate.ts`)

Right after the existing `phoneOk` check, when `PHONE_VERIFICATION` is on **and** `paid` is false:

- read `myc_phone` with `cookies()` from `next/headers` (as `lib/guestOrders.ts` does)
- if `provenPhone(cookie) !== indianMobile(customerPhone)` → 422 `{ error: "Verify your number on WhatsApp to continue.", code: "phone_unverified", field: "customerPhone" }`

This covers `/api/payments/intent` (before any money moves) and `/api/orders` when online payment is off. A confirmation that already carries a payment (`paid = true`) is never refused, which keeps the existing rule that nothing but a malformed request is refused after payment. The phone check runs before the idempotent-replay lookup, so an unpaid retry without a valid cookie is asked to verify again; a paid confirmation or recovery is never refused.

The check sits in `validateCheckout`, so the two routes cannot disagree.

### Flag

`PHONE_VERIFICATION` (`on` to enable; anything else = off) is read on the server per request. `app/checkout/page.tsx` passes `phoneVerification: boolean` and `verifiedPhone: string | null` to `CheckoutForm`. Off = checkout behaves exactly as it does today, and both new routes return 404.

## Rollout

1. Admin creates `verify_code` in WhatsApp Manager under WABA **985694517174842** (not the test WABA; elsewhere sends fail with `132001`). Done on 2026-11-14: the template went Active straight away, with no Business Verification needed.
2. Deploy the code with the flag unset. No visible change.
3. When `verify_code` is **Active**, set `PHONE_VERIFICATION=on` and redeploy. Test with a real order.
4. To turn it off: unset `PHONE_VERIFICATION`.

`docs/WHATSAPP.md` gets the template (with its settings) and the flag, in the env-variable table and the template section.

## Testing

- **Unit** (`tests/phoneVerify.test.ts`): right code → ok; wrong code; expired; same code but a different phone; tampered token or signature; malformed token; cookie round trip; expired or tampered cookie → null; no secret → nothing verifies.
- **Unit** (`tests/whatsappMessages.test.ts`): `verifyCodeMessage` puts the code in the body and in button index 0.
- **Integration** (scratch Docker Postgres, never the live DB): with the flag on, `validateCheckout` refuses a request with no cookie or with a cookie for another number (`phone_unverified`), accepts a matching cookie, and accepts `paid = true` with no cookie. With the flag off, no change.
- **E2E**: the existing Playwright checkout suite runs with the flag off and must stay green.
- Manual check with the flag on, on a preview with the demo DB, before turning it on in production.

## Out of scope

Photo-quote form; the receiver's phone; SMS or call fallback; storing verified numbers on the user account; an admin view of verification attempts.
