import { Vec2 } from "planck";
import type { Ball } from "./Ball";
import type { SubwayDef } from "../table/geometry";
import type { HeightProfile } from "../table/SvgCollision";

/**
 * Under-playfield transit (M10, Tidebreaker's trench + gutter): a scripted
 * carry along the table's height-profile-<id> polyline. Physics stays planar
 * (plan §7) — while transiting, the ball is gravity-free on layer -1 (it
 * collides with nothing but the drain) and is eased along the path; at the
 * far end gravity returns and the ball is ejected along the final segment.
 * Renderers read Ball.layer + the profile height to draw the sunken run.
 *
 * capture() only sets state; body mutations happen in update(), post-step,
 * for the same world-locked reason as Kicker.
 */
export class Subway {
  active = false;
  /** Runs at the moment of eject (Game adds flash + sfx; the sims don't). */
  onEject?: () => void;
  private s = 0; // arc-length position along the path (m)
  private started = false;
  private cooldown = 0;
  private readonly total: number;

  constructor(
    readonly def: SubwayDef,
    private path: HeightProfile,
  ) {
    this.total = path.cumLen[path.cumLen.length - 1];
  }

  capture(): boolean {
    if (this.active || this.cooldown > 0) return false;
    this.active = true;
    this.started = false;
    this.s = 0;
    return true;
  }

  /** Abandon a transit (the ball was respawned elsewhere). */
  cancel(ball: Ball): void {
    if (!this.active) return;
    this.active = false;
    if (this.started) {
      ball.body.setGravityScale(1);
      ball.height.endTransit();
    }
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

  update(dt: number, ball: Ball): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) return;
    const b = ball.body;
    if (!this.started) {
      this.started = true;
      b.setGravityScale(0);
      ball.height.beginTransit(this.path.hFrom);
    }
    this.s += this.def.speed * dt;
    if (this.s >= this.total) {
      // eject along the final segment direction
      this.active = false;
      this.cooldown = 0.5;
      const pts = this.path.pts;
      const a = pts[pts.length - 2];
      const e = pts[pts.length - 1];
      const d = Math.hypot(e.x - a.x, e.y - a.y) || 1;
      b.setGravityScale(1);
      ball.height.endTransit();
      b.setTransform(new Vec2(e.x, e.y), b.getAngle());
      b.setLinearVelocity(
        new Vec2(((e.x - a.x) / d) * this.def.exitSpeed, ((e.y - a.y) / d) * this.def.exitSpeed),
      );
      b.setAngularVelocity(0);
      this.onEject?.();
      return;
    }
    const p = this.pointAt(this.s);
    const cur = b.getPosition();
    const k = Math.min(1, dt * 14); // ease onto the rail, then track it
    b.setTransform(new Vec2(cur.x + (p.x - cur.x) * k, cur.y + (p.y - cur.y) * k), b.getAngle());
    b.setLinearVelocity(new Vec2(0, 0));
    b.setAngularVelocity(0);
  }
}
