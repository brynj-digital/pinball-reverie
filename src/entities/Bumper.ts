import { Body, Circle, Vec2, World } from "planck";
import type { PhysicsWorld, FixtureTag } from "../core/PhysicsWorld";
import type { Ball } from "./Ball";
import type { BumperDef } from "../table/geometry";

/**
 * Pop bumper: a static disc that fires the ball radially outward on contact
 * (plus its fixture restitution). The kick is applied post-step — the world
 * is locked during the contact that triggers it.
 */
export class Bumper {
  readonly body: Body;
  /** 1 → 0 render flash, decays in update(). */
  flash = 0;

  constructor(
    world: World,
    readonly def: BumperDef,
  ) {
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
    physics.queuePostStep(() => {
      const bp = ball.body.getPosition();
      const dx = bp.x - this.def.x;
      const dy = bp.y - this.def.y;
      const len = Math.hypot(dx, dy) || 1;
      ball.body.applyLinearImpulse(
        new Vec2((dx / len) * impulse, (dy / len) * impulse),
        bp,
        true,
      );
    });
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 5);
  }
}
