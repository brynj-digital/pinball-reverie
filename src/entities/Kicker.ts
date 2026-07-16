import { Vec2 } from "planck";
import type { Ball } from "./Ball";
import type { Tuning } from "../tuning";
import type { KickerDef } from "../table/geometry";

/**
 * Kickout scoop / kickback: the trip sensor and any hood wall live in the
 * playfield SVG; this entity owns the capture → hold → eject cycle from its
 * KickerDef (Moondial's telescope, Tidebreaker's dive bell + escape hatch).
 * capture(ball) only sets state — every body mutation happens in update(),
 * after the world has stepped, because the sensor fires from a contact
 * callback while the world is locked (setTransform would assert). While
 * held the ball's gravity is switched off and it is eased into the hold
 * point, so the scoop reads as swallowing the ball; eject restores gravity
 * and fires it along def.eject at def.ejectSpeed ?? tuning.kickerEject. The
 * scoop geometry itself never traps — without this logic gravity rolls the
 * ball back out of the mouth. M12 multiball: the captured Ball is stored,
 * so a scoop can swallow any live ball.
 */
export class Kicker {
  holding = false;
  /** Runs at the moment of eject (Game adds flash + sfx; the sims don't). */
  onEject?: () => void;
  private ball: Ball | null = null;
  private holdT = 0;
  private gravityOff = false;
  private cooldown = 0;
  /** M12 video-mode framework: while set, the hold never times out — the
   * scoop keeps the ball for the duration of a DMD video mode. */
  private holdOpen = false;

  constructor(readonly def: KickerDef) {}

  /** Keep holding past def.holdS until release() (only while holding). */
  beginExtendedHold(): void {
    if (this.holding) this.holdOpen = true;
  }

  /** End an extended hold: the normal eject fires on the next update. */
  release(): void {
    if (!this.holdOpen) return;
    this.holdOpen = false;
    this.holdT = Math.min(this.holdT, 0);
  }

  /** Is this scoop holding this specific ball (M12 captive guards)? */
  holds(ball: Ball): boolean {
    return this.holding && this.ball === ball;
  }

  /** The ball this scoop is holding, if any (M12 physical-lock transfer). */
  get heldBall(): Ball | null {
    return this.holding ? this.ball : null;
  }

  /** Sensor fired: begin a capture unless one is running or just ended. */
  capture(ball: Ball): boolean {
    if (this.holding || this.cooldown > 0) return false;
    this.holding = true;
    this.ball = ball;
    this.holdT = this.def.holdS;
    return true;
  }

  /** Abandon a hold without ejecting (the ball was respawned elsewhere). */
  cancel(): void {
    if (!this.holding) return;
    this.holding = false;
    this.holdT = 0;
    this.holdOpen = false;
    if (this.gravityOff) {
      this.gravityOff = false;
      this.ball?.body.setGravityScale(1);
    }
    this.ball = null;
  }

  update(dt: number, t: Tuning): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.holding || !this.ball) return;
    const def = this.def;
    const b = this.ball.body;
    if (!this.gravityOff) {
      this.gravityOff = true;
      b.setGravityScale(0);
    }
    this.holdT -= dt;
    if (this.holdOpen && this.holdT <= 0.2) this.holdT = 0.2;
    if (this.holdT <= 0) {
      this.holding = false;
      this.gravityOff = false;
      this.cooldown = def.cooldownS;
      b.setGravityScale(1);
      b.setTransform(new Vec2(def.hold.x, def.hold.y), b.getAngle());
      const speed = def.ejectSpeed ?? t.kickerEject;
      const d = Math.hypot(def.eject.x, def.eject.y);
      b.setLinearVelocity(
        new Vec2((def.eject.x / d) * speed, (def.eject.y / d) * speed),
      );
      b.setAngularVelocity(0);
      this.ball = null;
      this.onEject?.();
      return;
    }
    // ease toward the hold point (a snap would read as a teleport)
    const p = b.getPosition();
    const k = Math.min(1, dt * 10);
    b.setTransform(
      new Vec2(p.x + (def.hold.x - p.x) * k, p.y + (def.hold.y - p.y) * k),
      b.getAngle(),
    );
    b.setLinearVelocity(new Vec2(0, 0));
    b.setAngularVelocity(0);
  }
}
