/**
 * Headless behaviour check for the M12 entities (`npm run entcheck`):
 * Diverter, Lift, Magnet, Disc — exercised in a synthetic world (no table
 * SVG), so the engine features can be verified before any playfield exists
 * (the Night Mail brief §8 builds them ahead of the table). Each check
 * mirrors the Game/sim wiring: entity update() per fixed step, field forces
 * in beforeStep, height integration in afterStep.
 */
import { Vec2 } from "planck";
import { EventBus } from "../src/core/EventBus";
import { PhysicsWorld, FIXED_DT } from "../src/core/PhysicsWorld";
import { contactApplies } from "../src/table/Surfaces";
import { Ball } from "../src/entities/Ball";
import { Diverter } from "../src/entities/Diverter";
import { Lift } from "../src/entities/Lift";
import { Magnet } from "../src/entities/Magnet";
import { Disc } from "../src/entities/Disc";
import type { HeightProfile } from "../src/table/SvgCollision";
import { DEFAULT_TUNING } from "../src/tuning";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

function makeRig() {
  const t = { ...DEFAULT_TUNING };
  const bus = new EventBus();
  const pw = new PhysicsWorld(bus, t);
  const ball = new Ball(pw.world, t, { x: 0.3, y: 0.3 }, []);
  pw.setZGate((tag, x, y) => contactApplies(tag, [], x, y, ball.height.z));
  const place = (x: number, y: number, vx = 0, vy = 0) => {
    ball.height.reset();
    ball.body.setGravityScale(1);
    ball.body.setTransform(new Vec2(x, y), 0);
    ball.body.setLinearVelocity(new Vec2(vx, vy));
    ball.body.setAngularVelocity(0);
  };
  const run = (seconds: number, each: () => void) => {
    for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) each();
  };
  return { t, bus, pw, ball, place, run };
}

function profile(
  name: string,
  pts: { x: number; y: number }[],
  hFrom: number,
  hTo: number,
): HeightProfile {
  const cumLen = [0];
  for (let i = 1; i < pts.length; i++)
    cumLen.push(cumLen[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { name, pts, layer: 1, hFrom, hTo, cumLen };
}

// ─────────────────────────── Diverter ───────────────────────────
{
  const { t, pw, ball, place, run } = makeRig();
  const blades = [
    {
      diverter: "points",
      blade: "main",
      pts: [
        { x: 0.2, y: 0.5 },
        { x: 0.32, y: 0.5 },
      ],
      radius: 0.006,
    },
    {
      diverter: "points",
      blade: "branch",
      pts: [
        { x: 0.4, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ],
      radius: 0.006,
    },
  ];
  const dv = new Diverter(pw.world, pw, {
    id: "points",
    blades: ["main", "branch"],
    initial: "main",
  }, blades, t);

  const step = () =>
    pw.update(
      FIXED_DT,
      () => ball.height.applyForces(ball.body),
      () => {
        const p = ball.body.getPosition();
        ball.height.step(FIXED_DT, p.x, p.y);
      },
    );

  place(0.26, 0.4, 0, 0.5);
  run(1.0, step);
  const blocked = ball.body.getPosition();
  check("diverter: initial blade is solid", blocked.y < 0.5, `y=${blocked.y.toFixed(3)}`);

  dv.setBlade("branch");
  place(0.26, 0.4, 0, 0.5);
  run(1.0, step);
  const through = ball.body.getPosition();
  check("diverter: deselected blade is open", through.y > 0.55, `y=${through.y.toFixed(3)}`);
  check("diverter: reports its blade", dv.blade === "branch");

  // the branch blade must now block where it lies
  dv.setBlade("branch"); // no-op path
  place(0.45, 0.4, 0, 0.5);
  run(1.0, step);
  const blockedB = ball.body.getPosition();
  check("diverter: selected blade is solid", blockedB.y < 0.5, `y=${blockedB.y.toFixed(3)}`);
}

// ─────────────── Diverter: inert (off-field) blade ───────────────
// The retractable-post pattern (Moondial's gnomon, the Sump's floodgate):
// one blade is the feature, the other a tiny sliver parked where no ball
// can reach — selecting it is how a diverter "retracts". Prove the sliver
// is a legal blade and that the post position is genuinely open while the
// sliver is selected.
{
  const { t, pw, ball, place, run } = makeRig();
  const blades = [
    {
      diverter: "gnomon",
      blade: "up",
      pts: [
        { x: 0.24, y: 0.5 },
        { x: 0.28, y: 0.5 },
      ],
      radius: 0.005,
    },
    {
      // inert sliver: 4 mm chain tucked at the rig edge, unreachable
      diverter: "gnomon",
      blade: "down",
      pts: [
        { x: 0.02, y: 0.02 },
        { x: 0.024, y: 0.02 },
      ],
      radius: 0.002,
    },
  ];
  const dv = new Diverter(pw.world, pw, {
    id: "gnomon",
    blades: ["up", "down"],
    initial: "down",
  }, blades, t);

  const step = () =>
    pw.update(
      FIXED_DT,
      () => ball.height.applyForces(ball.body),
      () => {
        const p = ball.body.getPosition();
        ball.height.step(FIXED_DT, p.x, p.y);
      },
    );

  place(0.26, 0.4, 0, 0.5);
  run(1.0, step);
  check(
    "diverter: inert blade leaves the post position open",
    ball.body.getPosition().y > 0.55,
    `y=${ball.body.getPosition().y.toFixed(3)}`,
  );

  dv.setBlade("up");
  place(0.26, 0.4, 0, 0.5);
  run(1.0, step);
  check(
    "diverter: post rises when selected",
    ball.body.getPosition().y < 0.5,
    `y=${ball.body.getPosition().y.toFixed(3)}`,
  );

  // retract under a ball parked NEXT to the post (not overlapping): the
  // swap must go through immediately — deferral is only for overlap.
  dv.setBlade("down");
  place(0.26, 0.4, 0, 0.5);
  run(1.0, step);
  check(
    "diverter: post retracts and the lane reopens",
    ball.body.getPosition().y > 0.55,
    `y=${ball.body.getPosition().y.toFixed(3)}`,
  );
}

// ───────────────────────────── Lift ─────────────────────────────
{
  const { pw, ball, place, run } = makeRig();
  const path = profile(
    "incline",
    [
      { x: 0.2, y: 0.9 },
      { x: 0.2, y: 0.6 },
    ],
    0,
    0.06,
  );
  const lift = new Lift({ id: "incline", dwellS: 0.2, speed: 0.15, exitSpeed: 0.5 }, path);
  let ejected = false;
  let zAtEject = 0;
  let landed = false;
  lift.onEject = () => {
    ejected = true;
    zAtEject = ball.height.z;
  };

  place(0.2, 0.9);
  check("lift: captures", lift.capture(ball));
  let maxZ = 0;
  let sawLiftSupport = false;
  run(4.0, () => {
    pw.update(
      FIXED_DT,
      () => ball.height.applyForces(ball.body),
      () => {
        const p = ball.body.getPosition();
        ball.height.step(FIXED_DT, p.x, p.y);
      },
    );
    lift.update(FIXED_DT);
    maxZ = Math.max(maxZ, ball.height.z);
    if (ball.height.supportName === "lift") sawLiftSupport = true;
    if (ejected && ball.height.supportName === "field" && ball.height.z === 0) landed = true;
  });
  check("lift: carried the ball up its profile", maxZ > 0.055, `maxZ=${(maxZ * 1000).toFixed(1)}mm`);
  check("lift: reads as a lift transit, not a subway", sawLiftSupport);
  check("lift: released at the top", ejected && zAtEject > 0.055, `z=${(zAtEject * 1000).toFixed(1)}mm`);
  check(
    "lift: ballistic hand-off landed back at ground",
    !lift.active && landed,
    `z=${ball.height.z}`,
  );
}

// ──────────────────────────── Magnet ────────────────────────────
{
  const { pw, ball, place, run } = makeRig();
  const magnet = new Magnet({
    id: "hook",
    x: 0.3,
    y: 0.5,
    radius: 0.08,
    pull: 30,
    captureRadius: 0.012,
    holdS: 0.4,
    fling: { x: 1, y: 0 },
    flingSpeed: 1.2,
    cooldownS: 1,
  });
  let captured = false;
  let released = false;
  magnet.onCapture = () => (captured = true);
  magnet.onRelease = () => (released = true);

  const step = () => {
    pw.update(
      FIXED_DT,
      () => {
        ball.height.applyForces(ball.body);
        magnet.applyForces([ball]);
      },
      () => {
        const p = ball.body.getPosition();
        ball.height.step(FIXED_DT, p.x, p.y);
      },
    );
    magnet.update(FIXED_DT, [ball]);
  };

  // unlit: the ball sails straight past
  magnet.lit = false;
  place(0.25, 0.5, 1.0, 0);
  run(0.3, step);
  check("magnet: unlit is inert", !captured && ball.body.getPosition().x > 0.4);

  // lit: snagged at speed, held, then flung along def.fling
  magnet.lit = true;
  place(0.25, 0.5, 1.0, 0);
  run(0.2, step);
  check("magnet: lit snags a passing ball", captured && magnet.holding);
  run(0.5, step);
  const v = ball.body.getLinearVelocity();
  check("magnet: holds then flings", released && !magnet.holding);
  check(
    "magnet: fling follows def.fling at flingSpeed",
    v.x > 0.9 && Math.abs(v.y) < 0.4,
    `v=(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`,
  );
}

// ───────────────────────────── Disc ─────────────────────────────
{
  const { pw, ball, place, run } = makeRig();
  const disc = new Disc({ id: "turntable", x: 0.3, y: 0.5, r: 0.04, grip: 8, maxAccel: 40 });

  const step = () => {
    pw.update(
      FIXED_DT,
      () => {
        ball.height.applyForces(ball.body);
        disc.applyForces([ball]);
      },
      () => {
        const p = ball.body.getPosition();
        ball.height.step(FIXED_DT, p.x, p.y);
      },
    );
    disc.update(FIXED_DT);
  };

  // parked: no sideways force (ball directly below the centre only falls)
  disc.spin = 0;
  place(0.3, 0.53);
  run(0.15, step);
  check("disc: parked is inert", Math.abs(ball.body.getLinearVelocity().x) < 0.01);

  // spinning: tangential coupling deflects the crosser sideways
  disc.spin = 10;
  place(0.3, 0.53);
  run(0.15, step);
  const vx = ball.body.getLinearVelocity().x;
  check("disc: spin deflects a ground ball tangentially", vx < -0.05, `vx=${vx.toFixed(3)}`);
  check("disc: integrates its render angle", disc.angle > 1);

  // out of reach: an elevated ball is untouched (transit above the disc)
  disc.spin = 10;
  place(0.3, 0.53);
  ball.height.beginTransit(0.04);
  run(0.15, step);
  // the scripted transit isn't easing the ball here, so only the disc could
  // have moved it sideways — it must not have
  check(
    "disc: ignores a ball riding above it",
    Math.abs(ball.body.getLinearVelocity().x) < 0.01,
  );
  ball.height.endTransit();
}

console.log(failures ? `\n${failures} FAILED` : "\nall entity checks passed");
process.exit(failures ? 1 : 0);
