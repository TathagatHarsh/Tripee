# MakeMyCake — Carbon Copy Implementation Progress

**Last verified against the repository:** 2026-08-30, branch `feat/preset-photographs`, HEAD `4ef5260`.

> **Filename note.** The blueprint is `docs/makemycake-carbon-copy-blueprint.md`.
> There is **no** `docs/carbon-copy-blueprint.md` — if you were pointed at that
> path, it does not exist. `docs/carbon-copy-north-star.md` is a shorter summary of
> the same direction and is what `CLAUDE.md` is derived from.

---

## 1. Current Status

- **Current phase:** Blueprint §10 **Phase 1** ("Highest impact").
- **Items completed:** §10 items **1, 2, 3, 4, 5** complete. Plus an unplanned
  **mobile pass** on the builder, driven by a user report — see §2.
- **Current checkpoint:** typecheck clean, **194/194 unit tests pass**, lint clean
  within tracked code. Verified visually in the Browser pane on `/`,
  `/build/sponge`, `/build/review`, and lab specimens 0, 1, 2, 3, 4, 5, 6, 11.
  **Read §7's note on the 5-second test timeout before you believe a red suite.**
- **⚠ ALL WORK IS UNCOMMITTED.** `git diff HEAD --shortstat` reports **45 files
  changed, 1609 insertions, 847 deletions**. That is 40 files unstaged plus 4 staged
  deletions (the iCloud duplicates, see §2 Housekeeping). Nothing Carbon Copy has
  been committed. **`components/three/Crumbs.tsx` is new and untracked**, so a
  `git checkout .` will not bring it back.
  **The user is comparing against `makemycake-ten.vercel.app`, which is the
  pre-redesign build** — none of this is deployed, so every complaint about the
  live site has to be checked against the tree before it is believed.
  **Do not run `git checkout`, `git reset`, `git stash` or `git clean` without
  committing or stashing first — a careless command loses the entire phase.**

**Overall.** The brand layer of Carbon Copy is in and verified: §1.2's palette, the
Geist Mono type system, radius-0 everywhere, one shadow, the body paper grain, and
the 3D material and lighting pass including the frosting band at the cut. The
*architecture* is untouched — the nine-route builder, the step rail, the progress
meter and the homepage are all still the pre-redesign structures, and those are
Phase 1 item 6 and Phase 2 work that has deliberately not been started. In short:
the product now looks like Carbon Copy and does not yet behave like it.

---

## 2. Completed Work

### §10 item 1 — Material pass on the 3D (COMPLETE)

**`components/three/materials.ts`**

Roughness floor from §5.3 applied. Every frosting was under the document's floor,
and those four were the plastic tell:

| frosting | was | now |
|---|---|---|
| `whipped-cream` | 0.58 | **0.85** |
| `american-buttercream` | 0.46 | **0.70** |
| `swiss-meringue` | 0.36 | **0.60** |
| `cream-cheese` | 0.48 | **0.75** |
| `dark-ganache` | 0.26 | 0.28 |
| `milk-ganache` | 0.29 | 0.35 |
| `white-ganache` | 0.32 | 0.40 |
| `mirror-glaze` | 0.12 | 0.15 |

Also: `spongeMaterial` roughness 0.86 → **0.90**; `fillingMaterial` 0.48 → **0.55**;
**six** toppings raised to the 0.35 floor (`cherry` 0.22, `chocolate-shard` 0.24,
`chocolate-curl` 0.30, `white-chocolate-curl` 0.34, `caramel-shard` 0.15,
`rasmalai-disc` 0.34); `gold-leaf` **lowered** 0.28 → its specified **0.15**;
`ferrero` `metalness` 0.15 → **0**.

*Verified:* the only roughness values below 0.35 in the file are 0.15 (gold leaf,
mirror glaze) and 0.28 (dark ganache).

**Decisions a future session must understand:**
- **`mirror-glaze` at 0.15 is a deliberate third exception.** §5.3 sanctions only
  dark ganache (0.28) and gold leaf (0.15). Mirror glaze is a mirror by definition
  and is a product a customer orders; putting it at the 0.35 floor destroys it. It
  sits *at* gold leaf's value rather than below it, so nothing in the scene is
  glossier than the brand's one sanctioned metal. Do not "fix" this to 0.35.
- **`ferrero` metalness is 0 on purpose.** §5.3: gold leaf is "the one place metal
  is allowed in this brand." The foil read comes from clearcoat and colour.

**`components/three/Lighting.tsx`**

- Dropped **four of five** lightformers — the cool wall, the warm wall, the ring
  behind, and the worktop uplight. §5.2: "an env map with hard highlights is why
  your frosting currently looks like car paint." Those four are small, bright and
  at grazing angles to a lathe, which is the car-paint recipe.
- **Two survive:** the overhead window, and a broad frontal bounce at
  `position={[0, 1.4, 6]}`. `environmentIntensity` 0.5 → **0.4**.
- Key re-aimed to §5.2's azimuth 40° / elevation 55° — `position={[2.7, 6.0, 3.22]}`.
- Key : fill : rim moved from 1 : 0.40 : 0.31 to §5.2's **1 : 0.22 : 0.12** —
  intensities 2.6 / 0.57 / 0.31 (rim 0.42 on `hero`).
- Colour temperatures now follow §5.2: key **`#FFF4E8`** (5200K), fill
  **`#FFE2C4`** (4400K, *warmer* than key), rim **`#DCE8FF`** (6200K, cool).

**Critical decision — why the frontal bounce exists.** Removing all five formers
left the cut face — §5.3's "money shot" — as the worst-lit surface in the frame; it
went flat grey, because an overhead source contributes almost nothing to a plane it
is parallel to. Since SECTION is now the default view, a vertical cut face needs a
frontal source. At the roughness values §5.3 mandates, a large soft neutral bounce
physically cannot produce a hard streak, which is what §5.2 was objecting to. **Do
not delete this former in the name of "three lights only."**

**Critical decision — why the temperatures changed in item 5, not item 1.** §5.2's
warm-key / warmer-fill / cool-rim rig is the inverse of what was here (cool fill,
warm rim), and that inversion had fixed a real regression: with every source warm,
white frosting cannot render as white. §5.2's version only becomes correct once the
paper is cool, which §1.2 made it. The rig and the palette are coupled; changing
one without the other reintroduces the beige reading. A comment in the file records
this.

**`components/three/CakeScene.tsx`**
- `PLAIN_SHOT.exposure` 1.05 → **1.0** per §5.2.
- `HERO_SHOT.exposure` stays **1.16** — a documented correction for a dark-ganache
  subject, which §5.2's single-specimen rig does not contemplate. Leave it.

**`components/three/SpongeLayers.tsx` — a real bug found and fixed**

The cut face was rendering as a flat grey slab. Cause: `spongeMaterial` was called
with `tileRepeat(shape, dims.radius, 1, 0.3)`. One world unit is **90.7 mm**
(`geometry.IN = 0.28` units per inch), so a 0.3-unit tile put `spongeNormal`/
`spongeCrumb`'s frequency-38 field into 27 mm of sponge — a crumb every 0.7 mm, far
past what the pixels resolve. The normal map averaged to flat and the tone map
averaged to its own mean, which being a *darkening* field (`luminanceMap`, depth
0.26) dragged every sponge ~13% dark and towards grey. Tile is now **1.1** — a
crumb every ~2.6 mm. This was masking how much the roughness change bought.

**`components/three/geometry.ts` — the frosting band at the cut (§5.3 req. 1)**

§5.3's first cut-surface requirement: "The frosting shell shows its thickness at
the cut as a visible 2–4 mm band. Right now the shell reads as zero-thickness
paint, which is the main reason the section looks fake."

- New module-private **`bandProfile(profile, t)`** (around line 338): offsets a
  lathe profile inward along its own 2D normals and closes the loop, producing a
  simple polygon whose closing segments lie on the axis at `x = 0`.
- New **optional** `BodyOpts` field **`capBand?: number`**, threaded through
  `tierGeometry` → `cutLathe` / `bundtGeometry`. When set, `cutLathe` hands
  `bandProfile(...)` to the existing `capGeometry` instead of the whole profile.
- `shellGeometry` sets `capBand: lathe && opts.sector ? t : undefined`. `capCut`
  stays `false` — the band is a **third** option, not a flag on that one.

**Why lathes only, and why that is correct rather than a shortcut.** Extruded
shapes (square, rectangle, hexagon, heart) already show a cross-section: their wall
follows both radial cut edges, which is exactly what `setBack` exists to push
*behind* the sponge's. The zero-thickness defect was round-and-bundt only. Round
being the default shape is why it read as the whole product's problem.

**THE GUARD — do not remove.** `shellGeometry`'s radial-shaping block fires on any
vertex whose normal is horizontal, and a cut cap's normal is horizontal, so it read
as *wall*: it collected the full base fillet (55% of `t`) and, being flat in a plane
through the axis, a radial push slides its inner edge straight outward. The band
would close to under half its width at the board. The fix separates the three
surface kinds by a second fact — how much of the normal points away from the axis:

| surface | `sideness` | `radialness` | `cutFace` |
|---|---|---|---|
| wall | 1 | 1 | 0 |
| lid | 0 | 0 | 0 |
| cut cap | 1 | 0 | **1** |

`cutFace = sideness * (1 - radialness)` isolates the third row. It is a **smooth
factor, not a test**, because the cap's outer rim shares vertices with the wall's cut
edge and `weldNormals` has already averaged their normals — those land mid-scale and
must keep moving *with* the wall or the band tears off. Applied twice:
`d *= 1 - cutFace * 0.85` (stops a rustic cut face lifting 2.5 mm out of plane) and
`dr = (...) * sideness * (1 - cutFace)` (keeps the band a band).

*Verified visually:* band reads on lab/4 (2 kg), is unmistakable on lab/6 (fondant
purple over cream sponge), and **holds to the base on lab/3 (0.5 kg)** — the tightest
band in the catalogue and where the fillet is strongest. Whole cakes unchanged.

**`components/three/SpongeLayers.tsx` + `geometry.ts` — the filling squeeze (§5.3 req. 3)**

§5.3: the filling "squeezes at the cut edge: a 0.3mm bulge where it meets the
exterior, with a very slight sag."

*The root cause was not the missing bulge.* Filling bands were built at `height: 1`
and squashed onto the cake by a mesh `scale={[1, s.height, 1]}` — and a band is
~3.2mm on a ~100mm tier, so that scale is **[1, 0.035, 1]**. Two things follow:

- a bevel declared as `0.02` was **1.8mm across and 0.02mm tall** — an overhang, not
  an edge;
- three.js takes normals through the *inverse* scale, so the 45° normal on a
  rounded rim came out **28× steeper in y** and pointed at the ceiling. The rim
  shaded like a lid, the wall shaded like a wall, and nothing shaded in between.

That is why the filling read as a stripe printed on the side of the cake. Fixed by
building the band at its **real height** (all bands come out of `slabStack` at one
height, so it is still one geometry) and scaling only the sponge slabs. The default
bevel then lands at 0.65mm in both axes — a meniscus — and the normals are its own.

On top of that, in `geometry.ts`:
- **`MM = IN / 25.4`** — one millimetre in world units, so §5.3's figures can be
  written as `0.3 * MM` and checked against the document.
- **`FILLING_SQUEEZE = 0.3 * MM`** (exported), and **`squeezeBow(t)`**: smoothstep
  either side of a belly at **0.42** of the band's height. Zero slope at both rims
  and at the belly, so there is no crease for a specular to catch.
- **`BodyOpts.squeeze?: number`**, consumed by the `round` branch of `tierGeometry`.

**Why `squeeze` also drops the base flare.** `lathePoints` flares the base by
1.012 and tapers back — a cake settling under its own weight over 100mm. Inherited
by a 3mm band that is a **1.4mm wedge, five times the bulge and pointing the wrong
way**, so the band came out a cone and shaded like one. Setting `squeeze` passes
`flare = 1`. Do not re-couple them.

**Round only.** An extruded shape's slab already carries ExtrudeGeometry's bevel
round both ends, which is convex in the right direction and reads as a meniscus;
what it cannot be asked for is a belly off the centre, and there is no per-step
radial control on `ExtrudeGeometry` to add one. **The sag is a round cake's for
now** — this is a real, named gap, not a claim of completeness.

*Verified:* A/B rendered at 1500×1100 on lab/5 (naked, 4 layers, strawberry jam on
vanilla — the highest-contrast filling in the catalogue) with the old build and the
new one at identical framing. Old: uniform flat red, hard edges, one value across
the whole band. New: belly highlight, both rims falling away, a shadow line under
the lower rim. Also checked on lab/2 (three-tier, smallest top tier) and lab/3
(0.5kg, tightest geometry) — no tearing, no z-fighting, frosting band still holds
to the base.

*Thickness was already in range and was left alone.* `slabStack`'s
`bandH = min(0.035, height × 0.045)` resolves to **0.035 = 3.17mm at every size the
catalogue sells**, inside §5.3's 3–5mm. It now *reads* a little thinner, because
1.3mm of the 3.2mm is meniscus curving away from the key. Bumping `bandH` toward
4mm would move **every layer boundary in the product** and invalidate every visual
baseline — a separate commit, if it is wanted at all.

**`components/three/geometry.ts` — the cut-face bevel (§5.3 req. 4)**

§5.3: "The cut face has a 0.5mm bevel with a soft highlight, so it does not read as
a boolean operation."

- **`CUT_BEVEL = 0.5 * MM`** (exported, for the test).
- **`insetProfile(profile, t)`** and **`outwardNormal(profile, i)`** factored out of
  `bandProfile`, which is now one line over them. The frosting band and the cut
  bevel are the same offset at different magnitudes.
- **`beveledCap(profile, b)`**: the cap's outline is inset by `b`, and the ring
  between inset and original is filled with quads whose outer row carries normals
  tilted **45°** — `normalize(nx, ny, 1)` — toward whatever the rim runs into.
- `capGeometry` takes `rim`; `cutLathe` takes `rim` and passes it only when the cap
  is a full profile, never a `capBand`; `tierGeometry`'s **round** branch passes
  `CUT_BEVEL`.

**It is a shading bevel, in the plane of the cut, and that is deliberate.** A
displaced chamfer has to take material off *both* faces meeting at the edge: the cap
insets by b **and the wall must set back by b**, or the cut opens a b-wide slot to
the inside of the cake. Setting a lathe's wall back means shrinking `phiLength`, and
an angle is a fixed *arc* — one dφ is 0.5mm at the rim and nearly nothing by the
time the lid reaches the axis, i.e. a chamfer that vanishes exactly where the lid's
edge is most visible. Doing it properly means rebuilding the cut as a swept surface.
And it would buy nothing: 0.5mm is about one pixel, so the two are the same handful
of pixels and the difference between them is entirely the highlight — which is the
half §5.3 actually asks for. What the in-plane version cannot do is open a seam.

**Why the ring stops at the closing segment.** `ShapeGeometry` closes the outline on
the axis, and `insetProfile`'s clamps keep both axis points on the axis, so the
inner outline closes on that same line. The sliver between the two closing segments
has no area — so skipping it leaves ring + inner face covering exactly the outer
face's area, with **no hole**, and **no bevel down the crease where the two cut
faces meet**, which is not an edge a knife makes.

**Excluded, deliberately.** *Bundt:* `bundtGeometry` flutes the geometry **after**
`cutLathe` returns and then calls `computeVertexNormals`, which would overwrite
every normal the bevel exists to carry; its profile is also a closed ring starting
on the core, so `insetProfile`'s end-clamping is wrong for it at the seam.
*The frosting shell:* it caps through `capBand`, and that band is 2–4mm wide —
0.5mm off each side is a third of the one feature §5.3 puts first.
*Extruded shapes:* their cut faces are `ExtrudeGeometry` walls following the radial
cut edges, already bevelled top and bottom by `bevelEnabled`; the vertical corner
where the cut meets the wall is an outline corner and is not.

*Measured, not assumed.* At R=1.26, H=0.36: **55 vertices at exactly 45°** (the
profile is 55 points), 110 flat (55 ring-inner + 55 face) — the 2:1 ratio the test
now asserts. Inset-at-a-mitre folds two microscopic triangles at the bevel arcs;
swept over every radius (0.84–1.68) and height (0.04–0.9) the catalogue renders,
the folded area is **0.0002%–0.03%** of the cut face. Not worth a polygon-offset
library.

*Verified:* A/B rendered at **800×620, 1:1 with no downsampling** on lab/5, same
framing both sides. With the bevel, a thin light line traces the whole perimeter of
each cut face — the vertical edge against the sponge wall, the top edge under the
frosting lid, the board edge, and the ends of the filling bands. Without it, every
one of those is a hard tonal step. **Note the pane downsamples anything wider than
800px, and half a pixel of bevel does not survive that** — the earlier 1500×1100
shots could not show this and a smaller viewport was the only way to see it.

**`components/three/Crumbs.tsx` (new) + `geometry.ts` — loose crumbs (§5.3 req. 5)**

§5.3: "Loose crumbs on the board beneath the cut — 6 to 12 tiny instanced meshes
with sponge material, scattered with a seed. They cost nothing and they are the
single detail that makes people believe it."

- **`crumbGeometry()`**: one `IcosahedronGeometry(1, 0)` displaced by `fbm3` **of
  the vertex's own direction** — `PolyhedronGeometry` is non-indexed and duplicates
  its vertices per face, so driving it from an index pulls every face apart — then
  **normalised to a maximum radius of exactly 1**. One upload, shared by all.
- **`scatterCrumbs(seed, radius, sector)`** returning `Crumb[]`, in `geometry.ts`
  beside `slabStack` and `dripSpecs`, which is where this project keeps seeded
  specs. 6–12 crumbs, two populations: ~45% into the notch the slice came out of
  (kept off the cut faces), the rest on the board just in front of it, spread wider
  than the wedge because they bounce. Nothing anywhere else — a crumb behind an
  uncut cake has no story.
- **`Crumbs.tsx`** instances it. Rendered from `Cake.tsx` under `showBoard &&
  sliced`, outside the hero reveal.
- **`BOARD_H` / `BOARD_DROP` / `BOARD_TOP`** exported from `geometry.ts` and now
  used by `CakeBoard.tsx` too, so the board's lid has one definition. It was `0.055`
  in `boardGeometry` and `-0.05` in `CakeBoard`, in two files; the crumbs are the
  first thing that has to sit exactly on it.
- **`MM`** exported.

**They do not scale with the cake** — the same argument `scaleForSize` makes about a
strawberry. 1–3 mm always.

**Why `crumbGeometry` normalises, and why it matters.** An instance's `scale` is the
crumb's real half-extent only while the mesh it scales reaches exactly 1.
Un-normalised, the noise made a nominally 1.5 mm crumb 1.9 mm, and §5.3's size band
stops being something a test can check.

**A real bug the test caught.** The x and z jitter was `s * (0.78 + rng() * 0.22)`
on *both* axes — so nothing guaranteed either ever reached `s`, and the smallest
crumb came out **0.78 mm rather than 1 mm**. Now one horizontal axis is `s` exactly
and the other is shortened; the footprint is still an ellipse, the rotation is
random about all three axes, and `s` is genuinely the longest dimension.

**⚠ THE `CRUMB_LIFT` TRAP, hit and fixed — §8 warns about exactly this.**
`spongeMaterial` returns `shade(blended, CRUMB_LIFT)` with `CRUMB_LIFT = 0.07`,
lifted **because `luminanceMap` can only darken** and the crumb tone map is expected
to bring it back down. The crumbs drop the maps — they are 1–3 mm, well inside one
cell of a map tiled for a hundred — and the first version kept the material's colour
anyway, so every crumb rendered **7% pale and read as white specks on the board**.
Fixed by extracting **`spongeBaseColor(sponge)`** in `materials.ts` — the flavour's
colour, marble's blend included, without the lift — which `spongeMaterial` now also
uses. **Any future mapless sponge surface must use `spongeBaseColor`, not
`spongeMaterial().color`.**

Per-instance colour varies by 9% either way, because some of a cut face is crust and
some is open crumb, and debris that is all one value reads as one shattered object.

*Verified:* rendered at **800×620, 1:1**. On **lab/0 (Belgian chocolate)** the crumbs
are unmistakable dark specks on the pale board — that is the specimen to look at,
because dark-on-light is where they read hardest. On lab/5 (vanilla) they are
correctly pale and quiet. **An uncut cake's board is completely clean**, confirmed by
toggling the slice off on lab/0.

**`app/globals.css` + `CakeScene.tsx` — 2% film grain (§5.2), completing item 1**

§5.2: "ACES tonemapping, exposure 1.0, and 2% film grain matched to the paper
grain. The grain is what stitches the render into the paper world."

- **`--grain`** token in `@theme` holds the inline `feTurbulence` data URI once.
  **`body::after` (4%, §1.3) and the new `film-grain` utility (2%, §5.2) both read
  it** at the same 256px tile. "Matched" is now structural rather than two noises
  that resemble each other.
- `film-grain` goes on the R3F `<Canvas>` className, which **lands on Canvas's own
  outer div** — already `position: relative; overflow: hidden`, so no wrapper, no
  layout change, and the overlay is clipped to the specimen.

**A CSS overlay, not a postprocessing pass.** `@react-three/postprocessing` plus an
EffectComposer is a large dependency and a second full-screen render target to add
one noise term — against §8.8's mobile budget, and against a scene that runs
`frameloop="demand"` and draws nothing most of the time.

**It sits *under* the paper layer, not instead of it.** A photograph carries its
own emulsion grain and then the texture of the stock it is printed on; both are
present and they are not the same event. The two are deliberately **not**
phase-locked — same texture, same scale, independent offsets.

### Mobile pass on the builder (unplanned — user report)

Reported as "too small on mobile, render quality very bad". Measured on 375×812 at
the toppings step rather than guessed:

| | before | after |
|---|---|---|
| canvas | 319 × **182** | 335 × **320** |
| ToppingBar | **214px** (35% of usable height) | **92px** |
| picker (`main`) | 168px box, 2733px content | unchanged |

The builder has **618px** to share between render, bar and picker after chrome and
footer. It is zero-sum, and the bar was taking 35% of it.

- **`lib/quality.ts`: `LOW.dpr` `[1,1]` → `[1,1.5]`.** On a phone reporting 3, `1`
  drew the cake at **a ninth** of the screen's pixels and let the browser upscale.
  That is the "render quality is very bad". Resolution is the only one of the five
  settings the eye reads directly, so it should be the **last** thing cut — LOW
  still drops segments, shadows, instances and antialiasing.
- **`CakeScene.tsx`: `fill`'s air now scales with frame height.** 22% margin is
  composition on a 600px canvas and 40px of empty chipboard on a 182px one. Full
  above 300px, tapering to a quarter of it at 200px. **Written against canvas
  pixels, not a breakpoint**, so the preset cards and the hero are untouched —
  verified on desktop.
- **`BuilderShell.tsx`: stage padding `p-4` → `p-2 sm:p-3`** below lg. It was a
  sixth of the canvas at these heights.
- **`ToppingBar.tsx`: the two pill strips collapse behind a summary row below lg**
  (`aria-expanded` / `aria-controls`, no animation). Density stays outside and
  stays live — sweeping it while the top fills up is the whole argument for the bar.

**Why the bar could not simply be shrunk or moved.** Five placement pills need
**381px of a 301px row**, and "White Chocolate Curl" alone is 211px, so the wrap is
doing its job; horizontal scrolling was tried before and reverted because it hid
Crown past the right edge. And it cannot move to the page below —
`app/build/toppings/page.tsx:112` says "Placement and density sit on the preview",
so the bar is their only home.

**Not a bug, and it will look like one.** Expanding the bar shrinks the canvas to
156px and the cake appears cropped *in the Browser pane*. `Framing`'s `useFrame`
re-fits continuously and `target` recomputes on `size.height`; the pane throttles
rAF to ~1Hz so the lerp takes seconds to converge. Wait and re-screenshot.

**`components/three/MessagePlaque.tsx`**
- `messageTexture` canvas `W` 1024 → **2048** per §5.3. `H` is derived, so this is a
  2048×~700 RGBA upload (~5.7 MB) and only for cakes carrying a message.

### §10 item 2 — SECTION as the default view (complete)

- **`lib/view.ts`**: `sliced` initial value `false` → **`true`**. §5.3: "Section view
  is the default. Whole cake is the toggle." The `toggleSlice` action and the
  `ViewState` interface are unchanged, and the button label already flips both ways.
  The file's own comment notes `sliced` is deliberately outside `CakeConfig`, so
  this cannot affect the config hash, docket, price or saved-design URLs.
- **`app/build/BuilderShell.tsx`**: deleted the `LIVE 3D` pill entirely; removed
  `cake-panel` and `rounded-panel` from the viewport container. Padding stays — it
  is the camera safe area.
- **`app/globals.css`**: `cake-panel` utility **deleted** (it carried a raw
  `#C9C3B4` border plus a three-layer shadow including an inset highlight — three
  §1.4 violations in one utility). `cake-stage` changed from a three-stop radial
  vignette to a **flat** `var(--color-slab-deep)`; §1.2 bans gradients and §10 item 2
  wants the specimen full-bleed on `--paper-3`.
- The other two `cake-panel` call sites were cleaned in the same pass:
  `app/d/new/page.tsx`, `app/d/[slug]/page.tsx`.

### §10 item 3 — the message plaque (complete)

Most of §5.3's plaque requirements were **already correct** before this work — flat
`ExtrudeGeometry` plaque with rounded corners and normalised UVs
(`geometry.plaqueGeometry`), a canvas colour+bump texture, a real script webfont
(`Style_Script` via `next/font`), a three-pass piping bead, and no wrapping around
curvature. The only gap was the canvas size, now 2048 (above). **Do not rebuild this
component believing it is unimplemented.**

### §10 item 4 — type system swap (complete for faces, weights, italics, headings)

- **`app/layout.tsx`**: `Instrument_Serif` and `Martian_Mono` removed;
  **`Geist_Mono`** added via `next/font/google` at weights `["400","500"]`, exposed
  as `--font-geist-mono`. `Instrument_Sans` retained at `["400","500"]` as a
  **placeholder for Switzer** (see §3). `<html>` className now carries only the two.
  `themeColor` `#E9E7E2` → **`#E8E7E1`** (§1.2 `--paper`). `<body>` class
  `bg-slab` → `bg-paper`.
- **`app/globals.css`**: `--font-mono` re-pointed at Geist Mono, so ~30 files'
  existing `font-mono` call sites picked up the new face **untouched**.
  `--font-display` **kept as an alias of mono** rather than deleted — §1.1 says every
  headline is mono, so mono *is* the correct display value, and keeping the token
  means the two `font-display` call sites became mono instead of silently falling
  back to a browser serif.
- `h1,h2,h3` → mono, weight 400, `text-transform: uppercase`. `h4` → mono, weight
  **500** (was sans 600; §1.1 bans 600 outright).
- **`p`** given `font-family: var(--font-sans)`, `max-width: 62ch`, prose sizing.
  Rationale: mono is the brand default so `body` is mono, and prose is the exception
  that opts out — the inverse of how the file used to read. §1.1: "Switzer appears
  only inside explanatory prose." A paragraph is the reliable signal and is never a
  ticket line. The rule is deliberately blunt; §1.1 notes prose under six words
  should have been mono, so a few short `<p>` labels are caught wrongly.
- §1.1's **full type scale added as tokens**: `--mono-xs` … `--mono-4xl` with
  matching `--leading-mono-*` and `--tracking-mono-*`, plus `--prose-sm` …
  `--prose-xl`.
- Mechanical sweep across **17 files**: every `font-bold`/`font-semibold` →
  `font-medium`. Three `italic` usages removed (`app/page.tsx` ×2,
  `app/presets/page.tsx` ×1), emphasis moved to colour.

### §10 item 5 — colour tokens, radii, shadows, grain (complete)

- **`app/globals.css`** now defines §1.2 canonically: `--color-paper` `#e8e7e1`,
  `--color-paper-2` `#dfd3b8`, `--color-paper-3` `#cfc9ba`, `--color-ink` `#22211e`,
  `--color-ink-60/-35/-15`, `--color-carbon` `#3b3e93`, `--color-carbon-ghost`,
  `--color-stamp` `#a82f27`.
- **The legacy names are kept as ALIASES** pointing into that set (`--color-graphite`
  → `--color-ink-60`, `--color-slab` → `--color-paper-3`, `--color-counter` →
  `--color-paper-2`, `--color-rule` → `--color-ink-15`, etc.). **This is the single
  most important implementation decision in item 5**: because every call site already
  said `bg-paper` or `text-ink` rather than naming a hex, re-pointing the tokens
  re-skinned ~40 components with no component edits. The aliases are the migration,
  not the destination — as each screen is rebuilt it should move onto the §1.2 names
  and its alias should go.
- **Brass is gone**, mapped onto `--color-carbon`. §1.2: semantic colour is carbon
  and stamp only — "There is no green, no yellow-warning, no blue-info." A reference
  (design number, docket ref) is the kitchen's handle on the order, so it is carbon.
  `--color-seal` → `--color-stamp`.
- Contrast was checked, not assumed: ink 12.4:1 on paper, ink-60 5.2:1 on paper and
  4.5:1 on manila, carbon 7.1:1, stamp 5.5:1. `--color-ink-35` is 2.4:1 and is
  **boundaries only, never text** — §1.2 says so and the ratio confirms it.
- **All four `--radius-*` tokens DELETED**, not zeroed. §1.4: "Delete `--radius-*`
  from your token file entirely so it cannot creep back." A token set to 0 is an
  invitation; an absent token is a compile error. `:focus-visible`'s
  `border-radius: 4px` also removed.
- **Every `rounded-*` utility stripped** across the codebase, then §1.4's one
  sanctioned exception restored: the topping colour swatches at
  `app/build/toppings/page.tsx:82` and `components/builder/ToppingBar.tsx:174` are
  `rounded-full border border-ink/20`. Their inset box-shadow rings became real 1px
  borders.
- **Six shadow tokens → one.** `--shadow-sheet: 0 12px 28px -20px rgb(34 33 30 /
  0.4)` from §1.3 item 2. Two call sites survive, both genuine paper-over-paper:
  `components/docket/Docket.tsx:45` (docket on the desk) and
  `app/build/BuilderShell.tsx:323` (mobile sheet over the ticket). The mobile sheet
  rises from the bottom so its old shadow was cast upward; it now takes the same
  downward value because there is only one. `paper-edge` utility rewired to
  `--shadow-sheet` **plus a 1px `--color-ink-15` border**, since §1.3 makes the
  border half of the effect.
- **Body paper grain** added as `body::after`: fixed, `inset: 0`, `opacity: 0.04`,
  `mix-blend-mode: multiply`, tiled 256 px, hidden under
  `prefers-reduced-transparency: reduce`. **It is a generated inline SVG
  `feTurbulence`, not the scanned PNG §1.3 describes** — no scan was available, and
  every other texture in this project is generated (`components/three/noise.ts`
  builds the cake's own maps from a value-noise lattice rather than shipping images).
  This also means the render-side film grain can be made to genuinely match it.

### Housekeeping (complete)

Four iCloud conflict duplicates deleted — `lib/ui 2.ts`, `lib/ui 3.ts`,
`lib/ui 4.ts`, `tests/slice.test 2.ts`. Verified unimported before deletion, and
`tests/slice.test 2.ts` never ran (vitest's `include` is `tests/**/*.test.ts`; the
filename ends `" 2.ts"`). Between them they held ~30 phantom radius/shadow
violations that made the audit look worse than it was. **These deletions are
staged.** Note `e2e/snapshots/builder-phone 2.png` is the same kind of duplicate and
still present.

### Changed in the tree, but NOT by this work

`eslint.config.mjs` has `".claude/**"` added to `globalIgnores`. **This was applied
by the user**, not by the redesign. It took the full-project lint from 10,417
problems to 13 by excluding 28,998 files of untracked plugin cache.

---

## 3. Partially Completed / In Progress

### §10 item 1 — COMPLETE

All five of §5.3's cut-surface requirements and §5.2's film grain are done; see §2.
Kept here only for the trap below, and for the record of what the grain replaced:

1. **2% film grain on the render, matched to the paper grain** — ACES tonemapping is
   already in place (`CakeScene.tsx`'s `<Canvas gl={{ toneMapping:
   THREE.ACESFilmicToneMapping, toneMappingExposure: framing.exposure }}>`) and
   `PLAIN_SHOT.exposure` is 1.0. The grain is not. There is **no postprocessing library
   installed** and adding one for this is not warranted; the paper grain is now an
   inline `feTurbulence` in `app/globals.css`, so a CSS overlay of the same source
   over the canvas would literally match, which is what "matched to the paper grain"
   asks for.

**Trap already discovered, relevant to any change near the shell.**
`geometry.shellThickness(radius) = Math.max(0.022, radius * 0.035)` overshoots
§1.4's 2–4 mm at 5 kg (0.0588 = 5.3 mm). Capping it is tempting but it is consumed by
`Tier.tsx`, `MessagePlaque.tsx:327`, `Drip.tsx:65`, `Toppings.tsx:178` and
`shellMetrics`, and asserted in `tests/toppingPlacement.test.ts:187`. Changing it
moves the plaque, the drip and every top-face garnish and shifts every visual
baseline. **Do it as a separate commit or not at all.**

### §10 item 4 — the type scale's call sites

The §1.1 scale exists as tokens but **the call sites have not been migrated.**
Components still use the outgoing scale (`text-micro`, `text-meta`, `text-body`,
`text-item`, `text-title`, `text-heading`, `text-display`, `text-hero`), which is
still defined in `app/globals.css` above the new tokens with a comment saying so.
Headlines are mono and uppercase via the `h1`–`h4` base rules, but per-element
sizing, tracking and `uppercase` on buttons and labels are not yet on §1.1's values.
This is a large mechanical sweep across ~40 files and should probably wait until the
screens that own them are rebuilt.

### Switzer

`Instrument_Sans` is a **placeholder**. Switzer is on Fontshare, not Google Fonts, so
it needs `.woff2` files in the repo and `next/font/local`. The placeholder is capped
at the same 400/500 weights so the swap is a two-line change in `app/layout.tsx`.
Agreed approach: Geist Mono from `next/font/google` (done), Switzer local once files
are supplied.

---

## 4. Explicitly NOT Done

**Do not assume any of the following exists.**

- **`src/styles/tokens.css` is an ORPHAN.** It was created early as a literal
  transcription of §1.2 and §1.4 and **nothing imports it** (verified). It is *not*
  the live token source — `app/globals.css` is. This project has no `src/`
  directory otherwise; it is app-router (`app/`, `components/`, `lib/`). The file is
  untracked. Either wire it in deliberately or delete it, but do not edit it
  believing it affects the running app.
- **`--accent` / `--accent-2` are NOT wired.** §1.2 gives them exactly three
  consumers — a 3% paper tint, a 4% key-light tint on the specimen, and the 2 px
  active line marker, over a 600 ms ease-out. Verified: no `--accent` reference
  exists anywhere in `app/`, `components/` or `lib/`. The 4% accent tint on the key
  light named in §5.2 is therefore also absent.
- **§10 item 6 — homepage rebuild as blank ticket + intake: NOT STARTED.** The
  homepage is still the pre-redesign marketing page. It has been re-skinned by the
  token and type swap, nothing more. The "How it works" section, the hero cake
  render and the double masthead CTA are all **still present**, and §10 says to
  delete them.
- **§10 item 7 — dot leaders and ink-bleed on the docket: NOT DONE.** A
  `docket-leader` utility exists in `app/globals.css` but it is a
  `radial-gradient` background, not §1.4's "real dotted `border-bottom` on a flex
  spacer." §1.3 item 4's ink-density treatment (`opacity: .92` plus a sub-pixel
  `text-shadow` on ticket values) is absent.
- **All of Phase 2 (§10 items 8–14): NOT STARTED.** In particular the **builder
  architecture is completely untouched.** There are still nine `/build/*` routes;
  `components/builder/StepNav.tsx` still renders the numbered step rail and the
  `PhaseMeters` progress bar; `BuilderShell` still shows "Step N of 9" and a "Start
  again" button. §10 lists every one of those under "Remove entirely," and
  `CLAUDE.md`'s signature element ("the ticket is the navigation") is not
  implemented. Do not begin this without explicit instruction.
- **All of Phase 3 (§10 items 15–21): NOT STARTED.** Includes hand-modelled topping
  meshes, dimension callouts, stamp SVGs with seeded rotation, the strike-through
  decision history, and the `prefers-reduced-motion` pass.
- **§1.5 iconography: NOT STARTED.** No hand-drawn 1px icon set exists.
- **§1.6 boxless inputs: NOT DONE.** Inputs still have borders; §1.6 wants a 1px
  baseline rule and a blinking block caret.
- **§1.3 stamps as SVG: NOT DONE.** The `stamp` utility in `app/globals.css` is
  still CSS — `border: 3px double`, a fixed `rotate(-7deg)`. §1.3 item 6 wants four
  named SVG assets with rotation seeded from the ticket number.
- **§1.3 perforation: NOT DONE.** Used zero times; §1.3 wants exactly twice.
- **Routes `/confirm`, `/t/:id`, `/archive`, `/bakery`: DO NOT EXIST.** Current
  routes are `/`, `/build` + 9 children, `/d/new`, `/d/[slug]`, `/kitchen`,
  `/lab`, `/lab/[index]`, `/presets`, `/shoot/[slug]`.
- **§1.4's 28 px / 36 px ticket line height: NOT IMPLEMENTED.** Verified absent from
  `components/docket/DocketLine.tsx`. §1.4 is explicit that keeping this exact is
  what lets the Feed motion translate by whole line-heights.
- **No visual/snapshot baseline has been regenerated.** See §7.

---

## 5. Do NOT Undo / Preserve

These are established by the blueprint or by verified implementation. Reverting any
of them is a regression.

**Visual direction**
- `border-radius: 0` everywhere. The **only** sanctioned exceptions are the two
  topping colour swatches and (when they exist) the stamp SVGs.
- Exactly **one** box-shadow, `--shadow-sheet`, used only where paper genuinely lies
  over paper. Buttons, inputs and cards have zero shadow.
- **No gradients.** `cake-stage` was a radial vignette and is now flat; do not
  reintroduce a "pool of light" under the cake.
- The paper grain is a **body-level layer only**. §1.3: "Cards do not get their own
  texture. Sheets do not get their own texture. One grain for the whole world."
- **Paper is cool (`#E8E7E1`) and manila is warm (`#DFD3B8`).** §1.2 is emphatic
  that this contrast is what makes two stocks read as two stocks, and that the top
  copy must not be warmed. The old warm `#FDFCFA` is the bug, not the goal.
- **No brass, no green, no yellow-warning, no blue-info.** Semantic colour is
  `--carbon` (the kitchen's version) and `--stamp` (stop / sealed) only.

**Typography**
- Two faces. Geist Mono carries everything; the sans is for prose over one line only.
- **No weight above 500.** No 600 either — §1.1 bans it explicitly.
- No display serif, no italics.
- Keep `--font-display` as an alias of mono; deleting the token makes its call sites
  fall back to a browser serif.

**3D**
- Roughness floor 0.35, with the three exceptions documented in §2.
- Metal only on gold leaf.
- **Keep the frontal lightformer.** Removing it re-greys the cut face.
- **Keep the `cutFace` guard in `shellGeometry`.** Without it the frosting band
  closes at the base. This is the most fragile part of the band change.
- Light colour temperatures and the §1.2 palette are **coupled**; do not change one
  alone.
- `HERO_SHOT.exposure = 1.16` is a deliberate dark-subject correction.
- **SECTION is the default view.** `lib/view.ts` `sliced: true`.
- The sponge crumb tile is **1.1**, not 0.3. Lowering it re-aliases the cut face to
  grey.
- `capCut: false` on the frosting shell stays. The band is a separate `capBand`
  door; a full cap lays a slab of buttercream across the cross-section the cut
  exists to show.
- **Filling bands are built at their real height, not at 1 and scaled.** The mesh
  scale is `[1, s.kind === "sponge" ? s.height : 1, 1]` for exactly this reason.
  Putting the filling back on a 28× non-uniform y-scale destroys its normals and
  the squeeze with them.
- **`squeeze` implies `flare = 1`.** A band inheriting a tier's 1.2% settle-flare is
  a 1.4mm wedge over 3mm — five times the bulge, the other way round.
- **The cut bevel is in the plane of the cut, on purpose.** Displacing it without
  also setting the wall back opens a 0.5mm slot into the cake. See §2.
- **The bevel ring stops at the closing segment on the axis**, and `rim` is passed
  only for a full-profile cap — never for a `capBand`, never from `bundtGeometry`.
  All three are load-bearing; §2 says why for each.
- **Crumbs render only under `showBoard && sliced`.** An uncut cake's board is
  clean, and that is not an oversight to be helpfully fixed.
- **`crumbGeometry` normalises to radius 1**, and `scatterCrumbs`'s major horizontal
  axis is `s` exactly. Both exist so an instance's `scale` is the crumb's real size
  in millimetres; break either and §5.3's 1–3 mm band becomes unverifiable.
- **`spongeBaseColor`, not `spongeMaterial().color`, for any mapless sponge
  surface.** The material's colour carries `CRUMB_LIFT`, which only exists to be
  cancelled by a tone map. See §2 and §8.

**Existing functionality that must remain intact**
- `sliced` stays **out of `CakeConfig`** — it is view state. Moving it in would
  change the config hash, the docket, the price and every saved design URL.
- The price engine, allergen derivation and undo/redo state.
- The URL-encoded design (`/d/[slug]`) — §10 lists it as an asset to promote, not
  replace.
- `geometry.shellThickness` and `geometry.shellOutline` signatures — the plaque, the
  drip, every top-face garnish and `tests/toppingPlacement.test.ts:187` depend on
  them.
- Deterministic seeded rendering. `e2e/visual.spec.ts` only works because scatter,
  drips and layer jitter are all hashed from the config.

---

## 6. Known Issues / Bugs

### Introduced by this work
- **Nothing known.** Whole-cake renders are unchanged (verified: `capBand` is only
  set when a sector exists), and no test or typecheck regression appeared.
- Worth a human's eyes: the builder's controls, buttons and labels are now flatter
  and more uniform than before, because six elevation shadows and four radii were
  removed at once. That is the intended direction, but the visual hierarchy they
  used to carry has not yet been replaced by §1.4's rules, boxes and case — so some
  screens read as under-differentiated in the interim.

### Pre-existing, confirmed not caused by this work
- **The bundt render is weak.** Its glaze reads as a jagged draped cloth. Confirmed
  pre-existing by whole-cake parity: `capBand` cannot apply without a sector, and
  the uncut bundt looks identical. Already on the project's known-issues list.
- **`components/three/MessagePlaque.tsx:314`** — `react-hooks/exhaustive-deps`
  warning about `fontReady`. Verified present at HEAD (line 303 there) with its own
  comment explaining `fontReady` is a redraw trigger, not a value the texture reads.
  Deliberate.
- **`_3d_cake_reference/`** holds 1 eslint error and 7 warnings. The directory is
  **gitignored** (`.gitignore:38`) and imported by nothing, so CI never sees it.

### Outstanding §1.7 motion violations
Item 5 covered colour and form, not motion. These remain:
- `animate-pulse` skeleton shimmer at `app/build/BuilderShell.tsx:371-375` and
  `components/three/LazyCakeScene.tsx:26-27`. §1.7 bans skeleton shimmer.
- `@keyframes chosen` (a `scale`) used at `components/builder/OptionGrid.tsx:91`.
  §1.7 bans hover / scale.
- `@keyframes step-in` (opacity + translateY) used at
  `app/build/BuilderShell.tsx:206`. §1.7 bans fade-up.
- `@keyframes price-tick`, `sheet-up`, `scrim-in` remain in `app/globals.css`.
  `sheet-up` is arguably §1.7's "Slide"; the others need review.
- The seven sanctioned motions (Print, Feed, Stamp, Strike, Slide, Settle, Warm) are
  **not** implemented.

### Remaining hex literals in components (CLAUDE.md rule 7)
Six real cases, all outside `components/three/` (where hexes are legitimate material
data):
- `app/page.tsx:284` — `bg-[linear-gradient(180deg,#E4E0D6,#D8D3C7)]`. Both a
  gradient and hex literals. Lives in the section §10 item 6 deletes.
- `app/build/review/page.tsx:242` — `bg-[#8FA85E]`, **a green**. §1.2: there is no
  green.
- `app/build/finish/page.tsx:108` — `config.dripColor ?? "#3B2318"` default.
- `components/PresetCakeViewer.tsx:274,276` — SVG `fill` attributes.
- `app/layout.tsx:61` — `themeColor: "#E8E7E1"`. Unavoidable; Next metadata needs a
  literal. Correct value.

---

## 7. Verification

All results below were produced by running the commands, not inferred.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** — clean, no output |
| Unit tests | `npx vitest run --testTimeout=300000` | **PASS — 194/194**, 7 files |
| Lint, tracked code | `npx eslint app components lib scripts e2e tests prisma` | **PASS — 0 errors**, 1 pre-existing warning |
| Lint, whole project | `npm run lint` | **13 problems (1 error, 12 warnings)** — the error and 7 warnings are in gitignored `_3d_cake_reference/` |
| Visual / snapshot | `npm run visual` | **NOT RUN** — see below |
| Browser pane | manual | Verified on `/`, `/build/sponge`, `/build/review`, lab 0/1/2/3/4/5/6/11. No console errors from current code; server error log clean |

**⚠ On a red suite: check the machine before you check the code.**
`vitest`'s default per-test timeout is **5 seconds**, and several `cutaway` tests
raycast hard enough that a loaded machine starves a worker past it. Observed on this
one at load average ~7 with ~126MB free: the full suite reported *1 failed, 190
passed*, and **it was a different extruded-shape test each run** — `square: frosting
never covers the cross-section`, then `rectangle: a cut shell keeps its lid` — each
of which passes in **1.3s in isolation**. The tell is the error text: `Test timed out
in 5000ms`, not an assertion. `npx vitest run --testTimeout=300000` then reported
**191/191 in 158s**. A real defect is deterministic and names an expected value.
This machine runs iCloud sync over the project directory, which is the same root
cause as the stale-`.next` hang in §8.

**On the lint error.** It is `_3d_cake_reference/example/Scene.jsx:42` and the
directory is gitignored, so **CI's `npm run lint` step passes** — verified by linting
CI's actual scope. Local `npm run lint` will show 1 error until that directory is
also ignored or removed. Not a regression.

**On the visual suite — read this before running it.**
- It was **not run**, so nothing here claims the baselines pass. They almost
  certainly do not: items 2–5 changed the palette, the typeface, every radius and
  every shadow, and the band changed every cut render. Expect **all seven** tests to
  fail.
- Running it needs a production build first: `playwright.config.ts`'s
  `webServer.command` is `npm run start -- --port 3100`, and there is currently **no
  production build** in `.next`. So: `npm run build`, then `npm run visual`.
- **`npm run visual` is deliberately excluded from CI.** The comment at
  `.github/workflows/ci.yml:81` explains why: the baselines are committed PNGs
  rendered on Apple Silicon through SwiftShader, and a Linux runner's anti-aliasing
  differs enough to fail every run. So stale baselines are **not** a CI blocker —
  they are a local authoring signal only.
- **Do not run `npm run visual:update` casually.** Regenerating wholesale would
  accept every unintended change alongside the intended ones. Do it deliberately,
  once Phase 1 has been looked at, and diff the PNGs by eye first.

**CLAUDE.md's own checklist, verified fresh:**

| Rule | Result |
|---|---|
| No border-radius | **0** occurrences outside the two sanctioned swatches |
| No box-shadow except the sheet token | **0** |
| No font-weight above 500 | **0** |
| No serif, no italic display type | **0** in code (3 remaining matches are comments in `MessagePlaque` about the plaque's script face, which §5.3 requires) |
| No fade / scale / scroll animation | **FAILING** — see §6 |
| No new icon imports | No icon library added |
| Colours from tokens only | **6 hex literals remain** — see §6 |

---

## 8. Important Technical Discoveries

**Scale.** One world unit is **90.7 mm** — `geometry.IN = 0.28` units per inch
(`components/three/geometry.ts:15`). Diameters come from `lib/servings.ts:13`
`DIAMETER_IN`, in inches: 0.5 kg = 6, 1 kg = 7, 1.5 kg = 8, 2 kg = 9, 3 kg = 10,
5 kg = 12. So radii in world units are 0.840 / 0.980 / 1.120 / 1.260 / 1.400 / 1.680.
§5.3's ⌀178 mm callout example is therefore a **1 kg** cake (7 in = 177.8 mm), not
the 2 kg one. **Any comment claiming "1 unit ≈ 100 mm" or "2 kg radius ≈ 0.9" is
wrong** — one such comment was found and corrected in `SpongeLayers.tsx`.

**`tierGeometry` dispatches by shape.** `round` → `LatheGeometry` from
`lathePoints`; `bundt` → lathe from `BUNDT_PROFILE`; everything else →
`ExtrudeGeometry` from `polygonFor`. The lathe and extrude paths behave differently
enough that a fix for one is often a no-op or a bug for the other — the frosting
band is exactly this case.

**`capCut` semantics.** `capGeometry` triangulates the **entire** profile, producing
a solid-looking cross-section. That is right for sponge and filling and wrong for
the shell, which is why the shell passes `capCut: false`. Extruded shapes ignore
`capCut` entirely — `cutShape` closes the outline through an apex so
`ExtrudeGeometry` walls the radial cut edges automatically, and `setBack` then
pushes those edges behind the sponge's.

**The air gap at the cut already existed.** Shell is built at `radius + t`, with
`shellThickness(radius) = max(0.022, radius * 0.035)`; sponge slabs sit at
`dims.radius`, filling at `dims.radius * 1.002`. The gap is 2.7 mm (0.5 kg) to
5.3 mm (5 kg). Nothing filled it. **Do not shrink the sponge to make room for a
band** — the room is there.

**`lathePoints` flares the base** by `flare = 1.012` and tapers back, so a slab's
maximum outer radius is `radius × 1.012` (sponge) / `× 1.014` (filling). On a
`rustic` finish, `amp = 0.034 × radius/1.1` plus harmonics can displace the shell
wall inward by more than `t`, so a rustic shell can bite into the sponge at the
worst-case gap. Known, not yet a visible defect.

**`weldNormals` runs before displacement** in `shellGeometry` (and again after),
which is what keeps co-located vertices moving together. This is why the band's
outer rim does not tear from the wall's cut edge — they share an averaged normal.
Any per-vertex logic that treats them differently will tear. `cutLathe` deliberately
does **not** call `computeVertexNormals` (its comment says why: it would weld the
cut face to the wall and round off the very edge that makes a cut read as a cut).

**Textures are generated, never fetched.** `components/three/noise.ts` builds every
map from a value-noise lattice with a `Map` cache keyed by name. `luminanceMap` can
only **darken** (it runs `1 - depth` … `1`), so anything it multiplies must be
specified at the value its *lightest* patches should be — see `CRUMB_LIFT` and
`BOARD_MATERIAL.color`, both lifted to suit. `materials.tiled()` caches cloned
textures by `uuid:rx:ry`, because a bare `clone()` is a fresh GPU upload nothing
disposes.

**High tile counts alias to grey.** A frequency-38 field multiplied by a large
repeat exceeds Nyquist: the normal map averages flat and the tone map averages to
its mean. Check `tileRepeat`'s `tile` argument against real millimetres before
trusting a texture. This was the cut-face bug.

**Tailwind v4 `@theme`.** Tokens must live in `@theme` in `app/globals.css` to
generate utilities; plain `:root` custom properties generate none. Because tokens can
alias other tokens, an entire palette can be swapped without touching call sites —
this is what made item 5 a one-file change.

**Demand-driven canvas.** The R3F canvas does not necessarily redraw on HMR. When
verifying 3D changes in the Browser pane, force a full reload; and note the pane
reports the page hidden, so rAF is throttled — wait generously before screenshotting.

**Stale `.next` and iCloud.** iCloud conflict copies inside `.next` (`BUILD_ID 2`,
`trace 2`, …) make `next dev` hang. `rm -rf .next` fixes it; `.next` is gitignored
(`.gitignore:17`). The same conflict pattern produced the four deleted `lib/ui N.ts`
files and `e2e/snapshots/builder-phone 2.png`.

---

## 9. Blueprint References

Sections of `docs/makemycake-carbon-copy-blueprint.md` governing current work:

| Work | Section(s) |
|---|---|
| Phase order and what to remove entirely | **§10** |
| Typography, weights, type scale | **§1.1** |
| Colour tokens, accent, semantic colour | **§1.2** |
| Paper grain, shadows, perforation, ink density, stamps | **§1.3** |
| Radii, shadows, rules, dot leaders, spacing, baseline, grid | **§1.4** |
| Iconography (not started) | §1.5 |
| Buttons, boxless inputs, option-row states | §1.6 |
| The seven sanctioned motions and the banned list | **§1.7** |
| Routes, intake sequence, lead-time / pincode rules | §2 |
| Homepage rebuild (item 6, not started) | §3 |
| Builder as ticket-navigation (Phase 2, not started) | §4 |
| Camera | §5.1 |
| Lighting rig, temperatures, ACES, film grain | **§5.2** |
| Materials, roughness floor, cut surface, plaque, callouts | **§5.3** |
| Why the section reads premium without photorealism | §5.4 |
| The four docket documents | §6 |
| Mobile | §8 |
| Voice and copy | §9 |

---

## 10. Next Recommended Task

**Phase 1's 3D work is done. Stop and look at it before starting anything else.**

All five of §5.3's cut-surface requirements are in (§2), and §10's own sequencing
note is explicit: *"Do not start Phase 2 until Phase 1 is shipped and you have looked
at it for two days."* The two things genuinely left in Phase 1 are §10 items **6**
(homepage rebuild) and **7** (dot leaders and ink-bleed on the docket) — **both need
a human decision, not momentum**, because item 6 deletes the homepage's hero and its
"How it works" section.

So the next task depends on what the human wants:

**(a) Most likely — commit what exists.** Nothing Carbon Copy has been committed;
this is 44 files and ~1450 insertions of unreviewed work, and `Crumbs.tsx` is
untracked. A phase this size sitting in a dirty tree is the single biggest risk on
the project. See §1.

**(b) The cheap remaining item — §10 item 7**, dot leaders and ink-bleed on the
docket. §4 records what is actually there: `docket-leader` is a `radial-gradient`,
not §1.4's "real dotted `border-bottom` on a flex spacer", and §1.3 item 4's
ink-density treatment is absent. Small, self-contained, and it makes the one artifact
the project already owns look intentional.

**(c) The last piece of item 1 — 2% film grain on the render.** Deferred on purpose:
it pairs with the paper grain rather than with the cut surface, and there is no
postprocessing library installed. §3 has the approach — overlay the same inline
`feTurbulence` that `app/globals.css` already uses over the canvas, so "matched to
the paper grain" is literally true.

**Do not start §10 item 6 or any of Phase 2 without being asked.**

If (c) is chosen, the notes below still apply.

**What NOT to change while doing it**
- `geometry.shellThickness` and `geometry.shellOutline` — see §3 and §5.
- The `cutFace` guard in `shellGeometry`, and `capCut: false` on the shell.
- The filling's real-height build, `squeeze`-implies-`flare-1`, the in-plane cut
  bevel, the three exclusions on `rim`, or the crumbs' normalisation and
  `spongeBaseColor` — see §5.
- `slabStack`'s `bandH`. It is 3.17mm, inside §5.3's range, and moving it moves
  every layer boundary in the product.
- Any material roughness value, or the lighting rig.
- `lib/view.ts`'s `sliced: true`.
- Anything in `app/` — grain is the one cut-surface-adjacent task that does touch
  `app/globals.css`, and only there.

**What to verify afterwards**
- `npm run typecheck`, and `npx vitest run --testTimeout=300000` — expect 194
  passing plus whatever you add. **Read §7's timeout note first**; a red suite on
  this machine is usually the machine.
- Add at least one assertion to `tests/slice.test.ts` and **prove it fails when your
  change is reverted**. All four 3D features so far were validated that way, and it
  has paid twice: the seam test was written at the file's usual tolerance and
  **passed with the bevel ring deliberately removed** until it was tightened, and
  the crumb size test caught a real off-by-a-jitter that made the smallest crumb
  0.78mm instead of 1mm.
- Look at lab specimens **3 (0.5 kg, tightest geometry)**, 4 (cluttered), 6 (fondant,
  highest contrast) and 0 (dark ganache) in section view, and confirm a **whole cake
  is unchanged**.
- `e2e/visual.spec.ts` depends on deterministic rendering. **No visual baseline has
  been regenerated for any of Phase 1** — see §7 before running it.

**Browser-pane notes, learned the hard way**
- The pane reports the page hidden, so rAF is throttled and the demand-driven R3F
  canvas can take **30–60 seconds** to paint after a navigation. A blank canvas is
  not a failure; wait and re-screenshot.
- **Screenshots are capped at 800px wide and anything larger is downsampled.** A
  1500×1100 viewport looks higher-resolution and is not — it costs you 1.8× on
  exactly the millimetre-scale detail this work is about. For sub-millimetre
  features set the viewport to **800×620** and read the render 1:1.
- `computer scroll` on the canvas times out against the pane; dispatch a `WheelEvent`
  through `javascript_tool` instead if you need to dolly the camera.

---

## 11. Future Session Instructions

Start here, in this order:

1. **Read `CLAUDE.md`.** It is the compressed north star plus a hard checklist you
   must satisfy before finishing any task.
2. **Read this file** (`docs/progress.md`) end to end, especially §4 (Explicitly NOT
   Done) and §5 (Do NOT Undo).
3. **Read only the relevant sections** of `docs/makemycake-carbon-copy-blueprint.md`
   — use §9 above to find them. It is 1,343 lines; do not read it whole.
4. **Verify this file against the repository before trusting it.** Run
   `git status`, `git diff --stat`, `npm run typecheck` and `npm test`. The
   repository is the source of truth; this document can go stale.
5. **Inspect before editing.** Several things here are already implemented and look
   unimplemented (the message plaque, the crumb textures, the air gap at the cut),
   and one thing looks implemented and is not (`src/styles/tokens.css`).
6. **Complete only the approved next task** in §10. Do not opportunistically fix
   items from §6 unless asked — several of them live in code that a later phase
   deletes.
7. **Stop before starting a later phase.** §10's own sequencing note is explicit:
   "Do not start Phase 2 until Phase 1 is shipped and you have looked at it for two
   days." Phase 2 rebuilds the builder and deletes routes; it needs a human
   decision, not momentum.

**Before you touch anything, note that all Phase 1 work is uncommitted** (§1). If
you need to change branches or discard anything, commit or stash first.

**Update this file** after every meaningful milestone — and re-verify the claims you
inherit rather than copying them forward.
