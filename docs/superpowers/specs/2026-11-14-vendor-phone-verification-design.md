# Bakery WhatsApp number verification

Date: 2026-11-14. Status: design approved in chat, awaiting review of this written spec.

## Problem

Order offers, Accept buttons and every bakery update go to `Vendor.phone` on WhatsApp. Only the admin sets that number, in `/admin/vendors` (`app/admin/vendors/VendorForms.tsx` → `addVendor` / `saveVendor` in `app/admin/actions.ts`). Today it is only checked for format (`indianMobile`). A mistyped number means the bakery silently never gets offers.

## Goal

When the admin adds or changes a bakery's number, it is saved only after a 6-digit code sent to that number on WhatsApp has been typed back.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Method | The admin taps **Send code**, the bakery reads the WhatsApp code back (usually on the onboarding call), the admin types it, then **Save** | Reuses the Active `verify_code` template and `lib/phoneVerify.ts`. No new template, no migration. |
| Rejected | Bakery taps a "Yes, it's ours" button | Needs a new template and a `phoneVerifiedAt` migration. |
| Rejected | Bakery verifies itself in `/vendor` | The portal has no phone editing, and onboarding is done by the admin. |
| Which saves need a code | Only when the number is **added or changed**, compared in `indianMobile()` form | Re-saving a bakery's name must not demand a code. |
| Numbers saved before this ships | Left as they are | No stored "verified" flag (no migration). |
| Clearing the number | Allowed without a code | The number is optional (`Vendor.phone String?`). |
| WhatsApp not configured (local/preview) | Verification skipped | The form must keep working where no code can be sent. |

## Admin experience

On both the add-bakery and the edit-bakery forms, under **Mobile (WhatsApp)**:

1. When the field holds a valid Indian mobile that differs from the saved one (an empty saved number counts as different), a **Send code on WhatsApp** button appears.
2. Tapping it sends the code and shows a **Code from the bakery** input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`) and the line "Ask the bakery for the 6-digit code we just sent on WhatsApp."
3. **Resend code** unlocks 30 seconds after each send.
4. The admin presses the form's normal **Save**. The code is checked on the server as part of saving.
5. Errors appear as field errors on the phone field, and nothing is saved:
   - no code: "Send a code to this number and enter it to save."
   - wrong code: "That code isn't right."
   - expired: "That code has expired. Send a new one."
   - send failed: "We couldn't send the code right now. Try again in a minute."
6. Editing the number after sending drops the token, so a new code is needed.

## Server

### `sendVendorPhoneCode(phone: string)`: a new server action in `app/admin/actions.ts`

1. Same admin guard as the other vendor actions.
2. `indianMobile(phone)` null → `{ ok: false, error: "Enter a 10-digit Indian mobile number, like 98765 43210." }`.
3. `rateLimit("vendor-phone-send", normalised, { max: 5, windowSeconds: 3600 })` → `{ ok: false, error: <minutes message> }`.
4. `issueCode(normalised)` and `sendWhatsApp(normalised, verifyCodeMessage(code))` in one try. A failure is logged as `vendor_phone_code_send_failed` without the code, and the action returns the "couldn't send" message.
5. Success: `{ ok: true, token }`.

### The save rule

A pure helper in `lib/phoneVerify.ts`:

`vendorPhoneProblem(saved: string | null, next: string | null, code: string, token: string, now?: number): string | null`

- `next` null (cleared), or `indianMobile(next) === indianMobile(saved)` → `null` (no code needed).
- `whatsappConfigured()` false → `null`.
- Otherwise `checkCode(indianMobile(next), code, token, now)`:
  - `"ok"` → `null`;
  - `"wrong"` → "That code isn't right.", or "Send a code to this number and enter it to save." when `code` or `token` is empty;
  - `"expired"` → "That code has expired. Send a new one."

`addVendor` (`saved` = null) and `saveVendor` (`saved` = the vendor's current phone, read before updating) call it after `readVendorEdit` succeeds. A non-null result is returned as a field error on `phone`, the way the existing validation errors are. The form posts two hidden fields, `phoneToken` and `phoneCode`. Because the check runs inside the save action, a tampered browser form can't skip it.

`ponytail:` the send limit is the existing per-instance in-memory `rateLimit`. That's fine for an admin-only action.

## Testing

- **Unit** (`tests/phoneVerify.test.ts`), covering `vendorPhoneProblem`:
  - unchanged number, including a different spelling of the same number → null;
  - cleared → null;
  - WhatsApp off → null;
  - changed with the right code → null;
  - wrong code, expired code, and empty code or token → the exact messages above.
- **Unit**: `sendVendorPhoneCode`:
  - invalid number;
  - a successful send calls `sendWhatsApp` with `verify_code`;
  - a send failure returns the copy and doesn't log the code;
  - the 6th send in an hour is refused.

  Mock the admin guard the same way the existing admin action tests do.
- **Browser check** on a scratch DB:
  - the button appears only for a new or changed valid number;
  - Save is refused without a code;
  - with WhatsApp configured to an invalid token, the "couldn't send" message shows;
  - editing a bakery's name only doesn't ask for a code.

## Docs

In `docs/WHATSAPP.md`, the "Bakery phones" paragraph: adding or changing a bakery number in `/admin/vendors` needs the WhatsApp code the bakery receives, and numbers saved before this change aren't re-checked.

## Out of scope

Verified badge, blocking offers to unverified bakeries, re-verifying existing numbers, bakery self-service in `/vendor`.
