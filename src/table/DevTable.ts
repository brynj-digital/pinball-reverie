import { Body, Box, Chain, Fixture, Vec2, World } from "planck";
import type { Tuning } from "../tuning";
import type { FixtureTag } from "../core/PhysicsWorld";
import type { TableRenderData } from "../render/Renderer";
import {
  ORBIT_SENSORS,
  ROLLOVERS,
  ROLLOVER_SENSOR,
  SPINNER,
  TABLE,
  wallPolylines,
} from "./geometry";

export interface DevTable {
  body: Body;
  renderData: TableRenderData;
  wallFixtures: Fixture[];
}

/**
 * Builds the Milestone-1 placeholder table: static wall chains from
 * geometry.ts plus the drain sensor. Replaced by the SVG→fixture parser at
 * milestone 3.5 (plan §5e).
 */
export function buildDevTable(world: World, tuning: Tuning): DevTable {
  const body = world.createBody(); // static, at origin — all coords in table space
  const polylines = wallPolylines();

  const wallFixtures = polylines.map((line) =>
    body.createFixture({
      shape: new Chain(
        line.pts.map((p) => new Vec2(p.x, p.y)),
        line.loop,
      ),
      friction: tuning.wallFriction,
      restitution: tuning.wallRestitution,
      userData: { kind: "wall" } satisfies FixtureTag,
    }),
  );

  // Sensors, not solids, for every scoring zone (plan §4) — all routed to
  // the EventBus by PhysicsWorld's contact listener.
  const sensor = (cx: number, cy: number, hw: number, hh: number, tag: FixtureTag) =>
    body.createFixture({
      shape: new Box(hw, hh, new Vec2(cx, cy), 0),
      isSensor: true,
      userData: tag,
    });

  const d = TABLE.drain;
  sensor(d.cx, d.cy, d.hw, d.hh, { kind: "drain" });
  for (const r of ROLLOVERS)
    sensor(r.x, r.y, ROLLOVER_SENSOR.hw, ROLLOVER_SENSOR.hh, { kind: "rollover", id: r.id });
  sensor(SPINNER.x, SPINNER.y, SPINNER.halfW, 0.006, { kind: "spinner" });
  const oe = ORBIT_SENSORS.entry;
  sensor(oe.x, oe.y, oe.hw, oe.hh, { kind: "ramp-entry" });
  const ox = ORBIT_SENSORS.exit;
  sensor(ox.x, ox.y, ox.hw, ox.hh, { kind: "ramp-exit" });

  return {
    body,
    renderData: { width: TABLE.width, height: TABLE.height, polylines },
    wallFixtures,
  };
}
