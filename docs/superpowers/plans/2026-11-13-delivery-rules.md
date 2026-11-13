# Delivery Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five placeholder delivery slots with the client's model: ASAP or a scheduled window, ready-made 2–4 h, custom 3–4 h, orders taken 08:00–18:00 IST, ₹150 flat fee, all editable by the admin.

**Architecture:** A pure rule engine (`lib/deliveryRules.ts`) decides what is offered and checks what was chosen, using rules from a new `DeliverySettings` singleton loaded into the existing catalogue snapshot. Two new slot values, `asap` and `scheduled`, go through the existing slot/fee plumbing via synthetic snapshot entries. Legacy slots stay readable but can't be chosen for new orders.

**Tech Stack:** Next.js 16 (app router, server actions), Prisma + Postgres, zod, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-delivery-rules-design.md`

## Global Constraints

- All times are IST (`+05:30`), whatever the server's TZ. Never use `Date#getHours()` / local-time methods.
- Defaults: fee 15000 paise; orders 08:00–18:00; ready 120–240 min; custom 180–240 min; window 120 min; pre-order 14 days.
- Customer-facing slot names: `"As soon as possible"`, `"Scheduled"`.
- Legacy slot values (`standard`, `same-day`, `express-4hr`, `midnight`, `pickup`) stay in `DeliverySlot` and still render and price on existing orders.
- `PICKUP_OPEN` stays `false`.
- **Never run a migration or any write against the live `DATABASE_URL`** (production Supabase). Migrations and integration/e2e tests run against the throwaway Postgres container only. The user runs `migrate deploy` on production.
- Git: `git status`/`git diff` can hang in this repo. Commit by explicit path (`git add <paths> && git commit -m … -- <paths>`). Never `git stash`.
- After code changes: `graphify update .`

## Review Focus

1. **Customer submits after the window passed** (sat on checkout past 18:00, or past a window's start minus the minimum). The server refuses with a plain message and the form stays usable. Test: Task 3 `refuses an ASAP order arriving at 18:00:01`.
2. **Customer changes the window after a failed attempt.** The idempotency intent must differ, or the old order replays with the old window. Test: Task 3 `checkoutIntent differs when the scheduled window differs`.
3. **Server running in UTC** (Railway). IST windows must still be right. Test: Task 1 asserts exact ISO instants, and the test file sets `process.env.TZ = "UTC"`.
4. **Admin enters nonsense** (until ≤ from, min > max). The form refuses and names the field. Test: Task 7 `rejects ordersUntil before ordersFrom` and `rejects min above max`.
5. **A paid-but-unfinished checkout from before the switch** (legacy slot in `CheckoutAttempt`). Payment recovery must still create the order. Test: Task 3 `recovery of a legacy-slot attempt is not refused`.

---

### Task 1: Rule engine

**Files:**
- Create: `lib/deliveryRules.ts`
- Test: `tests/deliveryRules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CakeKind = "ready" | "custom";
  export interface DeliveryRules {
    feePaise: number; ordersFrom: string; ordersUntil: string; // "HH:MM"
    readyMinMinutes: number; readyMaxMinutes: number;
    customMinMinutes: number; customMaxMinutes: number;
    windowMinutes: number; preorderDays: number;
  }
  export const DEFAULT_DELIVERY_RULES: DeliveryRules; // the Global Constraints defaults
  export interface Window { start: Date; end: Date; label: string } // label "10:00–12:00" (en dash)
  export function deliveryChoices(now: Date, kind: CakeKind, rules: DeliveryRules, closedDays?: ReadonlySet<string>):
    { asap: Window | null; days: { date: string; windows: Window[] }[] };
  export type DeliveryChoice = { slot: "asap" } | { slot: "scheduled"; date: string; window: string };
  export type ChoiceVerdict =
    | { ok: true; requestedFor: Date; dueAt: Date; window: string }
    | { ok: false; message: string };
  export function checkChoice(choice: DeliveryChoice, now: Date, kind: CakeKind, rules: DeliveryRules): ChoiceVerdict;
  export function istDate(d: Date): string; // "YYYY-MM-DD" in IST
  ```
  `closedDays` holds IST dates (`"YYYY-MM-DD"`). `checkChoice` doesn't check closed days, because `lib/placeOrder` already refuses blackouts inside its lock.

- [ ] **Step 1: Write the failing tests** in `tests/deliveryRules.test.ts` (start the file with `process.env.TZ = "UTC";`). Use `const at = (s: string) => new Date(s + "+05:30")` and `R = DEFAULT_DELIVERY_RULES`.

  ```ts
  it("offers ASAP from 08:00 up to but not including 18:00", () => {
    expect(deliveryChoices(at("2026-11-20T07:59:00"), "ready", R).asap).toBeNull();
    expect(deliveryChoices(at("2026-11-20T08:00:00"), "ready", R).asap?.label).toBe("10:00–12:00");
    expect(deliveryChoices(at("2026-11-20T17:59:00"), "ready", R).asap?.end.toISOString()).toBe("2026-11-20T16:29:00.000Z"); // 21:59 IST
    expect(deliveryChoices(at("2026-11-20T18:00:00"), "ready", R).asap).toBeNull();
  });
  it("ready-made at 15:00: ASAP 17:00–19:00, no window left today, first is tomorrow 08–10", () => {
    const c = deliveryChoices(at("2026-11-20T15:00:00"), "ready", R);
    expect(c.asap?.label).toBe("17:00–19:00");
    expect(c.days[0]).toEqual({ date: "2026-11-20", windows: [] });
    expect(c.days[1].windows.map(w => w.label)).toEqual(["08:00–10:00","10:00–12:00","12:00–14:00","14:00–16:00","16:00–18:00"]);
  });
  it("custom at 09:30: earliest start 12:30, so today's first window is 14:00–16:00", () => {
    expect(deliveryChoices(at("2026-11-20T09:30:00"), "custom", R).days[0].windows[0].label).toBe("14:00–16:00");
  });
  it("a closed day offers no ASAP and no windows", () => {
    const c = deliveryChoices(at("2026-11-20T09:00:00"), "ready", R, new Set(["2026-11-20"]));
    expect(c.asap).toBeNull();
    expect(c.days[0].windows).toEqual([]);
  });
  it("includes today + preorderDays and nothing after", () => {
    const days = deliveryChoices(at("2026-11-20T09:00:00"), "ready", R).days;
    expect(days).toHaveLength(15);
    expect(days.at(-1)!.date).toBe("2026-12-04");
  });
  it("cuts the last window at ordersUntil when the length does not divide the day", () => {
    const w = deliveryChoices(at("2026-11-20T00:00:00"), "ready", { ...R, windowMinutes: 180 }).days[0].windows;
    expect(w.map(x => x.label)).toEqual(["08:00–11:00","11:00–14:00","14:00–17:00","17:00–18:00"]);
  });
  it("checkChoice: ASAP returns now+min .. now+max", () => {
    const v = checkChoice({ slot: "asap" }, at("2026-11-20T11:00:00"), "custom", R);
    expect(v).toMatchObject({ ok: true, window: "14:00–15:00" });
    if (v.ok) expect([v.requestedFor.toISOString(), v.dueAt.toISOString()]).toEqual(["2026-11-20T08:30:00.000Z","2026-11-20T09:30:00.000Z"]);
  });
  it("checkChoice: a scheduled window returns its start and end", () => {
    const v = checkChoice({ slot: "scheduled", date: "2026-11-21", window: "10:00–12:00" }, at("2026-11-20T19:00:00"), "ready", R);
    expect(v).toMatchObject({ ok: true, window: "10:00–12:00" });
    if (v.ok) expect(v.dueAt.toISOString()).toBe("2026-11-21T06:30:00.000Z");
  });
  it("checkChoice refuses ASAP after hours, a window inside the minimum, an unknown window, and a date past pre-order", () => {
    expect(checkChoice({ slot: "asap" }, at("2026-11-20T18:00:01"), "ready", R)).toMatchObject({ ok: false, message: expect.stringMatching(/stopped taking orders/) });
    expect(checkChoice({ slot: "scheduled", date: "2026-11-20", window: "12:00–14:00" }, at("2026-11-20T09:30:00"), "custom", R)).toMatchObject({ ok: false, message: "That time has passed — choose a later window." });
    expect(checkChoice({ slot: "scheduled", date: "2026-11-21", window: "09:00–11:00" }, at("2026-11-20T09:00:00"), "ready", R)).toMatchObject({ ok: false, message: "Choose a delivery window from the list." });
    expect(checkChoice({ slot: "scheduled", date: "2026-12-05", window: "10:00–12:00" }, at("2026-11-20T09:00:00"), "ready", R).ok).toBe(false);
  });
  ```

- [ ] **Step 2: Run to confirm it fails.** `npx vitest run tests/deliveryRules.test.ts`. Expected: FAIL, cannot resolve `@/lib/deliveryRules`.

- [ ] **Step 3: Implement `lib/deliveryRules.ts`.** Parse "HH:MM" to minutes. Build each IST day's instants as `` new Date(`${date}T${hh}:${mm}:00+05:30`) ``. Work out IST dates with `+19_800_000` and `toISOString().slice(0,10)`, as `lib/scheduling` does. The ASAP label is the IST HH:MM of start–end.

  For a scheduled choice:
  - If the date is in range and `window` matches a label that exists that day ignoring the minimum, but isn't offered now, return "That time has passed…".
  - If the label doesn't exist or the date is out of range, return "Choose a delivery window from the list."

  Refusal copy (exact):
  - ASAP after closing: `"We stopped taking orders for today. Schedule one for tomorrow."`
  - ASAP before opening: `` `We start taking orders at ${rules.ordersFrom}. Schedule a time instead.` ``

- [ ] **Step 4: Run tests.** `npx vitest run tests/deliveryRules.test.ts`. Expected: all PASS.

- [ ] **Step 5: Commit.** `git add lib/deliveryRules.ts tests/deliveryRules.test.ts && git commit -m "feat: delivery rule engine (ASAP and scheduled windows)" -- lib/deliveryRules.ts tests/deliveryRules.test.ts`

---

### Task 2: Settings table, slot values, snapshot wiring

**Files:**
- Modify: `prisma/schema.prisma` (add `model DeliverySettings` exactly as in the spec's Data model section)
- Create: `prisma/migrations/9n_delivery_settings/migration.sql`
- Modify: `lib/schema.ts:56` (enum), `lib/catalog.ts:171` (`DELIVERY_OPTIONS`), `lib/catalogDefaults.ts` (`DELIVERY_FEE`, `DEFAULT_SLOT_INFO`, legacy rows `isAvailable: false`, `DEFAULT_SNAPSHOT`, `snapshotFrom`), `lib/catalogSnapshot.ts` (`CatalogSnapshot.deliveryRules`, `buildSnapshot`), `lib/catalogData.ts` (`load` reads `db.deliverySettings`), `lib/delivery.ts` (`resolveSlot`), `lib/deliveryRules.ts` (`NEW_SLOTS`, `isNewSlot`)
- Test: `tests/catalog.test.ts`, `tests/delivery.test.ts`

**Interfaces:**
- Consumes: `DeliveryRules`, `DEFAULT_DELIVERY_RULES` (Task 1).
- Produces:
  - `DeliverySlot` includes `"asap" | "scheduled"`.
  - `CatalogSnapshot.deliveryRules: DeliveryRules`.
  - `buildSnapshot(rows, settings, zones, bakery, rules = DEFAULT_DELIVERY_RULES)`.
  - `snapshotFrom(rows, settings, zones?, bakery?, rules?)`.
  - `catalog.slots.asap` / `.scheduled` are `{ slot, name: "As soon as possible" | "Scheduled", leadHours: rules.readyMinMinutes / 60, window: "", note: "", dailyCapacity: 0, cutoffHours: 0 }`.
  - `catalog.price.deliveryFee.asap === catalog.price.deliveryFee.scheduled === rules.feePaise`.
  - `export const NEW_SLOTS = ["asap", "scheduled"] as const` and `export function isNewSlot(s: string): s is "asap" | "scheduled"` in `lib/deliveryRules.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/catalog.test.ts`:
    - `"new slots take their fee from delivery rules"`: `buildSnapshot(DEFAULT_ROWS, DEFAULT_SETTINGS, DEFAULT_ZONES, DEFAULT_BAKERY, { ...DEFAULT_DELIVERY_RULES, feePaise: 9900 }).price.deliveryFee.asap === 9900` and `.scheduled === 9900`.
    - `"legacy slots are withdrawn by default but still priced"`: `DEFAULT_SNAPSHOT.byCategory.delivery.find(e => e.value === "standard")!.isAvailable === false` and `DEFAULT_SNAPSHOT.price.deliveryFee.standard === 6000`.
    - `"snapshot without stored rules uses the defaults"`: `snapshotFrom([], DEFAULT_SETTINGS).deliveryRules` toEqual `DEFAULT_DELIVERY_RULES`.
  - `tests/delivery.test.ts`:
    - `"asap is available wherever we deliver, ignoring zone slot lists"`: `resolveSlot("asap", "501100", DEFAULT_SNAPSHOT).available === true` (extended zone, whose list lacks `asap`) and `.effectiveLeadHours === 2`.
    - `"asap is unavailable to a pincode outside every zone"`: `resolveSlot("asap", "400001", DEFAULT_SNAPSHOT).available === false`.

- [ ] **Step 2: Run to confirm it fails.** `npx vitest run tests/catalog.test.ts tests/delivery.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Enum order: `"asap", "scheduled", "standard", "same-day", "express-4hr", "midnight", "pickup"`.
  - `DELIVERY_OPTIONS` gains, first, `{ value: "asap", name: "As soon as possible", blurb: "2–4 hours · orders 08:00–18:00" }` and `{ value: "scheduled", name: "Scheduled", blurb: "Pick a date and a 2-hour window" }`.
  - `DELIVERY_FEE` gains `asap: RUPEES(150), scheduled: RUPEES(150)`.
  - `DEFAULT_SLOT_INFO` gains both with `window: ""`, `note: ""`, `dailyCapacity: 0`, `cutoffHours: 0`.
  - In `DEFAULT_ROWS`, set legacy delivery rows (`standard`, `same-day`, `express-4hr`, `midnight`) to `isAvailable: false`.
  - In `buildSnapshot`, after the slot loop, overwrite `slots.asap`, `slots.scheduled` and both `deliveryFee` entries from `rules`, and return `deliveryRules: rules`.
  - In `load`, add `db.deliverySettings.findUnique({ where: { id: "singleton" } })` to the `Promise.all`. Map it to a plain `DeliveryRules` (drop id and timestamps; the value is cached and serialised) and pass it to `snapshotFrom`. A `null` row means the defaults.
  - `resolveSlot`: for `isNewSlot(slot)`, skip `validSlotWindow` and the zone slot-list check. Return `available` = zone found and `checkDeliveryServiceability(...).serviceable`, with `effectiveLeadHours: base.leadHours` and `zoneName`/`zoneId` from the zone.

  Migration SQL (match the style of `9l_custom_requests` / `9m_enable_rls_remaining_tables`, including RLS):
  ```sql
  CREATE TABLE "DeliverySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "feePaise" INTEGER NOT NULL DEFAULT 15000,
    "ordersFrom" TEXT NOT NULL DEFAULT '08:00',
    "ordersUntil" TEXT NOT NULL DEFAULT '18:00',
    "readyMinMinutes" INTEGER NOT NULL DEFAULT 120,
    "readyMaxMinutes" INTEGER NOT NULL DEFAULT 240,
    "customMinMinutes" INTEGER NOT NULL DEFAULT 180,
    "customMaxMinutes" INTEGER NOT NULL DEFAULT 240,
    "windowMinutes" INTEGER NOT NULL DEFAULT 120,
    "preorderDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeliverySettings_pkey" PRIMARY KEY ("id")
  );
  INSERT INTO "DeliverySettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
  UPDATE "CatalogOption" SET "isAvailable" = false
    WHERE "category" = 'delivery' AND "value" IN ('standard','same-day','express-4hr','midnight');
  ALTER TABLE "DeliverySettings" ENABLE ROW LEVEL SECURITY;
  ```
  If `CatalogOption.category` is a Postgres enum, cast: `"category" = 'delivery'::"CatalogCategory"`. Check `0_init` for the real type name.

- [ ] **Step 4: Run tests and typecheck.** `npx prisma generate && npx vitest run tests/catalog.test.ts tests/delivery.test.ts && npm run typecheck`. Expected: PASS, no type errors. Fix every `Record<DeliverySlot, …>` literal the compiler flags by adding the two keys.

- [ ] **Step 5: Verify the migration offline.** Start the scratch Postgres container and run `DATABASE_URL=<scratch> npx prisma migrate deploy`. Expected: `9n_delivery_settings` applied. Then run `DATABASE_URL=<scratch> npx prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma`. Expected: no difference.

- [ ] **Step 6: Commit** the files above by path: `feat: DeliverySettings table and asap/scheduled slots`.

---

### Task 3: Server checkout uses the rules

**Files:**
- Modify: `lib/deliveryRules.ts` (`cakeKindOf`, `choiceFromFulfillment`), `lib/checkout.ts:944-955` (`checkoutIntent`), `lib/checkoutValidate.ts:225-345`, `lib/placeOrder.ts:165-175` (`CreateInput`), `:349` (`dueAt`), `:403` (`requestedWindow`), `app/api/price/route.ts` (schedule check)
- Test: `tests/checkoutDelivery.test.ts` (unit), `tests/delivery.integration.test.ts` (scratch DB)

**Interfaces:**
- Consumes: `checkChoice`, `isNewSlot`, `CakeKind` (Tasks 1–2); `catalog.deliveryRules` (Task 2).
- Produces:
  - `export function cakeKindOf(items: { config?: unknown }[]): CakeKind`. Any item with `config` means `"custom"`.
  - `export function choiceFromFulfillment(f: { slot: string; requestedDate: string; requestedWindow: string }): DeliveryChoice | null`. Returns `null` for legacy slots.
  - The `checked` result and `CreateInput` gain `dueAt: Date` and `requestedWindow: string`.
  - Wire format: for ASAP the client sends `requestedDate = istDate(now)` and `requestedWindow = "asap"`; for scheduled, the date and the window label.

- [ ] **Step 1: Write the failing tests.**
  - `tests/checkoutDelivery.test.ts`:
    - `"cakeKindOf: builder config is custom, cart products are ready"`.
    - `"choiceFromFulfillment maps asap/scheduled and returns null for legacy"`.
    - `"checkoutIntent differs when the scheduled window differs"`: two bodies identical except `requestedWindow` `"10:00–12:00"` vs `"12:00–14:00"` with `slot: "scheduled"`. Expect `JSON.stringify(checkoutIntent(a)) !== JSON.stringify(checkoutIntent(b))`.
    - `"checkoutIntent still ignores requestedWindow for asap"`: equal.
  - `tests/delivery.integration.test.ts` (reuse that file's scratch-DB setup):
    - `"an ASAP ready-made order stores dueAt = now+4h, its window label and fee 15000"`, using `vi.setSystemTime(new Date("2026-11-20T11:00:00+05:30"))`.
    - `"refuses an ASAP order arriving at 18:00:01"`: 422, `code: "schedule_unavailable"`, `error` matching `/stopped taking orders/`.
    - `"refuses a legacy slot on a new checkout"`: `slot: "standard"` gives 422, `code: "slot_retired"`, `error: "That delivery option has changed. Choose a delivery time again."`.
    - `"recovery of a legacy-slot attempt is not refused"`: drive the existing payment-recovery path (trace it from `PaymentRecovery` / `CheckoutAttempt` use in `lib/`) for an attempt stored with `slot: "standard"`, and expect an order row to be created.

- [ ] **Step 2: Run to confirm it fails.** `npx vitest run tests/checkoutDelivery.test.ts` (FAIL). Run the integration file with the scratch `DATABASE_URL` (FAIL).

- [ ] **Step 3: Implement.**
  - In `checkoutValidate`, replace the `scheduleVerdict` block:
    - **Legacy slot on a fresh checkout:** return the `slot_retired` 422. If recovery reaches this function, gate the refusal on whatever already tells recovery apart, so recovery keeps `scheduleVerdict`.
    - **New slot:** run `checkChoice(choiceFromFulfillment(f)!, new Date(), cakeKindOf(body.items), catalog.deliveryRules)`. A failure returns the existing `schedule_unavailable` 422 shape with `field: "requestedDate"`.
    - **Success:** return `requestedFor`, `dueAt`, `requestedWindow: verdict.window`.
  - `placeOrder`: for delivery orders write `dueAt: input.dueAt` and `requestedWindow: input.requestedWindow`. Legacy recovery passes `dueAt = requestedFor` and `slotWindow(slot)`, as today.
  - `checkoutIntent`: strip `requestedWindow` only when `fulfillment.slot !== "scheduled"`.
  - `app/api/price/route.ts`: use `checkChoice` for new slots, so the preview and placement agree.

- [ ] **Step 4: Run tests.** Both files PASS; `npm test` is green; `npm run typecheck` is clean.

- [ ] **Step 5: Commit** by path: `feat: checkout validates delivery against the rules`.

---

### Task 4: Checkout delivery step UI

**Files:**
- Modify: `app/checkout/page.tsx` (load closed days), `app/checkout/CheckoutForm.tsx:25-100` (draft schema/defaults), `:205-260` (slot → fulfillment), `:760-830` (the "Make time for cake" step)
- Test: `e2e/checkout.spec.ts`

**Interfaces:**
- Consumes: `deliveryChoices`, `cakeKindOf`, `istDate` (Tasks 1, 3); `catalog.deliveryRules`, `catalog.price.deliveryFee.asap` (Task 2).
- Produces: a `CheckoutForm` prop `closedDays: string[]`. The draft gains `requestedWindow: string` (default `""`), and `slot` defaults to `"asap"`. A draft restored from sessionStorage with a legacy slot resets to `"asap"`.

- [ ] **Step 1: Write the failing e2e test** in `e2e/checkout.spec.ts`: `"shows ASAP and Schedule, charges ₹150 delivery"`. With a cart product, open `/checkout`. Expect radios named `As soon as possible` and `Schedule`. Choose Schedule, then tomorrow's date, then window `10:00–12:00`, and expect the summary to show `Delivery` with `₹150`.

- [ ] **Step 2: Run to confirm it fails** against a dev server on the scratch DB. Expected: FAIL, no "As soon as possible" radio.

- [ ] **Step 3: Implement.**
  - `page.tsx`: when `hasDatabase()`, load `db.fulfillmentBlackout.findMany({ where: { method: "delivery", date: { gte: <today UTC midnight>, lte: <today + preorderDays> } } })` and pass `closedDays` as `YYYY-MM-DD`; otherwise pass `[]`.
  - The step renders `deliveryChoices(now, kind, catalog.deliveryRules, new Set(closedDays))`, recomputed every 60 s (interval), so ASAP drops off at 18:00 without a reload.
  - The ASAP card shows `Arrives {asap.label}`. When it's disabled, show the Task 1 refusal copy.
  - Schedule shows `<input type="date">` (min today, max today + preorderDays). A closed date shows `"We're closed that day."` The day's windows are a radio group.
  - Send the wire format from Task 3. Remove the old slot-card list. Leave the pickup branch behind `PICKUP_OPEN` untouched.

- [ ] **Step 4: Verify.** The e2e test PASSES. `preview_start` the dev server, open `/checkout` with a cart item, and screenshot the ASAP and Schedule states at desktop and 375 px width.

- [ ] **Step 5: Commit** by path: `feat: ASAP / scheduled delivery picker at checkout`.

---

### Task 5: Photo-quote form uses the custom rules

**Files:**
- Modify: `components/shop/CustomRequestSheet.tsx` (due-time field), `app/api/custom-requests/route.ts:44-50` (and its zod body)
- Test: `tests/customRequestRoute.test.ts`

**Interfaces:**
- Consumes: `deliveryChoices`, `checkChoice` (Task 1); `catalog.deliveryRules`.
- Produces: the form posts `dueDate` (`YYYY-MM-DD`) and `dueWindow` (label) in place of today's `dueAt` field. The route stores `dueAt` = the verdict's `dueAt` (window end).

- [ ] **Step 1: Write the failing tests** in `tests/customRequestRoute.test.ts` (use that file's existing mocks):
  - `"accepts a custom window at least 3h away"`: at 11:00 IST, today with `"14:00–16:00"` is accepted, and the stored `dueAt` is `16:00 IST`.
  - `"refuses a custom window inside 3h"`: at 11:00 IST, `"12:00–14:00"` gives 422 with `fieldErrors.dueAt` = `["That time has passed — choose a later window."]`.
- [ ] **Step 2: Run to confirm it fails.** `npx vitest run tests/customRequestRoute.test.ts`.
- [ ] **Step 3: Implement.** In the route, replace the `leadHours` block with `checkChoice({ slot: "scheduled", date: dueDate, window: dueWindow }, new Date(), "custom", catalog.deliveryRules)`. The sheet shows the date input and window buttons from `deliveryChoices(now, "custom", rules).days`, with no ASAP option.
- [ ] **Step 4: Run.** `npx vitest run tests/customRequestRoute.test.ts`, then `tests/customRequests.integration.test.ts` on the scratch DB. Expected: PASS.
- [ ] **Step 5: Commit** by path: `feat: photo-quote form uses custom delivery windows`.

---

### Task 6: Builder and product page defaults

**Files:**
- Modify: `lib/schema.ts` (`DEFAULT_CAKE.delivery`), `lib/deliveryRules.ts` (`deliveryFromParam`), `app/build/page.tsx:83-86`, `app/cakes/[slug]/BuyPanel.tsx:70`
- Test: `tests/deliveryRules.test.ts`

**Interfaces:**
- Consumes: `isNewSlot` (Task 2).
- Produces: `export function deliveryFromParam(v: string | null): "asap" | "scheduled" | null`.

- [ ] **Step 1: Write the failing tests.** `DEFAULT_CAKE.delivery === "asap"`; `deliveryFromParam("standard") === null`; `deliveryFromParam("asap") === "asap"`; `deliveryFromParam(null) === null`.
- [ ] **Step 2: Run to confirm it fails.** `npx vitest run tests/deliveryRules.test.ts`.
- [ ] **Step 3: Implement.** Set the default to `"asap"`. `app/build/page.tsx` uses `deliveryFromParam`. In BuyPanel, change `delivery: "standard"` to `"asap"`.
- [ ] **Step 4: Run.** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** by path: `feat: builder and product pages default to ASAP delivery`.

---

### Task 7: Admin "Delivery rules" form

**Files:**
- Modify: `app/admin/actions.ts` (add `saveDeliveryRules`; `saveDeliverySlot` stays for legacy rows but is no longer rendered), `app/admin/delivery/DeliveryForms.tsx` (add `DeliveryRulesForm`; drop the `SlotRow` list), `app/admin/delivery/page.tsx` (load `db.deliverySettings`; render the form above Closed days)
- Test: `tests/deliveryRulesForm.test.ts` (mirror the mocking in `tests/deliverySlotForm.test.ts`)

**Interfaces:**
- Consumes: `DeliveryRules`, `DEFAULT_DELIVERY_RULES` (Task 1); `revalidateCatalog` (`lib/catalogData`); `requireAdmin`, `RupeeAmount`, `ActionResult` (existing in `app/admin/actions.ts`).
- Produces: `saveDeliveryRules(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult>`.
  - Fields: `fee` (rupees), `ordersFrom`, `ordersUntil` (`HH:MM`), `readyMin`, `readyMax`, `customMin`, `customMax` (hours, multiples of 0.5, > 0, ≤ 24), `windowMinutes` (`60 | 120 | 180`), `preorderDays` (integer 0–60).
  - It upserts `id: "singleton"`, storing minutes = hours × 60.

- [ ] **Step 1: Write the failing tests:**
  - `"saves valid rules as minutes"`: `readyMin "2.5"` is stored as `readyMinMinutes: 150` and `fee "150"` as `feePaise: 15000`; one upsert.
  - `"refuses non-admins"`: `requireAdmin` rejects, so there's no upsert.
  - `"rejects ordersUntil before ordersFrom"`: `{ ok: false, message: "Orders must close after they open." }`.
  - `"rejects min above max"`: `{ ok: false, message: "Ready-made: minimum must not exceed maximum." }`, and the same with `"Custom: …"`.
  - `"rejects a window length that isn't 1, 2 or 3 hours"`: `{ ok: false }`.
- [ ] **Step 2: Run to confirm it fails.** `npx vitest run tests/deliveryRulesForm.test.ts`.
- [ ] **Step 3: Implement.** The action uses zod and then `revalidateCatalog()` + `revalidatePath("/admin/delivery")`, like `saveMinOrder`. The form uses `aField` / `aBtn` from `components/admin/ui.tsx` and `useActionState`, like `MinOrderForm`, with `<input type="time">` for the hours. Helper line under the form: `"ASAP shows only while orders are open. Scheduled windows always sit inside these hours."`
- [ ] **Step 4: Verify.** Tests PASS. With the dev server on the scratch DB, sign in as the local demo admin, open `/admin/delivery`, set the fee to ₹160 and save, then check that `/checkout` shows ₹160. Set it back to ₹150.
- [ ] **Step 5: Commit** by path: `feat: admin Delivery rules form`.

---

### Task 8: Labels, copy, full verification

**Files:**
- Modify: `app/shipping-policy/page.tsx`, plus any hit from `grep -rnE "Same day|Express 4|Midnight|48 hours|Standard delivery" app components lib` that customers or bakeries see (check `lib/notify.ts`, `lib/orderEmail.ts`, `app/vendor/OrderTicket.tsx`, `components/orders/DeliveryInfo.tsx`)

- [ ] **Step 1: Fix the hard-coded copy.** For each grep hit, read the name from `catalog.slots[slot].name` plus `order.requestedWindow`, or delete text that only described the old slots.
- [ ] **Step 2: Rewrite the shipping-policy delivery section** from `catalog.deliveryRules`: "We take orders {ordersFrom}–{ordersUntil}, every day. Ready-made cakes arrive in {readyMin}–{readyMax} hours; custom cakes in {customMin}–{customMax} hours. You can also schedule a {window}-hour window up to {preorderDays} days ahead. Delivery is a flat ₹{fee}."
- [ ] **Step 3: Full check.** `npm run typecheck && npm run lint && npm test`, then `npm run e2e` with the dev server on the scratch DB. Expected: all green. Old tests that use `standard` as a **new** order's slot switch to `asap`. Tests about existing legacy orders keep `standard`.
- [ ] **Step 4:** `graphify update .`
- [ ] **Step 5: Commit** by path: `feat: delivery copy follows the new rules`.

---

## After the plan (user actions)

1. Run the migration on production (`migrate deploy`, Supabase port 5432) **before** deploying this branch. Without it, checkout safely uses the default rules but admin edits can't save.
2. Check bakery prep times in admin. An ASAP order is due 4 h after it's placed, so a bakery whose prep plus travel is longer is never offered ASAP orders.
