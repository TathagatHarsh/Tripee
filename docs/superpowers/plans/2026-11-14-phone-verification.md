# Phone Verification at Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With `PHONE_VERIFICATION=on`, checkout refuses to start a payment (or place an unpaid order) until the customer has typed back a 6-digit code sent to their number on WhatsApp.

**Architecture:** Stateless. `/api/phone/send` sends the code with a Meta Authentication template and returns an HMAC token; `/api/phone/verify` checks it and sets a signed 30-day httpOnly cookie. `validateCheckout` compares that cookie with the order's number for unpaid requests. No migration, no new secret, flag off by default.

**Tech Stack:** Next.js 16 route handlers, `node:crypto` HMAC, existing `sendWhatsApp` (Cloud API v23.0), `next/headers` cookies, vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-phone-verification-design.md`

## Global Constraints

- Branch `feat/phone-verification` from **`origin/main`** (PR #67 is merged there), in its own git worktree (superpowers:using-git-worktrees). Never work on `feat/customer-whatsapp-templates`, never `git stash`, commit by explicit path. Remove the worktree when done (`git worktree remove`), since stale worktrees wedge tsc/grep in this repo.
- The only `DATABASE_URL` in `.env` is **live production**. Integration tests run only against a throwaway Docker Postgres via `ASSIGNMENT_TEST_DATABASE_URL`. No migrations, seeds or builds against `.env`.
- Flag: `PHONE_VERIFICATION === "on"` enables; anything else is off and checkout behaves exactly as today.
- Code: 6 digits, expires in **10 minutes**. Proven-number cookie: name `myc_phone`, `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`, **30 days**.
- Signing key `WHATSAPP_APP_SECRET`, prefixes `otp:` (code token) and `pv:` (cookie). Fails closed with no secret.
- Numbers are compared in `indianMobile()` form (`91XXXXXXXXXX`).
- Template `verify_code`, category Authentication, language `en`, copy-code button, security disclaimer on, expiry 10 minutes, created in WABA **985694517174842**.
- Copy (exact): "Verify on WhatsApp", "✓ Verified on WhatsApp", "Resend code", "Didn't get it? Check the number is right and has WhatsApp, or write to hello@makeyourcakes.com.", "That code isn't right.", "That code has expired. Send a new one.", "We couldn't send the code right now. Try again in a minute, or write to hello@makeyourcakes.com.", "Verify your number on WhatsApp to continue."

## Review Focus

1. **Same number, different spelling:** `+91 98765 43210` verified, then `09876543210` typed at checkout → still verified (no second code). Pinned in Task 1 (`phoneProblem` test) and Task 5 (client uses `indianMobile`).
2. **Payment already taken when the cookie is missing** (cookie cleared, other device, recovery after a lost confirm) → the paid confirmation must still be accepted. Pinned in Task 4.
3. **`cookies()` outside a request scope** (scripts, integration tests) → treated as "no cookie", never a crash. Pinned in Task 1.
4. **Meta send fails or the secret is missing** → 503 with the "couldn't send" copy, the code never logged. Pinned in Task 3.
5. **Editing the number after verifying** → the tick disappears and the pay button disables again. Checked in Task 5's browser step.

---

### Task 1: Code, token and cookie (`lib/phoneVerify.ts`)

**Files:**
- Create: `lib/phone.ts`, `lib/phoneVerify.ts`, `tests/phoneVerify.test.ts`
- Modify: `lib/whatsapp.ts` (move `normalizePhone` and `indianMobile` out, re-export them)

**Interfaces:**
- Produces (`lib/phone.ts`, no `server-only`, importable by client components): `normalizePhone(raw: string | null | undefined): string | null`, `indianMobile(raw: string | null | undefined): string | null`. These move verbatim from `lib/whatsapp.ts`; `lib/whatsapp.ts` re-exports both (`export { normalizePhone, indianMobile } from "./phone";`), so no existing import changes.
- Produces (`lib/phoneVerify.ts`, `import "server-only"`):
  - `PHONE_COOKIE = "myc_phone"`, `PROVEN_SECONDS = 30 * 86400`
  - `phoneVerificationOn(): boolean`
  - `issueCode(phone: string, now?: number): { code: string; token: string }`, throws `Error("phone_verify_no_secret")` without `WHATSAPP_APP_SECRET`
  - `checkCode(phone: string, code: string, token: string, now?: number): "ok" | "wrong" | "expired"`
  - `provenCookie(phone: string, now?: number): string`
  - `provenPhone(value: string | null | undefined, now?: number): string | null`
  - `phoneProblem(customerPhone: string, paid: boolean): Promise<Response | null>`

- [ ] **Step 1: Write the failing tests** in `tests/phoneVerify.test.ts` (`vi.mock("server-only", () => ({}))`; mock `next/headers` with a `jar` object: `cookies: async () => ({ get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) })`; `vi.stubEnv("WHATSAPP_APP_SECRET", "s")` in `beforeEach`, `vi.unstubAllEnvs()` after):

```ts
const P = "919876543210", T0 = 1_700_000_000_000;
it("round trip", () => { const { code, token } = issueCode(P, T0); expect(code).toMatch(/^\d{6}$/); expect(checkCode(P, code, token, T0 + 60_000)).toBe("ok"); });
it("wrong code", () => { const { code, token } = issueCode(P, T0); expect(checkCode(P, code === "000000" ? "000001" : "000000", token, T0)).toBe("wrong"); });
it("expired after 10 minutes", () => { const { code, token } = issueCode(P, T0); expect(checkCode(P, code, token, T0 + 10 * 60_000 + 1)).toBe("expired"); });
it("other phone", () => { const { code, token } = issueCode(P, T0); expect(checkCode("919999999999", code, token, T0)).toBe("wrong"); });
it("tampered expiry", () => { const { code, token } = issueCode(P, T0); const [, sig] = token.split("."); expect(checkCode(P, code, `${T0 + 9e9}.${sig}`, T0)).toBe("wrong"); });
it("malformed token", () => { expect(checkCode(P, "123456", "garbage", T0)).toBe("wrong"); expect(checkCode(P, "123456", "", T0)).toBe("wrong"); });
it("no secret: issue throws, nothing verifies", () => { const { code, token } = issueCode(P, T0); const c = provenCookie(P, T0); vi.stubEnv("WHATSAPP_APP_SECRET", ""); expect(() => issueCode(P, T0)).toThrow("phone_verify_no_secret"); expect(checkCode(P, code, token, T0)).toBe("wrong"); expect(provenPhone(c, T0)).toBeNull(); });
it("cookie round trip and expiry", () => { const c = provenCookie(P, T0); expect(provenPhone(c, T0 + 29 * 86400_000)).toBe(P); expect(provenPhone(c, T0 + 30 * 86400_000 + 1)).toBeNull(); });
it("tampered or missing cookie", () => { const c = provenCookie(P, T0); expect(provenPhone(c.replace(P, "919999999999"), T0)).toBeNull(); expect(provenPhone(undefined, T0)).toBeNull(); expect(provenPhone("a.b", T0)).toBeNull(); });
describe("phoneProblem", () => {
  it("flag off → null", async () => { expect(await phoneProblem("9876543210", false)).toBeNull(); });
  it("flag on, paid → null even with no cookie", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); expect(await phoneProblem("9876543210", true)).toBeNull(); });
  it("flag on, no cookie → 422 phone_unverified", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); const r = await phoneProblem("9876543210", false); expect(r!.status).toBe(422); expect(await r!.json()).toEqual({ error: "Verify your number on WhatsApp to continue.", code: "phone_unverified", field: "customerPhone" }); });
  it("flag on, cookie for the same number spelled differently → null", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); jar.myc_phone = provenCookie(P); expect(await phoneProblem("098765 43210", false)).toBeNull(); expect(await phoneProblem("+91 98765-43210", false)).toBeNull(); });
  it("flag on, cookie for another number → 422", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); jar.myc_phone = provenCookie("919999999999"); expect((await phoneProblem("9876543210", false))!.status).toBe(422); });
  it("cookies() throwing (no request scope) → treated as no cookie", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); cookiesThrow = true; expect((await phoneProblem("9876543210", false))!.status).toBe(422); });
});
```
(Reset `jar = {}` and `cookiesThrow = false` in `beforeEach`; the mock's `cookies` throws when `cookiesThrow` is set.)

- [ ] **Step 2: Run, expect FAIL** (module not found): `npx vitest run tests/phoneVerify.test.ts`

- [ ] **Step 3: Implement.**
  - Move the two functions into `lib/phone.ts` and re-export them from `lib/whatsapp.ts`.
  - In `lib/phoneVerify.ts`:
    - `sign(data)` = HMAC-SHA256 with `WHATSAPP_APP_SECRET`, base64url digest.
    - Token `${expiresAt}.${sign(`otp:${phone}:${code}:${expiresAt}`)}`, with the code from `randomInt(0, 1_000_000)` padded to 6 digits.
    - Cookie `${phone}.${expiresAt}.${sign(`pv:${phone}:${expiresAt}`)}`.
    - Compare with `timingSafeEqual` after a length check, as `safeEqual` in `lib/whatsapp.ts` does.
    - `checkCode` returns `"wrong"` before `"expired"`: only a token with a valid signature can be reported as expired.
    - With no secret, `checkCode` and `provenPhone` return `"wrong"` and `null` before signing anything.
    - `phoneProblem` returns null when the flag is off or `paid` is true. Otherwise it reads `(await cookies()).get(PHONE_COOKIE)?.value` inside try/catch (a throw counts as no cookie), and returns null only when `provenPhone(value)` is non-null and equals `indianMobile(customerPhone)`; otherwise it returns `Response.json({ error, code: "phone_unverified", field: "customerPhone" }, { status: 422 })`.

- [ ] **Step 4: Run, expect PASS:** `npx vitest run tests/phoneVerify.test.ts tests/whatsapp.test.ts tests/vendorPhone.test.ts`

- [ ] **Step 5: Commit**
```bash
git add lib/phone.ts lib/phoneVerify.ts lib/whatsapp.ts tests/phoneVerify.test.ts
git commit -m "feat: signed WhatsApp code and proven-phone cookie"
```

### Task 2: `verify_code` template builder

**Files:**
- Modify: `lib/whatsapp.ts` (template name union), `lib/whatsappMessages.ts`, `tests/whatsappMessages.test.ts`, `docs/WHATSAPP.md`

**Interfaces:**
- Produces: `verifyCodeMessage(code: string): WhatsAppMessage` in `lib/whatsappMessages.ts`.

- [ ] **Step 1: Failing test** in `tests/whatsappMessages.test.ts` (add `verifyCodeMessage` to the import):
```ts
it('verifyCodeMessage: code in body and copy-code button 0', () => {
  const m = verifyCodeMessage('042917');
  expect(m).toEqual({ type: 'template', name: 'verify_code', components: [
    { type: 'body', parameters: [{ type: 'text', text: '042917' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '042917' }] },
  ] });
});
```
- [ ] **Step 2: Run, expect FAIL:** `npx vitest run tests/whatsappMessages.test.ts`
- [ ] **Step 3: Implement.** Add `"verify_code"` to the `name` union in `lib/whatsapp.ts`; add the builder.
- [ ] **Step 4: Docs.** In `docs/WHATSAPP.md`, add a "Verification code template" subsection after "Customer templates":
  - name `verify_code`, category **Authentication**, language English, **Copy code** button, "Add security recommendation" on, "Add expiry time" 10 minutes. The body is Meta's fixed text and has no variables to fill.
  - It must be created in WABA 985694517174842.
  - Meta may ask for Business Verification before allowing Authentication templates.
  - Turn on `PHONE_VERIFICATION` only once it is **Active**.

  In step 8 of the admin setup, change "nine templates" to "ten templates".
- [ ] **Step 5: Run, expect PASS**, then commit:
```bash
git add lib/whatsapp.ts lib/whatsappMessages.ts tests/whatsappMessages.test.ts docs/WHATSAPP.md
git commit -m "feat: verify_code WhatsApp authentication template"
```

### Task 3: `/api/phone/send` and `/api/phone/verify`

**Files:**
- Create: `app/api/phone/send/route.ts`, `app/api/phone/verify/route.ts`, `tests/phoneRoutes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`issueCode`, `checkCode`, `provenCookie`, `PHONE_COOKIE`, `PROVEN_SECONDS`, `phoneVerificationOn`, `indianMobile`), Task 2 (`verifyCodeMessage`), `crossSite`/`CROSS_SITE_MESSAGE`/`rateLimit`/`callerKey`/`tooMany` from `lib/apiGuard.ts`, `sendWhatsApp`, `log`.
- Produces (HTTP, used by Task 5):
  - `POST /api/phone/send {phone}` → 200 `{ token }` | 400 `{ error, field: "customerPhone" }` | 403 | 404 | 429 | 503 `{ error }`
  - `POST /api/phone/verify {phone, code, token}` → 200 `{ phone }` and sets `myc_phone` | 400 `{ error: "That code isn't right." }` | 410 `{ error: "That code has expired. Send a new one." }` | 403 | 404 | 429

- [ ] **Step 1: Failing tests** in `tests/phoneRoutes.test.ts`. Mock `server-only`, `@/lib/log`, and `@/lib/whatsapp`'s `sendWhatsApp` (keep the real `indianMobile`); stub `WHATSAPP_APP_SECRET` and `PHONE_VERIFICATION=on`. Give each request a unique `x-forwarded-for`, as `customRequestRoute.test.ts` does.
  - send: flag off → 404; `"12345"` → 400 with `field: "customerPhone"`; valid → 200 with a token, and `sendWhatsApp` called once with `("919876543210", { name: "verify_code", … })`; `sendWhatsApp` rejecting → 503 with the exact "couldn't send" copy, and `log` never receives the code (assert no logged argument contains the 6-digit code); the 4th send to the same number within the hour (from different IPs) → 429; `origin: https://evil.example` → 403.
  - verify: take the code from the `sendWhatsApp` mock's call, then the right code → 200 with a `set-cookie` header containing `myc_phone=`, `HttpOnly`, `Max-Age=2592000` and `SameSite=lax` (match case-insensitively); wrong code → 400 with the exact copy; an expired token (use `vi.setSystemTime` 11 minutes later) → 410; the 6th wrong try within 10 minutes → 429.
- [ ] **Step 2: Run, expect FAIL:** `npx vitest run tests/phoneRoutes.test.ts`
- [ ] **Step 3: Implement.**
  - Follow the order in spec §"POST /api/phone/send" and §"POST /api/phone/verify".
  - Rate-limit buckets: `phone-send` (caller, 5/3600s), `phone-send-number` (normalised phone, 3/3600s), `phone-verify` (`${caller}:${phone}`, 5/600s).
  - `issueCode` and `sendWhatsApp` sit in one try; the catch logs `phone_code_send_failed` with only `error.message`.
  - Set the cookie with `(await cookies()).set(PHONE_COOKIE, provenCookie(phone), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: PROVEN_SECONDS })`.
  - Put `// ponytail: per-instance rateLimit; Vercel Firewall or a shared counter if guessing is ever seen` above the verify limit.
  - Bodies are read with `req.json()` in a try (a bad body → 400).
- [ ] **Step 4: Run, expect PASS**, then commit:
```bash
git add app/api/phone/send/route.ts app/api/phone/verify/route.ts tests/phoneRoutes.test.ts
git commit -m "feat: send and verify WhatsApp phone codes"
```

### Task 4: Enforce in `validateCheckout`

**Files:**
- Modify: `lib/checkoutValidate.ts` (immediately after the `if (!phoneOk(customerPhone))` block, ~line 174)
- Test: `tests/delivery.integration.test.ts` (inside `describe('checkout against the delivery rules')`)

**Interfaces:**
- Consumes: `phoneProblem(customerPhone, paid)` from Task 1.

- [ ] **Step 1: Failing test.** Add to `tests/delivery.integration.test.ts`, reusing its `basket()` and `today` helpers:
```ts
it('refuses an unverified number before payment, never after', async () => {
  vi.stubEnv('PHONE_VERIFICATION', 'on');
  const unpaid = await validateCheckout(basket('standard', today, 'x'), 'test', false);
  expect(unpaid.kind).toBe('problem');
  if (unpaid.kind === 'problem') expect((await unpaid.response.json()).code).toBe('phone_unverified');
  const paid = await validateCheckout(basket('standard', today, 'x'), 'test', true);
  expect(paid.kind === 'problem' && (await paid.response.clone().json()).code === 'phone_unverified').toBe(false);
  vi.unstubAllEnvs();
});
```
(No `next/headers` mock: `cookies()` outside a request throws, which `phoneProblem` treats as no cookie. That is Review Focus 3, end to end.)
- [ ] **Step 2: Run against a scratch DB, expect FAIL.** Start a throwaway Postgres (`docker run -d --rm -p 55432:5432 -e POSTGRES_PASSWORD=pw postgres:latest`), then run `ASSIGNMENT_TEST_DATABASE_URL=postgresql://postgres:pw@localhost:55432/postgres npx prisma migrate deploy`, then `ASSIGNMENT_TEST_DATABASE_URL=… npx vitest run tests/delivery.integration.test.ts`. Never use `.env`'s URL.
- [ ] **Step 3: Implement:** `const phoneRefusal = await phoneProblem(customerPhone, paid); if (phoneRefusal) return problem(phoneRefusal);`
- [ ] **Step 4: Run, expect PASS.** Also run `npx vitest run` (the unit suite) with the flag unset: it must stay green.
- [ ] **Step 5: Commit**
```bash
git add lib/checkoutValidate.ts tests/delivery.integration.test.ts
git commit -m "feat: checkout requires a WhatsApp-verified number when enabled"
```

### Task 5: Checkout UI

**Files:**
- Create: `components/shop/PhoneVerify.tsx`
- Modify: `app/checkout/page.tsx` (props), `app/checkout/CheckoutForm.tsx` (`Props`, `contactOk`, the Phone `Field` ~line 601, `fail` for `phone_unverified`), `.env.example` (`PHONE_VERIFICATION=`), `docs/WHATSAPP.md` (env table row)

**Interfaces:**
- Consumes: Task 3 HTTP contract; `indianMobile` from `lib/phone.ts` (client-safe).
- Produces: `PhoneVerify({ phone, verified, onVerified }: { phone: string; verified: boolean; onVerified: (normalised: string) => void })`, a client component.
- `Props` gains `phone: { required: boolean; verified: string | null }`.

- [ ] **Step 1: Page.** In `app/checkout/page.tsx` (it already calls `connection()`), read `provenPhone((await cookies()).get(PHONE_COOKIE)?.value)` and pass `phone={{ required: phoneVerificationOn(), verified }}`.
- [ ] **Step 2: Form state.**
  - In `Checkout`: `const [verifiedPhone, setVerifiedPhone] = useState(phone.verified)` and `const phoneVerified = !phone.required || (indianMobile(draft.phone) !== null && indianMobile(draft.phone) === verifiedPhone)`.
  - `contactOk` also requires `phoneVerified`.
  - At line ~1066, the hint that explains why the button is disabled gains a "verify your number" case.
  - In `fail`, `code === "phone_unverified"` clears `verifiedPhone` (the cookie expired server-side) and shows the server's error.
- [ ] **Step 3: Field.** Below the existing helper text, when `phone.required && phoneOk(draft.phone)`, render `<PhoneVerify phone={draft.phone} verified={phoneVerified} onVerified={setVerifiedPhone} />`. It sits outside the `<form>` submit path, and its buttons are `type="button"`.
- [ ] **Step 4: `PhoneVerify`** follows spec §"Customer experience" items 1–6, using the exact copy from Global Constraints.
  - States: idle → sending → code entry (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, `pattern="\d{6}"`, labelled "WhatsApp code") → verified.
  - The sixth digit auto-submits.
  - Resend is disabled for 30 s, with a visible countdown.
  - Errors use `role="alert"`.
  - A change in `phone` resets it to idle and drops the token.
  - Style it with the existing `sField()` and Field patterns in `CheckoutForm.tsx`.
- [ ] **Step 5: Static checks:** `npm run typecheck && npm run lint && npx vitest run` → all green.
- [ ] **Step 6: Browser check.**
  - Start a dev server **against the scratch DB** from Task 4 (memory: `.next/cache` is shared; use a separate dist dir or a fresh worktree) with `PHONE_VERIFICATION=on`.
  - Stub delivery by temporarily setting `WHATSAPP_ACCESS_TOKEN` to an invalid value, so the "couldn't send" path shows. Or, with Meta's test number configured, check a real code arrives.
  - Check:
    - (a) the button appears only for a valid number;
    - (b) pay stays disabled until verified;
    - (c) a failed send shows the exact copy;
    - (d) with a real code, ✓ appears and pay enables;
    - (e) editing the number removes the tick (Review Focus 5);
    - (f) a reload keeps the tick (cookie);
    - (g) with the flag unset, checkout looks exactly as before.
  - Screenshot (d) and (g) for the PR.
- [ ] **Step 7: Commit**
```bash
git add components/shop/PhoneVerify.tsx app/checkout/page.tsx app/checkout/CheckoutForm.tsx .env.example docs/WHATSAPP.md
git commit -m "feat: verify the phone on WhatsApp at checkout"
```

### Finish

- [ ] `npm run typecheck && npm run lint && npx vitest run`, plus every `*.integration.test.ts` against the scratch DB → green. `npm run e2e` against the scratch DB with the flag unset → green.
- [ ] Stop the scratch container; remove the worktree after the PR is opened.
- [ ] PR to `TathagatHarsh/Tripee` (`--repo TathagatHarsh/Tripee`). The body lists the rollout from the spec: create `verify_code` → deploy with the flag unset → set `PHONE_VERIFICATION=on` once it is Active.
