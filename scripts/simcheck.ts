/**
 * Headless physics smoke test (no DOM): builds the table with all M3
 * elements and verifies core behaviours plus every known ball-trap scenario.
 * Run with `npm run simcheck`.
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
import { Scoring } from "../src/game/Scoring";
import { TABLE, FLIPPER, BALL_RADIUS, BUMPERS, SLINGS, DROP_TARGETS } from "../src/table/geometry";
import { DEFAULT_TUNING } from "../src/tuning";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const t = { ...DEFAULT_TUNING };
const bus = new EventBus();
const pw = new PhysicsWorld(bus, t);
const svgText = readFileSync(
  new URL("../design/tables/moondial/playfield.svg", import.meta.url),
  "utf8",
);
const table = buildTableFromSvg(pw.world, t, svgText);
const ball = new Ball(pw.world, t);
const left = new Flipper(pw.world, table.body, "left", t);
const right = new Flipper(pw.world, table.body, "right", t);
const bumpers = BUMPERS.map((d) => new Bumper(pw.world, d));
const slings = SLINGS.map((d) => new Slingshot(pw.world, d));
const bank = new DropTargetBank(pw.world, pw, bus);
const spinner = new Spinner(bus);
const scoring = new Scoring(bus);
left.update(false, t);
right.update(false, t);

// event capture + the same wiring Game does
let drained = false;
const sensors: string[] = [];
const hits: string[] = [];
const labels: string[] = [];
let spins = 0;
let bankDone = false;
bus.on("sensor", ({ kind, id }) => {
  sensors.push(id ? `${kind}:${id}` : kind);
  if (kind === "drain") drained = true;
  if (kind === "spinner") spinner.trip(ball.body.getLinearVelocity().y);
});
bus.on("hit", ({ kind, id }) => {
  hits.push(`${kind}:${id}`);
  if (kind === "bumper") bumpers.find((b) => b.def.id === id)?.kick(ball, pw, t.bumperKick);
  if (kind === "sling") slings.find((s) => s.def.id === id)?.kick(ball, pw, t.slingKick);
  if (kind === "target") bank.onHit(id);
});
bus.on("spinnerTick", () => spins++);
bus.on("bankComplete", () => (bankDone = true));
bus.on("score", ({ label }) => labels.push(label));

function run(seconds: number, each?: () => void): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    pw.update(FIXED_DT); // also flushes the post-step queue (kicks, target drops)
    bank.update(FIXED_DT);
    spinner.update(FIXED_DT);
    scoring.update(FIXED_DT);
    for (const s of slings) s.update(FIXED_DT);
    for (const b of bumpers) b.update(FIXED_DT);
    each?.();
  }
}

function placeBall(x: number, y: number, vx = 0, vy = 0): void {
  ball.body.setTransform(new Vec2(x, y), 0);
  ball.body.setLinearVelocity(new Vec2(vx, vy));
  ball.body.setAngularVelocity(0);
}

// 1 — ball falls under slope-gravity and settles ON the plunger-lane floor
run(2);
{
  const p = ball.body.getPosition();
  const v = ball.body.getLinearVelocity();
  const restY = TABLE.height - BALL_RADIUS;
  check(
    "ball settles ON the lane floor",
    Math.abs(p.y - restY) < 0.004 && p.x > TABLE.laneWallX && Math.abs(v.y) < 0.05,
    `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
  );
}

// 2 — full-power launch rides the orbit and comes down the left lane
ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
let minY: number = TABLE.height;
let minX: number = TABLE.width;
run(3, () => {
  const p = ball.body.getPosition();
  minY = Math.min(minY, p.y);
  minX = Math.min(minX, p.x);
});
check("launch reaches top of table", minY < 0.3, `minY=${minY.toFixed(3)}`);
check("launch completes the orbit into the left lane", minX < 0.07, `minX=${minX.toFixed(3)}`);

// 3 — flipper sweeps to the up-stop under motor torque and returns to rest
left.update(true, t);
run(0.15);
const upAngle = left.joint.getJointAngle();
check("left flipper reaches up-stop", upAngle < -FLIPPER.sweep * 0.85, `angle=${upAngle.toFixed(2)}`);
left.update(false, t);
run(0.4);
const restAngle = left.joint.getJointAngle();
check("left flipper returns to rest", restAngle > -0.1, `angle=${restAngle.toFixed(2)}`);

// 4 — ball dropped through the centre gap trips the drain sensor
placeBall(0.26, 1.0);
run(0.5);
check("drain sensor fires", drained);

// 5 — traps: seam drops, tip gap, and zero-speed creeps down each wall
for (const [label, x, y] of [
  ["left seam drop", 0.178, 0.915],
  ["right seam drop", 0.342, 0.915],
  ["tip gap drop", 0.26, 0.915],
  ["left wall creep", 0.1084, 0.8682],
  ["right wall creep", 0.4116, 0.8682], // mirror of the left creep point

] as const) {
  drained = false;
  placeBall(x, y);
  run(4);
  const p = ball.body.getPosition();
  check(`${label} does not trap the ball`, drained, `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`);
}

// 6 — a ball dropped onto a HELD-UP flipper must cradle, not be slapped away
left.update(true, t);
run(0.3);
drained = false;
placeBall(0.21, 0.85);
run(1.5, () => left.update(true, t));
{
  const v = ball.body.getLinearVelocity();
  const speed = Math.hypot(v.x, v.y);
  check("ball cradles on held-up flipper", !drained && speed < 0.05, `speed=${speed.toFixed(3)}`);
}
left.update(false, t);
run(0.5);

// 7 — pop bumper kicks the ball away harder than it arrived
placeBall(0.19, 0.275, 0, 0.8);
let maxSpeed = 0;
run(0.4, () => {
  const v = ball.body.getLinearVelocity();
  maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y));
});
check(
  "bumper hit fires and kicks",
  hits.some((h) => h === "bumper:1") && maxSpeed > 1.0,
  `maxSpeed=${maxSpeed.toFixed(2)}`,
);

// 8 — slingshot kicks toward the playfield
placeBall(0.125, 0.66, 0, 1.2);
run(0.5);
{
  const v = ball.body.getLinearVelocity();
  check(
    "sling hit fires and kicks rightward",
    hits.some((h) => h === "sling:left") && v.x > 0.1,
    `v=(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`,
  );
}

// 9 — top-lane rollover fires as the ball passes
placeBall(0.26, 0.07);
run(1);
check("middle rollover fires", sensors.includes("rollover:2"));

// 10 — drop targets: three hits drop the bank, bonus fires, bank resets
for (const y of DROP_TARGETS.ys) {
  placeBall(0.45, y, 1.5, 0);
  run(0.5);
}
check("all three targets dropped + bank bonus", bankDone && bank.targets.every((x) => !x.up));
run(1.5);
check("bank resets after delay", bank.targets.every((x) => x.up));

// 11 — kinetic-loop trap: a ball dropped dead-centre onto the bumper nest
// must not settle into a stable bounce orbit (perfectly radial kicks give a
// vertical perpetual loop); it has to leave the upper field
placeBall(0.26, 0.3);
let escaped = false;
run(30, () => {
  if (ball.body.getPosition().y > 0.6) escaped = true;
});
{
  const p = ball.body.getPosition();
  check(
    "bumper nest does not loop the ball forever",
    escaped,
    `after 30s pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
  );
}

// 12 — orbit shot from the left lane: entry → spinner → exit scores the orbit
placeBall(0.0325, 0.53, 0, -2.3);
run(3);
check("spinner spins and ticks", spins > 0, `ticks=${spins}`);
check(
  "orbit entry+exit both fire",
  sensors.includes("ramp-entry") && sensors.includes("ramp-exit"),
);
check("orbit combo scores", labels.includes("ORBIT"), `score=${scoring.total}`);

console.log(failures === 0 ? "\nsimcheck: all checks passed" : `\nsimcheck: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
