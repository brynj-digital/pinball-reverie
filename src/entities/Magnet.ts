import { Vec2 } from "planck";
import type { Ball } from "./Ball";
import type { MagnetDef } from "../table/geometry";

/**
 * Playfield magnet (M12, the Night Mail's mail-hook): while lit (Game polls
 * TableLogic.magnetLit each frame) it pulls a GROUND ball inside def.radius
 * toward its core — pull acceleration falls linearly from def.pull at the
 * core to 0 at the rim — and captures inside def.captureRadius. The hold
 * then plays like a Kicker hold (gravity off, eased onto the core), and
 * after def.holdS the ball is flung along def.fling at def.flingSpeed.
 * Elevated and transiting balls are out of reach: a rider crossing a
 * wireform above the magnet must not be snagged.
 *
 * The pull runs in applyForces() BEFORE each fixed world step (forces are
 * cleared per step, so a per-frame force would only act on the first substep
 * of a multi-step frame); capture/hold/fling body mutations happen in
 * update(), post-step, like Kicker.
 */
export class Magnet {
  /** Armed state, set by Game from TableLogic.magnetLit (default unlit). */
  lit = false;
  holding = false;
  private ball: Ball | null = null;
  /** Runs when the magnet snags the ball (Game adds sfx + logic.onCapture). */
  onCapture?: () => void;
  /** Runs at the moment of fling (Game adds flash + sfx; the sims don't). */
  onRelease?: () => void;
  private holdT = 0;
  private gravityOff = false;
  private cooldown = 0;

  constructor(readonly def: MagnetDef) {}

  /** Is the magnet holding this specific ball (M12 captive guards)? */
  holds(ball: Ball): boolean {
    return this.holding && this.ball === ball;
  }

  /** Abandon a hold without flinging (the ball was respawned elsewhere). */
  cancel(): void {
    if (!this.holding) return;
    this.holding = false;
    this.holdT = 0;
    if (this.gravityOff) {
      this.gravityOff = false;
      this.ball?.body.setGravityScale(1);
    }
    this.ball = null;
  }

  private inReach(ball: Ball): number | null {
    if (ball.height.transiting || ball.height.elevated) return null;
    const p = ball.body.getPosition();
    const d = Math.hypot(this.def.x - p.x, this.def.y - p.y);
    return d <= this.def.radius ? d : null;
  }

  /** Radial pull on every ground ball in reach; call before each fixed
   * world step (Game/sims beforeStep). */
  applyForces(balls: readonly Ball[]): void {
    if (!this.lit || this.holding || this.cooldown > 0) return;
    for (const ball of balls) {
      const d = this.inReach(ball);
      if (d === null || d < 1e-6) continue;
      const a = this.def.pull * (1 - d / this.def.radius);
      if (a <= 0) continue;
      const p = ball.body.getPosition();
      const m = ball.body.getMass();
      ball.body.applyForceToCenter(
        new Vec2(((this.def.x - p.x) / d) * a * m, ((this.def.y - p.y) / d) * a * m),
        true,
      );
    }
  }

  update(dt: number, balls: readonly Ball[]): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.holding) {
      // snag: lit, in reach, inside the capture radius — speed is no defence
      if (this.lit && this.cooldown <= 0) {
        for (const ball of balls) {
          const d = this.inReach(ball);
          if (d !== null && d <= this.def.captureRadius) {
            this.holding = true;
            this.ball = ball;
            this.holdT = this.def.holdS;
            this.onCapture?.();
            break;
          }
        }
      }
      if (!this.holding || !this.ball) return;
    }
    if (!this.ball) return;
    const b = this.ball.body;
    const def = this.def;
    if (!this.gravityOff) {
      this.gravityOff = true;
      b.setGravityScale(0);
    }
    this.holdT -= dt;
    if (this.holdT <= 0) {
      this.holding = false;
      this.gravityOff = false;
      this.cooldown = def.cooldownS;
      b.setGravityScale(1);
      b.setTransform(new Vec2(def.x, def.y), b.getAngle());
      const d = Math.hypot(def.fling.x, def.fling.y) || 1;
      b.setLinearVelocity(
        new Vec2((def.fling.x / d) * def.flingSpeed, (def.fling.y / d) * def.flingSpeed),
      );
      b.setAngularVelocity(0);
      this.ball = null;
      this.onRelease?.();
      return;
    }
    // ease onto the core (a snap would read as a teleport)
    const p = b.getPosition();
    const k = Math.min(1, dt * 12);
    b.setTransform(
      new Vec2(p.x + (def.x - p.x) * k, p.y + (def.y - p.y) * k),
      b.getAngle(),
    );
    b.setLinearVelocity(new Vec2(0, 0));
    b.setAngularVelocity(0);
  }
}
