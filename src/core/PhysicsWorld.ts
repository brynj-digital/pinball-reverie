import { World, Vec2, Contact, CircleShape, PolygonShape, ChainShape, Settings } from "planck";
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
 * Sensor kinds: drain, rollover, ramp-entry, ramp-exit, spinner.
 * Solid element kinds (emit `hit`): bumper, sling, target.
 */
export interface FixtureTag {
  kind: string;
  id?: string;
}

/** Solid element kinds whose ball contacts become `hit` events. */
const HIT_KINDS = new Set(["bumper", "sling", "target"]);

export class PhysicsWorld {
  readonly world: World;
  private accumulator = 0;
  private postStep: (() => void)[] = [];

  constructor(
    private bus: EventBus,
    tuning: Tuning,
  ) {
    this.world = new World({ gravity: new Vec2(0, effectiveGravity(tuning)) });
    this.world.on("begin-contact", (c: Contact) => this.onBeginContact(c));
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

  /** Advance by real dt, stepping the world in fixed increments. */
  update(dt: number): void {
    this.accumulator += Math.min(dt, 0.1); // cap: avoid spiral of death on tab refocus
    while (this.accumulator >= FIXED_DT) {
      this.world.step(FIXED_DT, 8, 3);
      this.accumulator -= FIXED_DT;
    }
    const queued = this.postStep;
    this.postStep = [];
    for (const fn of queued) fn();
  }

  private onBeginContact(contact: Contact): void {
    const a = contact.getFixtureA().getUserData() as FixtureTag | null;
    const b = contact.getFixtureB().getUserData() as FixtureTag | null;
    if (!a || !b) return;
    const other = a.kind === "ball" ? b : b.kind === "ball" ? a : null;
    if (!other) return;
    const sensorHit =
      contact.getFixtureA().isSensor() || contact.getFixtureB().isSensor();
    if (sensorHit) this.bus.emit("sensor", { kind: other.kind, id: other.id });
    else if (HIT_KINDS.has(other.kind))
      this.bus.emit("hit", { kind: other.kind, id: other.id ?? "" });
  }

  /** Fixture outlines for the debug overlay (plan §5e: non-negotiable). */
  collectDebugShapes(): DebugShape[] {
    const shapes: DebugShape[] = [];
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      for (let f = body.getFixtureList(); f; f = f.getNext()) {
        const sensor = f.isSensor();
        const type = f.getType();
        if (type === "circle") {
          const s = f.getShape() as CircleShape;
          const p = body.getWorldPoint(s.m_p);
          shapes.push({ type: "circle", x: p.x, y: p.y, r: s.m_radius, sensor });
        } else if (type === "polygon" || type === "chain") {
          const verts = (f.getShape() as PolygonShape | ChainShape).m_vertices;
          shapes.push({
            type: "poly",
            pts: verts.map((v) => {
              const p = body.getWorldPoint(v);
              return { x: p.x, y: p.y };
            }),
            closed: type === "polygon",
            sensor,
          });
        }
      }
    }
    return shapes;
  }
}
