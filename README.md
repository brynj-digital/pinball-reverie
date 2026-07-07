# Pinball Reverie

A browser-based retro pinball game in the spirit of the classic Amiga/DOS pinball era: tall
vertically-scrolling playfields, realistic planar physics (Planck.js at a fixed 120 Hz step), a
128×32 amber dot-matrix display for score and event animations, and original chiptune audio.
Three original tables ship in the lineup: **Moondial**, **Tidebreaker**, and **Midnight Midway**.

```
npm install
npm run dev      # Vite dev server
npm run build    # typecheck + bundle
```

## Playing

Every game is 3 balls. Sensors on the playfield feed an event bus that drives scoring, the DMD,
lamps, and audio. High scores are kept per table (enter your initials with the flippers, confirm
with the plunger).

| Action | Default keys |
|---|---|
| Left flipper | Left Shift, Z |
| Right flipper | Right Shift, / |
| Upper flipper (Midway's mallet) | shares the right flipper keys |
| Plunger (hold to charge) | Space, ↓ |
| Start game | Enter |
| Nudge left / right / up | ← / → / ↑ |
| Settings overlay | Esc |

All keys are remappable in the settings overlay. Nudging is real — too much of it trips the
**TILT**, which mutes all scoring for the rest of the ball and forfeits the accrued bonus. A
short **ball saver** returns an instantly-drained ball.

### Bonus system (all tables)

Lanes, targets, and spinner ticks accrue **bonus units** during the ball
(lane 500 / target 250 / spinner tick 10). At end of ball the bonus pays out
**units × the bonus multiplier**. Each table raises the multiplier its own way (see below);
tilting forfeits the bonus.

### Base switch values

All three tables share the same base awards, read from each table's `rules.json`:

| Switch | Points |
|---|---|
| Pop bumper | 100 |
| Slingshot | 50 |
| Rollover lane | 500 |
| Spinner (per tick) | 100 |
| Drop / standup target | 500 |
| Target bank complete | 5,000 |
| Full orbit | 2,500 (Moondial) / 3,000 (Tidebreaker, Midway) |

---

## Table 1 — Moondial

*A night observatory. Chart the sky, light the eclipse.*

| Feature | What it does |
|---|---|
| **Moon lanes** (3 rollovers) | Light all three to step the bonus multiplier (+1, max ×5). Lit lanes reset when the ball drains. |
| **Orbit** (with spinner) | 2,500 pts. Consecutive orbits inside a 10 s window combo ×2 per step, up to ×4 (2,500 → 5,000 → 10,000). Orbits also count toward the eclipse. |
| **Comet drop-target bank** | Completing the bank pays 5,000 and counts toward the eclipse. |
| **Telescope scoop** (kickout) | Captures the ball for the observation, then awards the next *sighting* in the logbook, wrapping: **COMET** 5,000 → **METEOR SHOWER** 10,000 → **NEBULA** 15,000 → **SUPERNOVA** 25,000. Each sighting adds 500 bonus units; the SUPERNOVA also spots one orbit toward the eclipse. Sighting progress persists across balls. |
| **LUNAR ECLIPSE** (wizard mode) | Complete the bank **2×** and shoot **3 orbits** to light it — the next orbit starts 25 seconds of **all scores ×2** with 25,000-point orbit jackpots. Ends with the ball. |

## Table 2 — Tidebreaker

*An abyssal salvage dive. Ride the current, raise the motherlode, wake the beast.*

| Feature | What it does |
|---|---|
| **D-I-V-E lanes** (depth gauge) | Complete all four to descend one stage: 100M → 300M → 600M → 1000M → **TRENCH FLOOR**. The bonus multiplier tracks the stage (max ×5) and every completion lights the **ESCAPE HATCH** kickback (left outlane, one save). Depth persists across balls. |
| **THE CURRENT** (full orbit) | 3,000 pts; loops inside a 10 s window combo ×2 per step up to ×4 (3,000 → 6,000 → 12,000). |
| **Winch ramp + habitrail** | Ride the ramp up and around the wireform circuit (the spinner is the reel): 3,000 pts + 250 bonus units. |
| **Trench subway** | The under-field transit from the trench mouth to the dive bell: 2,500 pts + 500 bonus units. |
| **Dive bell scoop** (kickout) | Awards the next *salvage haul*, wrapping: **BRASS COMPASS** 5,000 → **CARGO CRATE** 10,000 → **CAPTAINS SAFE** 15,000 → **THE MOTHERLODE** 25,000 (+500 bonus units each). Every capture lights the **TRENCH GUTTER** (right-outlane subway that saves the ball back to the hatch). The MOTHERLODE also counts as an airlock cycle. |
| **Airlock bank** | Drop-target bank recessed in the orbit wall — a right-flipper cross shot. 5,000 per cycle; cycles feed LEVIATHAN. |
| **LEVIATHAN** (wizard mode) | Reach **TRENCH FLOOR** and cycle the airlock **2×** to light it — the next Current starts 25 seconds of **all scores ×2** with 25,000-point Current jackpots. Ends with the ball. |

## Table 3 — Midnight Midway

*A funfair after dark. Punch your ride pass; stay for the fireworks.* This table adds the
engine's **third flipper** — THE MALLET, upper right — which owns the High Striker shot.

| Feature | What it does |
|---|---|
| **P-A-R-K lanes** (4 rollovers) | Complete the set to load a ferris-wheel gondola and light the **HAND STAMP** kickback (left outlane, one save). Collected letters survive the drain, and any flipper press rotates them across the lanes (*lane change*), so a repeatable feed can finish the set. |
| **FERRIS WHEEL** (bonus multiplier) | 5 gondolas fill the ring — loaded by P-A-R-K completions, striker DINGs, and the GIANT PANDA. A full wheel turns: the bonus multiplier steps (+1, max ×6) and the ring resets. |
| **SKY RIDE** (full orbit) | 3,000 pts; loops inside a 10 s window combo ×2 per step up to ×4. A 3-loop chain punches the ride pass. |
| **HIGH STRIKER** (mallet shot) | Swing the mallet to send the ball up the wire lane toward the bell. Timing gates grade the swing: **DING!** 10,000 (loads a gondola) / **STRONG** 5,000 / **FAIR** 2,000, +250 bonus units; rolling back without ringing anything is a **WEAK** swing for 500. STRONG or better punches the ride pass. |
| **COASTER** | Left-flipper wireform circuit over the field: 3,000 pts + 250 bonus units, punches the pass. During the finale it pays the jackpot instead. |
| **GHOST TRAIN** | Under-field subway behind the turnstile spinner: 2,500 pts + 500 bonus units, punches the pass. |
| **DROP TOWER bank** | Recessed in the lane wall — a left-flipper cross shot. Completing it pays 5,000, lights the PRIZE BOOTH, and punches the pass. |
| **PRIZE BOOTH scoop** (lit by the tower) | Awards the next *prize*, wrapping: **PAPER HAT** 5,000 → **GOLDFISH** 10,000 → **TEDDY BEAR** 15,000 → **GIANT PANDA** 25,000 (+500 bonus units). Every prize lights the **CHICKEN EXIT** (right-outlane subway back to the plunger lane); the PANDA also loads a gondola. |
| **RIDE PASS → FIREWORKS FINALE** (wizard mode) | Punch all five rides — coaster, ghost train, drop tower, Sky Ride chain, striker STRONG+ (punches persist across balls) — to light the booth for the finale. Shooting it starts 30 seconds of **all scores ×2** with 25,000-point coaster jackpots. Ends with the ball. |

---

## Rendering: 2D and 3D

Both renderers sit behind the same `Renderer` interface and read the same physics state — you
can switch at any time from the settings overlay (Esc → **Renderer**) without restarting.

- **2D CLASSIC** (default) — plain Canvas 2D with a scrolling camera, in the style of the
  originals. This is the reference renderer and loads nothing extra.
- **3D (BETA)** — a Three.js scene, lazy-loaded as its own chunk (2D players never download
  it). The playfield SVG textures the table plane, the collision geometry is extruded into real
  walls, ramps and wireforms are built in true height, and the DMD/backglass move to a side
  panel. Physics stays identical — the 3D view is a different camera on the same game.
- **3D camera** — within 3D mode, toggle between **TILTED** (perspective, over-the-shoulder)
  and **TOP-DOWN** (orthographic classic view).
- **Render scale** — a resolution slider (0.5–1×) for paint-bound machines, applies to both
  renderers.

The renderer choice, 3D camera, and table selection all persist in `localStorage` across
sessions.

## Settings overlay (Esc)

The game pauses while it's open. It holds: SFX / music volumes, render scale, table select,
the 2D/3D renderer and 3D camera toggles, full key remapping, and the **Physics tuning**
show/hide toggle (below).

### Physics tuning panel (dev tool)

The physics tuning panel — sliders for every feel constant (table slope, flipper torque,
restitution, kicker eject speed, …) plus the physics-body debug overlay — is **hidden by
default**. It can only be summoned from the settings overlay: Esc → **Physics tuning** →
SHOWN. Its visibility persists separately from the tuning values, so resetting tuning to
defaults never pops the panel open.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run simcheck [table]` | Headless physics smoke test (all tables by default) — run after any physics or playfield-SVG change |
| `npm run soak [seed] [table]` | Randomized 10-minute play simulation that flags ball traps and out-of-bounds escapes |

Each table's shape truth is its `design/tables/<id>/playfield.svg` (collision walls, sensors,
anchors, and height profiles are parsed from named layers); scoring and mode parameters live in
`design/tables/<id>/rules.json` — code carries no scoring numbers. The global art style guide
is `design/STYLE-GUIDE.md`, and the build plan at `docs/plans/pinball-build-plan.md` is the
source of truth for architecture decisions.
