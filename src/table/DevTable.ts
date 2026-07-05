import { Body, Box, Chain, Fixture, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import { CAT_ALWAYS, layerCategory, type FixtureTag } from "../core/PhysicsWorld";
import type { TableRenderData } from "../render/Renderer";
import { parseTableSvg, type HeightProfile } from "./SvgCollision";
import type { TableGeometry } from "./geometry";

export interface DevTable {
  body: Body;
  renderData: TableRenderData;
  wallFixtures: Fixture[];
  profiles: HeightProfile[];
}

/**
 * Builds the table's static physics from the playfield SVG (plan §5e: the
 * SVG is the single source of truth for shape). Walls become chain fixtures,
 * sensor rects become sensor fixtures routed to the EventBus, and anchors
 * are validated against the table spec's entity constants so art and physics
 * can't silently drift.
 *
 * Layers (M10): fixtures on data-layer N get that layer's category bit, so
 * they only touch a ball whose mask includes it (Ball.setLayer). The drain
 * sensor is CAT_ALWAYS — a ball on any layer must always be able to drain.
 */
export function buildTableFromSvg(
  world: World,
  tuning: Tuning,
  svgText: string,
  geometry: TableGeometry,
): DevTable {
  const parsed = parseTableSvg(svgText);
  validateAnchors(parsed.anchors, geometry);

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
      filterCategoryBits: layerCategory(wall.layer),
      userData: { kind: "wall" } satisfies FixtureTag,
    });
  });

  // Sensors, not solids, for every scoring zone (plan §4)
  for (const s of parsed.sensors) {
    body.createFixture({
      shape: new Box(s.hw, s.hh, new Vec2(s.cx, s.cy), 0),
      isSensor: true,
      filterCategoryBits: s.kind === "drain" ? CAT_ALWAYS : layerCategory(s.layer),
      userData: {
        kind: s.kind,
        id: s.id,
        toLayer: s.toLayer,
        upOnly: s.upOnly,
        // layer switches re-validate the ball is inside the zone at
        // application time (Ball.queueLayerSwitch)
        bounds:
          s.toLayer !== undefined ? { cx: s.cx, cy: s.cy, hw: s.hw, hh: s.hh } : undefined,
      } satisfies FixtureTag,
    });
  }

  // subway defs must have a matching height-profile path to travel along
  for (const sub of geometry.subways) {
    if (!parsed.profiles.some((p) => p.name === sub.id))
      throw new Error(`subway "${sub.id}" has no height-profile-${sub.id} path in the SVG`);
  }

  return {
    body,
    renderData: {
      width: geometry.table.width,
      height: geometry.table.height,
      plunger: geometry.plunger,
    },
    wallFixtures,
    profiles: parsed.profiles,
  };
}

/** Art and physics agree on placement or we fail loudly at load time. */
function validateAnchors(
  anchors: Map<string, { x: number; y: number }>,
  g: TableGeometry,
): void {
  const expect: [string, { x: number; y: number }][] = [
    ["flipper-left", g.flippers.left],
    ["flipper-right", g.flippers.right],
    ...(g.flippers.upper
      ? [["flipper-upper", g.flippers.upper] as [string, { x: number; y: number }]]
      : []),
    ["spawn", g.table.spawn],
    ...g.kickers.map((k): [string, { x: number; y: number }] => [`kicker-${k.id}`, k.hold]),
    ...g.bumpers.map((b): [string, { x: number; y: number }] => [`bumper-${b.id}`, b]),
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
