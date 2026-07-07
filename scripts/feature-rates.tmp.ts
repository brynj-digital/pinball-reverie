/**
 * Instrumented soak: same physics/flipper driving as scripts/soak.ts, but
 * counts feature triggers (per-lane rollovers, P-A-R-K completions, kicker
 * and subway captures) to measure shot reachability. Usage:
 *   npx tsx feature-rates.ts <table> <seed> [simSeconds]
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
import { Kicker } from "../src/entities/Kicker";
import { Subway } from "../src/entities/Subway";
import { Scoring } from "../src/game/Scoring";
import { contactApplies, sensorApplies } from "../src/table/Surfaces";
import { TABLE_SPECS, type TableId } from "../src/table/specs";
import { DEFAULT_TUNING } from "../src/tuning";

const tableId = (process.argv[2] ?? "midway") as TableId;
const seedArg = Number(process.argv[3] ?? 1);
const SIM_SECONDS = Number(process.argv[4] ?? 600);

let seed = seedArg;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const spec = TABLE_SPECS[tableId];
const g = spec.geometry;
const t = { ...DEFAULT_TUNING };
const bus = new EventBus();
const pw = new PhysicsWorld(bus, t);
const table = buildTableFromSvg(
  pw.world,
  t,
  readFileSync(`/home/bryn/projects/pinball-reverie/design/tables/${tableId}/playfield.svg`, "utf8"),
  g,
);
const ball = new Ball(pw.world, t, g.table.spawn, table.surfaces);
pw.setZGate((tag, x, y) => contactApplies(tag, table.surfaces, x, y, ball.height.z));
ball.height.onChange = (from, to) => {
  const p = ball.body.getPosition();
  bus.emit("surface", { from, to, x: p.x, y: p.y, z: ball.height.z });
  for (const tag of pw.sensorsTouching(ball.body)) {
    if ((tag.zMin !== undefined || tag.zMax !== undefined) && sensorApplies(tag, ball.height.z))
      bus.emit("sensor", { kind: tag.kind, id: tag.id, zMin: tag.zMin, zMax: tag.zMax });
  }
};
const flippers = [
  new Flipper(pw.world, table.body, "left", t, g.flippers.left),
  new Flipper(pw.world, table.body, "right", t, g.flippers.right),
];
if (g.flippers.upper)
  flippers.push(new Flipper(pw.world, table.body, g.flippers.upper.side, t, g.flippers.upper));
const bumpers = g.bumpers.map((d) => new Bumper(pw.world, d));
const slings = g.slings.map((d) => new Slingshot(pw.world, d));
const bank = new DropTargetBank(pw.world, pw, bus, g.dropTargets);
const spinner = new Spinner(bus);
const kickers = g.kickers.map((d) => new Kicker(d));
const subways = g.subways.map((d) => new Subway(d, table.profiles.find((p) => p.name === d.id)!));
const scoring = new Scoring(bus, spec.scoring);
const logic = spec.createLogic({
  bus,
  scoring,
  sfx: () => {},
  shake: () => {},
  push: () => {},
  baked: () => undefined,
});

// ── counters ──
const rolloverHits = new Map<string, number>();
const captures = new Map<string, number>();
const captureAttempts = new Map<string, number>(); // sensor fired regardless of lit
let laneSetCompletions = 0;
const seen = new Set<string>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

// ride reachability
let coasterBoard = 0, coasterRide = 0, coasterBoardedMouth = false;
let strikerBoard = 0, strikerRide = 0;
let skyEntry = 0, skyExit = 0;
let bumperHits = 0;
// how far up the ball gets (min y = highest reached), and top-half dwell
let minY = Infinity;
let topHalfSteps = 0, inPlaySteps = 0;
bus.on("surface", ({ from, to, x }) => {
  if (to === "coaster") { coasterBoard++; coasterBoardedMouth = x < 0.3; }
  else if (from === "coaster") { if (x > 0.35 && coasterBoardedMouth) coasterRide++; coasterBoardedMouth = false; }
  else if (to === "striker") strikerBoard++;
  else if (from === "striker" && x < 0.35) strikerRide++;
});
bus.on("sensor", ({ kind }) => {
  if (kind === "ramp-entry") skyEntry++;
  else if (kind === "ramp-exit") skyExit++;
});
bus.on("hit", ({ kind }) => { if (kind === "bumper") bumperHits++; });

let drainFlag = false;
bus.on("sensor", ({ kind, id, zMin, zMax }) => {
  if (!sensorApplies({ zMin, zMax }, ball.height.z)) return;
  if (kind === "drain" && !kickers.some((k) => k.holding) && !subways.some((s) => s.active))
    drainFlag = true;
  if (kind === "spinner") spinner.trip(ball.body.getLinearVelocity().y);
  if (kind === "kicker" && id) {
    bump(captureAttempts, id);
    const k = kickers.find((k) => k.def.id === id);
    if (k && logic.kickerLit(id) && k.capture()) {
      bump(captures, id);
      logic.onCapture?.(id);
    }
  }
  if (kind === "subway" && id) {
    bump(captureAttempts, id);
    const s = subways.find((s) => s.def.id === id);
    if (s && logic.kickerLit(id) && s.capture()) {
      bump(captures, id);
      logic.onCapture?.(id);
    }
  }
  if (kind === "rollover" && id) {
    bump(rolloverHits, id);
    seen.add(id);
    if (seen.size === g.rollovers.length) {
      seen.clear();
      laneSetCompletions++;
    }
    logic.onRollover(id);
  }
});
bus.on("hit", ({ kind, id }) => {
  if (kind === "bumper") bumpers.find((b) => b.def.id === id)?.kick(ball, pw, t.bumperKick);
  if (kind === "sling") slings.find((s) => s.def.id === id)?.kick(ball, pw, t.slingKick);
  if (kind === "target") bank.onHit(id);
});

const pressed = flippers.map(() => false);
const nextToggle = flippers.map(() => 0);
let drains = 0;
let launches = 0;

const resetBall = () => {
  for (const k of kickers) k.cancel(ball);
  for (const s of subways) s.cancel(ball);
  ball.reset();
};

for (let step = 0, steps = SIM_SECONDS / FIXED_DT; step < steps; step++) {
  const now = step * FIXED_DT;
  for (let i = 0; i < flippers.length; i++) {
    if (now >= nextToggle[i]) {
      pressed[i] = !pressed[i];
      nextToggle[i] = now + 0.05 + rand() * (pressed[i] ? 1.45 : 1.0);
      if (pressed[i] && i < 2) logic.onFlipper?.(i === 0 ? "left" : "right");
    }
    flippers[i].update(pressed[i], t);
  }
  const p = ball.body.getPosition();
  const v = ball.body.getLinearVelocity();
  const speed = Math.hypot(v.x, v.y);
  const inLane = p.x > g.table.laneWallX && p.y > g.table.laneTopY;
  if (!inLane) {
    inPlaySteps++;
    if (p.y < 0.35) topHalfSteps++;
    if (p.y < minY) minY = p.y;
  }
  if (inLane && speed < 0.05 && p.y > 0.95) {
    const launch = t.plungerMinSpeed + rand() * (t.plungerMaxSpeed - t.plungerMinSpeed);
    ball.body.setLinearVelocity(new Vec2(0, -launch));
    launches++;
  }
  pw.update(
    FIXED_DT,
    () => ball.height.applyForces(ball.body),
    () => {
      const bp = ball.body.getPosition();
      const bv = ball.body.getLinearVelocity();
      ball.height.step(FIXED_DT, bp.x, bp.y, Math.hypot(bv.x, bv.y));
    },
  );
  bank.update(FIXED_DT);
  for (const k of kickers) k.update(FIXED_DT, ball, t);
  for (const s of subways) s.update(FIXED_DT, ball);
  spinner.update(FIXED_DT);
  scoring.update(FIXED_DT);
  logic.update(FIXED_DT);
  for (const s of slings) s.update(FIXED_DT);
  for (const b of bumpers) b.update(FIXED_DT);
  if (drainFlag) {
    drainFlag = false;
    drains++;
    resetBall();
    continue;
  }
  if (p.x < -0.03 || p.x > g.table.width + 0.03 || p.y < -0.03 || p.y > g.table.height + 0.03) {
    resetBall();
    continue;
  }
}

const fmt = (m: Map<string, number>) =>
  [...m.entries()].sort().map(([k, n]) => `${k}=${n}`).join(" ") || "(none)";
console.log(`${tableId} seed=${seedArg} ${SIM_SECONDS}s: ${launches} launches, ${drains} drains`);
console.log(`  rollovers: ${fmt(rolloverHits)}  |  lane-set completions: ${laneSetCompletions}`);
console.log(`  capture attempts (sensor): ${fmt(captureAttempts)}`);
console.log(`  captures (lit+held): ${fmt(captures)}`);
console.log(`  coaster: board=${coasterBoard} ride=${coasterRide}  |  striker: board=${strikerBoard} ride=${strikerRide}  |  skyride: entry=${skyEntry} exit=${skyExit}  |  bumpers=${bumperHits}`);
console.log(`  reach: highest y=${minY.toFixed(3)}  |  top-half dwell=${(100 * topHalfSteps / (inPlaySteps || 1)).toFixed(1)}% of in-play time`);
