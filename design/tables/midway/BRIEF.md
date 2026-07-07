# Midnight Midway — Table 3 design brief

**Status: v1 built (2026-07-05).** `playfield.svg` + `rules.json` +
`src/table/defs/midway.ts` + `src/game/midway.ts` are now the specifics;
this brief remains the design intent. Table id: `midway`. Deltas from the
concept, found during clearance-solving and simcheck/soak:

- **Every Sky Ride loop feeds the mallet** (reworked after play found the
  original speed-sorted return starved the feature). An **arch catcher**
  sealed to the shell (height band ≤16 mm) deflects ALL descending loop
  returns inward, down the orbit tail and onto the bat; the ascending
  plunge clears it by launching off a **jump wedge** at the top of the
  queue (a small `skyjump` surface, 0→28 mm) and flying over — a real
  pinball jump ramp. A stalled plunge rolls back to the saddle; the flow
  loop is right flipper → Sky Ride → mallet → striker → P-A-R-K lanes.
- **The striker lane grew an entry throat.** A swing from mid-bat launches
  the ball up-left *past* the curled mouth over the bat root, so the lane
  has a chain of small up-only entry zones (`striker-in` at the root curl,
  `striker-in2/in3` mid-channel), each centred on the lane's centreline —
  soak proved a zone edge within a ball radius of a channel wall switches
  an embedded ball and the solver spits it out as a layer-1 ghost. A
  mis-caught ball just rolls back down to the `striker-back` restore and
  lands on the bat again.
- **The mallet pivot seals the wall side.** Pivot at (490, 300), base
  circle 12 mm off the lane wall: nothing ball-sized fits between pivot
  and wall, so arch drops can't sneak into the right outlane from above —
  they shed left onto the bat instead. The lane wall's top additionally
  curls into a small shield roofing the pivot-wall groove (soak found
  balls perching in the open V).
- **The high striker is a wireform.** The tower reads as an elevated wire
  lane (layer 1) crossing over the dodgem arena and the orbit wall to the
  bell in the top-left corner; past the bell the ball grounds into the
  P lane, as briefed.
- **Engine fix found by this table's chicken exit:** the drain sensor
  fired mid-transit for any subway crossing the drain zone — which
  Tidebreaker's lit gutter had been doing in real play (the "save" started
  the drain sequence). Drain contacts are now ignored while a kicker or
  subway holds the ball.

**M11 deltas (true height, plan §7a — this table drove the migration):**
the ball now really rides the ramps; entry zones, `striker-back`, and all
layer sensors are gone (boarding is geometry — any swing that reaches the
mouth rides). Consequences found by physics: the striker's curled mouth
became a real pocket against the mallet base and was removed (the lane now
starts as an open throat above the bat); the coaster's valley between
crests stranded slow riders — a real machine's ball-search problem — so
the profile is now crest → gentle continuous descent; both the coaster
drop-off and the striker's bell end are **ballistic drops** (the rail ends
in the air and the ball genuinely falls to the inlane / the P lane);
climbs cost real energy, so the mallet must connect cleanly to ring the
bell.

**P-A-R-K feed rework (2026-07-05):** soak instrumentation found the lanes
effectively unreachable — 6 lane hits and ZERO completions in 30 simulated
minutes — because the orbit inner wall sealed them off from above and the
striker's bell end was (contrary to the M11 delta above) capped by a bell
post, so nothing ever fed them but stray dodgem bounces. Three changes,
all realizing the briefed flow (right flipper → Sky Ride → mallet →
striker → P-A-R-K):

- **The orbit crest is open over the P and A mouths.** The inner wall's
  left arm now ends at (132, 113) and resumes at divider-2's top (263, 65),
  covering R/K and descending as before; the dividers rise to the old arc
  line and frame two 46–70 mm mouths. A fast Sky Ride loop rides the shell
  straight over the window into the arch catcher (mallet feed unchanged);
  a dying loop or soft crest ball drops into P or A. A full four-lane
  window was tried first: soak showed balls raining down the right half
  land on the striker wire's ball-height mouth run and wedge in the orbit
  tail V — the left half drains clean through the dodgems. The P column
  exposed a latent trap either way (the dead-end strip under the coaster
  lift hill, against the bed's solid back): a sloped **underbrace**
  continuing the ghost pocket's now-sloped roof sheds that column left
  into the orbit-arm corridor and back to the left inlane.
- **The striker cap is gone** — the bell end really is a ballistic drop
  now: a swing that rings the bell flies off the wire and lands in the
  lanes (or the open crest, rolling back in). The M11 text above was the
  intent; the cap was the bug.
- **Lane change + persistence.** Any main-flipper press rotates the
  collected letters across the lanes (left ←, right →), and letters
  survive the drain (reset per game). One repeatable feed can finish the
  set — tough, not impossible.

The outlane saves also gained **lit-state insert lamps** (stamp magenta,
chicken-exit cyan; Tidebreaker's hatch/gutter got the same) — the saves
were invisible when armed, and an unlit save reads as a dead gutter.

**Playability pass (2026-07-06):** two player-reported problems, both
measured with an instrumented soak (`scripts/feature-rates.tmp.ts`) before
and after — the coaster/striker "impossible to climb", and the ghost train
walling off the top half.

- **The ramp back walls were snagging their own climbers.** Both the
  coaster lift hill and the high-striker wire completed ~0 rides — not an
  energy stall but the `collision-wall-*-back` throat guards: their
  `data-z-max="22"` band caught a *climbing* rider. A fast climb sweeps up
  through the low-z part of the ramp (ball base z < 22 mm) and CCD snags it
  on the back wall before its height rises clear — so paradoxically the
  faster the shot, the harder it stuck (non-monotonic: 1.8 and 3.5 m/s rode,
  2.6/3.0/4.0/4.5 stalled). Fix: **drop both backs to `data-z-max="10"`**
  (positions unchanged). Only near-ground fallers (a wedged P-column drop
  sits at z≈0) are still blocked; a rider on the bed (z ≥ local height, and
  ≥ ~19 mm within CCD reach of the wall) now passes. A direct-shot probe
  rides at every entry speed 1.8–5.0 m/s; simcheck + soak clean (0 stuck).
  The lift-hill *geometry* was never the problem — it did not need
  reshaping. (Tidebreaker's winch uses the same z-max=22 back; likely the
  same latent snag.)
- **The ghost train is now gated by its turnstile light.** It used to
  capture unconditionally (`kickerLit` always true), so every ball that
  reached mid-field got subwayed to y634 — the "ball grabber" that walled
  off the top half. Now it is **lit at ball start** (one dark-ride before it
  must be re-earned), a ride **consumes** the light, and **relightSpins (3)
  turnstile spins re-open it** (`rules.ghostTrain.relightSpins`). A green
  ghost lamp at the mouth shows the lit state. Consequence: an unlit mouth
  entry rolls back out into play instead of removing the ball, so the player
  keeps the ball live to work the orbit / the now-rideable ramps toward the
  top. Ride-pass qualifier unchanged (one transit still punches it).

**Premise:** a travelling funfair after dark. The tall scrolling playfield
is the midway itself — the park gates and ticket booth at the bottom, the
big rides stacked up the field, the ferris wheel crowning the skyline at
the top. You score by *riding everything*: every major shot is a ride, and
the wizard mode is earned the way a kid earns a perfect day — punch every
ticket on the ride pass, then watch the fireworks.

Third panel of the same-night anthology: Moondial is watching the sky,
Tidebreaker is under the sea, and here the same moon hangs over the top of
the ferris wheel. Where the other two are hushed (observatory calm,
abyssal pressure), Midnight Midway is **loud** — the night table that's lit
up like daytime. Bright, fast, generous with lamps and callouts; the
"cheerful sibling" slot in the lineup.

## 0. IP note (read first)

This is our nearest approach to the DICE originals: Pinball Fantasies
shipped an amusement-park table (Partyland). The *setting* is generic —
funfairs predate pinball — but the execution must share nothing specific:

- **No naming overlap:** nothing called "party", no Cyclone/Comet/Hurricane
  (those are also real Williams machines), no FunHouse (Williams), no
  duck-shoot, no "Mad" ride. "Midnight Midway" checks clean against known
  tables.
- **Original structure:** our ride-pass checklist, ticket/prize-booth
  economy, ferris-wheel bonus ring, and high-striker speed meter are our
  own mechanics, not borrowed rules.
- **Original art/music:** night fair in the house style (dark field, lit
  points), an original tune — nothing referencing Partyland's daytime
  cartoon register.

## 1. The three strata (height without 3D physics)

Standard STYLE-GUIDE §4 layer trick, same as Tidebreaker:

| Stratum | `data-layer` | Fiction | Holds |
|---|---|---|---|
| The Skyline | `1` | coaster track above the crowd | coaster ramp + habitrail circuit |
| The Midway | `0` | the fairground | everything conventional |
| The Ghost Train | `-1` | dark-ride tunnel under the park | ghost-train subway, chicken-exit subway |

## 2. Layout

Playfield `0..520`, plunger lane `520..575` (fiction: **the queue** — the
turnstile lane into the park; launching is getting through the gate).
Asymmetric interior (STYLE-GUIDE §3): flipper jobs are roughly Tidebreaker
mirrored, so the two layered tables shoot opposite-handed.

```
     BELL ────►  ╭─────────────────────────────╮ ╮
   HIGH STRIKER ◄╲   P A R K  rollovers        │ │ plunger
   (speed-meter   ╲╲                           │ │ lane
    lane, climbs   ╲╲    ●   ●   ●             │ │ (the
    to the bell)    ╲╲   bumper cars           │ │ queue)
     FERRIS          ╲╲                ╔═══════╡◄╯ soft plunge
     WHEEL ◎          ╲╲       THE MALLET ◁════╡   = skill shot
   (bonus-X            ╲╲      (upper flipper, │
    lamp ring)          ╲╲___   fed by Sky Ride│
        │   COASTER ▲╲       ╲  + soft plunge) │
        │   (climbs +1,╲ crest→crest           │
        │    left shot)  ╲__________ habitrail │
        │                           ╲ returns  │
        │   ▒▒▒ GHOST TRAIN          ║ right ▼ │
        │   (spinner turnstile,      ║         │
        │    dives −1)   ⊙ PRIZE     ║         │
        │  ┌──────┐        BOOTH     ║         │
        │  │ DROP │      (kickout)   ║         │
        │  │TOWER ▯▯▯ (in right wall face)     │
        ▼  └──────┘                            │
      inlane  ◁ sling      sling ▷    inlane   │
    HAND  │                            │ ┆─────┤
    STAMP │  ╲  left      right  ╱     │ ┆(−1) │
  kickback│   ╲ flipper  flipper╱      │ ┆     │
          outlane                    outlane───╯
                      drain            CHICKEN EXIT
                                       (feeds the queue when lit)
```

Zone by zone (y-ranges indicative — final geometry is set in the SVG under
the per-layer ball-gap invariants):

- **The gates & skyline (y ≈ 0–240).** Full orbit along both walls — **the
  Sky Ride** (chairlift over the park) — plunger feeding into it. Four
  **P-A-R-K** rollover lanes, then the **bumper cars**: three pops styled
  as dodgems in a rubber-ring arena, klaxon SFX, the table's noise-maker.
- **The Ferris Wheel (upper-left, art + lamp ring).** The bonus-X device
  (moon-phase / depth-gauge sibling), rendered as a **circular ring of
  five gondola inserts** instead of a linear ladder. Completing P-A-R-K
  loads one gondola; five loaded = the wheel turns (DMD scene) and the
  bonus multiplier steps. The only round gauge in the lineup — it should
  read from across the room.
- **The Coaster (left-centre entry, layer 0→1).** The signature shot, from
  the **left** flipper (Tidebreaker's ramp is right-flipper — deliberate
  mirror). Climbs to layer 1 and runs a **two-crest** height profile —
  lift hill, drop, second hump — crossing the field to a habitrail down
  the **right** wall into the right inlane. Repeatable flow loop runs
  opposite-handed from Tidebreaker: left flipper → coaster → right inlane
  → left flipper. Each ride banks a ride-pass punch and the DMD plays the
  coaster POV.
- **The Mallet & the High Striker (upper-right, ~(430, 290), layer 0).**
  The table's **third flipper** — fictionally, the high striker's mallet:
  the ball is the puck and you swing the hammer. Mounted on the orbit's
  inner wall, main layer (deliberately *not* a raised platform — that's
  the geometry that killed Tidebreaker's deck). Fed two ways: a Sky Ride
  loop entering from the left orbit drops onto it, and a **soft plunge**
  falls short of the orbit crest straight onto it. At rest the ball rolls
  down its face and continues to the right flipper, so orbit combos still
  flow — flipping intercepts. Its one shot: the **striker lane**, a walled
  diagonal channel over the bumper arena to the **bell in the top-left
  corner**, with **two sensors timing the transit** — the DMD swings the
  hammer and reads `WEAK / FAIR / STRONG / DING!` with scoring to match; a
  DING loads a ferris-wheel gondola instantly. Past the bell the ball
  drops into the P-A-R-K lanes, so a good swing feeds the multiplier flow.
- **The Ghost Train (centre-left mouth, layer 0→−1).** The dark ride: a
  **spinner styled as the turnstile** at the mouth, then the ball drops to
  layer −1 and transits under the drop tower — glimpsed through two
  cut-out windows with green ghost art — before a kicker returns it to
  layer 0. Right-flipper cross-field shot.
- **The Drop Tower (right orbit wall face, ~y 480).** The drop-target bank
  recessed into the wall (Moondial/Tidebreaker's proven housing pattern),
  three targets facing the **left** flipper. The pun is the mechanic:
  completing the bank *drops the tower* and lights the **Prize Booth**
  scoop above it.
- **The gutters.** Standard trapezoid, both outlanes active:
  - **Left outlane — Hand Stamp:** kickback (re-entry stamp on your
    wrist), lit per P-A-R-K completion. One save.
  - **Right outlane — Chicken Exit:** the coaster bail-out path. When lit
    (at the Prize Booth), a layer −1 subway carries the ball under the
    table and **feeds it back to the plunger lane** for a relaunch — the
    only outlane in the lineup that gives the ball back at the gate.
    Unlit, it routes to the drain.

**Flipper roles:** left flipper owns the coaster and the drop tower
(cross-field); right flipper owns the ghost train (cross-field) and the
Sky Ride left-orbit entry (which is also how you reach the mallet);
**the mallet owns the high striker — one flipper, one shot, one swing.**
This division is the layout's identity — preserve it through any geometry
changes.

## 3. Rules skeleton

Same `rules.json` shape as the others (base points + bonus units + combo +
scoop ladder + wizard mode). Values are tuning guesses, not commitments.

- **Skill shot — Test Your Strength at the gate:** a soft plunge drops the
  ball onto the mallet; a first-swing DING scores big and loads a gondola.
  You walk into the park and the first thing you do is swing the hammer.
- **Tickets (bonus units):** every switch earns tickets; end-of-ball bonus
  is *tickets cashed at the prize booth* × the wheel multiplier.
- **Ferris Wheel (bonus multiplier):** P-A-R-K completion (or a high-striker
  DING) loads a gondola; 5 gondolas = wheel turn, bonus-X step
  (2×→3×→4×→5×→6×), gondola ring resets.
- **Sky Ride (orbit combo):** repeat loops inside a 10 s window step the
  combo (max 3) — the chairlift gathering speed.
- **Prize Booth ladder (wrapping, telescope/dive-bell sibling):**
  `PAPER HAT 5,000 → GOLDFISH 10,000 → TEDDY BEAR 15,000 → GIANT PANDA
  25,000`; the PANDA spots one ride-pass punch. A high-striker DING
  upgrades the next prize one rung.
- **The Ride Pass (wizard qualifier):** punch all five —
  coaster ride, ghost-train transit, drop-tower cycle, Sky Ride 3-combo,
  high-striker STRONG-or-better. Punches persist across balls; the DMD
  shows the pass card.
- **FIREWORKS FINALE (wizard mode):** full pass lights the Prize Booth;
  shooting it starts 30 s of all-switches-×2 with the coaster paying
  jackpot value, the full lamp set running a fireworks chase (the M8
  attract-show machinery, in anger), and the DMD playing the finale.
- **Hand Stamp:** kickback, lit per P-A-R-K (one save). **Chicken Exit:**
  lit at the Prize Booth; unlit = drain.

## 4. Palette & style (pending style-guide amendment)

Feature colour: **magenta** — the one unclaimed neon (Moondial owns violet
by way of the global signature, Tidebreaker owns cyan). Cyan appears as
the secondary carnival neon; violet remains the shared logo glow; brass
stays on what the ball touches.

Two *proposed* amendments, to be authored in Claude Design and added to
`tokens.css` + STYLE-GUIDE §2 **before** any playfield art:

1. **Carnival field variant** — a warm plum/dusk cast of the `field` ramp
   (`--carnival-700/800/900`): night sky over sodium-and-neon glow, warmer
   than Moondial's blue-violet, nothing like the abyss teal.
2. **Marquee bulb token** — one warm incandescent white-gold for bulb
   strings, ride marquees, and chase-lamp rows. Not brass (ball-touch
   only), not DMD amber (display-only). This is the token that makes the
   table read as a funfair.

**On "lots of bright neon":** the §1 saturation discipline (≤10% neon)
holds — the park reads bright *because* the field stays dark. Brightness
comes from **many small lit points** — bulb strings tracing every ride
silhouette, chase lamps, insert halos — not from saturated area fills.
Same trick real night fairs use. Art gradient down the table: moon + wheel
against deep sky → ride silhouettes ablaze → the sodium wash of the
midway → ticket booth and gates at the slings.

## 5. DMD scenes (masters in `design/dmd-scenes/`, baked as always)

1. **Coaster POV** — chain-lift climb, pause at the crest, the drop. Worth
   the most frames.
2. **High striker** — hammer swing, puck climbing the tower, meter verdict;
   DING rings the bell.
3. **Ghost train** — tunnel doors bang open, one ghost swoop, doors slam.
4. **Wheel turn** — the ferris wheel rotating one stop, gondola lamps
   filling; doubles as the bonus-X fanfare.
5. **Fireworks finale** — skyline silhouette, three bursts. Also the
   attract-loop closer.

The amber DMD is diegetically the **ticket-booth marquee sign** here.

## 6. Audio direction

ChipMusic brief: **upbeat and major-key, ~160 BPM** — the fastest theme in
the lineup. Fairground organ voice (square waves with vibrato) over an
oom-pah bass, calliope arpeggio runs in the middle eight; a layer of
melodic density is added per ride-pass punch, so the park gets louder as
your day gets better. FIREWORKS FINALE goes double-time with the full
stack. SFX: bumpers = dodgem klaxons at three pitches, spinner =
turnstile ratchet, high striker = rising slide-whistle + bell DING, scoop
= ticket-machine chunk-chunk, kickback = rubber-stamp thump, coaster crest
= whistling drop, tilt = the PA "park is now closing" chime.

## 7. Engine requirements & cut line

**One engine milestone: the third flipper.** This was Tidebreaker §7 item
3, cut with the Raised Deck, so it doesn't exist yet: instantiate a
`Flipper` from **`anchor-flipper-upper`** (the name is already reserved in
STYLE-GUIDE §4), add an upper-flipper action to `Input` (defaults to
sharing the **right** flipper key, remappable in the settings panel), and
let a table's defs declare it optional — Moondial and Tidebreaker simply
have no such anchor. Building it here retroactively cheapens a Tidebreaker
v2 deck. Everything else shipped with M10: collision layers, height
profiles (the two-crest coaster is just a longer polyline), subways,
multiple kickers, lit-gated kickbacks, spinners, per-table songs. The
remaining new logic is table-local in `src/game/midway.ts` (TableLogic):
the striker two-sensor speed timer, the gondola ring, and the ride-pass
checklist.

**Cut line:** if the mallet's feed geometry fights clearance or soak,
fall back to the pre-mallet concept — the striker as a plain right-lane
shot from the lower right flipper, meter intact — and ship the table
two-flippered; the upper flipper then waits for a v2. If the striker
meter itself fights tuning, ship the lane as a lit-lane award and keep
the DMD hammer as flourish. If the two-crest profile causes soak trouble,
flatten to one crest.

## 8. Authoring order & verification

Theme brief (this file) → style-guide/token amendment (carnival field +
marquee bulb) → playfield SVG master → rules.json → DMD scenes →
logo/backglass → `src/game/midway.ts` + `src/table/defs/midway.ts`.
Simcheck + soak after every playfield-SVG edit, as always — the chicken
exit's subway-to-plunger return is a new path shape both scripts must see
as legal (a ball re-entering the queue is not a trap and not OOB).
