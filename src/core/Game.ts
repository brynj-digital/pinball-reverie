import { Vec2 } from "planck";
import { EventBus } from "./EventBus";
import { PhysicsWorld } from "./PhysicsWorld";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Ball } from "../entities/Ball";
import { Flipper } from "../entities/Flipper";
import { Bumper } from "../entities/Bumper";
import { Slingshot } from "../entities/Slingshot";
import { DropTargetBank } from "../entities/DropTargetBank";
import { Spinner } from "../entities/Spinner";
import { Scoring } from "../game/Scoring";
import { HighScores } from "../game/HighScores";
import { DotMatrix } from "../render/dmd/DotMatrix";
import { DmdQueue } from "../render/dmd/DmdQueue";
import {
  AttractScene,
  BakedDmdScene,
  MessageScene,
  ScoreScene,
  fmtScore,
} from "../render/dmd/DmdScene";
import { bakeDmdFrames } from "../render/dmd/bake";
import orbitSceneSvg from "../../design/dmd-scenes/orbit.svg?raw";
import multiplierSceneSvg from "../../design/dmd-scenes/multiplier.svg?raw";
import { buildTableFromSvg, type DevTable } from "../table/DevTable";
// The playfield SVG is both physics source (→ SvgCollision) and art (the
// renderer rasterizes the same text at display scale): one file, both jobs.
import playfieldSvgRaw from "../../design/tables/moondial/playfield.svg?raw";
import ballSvgRaw from "../../design/ball.svg?raw";
import { BUMPERS, DROP_TARGETS, ROLLOVERS, SLINGS, SPINNER, TABLE } from "../table/geometry";
import type { Renderer, WorldSnapshot } from "../render/Renderer";
import { Renderer2D } from "../render/Renderer2D";
import { TuningPanel } from "../debug/TuningPanel";
import { loadTuning, type Tuning } from "../tuning";

const BALLS_PER_GAME = 3;
const BALL_SAVER_S = 8;
const TILT_LIMIT = 3;
/** Labels that earn their own DMD scene (bumper/sling spam does not). */
const DMD_LABELS = new Set(["ORBIT", "BANK BONUS"]);

type Phase = "attract" | "play" | "gameOver";

/**
 * Main loop: fixed-timestep physics, snapshot handed to the renderer each
 * animation frame. Game never knows which Renderer implementation it drives
 * (plan §3). M4 state machine: attract → play (3 balls, ball-saver, tilt,
 * moon-lane multipliers) → game over → attract, narrated by the DMD.
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
  private scoring: Scoring;
  private rolloverLit = new Map<string, number>();
  private camera: Camera;
  private renderer: Renderer;
  private input: Input;

  private panel: TuningPanel;
  private appliedTuningVersion = -1; // force one application on the first frame
  private plungerCharge = 0;
  private charging = false;
  /** >0 while the drained ball visibly falls out before respawning. */
  private drainTimer = 0;
  private lastTime = 0;
  private fps = 60;

  // ── M4 game flow ──
  private highScores = new HighScores();
  private dmd = new DotMatrix();
  private dmdQueue: DmdQueue;
  private scoreScene: ScoreScene;
  private attractScene: AttractScene;
  private phase: Phase = "attract";
  private ballNum = 1;
  private gameTime = 0;
  private ballStarted = false; // first launch of the current ball arms the saver
  private saverUntil = -Infinity;
  private litMoons = new Set<string>();
  private tiltBob = 0;
  private tilted = false;
  private gameOverUntil = 0;
  /** Baked Claude Design DMD scenes (loaded async; text scenes until ready). */
  private baked: { orbit?: Uint8Array[]; moon?: Uint8Array[] } = {};

  constructor(canvas: HTMLCanvasElement) {
    this.tuning = loadTuning();
    this.physics = new PhysicsWorld(this.bus, this.tuning);
    this.table = buildTableFromSvg(this.physics.world, this.tuning, playfieldSvgRaw);
    this.table.renderData.artSvgText = playfieldSvgRaw;
    this.table.renderData.ballSvgText = ballSvgRaw;
    this.ball = new Ball(this.physics.world, this.tuning);
    this.flippers = [
      new Flipper(this.physics.world, this.table.body, "left", this.tuning),
      new Flipper(this.physics.world, this.table.body, "right", this.tuning),
    ];
    this.bumpers = BUMPERS.map((def) => new Bumper(this.physics.world, def));
    this.slings = SLINGS.map((def) => new Slingshot(this.physics.world, def));
    this.targetBank = new DropTargetBank(this.physics.world, this.physics, this.bus);
    this.spinner = new Spinner(this.bus);
    this.scoring = new Scoring(this.bus);
    this.camera = new Camera(TABLE.width, TABLE.height, this.tuning.cameraViewH);
    this.renderer = new Renderer2D(canvas);
    this.renderer.init(this.table.renderData);
    this.input = new Input();
    this.input.onReset(() => this.respawn());
    this.input.onStart(() => {
      if (this.phase === "attract") this.startGame();
    });
    this.input.onNudge((dir) => this.nudge(dir));
    this.panel = new TuningPanel(this.tuning);

    this.scoreScene = new ScoreScene(() => ({
      score: this.scoring.total,
      ball: this.ballNum,
      mult: this.scoring.multiplier,
    }));
    this.attractScene = new AttractScene(() => this.highScores.top);
    this.dmdQueue = new DmdQueue(this.attractScene);
    void bakeDmdFrames(orbitSceneSvg, 8).then((f) => (this.baked.orbit = f));
    void bakeDmdFrames(multiplierSceneSvg, 6).then((f) => (this.baked.moon = f));

    this.bus.on("sensor", ({ kind, id }) => {
      // Drain starts a short visible fall-out (ball keeps simulating, fades,
      // then respawns) instead of teleporting away the instant the sensor
      // fires — the sensor sits above the floor, mid-drop.
      if (kind === "drain" && this.drainTimer <= 0) {
        this.drainTimer = 0.7;
        this.renderer.spawnEffect("drain", 0.26, 1.0);
        this.camera.shake(0.003);
      } else if (kind === "spinner") this.spinner.trip(this.ball.body.getLinearVelocity().y);
      else if (kind === "rollover" && id) {
        this.rolloverLit.set(id, 1);
        this.onMoonLit(id);
      }
    });
    this.bus.on("launch", () => {
      this.renderer.spawnEffect("launch", TABLE.spawn.x, TABLE.spawn.y);
      this.camera.shake(0.002);
      if (this.phase === "play" && !this.ballStarted) {
        this.ballStarted = true;
        this.saverUntil = this.gameTime + BALL_SAVER_S;
      }
    });
    this.bus.on("score", ({ label, points }) => {
      if (label === "ORBIT" && this.baked.orbit) {
        this.dmdQueue.push(new BakedDmdScene(this.baked.orbit, 11, `ORBIT ${fmtScore(points)}`));
      } else if (DMD_LABELS.has(label)) {
        this.dmdQueue.push(new MessageScene([[label, fmtScore(points)]], 1.3));
      }
    });
    this.bus.on("hit", ({ kind, id }) => {
      if (kind === "bumper") {
        const b = this.bumpers.find((b) => b.def.id === id);
        b?.kick(this.ball, this.physics, this.tuning.bumperKick);
        if (b) this.renderer.spawnEffect("flash", b.def.x, b.def.y);
        this.camera.shake(0.0028);
      } else if (kind === "sling") {
        const sl = this.slings.find((s) => s.def.id === id);
        if (sl?.kick(this.ball, this.physics, this.tuning.slingKick)) {
          const c = sl.def.verts.reduce(
            (a, p) => ({ x: a.x + p.x / 3, y: a.y + p.y / 3 }),
            { x: 0, y: 0 },
          );
          this.renderer.spawnEffect("flash", c.x, c.y);
          this.camera.shake(0.0022);
        }
      } else if (kind === "target") {
        this.targetBank.onHit(id);
        this.camera.shake(0.0015);
      }
    });
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private frame = (tMs: number): void => {
    const dt = this.lastTime ? Math.min((tMs - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = tMs;
    if (dt > 0) {
      this.fps += (1 / dt - this.fps) * 0.05;
      this.update(dt);
    }
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const t = this.tuning;
    const s = this.input.state;

    // live tuning → physics, only when a slider actually moved
    if (this.panel.version !== this.appliedTuningVersion) {
      this.appliedTuningVersion = this.panel.version;
      this.physics.setSlope(t);
      this.ball.applyTuning(t);
      for (const f of this.table.wallFixtures) {
        f.setRestitution(t.wallRestitution);
        f.setFriction(t.wallFriction);
      }
    }

    this.gameTime += dt;
    this.tiltBob = Math.max(0, this.tiltBob - dt / 1.2);
    if (this.phase === "gameOver" && this.gameTime >= this.gameOverUntil) {
      this.phase = "attract";
      this.dmdQueue.setIdle(this.attractScene);
    }

    const flippersLive = !this.tilted;
    this.flippers[0].update(flippersLive && (s.left || this.input.consumeTap("left")), t);
    this.flippers[1].update(flippersLive && (s.right || this.input.consumeTap("right")), t);
    if (this.phase === "play") this.updatePlunger(dt, s.plunger, t);
    else if (this.phase === "attract" && s.plunger) this.startGame();

    for (const b of this.bumpers) b.update(dt);
    for (const sl of this.slings) sl.update(dt);
    this.targetBank.update(dt);
    this.spinner.update(dt);
    this.scoring.update(dt);
    for (const [id, v] of this.rolloverLit) this.rolloverLit.set(id, Math.max(0, v - dt * 2));

    this.physics.update(dt);

    if (this.drainTimer > 0) {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) this.onBallLost();
    }

    this.dmdQueue.update(dt, this.dmd);
    this.dmd.render();

    this.camera.viewH = Math.min(t.cameraViewH, TABLE.height);
    this.camera.follow(this.ball.body.getPosition().y, dt);

    this.renderer.drawFrame(this.snapshot(), this.camera);
  }

  private updatePlunger(dt: number, held: boolean, t: Tuning): void {
    const p = this.ball.body.getPosition();
    const inLane = p.x > TABLE.laneWallX && p.y > TABLE.laneTopY;

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

  private respawn(): void {
    this.ball.reset();
    this.drainTimer = 0;
    this.plungerCharge = 0;
    this.charging = false;
    this.bus.emit("ballSpawn", {});
  }

  private startGame(): void {
    this.scoring.reset();
    this.phase = "play";
    this.ballNum = 1;
    this.ballStarted = false;
    this.saverUntil = -Infinity;
    this.litMoons.clear();
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
      this.respawn();
      return;
    }
    if (this.ballStarted && this.gameTime < this.saverUntil && !this.tilted) {
      this.saverUntil = -Infinity; // one save per ball
      this.respawn();
      this.dmdQueue.push(new MessageScene([["BALL SAVED"]], 1.4, true), 2);
      return;
    }
    this.tilted = false;
    this.ballStarted = false;
    this.saverUntil = -Infinity;
    this.scoring.multiplier = 1;
    this.litMoons.clear();
    if (this.ballNum >= BALLS_PER_GAME) {
      this.phase = "gameOver";
      const pages: string[][] = [["GAME OVER", fmtScore(this.scoring.total)]];
      if (this.highScores.submit(this.scoring.total)) pages.push(["NEW HIGH SCORE", "!"]);
      this.dmdQueue.push(new MessageScene(pages, 2.2), 3);
      this.gameOverUntil = this.gameTime + pages.length * 2.2 + 0.3;
      this.respawn();
    } else {
      this.ballNum++;
      this.respawn();
      this.dmdQueue.push(new MessageScene([[`BALL ${this.ballNum}`]], 1.4), 2);
    }
  }

  /** Moon lanes: light all three to raise the bonus multiplier (max ×5). */
  private onMoonLit(id: string): void {
    if (this.phase !== "play") return;
    this.litMoons.add(id);
    if (this.litMoons.size === 3) {
      this.litMoons.clear();
      if (this.scoring.multiplier < 5) {
        this.scoring.multiplier++;
        const caption = `MULTIPLIER ×${this.scoring.multiplier}`;
        this.dmdQueue.push(
          this.baked.moon
            ? new BakedDmdScene(this.baked.moon, 9, caption)
            : new MessageScene([[caption]], 1.4, true),
          2,
        );
      }
    }
  }

  /** Table nudge: brief impulse on the ball, tilt if abused (plan §4). */
  private nudge(dir: "left" | "right" | "up"): void {
    if (this.phase !== "play" || this.tilted || this.drainTimer > 0) return;
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
      this.camera.shake(0.012);
      this.dmdQueue.push(new MessageScene([["TILT"]], 3.5, true), 3);
    } else if (this.tiltBob > TILT_LIMIT - 1) {
      this.dmdQueue.push(new MessageScene([["CAREFUL!"]], 0.8), 1);
    }
  }

  private snapshot(): WorldSnapshot {
    const p = this.ball.body.getPosition();
    const v = this.ball.body.getLinearVelocity();
    return {
      ball: {
        x: p.x,
        y: p.y,
        angle: this.ball.body.getAngle(),
        vx: v.x,
        vy: v.y,
        // fade out over the last 0.3 s of the drain fall
        alpha: this.drainTimer > 0 ? Math.min(1, this.drainTimer / 0.3) : 1,
      },
      flippers: this.flippers.map((f) => {
        const fp = f.body.getPosition();
        return { x: fp.x, y: fp.y, angle: f.body.getAngle(), side: f.side };
      }),
      elements: {
        bumpers: this.bumpers.map((b) => ({ ...b.def, flash: b.flash })),
        slings: this.slings.map((s) => ({ verts: s.def.verts, flash: s.flash })),
        targets: this.targetBank.targets.map((t) => ({
          x: DROP_TARGETS.x,
          y: t.y,
          hw: DROP_TARGETS.hw,
          hh: DROP_TARGETS.hh,
          up: t.up,
        })),
        // moons stay lit while collected toward the multiplier; the decay
        // map adds the brighter roll-over flash on top
        rollovers: ROLLOVERS.map((r) => ({
          x: r.x,
          y: r.y,
          lit: Math.max(this.rolloverLit.get(r.id) ?? 0, this.litMoons.has(r.id) ? 0.55 : 0),
        })),
        spinner: { ...SPINNER, angle: this.spinner.angle, spin: this.spinner.spin01 },
      },
      score: this.scoring.total,
      scoreLabel: this.scoring.lastLabel,
      scoreLabelAge: this.scoring.lastLabelAge,
      plungerCharge: this.plungerCharge,
      fps: this.fps,
      dmd: this.dmd.canvas,
      debugShapes: this.tuning.debugOverlay ? this.physics.collectDebugShapes() : undefined,
    };
  }
}
