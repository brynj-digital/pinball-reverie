# Tidebreaker — Table 2 design brief

**Status: v1 built (2026-07-05); differentiation pass 2026-07-17.**
`playfield.svg` + `rules.json` + `src/table/defs/tidebreaker.ts` are now
the specifics; this brief remains the design intent.

Differentiation pass (2026-07-17, plan item 1.2 — the first table off the
shared kit, STYLE-GUIDE §4 no-copy-paste rule):

- **PRESSURE SLINGS** — the hull flexing under depth: the lineup-shared
  sling vertex set is replaced with longer, lower rigs (tips +5 mm, base
  dropped to y 810) and a flatter, harder kick `(±0.91, −0.415)` vs the
  shared `(±0.848, −0.53)`. Grown DOWN and OUT only: raising the top edge
  15 mm clipped the winch habitrail's landing path (simcheck caught the
  drop-off no longer reaching the left inlane).
- **The airlock is now L-O-C-K** — four hatch-bolt targets (the lineup's
  first 4-bank), grown UPWARD (4th target y 401, housing to y 373):
  the ground below y 555 is the orbit channel's exit and can't take a
  longer recess.
- **SOUNDING** — the skill shot (STYLE-GUIDE §4 pattern):
  `sensor-skill-sounding` y 440–500 in the shooter lane, ≤ 0.75 m/s,
  pays 15,000 + one spotted D-I-V-E lane, once per ball. Same
  probe-verified separation as Moondial's FIRST LIGHT (identical lane).

Deltas from the concept, found during clearance-solving
and simcheck/soak:

- **The airlock moved.** A mid-field diagonal bank sat inside the winch
  ramp's corridor (every bank shot tripped the ramp's layer sensor), and a
  free-standing staircase housing could not be sealed against the ball-gap
  rules. v1 recesses the three hatch-bolt targets into the orbit wall's
  field face (left side, faces pointing right, Moondial's proven housing
  pattern mirrored) — an intentional **right-flipper cross-field shot**.
  Flipper jobs became: left = trench mouth + dive bell; right = winch ramp
  (straight up) + airlock (cross-field).
- **The Raised Deck was cut** per §7's cut line (no mini-flipper or
  diverter in v1); the height centrepiece is the ramp + habitrail circuit.
- **Real outlanes were engineered in** (the Moondial funnel seals its
  corners): outlane guide walls at x=52/470 with 40 mm channels, plus a
  deflector off the left shell so Current exits can't feed the outlane.
- **`data-up-only`** was added to the layer-switch convention after soak
  found stray balls crossing the ramp-entry zone sideways becoming
  wrong-layer ghosts (STYLE-GUIDE §4). *(Historical: M11 deleted the whole
  layer-switch system — see below.)*
- **M11 (true height, plan §7a):** the winch ramp is now a real surface —
  the climb costs energy and a stalled ball rolls back out of the mouth by
  gravity, not by a restore sensor. The habitrail runs FLAT at 34 mm (its
  old descent to ground inside the orbit channel would physically block
  the Current) and ends in the air over the left inlane: the WINCH payoff
  is now a genuine ballistic drop where the rail-out sensor used to sit.

**Premise:** a salvage diver works a single dive down an abyssal trench to a
wreck on the seafloor. The tall scrolling playfield *is* the trench — the
top of the table is the moonlit surface rig, the bottom is the wreck. You
dive with your eyes (the art darkens with depth); you score by hauling
salvage *up* (the shots go up-table). The drain is losing the ball into the
trench.

Where Moondial is quiet, cool, and celestial, Tidebreaker is pressurised,
kinetic, and warm-lit-in-the-dark. Same night, other side of the horizon:
the surface swell at the top of the playfield sits under the same moon
Moondial is watching.

## 1. The three strata (height without 3D physics)

Physics stays planar (plan §7). Height is a **collision-layer + render**
trick, standardised in STYLE-GUIDE.md §4 ("Layers & height"):

| Stratum | `data-layer` | Fiction | Holds |
|---|---|---|---|
| The Rig | `1` | deck + cable gantries above the water | raised deck, winch ramp, habitrail return |
| The Water | `0` | main playfield | everything conventional |
| The Trench | `-1` | tunnels under the playfield | trench-mouth subway, trench-gutter subway |

Each stratum is a planar collision set; `sensor-ramp-entry/exit` sensors
switch the ball's layer, and `height-profile-*` paths tell the renderers
how high/deep to draw the ball. One ball, one Planck world, one layer
active at a time.

## 2. Layout

Playfield `0..520`, plunger lane `520..575` (fiction: the **descent
shaft** — originally labelled "moon pool", the real diving term, but in a
game whose other table is MOONDIAL it read as theme bleed). Deliberately **asymmetric**
interior (STYLE-GUIDE §3, as amended): the two flippers have different
jobs, which is what makes the table shoot differently from Moondial.

```
                    ╭──────────────────────────╮ ╮
   habitrail ◄──────│  D I V E   rollovers     │ │ plunger
   (winch cable     │   ●  ●  ●  sonar buoys   │ │ lane
    return, +1)     │                          │ │ (moon
        │       ╔═══╧═══╗                      │ │ pool)
        │       ║ RAISED ║   ▲ WINCH RAMP      │◄╯
        │       ║ DECK +1║  ╱ (climbs, +1)     │
        │       ║ mini-  ║ ╱  spinner at entry │
        │       ║ flipper║╱                    │
        │       ╚══▼════╝─── drop-off edge     │
        │           ▒▒▒ TRENCH MOUTH (dives −1)│
        │        ┌─────────┐                   │
        │        │ AIRLOCK │ ⊙ DIVE BELL       │
        │        │ ▯ ▯ ▯   │   (kickout scoop) │
        ▼        └─────────┘                   │
      inlane   ◁ sling      sling ▷    inlane  │
   ESCAPE │                            │ ┆─────┤
   HATCH  │  ╲  left      right  ╱     │ ┆(−1) │
  kickback│   ╲ flipper  flipper╱      │ ┆     │
          outlane                    outlane───╯
                      drain              feeds trench
```

Zone by zone, top to bottom (y-ranges indicative — final geometry is set in
the SVG under the ball-gap invariants, which apply **per layer**):

- **The surface (y ≈ 0–240).** Full-height orbit along both walls — **the
  Current** — plunger feeding into it. Four **D-I-V-E** rollover lanes
  (~y 90), three **sonar buoy** bumpers below. Conventional on purpose: the
  player starts each ball in familiar territory and the strangeness
  increases with depth, same as the fiction.
- **The Winch Ramp (right-centre, entry ~(330, 620), layer 0→1).** The
  signature *up* shot, from the right flipper. A **spinner at the ramp
  entry** — ripping the ramp is reeling the winch. Climbs (+1) to a crest
  beside the rollovers, returns via a **habitrail** down the left wall
  (styled as the winch-cable gantry) into the left inlane. The repeatable
  flow loop: right flipper → ramp → left inlane → right flipper.
- **The Raised Deck (upper-left, ~x 60–200 / y 200–330, layer 1).** The
  height centrepiece: a small elevated rig deck reached from the winch ramp
  when a **diverter** is lit. Carries a **third mini-flipper**
  (`anchor-flipper-upper`) and one standing target (the crane control) —
  making the deck shot lights the Dive Bell's biggest hauls. The ball
  leaves by rolling off the deck's open **drop edge**: the deck's collision
  chains exist only on layer 1, so crossing the lip switches the ball to
  layer 0 and it falls back into the mid-table (the 3D renderer plays the
  drop for real). **Designated cut line — see §7.**
- **The Trench Mouth (centre-left, ~(180, 430), layer 0→−1).** The
  signature *down* shot, from the left flipper: the ball visibly sinks
  under the playfield and travels a real walled subway channel on layer −1
  beneath the airlock — glimpsed through two porthole grates cut into the
  art — before the Dive Bell kicker fires it back onto layer 0. Every
  transit runs the DMD depth-ticker.
- **The Airlock (mid-table, ~(300, 480)).** The 3-target drop bank, angled
  to face the **left** flipper. Three targets = three hatch bolts; a
  completed bank cycles the airlock and lights the **Dive Bell** scoop
  tucked behind it (~(370, 420)).
- **The gutters (bottom).** Standard sling/inlane/outlane trapezoid, both
  outlanes active:
  - **Left outlane — Escape Hatch:** a kickback (Kicker entity, firing up),
    lit by completing D-I-V-E. Fiction: emergency ballast blow.
  - **Right outlane — Trench Gutter:** feeds a layer −1 subway that carries
    the ball under the flippers and ejects from the Escape Hatch position —
    but **only when lit** (light it at the Dive Bell). Unlit, the subway
    routes to the drain. An outlane that is sometimes the best thing that
    can happen to you.

**Flipper roles:** right flipper owns the winch ramp (haul); left flipper
owns the airlock and trench mouth (dive); the mini-flipper owns the crane
target. This division is the layout's identity — preserve it through any
geometry changes.

## 3. Rules skeleton

Same `rules.json` shape as Moondial (base points + bonus units + a combo +
a scoop ladder + a wizard mode). Values below are starting guesses for
tuning, not commitments:

- **The Current (orbit combo):** repeat loops inside a 10 s window step the
  combo (max 3), each step ticking the DMD depth readout deeper.
- **Depth gauge (bonus multiplier — the moon-phase sibling):** completing
  D-I-V-E advances one stage — `100m / 300m / 600m / 1000m / TRENCH FLOOR`
  — each a bonus-X step with its own insert lamp running down the
  playfield centreline: a literal gauge the player descends.
- **Salvage hauls (Dive Bell ladder, wrapping, like Moondial's
  `telescope.sightings`):** `BRASS COMPASS 5,000 → CARGO CRATE 10,000 →
  CAPTAIN'S SAFE 15,000 → THE MOTHERLODE 25,000`; the last spots progress
  toward LEVIATHAN. The crane-control target (deck) upgrades the next haul.
- **LEVIATHAN (wizard mode):** qualify by reaching TRENCH FLOOR **and**
  completing 2 airlock cycles. 25 s: all switches ×2, the Current pays
  jackpot value, DMD plays the leviathan pass.
- **Escape Hatch:** kickback lit per D-I-V-E completion (one save).
  **Trench Gutter:** lit at the Dive Bell; unlit = drain.

## 4. Palette & style (pending style-guide amendment)

Feature colour: **cyan** (already in the neon family — bioluminescence is
what cyan-on-dark-field is for), with restrained magenta for deep-sea
creature accents. Brass stays on what the ball touches (flippers, winch,
dive-bell rim); violet remains the shared logo-glow signature.

The one *proposed* addition: an **abyssal field variant** — a blue-green
cast of the `field` ramp so the trench darkens teal rather than Moondial's
blue-violet. Token values to be authored in Claude Design and added to
`tokens.css` + STYLE-GUIDE §2 **before** any playfield art is drawn (per
the guide's own rule). No other new hexes anticipated.

Art gradient down the table: moonlit swell → sunlit water → twilight zone →
bioluminescent abyss → the wreck at the slings. Printed-art desaturation,
key light, and ink rules per the guide as usual.

## 5. DMD scenes (masters in `design/dmd-scenes/`, baked as always)

1. **Descent ticker** — depth gauge counting down between events.
2. **Winch haul** — crate rising on a cable, for spinner rips and hauls.
3. **Airlock cycle** — hatch wheel spin, bolts lighting.
4. **Sonar ping** — expanding circle wipe; doubles as mode-start transition.
5. **Leviathan pass** — a tail, then an eye, past the dive-bell porthole;
   never the whole creature. Worth the most frames.

The amber DMD reads as a sonar/instrument display here — it is diegetically
the dive bell's console.

## 6. Audio direction

ChipMusic brief: sparse low-tempo bassline around a sonar-ping motif (one
high square-wave blip, long delay); density/tempo layer up as the depth
gauge advances. LEVIATHAN drops the melody: sub-bass + the ping at half
speed. SFX: bumpers = pings at different pitches, spinner = ratcheting
reel, scoop = hatch clunk + pressure hiss, kickback = ballast blast,
tilt = hull groan.

## 7. Engine requirements & cut line

In build order (this is the M10 code track):

1. **Collision layers** — `data-layer` in `SvgCollision.ts` → Planck filter
   bits; ramp-entry/exit sensors flip the ball's mask. Enables everything.
2. **Render height profiles** — `height-profile-*` paths; 3D lifts/sinks
   the ball, 2D fakes it (draw order, slight scale, shadow offset).
3. **Third flipper** — `anchor-flipper-upper` + an upper-flipper binding in
   `Input` (traditionally shares the right flipper key).
4. **Diverter** — one small gate entity, open/closed by game state.
5. Kickback + subways — existing `Kicker.ts` + sensors.

**Cut line:** if the Raised Deck fights back, ship it as art + a standing
target reached from the ramp (no mini-flipper, no diverter, no drop edge)
and add the flipper in a table v2. Everything else is sensor-and-layer
work.

## 8. Authoring order & verification

Theme brief (this file) → style-guide/token amendment → playfield SVG
master → rules.json → DMD scenes → logo/backglass. Simcheck + soak after
every playfield-SVG edit, as always — both need to understand layers well
enough to flag a ball trapped in a subway, and the ball-gap invariants are
checked per layer.
