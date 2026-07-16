import { Vec2 } from "planck";
import type { Ball } from "./Ball";
import type { LiftDef } from "../table/geometry";
import type { HeightProfile } from "../table/SvgCollision";

/**
 * Scripted lift (M12, the Night Mail's incline): the above-field sibling of
 * Subway. sensor-lift-<id> trips the capture (lit-gated by
 * TableLogic.kickerLit, like kickers and subways); after an optional dwell
 * (the banking engine coupling on) the ball is carried along
 * height-profile-<id> at constant speed with its z FOLLOWING the profile
 * height — renderers see a real slow climb, and height-banded collision
 * keeps ignoring field furniture passing below. At the far end the ball is
 * released AIRBORNE at the profile's hTo with exitSpeed along the final
 * segment: a genuine M11 ballistic hand-off that lands on the best surface
 * below (or rolls on at a summit surface's own height).
 *
 * capture() only sets state; body mutations happen in update(), post-step,
 * for the same world-locked reason as Kicker/Subway.
 */
export class Lift {
  active = false;
  /** Runs at the moment of release (Game adds flash + sfx; the sims don't). */
  onEject?: () => void;
  private ball: Ball | null = null;
  private s = 0; // arc-length position along the path (m)
  private dwellT = 0;
  private started = false;
  private cooldown = 0;
  private readonly total: number;

  constructor(
    readonly def: LiftDef,
    private path: HeightProfile,
  ) {
    this.total = path.cumLen[path.cumLen.length - 1];
  }

  /** Is this carry holding this specific ball (M12 captive guards)? */
  carries(ball: Ball): boolean {
    return this.active && this.ball === ball;
  }

  capture(ball: Ball): boolean {
    if (this.active || this.cooldown > 0) return false;
    this.active = true;
    this.ball = ball;
    this.started = false;
    this.dwellT = this.def.dwellS;
    this.s = 0;
    return true;
  }

  /** Abandon a carry (the ball was respawned elsewhere). */
  cancel(): void {
    if (!this.active) return;
    this.active = false;
    if (this.started && this.ball) {
      this.ball.body.setGravityScale(1);
      this.ball.height.endTransit();
    }
    this.ball = null;
  }

  private pointAt(s: number): { x: number; y: number } {
    const pts = this.path.pts;
    const cum = this.path.cumLen;
    for (let i = 1; i < pts.length; i++) {
      if (s <= cum[i] || i === pts.length - 1) {
        const seg = cum[i] - cum[i - 1] || 1;
        const u = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
        };
      }
    }
    return pts[pts.length - 1];
  }

  private heightAt(s: number): number {
    const u = this.total > 0 ? Math.max(0, Math.min(1, s / this.total)) : 1;
    return this.path.hFrom + (this.path.hTo - this.path.hFrom) * u;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active || !this.ball) return;
    const ball = this.ball;
    const b = ball.body;
    if (!this.started) {
      this.started = true;
      b.setGravityScale(0);
      ball.height.beginTransit(this.heightAt(0));
    }
    if (this.dwellT > 0) {
      this.dwellT -= dt;
    } else {
      this.s += this.def.speed * dt;
    }
    if (this.s >= this.total) {
      // release airborne along the final segment direction, at hTo
      this.active = false;
      this.cooldown = 0.5;
      const pts = this.path.pts;
      const a = pts[pts.length - 2];
      const e = pts[pts.length - 1];
      const d = Math.hypot(e.x - a.x, e.y - a.y) || 1;
      b.setGravityScale(1);
      ball.height.transitTo(this.heightAt(this.total));
      ball.height.endTransitAirborne();
      b.setTransform(new Vec2(e.x, e.y), b.getAngle());
      b.setLinearVelocity(
        new Vec2(((e.x - a.x) / d) * this.def.exitSpeed, ((e.y - a.y) / d) * this.def.exitSpeed),
      );
      b.setAngularVelocity(0);
      this.ball = null;
      this.onEject?.();
      return;
    }
    ball.height.transitTo(this.heightAt(this.s));
    const p = this.pointAt(this.s);
    const cur = b.getPosition();
    const k = Math.min(1, dt * 14); // ease into the cradle, then track it
    b.setTransform(new Vec2(cur.x + (p.x - cur.x) * k, cur.y + (p.y - cur.y) * k), b.getAngle());
    b.setLinearVelocity(new Vec2(0, 0));
    b.setAngularVelocity(0);
  }
}
