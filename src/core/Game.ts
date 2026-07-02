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

/**
 * Main loop: fixed-timestep physics, snapshot handed to the renderer each
 * animation frame. Game never knows which Renderer implementation it drives
 * (plan §3). State machine (attract/play/ball-saver/game-over) lands in M4 —
 * for M1 there is one ball that respawns on drain.
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
    this.panel = new TuningPanel(this.tuning);

    this.bus.on("sensor", ({ kind, id }) => {
      // Drain starts a short visible fall-out (ball keeps simulating, fades,
      // then respawns) instead of teleporting away the instant the sensor
      // fires — the sensor sits above the floor, mid-drop.
      if (kind === "drain" && this.drainTimer <= 0) this.drainTimer = 0.7;
      else if (kind === "spinner") this.spinner.trip(this.ball.body.getLinearVelocity().y);
      else if (kind === "rollover" && id) this.rolloverLit.set(id, 1);
    });
    this.bus.on("hit", ({ kind, id }) => {
      if (kind === "bumper")
        this.bumpers
          .find((b) => b.def.id === id)
          ?.kick(this.ball, this.physics, this.tuning.bumperKick);
      else if (kind === "sling")
        this.slings
          .find((s) => s.def.id === id)
          ?.kick(this.ball, this.physics, this.tuning.slingKick);
      else if (kind === "target") this.targetBank.onHit(id);
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

    this.flippers[0].update(s.left || this.input.consumeTap("left"), t);
    this.flippers[1].update(s.right || this.input.consumeTap("right"), t);
    this.updatePlunger(dt, s.plunger, t);

    for (const b of this.bumpers) b.update(dt);
    for (const sl of this.slings) sl.update(dt);
    this.targetBank.update(dt);
    this.spinner.update(dt);
    this.scoring.update(dt);
    for (const [id, v] of this.rolloverLit) this.rolloverLit.set(id, Math.max(0, v - dt * 2));

    this.physics.update(dt);

    if (this.drainTimer > 0) {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) this.respawn();
    }

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
        rollovers: ROLLOVERS.map((r) => ({
          x: r.x,
          y: r.y,
          lit: this.rolloverLit.get(r.id) ?? 0,
        })),
        spinner: { ...SPINNER, angle: this.spinner.angle, spin: this.spinner.spin01 },
      },
      score: this.scoring.total,
      scoreLabel: this.scoring.lastLabel,
      scoreLabelAge: this.scoring.lastLabelAge,
      plungerCharge: this.plungerCharge,
      fps: this.fps,
      debugShapes: this.tuning.debugOverlay ? this.physics.collectDebugShapes() : undefined,
    };
  }
}
