import { Body, Circle, Fixture, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import {
  CAT_BALL,
  ballMaskForLayer,
  type FixtureTag,
  type PhysicsWorld,
  type SensorBounds,
} from "../core/PhysicsWorld";
import { BALL_RADIUS, type Pt } from "../table/geometry";

export class Ball {
  readonly body: Body;
  /** Collision layer (M10): 0 main field, 1 raised rails, -1 subway transit. */
  layer = 0;
  private fixture: Fixture;
  private lastDensity: number;

  constructor(
    world: World,
    tuning: Tuning,
    private spawn: Pt,
  ) {
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
      filterCategoryBits: CAT_BALL,
      filterMaskBits: ballMaskForLayer(0),
      userData: { kind: "ball" } satisfies FixtureTag,
    });
    this.lastDensity = tuning.ballDensity;
  }

  /**
   * Queue the layer switch for a layer-sensor contact. The guard rules live
   * here so Game and the headless sims can't drift:
   *
   * - up-only sensors ignore a ball that isn't moving up-table (open-field
   *   ramp entries vs sideways strays, STYLE-GUIDE §4);
   * - at application the ball must still be inside the zone. begin-contact
   *   fires the moment the ball's edge touches the zone's skin, so a fast
   *   ball grazing a corner (a sling ricochet, not a ramp shot) would
   *   otherwise switch OUTSIDE the target layer's walls and ghost through
   *   the field — or clean off the table. x is strict (the zone is authored
   *   to span its corridor's interior); y gets ball radius + one fast
   *   step's travel of slack, since the switch lands up to a step after
   *   first contact.
   */
  queueLayerSwitch(
    physics: PhysicsWorld,
    s: { toLayer?: number; upOnly?: boolean; bounds?: SensorBounds },
  ): void {
    if (s.toLayer === undefined) return;
    if (s.upOnly && this.body.getLinearVelocity().y >= -0.2) return;
    const to = s.toLayer;
    const bounds = s.bounds;
    physics.queuePostStep(() => {
      if (bounds) {
        const p = this.body.getPosition();
        if (
          Math.abs(p.x - bounds.cx) > bounds.hw ||
          Math.abs(p.y - bounds.cy) > bounds.hh + BALL_RADIUS + 0.035
        )
          return;
      }
      this.setLayer(to);
    });
  }

  /**
   * Switch the ball's collision layer (M10). Call from a post-step queue —
   * the world is locked during the sensor contact that triggers it.
   */
  setLayer(layer: number): void {
    if (layer === this.layer) return;
    this.layer = layer;
    this.fixture.setFilterData({
      groupIndex: 0,
      categoryBits: CAT_BALL,
      maskBits: ballMaskForLayer(layer),
    });
  }

  reset(): void {
    this.setLayer(0);
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
