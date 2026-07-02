/**
 * Randomized play soak (`npm run soak [seed]`): launch the ball, flap the
 * flippers with random hold/release patterns for 10 simulated minutes, and
 * flag any spot where the ball sits nearly motionless — a genuine geometry
 * trap. Cradles don't count: flippers toggle within 1.5 s, well inside the
 * 2.5 s stuck window, so a cradled ball never stays motionless that long.
 */
import { readFileSync } from "node:fs";
import { Vec2 } from "planck";
import { EventBus } from "../src/core/EventBus";
import { PhysicsWorld, FIXED_DT } from "../src/core/PhysicsWorld";
import { buildTableFromSvg } from "../src/table/DevTable";
import { Ball } from "../src/entities/Ball";
import { Flipper } from "../src/entities/Flipper";
import { Bumper } from "../src/entities/Bumper";
import { Slingshot } from "../src/entities/Slingshot";
import { DropTargetBank } from "../src/entities/DropTargetBank";
import { Spinner } from "../src/entities/Spinner";
import { BUMPERS, SLINGS, TABLE } from "../src/table/geometry";
import { DEFAULT_TUNING } from "../src/tuning";

const SIM_SECONDS = 600;
const STUCK_WINDOW = 2.5; // s of near-zero speed with flippers at rest

let seed = Number(process.argv[2] ?? 1);
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const t = { ...DEFAULT_TUNING };
const bus = new EventBus();
const pw = new PhysicsWorld(bus, t);
const table = buildTableFromSvg(
  pw.world,
  t,
  readFileSync(new URL("../design/tables/moondial/playfield.svg", import.meta.url), "utf8"),
);
const ball = new Ball(pw.world, t);
const flippers = [
  new Flipper(pw.world, table.body, "left", t),
  new Flipper(pw.world, table.body, "right", t),
];

const bumpers = BUMPERS.map((d) => new Bumper(pw.world, d));
const slings = SLINGS.map((d) => new Slingshot(pw.world, d));
const bank = new DropTargetBank(pw.world, pw, bus);
const spinner = new Spinner(bus);

let drainFlag = false;
bus.on("sensor", ({ kind }) => {
  if (kind === "drain") drainFlag = true;
  if (kind === "spinner") spinner.trip(ball.body.getLinearVelocity().y);
});
bus.on("hit", ({ kind, id }) => {
  if (kind === "bumper") bumpers.find((b) => b.def.id === id)?.kick(ball, pw, t.bumperKick);
  if (kind === "sling") slings.find((s) => s.def.id === id)?.kick(ball, pw, t.slingKick);
  if (kind === "target") bank.onHit(id);
});

const pressed = [false, false];
const nextToggle = [0, 0];
let stillTime = 0;
let drains = 0;
let launches = 0;
const stuck: { x: number; y: number; time: number }[] = [];

for (let step = 0, steps = SIM_SECONDS / FIXED_DT; step < steps; step++) {
  const now = step * FIXED_DT;

  // random flipper pattern: taps and holds, 0.05–1.5 s per state
  for (const i of [0, 1]) {
    if (now >= nextToggle[i]) {
      pressed[i] = !pressed[i];
      nextToggle[i] = now + 0.05 + rand() * (pressed[i] ? 1.45 : 1.0);
    }
    flippers[i].update(pressed[i], t);
  }

  // relaunch from the lane whenever the ball settles there
  const p = ball.body.getPosition();
  const v = ball.body.getLinearVelocity();
  const speed = Math.hypot(v.x, v.y);
  const inLane = p.x > TABLE.laneWallX && p.y > TABLE.laneTopY;
  if (inLane && speed < 0.05 && p.y > 1.0) {
    ball.body.setLinearVelocity(new Vec2(0, -(1.2 + rand() * 1.4)));
    launches++;
  }

  pw.update(FIXED_DT); // flushes post-step queue (kicks, target drops/resets)
  bank.update(FIXED_DT);
  spinner.update(FIXED_DT);
  for (const s of slings) s.update(FIXED_DT);
  for (const b of bumpers) b.update(FIXED_DT);

  if (drainFlag) {
    drainFlag = false;
    drains++;
    ball.reset();
    stillTime = 0;
    continue;
  }

  // stuck = motionless outside the lane. No flipper-state condition: the
  // random pattern toggles each flipper within 1.5 s, so a ball motionless
  // for the whole window cannot be resting on a flipper (a cradle would be
  // disturbed) — and requiring flippers-at-rest here would make the window
  // unreachable and the whole detector vacuous.
  if (!inLane && speed < 0.015) {
    stillTime += FIXED_DT;
    if (stillTime >= STUCK_WINDOW) {
      stuck.push({ x: p.x, y: p.y, time: now });
      ball.reset();
      stillTime = 0;
    }
  } else {
    stillTime = 0;
  }
}

console.log(
  `seed=${process.argv[2] ?? 1}: ${SIM_SECONDS}s sim, ${launches} launches, ${drains} drains, ${stuck.length} stuck`,
);
for (const s of stuck) {
  console.log(`  STUCK at (${s.x.toFixed(4)}, ${s.y.toFixed(4)}) t=${s.time.toFixed(1)}s`);
}
process.exit(stuck.length ? 1 : 0);
