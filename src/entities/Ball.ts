import { Body, Circle, Fixture, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import { type FixtureTag } from "../core/PhysicsWorld";
import { HeightState, type Surface } from "../table/Surfaces";
import { BALL_RADIUS, type Pt } from "../table/geometry";

export class Ball {
  readonly body: Body;
  /**
   * True height state (M11): z, supporting surface, airborne fall. Owned
   * here so Game and the headless sims share one implementation; stepped by
   * their fixed-step callbacks (applyForces before world.step, step after).
   */
  readonly height: HeightState;
  private fixture: Fixture;
  private lastDensity: number;

  constructor(
    world: World,
    tuning: Tuning,
    private spawn: Pt,
    surfaces: readonly Surface[] = [],
  ) {
    this.height = new HeightState(surfaces);
    this.body = world.createBody({
      type: "dynamic",
      // bullet = continuous collision detection; the #1 anti-tunnelling measure (plan §4)
      bullet: true,
      position: new Vec2(spawn.x, spawn.y),
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

  /**
   * Render/back-compat view of the height state: 1 riding (or flying over)
   * an elevated surface, -1 in a subway transit, 0 on the field.
   */
  get layer(): number {
    if (this.height.transiting) return -1;
    return this.height.elevated ? 1 : 0;
  }

  reset(): void {
    this.height.reset();
    this.body.setTransform(new Vec2(this.spawn.x, this.spawn.y), 0);
    this.body.setLinearVelocity(new Vec2(0, 0));
    this.body.setAngularVelocity(0);
    this.body.setGravityScale(1);
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
