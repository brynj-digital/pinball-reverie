# The Sump — Table 6 design brief

**Status: v1 built (2026-07-17).** Table id: `sump`. Engine milestone
**M13 shipped with it**: `TableGeometry.flippers.mini` (a second full
pair on the main left/right actions, `anchor-flipper-mini-*`), and the
per-table envelope proven at 575 × 1250 (STYLE-GUIDE §3 amended). Deltas
from the concept, found during clearance-solving and simcheck/soak:

- **The chute is OFFSET, not centred, and there is no deflector.** The
  concept's centred throat dropped every descent dead-centre through the
  mini tip gap (sump play lasted zero seconds). Three roof-and-shed
  fixes each produced a cap-corner cradle at the delivery point (all
  simcheck-found); the shape that has nowhere to pocket is a chute that
  funnels down-LEFT so descents drop from the mouth (x 160–232) straight
  onto the left mini bat. A short **mouth jamb** sheds right-hugging
  descents (the diagonal wall and the open blade both lean them right)
  back onto the bat, clear of the tip gap.
- **Gate-shut is one continuous slide.** The shut blade runs from the
  chute's left wall to the landing-shelf root (sealed end-to-end); a
  shut ball rides blade → shelf → right void → true drain in a single
  28° slide. The first two-piece wall+shelf corner cradled a ball in
  its V; a 6.6° shelf was too shallow to shed at all (planck static
  friction holds it) — the shelf now runs steep from the jamb root past
  the chamber wall.
- **The valve manifold hangs SEALED under the shelf** (parallel, ~10 mm)
  — an open gap between the two converging faces was a wedge band.
- **Both chamber shoulders are shed-walled**; the sub-27 mm slots between
  caps pass nothing, and every trap drop in the new bottom third
  (throat seams, shed ridges, voids, mouth, shelf) drains clean in the
  suite.
- Suite: 21 sump checks green (settle/orbit/gate-both-ways/mini-flipper
  valve reach/return ride + relight/8 trap drops/level/skill); the
  return ride carries the ball to y 0.61 (the left inlane) and the
  relit gate is proven by the loose ball's second descent.

See `docs/plans/table-differentiation-plan.md` for the plan context.

**Premise:** the storm-drain junction under the same city, on the same
night. Brick culverts, iron ladders, gauge dials, torch beams on wet
stone — and at the very bottom, below where every other table ends, **the
sump chamber**: the lowest point of the whole system, where the pumps
live. Everything the city sheds finds its way down here eventually. The
table's thesis is structural: **the drain is not always death**. When the
floodgate is open, straight down the middle is the way *in*.

Sixth panel of the same-night anthology, and the first to go *under the
streets*: Small Hours plays on the rooftops above this exact city; the
Sump is where its rain-gutters lead. Register: **echoing, patient,
subterranean** — drips, distant pumps, the city's noise arriving as a
murmur through the grates. No rain tonight (the lineup's night is clear —
same moon, glimpsed through grate slots); this is last week's weather
still finding its way down.

## 0. IP note (read first)

- **No close DICE neighbour.** Neither Pinball Dreams nor Pinball
  Fantasies has an underground/drain table (their slots: graveyard, steel
  wheel, beat box, nightmare / party, speed, billion, stones).
- **Mechanical precedent, kept at a distance:** the playable lower
  playfield is a real-machine convention (Gottlieb's *Haunted House* and
  *Black Hole* are the classic examples). The *mechanism* is generic
  pinball vocabulary; the presentation must not echo either machine — no
  haunted register, no space register, no "second cabinet window"
  fiction. Ours is one continuous scrolling field that simply keeps going
  below the floor every other table stops at.
- No sewer-media iconography (nothing mutant, no manhole-cover branding);
  the fiction is civic infrastructure — Victorian brick, enamel signage,
  pump-house engineering. Name check: no known Williams/Bally/Gottlieb
  machine named "The Sump" or close to it.

## 1. Height (M11 strata)

The chamber is NOT a z-stratum — it is plain field at z 0 that lives
*below* the old bottom edge in y. That is the point: the lower playfield
costs no new height machinery at all.

| Stratum | render hint | Fiction | Holds |
|---|---|---|---|
| The gantries | `1` | inspection walkway | one short optional wireform (cuttable) |
| The junction & the chamber | `0` | the drains, upper and lower | everything, including the sump chamber |
| The return pipe | `-1` | the pump outflow | the subway back up from the chamber |

## 2. Layout

**Envelope delta (the first table to change it):** height **1.25** (main
field y 0–1005 as the lineup standard, the throat and chamber occupying
1005–1250). Width/plunger unchanged (0.575, right-hand lane) — this
table spends its whole novelty budget downward. The camera already
follows the lowest live ball; the scroll clamp just gets more table.

```
   ╭──────────────────────────────╮ ╮
   │   S U M P  rollovers (4)     │ │ plunger lane
   │      ● ● ●  (grate bumpers)  │ │ (the access
   │ SLUICE ▯                     │ │  shaft)
   │ (drop  ▯      OUTFLOW orbit  │◄╯
   │  bank) ▯   ⊙ PUMP HOUSE      │
   │              (scoop)         │
   │  water-level gauge inserts   │
   │ ◁ sling            sling ▷   │
   │ inlane               inlane  │
 GRATE                        │   │
 kickback outlane      outlane│   │  ← outlanes pipe PAST the
   │  │                       │   │    chamber to the true drain
   ╰──┤   centre gap          ├───╯
      │  ══ FLOODGATE ══      │       (diverter: shut = drain,
      │   THE THROAT          │        open = the chamber)
      ╔══╧═══════════════╦════╗
      ║  VALVE targets ▯▯▯    ║       THE SUMP CHAMBER
      ║ RETURN PIPE ⊙         ║       (second flipper pair,
      ║   ◁ mini-flippers ▷   ║        same two buttons)
      ╚═══════╡ drain ╞═══════╝  ← the true drain sensor, y ≈ 1230
```

Zone by zone (y indicative, geometry set in the SVG under the gap
invariants):

- **The junction (y ≈ 0–350).** Full orbit — **the Outflow**, the main
  interceptor — with the spinner as the **flow meter** across the left
  orbit lane (breaking the two-table streak of top-right launch-channel
  spinners). Four **S-U-M-P** rollovers under the arc; three **grate
  bumpers** upper-centre.
- **The Sluice (left wall, 3 drop targets).** Recessed in the orbit wall,
  right-flipper cross shot (the airlock/gantry lineage). Sluice down =
  **FLOODGATE lit**.
- **The Pump House (mid-field kickout scoop).** The award ladder (§3) and
  the wizard-mode start. Deliberately NOT at the lineup's shared
  `(272,450)` spot — place it centre-right, ejecting to the **right**
  flipper (the retrofit pass is making eject-hand a per-table choice).
- **The gauge (centreline inserts).** WATER LEVEL 1–5 — the bonus-X
  ladder, advanced by S-U-M-P completions (lane change + persistent
  letters, the proven pattern).
- **The gutters.** Standard trapezoid up top — but the plumbing below is
  new: **outlanes bypass the chamber** through side pipes straight to the
  true drain (outlanes stay fatal; left one has the **GRATE** kickback).
  The **centre gap** is the feature: it feeds THE THROAT.
- **The Throat & the Floodgate (y ≈ 1005–1090).** A walled chute below
  the old drain line. The **FLOODGATE** is a Diverter with two blades:
  *shut* seals the chamber mouth and sheds the ball into the drain
  channel (death, exactly as on every other table); *open* seals the
  drain channel and passes the ball down into the chamber. Unlit
  centre-drains die like they always did — the table only rewrites the
  rule when you've earned it.
- **The Sump Chamber (y ≈ 1090–1230).** A small self-contained field: a
  **second flipper pair** (same left/right buttons — the engine feature
  this table drives), three **VALVE** standing targets across the back
  wall, the **RETURN PIPE** kicker top-left (a Subway back up to the main
  field's left inlane), and its own small centre gap to the true drain.
  No slings, no bumpers down here — tight, quiet, high-stakes.

**Flipper roles (main pair):** left flipper owns the Pump House and the
Outflow entry; right flipper owns the Sluice cross shot. **The chamber
pair owns the valves** — chamber play is close-quarters target work with
the real drain one miss away.

## 3. Rules skeleton

Same `rules.json` shape as the lineup (base points + bonus units + combo
+ scoop ladder + wizard). Values are tuning guesses.

- **Pressure (bonus units):** every switch builds pressure; end-of-ball
  bonus = pressure × WATER LEVEL.
- **WATER LEVEL (bonus X):** S-U-M-P completion raises the level 1→5
  (2×→6×). Level 5 arms HIGH WATER.
- **Outflow combo:** repeat orbits inside the window step the combo, flow
  meter spins score per step.
- **FLOODGATE:** lit by a Sluice completion (relit each time). While lit,
  a centre drain opens the gate — the ball descends to the chamber and
  **SUMP PLAY** begins instead of a ball loss. The gate consumes the
  light.
- **SUMP PLAY:** chamber scoring runs at ×WATER LEVEL. The three VALVE
  targets open the outflow: all three = **RETURN PIPE lit** — riding it
  back up pays the **OUTFLOW award** (escalating ladder), re-lights the
  floodgate at half price, and returns the ball to the left inlane, live.
  Draining the chamber gap is a real drain (ball over). **The pumps:**
  spend more than `pumpS` in the chamber and the pumps spool up (DMD
  warning) — at `floodS` the chamber floods and the return pipe
  auto-ejects the ball at a reduced award (kind to players, and a
  built-in anti-stall guarantee for soak).
- **Pump House ladder (wrapping):** `GAUGE → GREASE → OVERHAUL →
  MASTER VALVE` — the top rung spots a valve in the next sump play and
  lights the skill-shot lane.
- **HIGH WATER (wizard):** WATER LEVEL 5 + two OUTFLOW rides + the ladder
  top; start at the Pump House. For `wizardS` the floodgate LOCKS OPEN —
  every centre drain is a second chance, all scores ×2, full lamp chase.
  The city's water table wins in the end; the mode drains the level back
  to 1.
- **THE GRATE:** left-outlane kickback, lit per S-U-M-P completion.

## 4. Palette & style (style-guide amendment required at build)

Feature colour: **flood-warning red** — a NEW neon pair (`--red-400/600`,
to be added to the guide with this table): gauge needles past the line,
the floodgate OPEN sign, valve inserts. Red is the natural sixth family —
the colour of warning lamps in dark infrastructure — and the lineup has
never had it (claimed: violet/cyan/magenta/green/amber). Discipline: red
is *lit warning signage only* — never blood, never gore, and never
substituting for brass or bulb warmth.

**Culvert field variant** (`--culvert-700/800/900`, walls `-500/300`):
wet brick and cast iron — a green-black slate, darker and cooler than the
abyss (which is blue-black open water; this is enclosed masonry). ≤10%
neon discipline holds; brightness is torch pools, gauge glass, and the
grate-slot moonlight.

Art gradient down the table: grate slots and street light bleeding in at
the top → brick junction arches and pipe runs mid-field → the gauge wall
and pump house at the slings → below the throat, the chamber in its own
pool of work-lamp light. Same moon, seen in slices through the grates.

## 5. DMD scenes (masters in `design/dmd-scenes/`, baked as always)

1. **gauge** — the water-level needle climbs past graduations, quivers.
   Level advances; the table's idle personality.
2. **gate** — the floodgate wheel spins, the gate grinds open, water
   pours through the frame. FLOODGATE lit / sump entry.
3. **valve** — a hand-wheel turns, a bolt of flow bursts along a pipe
   diagram. Valve hits; all three = the diagram lights end to end.
4. **outflow** — the ball silhouette rides the pipe up and out, arcing
   back into the field. OUTFLOW award.
5. **pumps** — pistons hammering, the frame flooding bottom-up. The
   chamber flood warning.
6. **highwater** — the whole junction cross-section fills, needles all
   past red, then the pumps win and it drains. Wizard start/end; attract
   closer.

## 6. Audio direction

ChipMusic brief: **~92 BPM, straight time, dub-spaced** — the lineup's
most reverberant song (long echo on the lead, huge gaps): "Under the
City". A deep pulse bass like distant pumps, a sparse lead that answers
itself in echo; the chorus doubles the pulse when the floodgate opens;
the breather is drips — near-silence with a triangle plink. SUMP PLAY
swaps to a tight, close variant (the echo dies — you're in a small
room); HIGH WATER stacks everything over hammering pistons. SFX: bumpers
= grate clangs, spinner = flow-meter whirr, scoop = a wrench on pipe,
valves = squeaking hand-wheels, floodgate = a grinding rumble + rush,
return pipe = pressurized whoosh, kickback = the grate slamming, tilt =
a dropped tool ringing on stone.

## 7. Engine requirements & cut line

This table drives **M13**. In build order:

1. **Second lower flipper pair** — THE feature. `TableGeometry.flippers`
   grows an optional `sump?: { left: Pt; right: Pt }` pair (or the field
   generalizes to a list), driven by the *same* left/right input actions
   as the main pair; Game, simcheck and soak drive all flippers present.
   Same `FLIPPER` hardware constants — no new feel to approve. Cut line:
   a single centred chamber flipper before the seam slips.
2. **Envelope depth** — `height` is already per-table data; the work is
   auditing the few places 1.05 leaks assumptions (camera scroll clamp,
   `cameraViewH` vs the deeper table, OOB margins, DMD layout — expected
   small). The drain sensor is SVG-authored, so "the drain moves to
   y ≈ 1230" is a design fact, not an engine change.
3. **Floodgate = Diverter reuse** — two blades, one of them routing
   *into* the chamber. Blade-swap deferral (live-ball overlap) already
   exists. Cut line: if diverter blades misbehave in the chute, a
   Kicker-gated mouth (capture → drop or eject) is the fallback.
4. **Return pipe = Subway reuse** — exits to the left inlane (Night
   Waves' side door proved the pattern). The captive-guard rule (drain
   ignored while a subway holds the ball) already covers the pipe
   crossing the drain zone.
5. **Camera** — follow logic is y-based and multi-ball-aware already;
   verify the clamp and view height against the deeper field.

**No new z machinery, no new entities.** If the chamber traps in soak,
it widens under the standard gap rules before anything structural moves;
if gate-open descents starve in feature-rates, the floodgate lights on
any bank completion, not just the Sluice.

## 8. Authoring order & verification

Theme brief (this file) → style-guide/token amendment (culvert field +
flood red) → M13 engine seams (flipper pair, envelope audit) behind
entcheck/simcheck → playfield SVG master → rules.json → defs + logic →
DMD scenes → backglass → registration → simcheck suite. Simcheck + soak
after every SVG edit, as always. Instrumented `feature-rates` numbers
that make or break this table: **gate-open descent rate** (how often a
lit gate actually gets used), **chamber exit rate** (return-pipe rides
vs chamber drains vs pump auto-ejects), and **time-in-chamber
distribution** (the pumps timer must fire rarely in real play — it is a
safety net, not a mechanic).
