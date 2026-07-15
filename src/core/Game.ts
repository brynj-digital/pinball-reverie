import { Vec2 } from "planck";
import { EventBus } from "./EventBus";
import { FIXED_DT, PhysicsWorld } from "./PhysicsWorld";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Ball } from "../entities/Ball";
import { Flipper } from "../entities/Flipper";
import { Bumper } from "../entities/Bumper";
import { Slingshot } from "../entities/Slingshot";
import { DropTargetBank } from "../entities/DropTargetBank";
import { Spinner } from "../entities/Spinner";
import { Kicker } from "../entities/Kicker";
import { Subway } from "../entities/Subway";
import { Scoring } from "../game/Scoring";
import type { TableLogic } from "../game/TableLogic";
import { HighScores } from "../game/HighScores";
import { DotMatrix } from "../render/dmd/DotMatrix";
import { DmdQueue } from "../render/dmd/DmdQueue";
import {
  AttractScene,
  BakedDmdScene,
  InitialsScene,
  MessageScene,
  ScoreScene,
  SequenceScene,
  fmtScore,
} from "../render/dmd/DmdScene";
import { SettingsPanel } from "../ui/SettingsPanel";
import {
  TouchControls,
  loadTouchPref,
  resolveTouchEnabled,
  saveTouchPref,
  type TouchPref,
} from "../ui/TouchControls";
import { TableSelect } from "../ui/TableSelect";
import { TABLE_ORDER, saveTableId } from "../table/specs";
import { bakeDmdFrames } from "../render/dmd/bake";
import { AudioEngine } from "../audio/AudioEngine";
import { ChipMusic } from "../audio/ChipMusic";
import savedSceneSvg from "../../design/dmd-scenes/saved.svg?raw";
import tiltSceneSvg from "../../design/dmd-scenes/tilt.svg?raw";
import gameoverSceneSvg from "../../design/dmd-scenes/gameover.svg?raw";
import { buildTableFromSvg, type DevTable } from "../table/DevTable";
import ballSvgRaw from "../../design/ball.svg?raw";
import type { TableSpec } from "../table/specs";
import type { TableAssets } from "../table/assets";
import { contactApplies, sensorApplies } from "../table/Surfaces";
import type { RenderMode, Renderer, View3D, WorldSnapshot } from "../render/Renderer";
import { Renderer2D } from "../render/Renderer2D";
import { TuningPanel } from "../debug/TuningPanel";
import { loadTuning, type Tuning } from "../tuning";

const BALLS_PER_GAME = 3;
const BALL_SAVER_S = 8;
const TILT_LIMIT = 3;

type Phase = "attract" | "play" | "initials" | "gameOver";
const INITIALS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";

/** Inline gear glyph for the attract-screen options button (Feather
 * "settings" outline — strokes only, tinted via currentColor). */
const GEAR_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="3.2"/>' +
  '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

/** Persisted separately from Tuning: a display mode, not physics feel —
 * the tuning panel's reset-to-defaults must not flip the renderer. */
const RENDER_MODE_KEY = "pinball-render-mode-v1";

function loadRenderMode(): RenderMode {
  try {
    return localStorage.getItem(RENDER_MODE_KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

/**
 * Per-renderer resolution scale (fraction of native DPI, 0.5–1) — a device-fit
 * display option like the render mode, persisted outside Tuning for the same
 * reason: a tuning reset must not change how sharp the picture is. 3D defaults
 * lower because its per-pixel cost (fragment shading + the bloom chain) dwarfs
 * the 2D raster pass, while perspective + bloom hide the softness that would
 * smear the 2D renderer's crisp line art.
 */
const RENDER_SCALE_KEYS: Record<RenderMode, string> = {
  "2d": "pinball-render-scale-2d-v1",
  "3d": "pinball-render-scale-3d-v1",
};
const RENDER_SCALE_DEFAULTS: Record<RenderMode, number> = { "2d": 1, "3d": 0.75 };

function loadRenderScale(mode: RenderMode): number {
  try {
    const v = parseFloat(localStorage.getItem(RENDER_SCALE_KEYS[mode]) ?? "");
    if (v >= 0.5 && v <= 1) return v;
  } catch {
    // storage unavailable — fall through to the default
  }
  return RENDER_SCALE_DEFAULTS[mode];
}

/** 3D camera style (tilted chase vs top-down classic), persisted like it. */
const VIEW3D_KEY = "pinball-3d-view-v1";

function loadView3D(): View3D {
  try {
    return localStorage.getItem(VIEW3D_KEY) === "flat" ? "flat" : "tilted";
  } catch {
    return "tilted";
  }
}

/**
 * Main loop: fixed-timestep physics, snapshot handed to the renderer each
 * animation frame. Game never knows which Renderer implementation it drives
 * (plan §3), and since M10 it never knows which TABLE it runs either: the
 * TableSpec supplies geometry + scoring + a TableLogic (modes, lanes,
 * per-table DMD narration); Game runs the universal machine — attract →
 * 3-ball play (ball-saver, nudge/tilt, initials, high scores) → game over.
 */
export class Game {
  private bus = new EventBus();
  private tuning: Tuning;
  private physics: PhysicsWorld;
  private table: DevTable;
  private ball: Ball;
  private flippers: Flipper[];
  private bumpers: Bumper[];
  private slings: Slingshot[];
  private targetBank: DropTargetBank;
  private spinner: Spinner;
  private kickers: Kicker[];
  private subways: Subway[];
  private scoring: Scoring;
  private logic: TableLogic;
  private rolloverLit = new Map<string, number>();
  private camera: Camera;
  private renderer: Renderer;
  private renderMode: RenderMode = loadRenderMode();
  private renderScale: Record<RenderMode, number> = {
    "2d": loadRenderScale("2d"),
    "3d": loadRenderScale("3d"),
  };
  private view3d: View3D = loadView3D();
  private renderSwapBusy = false;
  private input: Input;
  private touch: TouchControls;
  private touchPref: TouchPref = loadTouchPref();

  private panel: TuningPanel;
  private appliedTuningVersion = -1; // force one application on the first frame
  private plungerCharge = 0;
  private charging = false;
  /** >0 while the drained ball visibly falls out before respawning. */
  private drainTimer = 0;
  /** Saver verdict captured the instant the drain sensor fires — the 0.7 s
   * fall-out must not eat the tail of the saver window. */
  private drainSaverEligible = false;
  private lastTime = 0;
  private fps = 60;

  // ── M4 game flow ──
  private highScores: HighScores;
  private dmd = new DotMatrix();
  private dmdQueue: DmdQueue;
  private scoreScene: ScoreScene;
  private attractScene: AttractScene;
  private phase: Phase = "attract";
  private ballNum = 1;
  private gameTime = 0;
  private ballStarted = false; // first launch of the current ball arms the saver
  private saverUntil = -Infinity;
  private tiltBob = 0;
  private tilted = false;
  private gameOverUntil = 0;
  private settings: SettingsPanel;
  private tableSelect: TableSelect;
  private gearBtn: HTMLButtonElement;
  private gearVisible = false;
  private paused = false;
  private attractT = 0;
  // high-score initials entry state (phase "initials")
  private initialsScene: InitialsScene;
  private initialsLetters = ["A", "A", "A"];
  private initialsSlot = 0;
  private pendingScore = 0;
  private initialsConfirm = false;
  private prevPlunger = false;
  // previous-step state for render interpolation (see PhysicsWorld.update)
  private prevBall: { x: number; y: number; angle: number };
  private prevFlipAngles: number[] = [];
  private renderAlpha = 1;
  /** Baked DMD frames: shared machine scenes + the table's own (assets). */
  private baked = new Map<string, Uint8Array[]>();
  private audio = new AudioEngine();
  private music: ChipMusic;
  private prevFlip = { left: false, right: false, upper: false };

  constructor(
    private canvas: HTMLCanvasElement,
    private spec: TableSpec,
    assets: TableAssets,
  ) {
    const g = spec.geometry;
    this.tuning = loadTuning();
    this.highScores = new HighScores(spec.highScoreKey);
    this.music = new ChipMusic(this.audio, assets.song);
    this.physics = new PhysicsWorld(this.bus, this.tuning);
    this.table = buildTableFromSvg(this.physics.world, this.tuning, assets.playfieldSvg, g);
    this.table.renderData.artSvgText = assets.playfieldSvg;
    this.table.renderData.theme = spec.theme;
    this.table.renderData.ballSvgText = ballSvgRaw;
    this.table.renderData.backglassSvgText = assets.backglassSvg;
    this.ball = new Ball(this.physics.world, this.tuning, g.table.spawn, this.table.surfaces);
    // M11 height gate: rails only touch a ball at their height
    this.physics.setZGate((tag, x, y) =>
      contactApplies(tag, this.table.surfaces, x, y, this.ball.height.z),
    );
    // support changes drive table logic (ramp rides) + sensor resense
    this.ball.height.onChange = (from, to) => {
      const p = this.ball.body.getPosition();
      this.bus.emit("surface", { from, to, x: p.x, y: p.y, z: this.ball.height.z });
      for (const tag of this.physics.sensorsTouching(this.ball.body)) {
        if (
          (tag.zMin !== undefined || tag.zMax !== undefined) &&
          sensorApplies(tag, this.ball.height.z)
        )
          this.bus.emit("sensor", { kind: tag.kind, id: tag.id, zMin: tag.zMin, zMax: tag.zMax });
      }
    };
    this.prevBall = { x: g.table.spawn.x, y: g.table.spawn.y, angle: 0 };
    this.flippers = [
      new Flipper(this.physics.world, this.table.body, "left", this.tuning, g.flippers.left),
      new Flipper(this.physics.world, this.table.body, "right", this.tuning, g.flippers.right),
    ];
    // optional upper (third) flipper — Midway's mallet; index 2 by convention
    if (g.flippers.upper)
      this.flippers.push(
        new Flipper(this.physics.world, this.table.body, g.flippers.upper.side, this.tuning, g.flippers.upper),
      );
    this.prevFlipAngles = this.flippers.map((f) => f.body.getAngle());
    this.bumpers = g.bumpers.map((def) => new Bumper(this.physics.world, def));
    this.slings = g.slings.map((def) => new Slingshot(this.physics.world, def));
    this.targetBank = new DropTargetBank(this.physics.world, this.physics, this.bus, g.dropTargets);
    this.spinner = new Spinner(this.bus);
    this.kickers = g.kickers.map((def) => {
      const k = new Kicker(def);
      k.onEject = () => {
        this.renderer.spawnEffect("flash", def.hold.x, def.hold.y);
        this.camera.shake(0.0012); // the eject solenoid thumps the cabinet, like the plunger
        this.audio.sfx("kickout");
      };
      return k;
    });
    this.subways = g.subways.map((def) => {
      const path = this.table.profiles.find((p) => p.name === def.id)!;
      const s = new Subway(def, path);
      const exit = path.pts[path.pts.length - 1];
      s.onEject = () => {
        this.renderer.spawnEffect("flash", exit.x, exit.y);
        this.audio.sfx("kickout");
      };
      return s;
    });
    this.scoring = new Scoring(this.bus, spec.scoring);
    this.logic = spec.createLogic({
      bus: this.bus,
      scoring: this.scoring,
      sfx: (name) => this.audio.sfx(name),
      shake: (mag) => this.camera.shake(mag),
      push: (scene, prio) => this.dmdQueue.push(scene, prio),
      baked: (key) => this.baked.get(key),
    });
    this.camera = new Camera(g.table.width, g.table.height, this.tuning.cameraViewH);
    // always boot on the 2D renderer (synchronous); if 3D was persisted the
    // swap kicks off immediately and lands once its chunk loads
    this.renderer = new Renderer2D(canvas);
    this.renderer.init(this.table.renderData);
    if (this.renderMode === "3d") void this.applyRenderMode("3d", true);
    this.input = new Input();
    // Touch overlay: a sibling of the canvas in #app so it survives the 2D↔3D
    // canvas swap (applyRenderMode replaces the canvas node). Hidden unless the
    // resolved preference wants it. Midway's mallet (flippers.upper) shares the
    // right zone, matching the default keyboard wiring.
    this.touch = new TouchControls(
      this.input,
      canvas.parentElement ?? document.body,
      spec.geometry.flippers.upper != null,
    );
    this.touch.setEnabled(resolveTouchEnabled(this.touchPref));
    this.input.onReset(() => {
      // mid-drain the respawn would zero drainTimer and skip onBallLost —
      // a free ball; also inert while paused or outside play/attract
      if (this.paused || this.drainTimer > 0) return;
      if (this.phase === "play" || this.phase === "attract") this.respawn();
    });
    this.input.onStart(() => {
      if (this.paused) return;
      if (this.phase === "attract") {
        if (this.tableSelect.open) this.tableSelect.confirm();
        else this.startGame();
      } else if (this.phase === "initials") this.initialsConfirm = true;
    });
    this.input.onNudge((dir) => {
      // arrows double as browse keys while the table select is up
      if (this.phase === "attract" && this.tableSelect.open) {
        if (dir !== "up") this.tableSelect.cycle(dir === "left" ? -1 : 1);
        return;
      }
      this.nudge(dir);
    });
    this.panel = new TuningPanel(this.tuning);
    this.settings = new SettingsPanel(
      this.tuning,
      this.panel,
      this.input,
      (open) => {
        this.paused = open;
        // hide the touch zones behind the overlay so a held flipper can't stick
        if (open) this.touch.setEnabled(false);
        else this.touch.setEnabled(resolveTouchEnabled(this.touchPref));
      },
      {
        get: () => this.renderMode,
        set: (mode) => this.applyRenderMode(mode),
      },
      {
        get: () => this.renderScale[this.renderMode],
        set: (v) => {
          this.renderScale[this.renderMode] = v;
          try {
            localStorage.setItem(RENDER_SCALE_KEYS[this.renderMode], String(v));
          } catch {
            // storage unavailable — the scale just won't persist
          }
        },
      },
      {
        get: () => this.view3d,
        set: (view) => {
          this.view3d = view;
          this.renderer.setView3D?.(view);
          try {
            localStorage.setItem(VIEW3D_KEY, view);
          } catch {
            // storage unavailable — the view just won't persist
          }
        },
      },
      spec.id,
      {
        get: () => this.touchPref,
        set: (pref) => {
          this.touchPref = pref;
          saveTouchPref(pref);
          this.touch.setEnabled(resolveTouchEnabled(pref));
        },
      },
    );
    // Table select (M10): attract-phase browsing of the backglass cards.
    // Confirming the installed table just starts the game; confirming the
    // other one persists + reloads — same contract as the settings row.
    this.tableSelect = new TableSelect(
      spec.id,
      () => this.startGame(),
      (id) => {
        saveTableId(id);
        location.reload();
      },
      (name) => this.audio.sfx(name),
    );
    this.input.onEscape(() => {
      // Options live on the attract / table-select step only. Esc there backs
      // out of the carousel if it's up, otherwise toggles the settings overlay.
      // In play Esc is a plain pause toggle (no overlay); during initials entry
      // and game-over it does nothing.
      if (this.phase === "attract") {
        if (this.tableSelect.open) this.tableSelect.hide();
        else this.settings.toggle();
      } else if (this.phase === "play") {
        this.paused = !this.paused;
      }
    });
    // Options gear (touch parity): Esc has no touch equivalent, so the attract
    // screen shows a tappable gear. It sits above the table-select carousel
    // (z-index) so options stay reachable through the whole select step; the
    // update loop shows/hides it as the phase changes.
    this.gearBtn = document.createElement("button");
    this.gearBtn.className = "attract-gear";
    this.gearBtn.title = "Options (Esc)";
    this.gearBtn.setAttribute("aria-label", "Options");
    this.gearBtn.innerHTML = GEAR_SVG;
    this.gearBtn.style.display = "none"; // first update() shows it in attract
    this.gearBtn.onclick = () => {
      if (this.phase === "attract" && !this.paused) this.settings.toggle();
    };
    document.body.appendChild(this.gearBtn);

    this.scoreScene = new ScoreScene(() => ({
      score: this.scoring.total,
      ball: this.ballNum,
      mult: this.scoring.multiplier,
    }));
    this.attractScene = new AttractScene(() => this.highScores.top, spec.name, TABLE_ORDER.length);
    this.initialsScene = new InitialsScene(() => ({
      letters: this.initialsLetters,
      slot: this.initialsSlot,
      score: this.pendingScore,
    }));
    this.dmdQueue = new DmdQueue(this.attractScene);
    const bake = (key: string, svg: string, frames: number) =>
      void bakeDmdFrames(svg, frames).then((f) => this.baked.set(key, f));
    bake("saved", savedSceneSvg, 7);
    bake("tilt", tiltSceneSvg, 4);
    bake("gameover", gameoverSceneSvg, 8);
    for (const [key, scene] of Object.entries(assets.dmdScenes)) bake(key, scene.svg, scene.frames);

    this.bus.on("sensor", ({ kind, id, zMin, zMax }) => {
      // M11: a sensor with a height band only admits balls within it
      if (!sensorApplies({ zMin, zMax }, this.ball.height.z)) return;
      // Drain starts a short visible fall-out (ball keeps simulating, fades,
      // then respawns) instead of teleporting away the instant the sensor
      // fires — the sensor sits above the floor, mid-drop. A captive ball is
      // exempt: outlane-saving subways (Tidebreaker's gutter, Midway's
      // chicken exit) legitimately carry the ball through the drain zone.
      if (
        kind === "drain" &&
        this.drainTimer <= 0 &&
        !this.kickers.some((k) => k.holding) &&
        !this.subways.some((s) => s.active)
      ) {
        this.startDrain();
      } else if (kind === "spinner") this.spinner.trip(this.ball.body.getLinearVelocity().y);
      else if (kind === "kicker" && id) {
        const k = this.kickers.find((k) => k.def.id === id);
        if (k && this.logic.kickerLit(id) && k.capture()) {
          this.audio.sfx("scoop");
          this.logic.onCapture?.(id);
        }
      } else if (kind === "subway" && id) {
        const s = this.subways.find((s) => s.def.id === id);
        if (s && this.logic.kickerLit(id) && s.capture()) {
          this.audio.sfx("scoop");
          this.logic.onCapture?.(id);
        }
      } else if (kind === "rollover" && id) {
        this.rolloverLit.set(id, 1);
        this.audio.sfx("rollover");
        if (this.phase === "play" && !this.tilted) this.logic.onRollover(id);
      }
    });
    this.bus.on("spinnerTick", () => this.audio.sfx("spinnerTick"));
    this.bus.on("bankComplete", () => this.audio.sfx("bank"));
    this.bus.on("launch", () => {
      this.renderer.spawnEffect("launch", g.table.spawn.x, g.table.spawn.y);
      this.camera.shake(0.0012); // the plunger release thumps the cabinet, barely
      this.audio.sfx("launch");
      if (this.phase === "play" && !this.ballStarted) {
        this.ballStarted = true;
        this.saverUntil = this.gameTime + BALL_SAVER_S;
      }
    });
    this.bus.on("hit", ({ kind, id }) => {
      // Element hits get flash + glow + sfx but NO camera shake: shake means
      // "the cabinet moved", which only player nudges and the tilt do — a
      // ball striking a bumper doesn't move a real machine.
      if (kind === "bumper") {
        const b = this.bumpers.find((b) => b.def.id === id);
        b?.kick(this.ball, this.physics, this.tuning.bumperKick);
        if (b) this.renderer.spawnEffect("flash", b.def.x, b.def.y);
        this.audio.sfx("bumper");
      } else if (kind === "sling") {
        const sl = this.slings.find((s) => s.def.id === id);
        if (sl?.kick(this.ball, this.physics, this.tuning.slingKick)) {
          const c = sl.def.verts.reduce(
            (a, p) => ({ x: a.x + p.x / 3, y: a.y + p.y / 3 }),
            { x: 0, y: 0 },
          );
          this.renderer.spawnEffect("flash", c.x, c.y);
          this.audio.sfx("sling");
        }
      } else if (kind === "target") {
        this.targetBank.onHit(id);
        this.audio.sfx("target");
      }
    });
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  /**
   * Swap renderer implementations behind the seam (plan §7). A 2D and a
   * WebGL context can't share one canvas, so the canvas is replaced too.
   * Renderer3D loads as its own chunk — 2D players never download three.js.
   */
  private async applyRenderMode(mode: RenderMode, force = false): Promise<void> {
    if (this.renderSwapBusy || (mode === this.renderMode && !force)) return;
    this.renderSwapBusy = true;
    try {
      let make: (c: HTMLCanvasElement) => Renderer;
      if (mode === "3d") {
        const { Renderer3D } = await import("../render/Renderer3D");
        make = (c) => new Renderer3D(c);
      } else {
        make = (c) => new Renderer2D(c);
      }
      const old = this.renderer;
      const fresh = document.createElement("canvas");
      fresh.id = this.canvas.id;
      this.canvas.replaceWith(fresh);
      this.canvas = fresh;
      this.renderer = make(fresh);
      this.renderer.init(this.table.renderData);
      this.renderer.setView3D?.(this.view3d);
      old.dispose?.();
      this.renderMode = mode;
      try {
        localStorage.setItem(RENDER_MODE_KEY, mode);
      } catch {
        // storage unavailable — the mode just won't persist
      }
    } catch (err) {
      console.error("renderer swap failed, staying on current mode", err);
    } finally {
      this.renderSwapBusy = false;
    }
  }

  /** JS cost of the previous frame (update + draw-command issuance), ms. */
  private jsMs = 0;

  private frame = (tMs: number): void => {
    const dt = this.lastTime ? Math.min((tMs - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = tMs;
    if (dt > 0) {
      this.fps += (1 / dt - this.fps) * 0.05;
      const t0 = performance.now();
      this.update(dt);
      this.jsMs = this.jsMs * 0.9 + (performance.now() - t0) * 0.1;
    }
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const t = this.tuning;
    const s = this.input.state;
    const g = this.spec.geometry;

    // live tuning → physics/audio, only when a slider actually moved
    if (this.panel.version !== this.appliedTuningVersion) {
      this.appliedTuningVersion = this.panel.version;
      this.audio.setVolumes(t.sfxVolume, t.musicVolume);
      this.physics.setSlope(t);
      this.ball.applyTuning(t);
      for (const f of this.table.wallFixtures) {
        f.setRestitution(t.wallRestitution);
        f.setFriction(t.wallFriction);
      }
    }

    // options gear lives on the attract/table-select step only; hidden while
    // the settings overlay is up (paused) and everywhere else
    const gearOn = this.phase === "attract" && !this.paused;
    if (gearOn !== this.gearVisible) {
      this.gearVisible = gearOn;
      this.gearBtn.style.display = gearOn ? "" : "none";
    }

    // paused (settings overlay open in attract, or Esc pause in play): freeze
    // the game but keep drawing it; drain any tap pulses so keys pressed while
    // frozen don't fire on resume
    if (this.paused) {
      this.input.consumeTap("left");
      this.input.consumeTap("right");
      this.renderer.drawFrame(this.snapshot(), this.camera);
      return;
    }

    this.gameTime += dt;
    this.tiltBob = Math.max(0, this.tiltBob - dt / 1.2);
    if (this.phase === "gameOver" && this.gameTime >= this.gameOverUntil) {
      this.phase = "attract";
      this.dmdQueue.setIdle(this.attractScene);
    }

    const plungerEdge = s.plunger && !this.prevPlunger;
    if (this.phase === "initials") this.updateInitials(s.plunger);
    this.prevPlunger = s.plunger;

    // attract lamp show: lanes, bumpers and slings pulse in slow waves
    if (this.phase === "attract") {
      this.attractT += dt;
      const tt = this.attractT;
      g.rollovers.forEach((r, i) =>
        this.rolloverLit.set(r.id, Math.max(0, Math.sin(tt * 2.2 - i * 1.4)) * 0.9),
      );
      this.bumpers.forEach((b, i) => (b.flash = Math.max(0, Math.sin(tt * 1.6 + i * 2.1)) * 0.5));
      this.slings.forEach((sl, i) => (sl.flash = Math.max(0, Math.sin(tt * 1.1 + i * Math.PI)) * 0.35));
    }

    // consume taps unconditionally — short-circuiting past consumeTap while
    // tilted would leave the pulse latched to fire as a phantom flip later
    const tapL = this.input.consumeTap("left");
    const tapR = this.input.consumeTap("right");
    const tapU = this.input.consumeTap("upper");
    // attract table select: the first flipper press opens the backglass
    // browser, further presses move the focus; flippers stay down while open
    if (this.phase === "attract" && (tapL || tapR)) {
      if (!this.tableSelect.open) this.tableSelect.show();
      else {
        if (tapL) this.tableSelect.cycle(-1);
        if (tapR) this.tableSelect.cycle(1);
      }
    }
    const browsing = this.phase === "attract" && this.tableSelect.open;
    const flippersLive = !this.tilted && this.phase !== "initials" && !browsing;
    const flipL = flippersLive && (s.left || tapL);
    const flipR = flippersLive && (s.right || tapR);
    const flipU = flippersLive && (s.upper || tapU);
    if (flipL && !this.prevFlip.left) this.audio.sfx("flipper");
    if (flipR && !this.prevFlip.right) this.audio.sfx("flipper");
    if (this.flippers[2] && flipU && !this.prevFlip.upper) this.audio.sfx("flipper");
    // lane change (flippersLive already excludes tilt): main flippers only —
    // the upper defaults to sharing the right keys, so it must not re-fire
    if (this.phase === "play") {
      if (flipL && !this.prevFlip.left) this.logic.onFlipper?.("left");
      if (flipR && !this.prevFlip.right) this.logic.onFlipper?.("right");
    }
    this.prevFlip.left = flipL;
    this.prevFlip.right = flipR;
    this.prevFlip.upper = flipU;
    this.flippers[0].update(flipL, t);
    this.flippers[1].update(flipR, t);
    this.flippers[2]?.update(flipU, t);
    if (this.phase === "play") this.updatePlunger(dt, s.plunger, t);
    else if (this.phase === "attract" && s.plunger) {
      if (!browsing) this.startGame();
      else if (plungerEdge) this.tableSelect.confirm();
    }
    // The touch plunger zone overlaps the right flipper's corner: capture
    // pointers only while a press could do something — ball at the plunger
    // during play, or any other phase (start / table-select / initials
    // confirm). Otherwise corner touches fall through to the right flipper.
    this.touch.setPlungerZoneActive(this.phase !== "play" || this.ballInLane());

    for (const b of this.bumpers) b.update(dt);
    for (const sl of this.slings) sl.update(dt);
    let ballCaptive = false;
    for (const k of this.kickers) {
      k.update(dt, this.ball, t);
      if (k.holding) ballCaptive = true;
    }
    for (const sub of this.subways) {
      sub.update(dt, this.ball);
      if (sub.active) ballCaptive = true;
    }
    // a captive ball must not eat the ball-saver window (-Infinity stays put)
    if (ballCaptive) this.saverUntil += dt;
    this.targetBank.update(dt);
    this.spinner.update(dt);
    this.scoring.update(dt);
    this.logic.update(dt);
    for (const [id, v] of this.rolloverLit) this.rolloverLit.set(id, Math.max(0, v - dt * 2));

    this.renderAlpha = this.physics.update(
      dt,
      () => {
        const bp = this.ball.body.getPosition();
        this.prevBall.x = bp.x;
        this.prevBall.y = bp.y;
        this.prevBall.angle = this.ball.body.getAngle();
        for (let i = 0; i < this.flippers.length; i++)
          this.prevFlipAngles[i] = this.flippers[i].body.getAngle();
        // M11: climbs decelerate, drops accelerate — the support surface's
        // slope feeds back into the plane
        this.ball.height.applyForces(this.ball.body);
      },
      () => {
        const bp = this.ball.body.getPosition();
        const bv = this.ball.body.getLinearVelocity();
        this.ball.height.step(FIXED_DT, bp.x, bp.y, Math.hypot(bv.x, bv.y));
      },
    );

    // Out-of-bounds net: no legitimate route leads off the table (the shell
    // is full-height since M11), so a ball outside the envelope is always a
    // bug escapee. It can never reach the drain sensor out there — count it
    // as a drain instead of soft-locking.
    if (this.drainTimer <= 0 && !ballCaptive) {
      const bp = this.ball.body.getPosition();
      const m = 0.03;
      if (bp.x < -m || bp.x > g.table.width + m || bp.y < -m || bp.y > g.table.height + m) {
        this.ball.height.reset();
        this.startDrain();
      }
    }

    if (this.drainTimer > 0) {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) this.onBallLost();
    }

    this.dmdQueue.update(dt, this.dmd);
    this.dmd.render();

    // Base window from tuning, widened to what the renderer really shows when
    // width binds its scale (narrow screens) — keeps the scroll clamp at the
    // true table edges instead of exposing void past them.
    const baseViewH = Math.min(t.cameraViewH, g.table.height);
    this.camera.viewH = Math.min(
      this.renderer.effectiveViewH?.(baseViewH) ?? baseViewH,
      g.table.height,
    );
    const a = this.renderAlpha;
    this.camera.follow(
      this.prevBall.y + (this.ball.body.getPosition().y - this.prevBall.y) * a,
      dt,
    );

    this.renderer.drawFrame(this.snapshot(), this.camera);
  }

  /** Ball is in the shooter lane, where the plunger can act on it. Gates both
   * plunger charging and the touch plunger zone's pointer capture. */
  private ballInLane(): boolean {
    const g = this.spec.geometry.table;
    const p = this.ball.body.getPosition();
    return p.x > g.laneWallX && p.y > g.laneTopY;
  }

  private updatePlunger(dt: number, held: boolean, t: Tuning): void {
    const inLane = this.ballInLane();

    if (held && inLane) {
      this.charging = true;
      this.plungerCharge = Math.min(1, this.plungerCharge + dt / t.plungerChargeTime);
    } else {
      if (this.charging && !held && inLane) {
        const v = t.plungerMinSpeed + this.plungerCharge * (t.plungerMaxSpeed - t.plungerMinSpeed);
        this.ball.body.setLinearVelocity(new Vec2(0, -v));
        this.bus.emit("launch", { power: this.plungerCharge });
      }
      this.charging = false;
      this.plungerCharge = 0;
    }
  }

  /** Begin the visible drain fall-out; onBallLost runs when it ends. Shared
   * by the drain sensor and the out-of-bounds net. */
  private startDrain(): void {
    this.drainTimer = 0.7;
    this.drainSaverEligible =
      this.phase === "play" && this.ballStarted && this.gameTime < this.saverUntil && !this.tilted;
    this.renderer.spawnEffect("drain", 0.26, 1.0);
    this.audio.sfx("drain");
  }

  private respawn(): void {
    // never leave a respawned ball gravity-less or mid-transit
    for (const k of this.kickers) k.cancel(this.ball);
    for (const sub of this.subways) sub.cancel(this.ball);
    this.ball.reset();
    // don't lerp across the teleport
    const spawn = this.spec.geometry.table.spawn;
    this.prevBall.x = spawn.x;
    this.prevBall.y = spawn.y;
    this.prevBall.angle = 0;
    this.drainTimer = 0;
    this.plungerCharge = 0;
    this.charging = false;
    this.bus.emit("ballSpawn", {});
  }

  private startGame(): void {
    this.tableSelect.hide();
    this.audio.sfx("start");
    this.music.start();
    this.scoring.reset();
    this.logic.resetGame();
    this.phase = "play";
    this.ballNum = 1;
    this.ballStarted = false;
    this.saverUntil = -Infinity;
    this.rolloverLit.clear(); // attract lamp show must not bleed into ball 1
    this.tilted = false;
    this.tiltBob = 0;
    this.respawn();
    this.dmdQueue.clear();
    this.dmdQueue.setIdle(this.scoreScene);
    this.dmdQueue.push(new MessageScene([["BALL 1", "GOOD LUCK"]], 1.6));
  }

  /** End of the drain fall-out: saver, next ball, or game over. */
  private onBallLost(): void {
    if (this.phase !== "play") {
      this.drainSaverEligible = false;
      this.respawn();
      return;
    }
    if (this.drainSaverEligible) {
      this.drainSaverEligible = false;
      this.saverUntil = -Infinity; // one save per ball
      this.respawn();
      this.audio.sfx("saved");
      const savedFrames = this.baked.get("saved");
      this.dmdQueue.push(
        savedFrames
          ? new BakedDmdScene(savedFrames, 10, "BALL SAVED", 0.5)
          : new MessageScene([["BALL SAVED"]], 1.4, true),
        2,
      );
      return;
    }
    const wasTilted = this.tilted;
    this.tilted = false;
    this.scoring.muted = false;
    this.ballStarted = false;
    this.saverUntil = -Infinity;
    // TILT forfeits the end-of-ball bonus (real-machine rule)
    let bonus = 0;
    if (wasTilted) this.scoring.forfeitBonus();
    else bonus = this.scoring.collectBonus();
    this.logic.endBall();
    this.scoring.multiplier = 1;
    const bonusPage: string[][] = bonus > 0 ? [["BONUS", fmtScore(bonus)]] : [];
    if (this.ballNum >= BALLS_PER_GAME) {
      this.music.stop();
      this.audio.sfx("gameOver");
      this.respawn();
      if (this.highScores.qualifies(this.scoring.total)) {
        // collect initials before recording; InitialsScene renders the entry
        this.phase = "initials";
        this.pendingScore = this.scoring.total;
        this.initialsLetters = ["A", "A", "A"];
        this.initialsSlot = 0;
        this.initialsConfirm = false;
        this.input.setTextCapture(true);
        this.dmdQueue.clear();
        this.dmdQueue.setIdle(this.initialsScene);
        if (bonusPage.length) this.dmdQueue.push(new MessageScene(bonusPage, 1.8), 2);
      } else {
        this.phase = "gameOver";
        const parts = [];
        let dur = 0.3;
        if (bonusPage.length) {
          parts.push(new MessageScene(bonusPage, 1.8));
          dur += 1.8;
        }
        const goFrames = this.baked.get("gameover");
        if (goFrames) {
          // moonset scene, score as the top caption row
          parts.push(
            new BakedDmdScene(goFrames, 7, `GAME OVER  ${fmtScore(this.scoring.total)}`, 1.4, undefined, 1),
          );
          dur += 8 / 7 + 1.4;
        } else {
          parts.push(new MessageScene([["GAME OVER", fmtScore(this.scoring.total)]], 2.2));
          dur += 2.2;
        }
        this.dmdQueue.push(new SequenceScene(parts), 3);
        this.gameOverUntil = this.gameTime + dur;
      }
    } else {
      this.ballNum++;
      this.respawn();
      this.dmdQueue.push(new MessageScene([...bonusPage, [`BALL ${this.ballNum}`]], 1.6), 2);
    }
  }

  /**
   * Initials entry: flipper taps cycle the letter, plunger/start confirms —
   * or just type A–Z directly (Backspace steps back a slot).
   */
  private updateInitials(plungerHeld: boolean): void {
    const cycle = (dir: number) => {
      const cur = INITIALS_CHARS.indexOf(this.initialsLetters[this.initialsSlot]);
      const next = (cur + dir + INITIALS_CHARS.length) % INITIALS_CHARS.length;
      this.initialsLetters[this.initialsSlot] = INITIALS_CHARS[next];
      this.audio.sfx("rollover");
    };
    if (this.input.consumeTap("left")) cycle(-1);
    if (this.input.consumeTap("right")) cycle(1);

    for (let ch = this.input.consumeTyped(); ch; ch = this.input.consumeTyped()) {
      if (ch === "\b") {
        if (this.initialsSlot > 0) {
          this.initialsSlot--;
          this.audio.sfx("rollover");
        }
        continue;
      }
      this.initialsLetters[this.initialsSlot] = ch;
      this.audio.sfx("target");
      this.advanceInitialsSlot();
      if (this.phase !== "initials") return;
    }

    const confirm = this.initialsConfirm || (plungerHeld && !this.prevPlunger);
    this.initialsConfirm = false;
    if (!confirm) return;
    this.audio.sfx("target");
    this.advanceInitialsSlot();
  }

  private advanceInitialsSlot(): void {
    this.initialsSlot++;
    if (this.initialsSlot > 2) {
      const initials = this.initialsLetters.join("");
      this.highScores.add(initials, this.pendingScore);
      this.audio.sfx("bank");
      this.input.setTextCapture(false);
      this.phase = "gameOver";
      this.dmdQueue.push(
        new MessageScene([["HIGH SCORE", `${initials}  ${fmtScore(this.pendingScore)}`]], 2.4),
        3,
      );
      this.gameOverUntil = this.gameTime + 2.7;
    }
  }

  /** Table nudge: brief impulse on the ball, tilt if abused (plan §4). */
  private nudge(dir: "left" | "right" | "up"): void {
    if (this.paused || this.phase !== "play" || this.tilted || this.drainTimer > 0) return;
    const imp =
      dir === "left"
        ? new Vec2(-0.02, -0.008)
        : dir === "right"
          ? new Vec2(0.02, -0.008)
          : new Vec2(0, -0.024);
    this.ball.body.applyLinearImpulse(imp, this.ball.body.getPosition(), true);
    this.camera.shake(0.006);
    this.tiltBob += 1;
    if (this.tiltBob > TILT_LIMIT) {
      this.tilted = true;
      this.scoring.muted = true; // a tilted ball scores nothing until it drains
      this.camera.shake(0.012);
      this.audio.sfx("tilt");
      const tiltFrames = this.baked.get("tilt");
      this.dmdQueue.push(
        tiltFrames
          ? new BakedDmdScene(tiltFrames, 9, undefined, 0, 3.5)
          : new MessageScene([["TILT"]], 3.5, true),
        3,
      );
    } else if (this.tiltBob > TILT_LIMIT - 1) {
      this.audio.sfx("warning");
      this.dmdQueue.push(new MessageScene([["CAREFUL!"]], 0.8), 1);
    }
  }

  private snapshot(): WorldSnapshot {
    const g = this.spec.geometry;
    const p = this.ball.body.getPosition();
    const v = this.ball.body.getLinearVelocity();
    const a = this.renderAlpha;
    const lerp = (from: number, to: number) => from + (to - from) * a;
    const bx = lerp(this.prevBall.x, p.x);
    const by = lerp(this.prevBall.y, p.y);
    return {
      ball: {
        x: bx,
        y: by,
        angle: lerp(this.prevBall.angle, this.ball.body.getAngle()),
        vx: v.x,
        vy: v.y,
        // fade out over the last 0.3 s of the drain fall
        alpha: this.drainTimer > 0 ? Math.min(1, this.drainTimer / 0.3) : 1,
        h: this.ball.height.z,
        layer: this.ball.layer,
      },
      flippers: this.flippers.map((f, i) => {
        const fp = f.body.getPosition();
        return {
          x: fp.x,
          y: fp.y,
          angle: lerp(this.prevFlipAngles[i], f.body.getAngle()),
          side: f.side,
        };
      }),
      elements: {
        bumpers: this.bumpers.map((b) => ({ ...b.def, flash: b.flash })),
        slings: this.slings.map((s) => ({ verts: s.def.verts, flash: s.flash })),
        targets: this.targetBank.targets.map((t) => ({
          x: t.x,
          y: t.y,
          hw: g.dropTargets.hw,
          hh: g.dropTargets.hh,
          up: t.up,
        })),
        // lanes stay lit while collected toward the multiplier; the decay
        // map adds the brighter roll-over flash on top
        rollovers: g.rollovers.map((r) => ({
          x: r.x,
          y: r.y,
          lit: Math.max(this.rolloverLit.get(r.id) ?? 0, this.logic.laneLit(r.id)),
        })),
        lamps: g.lamps.map((l, i) => ({
          x: l.x,
          y: l.y,
          rgb: l.rgb,
          lit:
            this.phase === "attract"
              ? Math.max(0, Math.sin(this.attractT * 1.8 - i * 0.9)) * 0.8
              : this.logic.lamp(l.id),
        })),
        spinner: { ...g.spinner, angle: this.spinner.angle, spin: this.spinner.spin01 },
      },
      score: this.scoring.total,
      scoreLabel: this.scoring.lastLabel,
      scoreLabelAge: this.scoring.lastLabelAge,
      plungerCharge: this.plungerCharge,
      fps: this.fps,
      jsMs: this.jsMs,
      renderScale: this.renderScale[this.renderMode],
      dmd: this.dmd.canvas,
      debugShapes: this.tuning.debugOverlay ? this.physics.collectDebugShapes() : undefined,
    };
  }
}
