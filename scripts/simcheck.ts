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
import { contactApplies, sensorApplies } from "../src/table/Surfaces";
import { Ball } from "../src/entities/Ball";
import { Flipper } from "../src/entities/Flipper";
import { Bumper } from "../src/entities/Bumper";
import { Slingshot } from "../src/entities/Slingshot";
import { DropTargetBank } from "../src/entities/DropTargetBank";
import { Spinner } from "../src/entities/Spinner";
import { Kicker } from "../src/entities/Kicker";
import { Subway } from "../src/entities/Subway";
import { Diverter } from "../src/entities/Diverter";
import { Lift } from "../src/entities/Lift";
import { Magnet } from "../src/entities/Magnet";
import { Disc } from "../src/entities/Disc";
import { Scoring } from "../src/game/Scoring";
import type { TableLogic } from "../src/game/TableLogic";
import { MoondialLogic } from "../src/game/moondial";
import { TidebreakerLogic } from "../src/game/tidebreaker";
import { MidwayLogic } from "../src/game/midway";
import { NightMailLogic } from "../src/game/nightmail";
import { SmallHoursLogic } from "../src/game/smallhours";
import { SumpLogic } from "../src/game/sump";
import { GlasshouseLogic } from "../src/game/glasshouse";
import { FLIPPER, onPlayfieldSide } from "../src/table/geometry";
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
  const ball = new Ball(pw.world, t, g.table.spawn, table.surfaces);
  pw.setZGate((tag, x, y) => contactApplies(tag, table.surfaces, x, y, ball.height.z));
  const flippers = [
    new Flipper(pw.world, table.body, "left", t, g.flippers.left),
    new Flipper(pw.world, table.body, "right", t, g.flippers.right),
  ];
  if (g.flippers.upper)
    flippers.push(new Flipper(pw.world, table.body, g.flippers.upper.side, t, g.flippers.upper));
  if (g.flippers.mini)
    flippers.push(
      new Flipper(pw.world, table.body, "left", t, g.flippers.mini.left),
      new Flipper(pw.world, table.body, "right", t, g.flippers.mini.right),
    );
  const bumpers = g.bumpers.map((d) => new Bumper(pw.world, d));
  const slings = g.slings.map((d) => new Slingshot(pw.world, d));
  const bank = new DropTargetBank(pw.world, pw, bus, g.dropTargets);
  const spinner = new Spinner(bus);
  const kickers = g.kickers.map((d) => new Kicker(d));
  const subways = g.subways.map(
    (d) => new Subway(d, table.profiles.find((p) => p.name === d.id)!),
  );
  // M12 entities, wired as in Game (dormant on tables without defs)
  const diverters = (g.diverters ?? []).map(
    (d) => new Diverter(pw.world, pw, d, table.diverterBlades, t),
  );
  const lifts = (g.lifts ?? []).map(
    (d) => new Lift(d, table.profiles.find((p) => p.name === d.id)!),
  );
  const magnets = (g.magnets ?? []).map((d) => new Magnet(d));
  const discs = (g.discs ?? []).map((d) => new Disc(d));
  const scoring = new Scoring(bus, spec.scoring);
  // magnet captures notify logic, as in Game (snag awards + light consume)
  for (const m of magnets) m.onCapture = () => logic.onCapture?.(m.def.id);
  // suites toggle this to test saver-gated geometry (Moondial's gnomon)
  const flags = { saver: false };
  const logic: TableLogic = spec.createLogic({
    bus,
    scoring,
    sfx: () => {},
    saverActive: () => flags.saver,
    shake: () => {},
    push: () => {},
    baked: () => undefined,
    holdScoop: (id, open) => {
      const k = kickers.find((k) => k.def.id === id);
      if (open) k?.beginExtendedHold();
      else k?.release();
    },
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
  // M11: support changes feed logic + resense touching banded sensors
  ball.height.onChange = (from, to) => {
    const p = ball.body.getPosition();
    bus.emit("surface", { from, to, x: p.x, y: p.y, z: ball.height.z });
    for (const tag of pw.sensorsTouching(ball.body)) {
      if ((tag.zMin !== undefined || tag.zMax !== undefined) && sensorApplies(tag, ball.height.z))
        bus.emit("sensor", { kind: tag.kind, id: tag.id, zMin: tag.zMin, zMax: tag.zMax });
    }
  };
  bus.on("sensor", ({ kind, id: sid, zMin, zMax }) => {
    if (!sensorApplies({ zMin, zMax }, ball.height.z)) return;
    state.sensors.push(sid ? `${kind}:${sid}` : kind);
    // captive balls are exempt, as in Game: saving subways cross the drain zone
    if (
      kind === "drain" &&
      !kickers.some((k) => k.holding) &&
      !subways.some((s) => s.active) &&
      !lifts.some((l) => l.active) &&
      !magnets.some((m) => m.holding)
    )
      state.drained = true;
    if (kind === "spinner") spinner.trip(ball.body.getLinearVelocity().y);
    if (kind === "kicker" && sid) {
      // capture only a physically-present ball. Synthetic kicker events in the
      // rules tests fire with the ball parked on the plunger saddle, so gate on
      // the ball being in the playfield (not the lane) — robust even for a
      // kickback whose hold point sits far from its trip sensor (the hatch,
      // which catches at the outlane bottom but fires from the chute above).
      const k = kickers.find((k) => k.def.id === sid);
      const p = ball.body.getPosition();
      if (k && onPlayfieldSide(g.table, p.x) && logic.kickerLit(sid) && k.capture(ball))
        logic.onCapture?.(sid);
    }
    if (kind === "subway" && sid) {
      const s = subways.find((s) => s.def.id === sid);
      if (s && logic.kickerLit(sid) && s.capture(ball)) logic.onCapture?.(sid);
    }
    if (kind === "lift" && sid) {
      const l = lifts.find((l) => l.def.id === sid);
      if (l && logic.kickerLit(sid) && l.capture(ball)) logic.onCapture?.(sid);
    }
    if (kind === "rollover" && sid) logic.onRollover(sid);
    if (kind === "skill" && sid) {
      const sv = ball.body.getLinearVelocity();
      logic.onSkillShot?.(sid, Math.hypot(sv.x, sv.y));
    }
  });
  bus.on("hit", ({ kind, id: hid }) => {
    state.hits.push(`${kind}:${hid}`);
    if (kind === "bumper") bumpers.find((b) => b.def.id === hid)?.kick(ball, pw, t.bumperKick);
    if (kind === "sling")
      slings.find((s) => s.def.id === hid)?.kick(ball, pw, t.slingKick * (logic.slingBoost?.() ?? 1));
    if (kind === "target") bank.onHit(hid);
  });
  bus.on("spinnerTick", () => state.spins++);
  bus.on("bankComplete", () => (state.bankDone = true));
  bus.on("score", ({ label }) => state.labels.push(label));
  bus.on("mode", ({ kind }) => state.modeEvents.push(kind));

  function run(seconds: number, each?: () => void): void {
    const steps = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      pw.update(
        FIXED_DT,
        () => {
          ball.height.applyForces(ball.body);
          for (const m of magnets) m.applyForces([ball]);
          for (const d of discs) d.applyForces([ball]);
        },
        () => {
          const p = ball.body.getPosition();
          const v = ball.body.getLinearVelocity();
          ball.height.step(FIXED_DT, p.x, p.y, Math.hypot(v.x, v.y));
        },
      );
      bank.update(FIXED_DT);
      for (const k of kickers) k.update(FIXED_DT, t);
      for (const s of subways) s.update(FIXED_DT);
      for (const l of lifts) l.update(FIXED_DT);
      for (const m of magnets) {
        m.lit = logic.magnetLit?.(m.def.id) ?? false;
        m.update(FIXED_DT, [ball]);
      }
      for (const d of discs) {
        d.spin = logic.discSpin?.(d.def.id) ?? 0;
        d.update(FIXED_DT);
      }
      for (const dv of diverters) dv.setBlade(logic.diverterBlade?.(dv.def.id) ?? dv.def.initial, [ball]);
      spinner.update(FIXED_DT);
      scoring.update(FIXED_DT);
      logic.update(FIXED_DT);
      for (const s of slings) s.update(FIXED_DT);
      for (const b of bumpers) b.update(FIXED_DT);
      each?.();
    }
  }

  function placeBall(x: number, y: number, vx = 0, vy = 0): void {
    for (const k of kickers) k.cancel();
    for (const s of subways) s.cancel();
    for (const l of lifts) l.cancel();
    for (const m of magnets) m.cancel();
    ball.height.reset();
    ball.body.setGravityScale(1);
    ball.body.setTransform(new Vec2(x, y), 0);
    ball.body.setLinearVelocity(new Vec2(vx, vy));
    ball.body.setAngularVelocity(0);
  }

  const wallR = parseTableSvg(svgText).walls[0].radius;
  return { spec, g, t, bus, pw, ball, flippers, bumpers, slings, bank, spinner, kickers, subways, diverters, lifts, magnets, discs, scoring, logic, state, flags, run, placeBall, wallR };
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

  // 9 — THE GNOMON (differentiation pass): the centre post rises with the
  // saver and seals the tip gap; retracted, the same drop drains
  {
    const rig2 = buildRig("moondial");
    rig2.flippers[0].update(false, rig2.t);
    rig2.flippers[1].update(false, rig2.t);
    rig2.flags.saver = true;
    rig2.run(0.2); // let the blade swap settle
    rig2.state.drained = false;
    rig2.placeBall(0.26, 0.915);
    rig2.run(3);
    const postP = rig2.ball.body.getPosition();
    const onPost = { x: postP.x, y: postP.y }; // copy — planck positions are live refs
    check(
      "gnomon up: tip-gap drop rests on the post, no drain",
      !rig2.state.drained && onPost.y < 1.0,
      `rest=(${onPost.x.toFixed(3)}, ${onPost.y.toFixed(3)})`,
    );
    // a single flip must recover the resting ball (the post pocket is
    // reachable — dead-centre it balances, so nudge it a hair off-axis as
    // any real arrival would be, then flip the near flipper)
    rig2.placeBall(0.263, 0.945);
    rig2.run(1.5);
    let peak = 1.05;
    rig2.run(0.6, () => {
      rig2.flippers[1].update(true, rig2.t);
      peak = Math.min(peak, rig2.ball.body.getPosition().y);
    });
    check(
      "gnomon up: a single flip recovers the resting ball",
      peak < onPost.y - 0.05,
      `peak=${peak.toFixed(3)}`,
    );
    rig2.flippers[0].update(false, rig2.t);
    rig2.flippers[1].update(false, rig2.t);
    rig2.flags.saver = false;
    rig2.run(0.5);
    rig2.state.drained = false;
    rig2.placeBall(0.26, 0.915);
    rig2.run(3);
    check("gnomon down: the same drop drains", rig2.state.drained);
  }

  // 10 — FIRST LIGHT skill shot: a soft plunge pays and spots a moon lane;
  // a full plunge does not
  {
    const rig3 = buildRig("moondial");
    rig3.flippers[0].update(false, rig3.t);
    rig3.flippers[1].update(false, rig3.t);
    const logic3 = rig3.logic as MoondialLogic;
    rig3.run(2); // settle on the saddle
    rig3.ball.body.setLinearVelocity(new Vec2(0, -1.2)); // soft plunge
    rig3.run(3);
    check(
      "soft plunge pays FIRST LIGHT and spots a moon lane",
      rig3.scoring.total === moondialRules.skill.points && logic3.laneLit("1") > 0,
      `total=${rig3.scoring.total}`,
    );
    const after = rig3.scoring.total;
    rig3.ball.body.setLinearVelocity(new Vec2(0, -1.2));
    rig3.run(3);
    check("FIRST LIGHT is once per ball", rig3.scoring.total === after, `total=${rig3.scoring.total}`);
    const rig4 = buildRig("moondial");
    rig4.flippers[0].update(false, rig4.t);
    rig4.flippers[1].update(false, rig4.t);
    rig4.run(2);
    rig4.ball.body.setLinearVelocity(new Vec2(0, -rig4.t.plungerMaxSpeed));
    let sawSkillAward = false;
    rig4.bus.on("score", ({ label }) => {
      if (label === "FIRST LIGHT") sawSkillAward = true;
    });
    rig4.run(3);
    check("full plunge does not qualify", !sawSkillAward);
  }
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
  check("ramp shot boards the winch surface", onRamp);
  check("winch spinner ticks on the climb", state.spins > 0, `ticks=${state.spins}`);
  check("habitrail drop-off pays WINCH", state.labels.includes("WINCH HAUL"));
  check(
    "rail drop-off lands in the left inlane",
    landedX > 0.04 && landedX < 0.17,
    `landed x=${Number.isNaN(landedX) ? "never" : landedX.toFixed(3)}`,
  );
  check("inlane feeds through to the drain (flippers down)", state.drained, `layer=${ball.layer}`);

  // 8b — a weak ramp shot rolls back out of the mouth and returns to layer 0
  state.labels.length = 0;
  placeBall(0.349, 0.75, 0, -1.0);
  run(4);
  check(
    "failed ramp climb rolls back to the field",
    ball.layer === 0 && !state.labels.includes("WINCH HAUL"),
    `layer=${ball.layer}`,
  );

  // 8c — a ball dropping in behind the winch ramp deflects off its back
  placeBall(0.37, 0.5, 0, 0.9);
  let winchBreach = false;
  run(10, () => {
    const p = ball.body.getPosition();
    if (ball.layer === 0 && p.x > 0.335 && p.x < 0.365 && p.y > 0.59 && p.y < 0.7)
      winchBreach = true;
  });
  check("ramp back deflects a ball falling in behind it", !winchBreach);

  // 9 — the Current scores (left-lane shot up around the arch)
  state.labels.length = 0;
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check("Current entry+exit both fire", state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"));
  check("Current scores", state.labels.includes("CURRENT"), `score=${rig.scoring.total}`);

  // 10 — dive bell: capture, hold at anchor, eject to the left flipper;
  // the haul ladder starts and the trench gutter lights. (Fresh ruleset:
  // a trap drop above may legally wander into the bell and take a haul.)
  rig.scoring.reset();
  logic.resetGame();
  state.labels.length = 0;
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
  // save itself is the kickback firing it back above the sling line. The
  // 0.60 bar is above the deflector chevron: an eject that clips the
  // barrier and skims flat duds out around y≈0.64 — the old 0.72 bar let
  // that pass because the hold point alone sits at y=0.68)
  check(
    "lit hatch kickback saves the ball",
    hatchFired && kickMinY < 0.6,
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

  // SOUNDING skill shot (differentiation pass): soft plunge pays and spots
  // a D-I-V-E lane; a full plunge does not qualify
  {
    const rigS = buildRig("tidebreaker");
    rigS.flippers[0].update(false, rigS.t);
    rigS.flippers[1].update(false, rigS.t);
    rigS.run(2); // settle on the saddle
    rigS.ball.body.setLinearVelocity(new Vec2(0, -1.2)); // soft plunge
    let sawSounding = false;
    rigS.bus.on("score", ({ label }) => {
      if (label === "SOUNDING") sawSounding = true;
    });
    rigS.run(3);
    check(
      "soft plunge pays SOUNDING and spots a lane",
      sawSounding && (rigS.logic as TidebreakerLogic).laneLit("1") > 0,
      `total=${rigS.scoring.total}`,
    );
    const rigF = buildRig("tidebreaker");
    rigF.flippers[0].update(false, rigF.t);
    rigF.flippers[1].update(false, rigF.t);
    rigF.run(2);
    let sawFull = false;
    rigF.bus.on("score", ({ label }) => {
      if (label === "SOUNDING") sawFull = true;
    });
    rigF.ball.body.setLinearVelocity(new Vec2(0, -rigF.t.plungerMaxSpeed));
    rigF.run(3);
    check("full plunge does not qualify (tidebreaker)", !sawFull);
  }
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
    // dodgem-soak-found (seed 2): the strip between the coaster underbrace
    // and the (now sloped) coaster-back — a side-entered ball must shed
    // left through the gated rail into the orbit-arm corridor
    ["coaster back-strip dead rest", 0.153, 0.569],
    ["booth mouth dead drop", 0.35, 0.47],
    ["tower recess drop", 0.482, 0.47],
    ["coaster mouth drop (layer 0)", 0.163, 0.69],
    ["mallet catch drop", 0.452, 0.25],
    ["drop right of the mallet pivot", 0.49, 0.2],
    ["striker mouth downward drop", 0.45, 0.24],
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
  check("coaster shot boards the ride", onRide);
  check("circuit completes + COASTER scores", state.labels.includes("COASTER"));
  check(
    "drop-off lands in the right inlane",
    landedX > 0.4 && landedX < 0.48,
    `landed x=${Number.isNaN(landedX) ? "never" : landedX.toFixed(3)}`,
  );
  check("inlane feeds through to the drain (flippers down)", state.drained, `layer=${ball.layer}`);

  // 8a2 — a fast shot must still board (the attach window scales with speed)
  state.sensors.length = 0;
  placeBall(0.163, 0.75, 0, -3.2);
  let fastRide = false;
  run(3, () => {
    if (ball.layer === 1) fastRide = true;
  });
  check("fast coaster shot still boards", fastRide);

  // 8a3 — a ball dropping in BEHIND the ramp deflects off its solid back:
  // it must never pass down through the throat at ground level
  placeBall(0.163, 0.54, 0, 0.9);
  let throatBreach = false;
  run(10, () => {
    const p = ball.body.getPosition();
    if (ball.layer === 0 && p.x > 0.147 && p.x < 0.179 && p.y > 0.62 && p.y < 0.7)
      throatBreach = true;
  });
  check("ramp back deflects a ball falling in behind it", !throatBreach);

  // 8a4 — a ball striking the lift hill's SIDE bounces off the rail (it
  // must never pass through into the throat — rails are solid both ways)
  placeBall(0.11, 0.63, 1.2, 0);
  let sideBreach = false;
  run(6, () => {
    const p = ball.body.getPosition();
    if (ball.layer === 0 && p.x > 0.147 && p.x < 0.179 && p.y > 0.6 && p.y < 0.7)
      sideBreach = true;
  });
  check("lift-hill side is solid from the field", !sideBreach);

  // 8b — a weak coaster shot stalls on the lift hill and rolls back out of
  // the mouth to layer 0
  state.sensors.length = 0;
  state.labels.length = 0;
  placeBall(0.163, 0.75, 0, -0.75);
  run(4);
  check(
    "failed lift hill rolls back to the field",
    ball.layer === 0 && !state.labels.includes("COASTER"),
    `layer=${ball.layer}`,
  );

  // 9 — the Sky Ride scores (left-lane shot up around the arch)
  state.labels.length = 0;
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check("Sky Ride entry+exit both fire", state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"));
  check("Sky Ride scores", state.labels.includes("SKY RIDE"), `score=${rig.scoring.total}`);

  // 9b — the Sky Ride delivers the ball onto the mallet (the loop's
  // descending arm is a sealed guide down to the bat)
  state.drained = false;
  placeBall(0.0325, 0.53, 0, -2.3);
  let malletFed = false;
  run(6, () => {
    const p = ball.body.getPosition();
    if (p.x > 0.4 && p.x < 0.515 && p.y > 0.24 && p.y < 0.36) malletFed = true;
  });
  check("Sky Ride return is delivered onto the mallet", malletFed);

  // 10 — ghost train: the turnstile GATES the dark ride now — closed at ball
  // start, opened by spinning it. Reset to a known ball-start state, confirm
  // it's closed, spin it open, then a shot through it is captured and carried
  // under the field, out past the wheel.
  logic.resetGame();
  state.spins = 0;
  state.drained = false;
  state.labels.length = 0;
  check("ghost train starts closed (turnstile gated)", !logic.kickerLit("ghost"));
  for (let i = 0; i < 10 && !logic.kickerLit("ghost"); i++) bus.emit("sensor", { kind: "spinner", id: "" });
  check("turnstile spins open the ghost train", logic.kickerLit("ghost"));
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
  // (0.60 bar as on Tidebreaker: an eject stopped dead by the deflector
  // duds out at y≈0.654, which the old 0.72 bar let pass)
  check("lit stamp kickback saves the ball", stampFired && kickMinY < 0.6, `minY=${kickMinY.toFixed(3)}`);
  check("stamp consumes its light", !logic.kickerLit("stamp"));

  // 14 — the mallet: a skill-drop down the guide lands on the bat; a flip
  // while the ball is mid-bat sends it up the striker lane (layer 1)
  // through the timing gates to the bell
  // (the mallet's strike itself is play-tuned; CI injects the swing so the
  // boarding + gate chain stays deterministic)
  state.sensors.length = 0;
  state.labels.length = 0;
  let sawStrikerRide = false;
  placeBall(0.4678, 0.2608, -2.73, -1.23);
  run(4, () => {
    if (ball.layer === 1) sawStrikerRide = true;
  });
  void mallet;
  check(
    "mallet flip rides the striker lane",
    sawStrikerRide,
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
    bus.emit("surface", { from: "field", to: "striker", x: 0.47, y: 0.28, z: 0 });
    bus.emit("sensor", { kind: "lane", id: "striker-a" });
    run(transitS);
    bus.emit("sensor", { kind: "lane", id: "striker-b" });
    bus.emit("surface", { from: "striker", to: "air", x: 0.14, y: 0.1, z: 0.05 });
    run(0.1);
  };
  const syntheticCoasterRide = () => {
    bus.emit("surface", { from: "field", to: "coaster", x: 0.163, y: 0.7, z: 0 });
    bus.emit("surface", { from: "coaster", to: "field", x: 0.452, y: 0.672, z: 0 });
    run(0.1);
  };
  syntheticSwing(0.05); // DING
  syntheticCoasterRide();
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
  syntheticCoasterRide();
  check("coaster pays jackpot during the finale", state.labels.includes("COASTER JACKPOT"));
  run(31);
  check(
    "finale ends after its duration",
    state.modeEvents.includes("fireworksEnd") && !logic.fireworksActive && rig.scoring.eclipseFactor === 1,
  );
}

// ═══════════════════════════ THE NIGHT MAIL ═══════════════════════════
function nightmailSuite(): void {
  console.log("\n── nightmail ──");
  const rig = buildRig("nightmail");
  const { g, t, bus, ball, state, run, placeBall, wallR } = rig;
  const logic = rig.logic as NightMailLogic;
  const sorting = rig.kickers.find((k) => k.def.id === "sorting")!;
  const banker = rig.kickers.find((k) => k.def.id === "banker")!;
  const siding = rig.kickers.find((k) => k.def.id === "siding")!;
  const lift = rig.lifts[0];
  const magnet = rig.magnets[0];
  const points = rig.diverters[0];
  rig.flippers[0].update(false, t);
  rig.flippers[1].update(false, t);

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

  // 2 — full launch with the points at MAIN rides the whole Main Line into
  // the bottom-left channel, ticking the signal-wire spinner on the way
  check("points boot on the MAIN blade", points.blade === "main");
  ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
  let minY = g.table.height;
  let minX = g.table.width;
  run(3, () => {
    const p = ball.body.getPosition();
    minY = Math.min(minY, p.y);
    minX = Math.min(minX, p.x);
  });
  check("launch reaches top of table", minY < 0.3, `minY=${minY.toFixed(3)}`);
  check("launch completes the Main Line into the left lane", minX < 0.07, `minX=${minX.toFixed(3)}`);
  check("signal-wire spinner ticks on the launch", state.spins > 0, `ticks=${state.spins}`);

  // 3 — drain fires through the centre gap
  placeBall(0.26, 1.0);
  run(0.5);
  check("drain sensor fires", state.drained);

  // 4 — the points thrown to BRANCH divert the same launch onto the
  // exchange lane (a signal-lever target hit toggles the blade)
  bus.emit("hit", { kind: "target", id: "1" });
  run(0.1);
  check("a lever hit throws the points to BRANCH", points.blade === "branch");
  state.sensors.length = 0;
  state.drained = false;
  placeBall(0.5475, 0.97, 0, -t.plungerMaxSpeed);
  run(4);
  check(
    "branched launch arrives on the exchange lane",
    state.sensors.includes("lane:branch"),
    `sensors=${state.sensors.filter((s) => !s.startsWith("drain")).slice(0, 6).join(",")}`,
  );
  bus.emit("hit", { kind: "target", id: "1" }); // back to MAIN
  run(0.1);

  // 5 — signal gantry: three cross-shots drop the bank and light LOCK
  state.bankDone = false;
  for (const tgt of g.dropTargets.targets) {
    placeBall(0.16, tgt.y, -1.5, 0);
    run(0.5);
  }
  check("gantry bank drops", state.bankDone && rig.bank.targets.every((x) => !x.up));
  check("bank completion lights LOCK", logic.kickerLit("siding"));
  run(1.5);
  check("gantry resets after delay", rig.bank.targets.every((x) => x.up));

  // 6 — coupling: a lane ball with LOCK lit is captured at the siding
  state.labels.length = 0;
  placeBall(0.094, 0.2, 0, 0.4);
  let coupled = false;
  run(3, () => {
    if (siding.holding) coupled = true;
  });
  check("lit siding couples a wagon", coupled, `held=${coupled}`);
  check("coupling consumes LOCK", !logic.kickerLit("siding"));

  // 7 — the exchange: spinner spins arm the hook, the hook snags a lane
  // ball at speed, holds, and flings it on down the lane
  for (let i = 0; i < 8; i++) bus.emit("spinnerTick", {});
  run(0.1);
  check("spins arm the exchange", magnet.lit);
  state.labels.length = 0;
  placeBall(0.094, 0.2, 0, 1.0);
  let snagged = false;
  run(4, () => {
    if (magnet.holding) snagged = true;
  });
  check("the mail hook snags the lane ball", snagged && state.labels.includes("MAIL SNAGGED"));
  check("the snag consumes the light", !logic.magnetLit());

  // 8 — the incline: a left-flipper-strength shot into the throat is
  // captured, carried to the summit at height, and released ballistically
  state.labels.length = 0;
  placeBall(0.355, 0.75, 0, -1.5);
  let carried = false;
  let maxZ = 0;
  run(8, () => {
    if (lift.active) carried = true;
    maxZ = Math.max(maxZ, ball.height.z);
  });
  check("incline captures and carries", carried && state.labels.includes("BANKING ENGINE"));
  check("the carry really climbs", maxZ > 0.025, `maxZ=${(maxZ * 1000).toFixed(0)}mm`);
  check("summit release returns to ground", !lift.active && ball.height.z === 0, `z=${ball.height.z}`);

  // 9 — sorting office: capture, mailbag award, loop line lights
  rig.scoring.reset();
  logic.resetGame();
  state.labels.length = 0;
  placeBall(0.272, 0.56, 0, -1.1);
  let sortCaught = false;
  run(1, () => {
    if (sorting.holding) sortCaught = true;
  });
  check("sorting office captures the shot", sortCaught && state.sensors.includes("kicker:sorting"));
  let ejectX = NaN;
  run(4, () => {
    const p = ball.body.getPosition();
    if (Number.isNaN(ejectX) && !sorting.holding && p.y >= 0.95) ejectX = p.x;
  });
  check(
    "sorting kickout feeds the RIGHT flipper",
    !sorting.holding && ejectX > 0.27 && ejectX < 0.49,
    `crossed y=0.95 at x=${Number.isNaN(ejectX) ? "never" : ejectX.toFixed(3)}`,
  );
  check("first item awarded (POSTCARD)", state.labels.includes("POSTCARD"));
  check("sorting capture lights the loop line", logic.kickerLit("loop"));

  // 10 — loop line (lit): the right outlane dives under the field and
  // resurfaces at the roundhouse turntable
  state.drained = false;
  placeBall(0.494, 0.75);
  let looped = false;
  let outX = NaN;
  let outY = NaN;
  run(6, () => {
    if (ball.layer === -1) looped = true;
    if (looped && ball.layer === 0 && Number.isNaN(outX)) {
      outX = ball.body.getPosition().x;
      outY = ball.body.getPosition().y;
    }
  });
  check(
    "lit loop line saves the outlane ball to the turntable",
    looped && Math.abs(outX - 0.18) < 0.05 && Math.abs(outY - 0.64) < 0.06,
    `resurfaced at (${outX.toFixed(3)}, ${outY.toFixed(3)})`,
  );
  check("loop consumes its light", !logic.kickerLit("loop"));

  // 11 — traps: seams, tip gap, guide creeps, unlit outlanes, and every
  // new pocket this table introduces. Points deterministically at MAIN
  // (the gantry test's odd toggle count left them at BRANCH).
  if (points.blade !== "main") bus.emit("hit", { kind: "target", id: "1" });
  run(0.1);
  for (const [label, x, y] of [
    ["left seam drop", 0.178, 0.915],
    ["right seam drop", 0.342, 0.915],
    ["tip gap drop", 0.26, 0.915],
    ["left guide creep", 0.113, 0.912],
    ["right guide creep", 0.407, 0.912],
    ["left outlane (banker unlit)", 0.026, 0.75],
    ["right outlane (loop unlit)", 0.494, 0.75],
    ["deflector wedge", 0.02, 0.6],
    ["sorting mouth dead drop", 0.24, 0.5],
    // 0.11, not 0.105: the raised lever faces sit at x=0.094 and a ball
    // centre closer than 0.1075 spawns overlapping them (solver ejection)
    ["gantry recess drop", 0.11, 0.47],
    ["incline throat dead drop", 0.355, 0.66],
    ["exchange lane dead drop", 0.094, 0.25],
    ["points mouth dead drop", 0.125, 0.14],
    ["turntable rest", 0.18, 0.64],
    ["siding pocket drop", 0.095, 0.36],
  ] as const) {
    state.drained = false;
    placeBall(x, y);
    run(10);
    const p = ball.body.getPosition();
    check(`${label} does not trap the ball`, state.drained, `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}) layer=${ball.layer}`);
  }

  // 12 — buffer bumper kicks
  placeBall(0.205, 0.185, 0, 0.8);
  let maxSpeed = 0;
  run(0.4, () => {
    const v = ball.body.getLinearVelocity();
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y));
  });
  check(
    "buffer bumper fires and kicks",
    state.hits.some((h) => h === "bumper:1") && maxSpeed > 1.0,
    `maxSpeed=${maxSpeed.toFixed(2)}`,
  );

  // 13 — M-A-I-L lane rollover fires + timetable advances
  placeBall(0.225, 0.07);
  run(1);
  check("A lane rollover fires", state.sensors.includes("rollover:2"));
  for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check(
    "M-A-I-L advances the timetable + lights the banker",
    logic.kickerLit("banker") && rig.scoring.multiplier === 2,
  );

  // 14 — the banker kickback saves a left-outlane ball
  state.drained = false;
  placeBall(0.026, 0.8);
  let bankerFired = false;
  let kickMinY = 1.1;
  run(4, () => {
    if (banker.holding) bankerFired = true;
    if (bankerFired && !banker.holding) kickMinY = Math.min(kickMinY, ball.body.getPosition().y);
  });
  check("lit banker kickback saves the ball", bankerFired && kickMinY < 0.6, `minY=${kickMinY.toFixed(3)}`);
  check("banker consumes its light", !logic.kickerLit("banker"));

  // 14b — a REAL express: right-flipper-strength shot up the left channel
  // rides over the apex cover (past both M-A-I-L window mouths) and exits
  // top-right — the aimed signature shot must survive the lane windows.
  // Pin the points at MAIN first: physical target grazes in earlier tests
  // throw them, and a BRANCH express diverting is the table working.
  if (points.blade !== "main") bus.emit("hit", { kind: "target", id: "1" });
  run(0.1);
  state.labels.length = 0;
  state.sensors.length = 0;
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check(
    "aimed express clears the M-A-I-L windows",
    state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"),
    `sensors=${state.sensors.filter((s) => s.startsWith("ramp")).join(",")}`,
  );
  check("aimed express scores", state.labels.some((l) => l.startsWith("EXPRESS")));

  // 15 — express run pair + DEPARTURE/CONNECTION, synthetically
  placeBall(0.5475, 0.95); // park on the saddle away from all sensors
  run(1.5);
  state.labels.length = 0;
  const syntheticExpress = () => {
    bus.emit("sensor", { kind: "ramp-entry" });
    run(0.1);
    bus.emit("sensor", { kind: "ramp-exit" });
    run(0.1);
  };
  syntheticExpress();
  // 14b's real express may still be inside the combo window → EXPRESS X2
  check("express pair scores", state.labels.some((l) => l.startsWith("EXPRESS")));
  // couple three wagons: bank + a captured siding ball each time
  for (let w = 0; w < 3; w++) {
    bus.emit("bankComplete", {});
    placeBall(0.094, 0.2, 0, 0.4);
    run(4); // capture + hold + eject + fall away
  }
  check("three couplings start DEPARTURE", state.modeEvents.includes("departureStart"));
  check("departure doubles scoring", rig.scoring.eclipseFactor === 2);
  run(0.1);
  check("the turntable spins during departure", rig.discs[0].spin > 0);
  state.labels.length = 0;
  const bladeBefore = points.blade;
  syntheticExpress();
  check("express pays jackpot during departure", state.labels.includes("EXPRESS JACKPOT"));
  run(0.1);
  check("jackpot throws the points", points.blade !== bladeBefore);
  run(26);
  check(
    "departure ends after its duration",
    state.modeEvents.includes("departureEnd") && rig.scoring.eclipseFactor === 1,
  );
  // wizard: TERMINUS (4 more M-A-I-L sets) + a snag + the departure above
  for (let round = 0; round < 4; round++)
    for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check("timetable reaches TERMINUS (multiplier capped ×6)", rig.scoring.multiplier === 6);
  for (let i = 0; i < 8; i++) bus.emit("spinnerTick", {});
  placeBall(0.094, 0.2, 0, 1.0);
  run(4); // snag + fling + fall away
  check("connection lights after terminus + departure + snag", state.modeEvents.includes("connectionReady"));
  state.drained = false;
  placeBall(0.272, 0.56, 0, -1.1);
  run(2);
  check("the sorting office starts THE CONNECTION", state.modeEvents.includes("connectionStart"));
  check("connection doubles scoring", rig.scoring.eclipseFactor === 2);
  run(31);
  check(
    "connection ends after its duration",
    state.modeEvents.includes("connectionEnd") && rig.scoring.eclipseFactor === 1,
  );

  // 16 — SIGNAL BOX: the strongbox lights it; the next scoop capture holds
  // the ball for the mode's whole duration (extended hold), then releases
  logic.resetGame();
  rig.scoring.reset();
  for (let i = 0; i < 3; i++) {
    placeBall(0.272, 0.56, 0, -1.1);
    run(4); // capture + award + eject (postcard, letters, parcel)
  }
  state.labels.length = 0;
  placeBall(0.272, 0.56, 0, -1.1);
  run(4);
  check("fourth capture awards the STRONGBOX", state.labels.includes("STRONGBOX"));
  placeBall(0.272, 0.56, 0, -1.1);
  run(4); // capture; signal box holds past the 2s holdS
  check("SIGNAL BOX holds the ball past holdS", sorting.holding);
  run(9);
  check("SIGNAL BOX releases on its timer", !sorting.holding);
  // THE SIGNAL skill shot (differentiation pass): soft plunge holds at the
  // signal — pays and spots a timetable letter; a full plunge does not
  {
    const rigS = buildRig("nightmail");
    rigS.flippers[0].update(false, rigS.t);
    rigS.flippers[1].update(false, rigS.t);
    rigS.run(2);
    let sawSignal = false;
    rigS.bus.on("score", ({ label }) => {
      if (label === "THE SIGNAL") sawSignal = true;
    });
    rigS.ball.body.setLinearVelocity(new Vec2(0, -1.2));
    rigS.run(3);
    check(
      "soft plunge pays THE SIGNAL and spots a letter",
      sawSignal && (rigS.logic as NightMailLogic).laneLit("1") > 0,
      `total=${rigS.scoring.total}`,
    );
    const rigF = buildRig("nightmail");
    rigF.flippers[0].update(false, rigF.t);
    rigF.flippers[1].update(false, rigF.t);
    rigF.run(2);
    let sawFull = false;
    rigF.bus.on("score", ({ label }) => {
      if (label === "THE SIGNAL") sawFull = true;
    });
    rigF.ball.body.setLinearVelocity(new Vec2(0, -rigF.t.plungerMaxSpeed));
    rigF.run(3);
    check("full plunge does not qualify (nightmail)", !sawFull);
  }
}

// ═══════════════════════════ SMALL HOURS ═══════════════════════════
function smallhoursSuite(): void {
  console.log("\n── smallhours ──");
  const rig = buildRig("smallhours");
  const { g, t, bus, ball, state, run, placeBall, wallR } = rig;
  const logic = rig.logic as SmallHoursLogic;
  const phone = rig.kickers.find((k) => k.def.id === "phone")!;
  const generator = rig.kickers.find((k) => k.def.id === "generator")!;
  const switchboard = rig.kickers.find((k) => k.def.id === "switchboard")!;
  rig.flippers[0].update(false, t);
  rig.flippers[1].update(false, t);

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

  // 2 — full-power launch completes the City Sweep into the left lane,
  // ripping the Dial spinner on the way
  ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
  let minY = g.table.height;
  let minX = g.table.width;
  run(3, () => {
    const p = ball.body.getPosition();
    minY = Math.min(minY, p.y);
    minX = Math.min(minX, p.x);
  });
  check("launch reaches top of table", minY < 0.3, `minY=${minY.toFixed(3)}`);
  check("launch completes the Sweep into the left lane", minX < 0.07, `minX=${minX.toFixed(3)}`);
  check("the Dial spins on the launch", state.spins > 0, `ticks=${state.spins}`);

  // 3 — drain fires through the centre gap
  placeBall(0.26, 1.0);
  run(0.5);
  check("drain sensor fires", state.drained);

  // 4 — fader bank: three cross-shots from the left drop the bank; CALLER lights
  state.bankDone = false;
  for (const tgt of g.dropTargets.targets) {
    placeBall(0.42, tgt.y, 1.5, 0);
    run(0.5);
  }
  check("fader bank drops + bonus", state.bankDone && rig.bank.targets.every((x) => !x.up));
  check("faders up light CALLER at the switchboard", logic.kickerLit("switchboard"));
  run(1.5);
  check("faders reset after delay", rig.bank.targets.every((x) => x.up));

  // 5 — a lit switchboard arrival puts a caller on hold (sensor-only zone)
  state.labels.length = 0;
  placeBall(0.132, 0.3, 0, 0.3);
  let held = false;
  run(3, () => {
    if (switchboard.holding) held = true;
  });
  check("lit switchboard holds a caller", held, `held=${held}`);
  check("the capture consumes CALLER", !logic.kickerLit("switchboard"));

  // 6 — traps: seams, tip gap, guide creeps, unlit outlanes, and every
  // pocket this table introduces
  for (const [label, x, y] of [
    ["left seam drop", 0.178, 0.915],
    ["right seam drop", 0.342, 0.915],
    ["tip gap drop", 0.26, 0.915],
    ["left guide creep", 0.113, 0.912],
    ["right guide creep", 0.407, 0.912],
    ["left outlane (generator unlit)", 0.026, 0.75],
    ["right outlane (side door unlit)", 0.494, 0.75],
    ["deflector wedge", 0.02, 0.6],
    ["phone mouth dead drop", 0.268, 0.53],
    ["fader recess drop", 0.475, 0.47],
    ["aerial throat dead drop", 0.168, 0.66],
    ["switchboard zone rest (unlit)", 0.132, 0.37],
    ["deck rest", 0.32, 0.64],
    ["mast landing zone dead drop", 0.117, 0.1],
  ] as const) {
    state.drained = false;
    placeBall(x, y);
    run(10);
    const p = ball.body.getPosition();
    check(`${label} does not trap the ball`, state.drained, `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}) layer=${ball.layer}`);
  }

  // 7 — rooftop aerial bumper kicks
  placeBall(0.28, 0.18, 0, 0.8);
  let maxSpeed = 0;
  run(0.4, () => {
    const v = ball.body.getLinearVelocity();
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y));
  });
  check(
    "aerial bumper fires and kicks",
    state.hits.some((h) => h === "bumper:1") && maxSpeed > 1.0,
    `maxSpeed=${maxSpeed.toFixed(2)}`,
  );

  // 8 — W-A-V-E lane rollover fires + the clock advances
  placeBall(0.225, 0.07);
  run(1);
  check("A lane rollover fires", state.sensors.includes("rollover:2"));
  for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check(
    "W-A-V-E advances the clock + lights the generator",
    logic.kickerLit("generator") && rig.scoring.multiplier === 2,
  );

  // 9 — the generator kickback saves a left-outlane ball
  state.drained = false;
  placeBall(0.026, 0.8);
  let genFired = false;
  let kickMinY = 1.1;
  run(4, () => {
    if (generator.holding) genFired = true;
    if (genFired && !generator.holding) kickMinY = Math.min(kickMinY, ball.body.getPosition().y);
  });
  check("lit generator kickback saves the ball", genFired && kickMinY < 0.6, `minY=${kickMinY.toFixed(3)}`);
  check("generator consumes its light", !logic.kickerLit("generator"));

  // 10 — the aerial run: a straight-up left-flipper shot boards the
  // surface, climbs, releases airborne at the mast and pays AERIAL RUN
  state.labels.length = 0;
  state.drained = false;
  placeBall(0.168, 0.75, 0, -2.2);
  let onRun = false;
  let maxZ = 0;
  run(8, () => {
    if (ball.layer === 1) onRun = true;
    maxZ = Math.max(maxZ, ball.height.z);
  });
  check("aerial shot boards the run", onRun);
  check("the climb really climbs", maxZ > 0.028, `maxZ=${(maxZ * 1000).toFixed(0)}mm`);
  check("mast drop-off pays AERIAL RUN", state.labels.includes("AERIAL RUN"));
  check("release returns to ground", ball.layer === 0, `layer=${ball.layer} z=${ball.height.z.toFixed(3)}`);

  // 10b — a weak shot stalls on the climb and rolls back out of the mouth
  state.labels.length = 0;
  placeBall(0.168, 0.75, 0, -1.0);
  run(4);
  check(
    "failed climb rolls back to the field",
    ball.layer === 0 && !state.labels.includes("AERIAL RUN"),
    `layer=${ball.layer}`,
  );

  // 10c — a ball dropping in behind the run deflects off its solid back
  placeBall(0.15, 0.42, 0, 0.9);
  let throatBreach = false;
  run(10, () => {
    const p = ball.body.getPosition();
    if (ball.layer === 0 && p.x > 0.14 && p.x < 0.19 && p.y > 0.52 && p.y < 0.62)
      throatBreach = true;
  });
  check("run back deflects a ball falling in behind it", !throatBreach);

  // 11 — the City Sweep scores (left-lane shot up around the arch)
  state.labels.length = 0;
  placeBall(0.0325, 0.53, 0, -2.3);
  run(3);
  check("Sweep entry+exit both fire", state.sensors.includes("ramp-entry") && state.sensors.includes("ramp-exit"));
  check("City Sweep scores", state.labels.includes("CITY SWEEP"), `score=${rig.scoring.total}`);

  // 12 — the phone: capture, request award, side door lights, eject left
  rig.scoring.reset();
  logic.resetGame();
  state.labels.length = 0;
  state.drained = false;
  placeBall(0.3, 0.59, 0, -1.1);
  let phoneCaught = false;
  run(1, () => {
    if (phone.holding) phoneCaught = true;
  });
  check("the phone captures the shot", phoneCaught && state.sensors.includes("kicker:phone"));
  let ejectX = NaN;
  run(4, () => {
    const p = ball.body.getPosition();
    if (Number.isNaN(ejectX) && !phone.holding && p.y >= 0.95) ejectX = p.x;
  });
  check(
    "phone kickout feeds the left flipper",
    !phone.holding && ejectX > 0.05 && ejectX < 0.27,
    `crossed y=0.95 at x=${Number.isNaN(ejectX) ? "never" : ejectX.toFixed(3)}`,
  );
  check("first request awarded (REQUEST)", state.labels.includes("REQUEST"));
  check("phone capture lights the side door", logic.kickerLit("sidedoor"));

  // 13 — the side door (lit): the right outlane dives down the back
  // stairs and resurfaces in the LEFT INLANE — and is not a drain
  state.drained = false;
  placeBall(0.494, 0.75);
  let rode = false;
  let outX = NaN;
  let outY = NaN;
  run(6, () => {
    if (ball.layer === -1) rode = true;
    if (rode && ball.layer === 0 && Number.isNaN(outX)) {
      outX = ball.body.getPosition().x;
      outY = ball.body.getPosition().y;
    }
  });
  check(
    "lit side door returns the ball to the left inlane",
    rode && state.sensors.includes("subway:sidedoor") && outX < 0.12 && outY > 0.65 && outY < 0.78,
    `resurfaced at (${outX.toFixed(3)}, ${outY.toFixed(3)})`,
  );
  check("the ride back is not a drain", !state.drained || ball.body.getPosition().y > 0.9);
  check("side door consumes its light", !logic.kickerLit("sidedoor"));

  // 14 — the dial: spins tune the transmitter; a tuned ride pays the boost
  logic.resetGame();
  rig.scoring.reset();
  state.labels.length = 0;
  placeBall(0.5475, 0.95); // park on the saddle away from all sensors
  run(1.5);
  for (let i = 0; i < 10; i++) bus.emit("spinnerTick", {});
  run(0.1);
  check("ten spins tune the transmitter (deck drifts)", logic.discSpin() === 2.5);
  const syntheticRide = () => {
    bus.emit("surface", { from: "field", to: "aerial", x: 0.168, y: 0.7, z: 0 });
    run(0.1);
    bus.emit("surface", { from: "aerial", to: "air", x: 0.11, y: 0.12, z: 0.034 });
    run(0.1);
  };
  syntheticRide();
  check("the tuned ride pays SIGNAL BOOST", state.labels.includes("SIGNAL BOOST"));
  check("the boost consumes the light (deck parks)", logic.discSpin() === 0);

  // 15 — the ruleset, synthetically: clock to DAWN, ON AIR, jackpots +
  // the perfect segue, then THE DAWN CHORUS
  state.modeEvents.length = 0;
  // five sets from the fresh game: 1 AM → 5 AM (dawn)
  for (let round = 0; round < 5; round++)
    for (const id of ["1", "2", "3", "4"]) bus.emit("sensor", { kind: "rollover", id });
  check("clock reaches 5 AM (multiplier capped ×6)", rig.scoring.multiplier === 6);
  check("hour lamps track the clock", logic.lamp("h5") === 1 && logic.lamp("h1") === 1);
  // three callers: bank + a captured switchboard ball each time
  for (let c = 0; c < 3; c++) {
    bus.emit("bankComplete", {});
    placeBall(0.132, 0.3, 0, 0.3);
    run(4); // capture + hold + eject + fall away
  }
  check("three callers start ON AIR", state.modeEvents.includes("onairStart"));
  check("ON AIR doubles scoring", rig.scoring.eclipseFactor === 2);
  run(0.1);
  check("the deck spins during ON AIR", rig.discs[0].spin > 0);
  state.labels.length = 0;
  const syntheticSweep = () => {
    bus.emit("sensor", { kind: "ramp-entry" });
    run(0.1);
    bus.emit("sensor", { kind: "ramp-exit" });
    run(0.1);
  };
  syntheticSweep();
  check("the Sweep pays jackpot during ON AIR", state.labels.includes("SWEEP JACKPOT"));
  syntheticRide(); // the other shot inside the segue window
  check(
    "the other shot inside the window pays the PERFECT SEGUE",
    state.labels.includes("AERIAL JACKPOT") && state.labels.includes("PERFECT SEGUE"),
  );
  run(26);
  check(
    "ON AIR ends after its duration",
    state.modeEvents.includes("onairEnd") && rig.scoring.eclipseFactor === 1,
  );
  check("chorus lights after dawn + on air + boost", state.modeEvents.includes("chorusReady"));
  state.drained = false;
  placeBall(0.3, 0.59, 0, -1.1);
  run(2);
  check("the phone starts THE DAWN CHORUS", state.modeEvents.includes("chorusStart"));
  check("the chorus doubles scoring", rig.scoring.eclipseFactor === 2);
  run(31);
  check(
    "the chorus ends after its duration",
    state.modeEvents.includes("chorusEnd") && rig.scoring.eclipseFactor === 1,
  );

  // 16 — REQUEST SHOW: the B-SIDE lights it; the next phone capture holds
  // the ball for the mode's whole duration (extended hold), then releases
  logic.resetGame();
  rig.scoring.reset();
  for (let i = 0; i < 3; i++) {
    placeBall(0.3, 0.59, 0, -1.1);
    run(4); // capture + award + eject (request, shout-out, dedication)
  }
  state.labels.length = 0;
  placeBall(0.3, 0.59, 0, -1.1);
  run(4);
  check("fourth capture awards the MYSTERY B-SIDE", state.labels.includes("MYSTERY B-SIDE"));
  placeBall(0.3, 0.59, 0, -1.1);
  run(4); // capture; the request show holds past the 2s holdS
  check("REQUEST SHOW holds the ball past holdS", phone.holding);
  run(9);
  check("REQUEST SHOW releases on its timer", !phone.holding);

  // 17 — DEAD AIR: armed by scoring, the idle clock drains listeners
  logic.resetGame();
  rig.scoring.reset();
  placeBall(0.5475, 0.95); // park on the saddle, out of harm's way
  run(1.5);
  bus.emit("sensor", { kind: "kicker", id: "phone" }); // no capture (ball in lane): no score
  rig.scoring.award(1000, "TEST"); // arm the clock
  rig.scoring.bonusUnits = 400;
  run(21); // warnS 14 + drainS 6, plus slack
  check(
    "dead air drains listeners after the idle window",
    rig.scoring.bonusUnits < 400,
    `units=${rig.scoring.bonusUnits}`,
  );
  // differentiation pass: TUNED slings + NIGHT OWLS skill shot
  {
    const rigT = buildRig("smallhours");
    const logicT = rigT.logic as SmallHoursLogic;
    check("slings run stock while untuned", logicT.slingBoost() === 1);
    for (let i = 0; i < 12; i++) rigT.bus.emit("spinnerTick", {});
    check(
      "TUNED raises the sling boost",
      logicT.slingBoost() === 1.15,
      `boost=${logicT.slingBoost()}`,
    );
    const rigS = buildRig("smallhours");
    rigS.flippers[0].update(false, rigS.t);
    rigS.flippers[1].update(false, rigS.t);
    rigS.run(2);
    let sawOwls = false;
    rigS.bus.on("score", ({ label }) => {
      if (label === "NIGHT OWLS") sawOwls = true;
    });
    rigS.ball.body.setLinearVelocity(new Vec2(0, -1.2));
    rigS.run(3);
    check("soft plunge pays NIGHT OWLS", sawOwls, `total=${rigS.scoring.total}`);
  }
}

const which = process.argv[2] as TableId | undefined;

// ═══════════════════════════ THE SUMP ═══════════════════════════
function sumpSuite(): void {
  console.log("\n── sump ──");
  const rig = buildRig("sump");
  const { g, t, bus, ball, state, run, placeBall, wallR } = rig;
  rig.flippers.forEach((f) => f.update(false, t));

  // 1 — settles on the plunger saddle (deep envelope, same lane geometry)
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

  // 2 — full-power launch rides the orbit into the left lane
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

  // 3 — gate SHUT (default): a centre drain sheds right and reaches the
  // true drain at the bottom of the deep envelope
  state.drained = false;
  placeBall(0.26, 1.0);
  run(4);
  check("gate shut: centre drain reaches the true drain", state.drained);

  // 4 — gate OPEN: the same drop descends into the chamber and starts
  // SUMP PLAY instead
  state.drained = false;
  state.modeEvents.length = 0;
  rig.bus.emit("bankComplete", {}); // SLUICE lights the gate
  run(0.3); // let the blade swap
  placeBall(0.26, 1.0);
  run(4);
  const inChamberP = ball.body.getPosition();
  check(
    "gate open: the descent starts SUMP PLAY",
    state.modeEvents.includes("sumpPlayStart"),
    `rest=(${inChamberP.x.toFixed(3)}, ${inChamberP.y.toFixed(3)})`,
  );

  // 5 — the mini pair flips a chamber ball up to the valve manifold
  {
    let sawValve = false;
    bus.on("score", ({ label }) => {
      if (label.startsWith("VALVE")) sawValve = true;
    });
    // rest the ball on the mini-right flipper, then flip
    placeBall(0.32, 1.13);
    run(1.5);
    rig.flippers.forEach((f) => f.update(false, t));
    run(0.8, () => {
      const mr = rig.flippers[3]; // mini pair appended after the mains
      mr.update(false, t);
      rig.flippers[3 + 1]?.update(true, t);
    });
    run(2);
    check("mini flipper reaches the valve manifold", sawValve);
  }

  // 6 — three valve hits light the return; the subway rides home to the
  // left inlane and pays the outflow
  {
    const rig2 = buildRig("sump");
    rig2.flippers.forEach((f) => f.update(false, rig2.t));
    const logic2 = rig2.logic as SumpLogic;
    rig2.bus.emit("bankComplete", {});
    rig2.run(0.3);
    rig2.placeBall(0.26, 1.0);
    rig2.run(3.5); // descend into sump play
    for (let i = 0; i < 3; i++)
      rig2.bus.emit("sensor", { kind: "target", id: "valves" });
    check("three valves light the return pipe", logic2.kickerLit("return"));
    let sawOutflow = false;
    let sumpPlays = 0;
    rig2.bus.on("score", ({ label }) => {
      if (label === "OUTFLOW") sawOutflow = true;
      if (label === "SUMP PLAY") sumpPlays++;
    });
    rig2.placeBall(0.19, 1.128, -0.5, -0.05); // roll INTO the return mouth
    let rideMinY = 2;
    rig2.run(6, () => {
      rideMinY = Math.min(rideMinY, rig2.ball.body.getPosition().y);
    });
    check(
      "the return pipe rides home and pays OUTFLOW",
      sawOutflow && rideMinY < 0.9,
      `carried up to y=${rideMinY.toFixed(3)}`,
    );
    // the relit gate is proved by the SECOND descent the loose ball takes
    check("the ride re-lights the floodgate", sumpPlays >= 1);
  }

  // 7 — traps: the new bottom geometry
  for (const [label, x, y] of [
    ["throat left seam", 0.19, 1.0],
    ["throat right seam", 0.33, 1.0],
    ["shed-left ridge", 0.16, 1.035],
    ["shed-right ridge", 0.36, 1.04],
    ["left void drop", 0.06, 0.98],
    ["right void drop", 0.45, 0.98],
    ["chamber mouth drop", 0.19, 1.083],
    ["gate-shut landing shelf", 0.3, 1.06],
  ] as const) {
    const rigT = buildRig("sump");
    rigT.flippers.forEach((f) => f.update(false, rigT.t));
    // mouth points are only reachable while the gate is open (the shut
    // blade overhangs the deflector) — open it for every drop
    rigT.bus.emit("bankComplete", {});
    rigT.run(0.3);
    rigT.placeBall(x, y);
    rigT.run(5);
    const p = rigT.ball.body.getPosition();
    check(
      `${label} does not trap the ball`,
      rigT.state.drained,
      `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }

  // 8 — chamber drops drain clean through the mini tip gap (gate shut
  // afterwards: chamber gap is a REAL drain)
  {
    const rigC = buildRig("sump");
    rigC.flippers.forEach((f) => f.update(false, rigC.t));
    rigC.placeBall(0.26, 1.12);
    rigC.run(4);
    check("chamber tip-gap drop drains", rigC.state.drained);
  }

  // 9 — water level: four lanes raise the level and the multiplier
  {
    const rigW = buildRig("sump");
    const logicW = rigW.logic as SumpLogic;
    for (const id of ["1", "2", "3", "4"]) logicW.onRollover(id);
    check("S-U-M-P raises the water level", rigW.scoring.multiplier === 2, `x${rigW.scoring.multiplier}`);
    check("level lights THE GRATE", logicW.kickerLit("grate"));
  }

  // 10 — skill shot: soft plunge pays THE READING
  {
    const rigS = buildRig("sump");
    rigS.flippers.forEach((f) => f.update(false, rigS.t));
    rigS.run(2);
    let sawReading = false;
    rigS.bus.on("score", ({ label }) => {
      if (label === "THE READING") sawReading = true;
    });
    rigS.ball.body.setLinearVelocity(new Vec2(0, -1.2));
    rigS.run(3);
    check("soft plunge pays THE READING", sawReading);
  }
}


// ═══════════════════════════ GLASSHOUSE ═══════════════════════════
function glasshouseSuite(): void {
  console.log("\n── glasshouse ──");
  const rig = buildRig("glasshouse");
  const { g, t, ball, state, run, placeBall, wallR } = rig;
  rig.flippers.forEach((f) => f.update(false, t));

  // 1 — settles on the LEFT saddle (M14: the lineup's first left plunger)
  run(2);
  {
    const p = ball.body.getPosition();
    const restY = g.plunger.saddleY - wallR - 0.0135;
    check(
      "ball settles ON the left-lane saddle",
      Math.abs(p.y - restY) < 0.004 && p.x < g.table.laneWallX,
      `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }

  // 2 — full-power launch rides the mirrored arch into the RIGHT lane
  ball.body.setLinearVelocity(new Vec2(0, -t.plungerMaxSpeed));
  let minY = g.table.height;
  let maxX = 0;
  run(3, () => {
    const p = ball.body.getPosition();
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
  });
  check("launch reaches the crown", minY < 0.3, `minY=${minY.toFixed(3)}`);
  check("launch completes the Gallery into the right lane", maxX > 0.59, `maxX=${maxX.toFixed(3)}`);

  // 3 — centre gap drains
  state.drained = false;
  placeBall(0.3575, 0.99);
  run(1.5);
  check("drain sensor fires", state.drained);

  // 4 — the Orchid captures a left-flipper shot and returns to the RIGHT bat
  {
    const orchid = rig.kickers.find((k) => k.def.id === "orchid")!;
    placeBall(0.47, 0.65, 0.25, -1.2);
    let caught = false;
    run(1.2, () => {
      if (orchid.holding) caught = true;
    });
    check("the orchid captures the shot", caught);
    let ejectX = NaN;
    run(4, () => {
      const p = ball.body.getPosition();
      if (Number.isNaN(ejectX) && !orchid.holding && p.y >= 0.95) ejectX = p.x;
    });
    check(
      "orchid kickout feeds the right bat",
      !orchid.holding && ejectX > 0.36 && ejectX < 0.51,
      `crossed y=0.95 at x=${Number.isNaN(ejectX) ? "never" : ejectX.toFixed(3)}`,
    );
  }

  // 5 — POLLEN COUNT: all four return lanes step the multiplier + mister
  {
    const rigP = buildRig("glasshouse");
    const logicP = rigP.logic as GlasshouseLogic;
    for (const id of ["pol1", "pol2", "pol3", "pol4"])
      rigP.bus.emit("sensor", { kind: "lane", id });
    check("POLLEN COUNT steps the multiplier", rigP.scoring.multiplier === 2, `x${rigP.scoring.multiplier}`);
    check("pollen lights THE MISTER", logicP.kickerLit("mister"));
  }

  // 6 — the vine run: an aimed west-mouth entry rides east and pays
  {
    const rigV = buildRig("glasshouse");
    rigV.flippers.forEach((f) => f.update(false, rigV.t));
    let sawCanopy = false;
    rigV.bus.on("score", ({ label }) => {
      if (label === "CANOPY" || label === "CROSS-POLLINATION") sawCanopy = true;
    });
    // fire into the mouth from the lower right (the right-flipper diagonal)
    rigV.placeBall(0.185, 0.75, -0.2, -1.9); // into the mouth END (attach needs local h ~ 0)
    let maxZ = 0;
    rigV.run(6, () => (maxZ = Math.max(maxZ, rigV.ball.height.z)));
    check("the vine run rides west to east", sawCanopy, `maxZ=${(maxZ * 1000).toFixed(0)}mm`);
  }

  // 7 — traps: the widebody's new bottom + vine mouth
  for (const [label, x, y] of [
    ["left splitter top", 0.141, 0.68],
    ["right splitter top", 0.58, 0.68],
    ["outer-left return slot", 0.115, 0.72],
    ["outer-right return slot", 0.6, 0.72],
    ["bloom housing left cap", 0.29, 0.505],
    ["bloom housing right cap", 0.46, 0.505],
    ["vine mouth seam", 0.175, 0.68],
    ["vine back drop", 0.225, 0.56],

    ["left outlane", 0.075, 0.72],
    ["right outlane", 0.64, 0.72],
  ] as const) {
    const rigT = buildRig("glasshouse");
    rigT.flippers.forEach((f) => f.update(false, rigT.t));
    rigT.placeBall(x, y);
    rigT.run(5);
    const p = rigT.ball.body.getPosition();
    const onSaddle = p.x < rigT.g.table.laneWallX && p.y > 0.95;
    check(
      `${label} does not trap the ball`,
      rigT.state.drained || onSaddle,
      `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }

  // 7b — a dying launch must never stall on the crown: at every marginal
  // launch speed the ball ends up OUT of the crown box within 6 s
  for (const v of [1.5, 1.7, 1.9]) {
    const rigC = buildRig("glasshouse");
    rigC.flippers.forEach((f) => f.update(false, rigC.t));
    rigC.run(2);
    rigC.ball.body.setLinearVelocity(new Vec2(0, -v));
    rigC.run(6);
    const p = rigC.ball.body.getPosition();
    check(
      `marginal launch v=${v} does not stall on the crown`,
      p.y > 0.12,
      `rest=(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
    );
  }

  // 8 — NIGHT SHIFT skill shot (left lane; the probe numbers mirror)
  {
    const rigS = buildRig("glasshouse");
    rigS.flippers.forEach((f) => f.update(false, rigS.t));
    rigS.run(2);
    let sawShift = false;
    rigS.bus.on("score", ({ label }) => {
      if (label === "NIGHT SHIFT") sawShift = true;
    });
    rigS.ball.body.setLinearVelocity(new Vec2(0, -1.2));
    rigS.run(3);
    check("soft plunge pays NIGHT SHIFT", sawShift);
  }

  // 9 — the wandering lamp rotates on its clock
  {
    const rigL = buildRig("glasshouse");
    const logicL = rigL.logic as GlasshouseLogic;
    const before = ["lampA", "lampB", "lampC"].map((l) => logicL.lamp(l)).join(",");
    rigL.run(10);
    const after = ["lampA", "lampB", "lampC"].map((l) => logicL.lamp(l)).join(",");
    check("the lit lamp wanders", before !== after, `${before} -> ${after}`);
  }
}

if (!which || which === "moondial") moondialSuite();
if (!which || which === "tidebreaker") tidebreakerSuite();
if (!which || which === "midway") midwaySuite();
if (!which || which === "nightmail") nightmailSuite();
if (!which || which === "smallhours") smallhoursSuite();
if (!which || which === "sump") sumpSuite();
if (!which || which === "glasshouse") glasshouseSuite();

console.log(failures === 0 ? "\nsimcheck: all checks passed" : `\nsimcheck: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
