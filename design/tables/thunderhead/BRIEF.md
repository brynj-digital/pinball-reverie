# Thunderhead — Table 9 design brief (backlog)

**Status: GREY-BOX PROTOTYPE BUILT (2026-07-17) — awaiting the §7.1
feel sign-off.** The gate build exists on every machine-checkable axis
(see §9); master art, the style-guide amendment (storm yellow + stratus
field) and the final audio mix stay gated until the player plays the
stagger and signs it off. If the stagger fails the feel test, the
documented fallback stands: level flippers, everything else kept.

**Original gate note (2026-07-16):**
Table id: `thunderhead`. This is the lineup's riskiest structural
experiment — **staggered flippers** graze the player-approved flipper
feel — so it sits behind a mandatory prototype gate (see §7 and
`docs/plans/table-differentiation-plan.md`). Written now so the idea is
banked at full strength; build it only after the retrofit pass and
tables 6–8 prove out.

**Premise:** a storm-watch airship holding station above a huge
offshore thunderhead, on the same clear night — the storm is *out at
sea, below and beyond*; the city's sky stays clean and the anthology's
moon rides above the envelope. The playfield is the ship: gondola and
instruments at the flippers, the gas envelope and rigging mid-field,
and the boiling cloud-top far below at the head of the table (the
scrolling field looks *down* past the bow into the storm). You score by
riding the weather without being eaten by it.

Register: **charged, humming, electric** — the anthology's one
loud-weather panel, kept offshore so the shared night survives.

## 0. IP note (read first)

- **No close DICE neighbour** (no storm/aviation table in Pinball
  Dreams or Pinball Fantasies; *Ignition* is a rocket launch — no
  shared imagery, and nothing here is a countdown or a launchpad).
- **Real-machine distance — the one to watch: Williams' *Whirlwind*.**
  A storm table whose signatures are spinning playfield discs, a
  cabinet fan, and tornado-over-farmland imagery. Keep hard distance:
  **no Disc entity on this table at all** (its chaos engine is magnets,
  which Whirlwind never had), no tornado — a marine thunderhead seen
  from above — no fans, no farmland, and no "wind alley" naming.
  *Cyclone*/*Hurricane* (the Williams trilogy kin) are coaster/carnival
  tables — Midway already keeps that distance and we inherit it.
- The airship is an invented vessel: no real airship names or liveries
  (nothing near historical Zeppelin marks), no real meteorological
  service branding. Name check: no known machine named "Thunderhead".

## 1. Height (M11 strata)

| Stratum | render hint | Fiction | Holds |
|---|---|---|---|
| The rigging | `1` | up the envelope's flank | one spine wireform |
| The deck | `0` | the gondola deck | everything conventional |
| The keel | `-1` | inside the hull | one subway |

## 2. Layout — what this table refuses to have

Envelope: lineup standard. The differentiation is *subtraction plus
asymmetry*:

- **ZERO pop bumpers.** The first (and only) bumperless table. The
  chaos engine is **two CHARGE CELLS** — Magnets (M12, the mail hook's
  machinery) mid-field where a bumper nest would sit. A charged cell
  *grabs* a passing ball, holds a beat, and **flings** it (capture →
  hold → fling, the proven cycle) in a rules-chosen direction. Bumper
  chaos is dumb and constant; magnet chaos is scarce, earned, and
  aimed — the table feels fundamentally different at the exact spot
  every other table feels the same.
- **STAGGERED FLIPPERS.** Left flipper high (y ≈ 0.92), right flipper
  low (y ≈ 0.96), the deck listing to starboard. Funnel walls, slings
  and inlanes re-derive around the stagger under the standard gap
  invariants — same `FLIPPER` hardware, same coils, but every cradle,
  pass and post transfer plays differently by hand. This is the risk
  item (§7).

```
   ╭──────────────────────────────╮ ╮
   │   G A L E  rollovers (4)     │ │ plunger
   │   (the cloud-top below       │ │ lane (the
   │    the bow — no bumpers)     │ │ mooring
   │  ⌁ CHARGE CELL   CELL ⌁      │ │ line)
   │    (magnets — the storm      │◄╯
   │     comes aboard when lit)   │
   │ ═ SPINE RUN (rigging, 1) ═   │
   │ BALLAST ▯      ⊙ THE NACELLE │
   │ (drop   ▯        (scoop)     │
   │  bank)  ▯   VANE spinner     │
   │  ◁ sling (high)              │
   │ inlane          sling ▷ (low)│
   │  │                  inlane   │
 STATIC                      │    │
 kickback outlane     outlane│    │ ← KEEL subway (−1)
   ╰──┴──────── drain ───────┴────╯
```

- **The cloud-top (y ≈ 0–150).** Full orbit — **the Circuit**, riding
  the storm's rim — four **G-A-L-E** rollovers; the **VANE** spinner
  sits mid-right across the nacelle approach.
- **THE CHARGE CELLS (2 magnets, upper-mid, where bumpers would be).**
  Dormant until charged (§3). A charged cell grabs any ground ball in
  range and flings it — toward the lit shot if the STORM ROUTE is
  running, otherwise outward (chaos with intent).
- **SPINE RUN (the rigging surface).** Left-flipper climb up the
  envelope's flank, airborne release over the cells — the safe way
  *past* the storm when both cells are hot.
- **BALLAST bank (left wall, 3 drop targets).** Dropping all three
  sheds ballast: the ship climbs — `ballastS` of ×2 scoring and both
  outlanes' saves lit (the whole table rides higher, briefly).
- **THE NACELLE (scoop, centre-right, ejects RIGHT).** Award ladder,
  video mode (LIGHTNING WATCH — call the strike quadrant, holdScoop
  pattern), wizard start.
- **The gutters.** Standard trapezoid re-derived around the stagger;
  left outlane **STATIC** kickback; right outlane **KEEL** subway to
  the plunger lane.

## 3. Rules skeleton (compressed — backlog depth)

- **CHARGE:** vane spins + G-A-L-E completions build charge; at
  `cellCharge` a cell lights. Cell flings score and step the **STORM
  ROUTE** (a lit-shot chain: cell → spine → circuit → nacelle); chain
  completions bank **STRIKES**.
- **BONUS X** via G-A-L-E (lane change, persistent letters, the
  standard ladder shape). Bonus units are **BAROGRAPH INCHES**.
- **LIGHTNING WATCH (video mode):** at the nacelle — strikes flash
  quadrants, flippers call where the next one lands.
- **SQUALL (multiball):** `strikesForSquall` strikes → 3-ball; during
  it BOTH cells run continuously (the storm aboard); cell-fling
  jackpots, double at the spine.
- **THE EYE (wizard):** cross into the storm's eye — dead calm,
  everything lit, cells hold-and-place instead of fling (the storm
  *helping* — 30 s of the table playing on your side).

## 4. Palette & style (style-guide amendment required at build)

Feature colour: **storm yellow** (`--yellow-400/600`) — lightning,
charge arcs, the barograph line. First yellow in the lineup; keep it
electric-cold (toward white) so it never drifts into transmitter
amber's sodium warmth — the discipline note the amber family already
carries, applied from the other side. **Stratus field variant**
(`--stratus-700/800/900`): moonlit cloud-deck grey-violet, the only
field variant that is a *surface of weather* rather than ground.

## 5–6. DMD & audio (sketch)

Scenes: **barograph** (the needle jags — idle), **charge** (arc climbs
between pylons), **strike** (frame whites out from one quadrant),
**squall** (rain bands cross, looped), **eye** (the clouds open on
calm — wizard; attract closer). ChipMusic: **~140 BPM**, the lineup's
fastest — "Riding the Cell": driving arpeggio bass, storm-siren lead,
the breather is the eye (near-silence, one held tone); SFX are hums,
arcs, canvas thunder, and the magnet fling as a rising zap.

## 7. Engine requirements & THE GATE

1. **Staggered flippers** — pure per-table data (`flippers.left/right`
   are independent `Pt`s already) BUT it re-opens flipper *feel*:
   cradle geometry, post passes, and the funnel all change. **Gate:
   before any art, build a grey-box staggered-funnel prototype (defs +
   bare SVG), tune it in the debug panel, and get explicit player
   sign-off on feel** — the same bar Milestone 1 set. If the stagger
   never feels right, the table falls back to level flippers and keeps
   everything else (bumperless + cells still carry the identity).
2. **Bumperless** — trivially data (empty `bumpers` list); verify
   nothing assumes a non-empty nest (simcheck, attract lamp show,
   rules.json shapes).
3. **Charge cells = Magnet reuse** — capture/hold/fling exists;
   *directed* fling (toward a lit shot) is a small vector parameter on
   the release, entcheck-verified.
4. **No Disc** (IP distance, §0). Everything else is standard kit.

## 8. Authoring order & verification

**Prototype gate first** (§7.1) — before the style-guide amendment,
before any master art. Then the standard order. Feature-rates
make-or-break numbers: **cell engagement rate** (a chaos engine that
never engages is a dead centre-field — the magnet's 34 mm-vs-50 mm
lesson from the Night Mail applies doubly with two cells), **storm
route completion rate**, and — above all — **drain-rate delta vs the
lineup** (staggered flippers + no bumpers changes ball-time
materially; soak must show game length in family with the other
tables before art is committed).

## 9. Grey-box build record (2026-07-17, v0 deltas)

Built to the letter of §7–8 except where the sims forced changes — all
simcheck/soak-found, standard trap classes:

- **The stagger, exactly:** left bat (178, 920), right (342, 950) — x
  pulled in 7 mm a side so the resting tip gap across the diagonal stays
  ~39 mm (the lineup's proven drain-gap invariant, preserved by
  construction). Cradle-on-raised-bat, honest-centre-drain and both-hand
  funnel checks are suite-asserted.
- **Directed fling is an engine seam:** `Magnet.flingDir`, set per frame
  from `TableLogic.magnetFling` (Game + both sims), entcheck-proven. The
  fling aims at the BAT that makes the next route shot — a straight line
  at the shot itself crossed the spine rails (simcheck-found).
- **Left-wall geometry took four passes** (the soak story, §8's predicted
  risk): (1) the ballast housing pinched the outlane throat to 23 mm and
  its face + guide-cap formed a wedge pocket; (2) a big channel deflector
  wedged balls against the orbit wall's bottom cap; (3) the deflector +
  housing merged into one continuous shed wall (face x 30, targets proud
  at x 40 — they were buried INSIDE the wall at x 8.5 as first drawn);
  (4) the spine's west rail ends early at y ≈ 628 — its mouth-end cap +
  sling vertex was a seed-9 wedge (the smallhours mouth lesson).
- **The kickback fed itself:** STATIC's first firing mouth (50, 645) sat
  beside the ballast targets — every fire completed the bank, which
  relit the kickback: a 295-capture perpetual-motion loop in the rates
  harness. The mouth now sits at (44, 775), just above the guide top.
- **STATIC starts lit each ball** (consumed on use, relit with the keel
  by ballast) — the drain-family lever. Without it the left outlane ate
  every circuit return.
- **Crest windows over G-A-L-E lanes 2/3** (the glasshouse fix): lanes
  fed from below only ran 0/600 s; with circuit riders dropping through
  the two arc windows they run ~3 completions/600 s across seeds.
- **Charge retuned for engagement:** cellCharge 14 → 8, laneCharge 4.
  Cells engage ~4/600 s in random soak — scarce and earned per §2; the
  storm route stays an aimed economy.

**Feature-rates (seed 1, 600 s):** 141 launches / 46 drains (lineup
family 109–146 / 43–60 — IN FAMILY; soak seeds 5/9: 44/53 drains, 0
stuck). G-A-L-E 38 hits, 3 completions. Cells 4 engagements. Nacelle 5,
keel 6, spine pays, skill fires. Zero bumpers throughout — nothing in
the engine assumed a nest.
