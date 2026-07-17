import { Body, Circle, Polygon, RevoluteJoint, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import type { FixtureTag } from "../core/PhysicsWorld";
import { FLIPPER, flipperVerts, type FlipperSide, type Pt } from "../table/geometry";

/**
 * Flipper = dynamic body on a revolute joint with motor + angle limits
 * (plan §4). Held at the down-stop by a weak motor; flipping drives a strong
 * motor toward the up-stop.
 *
 * Angle convention (y-down world): the left flipper body is created at its
 * rest angle, so joint angle 0 = rest and -sweep = fully up. Mirrored for the
 * right flipper (0 = rest, +sweep = up).
 */
export class Flipper {
  readonly body: Body;
  readonly joint: RevoluteJoint;
  /** True once the up-stroke has reached the stop; motor switches to hold mode. */
  private holding = false;

  constructor(
    world: World,
    tableBody: Body,
    readonly side: FlipperSide,
    tuning: Tuning,
    pivot: Pt,
    /**
     * M15 (Summit's terrace): optional height band (metres) — the bat only
     * touches balls inside it, gated by PhysicsWorld's pre-solve like any
     * banded wall. Ground flippers omit it (always solid at ball height).
     */
    zBand?: { min: number; max: number },
  ) {
    const restAngle = side === "left" ? FLIPPER.restAngle : -FLIPPER.restAngle;

    this.body = world.createBody({
      type: "dynamic",
      position: new Vec2(pivot.x, pivot.y),
      angle: restAngle,
    });
    const tag: FixtureTag = zBand
      ? { kind: "flipper", zMin: zBand.min, zMax: zBand.max }
      : { kind: "flipper" };
    this.body.createFixture({
      shape: new Polygon(flipperVerts(side).map((p) => new Vec2(p.x, p.y))),
      density: 60, // ~0.1 kg — realistic flipper mass at this scale
      friction: 0.1,
      restitution: 0.08,
      userData: tag,
    });
    // round base over the pivot: closes the wall–flipper notch that traps the ball
    this.body.createFixture({
      shape: new Circle(FLIPPER.baseRadius),
      density: 60,
      friction: 0.1,
      restitution: 0.08,
      userData: tag,
    });

    this.joint = world.createJoint(
      new RevoluteJoint(
        {
          enableLimit: true,
          lowerAngle: side === "left" ? -FLIPPER.sweep : 0,
          upperAngle: side === "left" ? 0 : FLIPPER.sweep,
          enableMotor: true,
          motorSpeed: 0,
          maxMotorTorque: tuning.flipperMaxTorque,
        },
        tableBody,
        this.body,
        new Vec2(pivot.x, pivot.y),
      ),
    )!;
  }

  /**
   * Call every frame with the current input state and live tuning.
   *
   * Two motor regimes, like a real flipper's stroke coil vs hold coil: full
   * speed toward the up-stop while flipping, then once the stop is reached,
   * motor speed 0 — the motor brakes against any deflection instead of
   * chasing 30 rad/s, so a ball landing on a raised flipper rests (cradles)
   * rather than being slapped away by the recovery slam.
   */
  update(pressed: boolean, t: Tuning): void {
    const up = this.side === "left" ? -1 : 1;
    if (!pressed) {
      this.holding = false;
    } else if (Math.abs(this.joint.getJointAngle() - up * FLIPPER.sweep) < 0.03) {
      this.holding = true; // latched until release, even if a hit deflects the bat
    }
    this.joint.setMaxMotorTorque(t.flipperMaxTorque);
    this.joint.setMotorSpeed(
      pressed ? (this.holding ? 0 : up * t.flipperUpSpeed) : -up * t.flipperDownSpeed,
    );
  }
}
