# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Milestones 0–8 built (M9, the Three.js renderer, is pinned for a feature branch — the `Renderer` seam is ready for it): Vite + TypeScript + Planck.js; Canvas-2D renderer behind the `Renderer` interface; scrolling camera; full element set (flippers, bumpers, slings, drop-target bank, rollovers, orbit + spinner) scoring via the EventBus; and the M4/M5 layer — game flow (attract → 3-ball play → game over), ball-saver, nudge/tilt, moon-lane bonus multipliers, localStorage high scores, the DMD subsystem (`src/render/dmd/`: `DotMatrix` 128×32 amber surface + 5×7 bitmap font, `DmdScene`, `DmdQueue`; Game owns it, renderers only composite its canvas), baked DMD event animations (SVG sprite-strip masters in `design/dmd-scenes/` quantized to dot frames at load by `dmd/bake.ts` — never live SVG on the grid), in-world juice (camera shake, pooled impact rings, ball trail), and audio (`src/audio/`: `AudioEngine` — Web Audio buses + synthesized chip SFX per event, unlocked on first gesture; `ChipMusic` — procedural chiptune sequencer playing an original theme; tracker-module `.xm` playback can later replace `ChipMusic` on the same music bus; volumes in the tuning panel). M7: scoring values and mode parameters live in `design/tables/moondial/rules.json` (never hardcode points — `Scoring.ts` reads base awards, `Modes.ts` runs orbit combos, end-of-ball bonus and the LUNAR ECLIPSE mode from it); backglass art at `design/tables/moondial/backglass.svg` renders in the side panel under the DMD. M8: attract-mode lamp show, DMD high-score initials entry (flippers cycle, plunger confirms), and a player-facing settings overlay (Esc — volumes + full key remapping via `src/ui/SettingsPanel.ts`; `Input` bindings persist in localStorage; game pauses while open). The renderer is **plain Canvas 2D by explicit decision — keep it that way** (no PixiJS/WebGL). The build plan at `docs/plans/pinball-build-plan.md` remains the source of truth — **read it before any implementation work**. Flipper feel is player-approved; physics tuning stays exposed in the debug panel.

The global style guide (plan §5a, milestone 0.5) lives at `design/STYLE-GUIDE.md` with tokens in `design/tokens.css` and rendered specimens in `design/previews/` — these are the editable masters, synced to the Claude Design project "Pinball Reverie — game design system". **All art must inherit from it** (palette tokens, 1 SVG unit = 1 mm, collision/sensor/anchor layer naming, ball-gap rules); amend the guide before introducing any new color or convention.

Commands: `npm run dev` (Vite dev server), `npm run build` (typecheck + bundle), `npm run simcheck` (headless physics smoke test — run after any physics or playfield-SVG change), `npm run soak [seed]` (randomized 10-min play sim that flags ball traps). Milestone 3.5 is done: table 1 is **Moondial** (night-observatory theme) and its shape truth is `design/tables/moondial/playfield.svg` — collision walls, sensors, and anchors are parsed from named layers by `src/table/SvgCollision.ts` (the visible wall strokes ARE the collision paths); `src/table/geometry.ts` keeps only dynamic-entity constants, cross-checked against the SVG's `anchor-*` markers at load. Run simcheck + soak after ANY edit to the playfield SVG.

## What this is

A browser-based retro pinball game in the spirit of Pinball Fantasies / Pinball Dreams: a vertically-scrolling tall playfield (several screens high), realistic physics, a dot-matrix display (DMD) for score and event animations, and chiptune audio. All visuals are authored in Claude Design as editable SVG masters.

## Planned stack

Vanilla TypeScript + Vite (no framework). Physics: **Planck.js** (Box2D port — chosen over Matter.js for continuous collision detection with fast small bodies). Renderer v1: 2D Canvas/PixiJS; v2: Three.js. Audio: Web Audio API + tracker-module playback (`.xm`/`.mod`) for music. Once scaffolded, expect standard Vite commands (`npm run dev`, `npm run build`).

## Architecture invariants

These are the decisions the whole plan hinges on — don't compromise them for convenience:

1. **Physics ↔ renderer decoupling.** Game state lives in the Planck world; renderers only *read* it each frame through a `Renderer` interface (`init`, `drawFrame`, `spawnEffect`). This is what makes the later 2D→3D swap possible. `Game` must never know which renderer it's talking to.
2. **Simulate in meters, not pixels.** Box2D wants 0.1–10m bodies (ball ≈ 0.027m). Scale to pixels only at render time.
3. **Fixed timestep + bullet ball.** Step physics at a fixed 1/120s; mark the ball as a bullet body for CCD. Variable timesteps and tunnelling are the two classic pinball failure modes.
4. **SVG is the single source of truth for table shape.** Collision geometry is derived from named layers/paths in the Claude Design playfield SVG (`collision-wall-*`, `sensor-ramp-entry-*`); the table's JSON carries only rules metadata (scoring, modes, lights). Never hand-author collision bodies that duplicate drawn geometry. A debug overlay drawing physics bodies over art is non-negotiable during table work.
5. **Sensors, not solids, for scoring zones**, emitting events onto an EventBus that drives scoring, audio, effects, and the DMD.
6. **The DMD is a self-contained subsystem** (`DotMatrix` surface, `DmdScene` sequences, `DmdQueue` for priority/interrupts) drawing to its own offscreen canvas. Event animations are authored in Claude Design but **baked to sprite-sheet frames at build time** — never live SVG/DOM animation at 60fps in-game.
7. **Physics stays planar** even in the 3D renderer (height is derived at render time). Resist full-3D physics until v1 ships.
8. **Table aspect ratio is sacred** — never stretch the playfield; layout chrome adapts around it (portrait: DMD above table; landscape: side panels).

## Source layout (planned)

`/src` splits into `core` (game loop, physics world, camera, event bus), `entities` (ball, flippers, bumpers, …), `table` (SVG + rules-JSON loading, SVG→fixture parsing), `render` (Renderer2D, later Renderer3D, and `render/dmd`), `audio`, and `game` (scoring, modes, tilt, high scores). See §3 of the plan for the full tree.

## Other constraints

- **IP:** "in the spirit of" the DICE games, not a clone — table themes, art, names, and music must be original.
- **Visual consistency:** the global Claude Design style guide (plan §5a) gates all art work — no individual asset is authored before it exists.
- Browsers require a user gesture before audio starts; kick off the AudioContext on first input.
- Milestone 1 (flipper feel) is make-or-break — expose physics tuning constants in a debug panel rather than hardcoding.
