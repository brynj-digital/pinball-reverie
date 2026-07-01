import { Body, Circle, Fixture, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import type { FixtureTag } from "../core/PhysicsWorld";
import { BALL_RADIUS, TABLE } from "../table/geometry";

export class Ball {
  readonly body: Body;
  private fixture: Fixture;
  private lastDensity: number;

  constructor(world: World, tuning: Tuning) {
    this.body = world.createBody({
      type: "dynamic",
      // bullet = continuous collision detection; the #1 anti-tunnelling measure (plan §4)
      bullet: true,
      position: new Vec2(TABLE.spawn.x, TABLE.spawn.y),
      linearDamping: tuning.ballLinearDamping,
      angularDamping: tuning.ballAngularDamping,
    });
    this.fixture = this.body.createFixture({
      shape: new Circle(BALL_RADIUS),
      density: tuning.ballDensity,
      friction: tuning.ballFriction,
      restitution: tuning.ballRestitution,
      userData: { kind: "ball" } satisfies FixtureTag,
    });
    this.lastDensity = tuning.ballDensity;
  }

  reset(): void {
    this.body.setTransform(new Vec2(TABLE.spawn.x, TABLE.spawn.y), 0);
    this.body.setLinearVelocity(new Vec2(0, 0));
    this.body.setAngularVelocity(0);
  }

  /** Push live debug-panel values into the physics body. */
  applyTuning(t: Tuning): void {
    this.fixture.setFriction(t.ballFriction);
    this.fixture.setRestitution(t.ballRestitution);
    this.body.setLinearDamping(t.ballLinearDamping);
    this.body.setAngularDamping(t.ballAngularDamping);
    if (t.ballDensity !== this.lastDensity) {
      this.fixture.setDensity(t.ballDensity);
      this.body.resetMassData();
      this.lastDensity = t.ballDensity;
    }
  }
}
