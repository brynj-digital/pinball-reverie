# Retro Pinball Clone — Build Plan

A browser-based pinball game in the spirit of **Pinball Fantasies / Pinball Dreams** (DICE, 1992) and **Obsession**: vertically-scrolling single-table view, "could-be-real" tables (no video-game-only gimmicks), realistic physics, chip-music soundtrack, and an LED/dot-matrix score display. **All visuals — table, ball, DMD, backglass, UI — are authored in Claude Design** (see §5).

---

## 1. Design pillars (taken from the reference games)

- **Tall scrolling playfield.** DICE's key trick: the table is several screens tall; the camera scrolls vertically to follow the ball rather than fitting the whole table on one screen. This is what makes it feel like a real cabinet. Build for this from day one — the table is a world taller than the viewport.
- **Plausible tables.** Ramps, combos, drop targets, bumpers, spinners, kickers, light sequences — nothing that couldn't exist in a physical machine. Keeps the retro authenticity.
- **Realistic physics + tilt/nudge.** Accurate flipper feel, restitution, nudging the table with a tilt penalty if overused.
- **Four-table structure** (long-term), each with a theme + its own chip track. Start with one.
- **LED dot-matrix display** at the top for score, multipliers, and animated sequences.
- **All visuals authored in Claude Design** from one global style guide — table, ball, DMD, backglass, UI — kept as editable SVG masters.

---

## 2. Tech stack

Since the brief is HTML/canvas with a path to 3D and an animated score display, the cleanest split is **physics engine ↔ renderer**, so the renderer can be swapped from 2D canvas to WebGL/3D later without touching the game logic.

| Layer | Choice | Why |
|---|---|---|
| Physics | **Planck.js** (Box2D port) | Most accurate 2D dynamics — proper restitution, friction, revolute joints for flippers, continuous collision so a fast ball doesn't tunnel through thin walls. Box2D is the lineage real pinball sims use. Matter.js is friendlier but tunnels more with fast small bodies (the exact pinball failure case). |
| Renderer (v1) | **2D Canvas** (or PixiJS for WebGL-accelerated 2D) | Fast to build, retro look. PixiJS buys you GPU sprites + a clean upgrade path. |
| Renderer (v2 / 3D) | **Three.js** | Same physics world, camera and meshes rendered in 3D. See §7. |
| Audio | **Web Audio API** + a tracker player | Chip music + low-latency SFX. See §6. |
| Build | Vite | Fast, simple, ES modules. |

**Decoupling rule:** game state lives in the Planck world (positions, velocities, sensor events). The renderer only *reads* that state each frame. This is the single most important architectural decision for the "make it 3D later" requirement.

> Note on your stack: this is a self-contained client-side game, so it's vanilla TS/JS rather than Laravel/Vue. If you want a wrapper (high-score API, table loader, accounts), that's where Laravel fits — a thin JSON API the game calls. Flagging so the boundary is deliberate.

---

## 3. Architecture

```
/src
  /core
    Game.ts            // main loop, fixed-timestep, state machine (attract→play→ballsaver→gameover)
    PhysicsWorld.ts    // Planck world, fixed step, contact listener → event bus
    Camera.ts          // vertical scroll following the ball, clamps to table bounds
    EventBus.ts        // physics/sensor events → scoring, audio, effects, DMD
  /entities
    Ball.ts  Flipper.ts  Bumper.ts  Slingshot.ts  DropTarget.ts
    Ramp.ts  Spinner.ts  Kicker.ts  Plunger.ts  Drain.ts
  /table
    Table.ts           // loads table SVG (art + collision layers, see §5e) + JSON rules → bodies + render data
    SvgCollision.ts    // parses named SVG paths → Planck fixtures (build step or load-time)
    tables/partyland.svg + partyland.rules.json
  /render
    Renderer2D.ts      // canvas/Pixi implementation of a Renderer interface
    Renderer3D.ts      // (later) three.js implementation of same interface
    Effects.ts         // in-world juice: flashes, ball trail, screen shake
    /dmd
      DotMatrix.ts     // the LED/dot-matrix display surface + LED shader
      DmdScene.ts      // one animated sequence (live frames or baked Claude Design art)
      DmdQueue.ts      // event → scene, priority, interrupts
      /scenes          // event animations authored in Claude Design, baked to frames
  /audio
    AudioEngine.ts     // Web Audio graph, SFX bus, music bus
    ChipMusic.ts       // tracker/synth playback
  /game
    Scoring.ts  Modes.ts  Multiball.ts  Tilt.ts  HighScores.ts
```

**The `Renderer` interface** is the seam:
```ts
interface Renderer {
  init(table: TableData): void;
  drawFrame(world: WorldSnapshot, camera: Camera): void;
  spawnEffect(kind: EffectKind, x: number, y: number): void;
}
```
2D today, 3D tomorrow — `Game` never knows which it's talking to.

---

## 4. Physics specifics (where pinball projects usually go wrong)

- **Fixed timestep.** Step Planck at a fixed `1/120s` (sub-step the render at 60fps). Variable timesteps make flippers and bounces inconsistent.
- **Continuous collision detection (CCD).** Mark the ball as a *bullet* body so it can't tunnel through thin ramp/wall fixtures at high speed. This is the #1 pinball bug.
- **Flippers = revolute joints** with motor + angle limits. Tap input enables the motor toward the up-stop with high torque; release reverses to the down-stop. Tune `maxMotorTorque`, restitution, and a slightly elevated flipper-tip restitution for satisfying "snap".
- **Table slope simulated as gravity.** A real table is angled ~6.5°. Model as constant downward gravity in table-space; expose slope as a tunable to match the reference feel.
- **Sensors, not solids, for scoring zones.** Ramps, rollovers, spinners use sensor fixtures emitting begin-contact events to the EventBus.
- **Nudge / tilt.** Arrow/space nudge applies a brief impulse to the ball + shakes the camera; a tilt-bob counter trips "TILT" and disables flippers if abused.
- **Units.** Box2D likes 0.1–10m bodies. Work in meters internally (ball ≈ 0.027m), scale to pixels only at render time. Don't simulate in pixels.

---

## 4.5 Input & viewport

Decisions the code *and* the Claude Design style guide both depend on, so they're locked before any art is authored.

**Input:**
- **Keyboard (primary):** Left/Right Shift (or Z / `/`) for flippers; Down or Space held-and-released for the plunger (hold time = launch power); arrow keys for nudge left/right/up; Enter/Esc for start/menu. All remappable in settings.
- **Touch (mobile):** left/right half of the screen = flippers; a plunger drag zone bottom-right; swipe for nudge. Touch changes the UI layout, so the style guide must include the touch overlay from day one — retrofitting it later breaks the visual system.
- Input feeds a small `Input.ts` mapping layer → game commands, so keyboard/touch/gamepad are interchangeable (gamepad is nearly free via the Gamepad API — worth adding, pinball is great on triggers).

**Viewport:** the reference games are tall portrait tables; browsers are usually landscape. The layout rule:
- **Portrait (mobile) —** classic layout: DMD strip at the top, table below, exactly like the originals.
- **Landscape (desktop) —** table occupies a tall centred column at native aspect; the spare width becomes side panels: DMD + score on one side, ball/mode/tilt status on the other (like a real cabinet's backglass moved beside the playfield). No stretching the table — aspect is sacred or the physics reads wrong.
- The camera's vertical scroll behaviour is identical in both; only the chrome around the playfield moves. Define both layouts in the §5a style guide.

---

## 5. Visuals — Claude Design as the single source

**Every visual in the game is authored in Claude Design.** Claude Design outputs real **HTML/SVG/React code** (not flat images) and packages a **handoff bundle for Claude Code**, so its output drops straight into the renderer — no manual redraw, and the SVG masters stay editable forever.

There are two kinds of visual, handled slightly differently:

| Kind | Examples | Pipeline |
|---|---|---|
| **Static art** | table playfield, ramps/walls art, **the ball** (shaded SVG + highlight), backglass, table logo, UI/menus, attract screens | Author SVG in Claude Design → export → render directly as sprites/layers. The renderer just moves them to physics positions each frame. |
| **Live surface** | the **DMD** (ticking score + event animations) | Author panel style + event animations in Claude Design → bake animations to frames → code overlays live data → LED shader. See §5b. |

### 5a. The global style guide (do this first)

Before any individual asset, build **one Claude Design style guide / design system for the whole game**: palette, line weight, the retro aesthetic, lighting treatment, the DMD grid + bitmap font, the portrait/landscape layouts (§4.5), and the collision layer-naming convention (§5e). Hand this to Claude Design as the design system so every later asset — table, ball, DMD, the four future tables — stays visually coherent *and* physics-ready. This is the highest-leverage first move; everything visual inherits from it.

### 5b. The score display (DMD) — animated graphics for special events

The dot-matrix display (DMD) at the top of the cabinet shows the score and plays **animated sequences** on special events — multiball start, jackpot, mode intros, extra ball, tilt, "BALL 1", high-score entry, attract-mode loops. In the DICE originals this was an LED panel; we're building a richer, art-driven version — but it's the one visual that isn't a fixed picture (live data + animation), so it needs the extra bake step below.

**Architecture — the DMD is its own self-contained subsystem:**

```
/render/dmd
  DotMatrix.ts        // the display surface + render of frames
  DmdScene.ts         // a playable animated sequence (frames or a Claude Design scene)
  DmdQueue.ts         // event → which scene plays, priority, interrupts
  scenes/             // the actual animated content (see §5c — built in Claude Design)
```

- **Driven by the EventBus.** Scoring/mode events push a scene request onto `DmdQueue` (e.g. `JACKPOT`, `MULTIBALL_START`). The queue handles priority and interrupts — a jackpot animation can pre-empt the idle score readout, then return to it.
- **Two content types per scene:**
  - *Score/status frames* — live data (score, ball #, multiplier) rendered into the display each frame.
  - *Event animations* — pre-authored animated graphics that play start-to-finish (the "special event" graphics you want).
- **Authentic look (optional toggle):** render through a **dot/LED shader** — quantize to a pixel grid, round "bulbs", scanline/bloom — so even rich Claude Design art reads as a retro DMD. A switch lets you go full-LED-retro or crisp-modern.
- **Renderer-agnostic:** the DMD draws to its own offscreen canvas/texture, which the 2D renderer blits into the backglass area and the 3D renderer maps onto the cabinet's display mesh. Survives the 2D→3D move untouched.

### 5c. Building the DMD graphics in Claude Design

The DMD's animated scenes are authored in Claude Design like everything else, with one extra step: because the panel shows live data and animation at 60fps, the animations are **baked to frames** rather than run as live DOM.

**Workflow:**
1. **Inherit the global style guide** (§5a) — the DMD grid, palette, and bitmap font are already defined there. Give Claude Design the DMD-specific resolution (e.g. 128×32 classic, or a higher art-grid) within that system.
2. **Author each event scene in Claude Design** — e.g. an animated "JACKPOT!" burst, a "MULTIBALL" sequence, mode intros, attract-mode loop. Export as **SVG (animated via SMIL/CSS) or a small React/HTML component**.
3. **Handoff bundle → integrate.** Each exported scene becomes a `DmdScene`: either (a) an animated SVG/HTML element rendered to the offscreen DMD canvas, or (b) a frame sequence (rasterize the SVG to a sprite sheet at the DMD grid resolution for the crispest retro look + best performance).
4. **Wire to events** in `DmdQueue` — map `EFFECT.JACKPOT → scenes/jackpot`.
5. **Run through the LED shader** so all art unifies into the dot-matrix aesthetic.

**Recommendation:** keep Claude Design scenes as the *source*, but **bake them to sprite-sheet frames at build time** for the in-game DMD. SVG/DOM animation is great for authoring; pre-rendered frames are cheaper and pixel-perfect on the LED grid at 60fps. Author rich in Claude Design → bake to frames → play through the shader.

> SVG assets age well and are editable later (per the export notes), so the Claude Design files stay your editable master; the baked frames are the runtime artifact.

### 5d. Physics juice (separate, smaller system)

Distinct from the DMD — the in-world feedback effects:
- Bumper/slingshot **flash + glow**, **ball trail** scaled by speed, **screen shake** on big hits, plunger launch and drain effects.
- Pooled, renderer-agnostic; additive sprites in 2D, bloom post-processing in 3D.
- Lighter-weight than the DMD work — a day or two of polish, mostly in Milestone 5.

### 5e. Art ↔ physics alignment (critical)

With Claude Design SVG art and Planck collision bodies, there are potentially **two sources of truth for the table's shape** — and misalignment (the ball bouncing off invisible walls, or sailing through drawn ones) is *the* classic failure of art-over-physics pinball builds. The fix exploits the fact that Claude Design outputs SVG, not flat images:

- **Derive collision geometry from the SVG itself.** In the Claude Design playfield file, author walls, ramps, lane guides and slingshot faces as **named layers/paths** (e.g. `collision-wall-*`, `sensor-ramp-entry-*`). A build step parses those paths (flattening curves to polyline chains) into Planck fixture definitions. The SVG becomes the single source of truth for both look and collision; the table JSON then only carries **rules metadata** — scoring values, mode logic, light sequences, which sensor triggers what.
- **Layer-naming convention lives in the §5a style guide**, so every table Claude Design produces is automatically physics-ready.
- **Debug overlay regardless:** a toggleable view drawing all physics bodies and sensors over the art. Non-negotiable during table building — it's how you catch drift instantly.
- Dynamic elements (flippers, drop targets, spinner) are still code-defined bodies; the SVG marks their **anchor points** (a named marker per flipper pivot, etc.) so art and physics agree on placement.

This also future-proofs the in-browser table editor idea (§9): editing the SVG *is* editing the table.

---

## 6. Audio — chip music + SFX

**SFX (Web Audio):** short samples or synthesized blips for flippers, bumpers, drains, ramp combos. Route through a gain bus; allow many simultaneous voices. Synthesize the classic square/noise hits in-browser for an authentic chip feel and zero asset weight.

**Soundtrack (chiptune):** two viable routes —

1. **Tracker modules** (`.mod`/`.xm`/`.it`) played in-browser via a library like `chiptune2.js` / libopenmpt (WASM) or `bassoon.js`. This is *exactly* how the Amiga originals did music and gives the most authentic result. You compose/source `.xm` files and stream them.
2. **Synthesized chiptune engine** — a small Web Audio synth (square/triangle/noise channels + arpeggios) sequencing patterns in code. More work, fully procedural, tiny footprint.

**Recommendation:** route 1 (tracker modules) for the soundtrack — closest to the source material and lets a musician hand you `.xm` files per table — plus synthesized SFX. Per-table tracks, like the originals.

Browsers require a user gesture before audio starts, so kick off the audio context on the first plunger pull / key press.

---

## 7. Path to 3D

Because physics and render are decoupled, going 3D is mostly a new `Renderer3D`:

- Keep the **2D Planck world as the source of truth** (real pinball physics is essentially planar). Project the 2D ball position onto a 3D playfield mesh.
- Build the table as a 3D model (playfield plane + raised ramps, walls, bumpers as meshes). Map each 2D body to a mesh; set mesh `x,z` from physics `x,y`, and derive `y` (height) from ramp geometry for ramp shots.
- Add a perspective/tilted camera that scrolls with the ball (mirrors the 2D `Camera`).
- Lighting + bloom post-processing makes the particle/LED work shine.
- Optional later: full 3D physics (Rapier/Ammo) if you want ball-on-ramp height dynamics — but planar physics + height-mapped rendering looks great for far less complexity. Start there.

---

## 8. Milestones

| # | Milestone | Deliverable |
|---|---|---|
| 0 | Project scaffold | Vite + TS, Planck + Pixi loaded, blank scrolling canvas |
| 0.5 | **Global style guide in Claude Design** | One design system for the whole game — palette, retro aesthetic, lighting, DMD grid + bitmap font. Everything visual inherits from this. |
| 1 | **Core physics toy** | Ball drops, two flippers you can flip, walls, drain, plunger. Feels right. (placeholder art) |
| 2 | Camera + tall table | Vertical scroll following the ball, clamped to a multi-screen table |
| 3 | Table elements | Bumpers, slingshots, drop targets, rollovers, one ramp, spinner — all scoring via EventBus |
| 3.5 | **Ball + table art in Claude Design** | Author the ball, playfield, ramps/walls art from the §5a system, with named collision layers (§5e); swap out placeholders and verify with the debug overlay |
| 4 | Scoring + modes + DMD | DMD live: score, multipliers, `DmdQueue`, ball-saver, tilt, game-over, high scores (DMD panel art from Claude Design) |
| 5 | Juice + DMD scenes | In-world effects (trail/flash/shake) **+** author the special-event animations in Claude Design, bake to frames, wire to events through the LED shader |
| 6 | Audio | SFX synth + tracker soundtrack, per-event sound |
| 7 | First full table | "Table 1" themed (backglass, logo, full playfield art in Claude Design), balanced, complete ruleset |
| 8 | Polish + persistence | Attract mode, settings, localStorage/Laravel high-score API |
| 9 | **3D renderer** | `Renderer3D` (three.js) swapped in behind the same interface |

Milestone 1 is the make-or-break: if the flippers don't *feel* good, nothing else matters. Spend disproportionate time tuning it.

The Claude Design track (0.5, 3.5, DMD art in 4–5) runs **in parallel** with the code milestones — the style guide gates the *art* milestones, not the physics ones, so both streams can progress at once.

---

## 9. Risks / watch-list

- **Tunnelling** — solved by bullet bodies + fixed timestep + CCD. Test with a max-speed ball into a thin wall.
- **Flipper feel** — the hardest tuning problem; budget time, expose all constants in a debug panel.
- **Art/physics misalignment** — solved by §5e: collision geometry derived from named SVG layers, one source of truth, plus a debug overlay drawing bodies over art at all times during table building.
- **Table authoring** — table = Claude Design SVG (art + collision layers) + a rules JSON (scoring, modes, lights), so new tables don't need code. The SVG convention makes a future in-browser editor natural.
- **Audio latency** — keep SFX samples tiny; pre-decode; reuse buffers.
- **3D scope creep** — keep physics planar; resist full-3D physics until v1 ships.
- **IP** — "in the spirit of" the DICE games, not a clone of them: table themes, art, names and music must be original. The mechanics (ramps, multiball, tilt) are generic pinball; the specific tables aren't.
- **DMD performance** — don't run live SVG/DOM animation at 60fps in-game; bake Claude Design scenes to sprite-sheet frames at the DMD grid resolution. Keep the SVG/HTML files as the editable master.
- **Visual consistency** — lock the global Claude Design style guide (§5a: palette, aesthetic, DMD grid, font) *before* authoring any individual asset, or the table, ball, DMD, and future tables drift apart. Everything visual must inherit from one system.

---

## 10. Immediate next steps

1. Scaffold Vite + TS, pull in Planck and Pixi.
2. **Build the global style guide in Claude Design** (§5a) — the single design system all visuals inherit from.
3. Build Milestone 1 (ball, flippers, walls, plunger, drain) with placeholder art and tune flipper feel.
4. Lock the `Renderer` interface, the JSON table format, and the **Claude Design style guide** early — they protect the 2D→3D move, the one-table→four-table move, and visual coherence respectively.

When you're ready, I can: (a) **start the global style guide in Claude Design** (palette, retro aesthetic, DMD grid + font) — the recommended first move since all art inherits from it, or (b) scaffold the Milestone 0/1 flipper toy with placeholder art so the physics can progress in parallel.
