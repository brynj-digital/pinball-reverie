# Table differentiation plan

**Status: proposed (2026-07-16), not yet scheduled.** Companion briefs:
`design/tables/{sump,glasshouse,summit,thunderhead}/BRIEF.md`. This plan
covers (A) a **retrofit pass** giving each built table a structural
differentiator, and (B) **tables 6–9**, each of which breaks one piece
of the lineup's shared skeleton and drives one engine milestone
(M13–M15 + a gated backlog item) — the pattern every table so far has
followed. When work is scheduled, add the milestone entries to
`docs/plans/pinball-build-plan.md` §8 and update CLAUDE.md; this file
is the working plan, not a second source of truth.

## 1. The problem (audit of 2026-07-16)

An anchor-by-anchor comparison of the five playfield SVGs and defs
found the sameness is real and concentrated exactly where the player
looks most:

- **The bottom third of tables 2–5 is byte-identical**: same sling
  vertex set, same guide walls (x 52/470), same left-shell deflector,
  same formula (left outlane = kickback, right outlane = subway).
- **Every table**: exactly 3 bumpers (r 0.028) in an upper cluster,
  exactly 3 drop targets in a straight wall bank, one spinner, four
  top rollovers (Moondial: three).
- **The scoop sits at the same spot** `(272,450)` in Tidebreaker,
  Night Mail and Small Hours — and **every scoop in the lineup ejects
  to the left flipper**.
- Night Mail and Small Hours share the identical tilted spinner at
  `(487,177)`.
- **Every launch is identical**: right lane, full plunge, top arch, no
  skill shot anywhere.
- The orbit shell path is byte-identical in all five files.

The toys differ genuinely (lift, magnet, diverter, coaster, aerial
run) — but toys live in the mid-field. The launch, the bumper nest and
the flipper/sling/outlane zone are one table wearing five outfits.

**Key finding:** almost none of this is engine constraint. The envelope
(`width/height/laneWallX/laneTopY/spawn`) is per-table data; sling
verts, bumper count/radius, bank size, kicker positions and eject
vectors are per-table defs; the drain sensor is SVG-authored. The
sameness is copy-paste convention. Two real engine assumptions exist:
the shooter-lane predicate is right-handed (`p.x > laneWallX`, one
predicate in Game + camera), and flippers come as exactly
left/right/upper.

## 2. Principles

1. **One skeleton-break per table.** Each table (existing or new) gets
   ONE structural identity move, stated in its brief. Piling several
   into one table dilutes all of them and multiplies soak risk.
2. **The bottom third is where sameness is felt** — retrofits and new
   tables should bias their identity budget toward launch, gutters,
   slings and flipper approach, not more mid-field toys.
3. **Flipper feel is player-approved and stays untouched.** Same
   `FLIPPER` hardware constants everywhere; differentiation happens
   around the flippers, never in them. (Thunderhead's stagger is the
   one exception, and it sits behind an explicit feel-approval gate.)
4. **Verification per the feature-difficulty rule**: every placement
   change ships with before/after instrumented `feature-rates` soak
   numbers, plus the standard simcheck + soak (all seeds) after any
   SVG edit. New feeds expose latent traps — assume every retrofit
   will find one.
5. **Convention where it serves, divergence where it's felt.** The
   shared kit exists because it was proven safe; don't diverge for
   divergence's sake in trap-prone geometry (outlane throats), do
   diverge in identity-bearing geometry (sling shape, eject hands,
   scoop spots, skill shots).

## 3. Phase 0 — seams & guardrails (small, do first)

| # | Task | Size | Notes |
|---|---|---|---|
| 0.1 | **Confirm per-kicker eject vector.** CLAUDE.md says speed is `tuning.kickerEject`; kickbacks already eject up while scoops eject to the left flipper, so direction should be per-def — verify, and if any part is global, add a per-kicker override. Retrofits 1.4/1.5 and all new tables assume it. | S | entcheck |
| 0.2 | **Inert diverter blade.** The gnomon (1.1) and the floodgate (M13) want a Diverter where one "blade" is effectively absent. Blade paths are arbitrary SVG, so an off-field sliver inside a wall should already work — prove it in entcheck rather than discovering it in soak. | S | entcheck |
| 0.3 | **`TableLogic.slingBoost?()` hook** (optional multiplier on sling kick impulse, polled like `kickerLit`/`diverterBlade`). Wanted by 1.5 (Small Hours' TUNED slings); trivially ignored by other tables. | S | entcheck + simcheck |
| 0.4 | **Skill-shot pattern note in STYLE-GUIDE §4**: a `sensor-skill-<id>` band partway up the shooter lane, awarded by TableLogic on a soft plunge that peaks inside it. Pure SVG + rules — no engine change; the guide entry is so five tables author it consistently. | S | docs |
| 0.5 | **"No copy-paste kit" authoring rule in STYLE-GUIDE §4**: new tables must diverge sling verts, scoop positions and eject hands from the existing set unless a brief argues otherwise. Codifies the lesson so table 10 doesn't regress. | S | docs |

## 4. Phase 1 — the retrofit pass (one PR per table)

Each item: SVG/defs/rules edit → simcheck → soak (standard seeds) →
instrumented feature-rates before/after → brief amended with the delta
(the house convention). No engine work beyond Phase 0. Suggested order
is cheapest-first so the verification muscle warms up before Midway's
heavy item.

### 1.1 Moondial — THE GNOMON (+ skill shot)
A retractable post between the flipper tips — the sundial's gnomon,
risen when its shadow matters: while the ball-saver is live and during
LUNAR ECLIPSE. Implemented as a Diverter reuse (blades: `up` = the
post, `down` = inert sliver per 0.2); blade-swap deferral already
handles a ball sitting on it. **Deliberately not static:** the
flipper-tip gap is ~40 mm, and a permanent post would leave ~15 mm side
gaps — inside the 13.5–38 wedge band. The soak item is exactly those
side gaps during up-phases; if they wedge, the post slims/repositions
before the feature is cut. Also: `sensor-skill-firstlight` in the
shooter lane — a soft plunge pays FIRST LIGHT and spots a moon-lane
letter. *Moondial keeps its unique symmetric funnel bottom — the
retrofit adds identity without importing the other tables' kit.*

### 1.2 Tidebreaker — PRESSURE SLINGS + L-O-C-K
(a) Bespoke sling geometry: longer, lower-angled slings with a deeper
kick vector — the pressure hull flexing. First table off the shared
vertex set; pure defs + SVG. (b) The airlock grows to a 4-target
L-O-C-K bank (rules: completions per 4; `DropTargetsDef.targets` is
already a list). (c) Skill shot: soft plunge drops into the gutter
subway mouth = SOUNDING award. Feature-rates: airlock completion rate
before/after (4 targets is ~33% more work — the award ladder may need
rebalancing), sling-induced outlane rate (deeper kicks must not feed
the outlanes).

### 1.3 Midway — THE DODGEMS
Replace the standard 3×r0.028 nest with **five r0.022 dodgem bumpers**
scattered across the arena the striker wire crosses — the lineup's
"always 3 bumpers" rule broken where the fiction begs for it. Pure
defs + SVG + rules (dodgem values). **The heavy verification item:**
the P-A-R-K feed rains through this exact region (see the brief's feed
rework), the striker throat sits above it, and the ghost-train mouth
is adjacent — full feature-rates on P-A-R-K completions, striker
grades, and ghost entries before/after, plus extra soak seeds. Budget
for one found trap.

### 1.4 Night Mail — right-hand eject (+ skill shot)
Move the sorting scoop off the shared `(272,450)` spot (toward
`(330,470)`, clear of the disc) and eject to the **right** flipper —
the lineup's first right-hand scoop return, re-mapping the table's
shot flow from the scoop (the M-A-I-L windows and exchange lane are
left-flipper-favoured; a right-hand return makes the post-scoop choice
real). Skill shot: a soft plunge holds at THE SIGNAL
(`sensor-skill-signal`) = spot a timetable letter. Feature-rates:
sorting-ladder progression rate, exchange-snag rate from the new
return hand.

### 1.5 Small Hours — TUNED slings + phone move (+ skill shot)
(a) `slingBoost` (0.3): while TUNED the slings kick ~1.15× — the
monitors are up; the studio is live. Rules-side flavour with real
feel. (b) The phone scoop moves off the shared spot toward the deck
(~`(300,480)`); **keeps its left eject** — the brief's left-hand/right-
hand station division is designed and stays. (c) Skill shot: soft
plunge = a LISTENERS bundle. The Dial spinner does NOT move (identity:
every launch rips it) — Night Mail's spinner context differs enough
once its scoop flow changes. Feature-rates: phone ladder rate,
switchboard capture rate (the move shifts mid-field traffic past the
capture zone), and the brief's standing W-A-V-E watch item.

### 1.6 Lineup close-out
Amend all five briefs with deltas; update
`docs/tuning/current-defaults.md` if any tuning value moved; run the
full suite (`simcheck` all tables, `soak` all seeds × tables,
`entcheck`). Ship the STYLE-GUIDE amendments (0.4/0.5) with this pass.

## 5. Phase 2 — M13: The Sump (table 6)

The lower-playfield table — the drain itself becomes the feature. Full
design in `design/tables/sump/BRIEF.md`. Engine scope (details in the
brief §7): **second lower flipper pair** on the same input actions
(`flippers.sump?` or generalize to a list — decide at implementation;
sims drive all flippers present), **envelope-depth audit** (height
1.25; camera clamp, `cameraViewH`, OOB margins, DMD layout), floodgate
= Diverter reuse, return pipe = Subway reuse. No new entities, no new
z machinery. Size: **L** (the flipper seam touches Game, Input wiring,
both renderers' flipper draw paths, simcheck and soak). Exit criteria:
entcheck case for the second pair; gate-descent/chamber-exit/dwell
feature-rates per the brief; soak proves the chamber (a new enclosed
space = the highest trap surface since the striker throat).

## 6. Phase 3 — M14: Glasshouse (table 7)

The widebody with the left-hand launch and four return lanes. Full
design in `design/tables/glasshouse/BRIEF.md`. Engine scope (brief
§7): `table.plungerSide: 'left'|'right'` routed through one
shooter-lane helper (Game + camera predicates, plunger visuals, sim
spawn assumptions), width audit (0.660; camera width-binding exists,
check panel layout and hardcoded 0.575s). Double inlanes, the 5-bank
and the roving lamp are data/SVG/logic only. Size: **M**. The brief's
cut line stands: if the left-lane seam balloons, ship the widebody
right-handed and land the mirror in a follow-up — width is the bigger
felt change. Exit criteria: vine-run speed sweep, outer-inlane feed
rates, lit-lamp hit rate.

## 7. Phase 4 — M15: Summit (table 8)

The playable elevated platform — a flipper and furniture at height.
Full design in `design/tables/summit/BRIEF.md`. Engine scope (brief
§7): **z-banded flipper contacts** through the existing `contactApplies`
gate (the one genuinely new behaviour — entcheck grows a synthetic
platform-flipper case first), grounded Lift release variant, sensor
z-bands as-is. Standard envelope. Size: **M** (small seam, delicate
authoring). Exit criteria: Terrace dwell-time distribution, Launch-vs-
dribble rate, cable-car ride rate.

## 8. Backlog — Thunderhead (table 9, gated)

Bumperless + magnet chaos + staggered flippers. Full design in
`design/tables/thunderhead/BRIEF.md`. **Hard gate before any art or
guide amendment:** a grey-box staggered-funnel prototype with explicit
player sign-off on flipper feel (the Milestone-1 bar). Fallback if the
stagger fails: level flippers, keep bumperless + charge cells. Not
scheduled; revisit after M15 ships.

## 9. Sequencing & rationale

```
Phase 0 (seams, ~days)
  → Phase 1 (retrofits, one PR per table, cheapest→heaviest: 1.1 → 1.2 → 1.4 → 1.5 → 1.3)
    → Phase 2  M13 The Sump      (L — the biggest felt payoff: "the gutters are all the same" answered head-on)
      → Phase 3  M14 Glasshouse  (M — envelope/mirror; independent of M13, can swap with it if scheduling prefers)
        → Phase 4  M15 Summit    (M — smallest seam, most delicate authoring; benefits from M13/M14 soak lessons)
          → gate → Thunderhead
```

Retrofits go first because they raise felt variety across the *whole*
lineup for near-zero engine risk, and because their verification runs
re-baseline every table's feature-rates — the numbers the new tables
will be judged against. The Sump leads the new tables because it
attacks the exact complaint that started this plan (the identical
bottom third) at its root. Each new table keeps the one-milestone-per-
table pattern, so an engine seam is never built speculatively — it
ships inside the table that needs it, verified by that table's suite.

## 10. Risks & watch items

- **The gnomon wedge band (1.1)** — the known-shaky retrofit; the
  retractable design exists *because* the static post fails the gap
  rule. If up-phase soak wedges, slim/reposition before cutting.
- **Dodgem fallout (1.3)** — five bodies in the lineup's most
  feed-sensitive region. Highest found-trap probability in Phase 1;
  scheduled last within the phase for that reason.
- **Second-pair flipper seam (M13)** — touches the render seam both
  sides; keep `Renderer` interface changes additive (extra flippers in
  the snapshot, like `extraBalls`) so 2D/3D stay in lockstep.
- **Left-plunger blast radius (M14)** — the audit may find more baked
  right-handedness than the known predicates (attract lamp show, nudge
  direction defaults, DMD side-panel layout). The right-handed-widebody
  cut line caps the risk.
- **Sanctuary scoring (M15)** — a safe platform with no drain risk can
  degenerate into optimal camping; the dwell-time feature-rate is a
  design gate, not just a health check.
- **Anthology coherence** — one clear moonlit night lineup-wide: the
  Sump keeps its water as last week's rain, Thunderhead keeps its
  storm offshore. Any art that puts weather over the city breaks the
  shared-night fiction; the briefs each carry the constraint.
