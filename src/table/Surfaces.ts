import type { Body } from "planck";
import { BALL_RADIUS } from "./geometry";
import { projectOnProfile, type HeightProfile } from "./SvgCollision";

/**
 * M11 (plan §7a): true height on the planar world. The ball carries one real
 * scalar `z` (its base height above the playfield plane, metres). It is
 * always SUPPORTED by a surface — the field (z 0) or an elevated run built
 * from height profiles — or AIRBORNE under real normal gravity. Physics
 * stays planar (Planck simulates x/y); z is integrated here, slope forces
 * are fed back into the plane, and collision is gated per-contact by height
 * band (PhysicsWorld's pre-solve hook). This replaces M10's collision-layer
 * filter bits and every layer-switch sensor: ramp entry/exit is geometry.
 *
 * Pure math + planck body access — Node-safe, shared by Game and the sims.
 */

/** Gravity normal to the (tilted) playfield plane, m/s². */
export const G_NORMAL = 9.75;
/** A surface at/below the ball by this much can take over support. */
const ATTACH_TOL = 0.004;
/** Rolling off a step shorter than this keeps support (no airborne blip). */
const STEP_TOL = 0.006;
/** Vertical extent of ordinary field walls/entities (posts, bats, caps). */
export const FIELD_BAND_TOP = 0.028;
/** An elevated wall reaches this far above its local surface height. */
const RAIL_TOP = 0.034;
/** ... and only a hair below: a ball whose top clears the local surface
 * height passes underneath (the bed IS the underside). */
const RAIL_BOTTOM = 0.001;

export interface Surface {
  name: string;
  profiles: HeightProfile[];
  /** Footprint half-width around each profile polyline (m). */
  halfWidth: number;
}

/** Group parsed profiles carrying data-surface into Surface records. */
export function buildSurfaces(profiles: HeightProfile[]): Surface[] {
  const byName = new Map<string, Surface>();
  for (const p of profiles) {
    if (!p.surface) continue;
    const s = byName.get(p.surface) ?? { name: p.surface, profiles: [], halfWidth: p.surfaceHalfWidth ?? 0.026 };
    s.profiles.push(p);
    if (p.surfaceHalfWidth) s.halfWidth = p.surfaceHalfWidth;
    byName.set(p.surface, s);
  }
  return [...byName.values()];
}

/** Height of `s` at (x, y), or null when outside its footprint. */
export function surfaceHeightAt(s: Surface, x: number, y: number): number | null {
  let best: { dist: number; h: number } | null = null;
  for (const p of s.profiles) {
    const r = projectOnProfile(p, x, y);
    if (r.dist <= s.halfWidth && (!best || r.dist < best.dist)) best = { dist: r.dist, h: r.h };
  }
  return best ? best.h : null;
}

/**
 * Planar height gradient of `s` at (x, y): height varies linearly along the
 * nearest profile and is constant across the footprint, so the gradient is
 * the profile tangent scaled by its rise per metre.
 */
export function surfaceGradientAt(s: Surface, x: number, y: number): { gx: number; gy: number } {
  let best: { dist: number; gx: number; gy: number } | null = null;
  for (const p of s.profiles) {
    const r = projectOnProfile(p, x, y);
    if (best && r.dist >= best.dist) continue;
    const total = p.cumLen[p.cumLen.length - 1] || 1;
    const rise = (p.hTo - p.hFrom) / total;
    // tangent of the segment nearest the projection
    let acc = r.t * total;
    let i = 1;
    while (i < p.cumLen.length - 1 && p.cumLen[i] < acc) i++;
    const a = p.pts[i - 1];
    const b = p.pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    best = { dist: r.dist, gx: ((b.x - a.x) / len) * rise, gy: ((b.y - a.y) / len) * rise };
  }
  return best ? { gx: best.gx, gy: best.gy } : { gx: 0, gy: 0 };
}

export type SupportName = "field" | "air" | "subway" | string;

/**
 * The ball's height state machine. Step order per fixed physics step:
 * applyForces() before world.step (slope feedback), step() after it
 * (support resolution + z integration from the new planar position).
 */
export class HeightState {
  /** Ball base height above the playfield plane (m). */
  z = 0;
  private vz = 0;
  /** Supporting surface, or null while airborne. */
  support: Surface | null = null;
  private airborne = false;
  /** Scripted transit depth (subways); overrides everything while set. */
  private transitDepth: number | null = null;
  /** Fired on support change: (from, to) as surface names/"field"/"air". */
  onChange?: (from: SupportName, to: SupportName) => void;

  constructor(private surfaces: readonly Surface[]) {}

  get supportName(): SupportName {
    if (this.transitDepth !== null) return "subway";
    if (this.airborne) return "air";
    return this.support ? this.support.name : "field";
  }

  get transiting(): boolean {
    return this.transitDepth !== null;
  }

  /** True when the ball rides (or flies) above field furniture. */
  get elevated(): boolean {
    return this.support !== null || (this.airborne && this.z > 0.012);
  }

  /** Scripted under-field transit (Subway). */
  beginTransit(depth: number): void {
    this.setState(null, false, depth, depth);
  }

  endTransit(): void {
    if (this.transitDepth === null) return;
    this.setState(null, false, null, 0);
  }

  reset(): void {
    this.setState(null, false, null, 0);
    this.vz = 0;
  }

  /** Feed the support slope back into the plane (call before world.step). */
  applyForces(body: Body): void {
    if (!this.support || this.transitDepth !== null) return;
    const p = body.getPosition();
    const { gx, gy } = surfaceGradientAt(this.support, p.x, p.y);
    if (gx === 0 && gy === 0) return;
    const m = body.getMass();
    body.applyForceToCenter({ x: -m * G_NORMAL * gx, y: -m * G_NORMAL * gy } as never, true);
  }

  /** Resolve support + integrate z from the new position (after world.step). */
  step(dt: number, x: number, y: number): void {
    if (this.transitDepth !== null) {
      this.z = this.transitDepth;
      return;
    }
    if (this.support) {
      const h = surfaceHeightAt(this.support, x, y);
      if (h !== null) {
        this.z = h;
        return;
      }
      // left the footprint: transfer flush, or go airborne off the edge
      const best = this.bestBelow(x, y, this.z + ATTACH_TOL);
      if (best && this.z - best.h <= STEP_TOL) {
        this.setState(best.s, false, null, best.h);
      } else {
        this.setState(null, true, null, this.z);
        this.vz = 0;
      }
      return;
    }
    if (this.airborne) {
      const zPrev = this.z;
      this.vz -= G_NORMAL * dt;
      this.z += this.vz * dt;
      const best = this.bestBelow(x, y, zPrev + ATTACH_TOL);
      if (best && this.z <= best.h) {
        this.vz = 0;
        this.setState(best.s, false, null, best.h);
      }
      return;
    }
    // on the field: roll onto any surface whose local height meets the ball
    for (const s of this.surfaces) {
      const h = surfaceHeightAt(s, x, y);
      if (h !== null && h <= this.z + ATTACH_TOL) {
        this.setState(s, false, null, h);
        return;
      }
    }
    this.z = 0;
  }

  /** Highest landing candidate at (x,y) not above `zMax` (field included). */
  private bestBelow(x: number, y: number, zMax: number): { s: Surface | null; h: number } | null {
    let best: { s: Surface | null; h: number } = { s: null, h: 0 }; // the field
    for (const s of this.surfaces) {
      const h = surfaceHeightAt(s, x, y);
      if (h !== null && h <= zMax && h > best.h) best = { s, h };
    }
    return best;
  }

  private setState(
    support: Surface | null,
    airborne: boolean,
    transitDepth: number | null,
    z: number,
  ): void {
    const from = this.supportName;
    this.support = support;
    this.airborne = airborne;
    this.transitDepth = transitDepth;
    this.z = z;
    const to = this.supportName;
    if (from !== to) this.onChange?.(from, to);
  }
}

/**
 * Per-contact height gate (PhysicsWorld pre-solve): does the ball's vertical
 * span meet this fixture's band? Elevated walls take their band from the
 * LOCAL surface height near the ball, so one climbing rail is low at its
 * mouth and high at its crest. `data-z="all"` walls (the shell, the lane
 * wall — the cabinet glass) always collide.
 */
export function contactApplies(
  tag: { zAll?: boolean; surfaceName?: string },
  surfaces: readonly Surface[],
  x: number,
  y: number,
  ballZ: number,
): boolean {
  if (tag.zAll) return true;
  const ballTop = ballZ + 2 * BALL_RADIUS;
  if (tag.surfaceName) {
    const s = surfaces.find((s) => s.name === tag.surfaceName);
    const h = s ? surfaceHeightAt(s, x, y) : null;
    if (h === null) return false; // rail far from its own footprint: ignore
    return ballZ < h + RAIL_TOP && ballTop > h - RAIL_BOTTOM;
  }
  return ballZ < FIELD_BAND_TOP && ballTop > -0.005;
}

/** Does a sensor's optional height band admit a ball at `z`? */
export function sensorApplies(
  band: { zMin?: number; zMax?: number },
  z: number,
): boolean {
  if (band.zMin !== undefined && z < band.zMin) return false;
  if (band.zMax !== undefined && z > band.zMax) return false;
  return true;
}
