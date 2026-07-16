# Glasshouse — Table 7 design brief

**Status: concept (2026-07-16), not yet scheduled.** Table id:
`glasshouse`. Planned engine milestone: **M14 (envelope generalization —
the widebody and the left-hand plunger)**. See
`docs/plans/table-differentiation-plan.md` for sequencing.

**Premise:** the great glasshouse of the city's botanic garden, locked
for the night. Moonlight through a thousand panes, night-blooming
flowers opening on schedule, moths navigating by the maintenance lamps,
condensation ticking off the ironwork. You score by working the night
shift the garden runs for itself: pollination. The ball is the moth's
flight; the drain is dawn's first cold draught.

Seventh panel of the same-night anthology, and its second interior —
but glass, so the moon is *in* the room (the same moon as the whole
lineup, refracted by the roof). Where Small Hours is warm and close,
the Glasshouse is **hushed, humid, luminous** — a cathedral of leaves.
Register: delicate, patient, faintly magical without ever being fantasy
— everything here is real botany at night.

## 0. IP note (read first)

- **No close DICE neighbour.** No garden/greenhouse/nature table in
  either Pinball Dreams or Pinball Fantasies.
- **Mechanical precedent, kept at a distance:** double inlanes each side
  are a real-machine convention (Bally's *Fathom* is the canonical
  example, *Centaur* nearby). Convention only — no aquatic theme, no
  mermaids, nothing named or drawn near either machine.
- No real botanic garden's name, wordmark, or landmark glasshouse
  silhouette (nothing tracing Kew's Palm House or similar); the
  architecture is invented Victorian ironwork. Moths and flowers are
  drawn from general natural history, no franchise creatures. Name
  check: no known pinball machine named "Glasshouse".

## 1. Height (M11 surfaces)

| Stratum | render hint | Fiction | Holds |
|---|---|---|---|
| The canopy | `1` | up among the palms | THE VINE RUN (one lateral wireform) |
| The beds | `0` | the walkways and beds | everything conventional |
| The cold frame | `-1` | under the staging | one service subway |

## 2. Layout

**Envelope delta (the widebody, and the first LEFT-hand launch):** width
**0.660** — playfield x 55–660, plunger lane x 0–55 on the **left**
(fiction: **the potting corridor**, the gardeners' passage along the west
wall). Height stays 1.05. The ball launches up the left wall and enters
the top arch travelling **left-to-right** — every reflex the lineup has
trained fires mirrored, from the first plunge. Never stretch: the
widebody renders at its own aspect, chrome adapts (the invariant is no
distortion, not one fixed ratio).

```
 ╭ ╭────────────────────────────────────╮
 │ │      M O T H  rollovers (4)        │
 │ │   ●  ●  ●   (lantern bumpers)      │
 p │ ═ VINE RUN (canopy wireform,       │
 l │    LATERAL: west bed → east bed) ═ │
 u │                                    │
 n │  THE LAMPS ✳    ✳    ✳ (roving     │
 g │   (phototaxis — the lit shot ×2)   │
 e │ ▯▯▯▯▯ NIGHT-BLOOM bank (5, centre  │
 r │        — the lineup's first 5-bank)│
 │ │        ⊙ THE ORCHID (scoop,        │
 │ │           ejects RIGHT)            │
 │ │  ◁ sling                sling ▷    │
 │ │ in in                    in in     │  ← DOUBLE inlanes
 │ │ │  │                     │  │      │    each side (4 return
 │ outlane                  outlane     │    lanes — Fathom
 ╰─┴───────────── drain ────────────────╯    convention)
```

Zone by zone (x/y indicative; the widebody's extra 85 mm is spent on
lateral play, not on more furniture):

- **The roofline (y ≈ 0–150).** Full orbit — **the Gallery**, the
  walkway under the glass — entered from the left. Four **M-O-T-H**
  rollovers; the spinner is the **roof vent**, spanning the left launch
  channel (every plunge rips it — the mirror of the Dial's job).
- **The lantern bumpers (upper-centre, 3).** The maintenance lamps the
  moths circle.
- **THE VINE RUN (the canopy surface — the widebody's showpiece).** A
  **lateral** wireform: mouth on the *west* bed (right-flipper cross
  shot), climbing over the beds and releasing airborne over the *east*
  inlanes. Every other climbing surface in the lineup runs up-table;
  this one runs *across* — only a widebody has the room, which is the
  argument for the widebody. Riding it while a LAMP on the far side is
  lit = **NIGHT CROSSING** (double).
- **THE LAMPS (three roving inserts, mid-field).** The phototaxis
  mechanic, pure rules: one lamp is lit at a time and *wanders* (lit
  shot rotates on a timer or per sling hit). Shots made at the lit lamp
  score ×2 and bank a **moth**. Moths are the multiball currency (§3).
- **NIGHT-BLOOM bank (centre-field, 5 drop targets — B·L·O·O·M).** The
  lineup's first 5-bank, free-standing in the beds (every previous bank
  hid in a wall). Complete = a bloom opens: bonus units and the Orchid
  ladder advances.
- **THE ORCHID (scoop, centre-right).** The award ladder and mode start;
  ejects to the **right** flipper (per-table eject hands are now the
  rule, not the exception).
- **The cold frame (subway).** Right-outlane service hatch when lit,
  resurfacing in the *outer right* inlane.
- **The gutters — the second structural argument.** **Double inlanes
  each side** (four return lanes: outer pair fed by orbit returns and
  the vine drop, inner pair by slings and scoop spill), single outlane
  each side. Rolling all four return lanes = **POLLEN COUNT** (lights
  the kickback and steps bonus X). The bottom third *reads* different at
  a glance — which is the retrofit pass's whole complaint, answered
  structurally.

**Flipper roles:** right flipper owns the Vine Run mouth and the Orchid
return; left flipper owns the Gallery re-entry and the Bloom bank's
low targets. The mirrored launch means the *right* hand starts every
ball — alone in the lineup.

## 3. Rules skeleton

- **Pollen (bonus units):** switches gather pollen; end-of-ball bonus =
  pollen × bloom multiplier.
- **POLLEN COUNT (bonus X):** light all four return lanes (lane change
  works across all four — inner pair one button, outer pair the other) →
  step the multiplier, relight the kickback (**THE MISTER**, left
  outlane — a hiss of spray flicks the ball back).
- **M-O-T-H lanes:** completion re-lights a wandering LAMP and feeds the
  Orchid ladder. Letters persist, lane change as always.
- **THE LAMPS (phototaxis):** the lit lamp wanders; shots at it score ×2
  and bank a moth. `mothsForSwarm` moths light **SWARM**.
- **THE VINE RUN:** rides pay CANOPY; a ride landing while POLLEN COUNT
  is fresh pays **CROSS-POLLINATION** (big, the table's marquee shot).
- **BLOOM bank:** each completion opens one bloom (5 blooms tracked
  across balls); all five = **FULL BED**, arming the wizard qualifier.
- **Orchid ladder (wrapping):** `SEEDLING → BUD → CORSAGE → THE ORCHID`
  — top rung starts **LIGHTS OUT** (video mode: the lamps fail one by
  one; flippers steer the moth silhouette to the moonlit pane — the
  holdScoop/timer pattern, sim-safe).
- **SWARM (multiball):** banked moths release as a 3-ball; jackpots at
  the lit lamp only (it keeps wandering mid-multiball — the lineup's
  first *moving* jackpot); double at the Vine Run.
- **THE CENTURY BLOOM (wizard):** FULL BED + one SWARM + one
  CROSS-POLLINATION → the Orchid lights: the century plant flowers
  tonight, once. 30 s, everything lit, all lamps on at once (no
  wandering — the whole house ablaze), scores ×2.

## 4. Palette & style (style-guide amendment required at build)

Feature colour: **orchid rose** — a NEW neon pair (`--rose-400/600`):
the lit lamp halo, bloom inserts, the ON-AIR-sibling "IN FLOWER" sign.
Discipline vs the carnival's magenta (the nearest claimed family): rose
is pale, warm and low-saturation — petal, not neon-sign; if a specimen
render can be mistaken for Midway magenta, desaturate rose, never
brighten it. Rose is *organic light only* (blooms, lamp halos) — never
signage, which keeps the two families in different jobs as well as
different values.

**Conservatory field variant** (`--conservatory-700/800/900`, walls
`-500/300`): deep leaf-green-black with a glass sheen — darker than
signal green's smoke field, and the only field variant with a *cool
highlight* (moonlight through panes). ≤10% neon discipline holds;
brightness is the roving lamps, the moon grid of the roof, and open
blooms.

Art gradient down the table: the roof vault and the moon through it →
palm canopy and hanging baskets → the beds, benches and the lamp posts
mid-field → the potting bench, cold frame and coiled hose at the slings.
Same moon, cut into panes.

## 5. DMD scenes

1. **moth** — a moth spirals into frame and settles on the lamp; the
   halo blooms. Moth banked; idle personality.
2. **bloom** — petals unfurl from a bud in five steps (one per bank
   completion), full flower on FULL BED.
3. **crossing** — the moth silhouette crosses the whole 128-dot width
   over bed rows. Vine Run rides / CROSS-POLLINATION.
4. **swarm** — dozens of moth dots converge on one lamp, the frame
   fills. Multiball start, looped.
5. **lightsout** — lamps wink out left to right; one moonlit pane
   remains. The video mode's interactive set (code-drawn, SIGNAL BOX
   pattern).
6. **century** — the century plant's spike rises the full frame height
   and detonates into flower. Wizard; attract closer.

## 6. Audio direction

ChipMusic brief: **~116 BPM in 3/4** — the lineup's first waltz:
"Nocturne for the Night Shift". A music-box lead (short decay, high
register) over a soft pulsing bass in slow triple time; the chorus adds
a counter-melody like a second moth; the breather is condensation —
sparse plinks on the offbeats. SWARM tightens the waltz into urgent
running triplets; THE CENTURY BLOOM resolves into the lineup's biggest
major cadence. SFX: bumpers = glass tings, spinner = the vent flapping,
scoop = a seed dropped in a paper packet, bank = stems snapping upright,
lamps = filament hum rising a fifth when the lit shot lands, mister =
the hiss, tilt = a pane cracking (not shattering — this table never gets
violent).

## 7. Engine requirements & cut line

This table drives **M14** — generalizing what M10 left implicit:

1. **Left-hand plunger** — the envelope fields already carry the lane
   geometry per table, but the *right-handedness* is baked into a
   handful of predicates (`p.x > laneWallX` shooter-lane tests in Game
   and camera, plunger visuals anchored right, spawn assumptions in the
   sims). M14 adds `table.plungerSide: 'left' | 'right'` and routes
   every such test through one shared helper. Cut line: **ship the
   widebody right-handed first** — width alone is the bigger felt
   change; the mirrored launch can land in a v1.1.
2. **Widebody width** — per-table data already; the camera's
   width-binding scale rule already exists for narrow screens. Work is
   an audit (DMD/backglass panel layout, render-scale defaults, any
   hardcoded 0.575), not a feature.
3. **Double inlanes** — pure SVG + defs (rollover sensors and guides);
   the gap invariants apply as always. No engine change.
4. **5-target bank** — `DropTargetsDef.targets` is already an arbitrary
   list; rules read counts from `rules.json`. Free-standing housing must
   still obey the ≤8 mm recess rule from both sides — the soak item.
5. **Roving lamp / moving jackpot** — pure TableLogic + lamp state. No
   engine change.
6. **Lateral surface** — M11 as-is; a sideways profile is just a
   profile. Verify the crossing's clearance over the bed furniture
   (the ~7 mm rule) and the airborne landing zone (≥12 mm rule).

**No new entities.** If the free-standing bank traps in soak it backs
into a bed wall (housed like every other bank) before it shrinks; if
the four return lanes starve the outer pair, their orbit-return feeds
widen before the count drops to two.

## 8. Authoring order & verification

Theme brief → style-guide/token amendment (conservatory field + orchid
rose) → M14 seams (plungerSide helper + width audit) behind simcheck →
playfield SVG → rules.json → defs + logic → DMD scenes → backglass →
registration → simcheck suite. Feature-rates make-or-break numbers:
**Vine Run completion rate** (a lateral climb is new physics territory —
speed-sweep it like the Aerial Run), **outer-inlane feed rate** (four
return lanes are only a differentiator if all four actually see
traffic), and **lit-lamp hit rate** (the wander interval tunes against
it).
