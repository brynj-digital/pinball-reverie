import {
  World,
  Vec2,
  Body,
  Contact,
  CircleShape,
  PolygonShape,
  ChainShape,
  Settings,
} from "planck";
import { EventBus } from "./EventBus";
import type { Tuning } from "../tuning";
import { effectiveGravity } from "../tuning";
import type { DebugShape } from "../render/Renderer";

/**
 * Box2D's tolerances (5 mm linear slop, 10 mm polygon/edge skin, 1 m/s
 * elastic-collision threshold) assume 0.1–10 m bodies. Our ball is 27 mm, so
 * at the defaults it visibly floats above surfaces on a centimetre of skin,
 * ball-sized gaps close up into traps, and every sub-1 m/s bounce is killed
 * dead. Set the raw values, not Settings.lengthUnitsPerMeter — planck's
 * polygonRadius is derived as 2 * linearSlop WITHOUT the unit scale, so the
 * skin never shrinks that way. Shapes capture their skin at construction, so
 * this must run before any fixture is created (module scope guarantees it).
 */
Settings.linearSlop = 0.00025; // → polygon/edge skin 0.5 mm
Settings.velocityThreshold = 0.05; // bounces above 0.05 m/s stay elastic
Settings.aabbExtension = 0.005;
Settings.linearSleepTolerance = 0.0005;
Settings.maxLinearCorrection = 0.01;

/** Physics steps at a fixed 1/120 s regardless of frame rate (plan §4). */
export const FIXED_DT = 1 / 120;

/**
 * userData attached to every fixture so contacts can be routed to events.
 * Sensor kinds: drain, rollover, ramp-entry, ramp-exit, spinner, kicker,
 * subway, lane. Solid element kinds (emit `hit`): bumper, sling, target.
 * M11 height fields: solid fixtures may declare a full-height wall (zAll)
 * or membership of an elevated surface (surfaceName — the band follows the
 * local surface height, resolved by the pre-solve gate); sensors may carry
 * a zMin/zMax admission band, checked by the event consumers.
 */
export interface FixtureTag {
  kind: string;
  id?: string;
  /** Which ball this fixture is (M12 multiball): index into the live set.
   * Contacts and sensor events resolve height/routing per ball. */
  ballId?: number;
  /** Full-height wall: the shell / lane wall (cabinet glass). */
  zAll?: boolean;
  /** Elevated-surface rail: band follows the local surface height. */
  surfaceName?: string;
  /** Sensor admission band (m above the playfield plane). */
  zMin?: number;
  zMax?: number;
}

/** Solid element kinds whose ball contacts become `hit` events. */
const HIT_KINDS = new Set(["bumper", "sling", "target"]);

export class PhysicsWorld {
  readonly world: World;
  private accumulator = 0;
  private postStep: (() => void)[] = [];

  /**
   * M11 height gate: return false to disable a solid ball contact this step
   * (a rail above/below the ball). Installed by Game/the sims with the
   * table's surfaces + the ball's HeightState. Pre-solve runs every step a
   * contact persists and Box2D re-enables contacts each step, so the gate
   * tracks a climbing ball with no refiltering. M12 multiball: the BALL
   * fixture's tag rides along so the gate can use that ball's own height.
   */
  private zGate?: (
    tag: FixtureTag,
    ballX: number,
    ballY: number,
    ballTag?: FixtureTag,
  ) => boolean;

  constructor(
    private bus: EventBus,
    tuning: Tuning,
  ) {
    this.world = new World({ gravity: new Vec2(0, effectiveGravity(tuning)) });
    this.world.on("begin-contact", (c: Contact) => this.onBeginContact(c));
    this.world.on("pre-solve", (c: Contact) => {
      if (!this.zGate) return;
      const a = c.getFixtureA();
      const b = c.getFixtureB();
      const ta = a.getUserData() as FixtureTag | null;
      const tb = b.getUserData() as FixtureTag | null;
      const ballFix = ta?.kind === "ball" ? a : tb?.kind === "ball" ? b : null;
      if (!ballFix) return;
      const other = (ballFix === a ? tb : ta) ?? { kind: "wall" };
      const ballTag = (ballFix.getUserData() as FixtureTag | null) ?? undefined;
      const p = ballFix.getBody().getPosition();
      if (!this.zGate(other, p.x, p.y, ballTag)) c.setEnabled(false);
    });
  }

  setZGate(
    fn: (tag: FixtureTag, ballX: number, ballY: number, ballTag?: FixtureTag) => boolean,
  ): void {
    this.zGate = fn;
  }

  setSlope(tuning: Tuning): void {
    this.world.setGravity(new Vec2(0, effectiveGravity(tuning)));
  }

  /**
   * Defer a world mutation (create/destroy fixtures, teleports, impulses in
   * response to contacts) until after stepping — the world is locked during
   * contact callbacks.
   */
  queuePostStep(fn: () => void): void {
    this.postStep.push(fn);
  }

  /**
   * Advance by real dt, stepping the world in fixed increments.
   *
   * `beforeStep` runs before each step so the caller can snapshot the
   * previous state; the return value is the accumulator fraction (0..1) —
   * render bodies at lerp(prev, current, alpha) for judder-free motion.
   * Frames consume 1–3 steps unevenly; without interpolation the ball (and
   * the camera following it) advances in visibly irregular time quanta.
   */
  update(dt: number, beforeStep?: () => void, afterStep?: () => void): number {
    this.accumulator += Math.min(dt, 0.1); // cap: avoid spiral of death on tab refocus
    while (this.accumulator >= FIXED_DT) {
      beforeStep?.();
      this.world.step(FIXED_DT, 8, 3);
      this.accumulator -= FIXED_DT;
      // Flush between steps, not once per frame: a kick held to the end of
      // a 3-step frame acts on a ball two steps past the contact that
      // queued it.
      this.flushPostStep();
      // M11: height-state integration (support resolution, z) per step
      afterStep?.();
    }
    this.flushPostStep(); // work queued outside stepping still runs this frame
    return this.accumulator / FIXED_DT;
  }

  private flushPostStep(): void {
    while (this.postStep.length) {
      const queued = this.postStep;
      this.postStep = [];
      for (const fn of queued) fn();
    }
  }

  private onBeginContact(contact: Contact): void {
    const a = contact.getFixtureA().getUserData() as FixtureTag | null;
    const b = contact.getFixtureB().getUserData() as FixtureTag | null;
    if (!a || !b) return;
    const other = a.kind === "ball" ? b : b.kind === "ball" ? a : null;
    if (!other) return;
    const ballTag = a.kind === "ball" ? a : b;
    const sensorHit =
      contact.getFixtureA().isSensor() || contact.getFixtureB().isSensor();
    if (sensorHit) {
      this.bus.emit("sensor", {
        kind: other.kind,
        id: other.id,
        zMin: other.zMin,
        zMax: other.zMax,
        ballId: ballTag.ballId,
      });
    } else if (HIT_KINDS.has(other.kind)) {
      // begin-contact fires even when the pre-solve height gate disables
      // the contact — a ball riding a ramp over a bumper must not emit a
      // hit (or be kicked). Apply the same gate to the event.
      if (this.zGate) {
        const ballFix = (a?.kind === "ball" ? contact.getFixtureA() : contact.getFixtureB());
        const p = ballFix.getBody().getPosition();
        if (!this.zGate(other, p.x, p.y, ballTag)) return;
      }
      this.bus.emit("hit", { kind: other.kind, id: other.id ?? "", ballId: ballTag.ballId });
    }
  }

  /**
   * Sensor tags currently touching `body` (M11 resense: when the ball's
   * height changes INSIDE a zone — e.g. it lands in a lane slot after a
   * bell drop — begin-contact already fired and was height-gated away, so
   * the consumer re-checks the touching set against the new z).
   */
  sensorsTouching(body: Body): FixtureTag[] {
    const out: FixtureTag[] = [];
    for (let ce = body.getContactList(); ce; ce = ce.next) {
      if (!ce.contact.isTouching()) continue;
      const fa = ce.contact.getFixtureA();
      const fb = ce.contact.getFixtureB();
      const other = fa.getBody() === body ? fb : fa;
      if (!other.isSensor()) continue;
      const tag = other.getUserData() as FixtureTag | null;
      if (tag) out.push(tag);
    }
    return out;
  }

  private staticShapeCache: DebugShape[] | null = null;
  private staticFixtureCount = -1;

  /**
   * Fixture outlines for the debug overlay (plan §5e: non-negotiable).
   * Static bodies never move, so their shapes are cached and rebuilt only
   * when the static fixture count changes (drop targets destroy/recreate);
   * only dynamic bodies (ball, flippers) are recomputed per frame.
   */
  collectDebugShapes(): DebugShape[] {
    let staticCount = 0;
    for (let body = this.world.getBodyList(); body; body = body.getNext())
      if (body.isStatic()) for (let f = body.getFixtureList(); f; f = f.getNext()) staticCount++;

    if (!this.staticShapeCache || staticCount !== this.staticFixtureCount) {
      this.staticShapeCache = [];
      for (let body = this.world.getBodyList(); body; body = body.getNext())
        if (body.isStatic()) this.collectBodyShapes(body, this.staticShapeCache);
      this.staticFixtureCount = staticCount;
    }

    const shapes = this.staticShapeCache.slice();
    for (let body = this.world.getBodyList(); body; body = body.getNext())
      if (!body.isStatic()) this.collectBodyShapes(body, shapes);
    return shapes;
  }

  private collectBodyShapes(body: Body, out: DebugShape[]): void {
    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      const sensor = f.isSensor();
      // color elevated-surface rails differently in the debug overlay (M11)
      const tag = f.getUserData() as FixtureTag | null;
      const layer = tag?.surfaceName ? 1 : 0;
      const type = f.getType();
      if (type === "circle") {
        const s = f.getShape() as CircleShape;
        const p = body.getWorldPoint(s.m_p);
        out.push({ type: "circle", x: p.x, y: p.y, r: s.m_radius, sensor, layer });
      } else if (type === "polygon" || type === "chain") {
        const verts = (f.getShape() as PolygonShape | ChainShape).m_vertices;
        out.push({
          type: "poly",
          pts: verts.map((v) => {
            const p = body.getWorldPoint(v);
            return { x: p.x, y: p.y };
          }),
          closed: type === "polygon",
          sensor,
          layer,
        });
      }
    }
  }
}
