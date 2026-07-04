# Pinball Reverie — Global Style Guide (plan §5a)

The single design system every visual inherits from: table art, the ball, the
DMD, backglass, UI, and all four future tables. No individual asset is
authored except from this document. Canonical color values live in
[tokens.css](tokens.css); rendered specimens live in [previews/](previews/).

## 1. Identity

**1992 Amiga pinball, remembered in a dream.** The register of Pinball
Fantasies / Pinball Dreams — airbrushed night skies, chrome type, saturated
neon inserts on deep blue-violet fields, amber plasma score displays — but an
original world (no DICE table themes, names, art, or music). Rules of the era,
kept deliberately:

- **Airbrush economy.** Gradients have at most 3 stops. Visible banding is
  acceptable and authentic; dithering is optional flavor, never required.
- **Ink everywhere.** Every shape carries a crisp `--ink` outline. No
  outline-less flat design, no photorealism, no soft ambient blur.
- **Saturation lives in the accents.** Compositions are ~70% field/steel
  darks, ~20% chrome/steel mids, ≤10% neon (`magenta / cyan / violet /
  brass`). The dark field is what makes lamps read as *lit*.
- **Could-be-real.** Every drawn element must be plausible on a physical
  machine: printed playfield art, plastic inserts, lamps, screened metal.

## 2. Palette

See [tokens.css](tokens.css) and [previews/colors.html](previews/colors.html).
Families: **field** (playfield darks), **steel** (blue structure), **chrome**
(ball/rails/bezels), **brass** (flippers, warm mechanicals), **neon** accents
(magenta / cyan / violet + alert red), **DMD amber** (5-level ramp), and
**debug** (green bodies / orange sensors — engineering overlay only, never in
shipped art; these exact values are what the in-game debug overlay draws).

Accent discipline: violet is the signature hue (logo glow, premium inserts);
magenta and cyan are feature colors; brass is reserved for things the ball
physically touches (flippers, kickers, rails).

## 3. Master units & scale

- **Playfield master SVG: 1 user unit = 1 mm.** The table master is
  `575 × 1050` (`viewBox="0 0 575 1050"`), matching the physics table of
  0.575 × 1.05 m. The SVG→fixture parser divides by 1000 — no other scale
  factor anywhere.
- **The launch lane lives outside the playfield** (Pinball Fantasies
  convention): the playfield proper is `0..520`; the plunger lane occupies
  `520..575` and meets the playfield only through the orbit at the top.
  The outer envelope, flipper pair, and drain stay centred on `x = 260`,
  and the lane must never push the layout off-centre. Interior structure
  may be asymmetric when the shot design calls for it — Moondial is
  mirror-symmetric; Tidebreaker deliberately is not. *(Amended 2026-07-05
  for table 2; the original rule read "every structural element
  mirror-symmetric about x = 260".)*
- The ball is **27 mm** diameter. Draw at true scale; if a detail is
  illegible at 27 mm ball scale, simplify the detail, don't enlarge the part.
- Line weights at master scale: wall guides **12 mm**, part outlines **2 mm**,
  insert/art detail **1.5 mm**.

## 4. Collision & anchor layer naming (plan §5e — the physics contract)

The playfield SVG is the single source of truth for table shape. The parser
(`src/table/SvgCollision.ts`, milestone 3.5) consumes elements by `id`/label
prefix; everything else is art. Curves are flattened to ≤1 mm chord error.

| Prefix | Meaning | Geometry read |
|---|---|---|
| `collision-wall-<name>` | solid open chain | path polyline + stroke-width |
| `collision-loop-<name>` | solid closed chain | closed path polyline + stroke-width |
| `sensor-<kind>-<name>` | non-solid scoring zone | closed path → sensor fixture |
| `anchor-<entity>[-<which>]` | placement point for a code-defined body | circle center |
| `art-…` or unprefixed | visual only | ignored by parser |

Every collision path carries an **explicit `data-width`** (mm): the physics
chain takes half of it as its shape radius, so the collision surface is the
drawn wall's *edge* on both sides — the visible wall and the physical wall
are the same object, and the ball never sinks into the art. Author clearances
face-to-face, not centerline-to-centerline. `data-width` isn't a presentation
attribute, so art may restroke the same paths via `<use>` at decorative
widths — Moondial renders them as layered steel rails (16 ink / 12 steel-500
body / 6.5 steel-300 / 2.2 chrome-200 core) where the 12 mm body is the
physical width.

Sensor kinds: `drain`, `ramp-entry`, `ramp-exit`, `rollover`, `lane`,
`kicker`, `spinner`, `target`. Required anchors per table:
`anchor-flipper-left`, `anchor-flipper-right`, `anchor-plunger`,
`anchor-spawn`; dynamic elements (bumpers, drop targets, spinner) each get a
numbered anchor (`anchor-bumper-1`).

Two invariants from the physics work (see `src/table/geometry.ts`):

1. **No ball-sized pockets.** Every gap between drawn collision surfaces must
   be `< 13.5 mm` (ball can't enter) or `> 38 mm` (~1.4 ball diameters,
   passes freely). Anything between wedges the ball.
2. **Inlane guides end tangent to the flipper base circle** (r 12 mm around
   the flipper anchor), past its apex — never short of it (pocket) and never
   below the crown (a creeping ball stalls on the hump).

### Layers & height (added 2026-07-05 for table 2, Tidebreaker — parser support lands with M10)

Physics stays planar (plan §7); "height" is a collision-filter and render
trick, never a Z-axis in the physics world.

- A collision path may carry **`data-layer`** (integer, default `0`): `0`
  main playfield, `1` raised (ramps, decks, habitrails), `-1` subway. A
  fixture collides with the ball only while the ball is on the same layer.
- **`sensor-ramp-entry-<name>` / `sensor-ramp-exit-<name>`** switch the
  ball's layer; the entry sensor carries **`data-to-layer`**.
- A ramp or subway with vertical travel pairs with a
  **`height-profile-<name>`** polyline carrying **`data-height-from`** /
  **`data-height-to`** (mm relative to the playfield surface, negative =
  below). Renderers project the ball onto the profile to derive its display
  height; physics never reads it.
- A raised-deck flipper is placed by **`anchor-flipper-upper`**.
- The two invariants above apply **per layer**: gaps are measured between
  surfaces the ball can touch on the same layer, and simcheck/soak must be
  able to flag a ball trapped in a subway or on a deck.

## 5. Type

See [previews/typography.html](previews/typography.html).

- **Display / logos:** hand-drawn SVG lettering per table, built on the
  *chrome horizon* recipe — vertical chrome gradient with a hard mid-stop,
  `--ink` outline, neon rim in the table's feature color, soft violet glow.
  Wordmarks are drawn art, never a system font.
- **UI text:** pixel-grotesk voice; in code, `ui-monospace` stack at 12/16 px
  with 10 px captions and 13 px letter-spaced uppercase headers, `--steel-300`
  on dark, `--chrome-200` for emphasis.
- **DMD text:** bitmap fonts only — `DIGITS 5×7` for score, `SMALL 3×5` for
  status lines. Glyphs are part of this system (defined in the DMD preview);
  scenes never render vector type onto the dot grid.

## 6. The DMD (plan §5b/§5c)

See [previews/dmd.html](previews/dmd.html) — the rendered reference.

- **Grid 128 × 32**, round dots, dot diameter 0.72 of cell pitch.
- **5 states per dot:** off, dim, mid, lit, hi(core) — exactly the token ramp.
  Scenes are authored in these 5 levels; no intermediate colors.
- Lit dots bloom: soft halo ~40% of dot diameter (shader recreates this
  in-game; bake plain levels, not pre-bloomed art).
- Panel sits behind smoked glass (`--dmd-bg`) in a `--steel-700` bezel with a
  1 mm `--chrome-400` top rim.
- Authoring pipeline: scene authored at 128×32 logical → baked to sprite-sheet
  frames at build time → LED shader at runtime. Never live SVG/DOM at 60 fps.

## 7. Materials & lighting

See [previews/materials.html](previews/materials.html).

- **One key light, top-left 45°,** for every object on the table. Specular
  highlight offset ≈ −35% of radius in x and y. One highlight per object.
- **Ball:** 3-stop radial chrome (`chrome-50 → chrome-400 → chrome-600`),
  center offset to the key light, plus one crisp small `chrome-50` highlight.
- **Flippers / brass mechanicals:** 3-stop brass ramp along the bat, 2 mm ink
  outline, thin `brass-300` rim light on the striking face.
- **Rubbers / posts:** near-black (`chrome-800`) with a `--steel-300` top rim
  arc — rubber reads by its rim, not its body.
- **Playfield:** `field-800` base; `field-900` occlusion pooling along walls;
  8% corner vignette; art printed *into* the field sits 10% desaturated so
  physical parts pop above it.
- **Inserts / lamps:** unlit = the accent at 30% over field; lit = full token
  plus an additive halo 2× the insert diameter. Lamp states are art variants,
  not runtime filters.

## 8. Layout (plan §4.5)

See [previews/layouts.html](previews/layouts.html).

- **The table never stretches.** Native aspect 575:1050 at all times (the
  visible table includes the launch lane); the camera scrolls vertically
  identically in every layout.
- **Portrait:** DMD strip (4:1) full-width at top, table below at native
  aspect; touch zones: lower left/right halves = flippers, drag zone
  bottom-right = plunger.
- **Landscape:** table in a full-height center column; left panel carries the
  table logo + DMD; right panel carries score, ball number, bonus, and tilt
  lamps. Panels are `--field-700` cards on `--void` with steel rules.
- Surplus space is always `--void` with the standard vignette.

## 9. Per-asset checklist

Before any asset ships into the game:

1. Colors are tokens from §2 — no new hexes without amending this guide.
2. Drawn at master scale (§3), ink-outlined, ≤3-stop gradients.
3. Key light from top-left (§7).
4. Playfield elements: collision/sensor/anchor layers named per §4 and
   verified against the in-game debug overlay.
5. DMD scenes: 128×32, 5 levels, bitmap type only (§6).
6. Original IP — evokes the era, copies nothing.
