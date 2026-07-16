import { Chain, Vec2, type Body, type Fixture, type World } from "planck";
import type { Tuning } from "../tuning";
import type { PhysicsWorld, FixtureTag } from "../core/PhysicsWorld";
import type { Ball } from "./Ball";
import type { DiverterDef } from "../table/geometry";
import { BALL_RADIUS } from "../table/geometry";
import type { DiverterBlade } from "../table/SvgCollision";

/**
 * Logic-controlled gate (M12, the Night Mail's Points): a set of named
 * blades authored as collision-diverter-<id>-<blade> paths in the playfield
 * SVG, of which exactly ONE is solid at a time. Game polls
 * TableLogic.diverterBlade(id) each frame and calls setBlade; the swap
 * destroys/creates the blade fixture post-step (the DropTargetBank pattern —
 * the world is locked during contact callbacks). Blades default to field
 * furniture height but honour data-z / data-z-min / data-z-max like walls.
 *
 * Authoring rule (STYLE-GUIDE §4): blade positions must differ enough that
 * a ball resting against the solid blade is never INSIDE the incoming one —
 * the swap does not push; a ball overlapping a freshly-created blade would
 * be ejected by the solver.
 */
/** Distance from a point to a polyline (blade-overlap check). */
function distToChain(pts: { x: number; y: number }[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * u), y - (a.y + dy * u)));
  }
  return best;
}

export class Diverter {
  private readonly body: Body;
  private readonly chains: Map<string, DiverterBlade>;
  private fixture: Fixture | null = null;
  private current: string;
  /** Swap already queued this step (setBlade may be polled per frame). */
  private pending: string | null = null;

  constructor(
    world: World,
    private physics: PhysicsWorld,
    readonly def: DiverterDef,
    blades: readonly DiverterBlade[],
    private tuning: Tuning,
  ) {
    this.body = world.createBody(); // static, table space
    this.chains = new Map(
      blades.filter((b) => b.diverter === def.id).map((b) => [b.blade, b]),
    );
    for (const name of def.blades)
      if (!this.chains.has(name))
        throw new Error(
          `diverter "${def.id}" blade "${name}" has no collision-diverter-${def.id}-${name} path`,
        );
    if (!def.blades.includes(def.initial))
      throw new Error(`diverter "${def.id}" initial blade "${def.initial}" not in blades`);
    this.current = def.initial;
    this.fixture = this.createBlade(def.initial);
  }

  /** The solid blade right now (render + logic introspection). */
  get blade(): string {
    return this.pending ?? this.current;
  }

  /** Polyline of a blade in table space (render seam). */
  bladePts(name: string): { x: number; y: number }[] {
    return this.chains.get(name)?.pts ?? [];
  }

  /**
   * Make `name` the solid blade. Safe to call every frame with the current
   * value (no-op); the actual fixture swap runs post-step. M12 multiball:
   * pass the live balls — the swap DEFERS while any ball overlaps the
   * incoming blade (a fixture created inside a ball gets solver-ejected as
   * a ghost); the poll retries next frame once the ball clears.
   */
  setBlade(name: string, balls: readonly Ball[] = []): void {
    if (!this.def.blades.includes(name)) return; // unknown blade: keep the gate sane
    if (name === this.blade) return;
    const incoming = this.chains.get(name)!;
    const clearance = BALL_RADIUS + incoming.radius + 0.002;
    for (const b of balls) {
      const p = b.body.getPosition();
      if (distToChain(incoming.pts, p.x, p.y) < clearance) return; // retry next poll
    }
    this.pending = name;
    this.physics.queuePostStep(() => {
      if (this.pending === null) return;
      const next = this.pending;
      this.pending = null;
      if (next === this.current) return;
      if (this.fixture) this.body.destroyFixture(this.fixture);
      this.fixture = this.createBlade(next);
      this.current = next;
    });
  }

  private createBlade(name: string): Fixture {
    const b = this.chains.get(name)!;
    const shape = new Chain(b.pts.map((p) => new Vec2(p.x, p.y)), false);
    shape.m_radius = b.radius; // collision surface = drawn stroke edge, as walls
    return this.body.createFixture({
      shape,
      friction: this.tuning.wallFriction,
      restitution: this.tuning.wallRestitution,
      userData: {
        kind: "wall",
        id: `diverter-${this.def.id}`,
        zAll: b.zAll,
        zMin: b.zMin,
        zMax: b.zMax,
      } satisfies FixtureTag,
    });
  }
}
