import { Body, Box, Chain, Fixture, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import type { FixtureTag } from "../core/PhysicsWorld";
import type { TableRenderData } from "../render/Renderer";
import { parseTableSvg } from "./SvgCollision";
import { BUMPERS, FLIPPER, TABLE } from "./geometry";

export interface DevTable {
  body: Body;
  renderData: TableRenderData;
  wallFixtures: Fixture[];
}

/**
 * Builds the table's static physics from the playfield SVG (plan §5e: the
 * SVG is the single source of truth for shape). Walls become chain fixtures,
 * sensor rects become sensor fixtures routed to the EventBus, and anchors
 * are validated against the code-side entity constants so art and physics
 * can't silently drift.
 */
export function buildTableFromSvg(world: World, tuning: Tuning, svgText: string): DevTable {
  const parsed = parseTableSvg(svgText);
  validateAnchors(parsed.anchors);

  const body = world.createBody(); // static, at origin — all coords in table space

  const wallFixtures = parsed.walls.map((wall) => {
    const shape = new Chain(
      wall.pts.map((p) => new Vec2(p.x, p.y)),
      wall.loop,
    );
    // half the drawn stroke width — the collision surface is the stroke edge
    shape.m_radius = wall.radius;
    return body.createFixture({
      shape,
      friction: tuning.wallFriction,
      restitution: tuning.wallRestitution,
      userData: { kind: "wall" } satisfies FixtureTag,
    });
  });

  // Sensors, not solids, for every scoring zone (plan §4)
  for (const s of parsed.sensors) {
    body.createFixture({
      shape: new Box(s.hw, s.hh, new Vec2(s.cx, s.cy), 0),
      isSensor: true,
      userData: { kind: s.kind, id: s.id } satisfies FixtureTag,
    });
  }

  return {
    body,
    renderData: { width: TABLE.width, height: TABLE.height },
    wallFixtures,
  };
}

/** Art and physics agree on placement or we fail loudly at load time. */
function validateAnchors(anchors: Map<string, { x: number; y: number }>): void {
  const expect: [string, { x: number; y: number }][] = [
    ["flipper-left", FLIPPER.pivotL],
    ["flipper-right", FLIPPER.pivotR],
    ["spawn", TABLE.spawn],
    ...BUMPERS.map((b): [string, { x: number; y: number }] => [`bumper-${b.id}`, b]),
  ];
  for (const [name, pos] of expect) {
    const a = anchors.get(name);
    if (!a) throw new Error(`playfield SVG is missing anchor-${name}`);
    if (Math.hypot(a.x - pos.x, a.y - pos.y) > 0.001)
      throw new Error(
        `anchor-${name} at (${a.x}, ${a.y}) disagrees with code constant (${pos.x}, ${pos.y})`,
      );
  }
}
