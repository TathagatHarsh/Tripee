# MAKEMYCAKE — CARBON COPY
## Complete redesign blueprint

**Direction:** CARBON COPY, with the Room Temperature colour mechanic grafted in.
**One-line thesis:** The website is a working document. Every cake begins as a ticket and ends as a ticket, and the ticket exists twice — one copy for you, one copy for the kitchen.
**Signature element:** the ticket is the navigation. Nine decisions live as nine lines on one sheet. Choosing prints a line. Changing strikes one through. Tapping a layer of the cake opens the line that made it.

A note on what this is deliberately not: the current site is the default 2026 AI-design palette (warm cream, high-contrast display serif, terracotta accent). That look now reads as a template regardless of subject. CARBON COPY moves off every axis of it: mono instead of serif, **carbon violet-blue** as the dominant non-neutral instead of clay/terracotta, two distinct paper stocks instead of one cream, zero radius, zero shadow, zero display serif.

---

# 1. BRAND SYSTEM

## 1.1 Typography

**Two faces. No third. No bold anywhere in the product.**

| Role | Face | Why |
|---|---|---|
| Brand voice, all headlines, all ticket content, all UI labels, all numbers | **Geist Mono** (free, OFL) | Monospace is the voice of duplicate stationery and kitchen tickets. Neutral enough that the paper and ink treatment carries the character rather than the typeface being quirky. Real weight range, excellent at 11px and at 112px. |
| Anything longer than one line: option descriptions, the bakery page, paragraphs, error explanations | **Switzer** (Fontshare, free) | Neo-grotesque with slightly more warmth than Helvetica. Wide weight range. Quietly from an Indian foundry, which is the right kind of unspoken place signal. |

Paid upgrade path if budget appears later: swap Geist Mono for **ABC Diatype Mono** or **Berkeley Mono**, and Switzer for **ABC Diatype**. Nothing else in this system changes. Verify current licensing yourself; I'm working from memory on availability.

**The wordmark is not a font choice.** Set MAKEMYCAKE in Geist Mono, all caps, +0.14em tracking, then export it as an SVG treated as a **rubber stamp**: broken ink edges, slightly uneven density, one small gap. It ships as an asset, never as live text. It is allowed to sit at a seeded rotation between −2° and +2°.

### Weights — this is a hard rule

Geist Mono **400** and **500** only. Switzer **400** and **500** only. **No 600, no 700, ever.**

Emphasis in this system comes from case, colour, rule, box and stamp. Not from weight. A document does not get bold; it gets underlined, boxed, or stamped. Removing bold from the codebase is one of the fastest ways to make this feel like a document instead of a website.

### Type scale

Mono (Geist Mono). All uppercase except ticket *values*, which are uppercase too — the only lowercase mono is a customer-typed message.

```
--mono-xs    11px / 16px   +0.09em   uppercase   field names, micro labels, captions
--mono-sm    13px / 20px   +0.05em   uppercase   ticket values, prices, option prices
--mono-base  15px / 24px   +0.02em   uppercase   option labels, buttons, meta
--mono-lg    20px / 28px    0        uppercase   ticket totals, sheet headers
--mono-xl    32px / 36px   -0.01em   uppercase   section headings
--mono-2xl   48px / 50px   -0.02em   uppercase   mobile page headlines
--mono-3xl   72px / 70px   -0.03em   uppercase   desktop page headlines
--mono-4xl  112px / 102px  -0.035em  uppercase   homepage ticket number only
```

Switzer:

```
--text-sm    14px / 22px    0        allergen line, legal, photo captions
--text-base  16px / 26px    0        option descriptions
--text-lg    19px / 30px   -0.005em  lead paragraphs
--text-xl    24px / 34px   -0.01em   bakery page paragraphs
```

Measure: Switzer paragraphs never exceed **62 characters**. Mono ticket lines are full-width of their sheet and rely on dot leaders, not on measure.

### Where each is used

- **Every single thing on a ticket** is mono. No exceptions. This is what makes the ticket read as machine output.
- **Every headline on every page** is mono. There is no display serif in this brand.
- **Every number** is mono, and mono is inherently tabular, which is why prices align without `font-variant-numeric`.
- **Switzer appears only inside explanatory prose** — the one-line reason under an option, the paragraphs on the bakery page, error explanations, the two-copies section. Its job is to be the human voice next to the machine voice. If a piece of Switzer text is under six words, it should have been mono.

---

## 1.2 Colour system

Two ink colours, three paper stocks, one accent that changes with the cake.

### Papers

```css
--paper:    #E8E7E1;  /* TOP COPY. Cool grey-white bond. Not cream. Main background. */
--paper-2:  #DFD3B8;  /* MANILA. Kitchen-ticket stock. Carbon copies, second sheets, the kitchen page. */
--paper-3:  #CFC9BA;  /* CHIPBOARD. The desk. Behind sheets, builder viewport background, tray backs. */
```

The deliberate move: **the top copy is cool and the manila is warm.** That contrast is what makes two stocks read as two stocks rather than as one brand cream. Do not warm the top copy.

### Inks

```css
--ink:      #22211E;  /* Graphite. Never #000. All primary text. */
--ink-60:   #5C594F;  /* Secondary text, Switzer descriptions. */
--ink-35:   #918C7E;  /* Tertiary, dot leaders, placeholder carets, disabled. */
--ink-15:   #C2BCAC;  /* Hairline rules, sheet edges, input baselines. */

--carbon:   #3B3E93;  /* CARBON VIOLET-BLUE. The kitchen's ink. The brand's signature colour. */
--carbon-ghost: rgba(59,62,147,0.62);  /* Pressure-transfer ghosting on the second copy. */

--stamp:    #A82F27;  /* Stamp-pad red. Maximum four uses in the entire journey. */
```

**Rules of use.** `--carbon` means *the kitchen's version of this*. It appears on: the carbon copy sheet, callout leader lines on the specimen, the confirmed-by-phone stamp, live status lines, and hover-linkage between ticket and cake. Nothing else. `--stamp` means *stop* or *sealed*: lead-time failure, unavailable option, PRICE CONFIRMED, DELIVERED. Nothing else. There is no green, no yellow-warning, no blue-info. Semantic colour is these two, used sparingly enough that they still mean something.

### The dynamic ingredient accent (Room Temperature graft)

One variable, `--accent`, is set by the **sponge** choice. A secondary, `--accent-2`, is set by the **frosting** choice.

```css
/* Sponge → --accent */
--vanilla:      #E0CE9A;
--belgian-choc: #46291B;
--red-velvet:   #8A231F;
--butterscotch: #B2742D;
--coffee:       #563520;
--lemon:        #D8BA42;
--pineapple:    #DDB955;

/* Frosting → --accent-2 */
--whipped:      #F1EBDF;
--am-butter:    #EBD9B2;
--swiss-mer:    #EEE4D2;
--cream-cheese: #EDE1C9;
--dark-ganache: #2A1911;
--milk-ganache: #674028;
--white-ganache:#E7DBC2;
```

Three and only three things consume it:

1. **Paper warmth.** `background: color-mix(in oklab, var(--paper) 97%, var(--accent));` A 3% tint. Visible only as a change in room temperature, never as a theme.
2. **The specimen's key light.** Tinted 4% toward `--accent`. The cake and the page warm together.
3. **The active line marker** in the ticket gutter, 2px wide, `--accent` at full strength — the only place it appears at full saturation.

Transition: **600ms `ease-out`**. It is the slowest motion in the system, on purpose. If a user can point at it and say "the colour changed," it is too strong. Turn it down until they can only feel it.

---

## 1.3 Paper, ink and print treatment — without gimmick

The failure mode here is a site covered in fake coffee rings and torn corners. The discipline is: **one material, honestly used, at the background layer.**

1. **Paper grain is a body-level layer, never a per-component texture.** One scanned 512×512 uncoated-fibre PNG, tiled, at **4% opacity, `mix-blend-mode: multiply`**, applied once to `<body>`. Cards do not get their own texture. Sheets do not get their own texture. One grain for the whole world.

2. **No drop shadows except where one sheet lies on another.** When a sheet genuinely sits above another sheet (the ticket over the desk, the archive drawer over the ticket, a mobile option sheet over the ticket sheet), it gets:
   ```css
   border: 1px solid var(--ink-15);
   box-shadow: 0 12px 28px -20px rgba(34,33,30,0.40);
   ```
   Everything else has zero shadow. Buttons have zero shadow. Inputs have zero shadow.

3. **Perforation is used exactly twice.** Top edge of the ticket, and the tear line between the customer copy and the kitchen copy. Implementation: a 1px `dashed var(--ink-15)` line with a `repeating-radial-gradient` of paper-coloured 3px dots sitting on it. Nowhere else. If perforation appears on more than two elements it stops meaning "tear here."

4. **Ink density.** Printed ticket values render at `opacity: .92` with `text-shadow: 0 0 0.4px currentColor`. That sub-pixel bleed is what stops mono type from looking like a code editor. Apply to ticket values only, not to UI labels.

5. **Carbon ghosting.** The kitchen copy is the *same component* re-rendered with a modifier: colour `--carbon-ghost`, `letter-spacing: +0.01em`, and `transform: translate(0.5px, 0.5px)`. Pressure transfer is imperfect and slightly offset. One class, applied to the whole sheet.

6. **Stamps are SVG assets, not CSS.** Draw four: `PRICE CONFIRMED`, `NOTHING PAID YET`, `CONFIRMED BY PHONE`, `DELIVERED`. Broken outer rule, uneven ink density, one small void. Rotation seeded from the ticket number so it is stable per order and different per customer: `rotate(${(hash(ticketNo) % 9) - 4}deg)`.

7. **The banned list.** No coffee rings, no crumpled paper, no torn corners, no wood desks, no tape graphics, no paperclips, no pushpins, no skeuomorphic staples, no yellowed edges, no film-scratch overlays. Every one of these is available and every one of them turns this into a costume.

---

## 1.4 Rules, dividers, grid, spacing, radii, shadows

**Radii: `0` on everything.** Buttons, inputs, sheets, images, the specimen viewport, drawers, modals. The only round things in this brand are the topping colour swatches (8px circles) and the stamp SVGs, which are organic by nature. Delete `--radius-*` from your token file entirely so it cannot creep back.

**Shadows:** the single sheet-elevation shadow above. Nothing else.

**Rules:**
```
Hairline           1px solid var(--ink-15)     between ticket lines, under inputs
Section rule       1px solid var(--ink)        between ticket sections (STRUCTURE / FLAVOUR / …)
Tear line          1px dashed var(--ink-15)    + perforation dots, twice only
Dot leader         1px dotted var(--ink-35)    real border-bottom on a flex spacer
```

Dot leaders are structural, not decorative — build them properly:
```html
<div class="line">
  <span class="label">SPONGE</span>
  <span class="leader"></span>       <!-- flex:1; border-bottom:1px dotted; margin:0 8px 5px -->
  <span class="value">RED VELVET</span>
  <span class="price">+150.00</span>
</div>
```

**Spacing scale (4px base). Only these values exist:**
`4, 8, 12, 16, 24, 32, 48, 64, 96, 128`

**Baseline:** everything snaps to 4px. A ticket line is exactly **28px tall on desktop, 36px on mobile** (touch target). Line height inside it is 20px, padding 4px top and bottom. Keeping this exact means the Feed motion can translate by whole line-heights and always land correctly.

**Grid:** Homepage, archive and bakery pages use a 12-column grid, max width 1440px, 24px gutters, 32px page margin. The builder ignores the grid entirely and uses a fixed two-pane split (58 / 42). Do not try to make the builder fit the grid.

---

## 1.5 Iconography

**Almost none.** Icons are the fastest way to make a document look like an app.

Eight icons exist in this system, hand-drawn on a 16px grid: undo, redo, close, download, print, drag-handle, chevron, external-link. Specification: **1px stroke, square caps, square joins, no rounded corners, no fills, 16×16 viewBox, `currentColor`.** They should look like plotter output. Do not install lucide, heroicons, or any library — you will use forty of them by accident.

**Shape selection does not use icons.** Round, square, rectangle, heart, hexagon and bundt are drawn as **1px plan-view outlines with a dimension tick and a measurement** — the same way a spec sheet would show them:

```
    ┌─────────────┐
    │      ⌀178   │      ROUND ......... ⌀178 × H110
    └─────────────┘
```

This is cheap to draw, unmistakably yours, and it teaches the customer something true about the cake. It is one of the highest ratio-of-distinctiveness-to-effort decisions in this whole document.

Topping swatches keep a filled 8px circle, paired with a mono label. That is the only filled shape in the interface.

---

## 1.6 Buttons, inputs, selection states

### Buttons — three kinds, no more

**1. Stamp (primary).**
```
background: var(--ink); color: var(--paper);
height: 48px; padding: 0 24px; border: 0; border-radius: 0;
font: 500 15px Geist Mono; text-transform: uppercase; letter-spacing: .08em;
```
Hover: a second 1px `--ink` outline appears offset by +3px x and y, like a double impression. The button itself does not move or change colour.
Active: the offset outline collapses to 0px over 90ms.
Disabled: `--ink-35` background, no offset behaviour.

**2. Ruled (secondary).** Transparent, `1px solid var(--ink)`, `--ink` text, same metrics. Hover fills with `--paper-3`.

**3. Leader (tertiary).** Text only, mono, `border-bottom: 1px dotted var(--ink-35)`. Hover: the dotted rule becomes solid `--ink`. Used for *change*, *open this cake*, *download docket*, *undo*, *the archive*, *the bakery*. This is the most-used control in the product.

### Inputs — no boxes

```
No border, no background, no radius.
Label above:  --mono-xs, uppercase, --ink-60
Field:        --mono-base, --ink, border-bottom: 1px solid var(--ink-15)
Focus:        border-bottom becomes 1px solid var(--ink)
              caret is a 2px solid --ink block, blinking at 1.06s
Error:        border-bottom --stamp, plus a --mono-xs --stamp note beneath
Placeholder:  --ink-35, and it is an example, never an instruction
              ("500033", not "Enter your pincode")
```

Five lines of CSS, and it is the single biggest visual differentiator against every other form on the internet.

### Option row states (the core builder component)

```
DEFAULT     paper background, 1px bottom hairline
            mono label left · dot leader · mono price right
            Switzer description beneath in --ink-60

HOVER       background: var(--paper-3) at 40%
            dot leader darkens to --ink-15 → --ink-35
            no movement, no scale, no shadow

SELECTED    1px solid var(--ink) box on all four sides
            filled 6px --ink square in the left gutter
            and — the important part — the matching TICKET LINE prints
            The primary feedback for selection lives on the ticket, not on the row.

DISABLED    45% opacity
            price replaced by "— UNAVAILABLE" in --stamp
            one Switzer line explaining why, in --stamp
            ("Two tiers need a night to set. Same-day is single tier only.")

CHANGED     the previously selected row keeps a 1px --ink-35 strike through
            its label for the rest of the session
```

---

## 1.7 Motion

**Principle: every movement must be something a machine or a hand could do.** Nothing fades in from nothing. Nothing scales up. Nothing springs. If you cannot name the physical mechanism, delete it.

There are exactly **seven** motions in this product.

| # | Name | What it does | Spec | Used for |
|---|---|---|---|---|
| 1 | **Print** | A line appears left-to-right | `clip-path` inset 100%→0, **180ms linear**, +1px vertical jitter for the first 60ms | Every decision made. The most-used motion in the product. |
| 2 | **Feed** | The ticket paper moves in whole line-heights | `translateY` in 28px steps, **220ms `cubic-bezier(.2,.8,.2,1)`** | Ticket auto-scrolling to the next blank line; expanding a line |
| 3 | **Stamp** | An SVG stamp lands | `scale 1.06→1`, rotate to seeded angle, **160ms `cubic-bezier(.2,1.2,.4,1)`**, opacity 0→.92 in first 40ms | Maximum four times in the whole journey |
| 4 | **Strike** | A rule draws through an old value | 1px rule, left-to-right, **140ms linear**, then value drops to 45% and the new one Prints beneath | Changing a decision |
| 5 | **Slide** | A whole sheet crosses the desk | `translateX`, **320ms `cubic-bezier(.4,0,.2,1)`** | Page transitions, archive drawer, mobile option sheets |
| 6 | **Settle** | Physical inertia and friction | Real damping, not a tween. A flick coasts ~2.5s | Specimen turntable, bottom-sheet drag |
| 7 | **Warm** | Paper tint and key-light temperature interpolate | **600ms `ease-out`** | The `--accent` mechanic. The only slow motion. |

**Banned outright:** fade-up-on-scroll, parallax, blur-in, letter-by-letter reveals, count-up animations on anything except the price odometer, marquees, cursor followers, magnetic buttons, skeleton shimmer, page loaders, hover lift, hover scale.

**Price odometer** is the one exception to "no count-ups": when the total changes, only the digits that actually changed roll vertically, 200ms, staggered 20ms right-to-left. Subtotal rolls first, total follows 80ms later.

**`prefers-reduced-motion`:** kills 1, 3, 4, 5 (they become instant state changes). Keeps 2 and 6 at half amplitude. Keeps 7 unchanged, because a slow colour interpolation is not a vestibular risk and it is load-bearing for the brand.

---

# 2. INFORMATION ARCHITECTURE

## 2.1 The map

```
/                    HOMEPAGE — is also INTAKE. The first screen is a blank ticket.
/build               THE BUILDER — one URL, ticket-driven. Deep links: /build#sponge
/archive             THE ARCHIVE — 21 designs as ticket stubs (also opens as a drawer inside /build)
/bakery              ROAD No. 36 — the proof page
/confirm             NAME AND NUMBER. Not a checkout.
/t/MC-7218           THE TICKET — shareable, permanent, and it is also the order tracker
```

Six routes. No cart, no account, no login, no password reset, no order-history page. **The ticket URL is the account.** If a customer wants their order back, they open their ticket link, or we look it up by phone. This removes about 40% of the build and it is a better experience.

## 2.2 What happens on a first visit — exact sequence

1. Page loads on `--paper` with the grain layer. No loader, no splash, no cookie banner (we set no non-essential cookies, and we say so in the footer — that is a brand statement, not a legal one).
2. Above the fold: a sheet of paper with a perforated top edge. Printed on it: `MAKEMYCAKE · JUBILEE HILLS` left, `TICKET No. 7412` right, a rule, and then one line: `NOTHING ON IT YET.` followed by a blinking block caret.
3. Beneath, in Switzer text-lg: *What are we making?*
4. Five ticket lines with dot leaders: BIRTHDAY / ANNIVERSARY / WEDDING OR ENGAGEMENT / JUST BECAUSE / SOMETHING ELSE.
5. To the right, the specimen: an empty cake board on a turntable, lit, with nothing on it. Caption in mono-xs: `LIVE 3D · DRAG TO TURN`.
6. User taps BIRTHDAY. **Print** motion writes `OCCASION ....... BIRTHDAY` onto the ticket. The five options are replaced in place by the next question, `HOW MANY PEOPLE`.
7. User enters 10. Print writes `PEOPLE ......... 8–10 · 1KG / 7IN`. The specimen grows a bare sponge.
8. User enters date and pincode. Print writes `DELIV .......... SAT 5 SEP · STANDARD` and `LEAD ........... 48 HOURS · ZONE CORE`. The specimen is now a plain undecorated cake.
9. Two lines appear at the bottom of the ticket:
   `START FROM BLANK →` (Stamp button)
   `or start from one we've made` (Leader link → archive, pre-filtered)
10. Everything above happened **above the fold, on the homepage, in under twenty seconds.** There is no "How it works" section, because the homepage was it.

## 2.3 Every decision, and where it is solved

| Decision | Where | How |
|---|---|---|
| **Occasion** | Intake, Q1 | Drives preset filtering, default message text, whether tiers are suggested. Printed on the ticket permanently. |
| **Servings** | Intake, Q2 | Asked in **people**, not kilograms. Mapped: 4–5→0.5kg/6in · 8–10→1kg/7in · 12–15→1.5kg/8in · 16–20→2kg/9in · 24–30→3kg/10in · 40–50→5kg/12in. Weight still prints on the ticket so the kitchen sees it. This removes the hardest half of old Step 2 from the builder. |
| **Date** | Intake, Q3 | Date picker. Never a free-text field. Blocked dates: Mondays, and anything inside the lead time. |
| **Pincode** | Intake, Q3 | Six digits. Resolves to zone: **Core 48h · Outer 50h · Extended (standard slot only) · Not served**. |
| **Lead-time validation** | Intake, then continuously in the builder | See 2.4 below. Never a modal. |
| **Presets** | Intake fork + drawer inside the builder | A preset is a filled ticket. Choosing one prints all nine lines in sequence and drops you into the builder with everything editable. |
| **Custom builder** | `/build`, ticket as navigation | See §4. |
| **Pricing** | Always visible, always itemised | Sticky price block at the foot of the ticket. Deltas appear on option rows as signed mono numbers. Never a collapsed total, never a badge. |
| **Allergens** | Derived, never typed | A live `CONTAINS` line on the ticket that updates as choices are made. Expanded on `/confirm` with a required acknowledgement. |
| **Message** | Builder line 8 | Max 60 characters, live on the plaque. If empty, the plaque physically comes off and toppings take the centre — and the copy says so. |
| **Confirmation** | `/confirm` | Name and phone only. Allergen acknowledgement. `SEND TO THE KITCHEN`. No payment. |
| **Post-order tracking** | `/t/MC-7218` | The same ticket, with a status column that stamps times as it advances. |

## 2.4 Lead-time and pincode logic — the rules

This is currently your worst latent failure (a customer can design for six minutes and discover at the end that it is impossible). Solve it at second five.

```
ZONE = f(pincode)
  CORE     48h lead   all slots      all options
  OUTER    50h lead   all slots      all options
  EXTENDED 50h lead   standard only  no same-day, no express
  NONE     —          —              collection only

HOURS_AVAILABLE = requested_date_slot_start − now

If HOURS_AVAILABLE < ZONE.lead:
   Print on the ticket, in --stamp, do NOT block:
   "48 HOURS FROM NOW IS FRIDAY. WE CAN DO FRIDAY."
   with a one-tap Leader link: [MOVE IT TO FRI 4 SEP]

If ZONE == NONE:
   "WE DON'T DRIVE OUT THAT FAR. YOU CAN COLLECT FROM ROAD No. 36."
   with [COLLECT INSTEAD] as a one-tap fix.

Options that consume time get locked in the builder, with the reason on the row:
   TIERS ≥ 2          needs a night to set        → disabled on same-day
   FINISH = RUFFLE    slow work, hand-piped       → disabled under 48h
   TOP = GOLD LEAF    stocked to order            → disabled under 48h
```

**Never a modal, never a toast.** Every constraint prints onto the ticket and every constraint carries a one-tap fix. A disabled option always says why in one Switzer line. That is the whole trust argument of this brand expressed as an interaction rule.

---

# 3. HOMEPAGE — SCREEN BY SCREEN

Six sections. No hero image. No feature grid. No testimonial carousel. No logo strip.

## 3.0 Masthead — a letterhead, not a nav bar

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [MAKEMYCAKE stamp]   JUBILEE HILLS · ROAD No. 36 · HYDERABAD 500033        │
│                                    TUE–SUN 9:00–20:00   THE ARCHIVE  THE BAKERY │
└────────────────────────────────────────────────────────────────────────────┘
   1px solid var(--ink) bottom rule
```

- Height 88px. Left: stamped wordmark SVG. Beside it, mono-xs address block.
- Right: hours in mono-xs `--ink-60`, then two Leader links.
- **No buttons in the masthead.** The current double CTA (`Explore presets` + `Start building`) goes. A letterhead does not have a call to action.
- On scroll past 200px it collapses to 48px, the address drops, the rule stays. **Feed** motion, no fade.

## 3.1 Section one — THE BLANK TICKET (100vh)

**What the user sees:** the intake, on a sheet, live. See 2.2 for the exact sequence.

**Layout:** 7 columns of paper on the left, 5 columns of specimen on the right, 96px gap, vertically centred.

**Copy, exactly:**
```
MAKEMYCAKE · JUBILEE HILLS                              TICKET No. 7412
───────────────────────────────────────────────────────────────────────
NOTHING ON IT YET. ▌
```
Then, Switzer text-lg, `--ink-60`:
> What are we making?

Then five ticket lines. Then, once the three questions are answered:
```
                                        [ START FROM BLANK → ]
                                        or start from one we've made
```

**Interaction:** each answer Prints. The specimen builds. The `--accent` has not kicked in yet (no sponge chosen), so the page stays neutral — which makes the first warm moment in the builder land harder.

**On scroll:** nothing animates in. Sections are simply there. The only scroll behaviour on this page is the masthead collapse.

## 3.2 Section two — TWO COPIES. ONE TRUTH.

**Background:** `--paper-3` (the desk), full-bleed.

**What the user sees:** two sheets side by side, overlapping by 40px, with a perforated tear line between them. Left sheet: `--ink` on `--paper`, labelled `TOP COPY — YOURS`. Right sheet: `--carbon-ghost` on `--paper-2`, labelled `CARBON — KITCHEN`. Identical ticket content, different ink, different stock.

**Headline (mono-3xl):** `TWO COPIES. ONE TRUTH.`

**Body (Switzer text-lg, max 62ch):**
> The ticket you see is generated from the same object your cake is drawn from. It cannot drift from what you designed.
>
> The kitchen works from the carbon copy of that sheet. The same sheet is taped to the box when it arrives.

**Interaction:** dragging horizontally across the tear line reveals the carbon transferring — a **wipe**, not a fade, following the cursor. On mobile it is a draggable handle. This is the section's one gesture and it should be the only interactive thing in it.

**CTA:** none. This section sells nothing. That is why it works.

## 3.3 Section three — TWENTY-ONE WE'VE MADE BEFORE.

**Headline (mono-xl):** `TWENTY-ONE WE'VE MADE BEFORE.`
**Sub (mono-xs, `--ink-60`):** `EACH ONE OPENS IN THE BUILDER EXACTLY AS SHOWN. CHANGE WHATEVER YOU LIKE.`

**What the user sees:** a horizontally scrolling rail of **ticket stubs**, not product cards. Each stub:

```
┌──────────────────────────┐
│ [photograph, 1px edge]   │   ← real photo, seeded rotation −1.5° to +1.5°
├──────────────────────────┤
│ No. MC-2367              │
│ 1KG ROUND · RED VELVET   │
│ PINEAPPLE CRUSH          │
│ DARK GANACHE · RUSTIC    │
│ ....................     │
│ ₹1,923.40   OPEN THIS →  │
└──────────────────────────┘
```

You browse this catalogue **by reading specifications**, and the photograph confirms. No other cake site works this way, and people who care about cake will love it.

**Interaction:** horizontal scroll with real momentum. Hover darkens the dot leader and reveals `OPEN THIS →`. Click Slides the whole page and prints the nine lines into the builder.

**CTA:** `SEE ALL TWENTY-ONE →` (Leader link, right-aligned with the headline).

## 3.4 Section four — WE BAKE IT THE DAY IT GOES OUT.

**Background:** `--paper-2` (manila). Full-bleed photography.

**What the user sees:** the day, printed as a ticket, with photographs to the right of each time.
```
06:10   OVEN ON
07:45   SPONGES OUT, ON RACKS
11:20   GANACHE, SECOND COAT
14:00   PIPED BY HAND
16:30   ON THE VAN
```
Each time is mono-lg, `--ink`, left column. Each photograph is black-and-white, available light, hands in frame. One Switzer line under each.

**Headline (mono-3xl):** `WE BAKE IT THE DAY IT GOES OUT.`

**Interaction:** hovering a photograph reveals, in mono-xs `--carbon`, the ticket number of the cake in that frame, linking to `/t/…`. Real orders. This is the hardest-working detail on the page.

**CTA:** `MEET THE BAKERY →`

## 3.5 Section five — WHAT WE DON'T DO.

This is the luxury section and almost nobody builds one. A brand becomes premium by refusing things in public.

**Headline (mono-3xl):** `WHAT WE DON'T DO.`

```
CLOSED MONDAYS ................................ NO EXCEPTIONS
NOTHING FROZEN ................................ NOTHING MADE AHEAD
NO PAYMENT UNTIL WE'VE SPOKEN ................. WE CALL EVERY ORDER
TWENTY-ONE DESIGNS ............................ NOT TWO HUNDRED
SAME DAY ...................................... SINGLE TIER ONLY
CHERRIES ...................................... TWO WEEKS OF THE YEAR
```

**Visual treatment:** pure ticket lines, mono-lg, full width, generous 32px line spacing, hairline between each. No illustration, no icon, no card. **The list is the design.**

**Interaction:** none. Some things should just be read.

## 3.6 Section six — FOOT

Letterhead again, inverted: `--ink` background, `--paper` text. The only dark surface in the entire brand, which is what makes it feel like a closing.

```
MAKEMYCAKE                          ROAD No. 36, JUBILEE HILLS
                                    HYDERABAD 500033
TUE–SUN 9:00–20:00                  +91 XX XXX XXXXX
CLOSED MONDAYS

ZONE          LEAD        SLOTS
CORE          48 H        ALL
OUTER         50 H        ALL
EXTENDED      50 H        STANDARD ONLY

FSSAI 1XXXXXXXXXXXXX            ← print the real number. It is trust, not compliance.

───────────────────────────────────────────────────────────────
TICKET No. ____ · YOURS IS STILL BLANK        [ START → ]
───────────────────────────────────────────────────────────────
NO TRACKING COOKIES. NOTHING TO ACCEPT.                  © 2026
```

---

# 4. THE BUILDER

## 4.1 The single idea

**The ticket is the navigation.**

The nine steps do not become eight, and they do not become four. All nine decisions remain. What changes is that they stop being *sequential* and become *simultaneous*. Nine steps feel overwhelming because you cannot see the end. Nine lines on one sheet, four of them blank, feel like a short list — because you can see the end.

Delete: the numbered 1–9 chip rail, the Structure/Flavour/Appearance/Details progress meter, the "Step 3 of 9" label, the third panel, `Start again`. All of it is replaced by one document.

## 4.2 Desktop layout (≥1280px)

Fixed viewport height. **The page does not scroll.** The ticket scrolls inside its own pane.

```
┌─────────────────────────────────────────┬──────────────────────────────────┐
│                                         │ ░░░ perforated top edge ░░░      │
│                                         │ MAKEMYCAKE          No. MC-7218  │
│                                         │ UNDO  REDO   START FROM ONE WE'VE│
│          THE SPECIMEN                   │ ─────────────────────────────────│
│      (full-bleed in its pane)           │ BIRTHDAY · 8–10 · SAT 5 SEP      │
│      no box, no border, no radius       │ 500033 · CORE · 48 H             │
│      section view by default            │ ═════════════════════════════════│
│                                         │ STRUCTURE                        │
│                                         │ SHAPE ........ ROUND          —  │
│                                         │ SIZE ......... 1KG/7IN        —  │
│                                         │ TIERS ........ 1              —  │
│                                         │ ─────────────────────────────────│
│                                         │ FLAVOUR                          │
│                                         │ SPONGE ....... RED VELVET +150.00│
│  1kg round cake, red velvet sponge,     │▌FILL ......... ▌                 │  ← --accent marker
│  covered in dark ganache.               │ ─────────────────────────────────│
│                                         │ APPEARANCE                       │
│  SECTION / WHOLE          No. MC-7218   │ FROST ........ ▌                 │
│                                         │ COLOUR ....... ▌                 │
│                                         │ FINISH ....... ▌                 │
│                                         │ TOP .......... ▌                 │
│                                         │ ─────────────────────────────────│
│                                         │ DETAILS                          │
│                                         │ MSG .......... ▌                 │
│                                         │ DELIV ........ SAME DAY   +120.00│
│                                         │ ═════════════════════════════════│
│                                         │ CONTAINS  WHEAT · EGG · MILK     │
│                                         ├──────────────────────────────────│
│                                         │ SUBTOTAL ............. ₹1,630.00 │  ← sticky
│                                         │ GST @ 18% ............... ₹293.40│
│                                         │ TOTAL ................ ₹1,923.40 │
│                                         │ [ NEXT: FILLING → ]              │
└─────────────────────────────────────────┴──────────────────────────────────┘
     58%                                        42%   --paper sheet on --paper-3 desk
```

**Left pane:** `--paper-3` background with a soft vignette from the key light. The specimen sits directly on it. No container, no rounded rectangle, no `LIVE 3D` pill badge, no inset panel. Bottom-left: the live description sentence in mono-xs (keep this — it is good copy and it is doing real work). Bottom-right: `SECTION / WHOLE` as a two-item Leader control. Top-right: `No. MC-7218`.

**Right pane:** one sheet of `--paper` with a perforated top edge and a 1px left edge with the sheet shadow, so it reads as lying on the desk. It scrolls internally. The price block is sticky to its bottom.

## 4.3 Ticket structure

Four sections, nine decision lines, plus derived lines. The Structure/Flavour/Appearance/Details grouping you already have survives — **as section headers on a document**, which is what it always should have been.

```
STRUCTURE   SHAPE · SIZE · TIERS            (steps 1–2)
FLAVOUR     SPONGE · LAYERS · FILL          (steps 3–4)
APPEARANCE  FROST · COLOUR · FINISH · TOP   (steps 5–7)
DETAILS     MSG · DELIV                     (steps 8–9)
──────────
DERIVED     SERVES · LEAD · SLOT · WINDOW · SHELF LIFE · CONTAINS
```

Derived lines are printed in `--ink-60` and are **never clickable**. They are outputs, not inputs, and the visual difference teaches that instantly.

## 4.4 Unfinished vs completed

**Unfinished:** the value column shows a blinking block caret `▌` in `--ink-35`, and the dot leader **stops where the caret is** rather than running to the price column. That truncated leader is the single clearest possible signal of "not filled in yet," and it costs nothing.

**Completed:** value printed in `--ink` at 92% with the ink-bleed shadow, dot leader running full width, price right-aligned, and a filled 6px `--ink` square in the left gutter.

**Next up:** a 2px `--accent` vertical marker in the left gutter, on the topmost blank line. It moves as you fill lines. This is the only place `--accent` appears at full saturation.

Nothing is greyed out. Nothing is hidden. Nothing is locked behind a previous step. **All nine are visible and clickable from the first second.**

## 4.5 Making and changing a decision

**Choosing.** Click any line. It **expands in place**, pushing the lines below it down with a **Feed** motion (220ms). Inside the expansion, the option list appears as rows — mono label, dot leader, price delta, Switzer description beneath. The expansion is *inside the sheet*; it is not a modal, not a drawer, not a new screen.

Choose one → the list collapses back up (Feed), the value **Prints** onto the line (180ms), the specimen updates, the itemised price line prints into the price block, the totals roll. Total elapsed: about 450ms, and every millisecond of it is a machine doing something.

**Changing.** Click a filled line. The expansion opens with the current choice boxed. Pick a different one:

1. **Strike** draws a 1px rule through the old value, left to right, 140ms.
2. The struck value drops to 45% opacity and stays on a half-height sub-line.
3. The new value Prints on the main line beneath it.
4. The old itemised price line strikes; the new one prints; totals roll.

The struck line persists for the session. It is excluded from the total, excluded from the PDF, and excluded from the kitchen copy — but it stays on screen, so the ticket carries a **visible history of your thinking**. This is the delight moment of the whole product and it is maybe forty lines of code.

**Undo / Redo** move to the ticket masthead as Leader links. Undo literally reverses the Strike animation. `Start again` is deleted — it is an invitation to abandon, and undo already covers it.

## 4.6 How price updates

Sticky at the foot of the ticket sheet, always visible, never collapsed:

```
1KG ROUND BASE ........................ ₹1,200.00
RED VELVET SPONGE ....................... ₹150.00
PINEAPPLE CRUSH FILLING ................. ₹120.00
DARK GANACHE ............................ ₹200.00
STANDARD DELIVERY ........................ ₹60.00
──────────────────────────────────────────────────
SUBTOTAL .............................. ₹1,630.00
GST @ 18% ............................... ₹293.40
TOTAL ................................. ₹1,923.40
                                   INCL. OF GST
```

On change: the affected itemised line prints or strikes. Then the subtotal odometer rolls (200ms, only changed digits, staggered 20ms right-to-left), then the total rolls 80ms later. **No colour flash, no floating `+₹150`, no badge, no toast.** The number changes the way a number on a till changes.

## 4.7 Specimen ↔ ticket linkage — the signature gesture

Bidirectional, and this is what people will describe to a friend.

**Ticket → cake.** Hovering a ticket line draws a 1px `--carbon` leader line from that line, across the gutter, to the corresponding part of the specimen, terminating in a small `--paper` chip with a 1px border and a mono-xs label:
```
FILL — PINEAPPLE CRUSH · 4MM
```
Nothing else changes. No highlight, no glow, no outline on the mesh. Just a technical callout, drawn.

**Cake → ticket.** Clicking a part of the specimen feeds the ticket to that line and expands it. Raycast targets:
```
top surface / plaque    → MSG
a topping               → TOP
the outer shell         → FROST  (and on a second click, FINISH)
a sponge layer          → SPONGE
a filling band          → FILL
the board / silhouette  → SHAPE
the vertical edge       → SIZE
```

Tapping the red band in a cut cake and having FILL open is the most direct thing on this site. Build it. In R3F this is `onClick` on named meshes plus a store dispatch — an afternoon of work for the best interaction in the product.

## 4.8 Section view

**SECTION is the default.** WHOLE is the toggle. The cross-section is more informative and more surprising, and it is the only view that makes the layers legible.

- Default camera sees both the finished exterior and the interior at once.
- Drag rotates with **Settle** physics.
- **Camera follows the ticket.** Open SPONGE or FILL → the camera eases to a closer, lower section angle. Open TOP or MSG → it eases up and over to a three-quarter top view. Open SHAPE or SIZE → it pulls back to a straight elevation. 700ms, `cubic-bezier(.4,0,.2,1)`. These are the only cinematic moves in the product and they must never trigger from scroll.
- Toggling WHOLE → SECTION does not fade. The wedge **lifts 8mm, rotates 12°, slides out 40mm** over 500ms, then the camera eases in. Reverse on the way back. That is a knife-and-hand motion, and it is what people will screenshot.

## 4.9 How presets enter the builder

A Leader link in the ticket masthead: `START FROM ONE WE'VE MADE`.

It opens the archive as a **second sheet Sliding in over the ticket** (320ms), not a new page, not a modal. Ticket stubs with photographs, filtered by the intake (occasion + servings). Choosing one:

1. The drawer Slides away.
2. All nine lines **Print in sequence, top to bottom, 60ms apart.**
3. The specimen builds alongside, in step.
4. The price block fills as it goes.
5. About 1.2 seconds total.

This is the single best moment in the entire product. It teaches the whole model — decision → ticket line → cake → price — in under two seconds, and it does it by *doing* rather than explaining. Spend real effort here.

Mid-build inspiration: inside the FILL expansion (and SPONGE, FROST, TOP), a Leader link `WHAT OTHERS DID WITH RED VELVET →` opens the same drawer, filtered by that choice.

## 4.10 Jumping backwards and forwards

There is no forwards or backwards. There are nine lines and you can click any of them at any time, in any order, forever.

Guidance without coercion:
- The `--accent` gutter marker sits on the topmost blank line.
- After each choice, the ticket **Feeds** to the next blank line and opens nothing — it just puts it in view.
- The primary button is always labelled with the next blank line: `NEXT: FILLING →`, `NEXT: FROSTING →`. If you skip around, it re-targets.
- When zero blanks remain, the button becomes `REVIEW & SEND →` and a `PRICE CONFIRMED` stamp lands on the ticket.

Nobody is ever blocked, and nobody is ever lost, because the document is the map.

---

# 5. THE 3D CAKE — ART DIRECTION

**Concept: a specimen on a bench, photographed for a specification sheet.** Honest about being a model. Precise, matte, evenly lit, with one warm key. It is not trying to be a food photograph and it must not be mistaken for one. You will never beat a photographer at appetite using real-time WebGL on a mid-range Android. You can beat a photographer at showing someone their own decision, in section, updating as they think.

## 5.1 Camera

- Single perspective camera, **FOV 32°**. Long-ish lens, minimal distortion, product-photography feel. (A wide FOV is what makes render cakes look like toys.)
- Default: **azimuth −24°, elevation 18°**, distance framed so the cake occupies **62% of viewport height**.
- Orbit is damped with clamped elevation **4°–46°**. Azimuth free. **The camera never rolls.**
- No FOV animation, ever. Dolly, don't zoom.
- One extra mode: a true **orthographic elevation** used only when the SIZE line is hovered or expanded, for the dimension callouts. Perspective for everything else.
- Auto-rotate off by default. After 20s idle, 2°/s, stopping on any input.

## 5.2 Lighting

Three lights. No HDRI dome, no fake studio environment — an env map with hard highlights is why your frosting currently looks like car paint.

```
KEY    rectangular area light, 1.6× cake width
       azimuth 40°, elevation 55°
       5200K, tinted 4% toward --accent      intensity 1.00
FILL   large soft area light, opposite side
       4400K                                  intensity 0.22
RIM    thin strip behind, elevation 15°
       6200K, silhouette separation only      intensity 0.12
```

One contact shadow on the board: shadow map 2048, high radius, soft.

**Post:** ACES tonemapping, exposure 1.0, and **2% film grain matched to the paper grain**. The grain is what stitches the render into the paper world. Do this. It is the single highest-leverage post effect in the whole project.

**No bloom. No lens flare. No depth of field.** DOF on a technical specimen is a lie.

## 5.3 Materials — the decisive parameter

**Roughness never below 0.35 on any surface**, with exactly two exceptions: dark ganache (0.28) and gold leaf (0.15). Everything is matte to satin.

Your cakes currently look like plastic because roughness is too low and there is an environment map producing hard specular. Fixing those two things alone will change the perception of this product more than any typeface decision in this document.

### Sponge

- Roughness 0.90, metalness 0.
- **Crumb normal map**, tiled small, plus a triplanar noise **displacement of 0.6mm** on the cut face.
- Slightly **irregular top edge**: vertex noise, 0.4mm amplitude. Real sponge is never a perfect cylinder.
- Base colour per flavour with a **6% value variation** baked into a noise texture, so it is never a flat fill.
- **Micro air pockets**: a second noise channel darkening 3–5% of the surface in small irregular blobs.

That list is what turns "flat red block" into "cake." It is all texture work, no new geometry.

### Filling

- Thickness **3–5mm**, roughness 0.55.
- **It squeezes at the cut edge**: a 0.3mm bulge where it meets the exterior, with a very slight sag.
- Compotes get visible particulate (darker inclusions). Curds go glossier (0.35) and smooth. Jams get 0.15 transmission for translucency.

### Frosting

Roughness by type — this is where flavour becomes visible:
```
WHIPPED CREAM     0.85   soft fresnel
AMERICAN BUTTER   0.70
SWISS MERINGUE    0.60
CREAM CHEESE      0.75
DARK GANACHE      0.28   slight clearcoat + subtle thickness
MILK GANACHE      0.35
WHITE GANACHE     0.40
```
**Finish** (smooth / rustic / ruffle / rosette / combed / ombré) is a **normal + displacement map on the shell**, not different geometry. It swaps instantly, costs nothing, and lets you add finishes later without modelling.

### The cut surface — the money shot

Five requirements, in order of importance:

1. **The frosting shell shows its thickness** at the cut as a visible 2–4mm band. Right now the shell reads as zero-thickness paint, which is the main reason the section looks fake.
2. **Sponge shows crumb** (5.3 above).
3. **Filling squeezes** (5.3 above).
4. **The cut face has a 0.5mm bevel with a soft highlight**, so it does not read as a boolean operation.
5. **Loose crumbs on the board** beneath the cut — 6 to 12 tiny instanced meshes with sponge material, scattered with a seed. They cost nothing and they are the single detail that makes people believe it.

### Toppings

Stop using primitives. Every topping gets one hand-modelled mesh under **800 triangles**, with a normal map:

- **Strawberry half** — visible seed dimples, pale cut face, slightly translucent edge.
- **Cherry** — bent tapered-tube stem (never a line), one specular dot, stone-out dimple.
- **Mixed berry** — three distinct silhouettes (blueberry / raspberry / blackberry), never one sphere recoloured.
- **Pineapple chunk** — irregular wedge with fibre normal. **Not a cube.**
- **Chocolate shard** — thin plane, snapped irregular edge, matte inside / glossy outside.
- **Gold leaf** — crumpled thin plane, genuinely metallic, roughness 0.15. The one place metal is allowed in this brand.

Placement (scatter / ring / border / cascade / crown) via **Poisson-disc distribution seeded from the ticket number**, so a given ticket always looks identical.

### Message / typography rendering

The warped script on the plaque is currently the worst visual on the site. Fix:

1. Render the message to a **2048px canvas texture** using a real script webfont.
2. Map it to a **flat plaque plane**, 0.4mm extrusion, with a **piping-bead normal map** along the letterforms so it reads as piped rather than printed.
3. The plaque is a flat white-chocolate rectangle with a slightly **hand-cut irregular edge** and softly rounded corners.
4. **Never wrap type around the cake's curvature.** The plaque is flat, physically, in reality. This is not a compromise — it is what the kitchen actually does.
5. Piping colour drives the texture fill colour from the existing palette.

### Dimensions and callouts

Rendered as **HTML overlays anchored to projected world positions**, not as 3D line geometry. 1px `--carbon` leader, terminating in a `--paper` chip with a 1px border and mono-xs uppercase label. They appear only on ticket-line hover or in the SIZE expansion:

```
⌀ 178 MM      H 110 MM      SERVES 8–10      3 LAYERS · 22 MM EACH
```

This is what makes it a specimen rather than a render, and it is pure HTML/CSS on top of a `useFrame` projection.

## 5.4 How to make the section feel premium and appetising without photorealism

The answer is: **crumb, thickness, squeeze, loose crumbs, matte surfaces, one warm key light.**

Appetite in a cross-section comes from **structure and texture**, not from wetness and specular. A matte, precisely lit section with real crumb reads as expensive food styling. A glossy, smooth section reads as a toy. You are currently on the wrong side of that line by a small number of shader parameters — not by a rendering-technology gap.

Do not pursue: subsurface scattering on sponge, real-time reflections, screen-space GI, HDRI environments, path tracing. Wrong axis, enormous cost, and on a mid-range Android in Hyderabad they will cost you the frame rate that makes the whole live-update premise work.

---

# 6. THE DOCKET — FOUR DOCUMENTS

One data object, four renderings. This is the central brand artifact and it should be treated as the product, not as a summary of the product.

## 6.1 Customer ticket — TOP COPY

Screen and downloadable PDF. `--ink` on `--paper`.

```
░░░░░░░░░░░ perforation ░░░░░░░░░░░
[MAKEMYCAKE stamp]              TICKET No. MC-7218
ROAD No. 36 · JUBILEE HILLS     ISSUED SAT 5 SEP 09:12
                                TOP COPY — YOURS
═══════════════════════════════════════════════════════
BIRTHDAY · 8–10 PEOPLE · SAT 5 SEP · 500033 · ZONE CORE
═══════════════════════════════════════════════════════
STRUCTURE
SHAPE ......... ROUND                                —
SIZE .......... 1KG / 7IN                            —
TIERS ......... 1                                    —
FLAVOUR
SPONGE ........ RED VELVET                    +150.00
LAYERS ........ 3                                    —
FILL .......... PINEAPPLE CRUSH                +120.00
APPEARANCE
FROST ......... DARK GANACHE                   +200.00
COVER ......... FULL                                 —
FINISH ........ RUSTIC                               —
TOP ........... PINEAPPLE CHUNK ×3             +144.00
TOP ........... CHERRY ×4                      +315.00
DETAILS
MSG ........... "HELLO"                         +80.00
DELIV ......... SAME DAY                       +120.00
═══════════════════════════════════════════════════════
SERVES ........ 8–10 · STANDARD 100 G PORTIONS
LEAD .......... 12 HOURS
WINDOW ........ ORDER BEFORE 11:00, ARRIVES 18:00–21:00
SHELF LIFE .... 48 H REFRIGERATED
CONTAINS ...... WHEAT · EGG · MILK · SOY
═══════════════════════════════════════════════════════
SUBTOTAL ................................. ₹2,329.00
GST @ 18% .................................. ₹419.22
TOTAL .................................... ₹2,748.22
                                      INCL. OF GST
                              [ PRICE CONFIRMED stamp ]
═══════════════════════════════════════════════════════
NO PAYMENT TAKEN. WE CALL TO CONFIRM BEFORE WE BAKE.

[QR → /t/MC-7218]     FSSAI 1XXXXXXXXXXXXX
                      +91 XX XXX XXXXX · TUE–SUN 9:00–20:00
```

## 6.2 Kitchen carbon copy

Same layout, `--carbon-ghost` ink on `--paper-2` manila, with the pressure offset. Everything customer-facing is stripped and everything kitchen-facing is added.

**Removed: all prices.** Every one. A real kitchen does not need them and their absence is the detail that proves you understand a kitchen.

**Added:**
```
TIN ........... 7IN ROUND, LINED
BAKE .......... 170°C · 34 MIN · RED VELVET
SPONGE ........ 1,050 G BATTER · 3 × 22 MM TORTE
FILL .......... 180 G PINEAPPLE CRUSH, DRAINED
GANACHE ....... 420 G DARK 54% · SECOND COAT
FINISH ........ RUSTIC, PALETTE KNIFE
TOP ........... PINEAPPLE ×3, CHERRY ×4 · SCATTER · DENSITY 3/5
PLAQUE ........ WHITE CHOC · PIPE #C48F36

┌───────────────────────────────────────┐
│  MESSAGE — READ IT TWICE              │
│                                       │
│           H E L L O                   │
│                                       │
└───────────────────────────────────────┘

ALLERGENS ..... WHEAT · EGG · MILK · SOY          (in --stamp)

BAKER ........ ______    DECORATOR ....... ______
─ ─ ─ ─ ─ ─ ─ ─ ─ tear here ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
DELIVERY STUB · MC-7218
NAME ..... PHONE ..... ADDRESS ..... WINDOW ..... ZONE
```

## 6.3 Confirmation ticket

Generated after the phone call. The customer ticket plus a `CONFIRMED BY PHONE` stamp carrying **a time and a human name**:

```
[ CONFIRMED BY PHONE — SAT 5 SEP 10:40 — PRIYA ]
```

A name on a document is where trust is actually manufactured. Do not use "our team."

## 6.4 Live order ticket — `/t/MC-7218`

Public, permanent, shareable. The customer ticket with a status column on the right, filling in with printed and stamped times:

```
RECEIVED ............... SAT 5 SEP 09:12
CONFIRMED .............. SAT 5 SEP 10:40   BY PRIYA
BAKED .................. SUN 6 SEP 07:45
DECORATED .............. SUN 6 SEP 13:20
OUT .................... SUN 6 SEP 17:05
DELIVERED .............. ▌
```

Each new line **Prints**. `DELIVERED` gets the fourth and final Stamp.

**No map. No progress bar. No delivery-partner illustration. No push notification with an emoji.** A ticket on a rail, filling in. That is the whole tracker, it is more honest than a fake map, and it takes a day to build.

## 6.5 The physical mirror

An 80mm thermal printer (roughly ₹4,000–8,000) or an A5 duplicate book. Same header, same ticket number, same nine lines, same QR.

- **Top copy** goes on the box in a small glassine envelope.
- **Carbon** stays in the kitchen, clipped to the rail.
- The customer holds the exact object they generated on their phone.

That is the digital-to-physical loop closed literally, for the price of one piece of hardware. Nothing else in this document creates as much brand for as little money.

---

# 7. ROAD No. 36 — THE PROOF PAGE

**Job:** make "a real kitchen with real hands will make exactly what you designed" a fact, not a claim. Right now no human being appears anywhere on your site.

## 7.1 Photography direction

- **Available light only.** No strobes, no reflectors, no styling.
- Shot **during service**, in the working kitchen, not on a set.
- Slightly underexposed, warm shadows, **visible grain** matched to the paper grain.
- **Hands in most frames. Faces in a few. Nobody smiles at the camera.**
- **Black and white for the process. Colour only for finished cakes.** That split is the entire art direction, and it also means your process photography does not have to be beautiful, only true.

**Shot list:** the ticket rail with real tickets clipped on it · a hand pulling a ticket down · sponges coming out of the oven · the ganache pour · a palette knife mid-stroke · the piping bag over a plaque · a plaque being read · boxes being taped with the ticket on top · the van at 17:00 · the shutter coming down.

## 7.2 Layout — a day, printed as a ticket

Times down the left in mono-lg. Photograph and one Switzer paragraph to the right. Scroll equals time passing. Each entry **Stamps its time** as it enters the viewport — the only scroll-triggered motion in the entire product, and it is a stamp, not a fade.

```
06:10  ┃  [photo: shutter, empty kitchen]
       ┃  The ovens go on before anyone else arrives. A 7in round
       ┃  needs thirty-four minutes at 170 and the first one is
       ┃  always the test.

07:45  ┃  [photo: hands, racks]
       ┃  The sponges come out and go on racks. Nothing is filled
       ┃  while it's warm — the filling would slide and the layers
       ┃  would slip by evening. This is why we ask for 48 hours.
```

## 7.3 People

Four entries. Mono name and role, one photograph, **one line about what they are actually good at.**

```
PRIYA — DECORATOR
Does the piping on every plaque. Reads the message twice.

ARUN — BAKER
Runs the ovens. Will not fill a warm sponge, whatever you offer him.
```

No bios. No years-of-experience. No "passion for baking." One true, specific, slightly opinionated sentence each — the same voice as your option descriptions.

## 7.4 Interaction

Hovering any photograph reveals, in mono-xs `--carbon`, the ticket number of the cake in the frame, linking to `/t/…`. **Real orders, real tickets, publicly viewable.** That closes the loop harder than any amount of copy could, and it is the reason the whole ticket-as-URL architecture pays off.

---

# 8. MOBILE

Designed from the ticket metaphor. Not a stacked desktop.

## 8.1 The frame

```
┌──────────────────────────────┐
│ [MMC]            No. MC-7218 │  56px  FIXED
├──────────────────────────────┤
│                              │
│                              │
│        THE SPECIMEN          │  45vh  PINNED — never scrolls away
│      section view default    │
│                              │
│           SECTION / WHOLE    │
├══════════════════════════════┤  ░ perforated edge = drag handle ░
│ STRUCTURE                    │
│ SHAPE ....... ROUND          │
│ SIZE ........ 1KG/7IN        │  55vh  BOTTOM SHEET — the ticket
│ SPONGE ...... RED VELVET     │        scrolls inside itself
│▌FILL ........ ▌              │
│ FROST ....... ▌              │
├──────────────────────────────┤
│ ₹1,923.40 · NEXT: FILLING →  │  72px  FIXED
└──────────────────────────────┘
```

## 8.2 What stays fixed

Two bars, always:
- **Top, 56px:** wordmark stamp + ticket number. That is all. No hamburger, no back arrow (the ticket is the map).
- **Bottom, 72px:** running total on the left, next blank line on the right, as one Stamp button. Pricing is **never** off screen at any snap point.

## 8.3 Where the cake lives

**Pinned to the top 45vh, full-bleed, never scrolling away.** Section view by default. One finger rotates with Settle physics, pinch zooms, two fingers pan.

This is the opposite of the usual mobile pattern (preview scrolls away, form takes over) and it is correct here, because watching the cake change *is the product*.

## 8.4 Where the ticket lives

A bottom sheet with a **perforated top edge that is simultaneously the tear line and the drag handle**. Three snap points, all reached with Feed motion and real drag physics:

| Snap | Height | Cake | Use |
|---|---|---|---|
| **Collapsed** | 18vh | 82vh | Looking at the cake. Shows only the price block and next action. |
| **Peek** (default) | 55vh | 45vh | Working. The nine lines, scrollable inside the sheet. |
| **Full** | 92vh | **15vh strip** | Reviewing. Whole ticket, price, allergens. The cake shrinks to a strip but **never disappears**. |

## 8.5 Changing a decision on mobile

Tapping a ticket line opens the options as a **second sheet stacked over the ticket sheet**, sliding up (Slide, 320ms), with the ticket line pinned to its top as a header. The cake stays visible above it.

Choosing prints the value and the option sheet slides down. **Never a full-screen takeover. Never a route change.** You should be able to build an entire cake without the cake leaving the screen for one frame.

## 8.6 Section view on mobile

Default, as on desktop. `SECTION / WHOLE` sits top-right of the cake area as a two-item Leader control.

**The best mobile navigation in the product is the cake itself:** tapping a layer in section view opens that decision. Show a one-time hint on first visit, in mono-xs, bottom-left of the cake area: `TAP A LAYER TO CHANGE IT`. It fades after the first successful tap and never returns.

## 8.7 Mobile intake

Three full-screen questions, one per screen. Each answer Prints onto a ticket that grows at the top of the screen, so by question three you are looking at a partly filled ticket and you already understand the whole product. Swipe or tap to advance. Under twenty seconds.

## 8.8 Performance budget

The live-update premise dies if the frame rate does. Non-negotiable on a mid-range Android:
- **≥ 45 fps while dragging the specimen.**
- Draw calls under 60. Toppings **instanced**, never individual meshes.
- Textures: 1024 max on mobile, 2048 on desktop. Plaque canvas texture regenerated only on message change, debounced 300ms.
- Shadow map 1024 on mobile.
- Pause the render loop entirely when the option sheet is at Full snap and the cake is a 15vh strip.

---

# 9. COPY

Voice: specific, knowledgeable, slightly opinionated, calm, kitchen-aware. Your existing option descriptions already have it — this extends it to everything else.

**Never write:** crafted with love, made with passion, artisanal, bespoke, indulge, treat yourself, elevate, curated, your special moment, our journey, we believe.

## Homepage
```
NOTHING ON IT YET. ▌
What are we making?

OCCASION
HOW MANY PEOPLE
WHEN AND WHERE

START FROM BLANK →
or start from one we've made

TWO COPIES. ONE TRUTH.
The ticket you see is generated from the same object your cake is drawn
from. It cannot drift from what you designed. The kitchen works from the
carbon copy of that sheet, and the same sheet is taped to the box when it
arrives.

TWENTY-ONE WE'VE MADE BEFORE.
EACH ONE OPENS IN THE BUILDER EXACTLY AS SHOWN. CHANGE WHATEVER YOU LIKE.

WE BAKE IT THE DAY IT GOES OUT.

WHAT WE DON'T DO.

TICKET No. ____ · YOURS IS STILL BLANK
NO TRACKING COOKIES. NOTHING TO ACCEPT.
```

## Constraints and failures
```
48 HOURS FROM NOW IS FRIDAY. WE CAN DO FRIDAY.        [ MOVE IT TO FRI 4 SEP ]

WE DON'T DRIVE OUT THAT FAR. YOU CAN COLLECT
FROM ROAD No. 36.                                     [ COLLECT INSTEAD ]

SAME DAY IS SINGLE TIER ONLY. TWO TIERS NEED
A NIGHT TO SET.

RUFFLE IS PIPED BY HAND AND TAKES A MORNING.
NOT AVAILABLE UNDER 48 HOURS.

WE'RE CLOSED MONDAYS. PICK ANOTHER DAY AND
WE'LL BE THERE AT NINE.
```

## Builder
```
Empty ticket line:      ▌            (a caret. Silence is the copy.)
Section headers:        STRUCTURE · FLAVOUR · APPEARANCE · DETAILS
View toggle:            SECTION / WHOLE
Primary button:         NEXT: FILLING →   then   REVIEW & SEND →
Masthead links:         UNDO   REDO   START FROM ONE WE'VE MADE
Mobile hint:            TAP A LAYER TO CHANGE IT

Message field empty state:
  Leave it empty and the plaque comes off. The toppings get the middle instead.

Message field help:
  MAX 60 CHARACTERS · PIPED BY HAND · WE READ IT TWICE

Toppings counter:
  FOUR IS THE MAXIMUM. AFTER THAT THEY STOP READING AS DECORATION.
```

## Confirm
```
WHO IS COLLECTING?
WE CALL THIS NUMBER BEFORE ANYTHING GOES IN THE OVEN.

I'VE READ WHAT'S IN IT.        (allergen acknowledgement — required)

[ SEND TO THE KITCHEN ]

Nothing is charged now. We call, we confirm the details with you,
then we bake. You keep the ticket either way.
```

## Post-order
```
IT'S ON THE RAIL.
TICKET No. MC-7218 · SAT 5 SEP 09:12

We'll call +91 XX XXX XXXXX before 11:00. If we can't reach you by
then we'll message, and we won't start until we've spoken.

[ DOWNLOAD YOUR COPY ]   [ SEND THIS TICKET TO SOMEONE ]
```

## Option descriptions — the three worth tightening
```
BEFORE  "Sturdy and sweet. Holds piping."
AFTER   "Sturdy and sweet. The only one that holds a rosette in May."

BEFORE  "More servings per kilo. Corners take a sharp edge."
AFTER   "More servings per kilo. The corners are where a decorator gets found out."

BEFORE  "Ring mould, fluted sides. Glaze rather than frost."
AFTER   "Ring mould, fluted sides. It takes a glaze. It will not take a plaque."
```
The pattern: end on a consequence the customer would not have known. That is what makes the voice sound like a kitchen rather than a menu.

---

# 10. IMPLEMENTATION PLAN

## PHASE 1 — Highest impact (1–2 weeks)

Do these in this order. Roughly 80% of the perceptual change lives here, and none of it requires rebuilding the builder.

1. **Material pass on the 3D.** Roughness floor 0.35, remove the environment map's hard specular, crumb normal + noise on sponge, filling thickness and squeeze, 0.5mm bevel on the cut face, loose crumbs on the board, ACES + 2% film grain. Highest single-item impact in this entire document.
2. **Make SECTION the default view.** Remove the rounded container, the inset panel and the `LIVE 3D` pill. Let the specimen sit full-bleed on `--paper-3`.
3. **Fix the message plaque.** Flat plaque + canvas texture + piping normal. Stop wrapping type around curvature.
4. **Type system swap.** Geist Mono + Switzer. Delete the display serif and every italic. Delete every weight above 500. Apply the scale from §1.1.
5. **Colour token swap.** Paper palette, `--carbon`, `--stamp`. Delete every `border-radius` and every `box-shadow` except the sheet-elevation one. Add the body grain layer.
6. **Homepage rebuild as blank ticket + intake.** Delete the "How it works" section and the hero cake render entirely.
7. **Dot leaders and the ink-bleed treatment on the existing docket.** Cheap, and it makes the one thing you already own look intentional.

## PHASE 2 — Core redesign (3–5 weeks)

8. Intake flow: occasion, servings→weight mapping, date + pincode, zone resolution, lead-time validation with one-tap fixes, option locking with printed reasons.
9. **Rebuild the builder as ticket-as-navigation.** One sheet, expand-in-place lines, Print / Feed / Strike motions, sticky itemised price with the odometer. Delete the step rail, the progress meter and the third panel.
10. Bidirectional specimen ↔ ticket linkage (raycast + `--carbon` callout overlays).
11. Merge presets into the builder as the Archive drawer, with the sequential print-in.
12. `/t/:id` live ticket and status stamps.
13. Mobile: pinned specimen, bottom-sheet ticket with three snaps, stacked option sheets.
14. Kitchen carbon copy generation (PDF, prices stripped, quantities added).

## PHASE 3 — Polish

15. Real bakery shoot and the Road No. 36 page.
16. Thermal printer and the physical ticket on the box.
17. Hand-modelled topping meshes.
18. Dimension callouts and the orthographic elevation view.
19. Stamp SVGs with seeded rotation.
20. The strike-through decision history.
21. `prefers-reduced-motion` pass and the mobile performance budget from §8.8.

## Do NOT spend time on

- **Photorealistic ganache, SSS on sponge, real-time reflections, HDRI environments, path tracing.** Wrong axis. This is the trap that has already cost you time.
- A custom typeface.
- An icon library. You need eight icons and they should be hand-drawn.
- A component library or design system package. This design has about fourteen components.
- Scroll-triggered animation of any kind, except the one stamp on the bakery page.
- A cart, accounts, login, password reset, order history. The ticket URL is the account.
- Multi-language. Ship English. Do it properly.
- A blog, an Instagram embed, a newsletter modal, a chat widget.

## Keep — these are assets, not debt

- **The docket concept and its data model.** It becomes the operating system.
- **The option-description copy.** It is one of your two genuine brand assets.
- The Structure / Flavour / Appearance / Details grouping — repurposed as ticket **section headers**.
- The URL-encoded design ("open this cake"). Promote it from a footnote to `/t/:id`.
- The price engine, allergen derivation, and undo/redo state.
- The preset data and the preset photography.
- The R3F scene graph and camera controls.
- "Cut a slice" — promoted from a small grey button to the default view.

## Remove entirely — do not redesign these

- The **"How it works"** section. Its job is done by the homepage intake.
- The **numbered 1–9 step chip rail.**
- The **Structure/Flavour/Appearance/Details progress meter bar** (the four underlines top-right).
- The **display serif** and every italic display setting.
- `/presets` **as a destination page** (becomes a homepage rail + an in-builder drawer). Keep the URL as a redirect.
- **All border radii. All box shadows. All card containers.**
- The **double CTA in the masthead** (`Explore presets` + `Start building`).
- The **hero cake render** on the homepage.
- The **`Start again`** button.
- Any **`+` / `−` price badge**. Deltas live on option rows and in the itemised list, as signed mono numbers, and nowhere else.
- The `LIVE 3D` **pill badge** and the rounded viewport frame around the specimen.

## Sequencing note

Phase 1 items 1–5 are all "swap a value" work and can be done by one person in a week. **Do not start Phase 2 until Phase 1 is shipped and you have looked at it for two days.** The material pass alone will change your read on several Phase 2 decisions, and the builder rebuild is much easier to judge against a specimen that no longer looks like plastic.

---

# CARBON COPY DESIGN NORTH STAR

_Also saved separately as `carbon-copy-north-star.md` for pasting into a new session._

Paste this at the start of any new design or development session.

---

**What MakeMyCake is.** A single premium bakery on Road No. 36, Jubilee Hills, Hyderabad. A customer designs a cake in a live 3D builder, sees an itemised price from the first tap, submits the design without paying, and the bakery calls to confirm before baking that exact cake.

**The design direction is CARBON COPY.** The website is a working document, not a shop. Every cake begins as a ticket and ends as a ticket, and the ticket exists twice — one copy for the customer, one carbon copy for the kitchen. The brand is the moment a private idea becomes an instruction someone else has to follow.

**Signature element: the ticket is the navigation.** Nine decisions live as nine lines on one sheet. Choosing prints a line. Changing strikes one through. Tapping a layer of the 3D cake opens the line that made it. There is no step rail, no progress bar, no "Step 3 of 9."

---

## Non-negotiable rules

**Typography.** Two faces only. **Geist Mono** carries everything — all headlines, all ticket content, all labels, all numbers. **Switzer** appears only inside explanatory prose longer than one line. **No display serif. No italics. No weight above 500.** Emphasis comes from case, colour, rule, box and stamp — never from bold.

**Colour.**
```
--paper    #E8E7E1   cool grey-white top copy (NOT cream)
--paper-2  #DFD3B8   warm manila, kitchen stock
--paper-3  #CFC9BA   chipboard desk
--ink      #22211E   graphite, never #000
--ink-60 / --ink-35 / --ink-15   #5C594F / #918C7E / #C2BCAC
--carbon   #3B3E93   carbon violet-blue — the signature colour, means "the kitchen's version"
--stamp    #A82F27   stamp red — max four uses in the whole journey
```
Plus **`--accent`**, set by the chosen sponge, driving three things only: a 3% paper tint, a 4% key-light tint on the 3D, and the 2px next-line marker. 600ms ease-out. If the user can point at it, it is too strong.

**No terracotta, no clay, no cream, no gold, no black backgrounds, no gradients, no glassmorphism.**

**Form.** `border-radius: 0` on everything. Zero shadows except one sheet-elevation shadow when paper genuinely lies over paper. Hairline rules, real dotted dot leaders, 4px spacing scale, 28px ticket line height (36px on mobile). Inputs have no boxes — a 1px baseline rule and a blinking block caret.

**Icons.** Eight, hand-drawn, 1px stroke, square caps, no rounded joins, no library. Cake shapes are 1px plan-view outlines with dimensions, not filled glyphs.

**Material.** One paper-grain PNG at 4% multiply on `<body>`, nowhere else. Perforation used exactly twice. Stamps are SVG assets with seeded rotation. Banned: coffee rings, torn corners, crumples, tape, pushpins, wood desks.

**Motion.** Seven motions exist, and every one must be something a machine or a hand could do: **Print** (line clips in left-to-right, 180ms), **Feed** (ticket moves in whole line-heights, 220ms), **Stamp** (160ms, max 4× per journey), **Strike** (rule draws through an old value, 140ms), **Slide** (sheets cross the desk, 320ms), **Settle** (real inertia on the turntable), **Warm** (600ms accent interpolation). Banned: fade-up-on-scroll, parallax, blur-in, hover lift, hover scale, skeleton shimmer, page loaders, cursor followers.

---

## The 3D cake

**It is a technical specimen on a bench, not fake photorealistic food.** Do not chase photorealism.

- FOV 32°, no roll, damped orbit, elevation clamped 4°–46°.
- Three lights: warm key at 40°/55°, soft fill at 22%, cool rim at 12%. No HDRI. ACES + 2% film grain matched to the paper grain.
- **Roughness never below 0.35** except dark ganache (0.28) and gold leaf (0.15).
- **Section view is the default. Whole cake is the toggle.**
- The section is made appetising by **crumb texture, visible frosting thickness at the cut, filling that squeezes at the edge, a 0.5mm bevel, and 6–12 loose crumbs on the board** — not by gloss.
- Message renders to a flat white-chocolate plaque with a piping-bead normal. **Never wrap type around curvature.**
- Callouts and dimensions are HTML overlays in `--carbon`, projected from world positions.

---

## Architecture

`/` (homepage **is** the intake) → `/build` → `/confirm` → `/t/:id` (ticket, tracker and account, all one object). Plus `/archive` and `/bakery`. No cart, no login, no order history — the ticket URL is the account.

The homepage opens on a **blank ticket** and three questions: occasion, how many people, when and where. Answers print onto the ticket and the 3D cake builds alongside. There is no "How it works" section, because the homepage is it. Lead time and pincode are validated at second five, never at checkout, and every constraint prints onto the ticket with a one-tap fix instead of a modal.

---

## Voice

Specific, knowledgeable, slightly opinionated, calm, kitchen-aware. Every line should end on a consequence the customer would not have known.

> "Nothing is filled while it's warm — the filling would slide and the layers would slip by evening. This is why we ask for 48 hours."
>
> "Leave it empty and the plaque comes off. The toppings get the middle instead."
>
> "48 hours from now is Friday. We can do Friday."

**Never write:** crafted with love, made with passion, artisanal, bespoke, indulge, elevate, curated, your special moment, our journey.

---

## The one-sentence test

If a screen could belong to a fintech, a Framer template, or any other bakery, it is wrong. It should look like a document a kitchen actually works from, that happens to be beautifully digital.
