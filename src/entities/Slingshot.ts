import { Body, Polygon, Vec2, World } from "planck";
import type { PhysicsWorld, FixtureTag } from "../core/PhysicsWorld";
import type { Ball } from "./Ball";
import type { SlingDef } from "../table/geometry";

/**
 * Slingshot: static triangle above the inlane that kicks the ball along its
 * face normal on any contact. Cooldown stops one visit double-firing.
 *
 * Kicks are jittered (±7° direction, ±8% strength) for the same reason as
 * the bumpers: two slings with fixed kick vectors can ping-pong a ball on
 * the identical parabola indefinitely (observed in play as a stuck loop).
 * Per-entity seeded RNG keeps runs deterministic.
 */
export class Slingshot {
  readonly body: Body;
  flash = 0;
  private cooldown = 0;
  private rngState: number;

  constructor(
    world: World,
    readonly def: SlingDef,
  ) {
    this.rngState = 456789123 + def.id.charCodeAt(0) * 6271;
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
    const a = Math.atan2(this.def.kick.y, this.def.kick.x) + (this.rand() - 0.5) * 0.24;
    const strength = impulse * (0.92 + this.rand() * 0.16);
    physics.queuePostStep(() => {
      ball.body.applyLinearImpulse(
        new Vec2(Math.cos(a) * strength, Math.sin(a) * strength),
        ball.body.getPosition(),
        true,
      );
    });
    return true;
  }

  private rand(): number {
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
  }
}
