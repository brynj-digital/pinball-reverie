# The Night Mail — Table 4 design brief

**Status: v1 built (2026-07-16); differentiation pass 2026-07-17.**
`playfield.svg` + `rules.json` + `src/table/defs/nightmail.ts` +
`src/game/nightmail.ts` are now the specifics; this brief remains the
design intent. Table id: `nightmail`.

Differentiation pass (2026-07-17, plan item 1.4):

- **The sorting office ejects RIGHT** — the lineup's only right-hand
  scoop return: left-flipper feed in, right-flipper ball out, an
  alternating-hands loop (`eject (0.12, 0.99)`, threading the incline-left
  wall by ~10 mm; simcheck lands it on the right bat at x 0.300).
- **The planned relocation was tried and ABANDONED** (plan said move to
  ~(330,470)): that spot sits under the incline's carry corridor, and the
  wall-hung alternative (Moondial's telescope housing) has no clean feed
  here — the incline corridor blocks the left-flipper diagonal, and the
  right-inlane throat (x 436–450 between sling edge and guide) is too
  narrow for any single-impulse eject to thread (the ballistic spread
  ratio ≥ 1.3 over the throat's height vs the 1.365 the corridor allows —
  and Slingshot kicks on ANY face contact, so grazing the sling's
  vertical edge misfires the kick). The eject hand alone re-maps the
  flow; position stays.
- **THE SIGNAL** — the skill shot (STYLE-GUIDE §4): `sensor-skill-signal`
  y 440–500, ≤ 0.75 m/s pays 15,000 + one spotted timetable letter, once
  per ball ("held at the signal" — the fiction writes itself).

Deltas from the concept, found during clearance-solving and
simcheck/soak/feature-rates:

- **The points mouth funnels through divider-1.** The branch mouth (the
  orbit arc between (151,98) and (100,148), closed by the MAIN blade) sheds
  fast balls anywhere across the top-left, so the exchange-lane inner wall
  became a FUNNEL hanging off divider-1's foot: everything through the
  mouth — blade-deflected or sprayed via the M lane — rolls down its face
  onto the lane. Consequence: the M lane feeds by lane-change and branch
  spray only (its bottom mouth is sealed by the funnel).
- **The signal levers are the points control.** The brief's dedicated
  signal-lever standing target became the gantry itself: every drop-target
  hit throws the points, a full bank lights LOCK. One shot, two jobs.
- **The spinner spans the whole top-right channel** (~100 mm) — the launch
  hugs the shell, and a narrow mid-channel wire missed it entirely.
- **The siding is a virtual lock v1** (kicker clunk-and-release, wagons on
  the DMD); DEPARTURE is REAL 3-ball multiball in the game (M12 engine —
  extras served down the exchange lane), single-ball frenzy in the
  headless sims (no addBalls there, by design).
- **The M-A-I-L windows (playability pass, 2026-07-16).** The instrumented
  soak found the middle lanes starved (A/I = 0 direct hits in 600 s — the
  bumper cluster shields them from below), so the orbit arc opened over
  them, Midway's crest-window pattern — with a twist found the hard way: a
  FULL window swallowed every Main Line orbit (45 → 6 completions; the
  ball needs the inner wall's support exactly at the apex, where it is
  slowest). Shipped shape: an **apex cover** with two ~41–44 mm flank
  mouths over A and I. After: all four lanes feed (7–19 hits each across
  seeds), 2–5 lane-set completions per 600 s, Express recovers to 36 full
  orbits, and the aimed express (simcheck, 2.0–3.4 m/s) always completes.
  The incline's summit drop now often falls into a lane — an emergent
  middle-lane feed, kept.
- **The magnet's field is 34 mm, not 50** — the pull has no wall
  occlusion, and at 50 mm it reached THROUGH the orbit wall and dragged
  climbing Main-Line balls to a stall (the express-killer the suite
  caught). 34 mm spans the exchange lane exactly.
- **Physical locks (2026-07-16):** coupled wagons really park — the siding
  transfers the held ball to a visible berth on the siding apron
  (x 150, y 362/330, stacked up-table beside the lane so the through-lane
  never blocks) and a fresh ball serves to the plunger; DEPARTURE releases
  the parked wagons as the multiball, topping up with served extras for
  virtual couplings (SIGNAL BOX wagons). Locks persist across balls,
  clear at game end. The sims keep the virtual clunk-and-release path.
- **The points defer swaps around balls:** with multiball, a blade could
  be created inside a second ball at the summit — `Diverter.setBlade` now
  skips the swap while any live ball overlaps the incoming blade and
  retries next frame (the STYLE-GUIDE §4 authoring caution, enforced).
- **Parked wagons are contact ghosts (playtest-found, 2026-07-16):** a
  SOLID parked lock ball formed a stable two-contact cradle against the
  exchange wall and trapped a live ball on top of it — a failure class
  the ball-gap rules can't see (one contact is a ball, and berth tuning
  can't remove it anywhere near furniture). Locked balls now collide with
  nothing (rendered at 0.8 alpha so a pass-through reads as intended) and
  resolidify the instant DEPARTURE releases them. The incline track also
  now builds in the 3D renderer (layer-1 profiles without data-surface —
  a lift is a carry, not a rideable surface), and the signal-wire spinner
  carries `tilt` so its bar lies across the diagonal channel in both
  renderers.

**Premise:** an overnight mail train runs a single dark line from the city
terminus up over the moors to make the dawn connection. The tall scrolling
playfield *is* the route — the departure platform and roundhouse at the
bottom, the goods yard and summit junction at the top, the stations ticking
past on the gauge as you play. You score by keeping the mails moving:
snagging pouches on the fly, coupling wagons, clearing signals. The drain is
missing the connection.

Fourth panel of the same-night anthology: Moondial watches the sky,
Tidebreaker is under the sea, Midnight Midway is lit up like daytime — and
the Night Mail crosses the dark country between them, the same moon over
the moor. Register: **quiet but relentless** — not Moondial's hush or the
Midway's noise; the table that never stops moving. Rhythm is the identity:
the music, the gauge, and the shots all run on the timetable.

This is the **feature-engine table**: it exists to earn multiball, the
diverter, the magnet, the rotating disc, the scripted lift, and DMD video
modes — each with a diegetic job, each with a cut line (§7). Two flippers,
deliberately: after Midway's mallet, this table's identity is **the points,
not another bat** — the same shot means different things depending on how
the junction is set.

## 0. IP note (read first)

- **Nearest DICE neighbour: Pinball Dreams' *Steel Wheel*** (steam-era
  railroad). The distance to keep: theirs is the American frontier —
  daylight, desert, gold-rush register. Ours is a nocturnal institutional
  mail run — timetables, signal boxes, sorting on the move. No shared
  names: nothing called "steel", "wheel", "express", "cannonball", or
  "iron horse" (several are also real Williams/Bally/Gottlieb machines).
  "The Night Mail" checks clean against known tables.
- **The 1936 GPO film / Auden poem:** "night mail" is the generic English
  term for the train and predates both. Quote **no** poem text, copy no
  film imagery; no real insignia (no GPO, no Royal Mail, no real liveries
  or route names). All station names are invented (§3).
- **Original structure:** the points economy, exchange snag, coupling
  locks, station timetable, and signal-box video mode are our own
  mechanics, not borrowed rules.

## 1. Height (M11 surfaces — no layer system)

True-height table per plan §7a / STYLE-GUIDE §4: surfaces and subways, no
layer switches. Render hints only:

| Stratum | render hint | Fiction | Holds |
|---|---|---|---|
| The Viaduct | `1` | rack track above the field | incline lift track, summit approach |
| The Line | `0` | the playfield | everything conventional |
| The Tunnels | `-1` | under the moor | loop-line subway |

## 2. Layout

Playfield `0..520`, plunger lane `520..575` (fiction: **Platform 1** — the
departure road; launching is pulling out of the terminus). Asymmetric
interior (STYLE-GUIDE §3): the two flippers reach the summit two different
ways, which is what makes the table shoot differently from all three
predecessors.

```
      THE SUMMIT ───► ╭──────────────────────────────╮ ╮
      ✕ THE POINTS    │    M A I L  rollovers        │ │ plunger
     (diverter: MAIN ◄│   ●    ●    ●  goods yard    │ │ lane
      ▼ = orbit down, │                  ╔═══════════╡ │ (Platform 1)
      BRANCH ▶ = the  │                  ║ COUPLING  │◄╯ soft plunge =
      exchange line)  │                  ║ SIDING    │   exchange skill
         ▲            │                  ║ (locks ●●)│   shot
      INCLINE track   │ EXCHANGE LINE    ▼           │
     (banking engine  │ ═══◉═══► mail-hook magnet    │
      lift — captures,│                              │
      climbs slow,    │          ⊙ SORTING OFFICE    │
      releases at the │ ┌──────┐   (kickout scoop)   │
      points)         │ │SIGNAL│                     │
         ▲            │ │GANTRY▯▯▯ (in left wall,    │
         │            │ └──────┘  right-flipper shot)│
         │        ◎ TURNTABLE (roundhouse disc)      │
       inlane   ◁ sling      sling ▷     inlane      │
     THE   │                             │ ┆──(−1)───┤
    BANKER │  ╲  left       right  ╱     │ ┆ LOOP    │
   kickback│   ╲ flipper   flipper╱      │ ┆ LINE    │
           outlane                     outlane───────╯
                       drain             (lit: subway to the
                                          turntable; unlit: drain)
```

Zone by zone (y-ranges indicative — final geometry is set in the SVG under
the ball-gap invariants):

- **The yard & the summit (y ≈ 0–240).** Full orbit along both walls — **the
  Main Line** — plunger feeding into it, a **spinner at the right-orbit
  entry** (the signal wire — ripping it is running the distants at speed).
  Four **M-A-I-L** rollovers, then three **goods-yard buffer** bumpers.
- **The Points (top-left crest — the diverter).** The table's brain: one
  gate at the summit that every arrival passes through, set MAIN or BRANCH.
  A lit **signal-lever standing target** (mid-field) toggles it; twin
  green/white lamps at the crest show the setting from across the room.
  MAIN routes the ball down the left orbit to the right inlane (the flow
  loop); BRANCH tips it onto the Exchange Line. *One summit, two shots —
  the points decide which one you just made.*
- **The Incline (left-centre foot, right-flipper cross shot — the lift).**
  The slow way up: the foot station captures the ball, the **banking
  engine** couples on behind and pushes it up the visible rack track — a
  scripted carrier transit, z climbing the whole way, rendered as
  wireform-and-glass viaduct per the guide — releasing it through the
  Points at walking pace. A slow arrival is *readable*: you can set the
  lever while the banker climbs. The engine's first vertical lift (§7).
- **The Exchange Line (mid-field straight — the BRANCH destination).** The
  lineside apparatus: the ball runs the straight past the **mail-hook
  magnet** at its middle. EXCHANGE lit (spinner spins): the magnet snags
  the ball *at speed*, holds a beat — DMD plays the pouch-snatch — then
  flings it at the Sorting Office. Unlit, the ball runs through and sheds
  onto the upper right field. Fast MAIN-line orbits are worth more snags:
  speed is the point of the shot.
- **The Coupling Siding (upper-right, behind the goods yard — the locks).**
  When LOCK is lit (signal gantry completed), the siding gate opens and a
  BRANCH ball rolls in and **stays there** — a physical lock, wagon
  coupled, visible in the siding. Two wagons coupled + a third BRANCH
  arrival = **DEPARTURE multiball** (§3).
- **The Sorting Office (mid-right kickout scoop).** The TPO carriage: the
  award ladder (§3), the video-mode start, and the Loop Line light. Fed by
  the magnet fling and directly from the **left** flipper.
- **The Signal Gantry (left wall face, ~y 480).** The 3-target drop bank
  recessed into the orbit wall's field face (Tidebreaker's proven housing,
  same hand), faces right — an intentional **right-flipper cross-field
  shot**. Three targets = three signals pulled off; a completed bank
  lights LOCK at the siding.
- **The Turntable (lower-centre, ~ø70 mm — the roundhouse).** A flush
  rotating disc imparting tangential velocity to anything crossing it.
  Still in normal play; **spins during DEPARTURE and while THE CONNECTION
  runs** — the mid-field goes chaotic exactly when the stakes are highest.
  Also the Loop Line's return: the subway ejects the ball up through the
  roundhouse, onto the spinning disc.
- **The gutters.** Standard trapezoid, both outlanes active:
  - **Left outlane — THE BANKER:** kickback (the banking engine shoves you
    back into the game), lit per M-A-I-L completion. One save.
  - **Right outlane — THE LOOP LINE:** when lit (at the Sorting Office), a
    subway dives under the moor and returns the ball to play **through the
    turntable** — mid-field re-entry, the only outlane in the lineup that
    puts the ball back above the flippers. Unlit, it routes to the drain.

**Flipper roles:** the **left flipper owns the express** — the right-orbit
Main Line entry (the fast way to the summit) and the Sorting Office
(cross-field); the **right flipper owns the climb** — the incline foot and
the signal gantry (both cross-field). Two ways to the same summit, one set
of points deciding what arrival means. This division is the layout's
identity — preserve it through any geometry changes.

**Skill shot — catch the mail at departure:** a soft plunge falls short of
the crest onto the Exchange Line at low speed; if the player has lit
EXCHANGE with the launch-day free light (first ball only), the snag scores
big and lights LOCK instantly. Full plunge = Main Line orbit as usual.

## 3. Rules skeleton

Same `rules.json` shape as the others (base points + bonus units + combo +
scoop ladder + wizard mode). Values are tuning guesses, not commitments.

- **Sacks (bonus units):** every switch bags mail; end-of-ball bonus is
  *sacks sorted* × the station multiplier.
- **The Timetable (bonus multiplier — depth-gauge/ferris-wheel sibling):**
  M-A-I-L completion advances one station down the centreline insert run —
  `KETTLEBECK → MARROWMOOR → COLDFELL SUMMIT → GLASSWATER → TERMINUS` —
  each a bonus-X step (2×→3×→4×→5×→6×). Flipper lane-change on the
  rollovers, letters persist across balls (Midway's proven pattern).
- **Express Run (orbit combo):** repeat Main Line loops inside a 10 s
  window step the combo (max 3), each loop faster music and a bigger snag
  value — the mail running to time.
- **The Exchange:** N spinner spins light EXCHANGE (one snag). Each snag
  scores `snagValue` × Express combo and spots a Sorting Office rung.
- **Sorting Office ladder (wrapping, telescope/dive-bell/prize-booth
  sibling):** `POSTCARD 5,000 → LETTER BUNDLE 10,000 → PARCEL 15,000 →
  STRONGBOX 25,000`; the STRONGBOX spots one timetable station. Every
  second STRONGBOX lights **SIGNAL BOX** (video mode).
- **SIGNAL BOX (DMD video mode):** the scoop holds the ball; on the DMD a
  train runs left-to-right through a junction ladder and the **flippers
  pull the levers** — set each set of points before the train reaches it,
  miss and it's a dead end. 5 junctions cleared = jackpot + a coupled
  wagon. Runs on the DmdQueue at top priority; ball ejects on completion.
- **DEPARTURE (multiball):** signal gantry completed lights LOCK; a BRANCH
  ball with LOCK lit couples a wagon (physical hold in the siding). Two
  wagons + a third BRANCH arrival = the full consist departs: 3-ball
  multiball, turntable spinning. Jackpot at the summit — the Points
  **auto-toggle on every jackpot**, so the shot alternates orbit/branch;
  double jackpot for back-to-back arrivals both ways. Locked wagons
  persist across balls; DEPARTURE can be relit once per game.
- **THE CONNECTION (wizard mode):** qualify by reaching TERMINUS, starting
  one DEPARTURE, and making one Exchange snag (the DMD shows the waybill
  card, Midway-ride-pass style). Shooting the lit Sorting Office starts
  30 s: all switches ×2, turntable spinning, the summit pays jackpot with
  the points auto-toggling, full lamp set running a signal-lamp chase.
  The mails go through; the DMD plays the dawn platform meet.
- **THE BANKER:** kickback, lit per M-A-I-L (one save). **THE LOOP LINE:**
  lit at the Sorting Office; unlit = drain.
- **Match sequence (game-flow, all tables):** after game over, the DMD
  departure board flaps through platform numbers and matches the last two
  digits of each player's score — a match awards a free game. Ships with
  this table but lives in `Game`, not table logic.

## 4. Palette & style (pending style-guide amendment)

Feature colour: **green** — the neon family's last unclaimed hue
(`--green-400/600`), read here as **signal green**: points lamps, insert
arrows, the lit-lane run. Happy accident: the default M11 ramp-glass
dayglo is the same family, so the incline's viaduct glass matches the
table's colour for free. Magenta/cyan stay out except as tiny lamp
accents; violet remains the shared logo glow; brass on what the ball
touches (flippers, the magnet cap, the banker's buffer beam); `--alert-400`
is the danger aspect (signals at red, tilt).

Two *proposed* amendments, to be authored in Claude Design and added to
`tokens.css` + STYLE-GUIDE §2 **before** any playfield art:

1. **Smoke field variant** — a cold iron/soot cast of the `field` ramp
   (`--smoke-700/800/900`, plus `--smoke-500/300` wall analogs): coal
   smoke and wet slate under moonlight — greener-black than Moondial's
   blue-violet, colder than the carnival plum, nothing like the abyss teal.
2. **Bulb-token scope note** — reuse `--bulb-200/400` for the platform gas
   lamps and carriage windows (one line extending the marquee-bulb rule;
   no new hex).

Art gradient down the table: the moon over the summit and the moor →
signal gantries and the lit goods yard → the exchange apparatus mid-field
→ the terminus canopy, platform lamps and the roundhouse at the slings.
≤10% neon discipline holds (this is a quiet table); brightness is gas
lamps, signal aspects, and the lit carriage windows of the train itself.

## 5. DMD scenes (masters in `design/dmd-scenes/`, baked as always)

1. **Departure board** — split-flap letters cycling and settling; the idle
   score surround and every station advance. The DMD is diegetically
   **the platform departure board** here — the flap cycle is its whole
   personality.
2. **The snag** — lineside apparatus POV: hook out, pouch snatched at
   speed, whip-crack. For every Exchange.
3. **Coupling** — buffer-view slam, chain drops, `WAGON 2 COUPLED`. Locks
   and DEPARTURE start.
4. **Tunnel run** — rails-POV rush into a tunnel mouth, lamp strobe.
   Express combos and the Loop Line.
5. **The dawn connection** — two headlamps converge on one platform, steam
   clears, the guard's flag. THE CONNECTION; worth the most frames. Also
   the attract-loop closer.
6. **SIGNAL BOX** — the video-mode scene set: lever frame, junction
   ladder, the little train. Interactive frames, not a strip (§7 item 6).

## 6. Audio direction

ChipMusic brief: **~132 BPM, driving 12/8** — wheel-clack ostinato bass
(the rhythm IS the train), a lonely two-note whistle motif (bent square
lead) over it. A rhythmic density layer per timetable station, so the
train audibly gathers speed as the night goes on; DEPARTURE adds the full
stack; THE CONNECTION goes double-time and resolves the whistle motif
major. SFX: bumpers = buffer clanks at three pitches, spinner = signal
wire pulley, scoop = mail-chute thunk, magnet snag = zip + pouch whump,
coupling = iron CLUNK, turntable = low bearing rumble while spinning,
kickback = steam blast, points = mechanical ka-CHUNK (the most important
sound on the table — the player must *hear* the setting change), tilt =
emergency brake screech + the guard's whistle.

## 7. Engine requirements & cut line

**Status 2026-07-16: ALL SEVEN features are BUILT** (M12 engine track).
1–4: `src/entities/Diverter.ts`, `Lift.ts`, `Magnet.ts`, `Disc.ts` (SVG
contract in STYLE-GUIDE §4; `npm run entcheck` verifies them in a
synthetic world). 5: real engine multiball — per-ball fixture tags,
per-contact height gating, per-ball capture/drain/OOB, camera follows the
lowest live ball, extras rendered in both renderers; served via
`TableLogicCtx.addBalls` (DEPARTURE releases 2 extras; the headless sims
have no addBalls, so modes stay verifiable single-ball). 6: the Kicker
extended-hold seam (`beginExtendedHold`/`release` via
`TableLogicCtx.holdScoop`) + the timer-driven SIGNAL BOX scene pattern in
`src/game/nightmail.ts`. 7: the match sequence (`MatchScene` +
`Game.makeMatchScene`, all tables, both game-over paths).

This is the feature milestone the table exists to earn. In build order,
each independently cuttable:

1. **Diverter** (Tidebreaker §7 item 4, still unbuilt) — one gate entity,
   open/closed by table logic, drawn from an `anchor-diverter-*` +
   collision pair in the SVG. **Load-bearing: the Points ARE the table.**
   Cut line: two adjacent permanent mouths with a lit-lane selector — the
   fiction survives as "which road is signalled", the geometry stops
   moving.
2. **Scripted lift** — generalize `Subway`'s scripted transit to carriers
   with `z > 0`: capture at the foot, constant-speed traverse along a
   drawn profile, release at the top (the ball is *held*, like a kicker,
   so the drain/OOB guards already apply). Cut line: the incline becomes
   a normal M11 climbing surface — steeper art, same summit.
3. **Magnet** — a point entity applying radial force inside a small
   capture radius, with hold-then-impulse (snag = grab, beat, fling
   vector). Planar physics makes this cheap; the render is a brass cap
   and a lamp. Cut line: a capture kicker with the same fiction (the
   snag reads identically; only the mid-flight grab is lost).
4. **Rotating disc** — a floor patch giving contacting balls tangential
   surface velocity (`applyForces`-shaped, like the surface gradient).
   Cut line: art + a lamp chase; the Loop Line ejects from a plain hole.
5. **Multiball** — the big one: N bullet balls each with its own
   `HeightState`, physical locks (held balls in the siding), drain logic
   that counts balls instead of ending the ball, ball-saver semantics per
   ball, DMD jackpot flow — and **the camera policy, which is the real
   design risk on a scrolling table**: follow the lowest live ball
   (danger-first), snap on drains. simcheck/soak must track every ball
   (traps and OOB per ball, locks are legal holds). Cut line: virtual
   locks first (kicker swallows, DMD shows the consist); if multiball
   itself fights the camera or the sims, DEPARTURE ships as a single-ball
   30 s frenzy and the siding holds one ball for show.
6. **DMD video mode framework** — a `DmdScene` variant that reads `Input`
   while a kicker holds the ball, top of the DmdQueue, resumable by
   eject. Pure garnish: cut freely to a static award.
7. **Match sequence** — table-agnostic `Game` flow after game over; the
   departure-board scene is this table's skin for it. Trivially separable.

**No third flipper** — deliberate (§0 of the layout identity). If the
Exchange Line's clearances fight the ball-gap rules against the siding
gate, the straight moves down-table and the siding is fed by its own
BRANCH spur; if the turntable + slings interact badly in soak, the disc
shrinks or moves up-field before it gets cut.

## 8. Authoring order & verification

Theme brief (this file) → style-guide/token amendment (smoke field + bulb
scope) → engine features 1–4 (§7, testable on a dev fork of an existing
table) → playfield SVG master → rules.json → DMD scenes → logo/backglass →
`src/game/nightmail.ts` + `src/table/defs/nightmail.ts` → features 5–7.
Simcheck + soak after every playfield-SVG edit, as always — both must
learn multiball (per-ball trap/OOB tracking, locks and lift-carries are
legal holds, the Loop Line's drain-zone crossing uses the existing
captive-ball guard). Per the feature-difficulty rule: run an instrumented
`feature-rates` soak once geometry exists and after every placement change
— the incline completion rate, snag rate at speed, and BRANCH-arrival rate
with LOCK lit are this table's make-or-break numbers.
