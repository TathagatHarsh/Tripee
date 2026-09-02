# CARBON COPY — MAKEMYCAKE DESIGN NORTH STAR

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
