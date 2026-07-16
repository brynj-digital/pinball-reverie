# Night Waves — Table 5 design brief

**Status: v1 built (2026-07-16).** Table id: `nightwaves`. This brief is
the design truth; `playfield.svg` + `rules.json` + `src/table/defs/
nightwaves.ts` + `src/game/nightwaves.ts` are the specifics. Deltas from
the concept, found during clearance-solving and simcheck/soak/
feature-rates:

- **The run mouth sits at x 168, not on the coaster's 163.** At 163 the
  shell-side rail foot came down 35.7 mm off the left sling's hypotenuse —
  inside the 13.5–38 wedge band. 5 mm east clears it (40 mm) and puts the
  mouth even closer to the left flipper's straight-up line (171).
- **The aerial pays from 1.8 m/s** (speed-sweep probe): 1.6 stalls on the
  climb and rolls back out of the mouth; every aimed flip ≥ 1.8 completes
  clean — no mid-run hop at any speed to 3.4. Random-soak completion is
  0 per 600 s at 19–32 boards, the same class as Midway's proven coaster
  (18 boards / 1 ride) — the boost is an aimed shot by design.
- **The mast release feeds the lanes** (emergent, kept): a fast release
  carries ballistically up the sweep channel and lands near the apex, then
  sags into the W-A-V-E lanes — the same happy accident as the Night
  Mail's incline drop.
- **The full sweep arc stays intact** (no crest windows): across 4 soak
  seeds every lane feeds (1–18 hits each per 600 s) and lane-change covers
  the spread; completions run ~1 per 600 s — thinner than the Night
  Mail's 2–5 but the clock also advances via the phone's B-SIDE.
  WATCH ITEM: if play shows the clock stalling, open flank mouths with
  the proven apex-cover pattern.
- **Suite results:** simcheck 65/65 for the table (269 lineup-wide); soak
  seeds 1/2/3/7 = 0 stuck, 0 OOB, 0 loops.

**Premise:** a pirate radio station broadcasting from a rooftop shack above
the sleeping city, midnight until dawn. The tall scrolling playfield is the
broadcast itself, seen down the building: the transmitter mast on the
parapet at the top, the city's aerials and rooftops mid-field, the studio —
record deck, mixing desk, the phone — down by the flippers. You score by
keeping the show alive: tuning listeners in, taking requests, holding
callers on the line. The drain is dead air.

Fifth panel of the same-night anthology, and the first to go **indoors with
the humans**: Moondial watches the sky, Tidebreaker is under the sea, the
Midway is lit like daytime, the Night Mail crosses the dark country — and
Night Waves is the voice playing quietly in every one of those places.
Register: **warm, close, unhurried** — the lineup's first cozy table. Where
the Night Mail never stops moving, Night Waves *settles in*: swung rhythm,
sodium light, one voice and the city listening.

## 0. IP note (read first)

- **No close DICE neighbour.** Neither Pinball Dreams nor Pinball Fantasies
  has a radio/broadcast table (their slots: graveyard, steel wheel, beat
  box, nightmare / party, speed, billion, stones). **Beat Box** (Pinball
  Dreams) is music-adjacent — theirs is a stage/recording-studio hip-hop
  register with performers front and centre; ours is nocturnal solo
  broadcast infrastructure — masts, dials, switchboards, the city as the
  audience. No shared names or imagery: nothing called "beat", "box",
  "jam", or "groove"; no stage, no performers, no boom-box iconography.
- Real-machine check: no known Williams/Bally/Gottlieb table named "Night
  Waves". (Data East's *Radical!* and Williams' *Rock* are unrelated in
  name and theme; "Radio" alone is unused.) The wordmark, station fiction,
  and all show names are invented.
- **No real broadcast marks**: no call signs that collide with real
  stations (the art uses bare MHz numbers), no real DJ names, no licensed
  lyrics or song titles anywhere (the DMD requests are generic: "SIDE A /
  SIDE B").
- **Original structure:** the tuning-dial economy (spinner as a *selector*
  that arms a shot rather than a points well), the caller switchboard
  locks, dead air, and the perfect-segue double jackpot are our own
  mechanics.

## 1. Height (M11 surfaces)

True-height table per plan §7a / STYLE-GUIDE §4. Render hints only:

| Stratum | render hint | Fiction | Holds |
|---|---|---|---|
| The Aerial Run | `1` | the feeder cable up to the mast | one climbing wireform, left side |
| The Rooftop | `0` | the playfield | everything conventional |
| The Back Stairs | `-1` | down through the building | side-door subway |

## 2. Layout

Playfield `0..520`, plunger lane `520..575` (fiction: **the fire escape** —
the way up to the roof; the lane art is the FM band, 88 → 108 MHz climbing
with the ball). Asymmetric interior: the mast and its run own the left,
the studio apparatus sits centre-right.

```
     THE MAST ─────► ╭──────────────────────────────╮ ╮
    (aerial-run      │    W A V E  rollovers        │ │ plunger
     drop-off into   │         ●   ●   rooftop      │ │ lane
     the sweep       │           ●     aerials (3)  │ │ (fire
     channel)        │                  ╔═══════════╡ │ escape;
        ▲            │ SWITCHBOARD      ║ THE DIAL  │◄╯ the FM
     AERIAL RUN      │ (caller locks ●●)║ (spinner  │   band)
    (climbing        │                  ║ across the│
     wireform,       │      ⊙ THE PHONE ║ channel)  │
     left-flipper    │        (scoop)   ▼           │
     straight shot)  │                       FADER ▯│
        ▲            │                       BANK  ▯│ (in the lane
        │            │   01:00…05:00        (drop) ▯│  wall face —
        │            │   THE CLOCK inserts          │  left-flipper
        │            │        ◎ RECORD DECK (disc)  │  cross shot)
      mouth ►        │ ◁ sling            sling ▷   │
        │            │inlane                 inlane │
   GENERATOR         │  │                       │ ┆─(−1)─┐
   kickback          outlane                outlane ┆SIDE │
        │            │                          │   ┆DOOR │
        ╰────────────┴────────── drain ─────────┴───┴─────╯
                                       (side door lit: subway to the
                                        LEFT INLANE — the only outlane
                                        in the lineup that returns the
                                        ball to a live flipper)
```

Zone by zone (y-ranges indicative — final geometry is set in the SVG under
the ball-gap invariants):

- **The skyline & the sweep (y ≈ 0–150).** Full orbit along both walls —
  **the City Sweep**, the signal going out across the rooftops — with the
  plunger feeding into it. Four **W-A-V-E** rollovers under the arc.
  **The Dial** — the spinner — spans the top-right launch channel (the
  tuning capacitor; every launch and every sweep rips through it).
- **The rooftop aerials (y ≈ 230–350, right of centre).** Three bumpers —
  the neighbours' TV aerials, bouncing the signal on.
- **The Aerial Run (left side — the climbing surface).** The feeder cable:
  a straight-up **left-flipper** shot into a wireform mouth at centre-left,
  climbing the left side, crossing above the sweep channel and releasing
  the ball AIRBORNE at the mast (top-left) — it drops into the sweep
  channel and runs on, often into a W-A-V-E lane. Untuned, a ride pays
  SIGNAL; **tuned** (the Dial lit), it pays **SIGNAL BOOST** × the Sweep
  combo and spots a Phone rung. Speed is the point: tune, then climb.
- **The Switchboard (mid-left, under the run — the locks).** When CALLER
  is lit (fader bank completed) the switchboard captures a passing ball
  and puts the caller ON HOLD — a physical lock, parked visibly on the
  hold line beside it. Two on hold + a third lit capture = **ON AIR**
  (§3). The capture zone is sensor-only (the Night Mail siding's proven
  pattern — no pocket geometry), z-banded so riders overhead never trip it.
- **The Phone (mid-field kickout scoop).** The studio phone: the request
  ladder (§3), the REQUEST SHOW video-mode start, and the Side Door light.
  The lineup's proven scoop housing, fed from the left flipper.
- **The Fader Bank (lane wall face, ~y 480 — 3 drop targets).** The
  mixing-desk faders, recessed into the plunger-lane wall, faces pointing
  left — an intentional **left-flipper cross-field shot** (the mirror of
  Tidebreaker's airlock). Faders up = CALLER lit at the switchboard.
- **The Record Deck (lower-centre-right, ø68 mm — the disc).** Flush
  turntable imparting tangential velocity; parked in normal play, **a slow
  drift while TUNED** (the record is playing), full spin during ON AIR and
  THE DAWN CHORUS.
- **The Clock (centreline inserts).** 01:00 → 05:00 — the bonus-multiplier
  ladder (§3). At 05:00 the sky is about to break: DAWN is armed.
- **The gutters.** Standard trapezoid, both outlanes active:
  - **Left outlane — THE GENERATOR:** kickback (the backup generator kicks
    the power over), lit per W-A-V-E completion. One save.
  - **Right outlane — THE SIDE DOOR:** when lit (at the Phone), a subway
    down the back stairs and through the building, resurfacing in the
    **left inlane** — the only outlane in the lineup that hands the ball
    back to a live flipper. Unlit, it routes to the drain.

**Flipper roles:** the **left flipper owns the station** — the Aerial Run
(straight up) and the Fader Bank (cross-field); the **right flipper owns
the city** — the City Sweep entry (bottom-left channel) and the Phone
(cross-field). Tune on the sweep, then climb with the other flipper: the
core loop deliberately alternates hands. Preserve this division through
any geometry changes.

## 3. Rules skeleton

Same `rules.json` shape as the others (base points + bonus units + combo +
scoop ladder + wizard mode). Values are tuning guesses, not commitments.

- **Listeners (bonus units):** every switch gains listeners; end-of-ball
  bonus is *listeners* × the hour multiplier.
- **The Clock (bonus multiplier — timetable/depth-gauge sibling):** W-A-V-E
  completion advances one hour — `01:00 → 02:00 → 03:00 → 04:00 → 05:00` —
  each a bonus-X step (2×→…→6×); 05:00 arms DAWN. Flipper lane-change on
  the rollovers, letters persist across balls (the proven pattern).
- **City Sweep (orbit combo):** repeat full orbits inside a 10 s window
  step the combo (max 3), ×2 per step.
- **The Dial:** N spinner spins = **TUNED IN** (one boost armed; the deck
  starts its slow drift). The spinner is a *selector*, not a points well —
  spins are worth little; what they buy is the lit Aerial Run.
- **Aerial Run:** every completed ride pays SIGNAL; a TUNED ride pays
  **SIGNAL BOOST** = boostPoints × the Sweep step, consumes the light, and
  spots a Phone rung. (Ride award fires on leave-at-the-mast, guarded by
  boarded-at-the-mouth — the M11 convention.)
- **Phone ladder (wrapping, sorting-office sibling):** `REQUEST 5,000 →
  SHOUT-OUT 10,000 → DEDICATION 15,000 → MYSTERY B-SIDE 25,000`; the
  B-SIDE advances the Clock one hour and lights **REQUEST SHOW** (video
  mode). Every capture lights the Side Door.
- **REQUEST SHOW (DMD video mode):** the scoop holds the ball; requests
  come down the line and the **flippers cue the record — SIDE A or SIDE
  B** — before the needle drops. 5 cues, timer-driven (sim-safe, the
  SIGNAL BOX pattern); all five right = **a caller joins the line** (a
  virtual caller toward ON AIR).
- **ON AIR (multiball):** fader bank completed lights CALLER; a lit
  switchboard capture puts a caller ON HOLD (physical lock on the hold
  line; a fresh ball serves if it was the last). callersRequired on the
  line = **ON AIR**: 3-ball multiball, ×scoreFactor scoring, deck
  spinning; jackpots on the Aerial Run and the City Sweep; hitting the
  OTHER jackpot shot within segueS of the last = **PERFECT SEGUE**, a
  double-jackpot bonus. Lit switchboard arrivals mid-mode pay CALLER
  JACKPOT. Locked callers persist across balls; clear at game end.
- **DEAD AIR (the table's own hazard — no sibling in the lineup):** go
  `warnS` without scoring a single point and the DMD dissolves to static
  (warning sfx); every `drainS` after that, a slice of your listeners
  tunes out (bonus units shrink). Keep the show moving. Armed by the
  first score of each ball, so attract/game-over never fire it; suspended
  while the scoop legitimately holds the ball for the REQUEST SHOW.
- **THE DAWN CHORUS (wizard mode):** qualify by reaching 05:00, starting
  one ON AIR, and making one SIGNAL BOOST. The Phone then lights;
  shooting it starts 30 s: all scores ×2, deck spinning, both jackpot
  shots lit with the PERFECT SEGUE live, full lamp chase. The sun comes
  up and the whole city wakes with the radio on.
- **THE GENERATOR:** kickback, lit per W-A-V-E (one save). **THE SIDE
  DOOR:** lit at the Phone; unlit = drain.

## 4. Palette & style (style-guide amendment shipped with this table)

Feature colour: **transmitter amber** — a NEW neon pair
(`--amber-400/600`, added 2026-07-16 with this brief), sodium-vapour
orange-amber: the ON AIR sign, the dial pointer, insert arrows, the lit
lane run. The other four neon families were all claimed (violet/cyan/
magenta/green, one per table); amber is the natural fifth — it *is* the
colour of a city at night. Discipline: amber is lit electric signage —
distinct from **brass** (ball-touch metal only) and **bulb** white-gold
(incandescent points: lit windows, desk lamps); the three warm families
never substitute for each other. The Aerial Run's **ramp glass is amber**
too (`rampGlass3d` + the SVG wash carry the same hue, per the per-table
glass rule).

**Rooftop field variant** (`--rooftop-700/800/900`, walls `-500/300`):
sodium-washed asphalt and tar-paper — a warm umber-grey, browner than the
carnival plum, warmer than Moondial's blue-violet, nothing like the abyss
or the smoke. ≤10% neon discipline holds (this is a quiet table);
brightness is lit windows, the ON AIR sign, and the dial.

Art gradient down the table: the mast and the moon over the parapet → the
aerials and chimney stacks of the neighbouring roofs → the FM band and
the switchboard mid-field → the studio at the slings: desk, faders, VU
meters, the deck, one warm lit window. Same moon as the whole lineup.

## 5. DMD scenes (masters in `design/dmd-scenes/`, baked as always)

1. **dial** — the needle sweeps the frequency band, static ticks, locks on
   and blooms. TUNED IN; the idle personality of the table.
2. **mast** — rings radiating from the mast tip over the skyline,
   strengthening. SIGNAL BOOST and Aerial jackpots.
3. **caller** — a patch cord swings in and seats in the switchboard jack;
   the line lamp lights. Callers on hold / locks.
4. **onair** — the ON AIR sign flickers twice and blazes. Multiball start
   (looped for the duration).
5. **static** — the picture dissolving into white noise, three stabs.
   DEAD AIR warnings.
6. **dawn** — the sun cracks over the skyline, waves radiate out across
   the rooftops. THE DAWN CHORUS; also the attract-loop closer.

(The REQUEST SHOW scene set is code-drawn like SIGNAL BOX — interactive
frames, not a strip.)

## 6. Audio direction

ChipMusic brief: **~100 BPM, swung** — the lineup's first shuffle
(`swing` per section; Night Mail runs straight time, this table leans
back). "The Small Hours": a walking bounce bass under a smoky pulse lead
with late phrase entries; the chorus (the show in full flight) tightens
into the square wave with the rolling bass; the breather is a caller's
voice — triangle, nearly alone; the middle eight climbs like the
transmitter warming up, then tips back into the chorus. ON AIR adds the
full stack; THE DAWN CHORUS resolves major as the sun comes up. SFX:
bumpers = aerial *tings*, spinner = tuning ratchet through static, scoop
= the phone picked up, switchboard = jack seated with a click, deck =
low platter rumble while spinning, kickback = generator whump, dead air
= a static wash (the `warning` voice), tilt = needle scratch + the
carrier dropping out.

**Cut line (noted, not built):** true wow/flutter — the deck bending the
music's pitch while it spins — needs a playback-rate seam ChipMusic
doesn't have. If it ever lands, it's a small `ChipMusic` addition, not a
table change; v1 ships with the deck rumble sfx only.

## 7. Engine requirements & cut line

**This table adds NO new engine entities** — deliberately. After the
Night Mail's feature milestone, Night Waves is the *integration* table:
every mechanic re-points existing machinery at a new job.

1. **Spinner as selector** — pure `TableLogic` (spins arm a shot). No
   engine change.
2. **Climbing surface** (Aerial Run) — M11 surfaces, the winch/coaster
   pattern. Cut line: shorten the run; the drop-off moves down-table.
3. **Disc** (Record Deck) — M12 entity, re-themed. The TUNED slow-drift
   spin is new *usage*, not new code. Cut line: parked outside modes.
4. **Physical locks** (Switchboard) — `lockBall`/`releaseLocks`, the
   siding pattern with a sensor-only capture zone. Cut line: virtual
   callers (clunk-and-release), the locks stay on the DMD.
5. **Video mode** (REQUEST SHOW) — `holdScoop` + timer-driven scene, the
   SIGNAL BOX pattern. Cut freely to a static award.
6. **Subway to an inlane** (Side Door) — a `Subway` whose exit segment
   points down the left inlane throat. Cut line: exit to the plunger
   lane (the chicken-exit pattern) if the inlane drop misbehaves in soak.
7. **DEAD AIR** — pure logic on the score-event clock. Cut line: drop the
   listener loss, keep the static scene as flavour.

**No third flipper, no diverter, no magnet, no lift** — the identity here
is warmth and flow, not apparatus. If the Aerial Run's rails fight the
sweep channel clearances, the run shortens before anything else moves; if
the switchboard zone starves in feature-rates, it slides toward the
bumper spray line rather than growing a feed lane.

## 8. Authoring order & verification

Theme brief (this file) → style-guide/token amendment (rooftop field +
amber neon) → playfield SVG master → rules.json → defs + logic → DMD
scenes → backglass → registration (specs/assets/songs) → simcheck suite.
Simcheck + soak after every playfield-SVG edit, as always. Per the
feature-difficulty rule: run an instrumented `feature-rates` soak once
geometry exists and after every placement change — the Aerial Run
completion rate, the switchboard capture rate with CALLER lit, and the
W-A-V-E lane feed (the full arc has no crest windows; if the lanes starve
like Midway's and the Night Mail's did, open flank mouths using the
proven apex-cover pattern) are this table's make-or-break numbers.
