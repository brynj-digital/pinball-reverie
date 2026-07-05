/**
 * Headless physics smoke test (no DOM): builds each table from its spec +
 * playfield SVG and verifies core behaviours plus every known ball-trap
 * scenario. Run with `npm run simcheck [table]` (default: all tables).
 */
import { readFileSync } from "node:fs";
import { Vec2 } from "planck";
import { EventBus } from "../src/core/EventBus";
import { PhysicsWorld, FIXED_DT } from "../src/core/PhysicsWorld";
import { buildTableFromSvg } from "../src/table/DevTable";
import { parseTableSvg } from "../src/table/SvgCollision";
import { Ball } from "../src/entities/Ball";
import { Flipper } from "../src/entities/Flipper";
import { Bumper } from "../src/entities/Bumper";
import { Slingshot } from "../src/entities/Slingshot";
import { DropTargetBank } from "../src/entities/DropTargetBank";
import { Spinner } from "../src/entities/Spinner";
import { Kicker } from "../src/entities/Kicker";
import { Subway } from "../src/entities/Subway";
import { Scoring } from "../src/game/Scoring";
import type { TableLogic } from "../src/game/TableLogic";
import { MoondialLogic } from "../src/game/moondial";
import { TidebreakerLogic } from "../src/game/tidebreaker";
import { MidwayLogic } from "../src/game/midway";
import { FLIPPER } from "../src/table/geometry";
import { TABLE_SPECS, type TableId } from "../src/table/specs";
import { DEFAULT_TUNING } from "../src/tuning";
import moondialRules from "../design/tables/moondial/rules.json";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

/** Builds a full headless table rig, wired the same way Game wires it. */
function buildRig(id: TableId) {
  const spec = TABLE_SPECS[id];
  const g = spec.geometry;
  const t = { ...DEFAULT_TUNING };
  const bus = new EventBus();
  const pw = new PhysicsWorld(bus, t);
  const svgText = readFileSync(
    new URL(`../design/tables/${id}/playfield.svg`, import.meta.url),
    "utf8",
  );
  const table = buildTableFromSvg(pw.world, t, svgText, g);
  const ball = new Ball(pw.world, t, g.table.spawn);
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
  const subways = g.subways.map(
    (d) => new Subway(d, table.profiles.find((p) => p.name === d.id)!),
  );
  const scoring = new Scoring(bus, spec.scoring);
  const logic: TableLogic = spec.createLogic({
    bus,
    scoring,
    sfx: () => {},
    shake: () => {},
    push: () => {},
    baked: () => undefined,
  });

  // event capture + the same wiring Game does
  const state = {
    drained: false,
    sensors: [] as string[],
    hits: [] as string[],
    labels: [] as string[],
    spins: 0,
    bankDone: false,
    modeEvents: [] as string[],
  };
  bus.on("sensor", ({ kind, id: sid, toLayer, upOnly, bounds }) => {
    state.sensors.push(sid ? `${kind}:${sid}` : kind);
    ball.queueLayerSwitch(pw, { toLayer, upOnly, bounds });
    // captive balls are exempt, as in Game: saving subways cross the drain zone
    if (kind === "drain" && !kickers.some((k) => k.holding) && !subways.some((s) => s.active))
      state.drained = true;
    if (kind === "spinner") spinner.trip(ball.body.getLinearVelocity().y);
    if (kind === "kicker" && sid) {
      // capture only a physically-present ball — synthetic kicker events in
      // the rules tests fire with the ball parked at the plunger saddle
      const k = kickers.find((k) => k.def.id === sid);
      const p = ball.body.getPosition();
      if (
        k &&
        Math.hypot(p.x - k.def.hold.x, p.y - k.def.hold.y) < 0.06 &&
        logic.kickerLit(sid) &&
        k.capture()
      )
        logic.onCapture?.(sid);
    }
    if (kind === "subway" && sid) {
      const s = subways.find((s) => s.def.id === sid);
      if (s && logic.kickerLit(sid) && s.capture()) logic.onCapture?.(sid);
    }
    if (kind === "rollover" && sid) logic.onRollover(sid);
  });
  bus.on("hit", ({ kind, id: hid }) => {
    state.hits.push(`${kind}:${hid}`);
    if (kind === "bumper") bumpers.find((b) => b.def.id === hid)?.kick(ball, pw, t.bumperKick);
    if (kind === "sling") slings.find((s) => s.def.id === hid)?.kick(ball, pw, t.slingKick);
    if (kind === "target") bank.onHit(hid);
  });
  bus.on("spinnerTick", () => state.spins++);
  bus.on("bankComplete", () => (state.bankDone = true));
  bus.on("score", ({ label }) => state.labels.push(label));
  bus.on("mode", ({ kind }) => state.modeEvents.push(kind));

  function run(seconds: number, each?: () => void): void {
    const steps = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      pw.update(FIXED_DT); // also flushes the post-step queue
      bank.update(FIXED_DT);
      for (const k of kickers) k.update(FIXED_DT, ball, t);
      for (const s of subways) s.update(FIXED_DT, ball);
      spinner.update(FIXED_DT);
      scoring.update(FIXED_DT);
      logic.update(FIXED_DT);
      for (const s of slings) s.update(FIXED_DT);
      for (const b of bumpers) b.update(FIXED_DT);
      each?.();
    }
  }

  function placeBall(x: number, y: number, vx = 0, vy = 0): void {
    for (const k of kickers) k.cancel(ball);
    for (const s of subways) s.cancel(ball);
    ball.setLayer(0);
    ball.body.setGravityScale(1);
    ball.body.setTransform(new Vec2(x, y), 0);
    ball.body.setLinearVelocity(new Vec2(vx, vy));
    ball.body.setAngularVelocity(0);
  }

  const wallR = parseTableSvg(svgText).walls[0].radius;
  return { spec, g, t, bus, pw, ball, flippers, bumpers, slings, bank, spinner, kickers, subways, scoring, logic, state, run, placeBall, wallR };
}

// ═══════════════════════════ MOONDIAL ═══════════════════════════
function moondialSuite(): void {
  console.log("\n── moondial ──");
  const rig = buildRig("moondial");
  const { g, t, bus, ball, state, run, placeBall, wallR } = rig;
  const logic = rig.logic as MoondialLogic;
  const kicker = rig.kickers[0];
  const left = rig.flippers[0];
  left.update(false, t);
  rig.flippers[1].update(false, t);

  // 1 — ball falls under slope-gravity and settles ON the plunger saddle
  run(2);
  {
    const p = ball.body.getPosition();
    const v = ball.body.getLinearVelocity();
    const restY = g.plunger.saddleY - wallR - 0.0135;
    check(
      "ball settles ON the plunger saddle",
      Math.abs(p.y - restY) < 0.004 && p.x > g.table.laneWallX && Math.abs(v.y) < 0.05,
      `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}), saddle rest y=${restY.toFixed(3)}`,
    );
  }

  // 2 — full-power launch rides the orbit and comes down the left lane
  ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
  let minY = g.table.height;
  let minX = g.table.width;
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
  check("drain sensor fires", state.drained);

  // 5 — traps: seam drops, tip gap, and zero-speed creeps down each wall
  for (const [label, x, y] of [
    ["left seam drop", 0.178, 0.915],
    ["right seam drop", 0.342, 0.915],
    ["tip gap drop", 0.26, 0.915],
    // creep points sit on the wall FACE (centerline + stroke half-width)
    ["left wall creep", 0.1121, 0.8635],
    ["right wall creep", 0.4079, 0.8635], // mirror of the left creep point
  ] as const) {
    state.drained = false;
    placeBall(x, y);
    run(4);
    const p = ball.body.getPosition();
    check(`${label} does not trap the ball`, state.drained, `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`);
  }

  // 6 — a ball dropped onto a HELD-UP flipper must cradle, not be slapped away
  left.update(true, t);
  run(0.3);
  state.drained = false;
  placeBall(0.21, 0.85);
  run(1.5, () => left.update(true, t));
  {
    const v = ball.body.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y);
    check("ball cradles on held-up flipper", !state.drained && speed < 0.05, `speed=${speed.toFixed(3)}`);
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
    state.hits.some((h) => h === "bumper:1") && maxSpeed > 1.0,
    `maxSpeed=${maxSpeed.toFixed(2)}`,
  );

  // 8 — slingshot kicks toward the playfield
  placeBall(0.125, 0.66, 0, 1.2);
  let maxVx = -Infinity;
  run(0.5, () => (maxVx = Math.max(maxVx, ball.body.getLinearVelocity().x)));
  check(
    "sling hit fires and kicks rightward",
    state.hits.some((h) => h === "sling:left") && maxVx > 0.1,
    `maxVx=${maxVx.toFixed(2)}`,
  );

  // 9 — top-lane rollover fires as the ball passes
  placeBall(0.26, 0.07);
  run(1);
  check("middle rollover fires", state.sensors.includes("rollover:2"));

  // 10 — drop targets: three hits drop the bank, bonus fires, bank resets
  for (const tgt of g.dropTargets.targets) {
    placeBall(0.45, tgt.y, 1.5, 0);
    run(0.5);
  }
  check("all three targets dropped + bank bonus", state.bankDone && rig.bank.targets.every((x) => !x.up));
  run(1.5);
  check("bank resets after delay", rig.bank.targets.every((x) => x.up));

  // 11 — kinetic-loop trap: a ball dropped dead-centre onto the bumper nest
  placeBall(0.26, 0.3);
  let escaped = false;
  run(30, () => {
    if (ball.body.getPosition().y > 0.6) escaped = true;
  });
  {
    const p = ball.body.getPosition();
    check("bumper nest does not loop the ball forever", escaped, `after 30s pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`);
  }

  // 12 — orbit shot from the left lane: entry → spinner → exit scores the orbit
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check("spinner spins and ticks", state.spins > 0, `ticks=${state.spins}`);
  check("orbit entry+exit both fire", state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"));
  check("orbit combo scores", state.labels.includes("ORBIT"), `score=${rig.scoring.total}`);

  // 12b — telescope scoop: captured at the hold anchor, held, kicked out left
  state.drained = false;
  placeBall(0.42, 0.55, 0.55, -1.1);
  let captured = false;
  run(1, () => {
    if (kicker.holding) captured = true;
  });
  check("scoop shot is captured and held", captured && kicker.holding && state.sensors.includes("kicker:telescope"));
  run(0.5);
  {
    const p = ball.body.getPosition();
    const v = ball.body.getLinearVelocity();
    check(
      "held ball rests at the telescope anchor",
      kicker.holding &&
        Math.hypot(p.x - kicker.def.hold.x, p.y - kicker.def.hold.y) < 0.01 &&
        Math.hypot(v.x, v.y) < 0.02,
      `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }
  let ejectX = NaN;
  run(3, () => {
    const p = ball.body.getPosition();
    if (Number.isNaN(ejectX) && p.y >= 0.95) ejectX = p.x;
  });
  check(
    "kickout feeds the left flipper",
    !kicker.holding && ejectX > 0.05 && ejectX < 0.26,
    `crossed y=0.95 at x=${Number.isNaN(ejectX) ? "never" : ejectX.toFixed(3)}`,
  );

  // 12c — the scoop pocket must not trap an uncaptured ball
  state.drained = false;
  placeBall(0.48, 0.43);
  run(10);
  check("scoop mouth does not trap a dead ball", state.drained);

  // 12d — the wedge where the scoop hood meets the lane wall must shed a ball
  state.drained = false;
  placeBall(0.5, 0.295);
  run(5);
  check("orbit-tail / scoop-hood corner does not trap", state.drained);

  // 13 — the Moondial ruleset, driven with synthetic events. Expected:
  // 2×5000 + 2500 + 5000 + 10000 + 10000 + 100×2 + 25000×2 = 87,700.
  placeBall(0.5475, 0.95); // park on the plunger saddle, away from all sensors
  run(1.5);
  rig.scoring.reset();
  logic.resetGame();
  state.modeEvents.length = 0;
  const syntheticOrbit = () => {
    bus.emit("sensor", { kind: "ramp-entry" });
    run(0.1);
    bus.emit("sensor", { kind: "ramp-exit" });
    run(0.1);
  };
  bus.emit("bankComplete", {});
  bus.emit("bankComplete", {});
  syntheticOrbit();
  syntheticOrbit();
  syntheticOrbit();
  check("eclipse lights after 2 banks + 3 orbits", state.modeEvents.includes("eclipseReady"));
  syntheticOrbit(); // starts the eclipse
  check("eclipse starts on the next orbit", state.modeEvents.includes("eclipseStart") && logic.eclipseActive);
  bus.emit("hit", { kind: "bumper", id: "1" });
  syntheticOrbit(); // eclipse orbit jackpot
  check("ruleset totals are exact", rig.scoring.total === 87700, `total=${rig.scoring.total}`);
  run(26); // let the eclipse expire
  check(
    "eclipse ends after its duration",
    state.modeEvents.includes("eclipseEnd") && !logic.eclipseActive && rig.scoring.eclipseFactor === 1,
  );

  // 15 — telescope sightings (synthetic kicker events): awards escalate in
  // rules order, wrap, and the last sighting spots an orbit. Expected:
  // 2×5000 + 2500 + 5000 + 5000 + 10000 + 15000 + 25000 + 5000 = 77,500.
  rig.scoring.reset();
  logic.resetGame();
  const sightingsSeen: string[] = [];
  let orbitSpotted = false;
  bus.on("telescope", ({ name, spotted }) => {
    sightingsSeen.push(name);
    if (spotted) orbitSpotted = true;
  });
  bus.emit("bankComplete", {});
  bus.emit("bankComplete", {});
  syntheticOrbit();
  syntheticOrbit(); // 2 banks + 2 orbits: the eclipse needs one more orbit
  const visit = () => {
    bus.emit("sensor", { kind: "kicker", id: "telescope" });
    run(0.1);
  };
  visit(); // COMET 5,000
  visit(); // METEOR SHOWER 10,000
  visit(); // NEBULA 15,000
  check("sightings escalate in rules order", sightingsSeen.join(",") === "COMET,METEOR SHOWER,NEBULA");
  check("eclipse not lit before the last sighting", !logic.eclipseReady);
  visit(); // SUPERNOVA 25,000 — spots the 3rd orbit
  check("last sighting spots an orbit and lights the eclipse", orbitSpotted && logic.eclipseReady);
  visit(); // wraps back to COMET
  check(
    "sighting list wraps and totals are exact",
    sightingsSeen[4] === "COMET" && rig.scoring.total === 77500,
    `total=${rig.scoring.total}`,
  );
  check(
    "telescope visits accrue bonus units",
    rig.scoring.bonusUnits === 5 * moondialRules.telescope.bonusUnit,
    `units=${rig.scoring.bonusUnits}`,
  );
}

// ═══════════════════════════ TIDEBREAKER ═══════════════════════════
function tidebreakerSuite(): void {
  console.log("\n── tidebreaker ──");
  const rig = buildRig("tidebreaker");
  const { g, t, bus, ball, state, run, placeBall, wallR } = rig;
  const logic = rig.logic as TidebreakerLogic;
  const bell = rig.kickers.find((k) => k.def.id === "divebell")!;
  const hatch = rig.kickers.find((k) => k.def.id === "hatch")!;
  rig.flippers[0].update(false, t);
  rig.flippers[1].update(false, t);

  // 1 — settles on the plunger saddle (shared envelope with Moondial)
  run(2);
  {
    const p = ball.body.getPosition();
    const restY = g.plunger.saddleY - wallR - 0.0135;
    check(
      "ball settles ON the plunger saddle",
      Math.abs(p.y - restY) < 0.004 && p.x > g.table.laneWallX,
      `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }

  // 2 — full-power launch rides the Current into the left lane
  ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
  let minY = g.table.height;
  let minX = g.table.width;
  run(3, () => {
    const p = ball.body.getPosition();
    minY = Math.min(minY, p.y);
    minX = Math.min(minX, p.x);
  });
  check("launch reaches top of table", minY < 0.3, `minY=${minY.toFixed(3)}`);
  check("launch completes the Current into the left lane", minX < 0.07, `minX=${minX.toFixed(3)}`);

  // 3 — drain fires through the centre gap
  placeBall(0.26, 1.0);
  run(0.5);
  check("drain sensor fires", state.drained);

  // 4 — airlock: three cross-shots drop the bank (runs BEFORE the trap
  // drops — one of those legitimately slides down the target faces and
  // would leave the bank part-dropped)
  state.bankDone = false;
  for (const tgt of g.dropTargets.targets) {
    placeBall(0.16, tgt.y, -1.5, 0);
    run(0.5);
  }
  check("airlock bank drops + bonus", state.bankDone && rig.bank.targets.every((x) => !x.up));
  run(1.5);
  check("airlock resets after delay", rig.bank.targets.every((x) => x.up));

  // 5 — traps: seams, tip gap, guide-wall creeps, and both outlanes (unlit
  // hatch/gutter must pass the ball through to the drain)
  for (const [label, x, y] of [
    ["left seam drop", 0.178, 0.915],
    ["right seam drop", 0.342, 0.915],
    ["tip gap drop", 0.26, 0.915],
    ["left guide creep", 0.113, 0.912],
    ["right guide creep", 0.407, 0.912],
    ["left outlane (hatch unlit)", 0.026, 0.75],
    ["right outlane (gutter unlit)", 0.494, 0.75],
    ["deflector wedge", 0.02, 0.6],
    ["trench pocket dead drop", 0.203, 0.53],
    ["bell mouth dead drop", 0.24, 0.5],
    ["airlock recess drop", 0.105, 0.47],
    ["ramp mouth drop (layer 0)", 0.349, 0.69],
  ] as const) {
    state.drained = false;
    placeBall(x, y);
    run(10);
    const p = ball.body.getPosition();
    check(`${label} does not trap the ball`, state.drained, `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}) layer=${ball.layer}`);
  }

  // 5 — sonar buoy kicks
  placeBall(0.15, 0.185, 0, 0.8);
  let maxSpeed = 0;
  run(0.4, () => {
    const v = ball.body.getLinearVelocity();
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y));
  });
  check(
    "buoy bumper fires and kicks",
    state.hits.some((h) => h === "bumper:1") && maxSpeed > 1.0,
    `maxSpeed=${maxSpeed.toFixed(2)}`,
  );

  // 6 — D-I-V-E lane rollover fires
  placeBall(0.225, 0.07);
  run(1);
  check("I lane rollover fires", state.sensors.includes("rollover:2"));

  // 8 — the winch ramp: straight-up right-flipper shot enters the mouth,
  // switches to layer 1, spins the reel, crests, rides the habitrail and
  // drops into the left inlane; the trip pays WINCH
  state.spins = 0;
  state.drained = false;
  placeBall(0.349, 0.75, 0, -2.2);
  let onRamp = false;
  let landedX = NaN;
  run(8, () => {
    if (ball.layer === 1) onRamp = true;
    if (Number.isNaN(landedX) && ball.layer === 0 && onRamp && ball.body.getPosition().y > 0.7)
      landedX = ball.body.getPosition().x;
  });
  check("ramp shot switches to layer 1", onRamp && state.sensors.includes("layer:winch-in"));
  check("winch spinner ticks on the climb", state.spins > 0, `ticks=${state.spins}`);
  check("habitrail exit fires + WINCH scores", state.sensors.includes("layer:rail-out") && state.labels.includes("WINCH HAUL"));
  check(
    "rail drops the ball into the left inlane",
    landedX > 0.045 && landedX < 0.1,
    `landed x=${Number.isNaN(landedX) ? "never" : landedX.toFixed(3)}`,
  );
  check("inlane feeds through to the drain (flippers down)", state.drained, `layer=${ball.layer}`);

  // 8b — a weak ramp shot rolls back out of the mouth and returns to layer 0
  placeBall(0.349, 0.75, 0, -1.0);
  run(4);
  check(
    "failed ramp climb restores layer 0",
    ball.layer === 0 && state.sensors.includes("layer:winch-back"),
    `layer=${ball.layer}`,
  );

  // 9 — the Current scores (left-lane shot up around the arch)
  state.labels.length = 0;
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check("Current entry+exit both fire", state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"));
  check("Current scores", state.labels.includes("CURRENT"), `score=${rig.scoring.total}`);

  // 10 — dive bell: capture, hold at anchor, eject to the left flipper;
  // the haul ladder starts and the trench gutter lights
  state.drained = false;
  placeBall(0.272, 0.56, 0, -1.1);
  let captured = false;
  run(1, () => {
    if (bell.holding) captured = true;
  });
  check("dive bell captures the shot", captured && state.sensors.includes("kicker:divebell"));
  const haulsSeen: string[] = [];
  bus.on("telescope", ({ name }) => haulsSeen.push(name));
  let bellEjectX = NaN;
  run(4, () => {
    const p = ball.body.getPosition();
    if (Number.isNaN(bellEjectX) && !bell.holding && p.y >= 0.95) bellEjectX = p.x;
  });
  check(
    "bell kickout feeds the left flipper",
    !bell.holding && bellEjectX > 0.05 && bellEjectX < 0.27,
    `crossed y=0.95 at x=${Number.isNaN(bellEjectX) ? "never" : bellEjectX.toFixed(3)}`,
  );
  check("first haul awarded (BRASS COMPASS)", state.labels.includes("BRASS COMPASS"));
  check("bell capture lights the trench gutter", logic.kickerLit("gutter"));

  // 11 — trench mouth: subway carries the ball under the field to the bell
  state.drained = false;
  state.labels.length = 0;
  placeBall(0.203, 0.6, 0, -1.2);
  let transited = false;
  run(3, () => {
    if (ball.layer === -1) transited = true;
  });
  check(
    "trench subway captures and transits",
    transited && state.sensors.includes("subway:trench") && state.labels.includes("TRENCH RUN"),
  );
  check("transit restores layer 0", ball.layer === 0, `layer=${ball.layer}`);

  // 12 — trench gutter (lit): the right outlane carries the ball across to
  // the hatch position and fires it back up the left outlane
  state.drained = false;
  placeBall(0.494, 0.75);
  let gutterRide = false;
  let resurfacedY = Infinity;
  let ridden = false;
  run(6, () => {
    if (ball.layer === -1) gutterRide = true;
    if (gutterRide && ball.layer === 0) {
      ridden = true;
      resurfacedY = Math.min(resurfacedY, ball.body.getPosition().y);
    }
  });
  check(
    "lit gutter saves the outlane ball",
    gutterRide && ridden && state.sensors.includes("subway:gutter"),
    `rode=${gutterRide} minY after=${resurfacedY.toFixed(3)}`,
  );
  check("gutter consumes its light", !logic.kickerLit("gutter"));

  // 13 — escape hatch: complete D-I-V-E to light it, then the kickback
  // saves a left-outlane ball
  for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check("D-I-V-E lights the hatch + raises the multiplier", logic.kickerLit("hatch") && rig.scoring.multiplier === 2);
  state.drained = false;
  placeBall(0.026, 0.8);
  let hatchFired = false;
  let kickMinY = 1.1;
  run(4, () => {
    if (hatch.holding) hatchFired = true;
    if (hatchFired && !hatch.holding) kickMinY = Math.min(kickMinY, ball.body.getPosition().y);
  });
  // (the ball may legitimately drain again later — flippers are down; the
  // save itself is the kickback firing it back above the sling line)
  check(
    "lit hatch kickback saves the ball",
    hatchFired && kickMinY < 0.72,
    `minY=${kickMinY.toFixed(3)}`,
  );
  check("hatch consumes its light", !logic.kickerLit("hatch"));

  // 14 — LEVIATHAN, synthetically: four more D-I-V-E completions reach the
  // trench floor (multiplier caps at ×5), two airlock cycles arm it, the
  // next Current starts ×2 scoring with Current jackpots
  placeBall(0.5475, 0.95); // park on the saddle away from all sensors
  run(1.5);
  for (let round = 0; round < 4; round++)
    for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check("depth gauge reaches TRENCH FLOOR (multiplier capped ×5)", rig.scoring.multiplier === 5);
  check("gauge lamps track the stage", logic.lamp("g5") === 1 && logic.lamp("g1") === 1);
  bus.emit("bankComplete", {});
  bus.emit("bankComplete", {});
  check("leviathan lights after floor + 2 airlocks", state.modeEvents.includes("leviathanReady"));
  const syntheticCurrent = () => {
    bus.emit("sensor", { kind: "ramp-entry" });
    run(0.1);
    bus.emit("sensor", { kind: "ramp-exit" });
    run(0.1);
  };
  syntheticCurrent();
  check("leviathan starts on the next Current", state.modeEvents.includes("leviathanStart") && logic.leviathanActive);
  check("leviathan doubles scoring", rig.scoring.eclipseFactor === 2);
  state.labels.length = 0;
  syntheticCurrent();
  check("Currents pay jackpots during leviathan", state.labels.includes("LEVIATHAN CURRENT"));
  run(26);
  check(
    "leviathan ends after its duration",
    state.modeEvents.includes("leviathanEnd") && !logic.leviathanActive && rig.scoring.eclipseFactor === 1,
  );
}

// ═══════════════════════════ MIDNIGHT MIDWAY ═══════════════════════════
function midwaySuite(): void {
  console.log("\n── midway ──");
  const rig = buildRig("midway");
  const { g, t, bus, ball, state, run, placeBall, wallR } = rig;
  const logic = rig.logic as MidwayLogic;
  const booth = rig.kickers.find((k) => k.def.id === "booth")!;
  const stamp = rig.kickers.find((k) => k.def.id === "stamp")!;
  const mallet = rig.flippers[2];
  rig.flippers[0].update(false, t);
  rig.flippers[1].update(false, t);
  mallet.update(false, t);

  // 1 — settles on the plunger saddle (shared envelope)
  run(2);
  {
    const p = ball.body.getPosition();
    const restY = g.plunger.saddleY - wallR - 0.0135;
    check(
      "ball settles ON the plunger saddle",
      Math.abs(p.y - restY) < 0.004 && p.x > g.table.laneWallX,
      `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }

  // 2 — full-power launch reaches the top of the table (the orbit's right
  // tail is deliberately open here, so completion isn't guaranteed art —
  // but the plunge must at least crest the arch)
  ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
  let minY = g.table.height;
  let minX = g.table.width;
  run(3, () => {
    const p = ball.body.getPosition();
    minY = Math.min(minY, p.y);
    minX = Math.min(minX, p.x);
  });
  check("launch crests the arch", minY < 0.3, `minY=${minY.toFixed(3)}`);
  check("launch leaves the queue", minX < 0.45, `minX=${minX.toFixed(3)}`);

  // 3 — drain fires through the centre gap
  placeBall(0.26, 1.0);
  run(0.5);
  check("drain sensor fires", state.drained);

  // 4 — drop tower: three cross-shots from the left drop the bank
  state.bankDone = false;
  for (const tgt of g.dropTargets.targets) {
    placeBall(0.42, tgt.y, 1.5, 0);
    run(0.5);
  }
  check("drop tower bank drops + bonus", state.bankDone && rig.bank.targets.every((x) => !x.up));
  check("dropping the tower lights the prize booth", logic.kickerLit("booth"));
  run(1.5);
  check("tower resets after delay", rig.bank.targets.every((x) => x.up));

  // 5 — traps: seams, tip gap, guide creeps, outlanes (unlit), pockets,
  // mouths, and the mallet's whole catch region
  for (const [label, x, y] of [
    ["left seam drop", 0.178, 0.915],
    ["right seam drop", 0.342, 0.915],
    ["tip gap drop", 0.26, 0.915],
    ["left guide creep", 0.113, 0.912],
    ["right guide creep", 0.407, 0.912],
    ["left outlane (stamp unlit)", 0.026, 0.75],
    ["right outlane (chicken unlit)", 0.494, 0.75],
    ["deflector wedge", 0.02, 0.6],
    ["ghost pocket dead drop", 0.24, 0.51],
    ["booth mouth dead drop", 0.35, 0.47],
    ["tower recess drop", 0.482, 0.47],
    ["coaster mouth drop (layer 0)", 0.163, 0.69],
    ["mallet catch drop", 0.452, 0.25],
    ["drop right of the mallet pivot", 0.49, 0.2],
    ["striker mouth downward drop", 0.47, 0.24],
  ] as const) {
    state.drained = false;
    placeBall(x, y);
    run(10);
    const p = ball.body.getPosition();
    // "not trapped" = drained, or rolled home to the queue (the striker
    // mouth region legitimately sheds some balls over the lane wall top)
    const inQueue = p.x > g.table.laneWallX && p.y > 0.95;
    check(`${label} does not trap the ball`, state.drained || inQueue, `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}) layer=${ball.layer}`);
  }

  // 6 — dodgem bumper kicks
  placeBall(0.24, 0.17, 0, 0.8);
  let maxSpeed = 0;
  run(0.4, () => {
    const v = ball.body.getLinearVelocity();
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y));
  });
  check(
    "dodgem bumper fires and kicks",
    state.hits.some((h) => h === "bumper:1") && maxSpeed > 1.0,
    `maxSpeed=${maxSpeed.toFixed(2)}`,
  );

  // 7 — P-A-R-K lane rollover fires
  placeBall(0.225, 0.07);
  run(1);
  check("A lane rollover fires", state.sensors.includes("rollover:2"));

  // 8 — the coaster: straight-up left-flipper shot enters the mouth,
  // switches to layer 1, rides the two-crest circuit and drops off into
  // the right inlane; the circuit pays COASTER
  state.drained = false;
  placeBall(0.163, 0.75, 0, -2.2);
  let onRide = false;
  let landedX = NaN;
  run(8, () => {
    if (ball.layer === 1) onRide = true;
    if (Number.isNaN(landedX) && ball.layer === 0 && onRide && ball.body.getPosition().y > 0.7)
      landedX = ball.body.getPosition().x;
  });
  check("coaster shot switches to layer 1", onRide && state.sensors.includes("layer:coaster-in"));
  check("circuit completes + COASTER scores", state.sensors.includes("layer:coaster-out") && state.labels.includes("COASTER"));
  check(
    "drop-off lands in the right inlane",
    landedX > 0.4 && landedX < 0.48,
    `landed x=${Number.isNaN(landedX) ? "never" : landedX.toFixed(3)}`,
  );
  check("inlane feeds through to the drain (flippers down)", state.drained, `layer=${ball.layer}`);

  // 8b — a weak coaster shot stalls on the lift hill and rolls back out of
  // the mouth to layer 0
  state.sensors.length = 0;
  placeBall(0.163, 0.75, 0, -0.75);
  run(4);
  check(
    "failed lift hill restores layer 0",
    ball.layer === 0 && state.sensors.includes("layer:coaster-back"),
    `layer=${ball.layer}`,
  );

  // 9 — the Sky Ride scores (left-lane shot up around the arch)
  state.labels.length = 0;
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check("Sky Ride entry+exit both fire", state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"));
  check("Sky Ride scores", state.labels.includes("SKY RIDE"), `score=${rig.scoring.total}`);

  // 10 — ghost train: shot through the turnstile spinner is captured and
  // carried under the field, out past the wheel
  state.spins = 0;
  state.drained = false;
  state.labels.length = 0;
  placeBall(0.24, 0.62, 0, -1.2);
  let rode = false;
  run(4, () => {
    if (ball.layer === -1) rode = true;
  });
  check("turnstile spinner ticks", state.spins > 0, `ticks=${state.spins}`);
  check(
    "ghost train captures and transits",
    rode && state.sensors.includes("subway:ghost") && state.labels.includes("GHOST TRAIN"),
  );
  check("transit restores layer 0", ball.layer === 0, `layer=${ball.layer}`);

  // 11 — prize booth (lit by the bank): capture, hold, eject to the left
  // flipper; first prize awarded, chicken exit lights. (Fresh ruleset: the
  // trap drops above already consumed a lit booth prize.)
  rig.scoring.reset();
  logic.resetGame();
  state.labels.length = 0;
  bus.emit("bankComplete", {});
  state.drained = false;
  placeBall(0.35, 0.56, 0, -1.4);
  let caught = false;
  run(1.2, () => {
    if (booth.holding) caught = true;
  });
  check("lit booth captures the shot", caught && state.sensors.includes("kicker:booth"));
  let ejectX = NaN;
  run(4, () => {
    const p = ball.body.getPosition();
    if (Number.isNaN(ejectX) && !booth.holding && p.y >= 0.95) ejectX = p.x;
  });
  check(
    "booth kickout feeds the left flipper",
    !booth.holding && ejectX > 0.05 && ejectX < 0.27,
    `crossed y=0.95 at x=${Number.isNaN(ejectX) ? "never" : ejectX.toFixed(3)}`,
  );
  check("first prize awarded (PAPER HAT)", state.labels.includes("PAPER HAT"));
  check("booth capture lights the chicken exit", logic.kickerLit("chicken"));

  // 12 — chicken exit (lit): the right outlane subway carries the ball
  // under the flippers back to the queue — and must NOT count as a drain
  state.drained = false;
  placeBall(0.494, 0.75);
  let chickenRide = false;
  run(6, () => {
    if (ball.layer === -1) chickenRide = true;
  });
  {
    const p = ball.body.getPosition();
    check(
      "lit chicken exit returns the ball to the queue",
      chickenRide && state.sensors.includes("subway:chicken") && p.x > g.table.laneWallX && p.y > 0.9,
      `rode=${chickenRide} rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
    check("the ride back is not a drain", !state.drained);
  }
  check("chicken exit consumes its light", !logic.kickerLit("chicken"));

  // 13 — hand stamp: complete P-A-R-K to light it, then the kickback
  // saves a left-outlane ball
  for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check("P-A-R-K lights the stamp + loads a gondola", logic.kickerLit("stamp") && logic.lamp("g1") === 1);
  state.drained = false;
  placeBall(0.026, 0.8);
  let stampFired = false;
  let kickMinY = 1.1;
  run(4, () => {
    if (stamp.holding) stampFired = true;
    if (stampFired && !stamp.holding) kickMinY = Math.min(kickMinY, ball.body.getPosition().y);
  });
  check("lit stamp kickback saves the ball", stampFired && kickMinY < 0.72, `minY=${kickMinY.toFixed(3)}`);
  check("stamp consumes its light", !logic.kickerLit("stamp"));

  // 14 — the mallet: a skill-drop down the guide lands on the bat; a flip
  // while the ball is mid-bat sends it up the striker lane (layer 1)
  // through the timing gates to the bell
  placeBall(0.452, 0.2);
  run(0.5); // fall onto the bat and start rolling toward the tip
  state.sensors.length = 0;
  state.labels.length = 0;
  let sawStrikerRide = false;
  mallet.update(true, t);
  run(0.35, () => {
    mallet.update(true, t);
    if (ball.layer === 1) sawStrikerRide = true;
  });
  mallet.update(false, t);
  run(4, () => {
    if (ball.layer === 1) sawStrikerRide = true;
  });
  check(
    "mallet flip rides the striker lane",
    sawStrikerRide && state.sensors.includes("layer:striker-out"),
    `sensors=${state.sensors.slice(0, 8).join(",")}`,
  );
  check(
    "swing is graded",
    state.labels.some((l) => l === "DING!" || l.endsWith("SWING")),
    `labels=${state.labels.join(",")}`,
  );

  // 15 — the ruleset, synthetically. Wheel: 5 gondolas turn it (multiplier
  // steps); ride pass: five punches light the finale; the booth starts it.
  placeBall(0.5475, 0.95); // park on the saddle away from all sensors
  run(1.5);
  rig.scoring.reset();
  logic.resetGame();
  state.modeEvents.length = 0;
  state.labels.length = 0;
  const parkCompletion = () => {
    for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
    run(0.1);
  };
  parkCompletion();
  check("first completion loads one gondola, multiplier unchanged", logic.lamp("g1") === 1 && rig.scoring.multiplier === 1);
  for (let i = 0; i < 4; i++) parkCompletion();
  check(
    "five gondolas turn the wheel: multiplier ×2, ring resets",
    rig.scoring.multiplier === 2 && logic.lamp("g1") === 0,
  );

  // small exact-totals segment at a known multiplier: reset, then one DING
  // (10,000) + one coaster (3,000) + one ghost transit (2,500) = 15,500
  rig.scoring.reset();
  logic.resetGame();
  const syntheticSwing = (transitS: number) => {
    bus.emit("sensor", { kind: "layer", id: "striker-in" });
    bus.emit("sensor", { kind: "lane", id: "striker-a" });
    run(transitS);
    bus.emit("sensor", { kind: "lane", id: "striker-b" });
    bus.emit("sensor", { kind: "layer", id: "striker-out" });
    run(0.1);
  };
  syntheticSwing(0.05); // DING
  bus.emit("sensor", { kind: "layer", id: "coaster-out" });
  run(0.1);
  logic.onCapture("ghost");
  run(0.1);
  check(
    "striker DING + coaster + ghost total exactly",
    rig.scoring.total === 15500,
    `total=${rig.scoring.total}`,
  );
  check("DING loads a gondola", logic.lamp("g1") === 1);
  check("DING + coaster + ghost punch the pass", !logic.fireworksReady);

  // remaining punches: tower + a 3-chain of Sky Rides
  bus.emit("bankComplete", {});
  const syntheticLoop = () => {
    bus.emit("sensor", { kind: "ramp-entry" });
    run(0.1);
    bus.emit("sensor", { kind: "ramp-exit" });
    run(0.1);
  };
  syntheticLoop();
  syntheticLoop();
  check("pass not complete before the chain", !logic.fireworksReady);
  syntheticLoop(); // chain of 3 punches skyride — the fifth ride
  check("full ride pass lights the finale", logic.fireworksReady && state.modeEvents.includes("fireworksReady"));
  logic.onCapture("booth"); // shoot the lit booth
  check(
    "fireworks finale starts and doubles scoring",
    state.modeEvents.includes("fireworksStart") && logic.fireworksActive && rig.scoring.eclipseFactor === 2,
  );
  state.labels.length = 0;
  bus.emit("sensor", { kind: "layer", id: "coaster-out" });
  run(0.1);
  check("coaster pays jackpot during the finale", state.labels.includes("COASTER JACKPOT"));
  run(31);
  check(
    "finale ends after its duration",
    state.modeEvents.includes("fireworksEnd") && !logic.fireworksActive && rig.scoring.eclipseFactor === 1,
  );
}

const which = process.argv[2] as TableId | undefined;
if (!which || which === "moondial") moondialSuite();
if (!which || which === "tidebreaker") tidebreakerSuite();
if (!which || which === "midway") midwaySuite();

console.log(failures === 0 ? "\nsimcheck: all checks passed" : `\nsimcheck: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
