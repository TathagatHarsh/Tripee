# UI_REDESIGN_PLAN.md

**MakeMyCake — UI/UX redesign plan**
Audit date: 2026-08-19 · Branch: `feat/premium-3d-renderer` · Next 16.2.12 / React 19 / Tailwind v4

---

## How this audit was done

Every finding below comes from reading the source and from running the app locally
(`npm run dev`, port 3000) and inspecting the rendered result at three widths —
375 (mobile), 1024 (the `lg` breakpoint boundary), and 1440 (desktop). Measured
values (pane widths, contrast ratios, canvas counts, font-loading state) were pulled
out of the live DOM, not estimated from the CSS.

Nothing in the application was modified.

**One thing to say up front, because it shapes everything after it.** This is not a
bad codebase wearing a bad skin. The comments in `app/globals.css`, `OptionGrid.tsx`,
`DocketLine.tsx` and `Lighting.tsx` document a real, thoughtful design pass —
someone already fixed the uppercase-9.5px-monospace problem, already killed the
typewriter animation on the docket, already worked out that the accent colour can't
mean both "total" and "error". The renderer is genuinely good. The accessibility
work is real and in places better than most production sites.

So the job here is **not** "replace a generic UI with a nice one." It is: the design
system was defined for the *docket* and then stretched over the whole product, and it
runs out somewhere around 18px and somewhere around 1100px of viewport. The identity
is right and should be kept. What's missing is the scale above the ticket, the space
around the cake, and the sense that any single thing on screen matters more than the
thing next to it.

---

## 1. Current UI assessment

### What is already right, and must survive the redesign

| Thing | Where | Why it stays |
|---|---|---|
| Paper-and-ink-and-kitchen-docket identity | `globals.css`, `Docket.tsx` | It is a real point of view. It is the opposite of a template. Do not trade it for glass and gradients. |
| The docket as a literal ticket | `components/docket/` | Dotted leaders, mono, `#MC-3606`, the `stamp` utility. This is the trust surface and it earns it. |
| Radiogroup semantics + roving tabindex | `OptionGrid.tsx:71–86` | Correct, tested in `e2e/a11y.spec.ts`, and better than the industry norm. |
| Price as a polite live region | `BuilderShell.tsx:138` | Announces the number the customer is tracking without stepping on the option name. |
| `role="img"` + generated caption on the 3D pane | `BuilderShell.tsx:95–102`, `describeCake()` | Half the product exists for non-sighted users because of this. |
| Blocker → owning-step deep link | `StepNav.tsx:113–177` | Solves the "which of nine steps do I go back to" problem properly. |
| Quality tiering + `frameloop="demand"` | `lib/quality.ts`, `CakeScene.tsx:61` | Real engineering. Don't undo it. |
| Deterministic seeded render | `e2e/visual.spec.ts` | Pixel baselines only work because of it. Any change that breaks determinism breaks the test suite. |

### What the product actually looks like right now

Three screenshots' worth of summary:

**Landing (1440×1750).** A well-set headline over a lot of empty page. The hero copy is
`max-w-sm` inside a `1fr` column of a 1152px container, so roughly 300px of the left
column is text and 250px is nothing. The cake sits in a square panel at the right,
rendered small inside it, with the `cake-stage` radial visibly clipped by the panel's
rectangle. Below that, two prose sections and three preset cards. The whole page is
one background value with two barely-distinguishable bands. There is exactly one
moment of scale (the h1) and after it the page has no dynamics at all.

**Builder (1440×900).** Header strip, then three columns. It reads as competent and
completely flat: the three panes are separated by 1px lines at **1.30:1 contrast**,
on the same background, with no elevation, no width relationship, and nothing telling
you which one is the subject. The 720px cake pane is the largest element on screen and
the least designed. The controls column is a stack of identical rounded rectangles.
The docket is the most characterful thing in the frame and it's the narrowest.

**Builder (1024×768) — the failure case.** See §8. The docket is 214px wide and
hard-breaks `AMERICAN BUTTERCREAM` into `AMERICA / N / BUTTERC / REAM`. This is a
shipping defect at the single most common laptop resolution.

**Builder (375×812).** 190px of header chrome, a 260px cake pane, and the rest is
a scrolling form with a quiet bar pinned at the bottom. It is a compressed desktop
layout with a bottom bar bolted on — which is precisely what design principle 7 says
it must not be.

### The one-sentence diagnosis

> The docket's design language — 11px mono, 2px radii, hairline rules, one background,
> no elevation — was applied to the entire product, and it is a language with no
> capacity for hierarchy above the scale of a receipt line.

---

## 2. Visual hierarchy problems

**H1 — The cake is the largest element on screen but not the hero.**
`BuilderShell.tsx:88` gives the canvas `lg:w-[50%]`, and inside it the framing logic
(`CakeScene.tsx:166`, `distance = clamp(max(needV, needH) * 1.22, ...)`) fits the cake
to the *shorter* of the two constraints. At 720×860 the cake occupies maybe 45% of the
pane's height and sits low-left of centre, surrounded by empty gradient. Size without
composition is not emphasis. The cake reads as a *preview widget*, not a product shot.

**H2 — Three panes of equal visual weight.**
Canvas | controls | docket are separated only by `border-rule` (1.30:1 against `slab`
— effectively invisible), share the same background family, and carry no elevation
difference. Nothing establishes that the cake is the subject, the controls are the
verb, and the docket is the receipt.

**H3 — Selection state is the only strong signal on the page, and it is maximal.**
`OptionGrid.tsx:93` makes the selected card `bg-ink text-paper` — a solid near-black
slab. It is unmissable (which was the point of the fix documented in that file), but
it is *the single darkest thing in the entire product*, applied to a 64px card, on
every step. The primary CTA, the total, and the step you're on all have less visual
weight than "you picked vanilla." The emphasis budget is spent in the wrong place.

**H4 — Section structure inside a step is invisible.**
On `/build/finish` the three groups — Frosting colour, Finish, Drip — are separated by
`mt-6` and a `<legend>` at `text-meta text-steel` (13px, #55524b). That legend is the
same size, weight and colour as the *blurb text inside the option cards below it*. A
group heading that looks like body copy is not a heading. Same on `/build/size`
(Tiers, Sponge layers) and `/build/message` (Delivery).

**H5 — Review is a wall.**
`review/page.tsx` renders 5 `<Section>`s of key/value rows, a price breakdown, a photo
grid, a violation card, a contact form, and four buttons — all at one visual weight in
a 420px column, with the purchase button roughly 1,400px down the scroll. The moment of
purchase has no arrival, no summary, no confidence. And 720px of screen next to it is
showing a cake that hasn't changed in three steps.

**H6 — The docket header duplicates the app header.**
`Docket.tsx:36` prints `MAKEMYCAKE` in bold tracked mono, ~200px below the identical
`MAKEMYCAKE` in `BuilderShell.tsx:66`. On mobile with the sheet open they are three
rows apart. Repetition at equal weight destroys hierarchy in both.

---

## 3. Typography problems

**T1 — The type scale has a hole above 18px.**
`globals.css:42–46` defines five steps: `micro` 11 / `meta` 13 / `body` 15 / `item` 17 /
`lede` 18. Every heading larger than that escapes the system:

| Where | What it uses |
|---|---|
| `page.tsx:32` (landing h1) | `text-[clamp(2.4rem,6vw,4.2rem)]` |
| `page.tsx:80` | `text-[clamp(1.6rem,3.2vw,2.4rem)]` |
| `page.tsx:112` | `text-[clamp(1.5rem,3vw,2rem)]` |
| `presets/page.tsx:23`, `d/[slug]:66`, `d/new:54`, `not-found:8` | `text-3xl` |
| `StepHeader.tsx:4`, `review:343`, `d/new:27` | `text-2xl` |

Five different ways of saying "this is a heading," three of them ad-hoc `clamp()`
one-offs and two of them raw Tailwind defaults. The comment at `globals.css:32–41`
is right that the *old* problem was eleven sizes between 9.5 and 15px. The new
problem is the mirror image: a rigorous scale below 18px and improvisation above it.

**T2 — `text-[10px]` exists, below the file's own stated floor.**
`StepNav.tsx:71`. `globals.css:39` says "Nothing below `--text-micro` exists any more."
It does, on the step numerals, which are the wayfinding of a 9-step flow.

**T3 — Three families is one too many, and the mono is the wrong mono for its job.**
Bricolage Grotesque (variable 200–800) + Inter (variable 100–900) + Martian Mono
(four static weights: 400/500/600/700) — verified loaded in the browser. Martian Mono
was chosen deliberately (`layout.tsx:17`) because it reads as a receipt, and it does.
But it is a **wide** monospace, and the docket is the narrowest column in the app. Its
advance width is what makes `AMERICAN BUTTERCREAM` overflow 190px of content box at
11px. The font choice and the column width are in direct conflict, and right now the
column is losing.

Also: four static weights of Martian Mono is a lot of payload when `Docket`,
`DocketLine` and `PriceBreakdown` between them use exactly `normal` and `bold`.

**T4 — Weight is used, but only in two values.**
`globals.css:83–91` sets h1/h2/h3 to 600. Everything else is 400 or `font-medium`
(500) or `font-bold` (700). There is no 500-weight *display* usage, no small-caps,
no italic, no optical-size play — despite Bricolage being a variable font with a
`wdth` axis that the CSS already touches once (`"wdth" 96`).

**T5 — `--text-lede` (18px) is used for exactly two things and `--text-item` (17px)
for option names.** A 1px difference between "the name of a thing you can choose" and
"a step subhead" is not a scale step, it's a rounding error. One of them should go.

**T6 — Step hints are duplicated and have drifted.**
`lib/catalog.ts:183` says the sponge step's hint is `"The cake itself."`;
`app/build/sponge/page.tsx:16` passes `"The cake itself. This is what people taste
first."`. Nine steps, nine hints defined in the catalog, nine hints re-typed in the
page files. Six of them differ from the catalog.

---

## 4. Spacing problems

**S1 — Everything is on a 4px grid with no rhythm above 24px.**
Grep of the codebase: `mt-1`, `mt-1.5`, `mt-2`, `mt-3`, `mt-4`, `mt-5`, `mt-6`, `mt-7`,
`mt-8`, `py-1`, `py-1.5`, `py-2`, `py-2.5`, `py-3`, `py-4`, `py-8`, `py-14`. Nearly
every integer step from 1 to 8 is in use, chosen locally. The result is that no two
sections are separated by the same distance, so no reader can learn the grammar.

**S2 — The controls column has no reading measure.**
`BuilderShell.tsx:132`: `px-4 py-5 sm:px-6 lg:w-[29%]`. No `max-width`. At 1440 the
column is 420px; at 1920 it is 557px; at 1024 it is 297px. Option-card blurbs are
therefore set at anywhere from 32 to 70 characters per line depending on the monitor,
and the `@container` breakpoints (`@md:grid-cols-2` at 448px) flip the grid from one
to two columns somewhere in the middle of that range with no design intent behind
where.

**S3 — The cake pane's padding is zero, so the cake touches the frame.**
The canvas fills `h-[32dvh]` / `lg:h-full` edge to edge. On mobile the board's near
edge sits ~8px from the pane's bottom border and "Cut a slice" (`absolute bottom-3
left-3`) overlaps the board. A product shot needs margin; this one has none, which is
a large part of why it reads as a widget rather than a photograph.

**S4 — Preset and landing cards have ragged bottoms.**
`presets/page.tsx:36–55` and `page.tsx:131–141`: the card footer is
`name/price → blurb → serves → button`, with the blurb wrapping to one or two lines
depending on its length. Verified at 1024: card 1 and card 3 wrap, card 2 doesn't, so
the three "Make it mine" buttons sit at three different heights across the row.

**S5 — Vertical space on mobile is spent on chrome before content.**
Measured at 375×812: header (logo row + undo/redo row + step nav row + progress rule)
≈ 190px, cake pane 32dvh ≈ 260px, docket total bar ≈ 48px. That's **~500px of 812
(61%) before the first option card**, leaving room for roughly two choices at a time
in a nine-step flow.

**S6 — No safe-area handling anywhere.**
`app/layout.tsx:41` sets `viewportFit: "cover"`. `grep -rn "safe-area" app components`
returns nothing. The mobile total bar — the primary control on a phone — will sit
under the iPhone home indicator.

---

## 5. Colour problems

Text contrast is genuinely good. Measured against the live tokens:

| Pair | Ratio | Verdict |
|---|---|---|
| `steel` on `slab` | 6.31:1 | Pass AA |
| `steel` on `paper` | 7.60:1 | Pass AA |
| `graphite` on `slab` | 8.76:1 | Pass AA |
| `seal` on `paper` | 6.98:1 | Pass AA |
| `paper` on `ink` | 17.56:1 | Pass AAA |

**The problem is non-text contrast — WCAG 2.1 SC 1.4.11 (3:1 for UI component
boundaries and state):**

| Pair | Ratio | Used for | Verdict |
|---|---|---|---|
| `rule` on `slab` | **1.30:1** | Unselected option-card borders, all three pane dividers, docket rules, step-footer rule | **Fail** |
| `rule-strong` on `slab` | **1.79:1** | "Cut a slice" button border, "Start from a preset" button border | **Fail** |
| `rule-strong` on `paper` | **2.16:1** | Secondary button borders on paper surfaces | **Fail** |
| `slab-deep` on `paper` | **1.37:1** | Disabled "Place order" button | **Fail** |

Every structural line and every secondary-button boundary in the product is below the
threshold. The axe suite in `e2e/a11y.spec.ts` passes because axe does not reliably
evaluate 1.4.11 on CSS borders — so this is real and untested, not caught-and-accepted.

**C1 — The surface system has been re-fragmented through alpha.**
`globals.css:3–12` says the old fault was "five neutrals within a few percent of each
other." The token set fixed that — and then the components reintroduced it:
`bg-paper`, `bg-paper/60`, `bg-paper/70`, `bg-paper/85`, `bg-paper/90`, `bg-slab-deep`,
`bg-slab-deep/40`, `bg-slab-deep/80`. That's **eight** surface values, most of them
within 3% of each other over `slab`, none of them named, none of them meaning anything
in particular.

**C2 — There is no elevation system.**
One utility (`paper-edge`, used 12×) and one inline one-off
(`shadow-[0_2px_10px_-4px_rgb(23_22_26/0.5)]` on the selected option card). Depth is
therefore binary: flat, or the-one-shadow. This is a direct cause of §2 H2.

**C3 — The cake fights the background it is photographed against.**
The `cake-stage` radial (`globals.css:143–144`) peaks at `#fffefc` in the upper-middle.
Six of the nine frostings sit in the `#F2–#F8` range. Verified on `/build/finish`:
the white cake's top surface against the stage's brightest zone has essentially no
edge. The CSS comment at 134–142 identifies this exact problem and the gradient is the
attempted fix — but the gradient's dark ring is placed by *pane* geometry while the
cake is placed by *camera* geometry, so on tall or narrow panes they don't line up.

**C4 — `cake-stage` is missing on the presets page.**
`presets/page.tsx:33` is `<div className="aspect-square">` — no `cake-stage`, unlike
`page.tsx:128` which has it. So the eight gallery cakes render against flat `bg-paper`
(#fdfcfa), which is *lighter than most of the cakes*. Verified: the Red Velvet card's
cream-cheese cake has no discernible silhouette at its top edge.

**C5 — No dark mode, and that is probably correct — but it should be a decision.**
`grep -rn "prefers-color-scheme|dark:"` → nothing. For a paper-and-ink bakery identity,
committing to light is defensible. It should be written down rather than left as an
absence.

---

## 6. Component consistency problems

**Radii are drifting, and the dominant value is the wrong one.**

| Value | Count | Tailwind v4 px |
|---|---|---|
| `rounded-sm` | 47 | 2px |
| `rounded-md` | 9 | 6px |
| `rounded-full` | 9 | — |
| `rounded-lg` | 2 | 8px |
| `rounded-[10px]` / `[8px]` / `[3px]` | 3 | ad-hoc |

Cards are 2px; buttons are 6px; the landing hero panel is 8px; the skeleton is 10px.
There is no rule. And 2px is specifically the radius that reads as *admin panel* —
the design brief's first "do not look like this."

**Touch targets are inconsistent with the codebase's own stated rule.**
`StepNav.tsx:132` says "44px minimum on all of these." But:
- `page.tsx:22` — landing nav "Build a cake" CTA: `min-h-9` (36px)
- `UndoBar.tsx:35` — undo / redo / start again: `h-9` (36px)
- `LoadConfig.tsx:40` — "Make it mine", the only CTA on every preset card: `py-2` on 13px text ≈ **31px**
- `review/page.tsx:276,306,314` — Save & share / Download docket / back: `py-2` ≈ 31px
- `toppings/page.tsx:58` — "Remove": a bare underlined text link, ~18px tall

**Button variants are re-declared per-file, not shared.**
`StepNav.tsx:134` defines a `base` string. `UndoBar.tsx:34` defines a different `btn`
string. `review/page.tsx:293` builds a third inline. `LoadConfig.tsx:40` a fourth.
`page.tsx:22,46,52` three more. Seven button implementations for what is really three
variants (primary / secondary / quiet).

**Two different selected-state languages for the same job.**
`OptionGrid` uses invert-to-ink (`role="radio"` + `aria-checked`). The tier and layer
pickers in `size/page.tsx:49–53` and the topping "add" buttons in
`toppings/page.tsx:124–128` use border-only (`border-ink bg-paper`) with `aria-pressed`
— visually much weaker, semantically a toggle rather than a radio, and sitting on the
same screen as the strong version.

**Two different "blocked" languages.**
`OptionGrid.tsx:95` → `border-dashed border-seal/45`.
`size/page.tsx:52` and `toppings/page.tsx:127` → `border-dashed bg-slab-deep/40`.
`finish/page.tsx:61` → both.

**`StepHeader` is 8 lines and does almost nothing.**
`StepHeader.tsx` renders an h1 + a p. It carries no step number, no "3 of 9", no
progress relationship, and duplicates hints already in `lib/catalog.ts`.

**`ViolationCard` renders `role="alert"` for every block, unconditionally on mount.**
`ViolationCard.tsx:24`. A live region that is populated at mount time announces on
arrival, not on change. The `e2e/happy-path.spec.ts:44` comment already notes it had
to be scoped to `main` to avoid colliding with Next's route announcer.

---

## 7. Builder UX problems

**B1 — The 50/29/21 split is a fixed percentage and it fails at real widths.**
Measured at 1024: **512 / 297 / 214**. See §8 for what that does to the docket. The
cake needs a *bounded generous* share, not a proportional one; the docket needs a
character-count minimum, not a percentage.

**B2 — The most visual choices in the product are presented as text.**
`/build/finish` offers Smooth, Rustic, Ruffle, Rosette, Combed, Ombré — six *surface
textures* — as six text cards with no imagery whatsoever, next to a 3D renderer that
is capable of rendering all six. `/build/toppings` reduces gold leaf, macarons,
meringue kisses, chocolate shards and edible flowers to **flat colour dots**. The
product's central asset is idle on exactly the screens where it would do the most work.

**B3 — Nothing tells the customer their tap worked, except the cake.**
When you choose "Rosette," the option card inverts, the docket line highlights for
900ms (`DocketLine.tsx:39`), the total ticks, and the cake re-renders. Four independent
feedback events with no shared choreography, and — critically — **no line drawn between
the card you tapped and the change on the cake**. On a phone the cake is 260px away and
above the fold boundary.

**B4 — The 9-step flow never says where you are in plain language.**
`StepNav` shows a numbered chip row and a 1px fill bar. `StepHeader` shows a title.
Nowhere does it say "6 of 9" or "three more." Design principle 4 asks for "simple and
exciting rather than overwhelming"; nine numbered chips in a scrolling strip is the
overwhelming presentation.

**B5 — The camera never reacts to the step.**
`CakeScene.tsx` frames the whole cake at all times. On the Filling step the interesting
surface is the *interior* — and there is a `sliced` view that shows exactly that, sitting
behind a manual "Cut a slice" button the customer has to discover. On the Message step
the plaque already lifts (`composingMessage`), which proves the pattern works. It should
be the rule, not the exception.

**B6 — "Cut a slice" is a floating unlabelled-context button over the artwork.**
`BuilderShell.tsx:112–126`, `absolute bottom-3 left-3`, `bg-paper/90`, border at
1.79:1. It's the only camera/view control in the product, it sits on top of the cake
board, and there is no reset-view, no zoom hint, and no indication the canvas is
draggable at all.

**B7 — Undo/redo/Start again sit in the global header at 36px.**
`UndoBar.tsx`. "Start again" — a destructive action that clears the whole design and
the undo stack (`UndoBar.tsx:58`) — is a plain 36px bordered button with no
confirmation, sitting next to Undo, at the top right of every step.

**B8 — Price deltas are shown per-option but never accumulated in view.**
`OptionGrid` shows `+₹295` on a card. The running total lives in the docket, 700px
away on desktop and behind a tap on mobile. The causal link between "I chose Ruffle"
and "the total went up ₹295" is never drawn on screen.

---

## 8. Mobile UX problems

**M1 — The 1024px case is broken, and it's the most common laptop width.**
At exactly `lg` the docket is **214px** wide → 190px content box → ~28 characters of
11px Martian Mono → with a 46px label column, ~20 characters for the value.
`DocketLine.tsx:59` uses `break-words`, so `AMERICAN BUTTERCREAM` renders as:

```
FROST   AMERICA
        N
        BUTTERC
        REAM
```

Verified live. The trust surface — the thing the entire value proposition rests on —
is producing garbage at 1024px. The controls column at 297px simultaneously wraps
"Whipped / Cream", "American / Buttercream", "Swiss / Meringue".

**M2 — 61% of a phone screen is chrome before the first choice.** (Measured, see §4 S5.)

**M3 — The step nav is a horizontal scroller with no scroll affordance.**
`StepNav.tsx:53`: `overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`.
Verified at 375: labels are hard-clipped at both edges mid-word ("g" for Filling) with
no fade mask, no chevron, and the scrollbar deliberately hidden. Nothing indicates
there are nine steps or that the strip moves.

**M4 — The mobile docket sheet is a modal that doesn't know it's a modal.**
`BuilderShell.tsx:149–162`. Tapping the total bar renders a `max-h-[40dvh]` scroll
region that **completely covers the controls**. Verified: on `/build/toppings` the
entire option list disappears behind it. It has no scrim, no drag handle, no rounded
top, no elevation, no close button, no focus trap, no `Escape` handler — and the last
visible line is sliced in half by the bar. On desktop you can see options and price at
once; on mobile you must choose.

**M5 — No safe-area inset.** (§4 S6.) The primary mobile control sits under the home
indicator.

**M6 — The mobile cake pane is a letterbox, and it is cropped.**
32dvh at 375 wide is a 375×260 pane — aspect 1.44:1. `CakeScene`'s `Framing` fits
`max(needV, needH)`, so on a wide-short pane the cake is height-constrained and fills
it top to bottom with no margin. Verified: the board's edge is ~8px off the bottom
border and "Cut a slice" overlaps it.

**M7 — Time-to-visible-cake on mobile is poor.** At 375 with the LOW quality tier, the
canvas was still an empty gradient at 5s. `SceneSkeleton` ("Warming the oven") covers
the dynamic-import window but *not* the WebGL first-frame window, so there is a long
stretch showing an empty warm rectangle with no explanation.

**M8 — Mobile is the desktop layout with `lg:` prefixes removed.**
There is no mobile-specific composition anywhere: same three regions, same order,
stacked. Design principle 7 explicitly rules this out.

---

## 9. Navigation / progress problems

**N1 — Nine equal chips is the wrong mental model.** The nine steps are not nine equal
decisions: Shape/Size are *structural*, Sponge/Filling are *flavour*, Frosting/Finish/
Toppings/Message are *appearance*, Review is *checkout*. Presenting them as a flat
1..9 strip is why it feels like a long form.

**N2 — Progress is a 1px hairline at 1.30:1 relative contrast.** `StepNav.tsx:85–89`.
It is the only "how far along am I" signal and it is nearly invisible.

**N3 — Completion is asserted, not measured.** `StepNav.tsx:56`: `n < i ? "done"`.
A step is "done" purely because you walked past it. Skipping straight to `/build/review`
(which `presets/page.tsx:53` deliberately does) marks all nine done having chosen
nothing.

**N4 — Two navigation systems, neither aware of the other.** The chip strip at the top,
`StepFooter` at the bottom of every step. `StepFooter` also owns the arrow-key handler
(`StepNav.tsx:121–130`) and the blocker messaging, so the *footer* controls the *header's*
semantics.

**N5 — The blocked-Next affordance is `aria-disabled` on a link that still points at
`pathname`.** `StepNav.tsx:153–155`. Functionally sound and the deep-link fallback is
excellent, but the message appears *below* the button as 13px seal text, which is the
smallest presentation of the most important blocking information in the flow.

**N6 — Arrow-key step navigation is undiscoverable and fires globally.**
`StepNav.tsx:121–130` binds ArrowLeft/ArrowRight on `window` whenever focus is on
`body` or `MAIN`. Nothing on screen mentions it. It also collides conceptually with
`OptionGrid`'s arrow-key roving tabindex — same keys, different meaning, one step apart
in the focus order.

**N7 — Review is step 9 of 9 and also the destination for every preset.**
So Review must work both as "the end of a journey" and as "a landing page for a cake
you didn't build." It currently does neither well.

---

## 10. Pricing / docket presentation problems

**P1 — Three simultaneous presentations of the same price on Review.**
`review/page.tsx:206` renders `<PriceBreakdown>` inside the centre column, the
`Docket` renders another `<PriceBreakdown dense>` on the right, and the "Place order ·
₹1,604.80" button repeats the total a third time. Three renderings of one number,
none of them the definitive one.

**P2 — The docket duplicates the review spec sheet almost line for line.**
`Docket` rows: shape / size / tiers / sponge / layers / fill / frost / cover / finish /
deliv. Review `<Section title="Cake">` rows: shape+tiers / weight / serves / sponge+
layers / filling / frosting+coverage+finish / toppings / message. Same facts, two
typographic systems, side by side, 400px apart.

**P3 — The mobile total bar is the quietest element on screen.**
`Docket.tsx:117`: `border-t border-rule bg-paper` — a 1.30:1 top border and a
background 1.4% off the page. The label is 11px steel mono. This is the persistent
anchor of the entire trust proposition on a phone and it has less presence than an
unselected option card.

**P4 — Deltas and totals use different currency formats.**
`format.ts`: `formatDelta` → `+₹295` (whole rupees, `−` U+2212 for negative);
`docketAmount` → `₹1,604.80` (2dp); `formatINR` → `₹1,604.80`; and `Docket.tsx:126`
hand-rolls a *fourth* format (`₹1,605`, no decimals, inline `toLocaleString`) for the
mobile bar. So the mobile bar says ₹1,605 while the docket one tap away says ₹1,604.80.

**P5 — The docket is never explained.** It appears fully-formed at step 1 with eleven
abbreviated mono rows and `#MC-3606`. A first-time customer has no way to know this is
a real kitchen artifact rather than decoration — which is the whole point of it being
there.

**P6 — `PriceBreakdown` has a `dense` prop that changes only two numbers.**
`PriceBreakdown.tsx:21–22`: `text-micro leading-[1.9]` vs `text-meta leading-[2]`.
An 11-vs-13px switch is not two variants, it's a magic boolean.

**P7 — The GST line reads `GST @ 18%` and the subtotal is above it, but nothing marks
the total as tax-inclusive** in any of the three places the total appears outside the
breakdown — including the button the customer presses to buy.

---

## 11. Interaction / micro-animation opportunities

Existing motion is small, deliberate and well-gated. Three keyframes, three durations,
two easings, all documented. Keep this discipline. What's missing is **connective**
motion — motion that explains causality — rather than more decoration.

| # | Opportunity | Why it earns its place |
|---|---|---|
| A1 | **Tap → cake → price, choreographed as one gesture.** Option card acknowledges (90ms) → camera nudges toward the changed feature (180ms) → docket line highlights → total ticks (340ms), in that order with ~60ms offsets. | Fixes §7 B3. Four unrelated twitches become one causal chain. Uses existing `--dur-tap/ui/settle`. |
| A2 | **Delta flies from the option card to the total.** A 13px `+₹295` that travels and lands. | Fixes §7 B8. Draws the one line the product never draws. |
| A3 | **Step transition: cake holds, controls cross-fade.** Controls out 90ms / in 180ms with a 8px rise; the canvas never re-mounts. | Makes 9 steps feel like one surface rather than nine pages. `BuilderShell` already scrolls-to-top and moves focus on `pathname`; hook the transition to the same effect. |
| A4 | **Camera framing per step.** Filling → auto-slice + interior framing. Finish → close on the side wall. Toppings → raise to a 3/4-high angle. Message → the existing plaque lift. Review → the existing autoRotate. | Fixes §7 B5. All of it is `Framing`'s `target` memo plus `useView`; no new geometry, no new draw calls. |
| A5 | **Live material preview on the finish/topping cards.** Not a second canvas — a pre-baked sprite sheet or a small `<canvas>` rendered *once per option* at build time. | Fixes §7 B2 without touching the render budget. See §13. |
| A6 | **Progress as a filling vessel, not a hairline.** The 1px rule becomes a 3px rounded track with an eased fill, segmented by phase (structure / flavour / appearance / checkout). | Fixes §9 N1, N2. |
| A7 | **Docket line "prints" on first appearance only.** A 1-row upward slide when a row is *added* (e.g. first topping). Never on value change. | The typewriter was rightly killed (`DocketLine.tsx:13–25`). A row *appearing* is a different event and can carry motion honestly. |
| A8 | **Blocker: the offending option shakes once, then the fix button pulses.** 90ms, one cycle. | Turns a red note into a correction. |
| A9 | **Mobile sheet: real spring-driven bottom sheet with a drag handle.** | Fixes §8 M4. |
| A10 | **Skeleton → cake cross-fade.** Fade the `SceneSkeleton` out on the canvas's first rendered frame rather than on module load. | Fixes §8 M7 — the empty-gradient gap. |

All of the above must sit behind `prefers-reduced-motion`. Note `globals.css:160–168`
already nukes CSS animation/transition durations globally, so CSS-based additions are
covered automatically; JS/R3F additions must go through `useReducedMotion()`.

---

## 12. Accessibility considerations

### Preserve (do not regress — these are tested)

- `role="radiogroup"` + `role="radio"` + `aria-checked` + roving `tabIndex` in `OptionGrid`, and its arrow-key handler. `e2e/a11y.spec.ts:41–66` asserts the exact Round→Heart traversal.
- The `role="img"` + `aria-label={describeCake(config)}` wrapper (`BuilderShell.tsx:95`), and the fact that the label is on the canvas *wrapper* and not the pane — the comment at 91–94 explains why, and moving it would nest the "Cut a slice" button inside an image role.
- `<aside aria-label="Order docket">` — `e2e/a11y.spec.ts:64` and `happy-path.spec.ts:20` both query by that accessible name.
- The keyboard-reachable scroll region (`Docket.tsx:44–49`, `tabIndex={0} role="region"`).
- The polite `aria-live` total (`BuilderShell.tsx:138`).
- Focus move + scroll reset on step change (`BuilderShell.tsx:43–48`).
- `:focus-visible` ring (`globals.css:93–97`) — 2px ink at 17.56:1.
- `aria-describedby={`why-${o.value}`}` on blocked options.
- `aria-expanded` on the mobile total bar.

### Fix (genuine gaps found in this audit)

| ID | Issue | Standard |
|---|---|---|
| **AX1** | `rule` @ 1.30:1 and `rule-strong` @ 1.79–2.16:1 as the sole boundary of interactive controls and containers | 1.4.11 Non-text Contrast |
| **AX2** | Disabled "Place order" at `bg-slab-deep` on paper = 1.37:1 | 1.4.11 |
| **AX3** | Touch targets at 31–36px: landing CTA, undo/redo/start-again, `LoadConfig`, review secondary buttons, topping "Remove" | 2.5.8 Target Size (Minimum), AA in WCAG 2.2 |
| **AX4** | Mobile docket sheet: no focus trap, no `Escape`, no scrim, content behind it still tabbable | 2.4.3 Focus Order, 2.1.2 No Keyboard Trap (inverse) |
| **AX5** | `scrollIntoView({behavior: "smooth"})` at `StepNav.tsx:45` is not gated by reduced-motion — the CSS `scroll-behavior: auto !important` does **not** override the JS option | 2.3.3 Animation from Interactions |
| **AX6** | Step nav horizontal scroller hides its scrollbar and gives no other affordance; keyboard users tabbing into it get no scroll indication | 1.3.1 / 2.4.7 |
| **AX7** | `ViolationCard` mounts `role="alert"` already-populated, so it announces on arrival rather than on change | 4.1.3 Status Messages |
| **AX8** | Colour-picker swatches convey their name only via `title` + `sr-only` — sighted mouse users get a tooltip, sighted keyboard users get nothing | 1.4.1 Use of Colour (adjacent) |
| **AX9** | `text-[10px]` step numerals (`StepNav.tsx:71`) | 1.4.4 (adjacent) / the codebase's own rule |
| **AX10** | No `prefers-contrast: more` handling anywhere | Enhancement |

### Add

- A skip link to the controls region — the builder header contains 9 step links + 3 undo controls before `<main>`.
- `aria-current="step"` is present; add a visually-hidden `"Step 6 of 9"` to `StepHeader`.
- `aria-live="polite"` on the "N of 4 toppings" count.

---

## 13. Performance considerations

### Constraints that must not regress

- **Determinism.** `e2e/visual.spec.ts` pixel baselines exist only because scatter, drips and jitter are seeded from a config hash. Any change touching `components/three/` risks the six committed baselines.
- **`frameloop="demand"`** for non-interactive canvases (`CakeScene.tsx:61`). This is what keeps 8 gallery canvases from spinning 8 render loops.
- **Quality tiering** (`lib/quality.ts`) — guess by cores/memory/UA, then a 1.2s real FPS probe, downgrading to LOW under 40fps.
- **`LazyCakeScene`** — `ssr: false` + dynamic import keeps the three/R3F bundle off the critical path.

### Measured problems

**PF1 — Eight simultaneous WebGL contexts on `/presets`.** Verified: 8 canvases,
35MB JS heap, and **~14 seconds** at 1024px before all eight showed a cake. Each
context builds its own `<Environment resolution={256}>` cubemap from five
Lightformers. Browsers cap contexts around 16, and Safari/iOS is stricter and will
start evicting.

*Fix without touching the renderer:* render the eight presets to static images at
build time (a `scripts/shoot.ts` already exists and does exactly this kind of capture),
show those, and mount a live canvas only on hover/focus/intersection for the card the
user is actually looking at. This is a pure win — faster, cheaper, and it makes the
gallery load instantly.

**PF2 — Four contexts on the landing page** (hero + 3 preset cards) for the same
reason. Same fix: hero stays live, cards become images.

**PF3 — `Docket` and `DocketTotal` each call `buildDocket(config)` in their own
`useMemo`.** On mobile with the sheet open both run per change. `BuilderShell.tsx:56`
calls it a **third** time for the live-region total. Three builds of the same object
per keystroke.

**PF4 — `OptionGrid` calls `blockerFor()` and `deltaFor()` per option per render.**
`OptionGrid.tsx:74–75`. On the sponge step that's 13 options × 2 full rule/price
evaluations on every store change, including every character typed into the message
field (the message step also renders `OptionGrid` for delivery). Not currently a
visible problem; it will become one if option cards gain previews.

**PF5 — Font payload.** Three families, one of them (Martian Mono) shipped in four
static weights for a component that uses two.

### Budget for the redesign

| Rule |
|---|
| Live WebGL contexts per page: **1** (builder) or **1 on demand** (galleries). |
| No new geometry, no new materials, no new draw calls in `components/three/`. |
| Option-card previews are **pre-rendered sprites**, never live canvases. |
| Camera-framing changes go through `Framing`'s existing `target` memo only. |
| Any change under `components/three/` requires `npm run visual` before and after. |

---

## 14. Recommended design system

**Direction: "the kitchen and the counter."** Keep the paper/ink/docket identity
entirely — it is the product's best asset. Add the one thing it lacks: a *counter* —
a warm, tactile surface with real depth, that the cake sits on and the controls sit
against. Two surfaces, not one; the docket keeps its ticket language exactly as it is.

No glass. No gradients beyond the existing stage. No neon. The palette below adds two
tokens and fixes four; it does not repaint the product.

### 14.1 Colour

```
/* Keep exactly as-is — these are correct and measured */
--color-ink:        #17161a
--color-graphite:   #3f3d3a
--color-steel:      #55524b
--color-slab:       #e9e7e2
--color-slab-deep:  #dcd9d2
--color-paper:      #fdfcfa
--color-seal:       #a8241b

/* FIX — non-text contrast (§5, AX1/AX2) */
--color-rule:        #c4c0b6   /* was #cfccc4 → 1.30:1; now ≈1.6:1, decorative only */
--color-rule-strong: #8e887a   /* was #b3aea3 → 1.79:1; now ≥3.0:1 on slab AND paper */

/* ADD — the counter, so the cake has something to sit on */
--color-counter:      #e2ded5   /* the 3D pane's frame + mobile sheet ground */
--color-counter-deep: #d3cec2   /* pressed / recessed */
```

**Rules.** `rule` is decorative only (dividers inside a container that already has a
boundary). Any control whose boundary is its *only* affordance uses `rule-strong`.
`seal` keeps its single meaning: blocked / needs attention. Never a total, never a
price, never a hover.

**Retire the alpha soup.** `bg-paper/60|70|85|90` and `bg-slab-deep/40|80` collapse to
four named surfaces:

| Token | Value | Used for |
|---|---|---|
| `surface-page` | `slab` | page ground |
| `surface-raised` | `paper` | cards, docket, sheets |
| `surface-sunken` | `counter` | the 3D stage frame, inset wells |
| `surface-pressed` | `counter-deep` | disabled, blocked, active-pressed |

### 14.2 Elevation

Currently one shadow. Three:

```
--elev-1: 0 1px 0 rgb(0 0 0/.04), 0 2px 6px -3px rgb(23 22 26/.10)   /* cards at rest */
--elev-2: 0 1px 0 rgb(0 0 0/.05), 0 8px 24px -12px rgb(23 22 26/.16) /* = current paper-edge; docket, hero panel */
--elev-3: 0 2px 0 rgb(0 0 0/.05), 0 24px 48px -20px rgb(23 22 26/.26) /* mobile sheet, the only overlay */
```

Keep `paper-edge` as an alias for `--elev-2` so the 12 existing usages don't churn.

### 14.3 Radii

One scale, and move off 2px:

```
--radius-xs: 4px    /* chips, swatch rings, docket highlight */
--radius-sm: 8px    /* option cards, inputs, buttons */
--radius-md: 12px   /* panels, preset cards, the 3D stage frame */
--radius-lg: 20px   /* mobile sheet top corners, hero panel */
--radius-full: 9999px
```

Migration: `rounded-sm`(47) → `radius-sm`; `rounded-md`(9) → `radius-sm` for buttons,
`radius-md` for panels; the three ad-hoc pixel values → nearest step.

### 14.4 Type

Fill the hole above 18px and give the display face a real range. Keep every existing
token — nothing below `--text-lede` changes, so the docket is untouched.

```
/* unchanged */
--text-micro: 0.6875rem  /* 11 — docket only */
--text-meta:  0.8125rem  /* 13 — captions, deltas */
--text-body:  0.9375rem  /* 15 — prose */
--text-item:  1.0625rem  /* 17 — the name of a choosable thing */
--text-lede:  1.125rem   /* 18 — step subheads, hero blurb  (absorbs the old 17/18 overlap) */

/* NEW — the missing display scale */
--text-title:   1.625rem                        /* 26 — step titles, card headings */
--text-heading: clamp(1.75rem, 2.6vw, 2.25rem)  /* 28–36 — section heads */
--text-display: clamp(2.5rem, 6vw, 4.5rem)      /* 40–72 — landing h1, order confirmation */
```

- **Bricolage** — display only: `--text-title` and up. Use the `wdth` axis: 96 at
  display sizes (as now), 100 at title. Weight 600 at display, 500 at title.
- **Inter** — all body, labels, buttons, blurbs. Weights 400/500 only.
- **Martian Mono** — docket, prices, references, pincode. **Ship 400 and 700 only**
  (drop 500/600 from `layout.tsx:23`).
- Kill `text-2xl` / `text-3xl` / the three `clamp()` one-offs — 8 sites total.
- Kill `text-[10px]` → `--text-micro`.
- Single source of truth for step hints: delete the literals in the nine page files,
  read `STEPS[i].hint`.

### 14.5 Space

One scale, used everywhere, with **named section rhythm** so §4 S1 stops recurring:

```
--space-1: 4px   --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 24px  --space-6: 32px  --space-7: 48px  --space-8: 64px  --space-9: 96px

--gap-inline:  var(--space-2)   /* label ↔ value */
--gap-stack:   var(--space-3)   /* items within a group */
--gap-group:   var(--space-5)   /* group ↔ group inside a step */
--gap-section: var(--space-7)   /* section ↔ section on a marketing page */
```

Plus: `--measure-controls: 34rem` (max-width for the controls column, fixing §4 S2)
and `--measure-prose: 62ch`.

### 14.6 Motion

Keep `--ease-out`, `--ease-spring`, `--dur-tap/ui/settle` exactly. Add only:

```
--dur-sheet: 420ms          /* bottom sheet in/out */
--stagger:   60ms           /* the tap→cake→price chain offset */
```

### 14.7 Components (the shared primitives that don't exist yet)

| Primitive | Replaces | Notes |
|---|---|---|
| `<Button variant="primary\|secondary\|quiet" size="md\|lg">` | 7 hand-rolled button strings | `md` = 44px, `lg` = 52px. Never below 44. |
| `<Field label hint error>` | 6 hand-rolled `<label><span/><input/></label>` blocks | message, pincode, name, phone, topping placement/density |
| `<Group title description>` | `<fieldset><legend class="text-meta text-steel">` × 6 | Gives group headings real weight (§2 H4) |
| `<Choice>` / `<ChoiceGrid>` | `OptionGrid` + the 3 divergent copies in size/toppings/finish | One selected language, one blocked language |
| `<Sheet>` | the ad-hoc mobile docket panel | Focus trap, Escape, scrim, drag handle, `--elev-3` |
| `<Money value variant>` | 4 currency formats | One place decides decimals. Fixes §10 P4. |
| `<Stat label value>` | review `<Row>` + docket line duplication | |

---

## 15. Page-by-page redesign plan

### 15.1 Landing — `app/page.tsx`

*Goal: the cake is the page, not an illustration beside it.*

1. **Full-bleed hero.** Cake stage becomes the background of the hero section
   (min 70vh), copy overlays at the left on a readable scrim. Kill the `1fr/1.1fr`
   grid and the `max-w-sm` copy clamp.
2. **Hero canvas keeps `autoRotate` and stays the page's one live context.**
3. **Display type.** h1 → `--text-display`. Section heads → `--text-heading`.
4. **Preset cards → static pre-rendered images** (§13 PF2), live canvas on hover/focus
   only. Equal-height cards via `grid-rows-subgrid` so the CTAs align (§4 S4).
5. **Card footer restructure:** name + serves on one line, price as a right-aligned
   mono figure at `--text-item`, blurb below, whole card is the link (it already is).
6. **Nav CTA → `<Button size="md">`** (44px, fixes AX3).
7. Add a quiet third section: the docket itself, shown as an artifact, with one line
   explaining what it is (fixes §10 P5).

### 15.2 Presets — `app/presets/page.tsx`

1. **Add `cake-stage`** to the image wells (§5 C4) — one class, fixes 8 invisible cakes.
2. **Static images + on-demand canvas** (§13 PF1). 14s → instant.
3. Editorial header at `--text-heading`, description at `--measure-prose`.
4. Equal-height cards, aligned CTAs, `<Button>` at 44px.
5. Add filter chips by occasion/size — the catalog data already supports it and 8 cards
   in a 3-col grid currently has no organising idea.

### 15.3 Builder shell — `app/build/BuilderShell.tsx`

**The single highest-value change in this plan.** Replace fixed percentages with a
constrained grid:

```
Desktop (≥1280):  minmax(420px, 1fr) │ minmax(360px, 34rem) │ 22rem
Laptop (1024–1279): minmax(380px, 1fr) │ minmax(340px, 30rem) │ 20rem   /* 320px docket */
Tablet  (768–1023): cake on top (44dvh) │ controls below │ docket in sheet
Mobile  (<768):     new composition, see below
```

The docket gets a **fixed `rem` width (min 20rem = 320px)**, not a percentage. At
1024 that yields ~296px of content box ≈ 43 characters — `AMERICAN BUTTERCREAM` fits
on one line with room to spare. **This alone fixes §8 M1.**

Then:
1. **Frame the cake.** The stage becomes an inset panel on `surface-sunken` with
   `--radius-md`, `--space-5` of padding, and `--elev-2` — a lit worktop with an edge.
   Gives the cake margin (§4 S3) and separates the panes (§2 H2) without a hairline.
2. **Controls column gets `max-width: --measure-controls`** and centres in its track.
3. **Camera controls become a proper cluster** bottom-right of the stage: Cut a slice /
   Reset view / a drag hint. `rule-strong` boundaries at ≥3:1.
4. **Header slims.** Logo + phase progress + a single overflow for undo/redo/start again.
   "Start again" moves behind a confirm.
5. **Mobile composition (new, not a stack):**
   - Cake pinned top, 38dvh, framed, with the step title overlaid at its bottom edge
   - Controls scroll beneath in a rounded sheet that *overlaps* the cake pane by 16px
   - Persistent bottom bar: `‹ back · [Step 6 of 9] · ₹1,605 ▲ · next ›` — one bar that
     is progress, price, and navigation, with `env(safe-area-inset-bottom)`
   - Tapping the price opens a real `<Sheet>` at 72dvh with scrim and handle, **and the
     controls remain visible behind the scrim** (fixes M4)
6. Skeleton cross-fades on first WebGL frame, not on module load (§13 / A10).

### 15.4 Step pages — `app/build/{shape,size,sponge,filling,frosting,finish,toppings,message}`

1. All nine adopt `<Group>` for section headings — real weight, real separation (§2 H4).
2. All nine drop their duplicated hint literals; `StepHeader` reads `STEPS[i]`.
3. `size`, `toppings`, `finish` drop their bespoke option buttons for `<ChoiceGrid>` —
   one selected language, one blocked language (§6).
4. `finish`: **texture previews on the finish cards** (pre-rendered sprites) — the
   highest-value single UX change after the layout fix (§7 B2).
5. `toppings`: **rendered thumbnails instead of colour dots**, plus a "3 of 4 chosen"
   counter with `aria-live`.
6. `finish` + `message`: colour swatches get visible names on focus/hover, not just
   `title` (AX8).
7. `message`: the plaque preview is the best interaction in the product — surface it.
   Show the live plaque text on the cake *and* echo it in the field.

### 15.5 Review — `app/build/review/page.tsx`

*Currently the weakest screen. It should be the best.*

Restructure from a single 420px scroll into a **two-column review** that uses the space
the canvas is wasting:

1. **Left (where the canvas was): the cake, large, auto-rotating, with the slice toggle.**
   This is the "here is what you made" moment and it currently doesn't exist.
2. **Right: one column, three blocks:**
   - **The docket, full size and legible** — promoted from the 214px rail to the
     primary artifact. Delete the duplicated `<Section>` spec rows entirely (§10 P2).
   - **Contact** — name + phone via `<Field>`, at `--text-item`.
   - **Purchase** — total at `--text-title` in mono, GST-inclusive note, then a
     `size="lg"` primary button. One total, one place (§10 P1).
3. Secondary actions (Save & share / Download docket) become quiet buttons below,
   at 44px.
4. Delivered photos move above the fold as a thin strip — social proof belongs before
   the button, not after it.
5. `Placed` state gets `--text-display` for the order reference and keeps the docket
   with the `stamp` utility applied. That stamp is a great asset used once.

### 15.6 Share pages — `app/d/[slug]`, `app/d/new`

Inherit the Review right-column treatment. Add `cake-stage` (both currently use
`bg-paper`, same bug as presets). Single live canvas, `autoRotate`, framed.

### 15.7 404 — `app/not-found.tsx`

`--text-display`, `<Button size="lg">`. Two-line change.

---

## 16. Component-by-component redesign plan

| Component | Change | Fixes |
|---|---|---|
| `app/globals.css` | Add display type scale, space scale, elevation scale, radius scale, `counter` tokens; fix `rule`/`rule-strong`; keep all existing tokens and utilities | §3 T1, §4 S1, §5, §14 |
| `app/layout.tsx` | Drop Martian Mono 500/600 | §3 T3, §13 PF5 |
| `BuilderShell` | `minmax()` grid with rem-locked docket; framed stage; slimmed header; new mobile composition with unified bottom bar + safe-area | §7 B1, §8 M1/M2/M4/M5/M8, §2 H2 |
| `StepHeader` | Add step number ("6 of 9" + sr-only), read hint from `STEPS`, `--text-title` | §2 H4, §3 T6, §9 N1 |
| `StepNav` | Phase-grouped progress (structure/flavour/appearance/checkout); 3px eased track; edge fade masks on the scroller; `--text-micro` numerals; gate `scrollIntoView` on reduced-motion | §9 N1/N2, §8 M3, AX5, AX9 |
| `StepFooter` | `<Button>` primitives at 44px; blocker message promoted to `--text-body` above the button with the fix inline | §6, §9 N5 |
| `OptionGrid` → `ChoiceGrid` | Extract `<Choice>`; add optional `preview` slot (sprite); selected state keeps invert but gains `--elev-1` and loses some slab-weight; unselected gets a `rule-strong` boundary; one blocked language; `--radius-sm` | §2 H3, §5 AX1, §6, §7 B2 |
| `ColorPicker` | Visible swatch names on hover/focus; 44px targets; `rule-strong` ring on unselected; clamp explanation gets an icon | AX3, AX8 |
| `ViolationCard` | Render the container empty and populate on change so `role="alert"` announces changes not arrivals; add the shake+pulse choreography | AX7, A8 |
| `UndoBar` | 44px targets; collapse into an overflow menu below `xl`; "Start again" behind a confirm | AX3, §7 B7 |
| `LoadConfig` | `<Button size="md">` | AX3 |
| `Docket` | Keep the ticket language **exactly**; drop the duplicated `MAKEMYCAKE` header (keep `#MC-3606`); lift `buildDocket` to a shared hook | §2 H6, §13 PF3 |
| `DocketLine` | `overflow-wrap: anywhere` → `break-word` at word boundaries only, now that the column has room; keep the change-highlight | §8 M1 |
| `PriceBreakdown` | Replace `dense` boolean with `size="sm"\|"md"`; route all amounts through `<Money>`; mark the total tax-inclusive | §10 P4/P6/P7 |
| `DocketTotal` | Becomes part of the unified mobile bar; uses `<Money>` (kills the 4th format); `--elev-3`; safe-area padding | §10 P3/P4, §8 M5 |
| `CakePreview` | `static` prop → renders a pre-shot image with a live canvas on interaction | §13 PF1/PF2 |
| `LazyCakeScene` / `SceneSkeleton` | Cross-fade on first frame, not on import | §8 M7, A10 |
| `CakeScene` | **`Framing.target` gains a `step` input** for per-step framing. No geometry, no materials, no lights touched. | §7 B5, A4 |
| `components/three/*` | **No changes.** | §13 |
| `lib/format.ts` | One `Money` formatter with variants; `formatDelta`/`docketAmount`/`formatINR` become thin wrappers | §10 P4 |
| `lib/catalog.ts` | Add `preview` sprite refs to `FINISHES` and `TOPPINGS`; add `phase` to `STEPS` | §7 B2, §9 N1 |
| `lib/rules.ts`, `lib/pricing.ts`, `lib/docket.ts`, `lib/schema.ts`, `lib/delivery.ts`, `app/api/**`, `prisma/**` | **No changes.** | Principle 13 |

---

## 17. Implementation order

Sequenced so that every phase ships something visible, nothing depends on a later
phase, and the risky work (anything near `components/three/`) happens last with the
visual baselines as the gate.

### Phase 0 — Baseline (before any edit)
```bash
npm run typecheck && npm test && npm run visual && npm run a11y && npm run e2e
```
Record the results. `npm run visual` in particular — the six committed PNGs are the
only thing standing between a layout change and a silent render regression.

### Phase 1 — Tokens *(no visual change intended; low risk, unblocks everything)*
`app/globals.css` + `app/layout.tsx`. Add the display/space/elevation/radius scales
and the `counter` tokens. Fix `rule` and `rule-strong`. Drop two font weights.
**Gate:** `npm run visual` — expect small diffs only where `rule` appears; re-baseline
deliberately if so.

### Phase 2 — Primitives *(pure extraction, no page changes)*
`<Button>`, `<Field>`, `<Group>`, `<Money>`, `<Stat>`. Ship them unused.
**Gate:** `npm run typecheck && npm test`.

### Phase 3 — The 1024px fix *(highest value per line changed)*
`BuilderShell` grid → `minmax()` with a rem-locked docket. `DocketLine` word-breaking.
**Gate:** manual check at 1024 / 1280 / 1440 / 1920 + `npm run visual` (the
`builder.png` baseline **will** change — re-baseline intentionally).

### Phase 4 — Hierarchy pass *(the redesign becomes visible)*
Framed cake stage. `StepHeader` with step position. `StepNav` phase progress + edge
masks + reduced-motion gate. `<Group>` adopted across all nine steps. Hint
deduplication. All buttons → `<Button>` at 44px.
**Gate:** `npm run a11y` + `npm run e2e` — `happy-path.spec.ts` queries buttons and
links by accessible name; keep every name identical.

### Phase 5 — Mobile composition *(the largest single UX gain)*
New mobile layout: overlapping controls sheet, unified bottom bar (back / step / price /
next), safe-area insets, real `<Sheet>` with focus trap + Escape + scrim.
**Gate:** 375 / 390 / 414 / 768 manually; `npm run a11y`.

### Phase 6 — Choice components *(consolidation)*
`ChoiceGrid` + `Choice`. Migrate `size`, `toppings`, `finish` off their bespoke buttons.
One selected language, one blocked language.
**Gate:** `npm run a11y` — the radiogroup traversal test at `a11y.spec.ts:41` is the
canary. `npm run e2e` for the `getByRole("radio")` queries.

### Phase 7 — Gallery performance *(pure win, no design risk)*
Pre-render preset images via `scripts/shoot.ts`. `CakePreview` static mode. Landing and
presets drop from 4 and 8 live contexts to 1 and 0.
**Gate:** measure canvas count + time-to-visible at 1024. Target: presets interactive
under 1s vs the current ~14s.

### Phase 8 — Review redesign
Two-column review, docket promoted, spec-row duplication deleted, one total, purchase
block. `Placed` state at display scale with the stamp.
**Gate:** `npm run e2e` end to end — this touches the order path's UI. **No changes to
`place()`, `save()`, `/api/orders`, `/api/price`, or `canSubmit`.**

### Phase 9 — Landing + presets + share pages
Full-bleed hero, editorial scale, equal-height cards, `cake-stage` on presets and both
share pages, the docket-as-artifact section.
**Gate:** `npm run visual` (`landing.png` re-baselines), `npm run a11y`.

### Phase 10 — Motion & previews *(last, because it's nearest the renderer)*
The tap→cake→price choreography (A1). Delta flight (A2). Step cross-fade (A3).
Per-step camera framing (A4). Pre-rendered finish/topping sprites (A5). Skeleton
cross-fade (A10).
**Gate:** `npm run visual` with `prefers-reduced-motion` forced both ways; verify
`frameloop="demand"` still holds on non-interactive canvases; verify the six
determinism baselines still pass.

### Standing constraints for every phase

- No changes to `lib/pricing.ts`, `lib/rules.ts`, `lib/schema.ts`, `lib/docket.ts`, `lib/delivery.ts`, `lib/allergens.ts`, `lib/servings.ts`, `prisma/`, or `app/api/`.
- No changes to `components/three/` except `CakeScene.tsx`'s `Framing.target` in Phase 10.
- Accessible names in `e2e/happy-path.spec.ts` and `e2e/a11y.spec.ts` are a public API. Changing visible button/link text means updating those tests in the same commit, deliberately.
- Every phase ends green on `typecheck`, `test`, `a11y`, and `e2e`. `visual` may re-baseline, but only as an explicit, reviewed commit.

---

## Open questions for you

1. **Preset images.** Phase 7 pre-renders the 8 presets to PNGs at build time. That means committing ~8 images and regenerating them whenever the renderer changes. Acceptable, or would you rather keep live canvases and accept the 14s?
2. **Finish/topping previews.** Same trade: sprites are the only way to preview 6 finishes and 12 toppings without blowing the render budget. Confirm you want them.
3. **Dark mode.** Currently absent. My recommendation is to stay committed to light and write that down. Say if you'd rather have it.
4. **"Start again" confirmation.** It currently wipes the design and the undo stack with one click. I'd put it behind a confirm. That's a small behaviour change — flagging it because principle 11 says preserve functionality.
