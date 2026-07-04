import { Vec2 } from "planck";
import type { Ball } from "./Ball";
import type { Tuning } from "../tuning";
import { KICKER } from "../table/geometry";

/**
 * Kickout scoop (Moondial's telescope): the trip sensor and hood wall live
 * in the playfield SVG; this entity owns the capture → hold → eject cycle.
 * capture() only sets state — every body mutation happens in update(), after
 * the world has stepped, because the sensor fires from a contact callback
 * while the world is locked (setTransform would assert). While held the
 * ball's gravity is switched off and it is eased into the hold point, so the
 * scoop reads as swallowing the ball; eject restores gravity and fires it
 * along KICKER.eject at tuning.kickerEject. The scoop geometry itself never
 * traps — without this logic gravity rolls the ball back out of the mouth.
 */
export class Kicker {
  holding = false;
  /** Runs at the moment of eject (Game adds flash + sfx; the sims don't). */
  onEject?: () => void;
  private holdT = 0;
  private gravityOff = false;
  private cooldown = 0;

  constructor(private holdS: number) {}

  /** Sensor fired: begin a capture unless one is running or just ended. */
  capture(): boolean {
    if (this.holding || this.cooldown > 0) return false;
    this.holding = true;
    this.holdT = this.holdS;
    return true;
  }

  /** Abandon a hold without ejecting (the ball was respawned elsewhere). */
  cancel(ball: Ball): void {
    if (!this.holding) return;
    this.holding = false;
    this.holdT = 0;
    if (this.gravityOff) {
      this.gravityOff = false;
      ball.body.setGravityScale(1);
    }
  }

  update(dt: number, ball: Ball, t: Tuning): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.holding) return;
    const b = ball.body;
    if (!this.gravityOff) {
      this.gravityOff = true;
      b.setGravityScale(0);
    }
    this.holdT -= dt;
    if (this.holdT <= 0) {
      this.holding = false;
      this.gravityOff = false;
      this.cooldown = KICKER.cooldownS;
      b.setGravityScale(1);
      b.setTransform(new Vec2(KICKER.hold.x, KICKER.hold.y), b.getAngle());
      const d = Math.hypot(KICKER.eject.x, KICKER.eject.y);
      b.setLinearVelocity(
        new Vec2((KICKER.eject.x / d) * t.kickerEject, (KICKER.eject.y / d) * t.kickerEject),
      );
      b.setAngularVelocity(0);
      this.onEject?.();
      return;
    }
    // ease toward the hold point (a snap would read as a teleport)
    const p = b.getPosition();
    const k = Math.min(1, dt * 10);
    b.setTransform(
      new Vec2(p.x + (KICKER.hold.x - p.x) * k, p.y + (KICKER.hold.y - p.y) * k),
      b.getAngle(),
    );
    b.setLinearVelocity(new Vec2(0, 0));
    b.setAngularVelocity(0);
  }
}
