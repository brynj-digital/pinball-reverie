import { Body, Circle, Vec2, World } from "planck";
import type { PhysicsWorld, FixtureTag } from "../core/PhysicsWorld";
import type { Ball } from "./Ball";
import type { BumperDef } from "../table/geometry";

/**
 * Pop bumper: a static disc that fires the ball radially outward on contact
 * (plus its fixture restitution). The kick is applied post-step — the world
 * is locked during the contact that triggers it.
 *
 * Kicks are jittered (±7° direction, ±8% strength): a perfectly radial kick
 * from a perfect circle creates stable periodic orbits — a ball can bounce
 * between kickers in the same loop forever (observed in play). Real bumper
 * skirts are irregular; the RNG is seeded per-entity so runs stay
 * deterministic for simcheck/soak reproduction.
 */
export class Bumper {
  readonly body: Body;
  /** 1 → 0 render flash, decays in update(). */
  flash = 0;
  private rngState: number;

  constructor(
    world: World,
    readonly def: BumperDef,
  ) {
    this.rngState = 987654321 + def.id.charCodeAt(0) * 7919;
    this.body = world.createBody({ position: new Vec2(def.x, def.y) });
    this.body.createFixture({
      shape: new Circle(def.r),
      restitution: 0.5,
      friction: 0.1,
      userData: { kind: "bumper", id: def.id } satisfies FixtureTag,
    });
  }

  kick(ball: Ball, physics: PhysicsWorld, impulse: number): void {
    this.flash = 1;
    const jitterAngle = (this.rand() - 0.5) * 0.24; // ±~7°
    const strength = impulse * (0.92 + this.rand() * 0.16);
    physics.queuePostStep(() => {
      const bp = ball.body.getPosition();
      const a = Math.atan2(bp.y - this.def.y, bp.x - this.def.x) + jitterAngle;
      ball.body.applyLinearImpulse(
        new Vec2(Math.cos(a) * strength, Math.sin(a) * strength),
        bp,
        true,
      );
    });
  }

  private rand(): number {
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 5);
  }
}
