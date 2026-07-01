import { Body, Polygon, Vec2, World } from "planck";
import type { PhysicsWorld, FixtureTag } from "../core/PhysicsWorld";
import type { Ball } from "./Ball";
import type { SlingDef } from "../table/geometry";

/**
 * Slingshot: static triangle above the inlane that kicks the ball along its
 * face normal on any contact. Cooldown stops one visit double-firing.
 */
export class Slingshot {
  readonly body: Body;
  flash = 0;
  private cooldown = 0;

  constructor(
    world: World,
    readonly def: SlingDef,
  ) {
    this.body = world.createBody();
    this.body.createFixture({
      shape: new Polygon(def.verts.map((p) => new Vec2(p.x, p.y))),
      restitution: 0.3,
      friction: 0.1,
      userData: { kind: "sling", id: def.id } satisfies FixtureTag,
    });
  }

  kick(ball: Ball, physics: PhysicsWorld, impulse: number): boolean {
    if (this.cooldown > 0) return false;
    this.cooldown = 0.12;
    this.flash = 1;
    physics.queuePostStep(() => {
      ball.body.applyLinearImpulse(
        new Vec2(this.def.kick.x * impulse, this.def.kick.y * impulse),
        ball.body.getPosition(),
        true,
      );
    });
    return true;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
  }
}
