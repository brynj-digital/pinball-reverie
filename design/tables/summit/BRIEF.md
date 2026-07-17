# Summit — Table 8 design brief

**Status: concept (2026-07-16), not yet scheduled.** Table id: `summit`.
Planned engine milestone: **M15 (playable elevation — furniture and a
flipper that live at height)**. See
`docs/plans/table-differentiation-plan.md` for sequencing.

**Premise:** the last cable car of the night, up to the weather station
on the summit. The valley and its lights far below, the aurora starting
over the ridge, instruments to read before the log closes at dawn. The
tall scrolling playfield is the mountain itself: the valley station at
the flippers, the cable climbing the mid-field, and at the top — **the
Terrace**, the station platform, where the ball *stays and plays* thirty
millimetres above everything else. Eighth panel of the anthology: the
Night Mail crosses the dark country below this mountain; from the
Terrace you can see its lamp moving on the plain.

Register: **cold, thin, vast** — wind in cables, creaking ironwork,
enormous quiet. The lineup's most spacious table; where the Sump is
enclosed and Glasshouse is humid, Summit is all sky.

## 0. IP note (read first)

- **No close DICE neighbour.** No mountain/alpine table in Pinball
  Dreams or Pinball Fantasies (Stones N Bones is a graveyard, not a
  landscape table; no shared register).
- Real-machine check: mountain themes exist historically (Gottlieb had
  alpine-flavoured EMs) but no known machine named "Summit"; the
  weather-station fiction, cable-car mechanics and aurora are ours. No
  real mountain, resort, or railway name; the peak is invented.
- The aurora must stay *meteorological*, not mystical — this is a
  science-station table, the anthology's high-altitude sibling of the
  Moondial's observatory, and the two must not blur: Moondial watches
  the sky through glass and brass; Summit *stands in the weather*. No
  telescopes, no zodiac, no eclipse language up here.

## 1. Height (M11 strata) — the point of the table

| Stratum | render hint | Fiction | Holds |
|---|---|---|---|
| The Terrace | `1` | the summit platform | a PLAYABLE flat surface: upper flipper, instrument sensors, the drop edge |
| The mountain | `0` | the slopes and the valley station | everything conventional |
| The gallery | `-1` | the service tunnel through the rock | one subway |

Every previous z-stratum is a *transit* — rails the ball rides through.
The Terrace is a *place*: a flat M11 surface (constant h = 30 mm) the
ball lands on, rolls across, gets flipped around on, and eventually
leaves — over an open edge, ballistically, like everything M11 taught
us. That one idea is the whole table.

## 2. Layout

Envelope: lineup standard (0.575 × 1.05, right plunger — after two
envelope-breaking tables, Summit differentiates *vertically*).

```
   ╭──────────────────────────────╮ ╮
   │ ╔═ THE TERRACE (h 30) ══════╗│ │ plunger
   │ ║ instruments ◇ ◇ ◇         ║│ │ lane
   │ ║   upper flipper ▷   OPEN  ║│ │ (the
   │ ║        EDGE ──────► drop  ║│ │ service
   │ ╚═══════════╗ (ballistic to ║│ │ stair)
   │  P-E-A-K    ║  the lanes)   ║│◄╯
   │  rollovers  ║               ║│
   │   CABLE CAR ║ (Lift: the    ║│
   │    ● ● ●    ║  only way up) ║│
   │  (cairn     ║               ║│
   │   bumpers)  ▲               ║│
   │ CORNICE ▯  car dock         ║│
   │ (drop   ▯     ⊙ THE BOTHY   ║│
   │  bank)  ▯       (scoop)     ║│
   │ ◁ sling            sling ▷  ║│
   │ inlane               inlane ║│
 WINDBREAK outlane      outlane ┆┆│ ← right outlane: the
   │  │                       │ ┆┆│   GALLERY subway (−1),
   ╰──┴──────── drain ────────┴──╯    to the plunger lane
```

Zone by zone:

- **The ridge (y ≈ 0–150).** Full orbit — **the Ridge Run**, wind
  tearing along the summit line — with the spinner as the **anemometer**
  in the *left* orbit lane. Four **P-E-A-K** rollovers.
- **THE TERRACE (top third, right of the orbit — the playable
  platform).** Flat at h 30 mm, walled on three sides, **open on the
  down-table edge**. On it: the **upper flipper** (the engine feature —
  a flipper whose contacts gate at platform height), three **instrument
  sensors** (BAROMETER / THERMOMETER / ANEMOMETER — rollover-style
  pads), and nothing else. The ball arrives by cable car, gets one or
  several flips across the instruments, and sooner or later runs off
  the open edge — a real ballistic drop into the P-E-A-K lanes or the
  ridge channel below (the Midway striker/incline "happy accident",
  finally designed on purpose). There is no way to die up there: the
  worst outcome is an unread instrument.
- **THE CABLE CAR (mid-field — the Lift, re-themed).** The only way up.
  A right-flipper shot into the car dock; the car carries the ball up
  the cable and releases it AT PLATFORM HEIGHT onto the Terrace (the
  Lift's transit-to-height machinery as-is, with the release grounded
  onto the surface rather than airborne). Lit rides ride free; unlit
  rides cost a timer (§3).
- **The cairn bumpers (3, mid-left).** Stacked-stone waymarkers.
- **THE CORNICE (left wall, 3 drop targets).** Overhanging snow slab,
  right-flipper cross shot. Completing it triggers the **AVALANCHE**
  hazard-reward (§3).
- **THE BOTHY (scoop, lower-centre-left, ejects LEFT).** The refuge
  hut: award ladder, mode start, and the wizard start.
- **The gutters.** Standard trapezoid; left outlane **WINDBREAK**
  kickback; right outlane the **GALLERY** subway (through the rock to
  the plunger lane — the chicken-exit pattern).

**Flipper roles:** right flipper owns the cable car dock and the
Cornice; left flipper owns the Bothy return and the Ridge Run entry.
**The upper flipper owns the sky**: on the Terrace it bats across the
instruments and — the marquee shot — can fire the ball off the open
edge *at speed*, clearing the lanes entirely and re-entering the ridge
channel: **THE LAUNCH**, the lineup's only flipper shot taken from
altitude.

## 3. Rules skeleton

- **Log entries (bonus units):** switches write the station log;
  end-of-ball bonus = entries × FORECAST multiplier.
- **P-E-A-K lanes:** completion lights a free cable-car ride and steps
  the WINDBREAK. Lane change + persistent letters.
- **THE INSTRUMENTS:** each Terrace visit, instruments the ball rolls
  are READ. All three read (across any number of rides) = a **FORECAST**
  — the bonus-X step (2×→6×) and the aurora ladder advances. Instruments
  reset per forecast, not per ball.
- **THE LAUNCH:** leaving the Terrace via the upper-flipper power shot
  into the ridge channel scores big and counts as a Ridge Run combo
  step; dribbling off the edge is safe but scores nothing. Risk is
  time, not death — the Terrace is the lineup's only *sanctuary*
  paid for in main-field opportunity cost.
- **Ridge Run combo:** repeat orbits step it; anemometer spins score
  per step and accumulate **WIND** — at `galeSpins`, the cable car
  closes for `galeS` (too windy to ride — the table's own hazard: the
  wind you farmed for points takes your best shot away).
- **THE CORNICE / AVALANCHE:** bank completion drops the cornice —
  `avalancheS` of ×2 scoring everywhere *below* the Terrace while the
  snow runs; balls on the Terrace during it are above the danger and
  bank a **SNOW JACKPOT** when they come down. Reward shaped like a
  hazard; nothing actually punishes.
- **Bothy ladder (wrapping):** `SHELTER → BREW → RESUPPLY → THE LOG` —
  top rung spots an instrument and lights the Gallery.
- **LAST CAR UP (multiball):** `carsRequired` lit cable-car rides bank
  physical locks **in the car dock berths** (lockBall — the parked
  gondolas visible mid-field); full dock = 3-ball, jackpots on the
  cable car and the Launch; a Launch during multiball = **SUMMIT
  JACKPOT** (double).
- **THE AURORA (wizard):** three FORECASTs + one LAST CAR UP + one
  SUMMIT JACKPOT → the Bothy lights. 30 s: the sky goes green-white,
  all scores ×2, the cable car runs continuously (instant re-rides),
  every instrument re-reads. The log closes at dawn.

## 4. Palette & style (style-guide amendment required at build)

Feature colour: **aurora ice** — a NEW neon pair (`--ice-400/600`), a
glacial pale blue-white. Discipline vs the abyss cyan (nearest claimed
family): ice is *paler and colder* — near-white with a blue cast, where
cyan is saturated tropical water; if a specimen reads as Tidebreaker,
whiten ice, never saturate it. Ice is sky and snow light only (aurora
sheets, cornice glow, breath) — never signage, never water.

**Alpine field variant** (`--alpine-700/800/900`, walls `-500/300`):
granite and old snow under moonlight — the lineup's *lightest* field
(a blue-grey, still comfortably dark, but the only table where the
ground itself faintly glows). ≤10% neon discipline holds; brightness is
the aurora, the station windows, and the valley lights at the very
bottom of the art.

Art gradient down the table: the aurora and the summit pylon → the
cable spans and the Terrace ironwork → scree, cairns and the cornice
slab mid-field → the valley station, its lamps, and the tiny lit thread
of the Night Mail crossing the plain at the slings. Same moon, small
and hard in a thin sky.

## 5. DMD scenes

1. **wind** — the anemometer cups spin up; speed digits climb. Ridge
   combos; idle personality (idle cups turn lazily).
2. **car** — the gondola crosses the frame on its cable, dips at the
   towers. Cable-car rides and lock parks.
3. **read** — an instrument needle sweeps and settles; three stacked
   dials fill left to right. Instrument reads / FORECAST.
4. **avalanche** — the cornice line cracks and the slab runs the full
   frame diagonally. Cornice completion.
5. **launch** — ball silhouette arcs off the platform edge clear across
   the frame. THE LAUNCH / SUMMIT JACKPOT.
6. **aurora** — curtains of light sweep and fold over the ridge line.
   Wizard, looped; attract closer.

## 6. Audio direction

ChipMusic brief: **~76 BPM, straight, wide** — the lineup's slowest and
most open song: "Thin Air". Long pedal bass notes, a lead that moves in
whole phrases with real silence between them, fifths and fourths (cold
intervals); the chorus is the cable car moving — a steady climbing
arpeggio under the lead; the breather is wind alone (filtered noise
swell, no pitch). LAST CAR UP doubles the tempo feel without changing
BPM (subdivision, not speed); THE AURORA is the one place the table
goes lush — added thirds, the only warm chord in the song. SFX: bumpers
= stone knocks, spinner = cup-whirr rising with combo, scoop = a door
unlatched against wind, cornice = a deep crump, cable car = motor hum +
cable sing, instrument reads = three distinct glass taps (a chord when
the forecast completes), launch = a whip of wind, kickback = a canvas
snap, tilt = a cable twanging.

## 7. Engine requirements & cut line

This table drives **M15** — teaching furniture to live at height:

1. **The z-banded flipper** — THE feature. The upper flipper's fixtures
   gate through the existing per-contact z-gate (`contactApplies`) with
   a `data-z`-style band at Terrace height, so it touches Terrace balls
   and ignores ground traffic passing beneath. Input/anchor/validation
   machinery for a third flipper exists since Midway; the *height* of
   its contacts is the new seam. Cut line: none — this is the table's
   reason to exist; if it slips, the table waits.
2. **The playable platform** — a flat constant-height M11 surface with
   walls (`data-surface` rails already follow local surface height) and
   an open ballistic edge (the ≥12 mm landing rule, long since proven).
   Expected to be authoring discipline, not engine work.
3. **Instrument sensors at height** — sensor z-bands (`data-z-min/max`)
   exist; the Terrace pads band at h 30. The resense-on-support-change
   pass already handles balls landing inside a zone.
4. **Cable car = Lift reuse** — one delta: release *grounded onto the
   surface* at hTo rather than airborne (`endTransitAirborne` has a
   grounded sibling or gains one — small, entcheck-verified).
5. **Dock locks = lockBall reuse**, berths beside the dock (the siding
   pattern verbatim).

**No new entities.** The one genuinely new engine behaviour is a moving
flipper fixture participating in the z-gate — entcheck grows a synthetic
platform-flipper case before any SVG is drawn.

## 8. Authoring order & verification

Theme brief → style-guide/token amendment (alpine field + aurora ice) →
M15 seam (flipper z-band + grounded lift release) behind entcheck →
playfield SVG → rules.json → defs + logic → DMD scenes → backglass →
registration → simcheck suite. Feature-rates make-or-break numbers:
**Terrace dwell time** (long enough to read instruments, short enough
that the sanctuary doesn't dominate scoring — the opportunity-cost
design only works if main-field points-per-second genuinely beat
Terrace idling), **Launch rate vs dribble-off rate** (the upper flipper
must earn its keep), and **cable-car ride rate** (an unreachable dock
is a dead table — the Sky Ride taught us the feed matters more than
the feature).
