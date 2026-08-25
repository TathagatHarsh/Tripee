# Makemycake

A website where someone builds their own cake and watches it appear in 3D as they
build it. Pick a shape and a cake shows up. Choose ganache and it gets covered in
ganache. Add a strawberry border and strawberries appear around the base. The
price updates every time you touch something, and it shows you why.

At the end you get an order docket — a spec sheet a real kitchen could work from,
with the itemised price, allergens, serving count and storage instructions.

No payments, no login, no admin panel. Those come later; the hooks are already in
the schema.

---

## Running it

```bash
npm install
```

Point `DATABASE_URL` at a Postgres database:

```bash
echo 'DATABASE_URL="postgresql://you@localhost:5432/makemycake?schema=public"' > .env
```

Create the schema and seed the catalogue:

```bash
npm run db:push && npm run db:seed
```

```bash
npm run dev
```

## The commands that matter

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Vitest — pricing, rules, allergens, delivery, share links, docket |
| `npm run e2e` | Playwright — builds a cake end to end against a production build |
| `npm run visual` | Pixel baselines for the render; fails on any unintended change |
| `npm run visual:update` | Re-baseline, for changes that were on purpose |
| `npm run a11y` | axe-core WCAG 2.1 AA sweep over every route |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run docket -- --preset classic-truffle` | Prints an order docket to the terminal |
| `npm run shoot -- pass10 "what changed"` | Screenshots `/lab` into `docs/renders` |
| `npm run shot -- /build/shape name` | Screenshots any route into `docs/screens` |
| `npm run budget` | Measures what each route actually downloads |

The docket CLI takes a config file, a preset or stdin, so pricing and rules can be
exercised without a browser:

```bash
npm run docket -- --preset red-velvet-classic
```

---

## How it is put together

**The cake config is one JSON object.** `lib/schema.ts` defines it, the UI edits
it, the renderer reads it, the server prices it. If cake state ever lives in two
places, that is a bug.

```
lib/schema.ts      the object, and the migration hook for v2
lib/pricing.ts     pure functions, paise as integers, no database, no React
lib/rules.ts       compatibility rules that explain themselves in plain language
lib/allergens.ts   derived from the config, never typed by hand
lib/servings.ts    serving count and handling instructions
lib/delivery.ts    named lead times per slot, per pincode
lib/docket.ts      the docket model and the plain-text spec sheet
lib/store.ts       Zustand + zundo (undo/redo) + sessionStorage
```

Money is paise, as integers, everywhere except the render boundary. `₹1,200.50`
is `120050`. Formatting happens in `lib/format.ts` and nowhere else.

### Pricing is verified on the server

The client calls `priceCake()` for the live estimate and the server calls the
*same function* on submit. The client number is advisory; a mismatch is logged
and the server's number stands. That is the whole reason this is a Next app
rather than a Vite SPA.

### The 3D is procedural

Every shape, finish and topping is built from primitives at runtime — no models,
no asset pipeline, so every combination works. Normal maps are generated from
noise on the client rather than downloaded, and the environment map is built from
lightformers rather than an HDR file, so the scene needs no network at all.

Anything that looks random is seeded from a hash of the config (`lib/seed.ts`).
Drips, topping scatter and layer jitter must not reshuffle on a re-render; a cake
that visibly rearranges itself looks broken.

`/lab` renders twelve deliberately extreme cakes side by side, whole or cut. It
is how the look was found — `docs/renders/LOG.md` has the pass-by-pass record
and the list of things that went wrong on the way.

Every render bug in this project was originally found by a person looking at a
PNG. `npm run visual` is that person, automated: baselines live in
`e2e/snapshots/` and any unintended change to the render fails the suite. It
only works because the cake is deterministic.

### The cutaway

The cut is a *view*, not a config field. Putting it in `CakeConfig` would change
the config hash, the docket, the price and every saved design's URL, so it lives
in `lib/view.ts` instead.

Geometrically it is one wedge angle applied consistently: lathes get
`phiStart`/`phiLength` plus a flat cap at each cut, extruded shapes get their 2D
outline clipped to the sector before extrusion. The frosting shell is
deliberately left *uncapped* — a capped shell puts a slab of buttercream across
the whole cross-section and hides the layers the cut exists to show.

---

## Where things stand

Done and verified:

- Builder with live 3D preview, nine steps, one URL each
- Undo, redo, and refresh without losing work
- Server-verified pricing with a visible itemised breakdown
- Compatibility rules with inline explanations and one-tap fixes
- Order docket, downloadable as a spec sheet
- Save design → short URL, plus a design carried entirely in the address bar
- Order submission → Postgres → order reference
- Preset gallery, landing page, mobile layout
- Cutaway view — a wedge comes out so the sponge layers and the filling are visible
- Message plaque that lifts clear while you type and settles when you're done,
  with toppings kept off its footprint

Measured, not assumed:

| Budget | Target | Actual |
|---|---|---|
| 3D bundle | < 400 KB gz | 274 KB gz |
| Time to first cake | < 1.5 s | ~0.7 s, production build, local |
| WCAG 2.1 AA violations | 0 | 0 across 9 routes (axe-core) |
| Keyboard-only build | works | covered by an E2E test |

Two things are deliberately unfinished, and both are visible in the code:

1. **`lib/photos.ts` is an empty list.** The review page has a "cakes we've
   actually delivered" section that only renders when there is something true to
   put in it. Stock photography under that label would be a lie, and the review
   page only works if it can be trusted.
2. **The bundt is the weakest render in the set.** It reads correctly as a fluted
   glazed ring, but it is the least appetising of the twelve. It is first on the
   cut list in the plan, so it did not get a tenth pass.

Not started, by design: payments, authentication, an admin dashboard, inventory,
delivery tracking, reviews, notifications.

The hooks for the first two are already in place — `Order.userId` is nullable,
`Order.paymentStatus` defaults to `none`, and the price breakdown returns
`payable` separately from `subtotal`.

---

## Stack

Node 22+ · Next 16 (App Router) · React 19 · TypeScript strict ·
@react-three/fiber 9 + drei 10 + three · Zustand + zundo · Zod 4 · Tailwind 4 ·
Prisma 7 + PostgreSQL · Vitest · Playwright

R3F v9 requires React 19. Do not mix R3F v8 with React 19.
