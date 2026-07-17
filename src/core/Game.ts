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
import { Diverter } from "../entities/Diverter";
import { Lift } from "../entities/Lift";
import { Magnet } from "../entities/Magnet";
import { Disc } from "../entities/Disc";
import { Scoring } from "../game/Scoring";
import type { TableLogic } from "../game/TableLogic";
import { HighScores } from "../game/HighScores";
import { DotMatrix } from "../render/dmd/DotMatrix";
import { DmdQueue } from "../render/dmd/DmdQueue";
import {
  AttractScene,
  BakedDmdScene,
  InitialsScene,
  MatchScene,
  MessageScene,
  ScoreScene,
  SequenceScene,
  fmtScore,
} from "../render/dmd/DmdScene";
import { SettingsPanel } from "../ui/SettingsPanel";
import { PauseOverlay } from "../ui/PauseOverlay";
import {
  TouchControls,
  loadTouchPref,
  resolveTouchEnabled,
  saveTouchPref,
  touchAvailable,
  type TouchPref,
} from "../ui/TouchControls";
import { Haptics, saveHapticsPref } from "../ui/Haptics";
import { TableSelect } from "../ui/TableSelect";
import { TABLE_ORDER, saveTableId } from "../table/specs";
import { inShooterLane, onPlayfieldSide } from "../table/geometry";
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

/**
 * The two HUD info lines (frame stats, keyboard hints) are display prefs like
 * render mode — persisted outside Tuning so tuning resets can't flip them.
 * Unset, they default off on small/touch devices: the stats line is clutter
 * there and the key names don't apply to touch play.
 */
const HUD_PREF_KEYS = {
  stats: "pinball-hud-stats-v1",
  keys: "pinball-hud-keys-v1",
} as const;

function smallOrTouchDevice(): boolean {
  try {
    return (
      touchAvailable() ||
      (typeof screen !== "undefined" && Math.min(screen.width, screen.height) < 700)
    );
  } catch {
    return false;
  }
}

function loadHudPref(kind: keyof typeof HUD_PREF_KEYS): boolean {
  try {
    const raw = localStorage.getItem(HUD_PREF_KEYS[kind]);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    // storage unavailable — fall through to the device default
  }
  return !smallOrTouchDevice();
}

function saveHudPref(kind: keyof typeof HUD_PREF_KEYS, on: boolean): void {
  try {
    localStorage.setItem(HUD_PREF_KEYS[kind], on ? "on" : "off");
  } catch {
    // best-effort
  }
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
  /**
   * M12 multiball: extra balls live only during play (spawned via the
   * TableLogicCtx.addBalls seam, e.g. the Night Mail's DEPARTURE). Each is
   * a full Ball (own body + HeightState); they drain silently and the run
   * ends only when the LAST ball drains (the primary promotes from here).
   */
  private extraBalls: Ball[] = [];
  private prevExtras: { x: number; y: number; angle: number }[] = [];
  /** Physically-locked balls, parked at their berths out of play (M12 —
   * the Night Mail's siding wagons). They persist across balls within a
   * game (classic machines keep locked balls locked) and rejoin play as
   * multiball extras via releaseLocks. */
  private lockedBerths: { ball: Ball; x: number; y: number }[] = [];
  private nextBallId = 1;
  private spawnQueue: { at: { x: number; y: number }; v: { x: number; y: number }; delay: number }[] = [];
  private flippers: Flipper[];
  private upperFlipper?: Flipper;
  private miniFlippers: Flipper[] = [];
  private bumpers: Bumper[];
  private slings: Slingshot[];
  private targetBank: DropTargetBank;
  private spinner: Spinner;
  private kickers: Kicker[];
  private subways: Subway[];
  private diverters: Diverter[];
  private lifts: Lift[];
  private magnets: Magnet[];
  private discs: Disc[];
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
  private haptics = new Haptics();
  private hudStats = loadHudPref("stats");
  private hudKeys = loadHudPref("keys");

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
  private pauseOverlay: PauseOverlay;
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
    // M11 height gate: rails only touch a ball at their height. M12: the
    // contact's own ball resolves by its fixture tag (multiball). Parked
    // lock balls are contact GHOSTS: out of play means out of physics —
    // a solid parked wagon forms a stable cradle against any nearby wall
    // and traps live balls (playtest-found); ghosting removes the whole
    // failure class. They resolidify the moment releaseLocks fires.
    this.physics.setZGate((tag, x, y, ballTag) => {
      if (this.isLocked(ballTag?.ballId)) return false;
      if (tag.kind === "ball" && this.isLocked(tag.ballId)) return false;
      return contactApplies(tag, this.table.surfaces, x, y, this.ballById(ballTag?.ballId).height.z);
    });
    // support changes drive table logic (ramp rides) + sensor resense
    this.wireBallEvents(this.ball);
    this.prevBall = { x: g.table.spawn.x, y: g.table.spawn.y, angle: 0 };
    this.flippers = [
      new Flipper(this.physics.world, this.table.body, "left", this.tuning, g.flippers.left),
      new Flipper(this.physics.world, this.table.body, "right", this.tuning, g.flippers.right),
    ];
    // optional upper (third) flipper — Midway's mallet
    if (g.flippers.upper) {
      this.upperFlipper = new Flipper(
        this.physics.world, this.table.body, g.flippers.upper.side, this.tuning, g.flippers.upper,
        g.flippers.upper.z,
      );
      this.flippers.push(this.upperFlipper);
    }
    // M13: optional mini pair (the Sump's chamber) — same hardware, driven
    // by the main left/right actions (one button works both storeys)
    if (g.flippers.mini) {
      this.miniFlippers = [
        new Flipper(this.physics.world, this.table.body, "left", this.tuning, g.flippers.mini.left),
        new Flipper(this.physics.world, this.table.body, "right", this.tuning, g.flippers.mini.right),
      ];
      this.flippers.push(...this.miniFlippers);
    }
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
    // M12 entities (absent on pre-Night-Mail tables)
    this.diverters = (g.diverters ?? []).map(
      (def) => new Diverter(this.physics.world, this.physics, def, this.table.diverterBlades, this.tuning),
    );
    this.lifts = (g.lifts ?? []).map((def) => {
      const path = this.table.profiles.find((p) => p.name === def.id)!;
      const l = new Lift(def, path);
      const exit = path.pts[path.pts.length - 1];
      l.onEject = () => {
        this.renderer.spawnEffect("flash", exit.x, exit.y);
        this.audio.sfx("kickout");
      };
      return l;
    });
    this.magnets = (g.magnets ?? []).map((def) => {
      const m = new Magnet(def);
      m.onCapture = () => {
        this.audio.sfx("scoop");
        this.logic.onCapture?.(def.id);
      };
      m.onRelease = () => {
        this.renderer.spawnEffect("flash", def.x, def.y);
        this.camera.shake(0.0012); // the coil dumps the ball, cabinet-felt
        this.audio.sfx("kickout");
      };
      return m;
    });
    this.discs = (g.discs ?? []).map((def) => new Disc(def));
    this.scoring = new Scoring(this.bus, spec.scoring);
    this.logic = spec.createLogic({
      bus: this.bus,
      scoring: this.scoring,
      sfx: (name) => this.audio.sfx(name),
      shake: (mag) => this.camera.shake(mag),
      push: (scene, prio) => this.dmdQueue.push(scene, prio),
      baked: (key) => this.baked.get(key),
      holdScoop: (id, open) => {
        const k = this.kickers.find((k) => k.def.id === id);
        if (open) k?.beginExtendedHold();
        else k?.release();
      },
      addBalls: (n, at, v) => {
        if (this.phase !== "play") return;
        for (let i = 0; i < n; i++)
          this.spawnQueue.push({
            at: at ?? { x: g.table.spawn.x, y: g.table.spawn.y },
            v: v ?? { x: 0, y: 0 },
            delay: 0.15 + i * 0.5,
          });
      },
      saverActive: () =>
        this.phase === "play" &&
        this.ballStarted &&
        this.gameTime < this.saverUntil &&
        !this.tilted,
      lockBall: (kickerId, berth) => {
        if (this.phase !== "play") return false;
        const k = this.kickers.find((k) => k.def.id === kickerId);
        const b = k?.heldBall;
        if (!k || !b) return false;
        k.cancel(); // pre-hold: no gravity change has happened yet
        // the transfer mutates the world (and may create a served ball) —
        // defer past the locked contact callback that reported the capture
        this.physics.queuePostStep(() => {
          if (this.lockedBerths.some((L) => L.ball === b)) return;
          b.body.setGravityScale(0);
          b.body.setLinearVelocity(new Vec2(0, 0));
          this.lockedBerths.push({ ball: b, x: berth.x, y: berth.y });
          if (b === this.ball) {
            if (this.extraBalls.length > 0) {
              // an extra takes over as the live primary
              const next = this.extraBalls.shift()!;
              this.prevExtras.shift();
              this.ball = next;
            } else {
              // serve a fresh ball to the plunger
              const nb = new Ball(
                this.physics.world,
                this.tuning,
                g.table.spawn,
                this.table.surfaces,
                this.nextBallId++,
              );
              this.wireBallEvents(nb);
              this.ball = nb;
              this.bus.emit("ballSpawn", {});
            }
            const p = this.ball.body.getPosition();
            this.prevBall.x = p.x;
            this.prevBall.y = p.y;
            this.prevBall.angle = this.ball.body.getAngle();
          } else {
            const i = this.extraBalls.indexOf(b);
            if (i >= 0) {
              this.extraBalls.splice(i, 1);
              this.prevExtras.splice(i, 1);
            }
          }
        });
        this.audio.sfx("bank");
        return true;
      },
      releaseLocks: () => {
        const n = this.lockedBerths.length;
        for (let i = 0; i < this.lockedBerths.length; i++) {
          const L = this.lockedBerths[i];
          L.ball.body.setGravityScale(1);
          // shove each wagon out with a slight stagger so they don't stack
          L.ball.body.setLinearVelocity(new Vec2(0.2 + 0.1 * i, 1.1 + 0.25 * i));
          this.extraBalls.push(L.ball);
          const p = L.ball.body.getPosition();
          this.prevExtras.push({ x: p.x, y: p.y, angle: L.ball.body.getAngle() });
          this.renderer.spawnEffect("flash", L.x, L.y);
        }
        this.lockedBerths.length = 0;
        if (n > 0) this.audio.sfx("kickout");
        return n;
      },
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
      this.haptics,
      spec.geometry.table.plungerSide ?? "right",
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
      {
        get: () => this.haptics.enabled,
        set: (on) => {
          this.haptics.enabled = on;
          saveHapticsPref(on);
        },
      },
      {
        stats: {
          get: () => this.hudStats,
          set: (on) => {
            this.hudStats = on;
            saveHudPref("stats", on);
          },
        },
        keys: {
          get: () => this.hudKeys,
          set: (on) => {
            this.hudKeys = on;
            saveHudPref("keys", on);
          },
        },
      },
    );
    this.pauseOverlay = new PauseOverlay(
      () => this.setPaused(false),
      () => this.exitGame(),
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
      // In play Esc toggles the pause overlay (resume / exit game); during
      // initials entry and game-over it does nothing.
      if (this.phase === "attract") {
        if (this.tableSelect.open) this.tableSelect.hide();
        else this.settings.toggle();
      } else if (this.phase === "play") {
        this.setPaused(!this.paused);
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

    this.bus.on("sensor", ({ kind, id, zMin, zMax, ballId }) => {
      if (this.isLocked(ballId)) return; // parked wagons trip nothing
      const sBall = this.ballById(ballId);
      // M11: a sensor with a height band only admits balls within it
      if (!sensorApplies({ zMin, zMax }, sBall.height.z)) return;
      // Drain starts a short visible fall-out (ball keeps simulating, fades,
      // then respawns) instead of teleporting away the instant the sensor
      // fires — the sensor sits above the floor, mid-drop. A captive ball is
      // exempt: outlane-saving subways (Tidebreaker's gutter, Midway's
      // chicken exit) legitimately carry the ball through the drain zone.
      // M12 multiball: a drained EXTRA just leaves the game; the primary
      // draining with extras alive promotes one instead of ending the ball.
      if (kind === "drain" && !this.ballCaptive(sBall)) {
        if (sBall !== this.ball) this.removeExtra(sBall);
        else if (this.extraBalls.length > 0) this.promoteExtra();
        else if (this.drainTimer <= 0) this.startDrain();
      } else if (kind === "spinner") this.spinner.trip(sBall.body.getLinearVelocity().y);
      else if (kind === "kicker" && id) {
        const k = this.kickers.find((k) => k.def.id === id);
        if (k && this.logic.kickerLit(id) && k.capture(sBall)) {
          this.audio.sfx("scoop");
          this.logic.onCapture?.(id);
        }
      } else if (kind === "subway" && id) {
        const s = this.subways.find((s) => s.def.id === id);
        if (s && this.logic.kickerLit(id) && s.capture(sBall)) {
          this.audio.sfx("scoop");
          this.logic.onCapture?.(id);
        }
      } else if (kind === "lift" && id) {
        const l = this.lifts.find((l) => l.def.id === id);
        if (l && this.logic.kickerLit(id) && l.capture(sBall)) {
          this.audio.sfx("scoop");
          this.logic.onCapture?.(id);
        }
      } else if (kind === "skill" && id) {
        if (this.phase === "play" && !this.tilted) {
          const v = sBall.body.getLinearVelocity();
          this.logic.onSkillShot?.(id, Math.hypot(v.x, v.y));
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
    this.bus.on("hit", ({ kind, id, ballId }) => {
      if (this.isLocked(ballId)) return; // parked wagons trip nothing
      const hBall = this.ballById(ballId);
      // Element hits get flash + glow + sfx but NO camera shake: shake means
      // "the cabinet moved", which only player nudges and the tilt do — a
      // ball striking a bumper doesn't move a real machine.
      if (kind === "bumper") {
        const b = this.bumpers.find((b) => b.def.id === id);
        b?.kick(hBall, this.physics, this.tuning.bumperKick);
        if (b) this.renderer.spawnEffect("flash", b.def.x, b.def.y);
        this.audio.sfx("bumper");
      } else if (kind === "sling") {
        const sl = this.slings.find((s) => s.def.id === id);
        const slingBoost = this.logic.slingBoost?.() ?? 1;
        if (sl?.kick(hBall, this.physics, this.tuning.slingKick * slingBoost)) {
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
    if (this.upperFlipper && flipU && !this.prevFlip.upper) this.audio.sfx("flipper");
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
    this.upperFlipper?.update(flipU, t);
    // M13 mini pair: keyed by side off the MAIN actions
    for (const f of this.miniFlippers) f.update(f.side === "left" ? flipL : flipR, t);
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
    // M12 multiball: serve queued extra balls (staggered releases)
    if (this.spawnQueue.length && this.phase === "play") {
      for (const q of this.spawnQueue) q.delay -= dt;
      while (this.spawnQueue.length && this.spawnQueue[0].delay <= 0)
        this.spawnExtra(this.spawnQueue.shift()!);
    }
    const live = this.liveBalls();
    for (const k of this.kickers) k.update(dt, t);
    for (const sub of this.subways) sub.update(dt);
    for (const l of this.lifts) l.update(dt);
    for (const m of this.magnets) {
      m.lit = this.phase === "play" && !this.tilted && (this.logic.magnetLit?.(m.def.id) ?? false);
      m.update(dt, live);
    }
    for (const d of this.discs) {
      d.spin = this.logic.discSpin?.(d.def.id) ?? 0;
      d.update(dt);
    }
    for (const dv of this.diverters)
      dv.setBlade(this.logic.diverterBlade?.(dv.def.id) ?? dv.def.initial, live);
    // parked lock balls ease to their berths and stay put (gravity off);
    // live-ball knocks displace them for a beat, then they settle back
    for (const L of this.lockedBerths) {
      const b = L.ball.body;
      const p = b.getPosition();
      const kk = Math.min(1, dt * 8);
      b.setTransform(new Vec2(p.x + (L.x - p.x) * kk, p.y + (L.y - p.y) * kk), b.getAngle());
      b.setLinearVelocity(new Vec2(0, 0));
      b.setAngularVelocity(0);
    }
    // a captive PRIMARY must not eat the ball-saver window (-Infinity stays
    // put); a held multiball extra doesn't freeze the game's clock
    const primaryCaptive = this.ballCaptive(this.ball);
    if (primaryCaptive) this.saverUntil += dt;
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
        for (let i = 0; i < this.extraBalls.length; i++) {
          const p = this.extraBalls[i].body.getPosition();
          this.prevExtras[i].x = p.x;
          this.prevExtras[i].y = p.y;
          this.prevExtras[i].angle = this.extraBalls[i].body.getAngle();
        }
        for (let i = 0; i < this.flippers.length; i++)
          this.prevFlipAngles[i] = this.flippers[i].body.getAngle();
        // M11: climbs decelerate, drops accelerate — the support surface's
        // slope feeds back into the plane (every live ball)
        const stepBalls = this.liveBalls();
        for (const b of stepBalls) b.height.applyForces(b.body);
        // M12 field forces (Box2D clears forces per step, so per-frame
        // application would starve multi-step frames)
        for (const m of this.magnets) m.applyForces(stepBalls);
        for (const d of this.discs) d.applyForces(stepBalls);
      },
      () => {
        for (const b of this.liveBalls()) {
          const bp = b.body.getPosition();
          const bv = b.body.getLinearVelocity();
          b.height.step(FIXED_DT, bp.x, bp.y, Math.hypot(bv.x, bv.y));
        }
      },
    );

    // Out-of-bounds net: no legitimate route leads off the table (the shell
    // is full-height since M11), so a ball outside the envelope is always a
    // bug escapee. It can never reach the drain sensor out there — count it
    // as a drain instead of soft-locking. Multiball extras just leave.
    if (this.drainTimer <= 0) {
      const m = 0.03;
      for (const b of this.liveBalls()) {
        const bp = b.body.getPosition();
        const oob =
          bp.x < -m || bp.x > g.table.width + m || bp.y < -m || bp.y > g.table.height + m;
        if (!oob || this.ballCaptive(b)) continue;
        if (b !== this.ball) this.removeExtra(b);
        else if (this.extraBalls.length > 0) this.promoteExtra();
        else {
          b.height.reset();
          this.startDrain();
        }
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
    // M12 multiball: follow the ball nearest the flippers (danger-first),
    // ignoring anything waiting in the shooter lane
    let followY = this.prevBall.y + (this.ball.body.getPosition().y - this.prevBall.y) * a;
    if (this.extraBalls.length > 0) {
      const cand: number[] = [];
      if (onPlayfieldSide(g.table, this.ball.body.getPosition().x)) cand.push(followY);
      for (let i = 0; i < this.extraBalls.length; i++) {
        const p = this.extraBalls[i].body.getPosition();
        if (onPlayfieldSide(g.table, p.x))
          cand.push(this.prevExtras[i].y + (p.y - this.prevExtras[i].y) * a);
      }
      if (cand.length > 0) followY = Math.max(...cand);
    }
    this.camera.follow(followY, dt);

    this.renderer.drawFrame(this.snapshot(), this.camera);
  }

  /** Ball is in the shooter lane, where the plunger can act on it. Gates both
   * plunger charging and the touch plunger zone's pointer capture. */
  private ballInLane(): boolean {
    const g = this.spec.geometry.table;
    const p = this.ball.body.getPosition();
    return inShooterLane(g, p.x, p.y);
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

  /** All live balls, primary first (M12 multiball; locked berths excluded). */
  private liveBalls(): Ball[] {
    return this.extraBalls.length === 0 ? [this.ball] : [this.ball, ...this.extraBalls];
  }

  /** Surface-change events + banded-sensor resense for one ball — every
   * ball (initial primary, multiball extras, lock-served) gets the same
   * wiring, reporting its own id. */
  private wireBallEvents(b: Ball): void {
    b.height.onChange = (from, to) => {
      const p = b.body.getPosition();
      this.bus.emit("surface", { from, to, x: p.x, y: p.y, z: b.height.z });
      for (const tag of this.physics.sensorsTouching(b.body)) {
        if (
          (tag.zMin !== undefined || tag.zMax !== undefined) &&
          sensorApplies(tag, b.height.z)
        )
          this.bus.emit("sensor", {
            kind: tag.kind,
            id: tag.id,
            zMin: tag.zMin,
            zMax: tag.zMax,
            ballId: b.id,
          });
      }
    };
  }

  /** Is this event ball parked in a lock berth (its events are inert)? */
  private isLocked(ballId?: number): boolean {
    return ballId !== undefined && this.lockedBerths.some((L) => L.ball.id === ballId);
  }

  /** Tear down the lock rack (new game / exit — NOT between balls: locked
   * wagons persist across drains like a real machine's lock lane). */
  private clearLocks(): void {
    for (const L of this.lockedBerths) {
      const dead = L.ball;
      this.physics.queuePostStep(() => dead.destroy(this.physics.world));
    }
    this.lockedBerths.length = 0;
  }

  /** Resolve a fixture/event ball id to its live Ball (primary fallback). */
  private ballById(id?: number): Ball {
    if (id === undefined || id === this.ball.id) return this.ball;
    return this.extraBalls.find((b) => b.id === id) ?? this.ball;
  }

  /** Is this specific ball scripted-captive right now (drain/OOB exempt)? */
  private ballCaptive(b: Ball): boolean {
    return (
      this.kickers.some((k) => k.holds(b)) ||
      this.subways.some((s) => s.carries(b)) ||
      this.lifts.some((l) => l.carries(b)) ||
      this.magnets.some((m) => m.holds(b))
    );
  }

  /** Serve one multiball extra (from TableLogicCtx.addBalls, staggered). */
  private spawnExtra(q: { at: { x: number; y: number }; v: { x: number; y: number } }): void {
    const b = new Ball(this.physics.world, this.tuning, q.at, this.table.surfaces, this.nextBallId++);
    b.body.setLinearVelocity(new Vec2(q.v.x, q.v.y));
    this.wireBallEvents(b);
    this.extraBalls.push(b);
    this.prevExtras.push({ x: q.at.x, y: q.at.y, angle: 0 });
    this.renderer.spawnEffect("flash", q.at.x, q.at.y);
    this.audio.sfx("kickout");
  }

  /** A drained/escaped multiball extra leaves the game (destroy deferred —
   * the world is locked during the contact callback that reports it). */
  private removeExtra(b: Ball): void {
    const i = this.extraBalls.indexOf(b);
    if (i < 0) return;
    this.extraBalls.splice(i, 1);
    this.prevExtras.splice(i, 1);
    this.renderer.spawnEffect("drain", b.body.getPosition().x, 1.0);
    this.physics.queuePostStep(() => b.destroy(this.physics.world));
  }

  /** The primary drained mid-multiball: an extra takes over seamlessly —
   * the run ends only when the LAST ball drains. */
  private promoteExtra(): void {
    const old = this.ball;
    const next = this.extraBalls.shift()!;
    this.prevExtras.shift();
    this.ball = next;
    const p = next.body.getPosition();
    this.prevBall.x = p.x;
    this.prevBall.y = p.y;
    this.prevBall.angle = next.body.getAngle();
    this.renderer.spawnEffect("drain", old.body.getPosition().x, 1.0);
    this.physics.queuePostStep(() => old.destroy(this.physics.world));
  }

  /** Tear down multiball (ball end / respawn / exit). */
  private clearExtras(): void {
    this.spawnQueue.length = 0;
    for (const b of this.extraBalls) {
      const dead = b;
      this.physics.queuePostStep(() => dead.destroy(this.physics.world));
    }
    this.extraBalls.length = 0;
    this.prevExtras.length = 0;
  }

  private respawn(): void {
    // never leave a respawned ball gravity-less or mid-transit
    for (const k of this.kickers) k.cancel();
    for (const sub of this.subways) sub.cancel();
    for (const l of this.lifts) l.cancel();
    for (const m of this.magnets) m.cancel();
    this.clearExtras();
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

  /** In-play pause: freeze the world and show the pause card. Touch zones
   * hide while frozen so a held flipper can't stick across the pause — the
   * same rule the settings overlay applies. */
  private setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    this.pauseOverlay.setOpen(on);
    this.touch.setEnabled(on ? false : resolveTouchEnabled(this.touchPref));
  }

  /** Abandon the current game from the pause overlay: straight back to
   * attract. The score is forfeited — no bonus collect, no high-score entry;
   * a quit game isn't a completed one. */
  private exitGame(): void {
    if (this.phase !== "play") return;
    this.setPaused(false);
    this.clearLocks();
    this.music.stop();
    this.tilted = false;
    this.tiltBob = 0;
    this.scoring.muted = false;
    this.drainSaverEligible = false;
    this.ballStarted = false;
    this.saverUntil = -Infinity;
    this.respawn();
    this.phase = "attract";
    this.dmdQueue.clear();
    this.dmdQueue.setIdle(this.attractScene);
  }

  private startGame(): void {
    this.tableSelect.hide();
    this.audio.sfx("start");
    this.music.start();
    this.scoring.reset();
    this.clearLocks(); // stale wagons from an abandoned/finished game
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

  /**
   * Classic end-of-game match (M12): the board settles on a random multiple
   * of ten; the player's last two score digits matching it wins a "free
   * game" (ceremonial — no coin economy; the knocker moment is the award).
   * ~10% operator odds when the score can match at all. Returns the scene
   * and its duration for the caller's game-over timing.
   */
  private makeMatchScene(): { scene: MatchScene; dur: number } {
    const player = this.scoring.total % 100;
    const canWin = player % 10 === 0;
    const win = canWin && Math.random() < 0.1;
    let final = win ? player : Math.floor(Math.random() * 10) * 10;
    if (!win && final === player) final = (final + 10) % 100;
    const scene = new MatchScene(player, final, win, () =>
      this.audio.sfx(win ? "start" : "target"),
    );
    return { scene, dur: MatchScene.duration(win) };
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
      this.clearLocks(); // no wagons parked through attract mode
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
        const match = this.makeMatchScene();
        parts.push(match.scene);
        dur += match.dur;
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
      // match runs after the entry (it interrupted the classic order to
      // collect initials first); then the high-score card
      const match = this.makeMatchScene();
      this.dmdQueue.push(
        new SequenceScene([
          match.scene,
          new MessageScene([["HIGH SCORE", `${initials}  ${fmtScore(this.pendingScore)}`]], 2.4),
        ]),
        3,
      );
      this.gameOverUntil = this.gameTime + match.dur + 2.7;
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
    for (const b of this.liveBalls())
      b.body.applyLinearImpulse(imp, b.body.getPosition(), true);
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
      // M12 multiball extras + parked lock balls (empty outside multiball)
      extraBalls: [
        ...this.extraBalls.map((b, i) => {
          const bp = b.body.getPosition();
          const bv = b.body.getLinearVelocity();
          return {
            x: lerp(this.prevExtras[i].x, bp.x),
            y: lerp(this.prevExtras[i].y, bp.y),
            angle: lerp(this.prevExtras[i].angle, b.body.getAngle()),
            vx: bv.x,
            vy: bv.y,
            alpha: 1,
            h: b.height.z,
            layer: b.layer,
          };
        }),
        ...this.lockedBerths.map((L) => {
          const bp = L.ball.body.getPosition();
          return {
            x: bp.x,
            y: bp.y,
            angle: L.ball.body.getAngle(),
            vx: 0,
            vy: 0,
            // parked wagons are contact ghosts — a touch of transparency
            // so a live ball passing through reads as intended, not a bug
            alpha: 0.8,
            h: 0,
            layer: 0,
          };
        }),
      ],
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
        // M12 (empty arrays on pre-Night-Mail tables)
        diverters: this.diverters.map((d) => ({
          id: d.def.id,
          blade: d.blade,
          pts: d.bladePts(d.blade),
        })),
        magnets: this.magnets.map((m) => ({
          x: m.def.x,
          y: m.def.y,
          r: m.def.captureRadius,
          lit: m.lit,
          holding: m.holding,
        })),
        discs: this.discs.map((d) => ({
          x: d.def.x,
          y: d.def.y,
          r: d.def.r,
          angle: d.angle,
          spinning: d.spin !== 0,
        })),
      },
      score: this.scoring.total,
      scoreLabel: this.scoring.lastLabel,
      scoreLabelAge: this.scoring.lastLabelAge,
      plungerCharge: this.plungerCharge,
      fps: this.fps,
      jsMs: this.jsMs,
      renderScale: this.renderScale[this.renderMode],
      hudStats: this.hudStats,
      hudKeys: this.hudKeys,
      dmd: this.dmd.canvas,
      debugShapes: this.tuning.debugOverlay ? this.physics.collectDebugShapes() : undefined,
    };
  }
}
