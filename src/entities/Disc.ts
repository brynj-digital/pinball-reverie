import { Vec2 } from "planck";
import type { Ball } from "./Ball";
import type { DiscDef } from "../table/geometry";

/**
 * Rotating floor disc (M12, the Night Mail's roundhouse turntable): a flush
 * patch of playfield that spins under the ball. A GROUND ball inside the
 * disc is coupled toward the disc's surface velocity (ω × r about the
 * centre) by a friction-like force — rate def.grip, acceleration capped at
 * def.maxAccel — so a parked disc (spin 0) is inert field and a spinning one
 * flings crossers tangentially. No fixture: the disc is pure force field +
 * art, like the M11 slope feedback it is modelled on.
 *
 * Spin rate comes from TableLogic.discSpin (Game polls per frame; signed
 * rad/s). Forces run in applyForces() before each fixed step (Box2D clears
 * forces per step); update() only integrates the render angle.
 */
export class Disc {
  /** Signed spin rate (rad/s), set by Game from TableLogic.discSpin. */
  spin = 0;
  /** Accumulated rotation (rad) — render only. */
  angle = 0;

  constructor(readonly def: DiscDef) {}

  update(dt: number): void {
    this.angle += this.spin * dt;
  }

  /** Surface-velocity coupling on every ground ball crossing the disc;
   * call before each fixed world step. */
  applyForces(balls: readonly Ball[]): void {
    if (this.spin === 0) return;
    for (const ball of balls) this.applyTo(ball);
  }

  private applyTo(ball: Ball): void {
    if (ball.height.transiting || ball.height.elevated) return;
    const p = ball.body.getPosition();
    const rx = p.x - this.def.x;
    const ry = p.y - this.def.y;
    if (Math.hypot(rx, ry) > this.def.r) return;
    // surface velocity of the disc under the ball: ω × r (z-axis spin)
    const sx = -this.spin * ry;
    const sy = this.spin * rx;
    const v = ball.body.getLinearVelocity();
    let ax = (sx - v.x) * this.def.grip;
    let ay = (sy - v.y) * this.def.grip;
    const a = Math.hypot(ax, ay);
    if (a > this.def.maxAccel) {
      ax = (ax / a) * this.def.maxAccel;
      ay = (ay / a) * this.def.maxAccel;
    }
    const m = ball.body.getMass();
    ball.body.applyForceToCenter(new Vec2(ax * m, ay * m), true);
  }
}
