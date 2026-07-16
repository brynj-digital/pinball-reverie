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
  green / brass`). The dark field is what makes lamps read as *lit*.
- **Could-be-real.** Every drawn element must be plausible on a physical
  machine: printed playfield art, plastic inserts, lamps, screened metal.

## 2. Palette

See [tokens.css](tokens.css) and [previews/colors.html](previews/colors.html).
Families: **field** (playfield darks), **steel** (blue structure), **chrome**
(ball/rails/bezels), **brass** (flippers, warm mechanicals), **neon** accents
(magenta / cyan / green / violet + alert red), **DMD amber** (5-level ramp), and
**debug** (green bodies / orange sensors — engineering overlay only, never in
shipped art; these exact values are what the in-game debug overlay draws).

Accent discipline: violet is the signature hue (logo glow, premium inserts);
magenta, cyan and green are feature colors; brass is reserved for things the
ball physically touches (flippers, kickers, rails).

Per-table field variants (added 2026-07-05): a table may cast the field
family toward its theme — Tidebreaker uses the **abyss** ramp
(`--abyss-700/800/900`, blue-green) with cyan as its feature color;
Midnight Midway uses the **carnival** ramp (`--carnival-700/800/900`, warm
plum dusk) with magenta as its feature color; The Night Mail uses the
**smoke** ramp (`--smoke-700/800/900`, cold iron/soot slate-green — added
2026-07-15 per the table 4 brief) with **signal green** (`--green-400/600`)
as its feature color; Small Hours uses the **rooftop** ramp
(`--rooftop-700/800/900`, sodium-washed asphalt umber — added 2026-07-16
per the table 5 brief) with **transmitter amber** (`--amber-400/600`) as
its feature color. Any new variant adds its
tokens here first, keeps `--ink`/steel/chrome/brass unchanged, and stays
within the §1 saturation discipline.

**Transmitter amber** (added 2026-07-16 for table 5): `--amber-400/600`,
the fifth neon family — sodium-vapour orange-amber, claimed by Night
Waves the way each earlier table claimed one hue. Amber is **lit electric
signage** (the ON AIR sign, dial pointers, insert arrows, lit-lane runs).
It is not brass (brass stays ball-touch metal only) and not marquee bulb
(incandescent white-gold points): the three warm families never
substitute for each other.

**Marquee bulb** (added 2026-07-05 for table 3; scope widened 2026-07-15
for table 4): `--bulb-200/400`, an
incandescent white-gold reserved for bulb strings, ride marquees,
chase-lamp rows, platform gas lamps and lit carriage windows — tiny lit
points, never area fills, so the §1 neon budget
holds. It is not brass (brass stays ball-touch only) and not DMD amber
(display glass only).

**Midway runs the accent budget hot** (amended 2026-07-05, per the table 3
brief and direction): a funfair at night is *loud* — Midnight Midway may
push accents to ~15–20% of the composition and use the whole neon family
at once (pennant bunting, balloons, painted gondola cars, letter-coloured
inserts, candy stripes, `--alert-400` on beacons/barber posts). The
discipline that survives: saturation lives in MANY SMALL SHAPES and lit
points over the dark plum field — never large saturated area fills — so
lamps and the ball still pop. Moondial and Tidebreaker keep the ≤10% rule.

**Elevated structure may be an OPEN WIREFORM** (amended 2026-07-05, table
3): where a glass bed would cross busy field art (Midway's coaster and
striker cut across half the park), the elevated run may drop the bed and
read as slim chrome wires with cross-ties and air between — plus a LIGHT
glass tint (~0.09, ≤30 mm): near-invisible on the dark field but it tints
the bright ball passing underneath, the depth cue the open wires alone
can't give. The layer cue that must survive is the
compositing split (over the ball on the field, under it when raised) plus
the opaque chrome; Tidebreaker's edge-hugging ramp keeps its full glass
bed.

**Walls and rails are themed per table, not global** (amended 2026-07-05):
each table's shell/wall restroke palette comes from its field variant —
Moondial layers steel (`steel-500/300`), Tidebreaker layers dark verdigris
(`--abyss-500/300`), Midnight Midway layers dusk plum
(`--carnival-500/300`), The Night Mail layers wet slate
(`--smoke-500/300`), Small Hours layers warm asphalt
(`--rooftop-500/300`) — always over a 16 mm ink base with a `chrome-200`
core, and kept DARK so the ball and lamps pop. **Elevated (layer 1)
structure reads as glass between chrome** on every table: the edge wires
are OPAQUE bright chrome, and only the ramp BED between them — a wide
translucent wash (~0.15) spanning the full rail-to-rail interior along
the height profiles — semi-transparent fluorescent ramp plastic. **The
glass TINT is per-table, matching the field variant** (amended 2026-07-05
by direction): DAYGLO green (`--green-400` #39ff14) is the default —
Moondial and Midway use it — while Tidebreaker's glass is abyssal
`--cyan-400` #2fc9d6 and Small Hours' is transmitter `--amber-400`
#ffa028 (2026-07-16, per the table 5 brief). The SVG wash and `TableSpec.theme.rampGlass3d` must
carry the same hue. Renderers composite the
`art-rails-elevated` group separately — over the ball on the main field
(the ball shows through the bed, disappears behind the wires), under it on
the raised layer — so which level the ball is on is always unambiguous.
The 3D renderer builds the same split: opaque chrome tubes plus a
translucent bed ribbon riding each layer-1 height profile.

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
| `collision-diverter-<id>-<blade>` | diverter blade (M12): swappable — one blade of `<id>` solid at a time, owned by the Diverter entity | path polyline + data-width |
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
`kicker`, `spinner`, `target`, `subway`, `lift`. Required anchors per table:
`anchor-flipper-left`, `anchor-flipper-right`, `anchor-plunger`,
`anchor-spawn`; dynamic elements (bumpers, drop targets, spinner) each get a
numbered anchor (`anchor-bumper-1`); placed M12 entities are anchor-checked
too (`anchor-magnet-<id>` at the core, `anchor-disc-<id>` at the centre).

M12 entity conventions (added 2026-07-15, built ahead of table 4 per the
Night Mail brief §8):

- **Diverter** — one `collision-diverter-<id>-<blade>` path per blade
  (blade names single-segment; same data-width / data-z rules as walls);
  exactly one blade is solid at a time. Author blade geometries so a ball
  resting against the solid blade is never INSIDE another blade's path —
  the swap doesn't push, and a ball overlapping a freshly-created blade is
  ejected by the solver. Every drawn blade must be claimed by the table's
  `DiverterDef` (load-time check, both directions).
- **Lift** — `sensor-lift-<id>` trips the capture at the foot;
  `height-profile-<id>` (no `data-surface` — the ball can't free-ride a
  lift) is the carry path, climbing hFrom→hTo. The release is AIRBORNE at
  hTo: the §4 descent rule applies to the landing zone (clear, or a summit
  surface at matching height), and the profile's far end must sit clear of
  furniture the falling ball could wedge against.
- **Magnet** — force + capture only, no fixture; `anchor-magnet-<id>`
  marks the core, art carries the pole cap (brass — the ball touches it).
  Reach is ground-level only: riders and transits pass unpulled.
- **Disc** — force only, no fixture; `anchor-disc-<id>` marks the centre,
  art carries the turntable face. Flush with the field: it must never be
  drawn as raised (nothing gates collision over it).

Two invariants from the physics work (see `src/table/geometry.ts`):

1. **No ball-sized pockets.** Every gap between drawn collision surfaces must
   be `< 13.5 mm` (ball can't enter) or `> 38 mm` (~1.4 ball diameters,
   passes freely). Anything between wedges the ball.
2. **Inlane guides end tangent to the flipper base circle** (r 12 mm around
   the flipper anchor), past its apex — never short of it (pocket) and never
   below the crown (a creeping ball stalls on the hump).

### Surfaces & height (M11, plan §7a — supersedes the M10 layer trick, 2026-07-05)

Planar physics gains one real scalar: the ball's height `z`. Ramps are
SURFACES the ball genuinely rides — it attaches where a surface meets its
height, feels the slope (climbs decelerate, stalls roll back out of the
mouth), and flies off drop-offs ballistically. There are no layer-switch
sensors; entry and exit are geometry.

- A **`height-profile-<name>`** polyline carries **`data-height-from`** /
  **`data-height-to`** (mm relative to the playfield surface, negative =
  below; linear in arc length). Profiles carrying **`data-surface`** (plus
  **`data-surface-width`**, mm, the footprint width) group into one
  physical surface; chain several profiles to shape crests and dips.
  **`data-layer`** remains on paths/profiles purely as a RENDER hint
  (1 = elevated wireform styling, −1 = subway).
- A collision wall carrying the same **`data-surface`** is that run's rail:
  it touches the ball only near the LOCAL surface height (one climbing rail
  is low at its mouth, high at its crest). Plain walls are field furniture
  (~ball height). **`data-z="all"`** marks full-height walls — the shell
  and plunger-lane wall, i.e. the cabinet glass.
- Sensors may carry **`data-z-min`/`data-z-max`** (mm): admission bands
  (a ramp's spinner ignores ground balls; lanes under a wireform ignore
  riders). Set band edges ~4 mm looser than the geometric height at the
  zone edge — begin-contact fires when the ball's EDGE touches, when its
  centre is still a half-ball short of the zone.
- **Mouths point down-table** (the roll-back must fall OUT), and their
  attach zone (local height ≤ 4 mm) must sit clear of posts and bats — an
  attach zone against furniture is a pocket. **Descents end in the air**:
  finish the profile at ≥ 12 mm over a clear landing zone and let the ball
  drop; a rail that descends to ground level through live field traffic
  genuinely blocks it (it is physically there now).
- **Every climb gets a BACK** (added after M11 play): where the bed sits
  below ball height (local h < 28 mm) its underside is solid — a ball
  dropping in behind the ramp must deflect, not fall through the throat.
  Author a `collision-wall-<name>-back` across the channel at the h ≈ 28
  point, spanning rail to rail, with **`data-z-max="22"`** (walls accept
  explicit `data-z-min`/`data-z-max` bands): ground balls bounce off it,
  riders pass above. Check its end caps against neighbouring furniture for
  the §4 gap bands. **Caution (Midway 2026-07-06):** on a shallow lift hill
  the bed is still low near the back's location, so a *fast* climber sweeps
  up through the sub-22 mm band and CCD snags it on the back before its
  height clears — the ramp completes ~0 % of aimed shots, worse the harder
  you hit it. If a `feature-rates` probe shows climbers stalling at the
  back, **drop the band to `data-z-max="10"`** (blocks only near-ground
  z≈0 fallers; lets the rider, whose base sits at the local bed height,
  pass). Reserve the full `22` for backs sitting where the bed is already
  steep/high enough that riders are well clear when in CCD reach.
- Rails crossing over field furniture keep the local surface height at
  least ~7 mm above that furniture's top (ball tops clear rails at
  local-height − 1 mm).
- Subways stay scripted transits below the field (no surface, no walls).
- An upper (third) flipper is placed by **`anchor-flipper-upper`**; its
  side/pivot lives in the table's defs like the lower pair.
- The two invariants above apply **per height stratum**: gaps are measured
  between surfaces the ball can touch at the same height, and simcheck/soak
  must be able to flag a ball trapped on a ramp or in a subway.

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
- **Flippers / kicker mechanicals (brass):** 3-stop brass ramp along the bat,
  2 mm ink outline, thin `brass-300` rim light on the striking face. Brass is
  reserved for the flippers and kicker/plunger mechanicals — slingshots and
  drop targets are explicitly NOT brass (amended 2026-07-16; they used to
  share the flipper ramp and read as one material).
- **Rubbers / posts:** near-black (`chrome-800`) with a `--steel-300` top rim
  arc — rubber reads by its rim, not its body.
- **Slingshots (2026-07-16):** rubber material, not brass — `chrome-800` body
  with the `--steel-300` rim along the striking face, corners rounded ~12 mm
  (render-side only; physics keeps the sharp verts and the rounding stays
  inside them). A **table-accent lamp insert** sits at the centroid: unlit =
  accent at 30%, kick = full token + additive halo (the standard insert rule).
- **Drop targets (2026-07-16):** table-accent plastic faces (accent-600 →
  accent-400 ramp toward the key light) with a faint accent glow while
  standing; dropped = the dim `steel-700` outline, unchanged.
- **Table accent (2026-07-16):** each table names one neon pair as its
  element-lamp accent, carried by `TableSpec.theme` so both renderers stay in
  step — Moondial `violet-400/600`, Tidebreaker `cyan-400/600`, Midnight
  Midway `magenta-400/600`, The Night Mail `green-400/600`, Small Hours
  `amber-400/600`. Slings and drop
  targets draw their coloured light from it; new per-table element lamps
  should too before inventing a new colour.
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
- **Touch controls (added 2026-07-08):** a transparent overlay of pointer
  zones, shown on touch devices (Auto) or forced On/Off in settings; keyboard
  and touch are interchangeable through the same `Input`. Flipper zones use
  `--violet-400` at ~10% (→22% while held); the plunger zone (hold to charge,
  release to launch) carries **no visible chrome** — like the nudge zone, its
  hit area is invisible so nothing sits permanently over the playfield corner
  (removed 2026-07-14) — and it **captures pointers only while the ball is in
  the shooter lane** during play (always outside play, where the plunger
  button starts/confirms); otherwise corner touches fall through to the right
  flipper beneath it. Two conventions beyond
  the coarse zones above: the **right flipper zone also works the upper
  flipper** where a table has one (Midway's mallet), mirroring the default
  keyboard wiring; and a **swipe on the open table area = nudge** (dominant
  axis → left/right/up; a downward flick is not a nudge). No discrete
  upper-flipper or nudge buttons — the zone model stays two-handed. Zones are
  the same in portrait and landscape (positioned by viewport fraction).
- **Landscape:** table in a full-height center column; left panel carries the
  table logo + DMD; right panel carries score, ball number, bonus, and tilt
  lamps. Panels are `--field-700` cards on `--void` with steel rules.
- Surplus space is always `--void` with the standard vignette.
- **Table select (added 2026-07-05, M10):** the backglass IS the table's
  selection card — the attract-mode table browser shows one backglass per
  registered table on a `--field-700` card; the focused card carries an
  brass (`--brass-400`) ring, unfocused cabinets sit dim. No dedicated
  select-screen art: a new table becomes selectable by shipping its
  backglass. Chrome text follows §5; hints in steel.

## 9. Per-asset checklist

Before any asset ships into the game:

1. Colors are tokens from §2 — no new hexes without amending this guide.
2. Drawn at master scale (§3), ink-outlined, ≤3-stop gradients.
3. Key light from top-left (§7).
4. Playfield elements: collision/sensor/anchor layers named per §4 and
   verified against the in-game debug overlay.
5. DMD scenes: 128×32, 5 levels, bitmap type only (§6).
6. Original IP — evokes the era, copies nothing.
7. App icon: the master is `design/app-icon.svg` (512, full-bleed void
   field, subject inside the central 80% maskable-safe circle — one master
   serves the manifest's "any" and "maskable" purposes plus iOS). Edit the
   SVG, then `npm run icons` regenerates the checked-in PNGs in
   `public/icons/`; never edit the PNGs directly.
