# Bakery WhatsApp Number Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `/admin/vendors`, adding or changing a bakery's number saves only after the 6-digit WhatsApp code sent to it is typed back.

**Architecture:** A pure save rule `vendorPhoneProblem` in `lib/phoneVerify.ts`, a new admin server action `sendVendorPhoneCode`, and the existing `addVendor`/`saveVendor` actions call the rule. The form gains a small client component. No migration, no new template.

**Tech Stack:** Next.js 16 server actions, `lib/phoneVerify.ts` (`issueCode`, `checkCode`), `verifyCodeMessage`, `sendWhatsApp`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-vendor-phone-verification-design.md`

## Global Constraints

- Work only in the `feat/vendor-phone-verification` worktree. Never `git stash`. Commit by explicit path. Never run migrations, seeds, builds or integration tests against `.env` (live production DB).
- Numbers are compared in `indianMobile()` form.
- Copy (exact):
  - "Send code on WhatsApp", "Resend code", "Code from the bakery";
  - "Ask the bakery for the 6-digit code we just sent on WhatsApp.";
  - "Send a code to this number and enter it to save.";
  - "That code isn't right.", "That code has expired. Send a new one.";
  - "We couldn't send the code right now. Try again in a minute.";
  - "Enter a 10-digit Indian mobile number, like 98765 43210."
- Send limit: bucket `vendor-phone-send`, keyed by the normalised number, 5 per 3600s.
- Errors follow the existing vendor-action pattern: `{ ok: false, message }` (the spec's "field error" means this message).

## Review Focus

1. A different spelling of the saved number (`098765 43210` vs stored `+91 98765 43210`) → no code required. Pinned in Task 1.
2. A tampered form that omits `phoneCode` and `phoneToken` while changing the number → refused on the server. Pinned in Task 1.
3. A name-only edit of a bakery that has a number → saves with no code. Pinned in Task 1 and checked in Task 2.
4. WhatsApp not configured → the form saves as it does today. Pinned in Task 1.
5. The code never appears in logs. Pinned in Task 1.

---

### Task 1: Save rule, send action, enforcement

**Files:**
- Modify: `lib/phoneVerify.ts`, `tests/phoneVerify.test.ts`, `app/admin/actions.ts` (`addVendor` ~1217, `saveVendor` ~1235, plus the new action)
- Create: `tests/vendorPhoneVerify.test.ts` (send action + add/save enforcement)

**Interfaces:**
- Produces:
  - `vendorPhoneProblem(saved: string | null, next: string | null, code: string, token: string, now?: number): string | null` in `lib/phoneVerify.ts`.
  - `sendVendorPhoneCode(phone: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>`, exported from `app/admin/actions.ts`, behind `requireAdmin()`.
- The form posts the hidden fields `phoneToken` and `phoneCode`.

- [ ] **Step 1: Write failing tests.**
  - For `vendorPhoneProblem`, cover the spec §"The save rule" cases with exact copy:
    - unchanged, including a different spelling → null;
    - cleared (`next` null) → null;
    - `whatsappConfigured()` false (no `WHATSAPP_ACCESS_TOKEN`) → null;
    - right code → null;
    - wrong code → "That code isn't right.";
    - expired → "That code has expired. Send a new one.";
    - empty code or token → "Send a code to this number and enter it to save.".
  - For the actions (mock `requireAdmin`, `db`, `sendWhatsApp` and `log`, following the mocking style in `tests/closedDays.test.ts`):
    - send action: invalid number → the exact error;
    - send action: a successful send calls `sendWhatsApp` with `verify_code` to the `91…` number and returns a token;
    - send action: a send failure returns the "couldn't send" copy, and `log` never receives the code;
    - send action: the 6th send to one number → refused;
    - `addVendor` with a number and no code → `{ ok: false, message: "Send a code to this number and enter it to save." }` and `db.vendor.create` not called;
    - `saveVendor` changing the name only (same number) → saves;
    - `saveVendor` changing the number with a valid token and code → saves.
- [ ] **Step 2: Run, expect FAIL:** `npx vitest run tests/phoneVerify.test.ts tests/vendorPhoneVerify.test.ts`
- [ ] **Step 3: Implement.**
  - The rule follows spec §"The save rule".
  - The action follows spec §"sendVendorPhoneCode". Its "minutes" error is "Too many codes sent to this number. Please wait about N minutes and try again." ("a minute" when N is 1).
  - In `saveVendor`, read the current `phone` with `db.vendor.findUnique({ where: { id }, select: { phone: true } })` before updating.
  - Call the rule after `readVendorEdit` succeeds, with `next` = `parsed.data.phone`.
- [ ] **Step 4: Run, expect PASS.** Then `npx vitest run`, `npx tsc --noEmit`, `npx eslint lib app/admin tests`.
- [ ] **Step 5: Commit** `feat: bakery numbers need the WhatsApp code to save`

### Task 2: Admin form UI + docs

**Files:**
- Create: `app/admin/vendors/VendorPhoneVerify.tsx` (client)
- Modify: `app/admin/vendors/VendorForms.tsx` (phone field, both forms), `docs/WHATSAPP.md` ("Bakery phones" paragraph, per spec §Docs)

**Interfaces:**
- Consumes `sendVendorPhoneCode` and the hidden fields `phoneToken` / `phoneCode` from Task 1.
- `indianMobile` comes from `@/lib/phone` (client-safe).

- [ ] **Step 1: Implement** the spec §"Admin experience" items 1–6.
  - The component takes the live phone value and the saved phone. It shows nothing unless `indianMobile(value)` is non-null and differs from `indianMobile(saved)`.
  - It renders the hidden `phoneToken` / `phoneCode` inputs inside the form.
  - Buttons are `type="button"`. Enter in the code input must not submit the form before a code is typed; once 6 digits are in, Enter submitting Save is fine.
  - Resend has a 30s countdown. Editing the number resets the component (`key` on the normalised number).
  - Errors use `role="alert"`.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint app/admin/vendors`, `npx vitest run` → green.
- [ ] **Step 3: Commit** `feat: send-code step on the bakery number field`

### Finish

- [ ] Whole-branch review. Push, then open a PR to `TathagatHarsh/Tripee` (`--repo TathagatHarsh/Tripee`).
