/**
 * Randomized play soak (`npm run soak [seed] [table]`, table defaults to
 * every table): launch the ball, flap the flippers with random hold/release
 * patterns for 10 simulated minutes, and flag any spot where the ball sits
 * nearly motionless — a genuine geometry trap. Cradles don't count: flippers
 * toggle within 1.5 s, well inside the 2.5 s stuck window. Kicker holds
 * (max 2.0 s) and subway transits (moving) stay under it too.
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
import { Diverter } from "../src/entities/Diverter";
import { Lift } from "../src/entities/Lift";
import { Magnet } from "../src/entities/Magnet";
import { Disc } from "../src/entities/Disc";
import { Scoring } from "../src/game/Scoring";
import { contactApplies, sensorApplies } from "../src/table/Surfaces";
import { TABLE_SPECS, TABLE_ORDER, type TableId } from "../src/table/specs";
import { DEFAULT_TUNING } from "../src/tuning";

const SIM_SECONDS = 600;
const STUCK_WINDOW = 2.5; // s of near-zero speed with flippers at rest

const seedArg = Number(process.argv[2] ?? 1);
const tables: TableId[] = process.argv[3] ? [process.argv[3] as TableId] : [...TABLE_ORDER];

let anyStuck = 0;

for (const tableId of tables) {
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
    readFileSync(new URL(`../design/tables/${tableId}/playfield.svg`, import.meta.url), "utf8"),
    g,
  );
  const ball = new Ball(pw.world, t, g.table.spawn, table.surfaces);
  pw.setZGate((tag, x, y) => contactApplies(tag, table.surfaces, x, y, ball.height.z));
  // M11: support changes feed logic + resense touching banded sensors
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
  // real table logic drives lit-state (hatch/gutter light up and consume
  // exactly as in the game, so the soak exercises both outlane behaviours)
  // stand-in ball-saver window: live for 8 s after each (re)launch, so
  // saver-gated geometry (Moondial's gnomon) gets soak coverage in both states
  let lastLaunch = -Infinity;
  let simNow = 0;
  const logic = spec.createLogic({
    bus,
    scoring,
    sfx: () => {},
    saverActive: () => simNow - lastLaunch < 8,
    shake: () => {},
    push: () => {},
    baked: () => undefined,
    holdScoop: (id, open) => {
      const k = kickers.find((k) => k.def.id === id);
      if (open) k?.beginExtendedHold();
      else k?.release();
    },
  });

  // magnet captures notify logic, as in Game (snag awards + light consume)
  for (const m of magnets) m.onCapture = () => logic.onCapture?.(m.def.id);

  let drainFlag = false;
  bus.on("sensor", ({ kind, id, zMin, zMax }) => {
    if (!sensorApplies({ zMin, zMax }, ball.height.z)) return;
    // captive balls are exempt, as in Game: saving subways cross the drain zone
    if (
      kind === "drain" &&
      !kickers.some((k) => k.holding) &&
      !subways.some((s) => s.active) &&
      !lifts.some((l) => l.active) &&
      !magnets.some((m) => m.holding)
    )
      drainFlag = true;
    if (kind === "spinner") spinner.trip(ball.body.getLinearVelocity().y);
    if (kind === "kicker" && id) {
      const k = kickers.find((k) => k.def.id === id);
      if (k && logic.kickerLit(id) && k.capture(ball)) logic.onCapture?.(id);
    }
    if (kind === "subway" && id) {
      const s = subways.find((s) => s.def.id === id);
      if (s && logic.kickerLit(id) && s.capture(ball)) logic.onCapture?.(id);
    }
    if (kind === "lift" && id) {
      const l = lifts.find((l) => l.def.id === id);
      if (l && logic.kickerLit(id) && l.capture(ball)) logic.onCapture?.(id);
    }
    if (kind === "rollover" && id) logic.onRollover(id);
    if (kind === "skill" && id) {
      const sv = ball.body.getLinearVelocity();
      logic.onSkillShot?.(id, Math.hypot(sv.x, sv.y));
    }
  });
  bus.on("hit", ({ kind, id }) => {
    if (kind === "bumper") bumpers.find((b) => b.def.id === id)?.kick(ball, pw, t.bumperKick);
    if (kind === "sling")
      slings.find((s) => s.def.id === id)?.kick(ball, pw, t.slingKick * (logic.slingBoost?.() ?? 1));
    if (kind === "target") bank.onHit(id);
  });

  const pressed = flippers.map(() => false);
  const nextToggle = flippers.map(() => 0);
  let stillTime = 0;
  let drains = 0;
  let launches = 0;
  const stuck: { x: number; y: number; time: number; kind: string }[] = [];

  const resetBall = () => {
    for (const k of kickers) k.cancel();
    for (const s of subways) s.cancel();
    for (const l of lifts) l.cancel();
    for (const m of magnets) m.cancel();
    ball.reset();
  };

  // Kinetic-loop detector: sample the ball every 0.5 s; if the last 20 s of
  // samples all fit in a 0.2 m box in the upper field (y < 0.8 — flippers
  // can't reach there, so confinement means a self-sustaining bounce orbit
  // between kickers), flag it. Catches loops the zero-speed detector can't.
  const LOOP_SAMPLES = 40; // × 0.5 s = 20 s window
  const LOOP_BOX = 0.2;
  const loopBuf: { x: number; y: number }[] = [];

  for (let step = 0, steps = SIM_SECONDS / FIXED_DT; step < steps; step++) {
    const now = step * FIXED_DT;
    simNow = now;

    // random flipper pattern: taps and holds, 0.05–1.5 s per state
    for (let i = 0; i < flippers.length; i++) {
      if (now >= nextToggle[i]) {
        pressed[i] = !pressed[i];
        nextToggle[i] = now + 0.05 + rand() * (pressed[i] ? 1.45 : 1.0);
        // main-flipper press edge drives lane change, as in Game
        if (pressed[i] && i < 2) logic.onFlipper?.(i === 0 ? "left" : "right");
      }
      flippers[i].update(pressed[i], t);
    }

    // relaunch from the lane whenever the ball settles there
    const p = ball.body.getPosition();
    const v = ball.body.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y);
    const inLane = p.x > g.table.laneWallX && p.y > g.table.laneTopY;
    if (inLane && speed < 0.05 && p.y > 0.95) {
      // sample the real plunger range so the soak covers what players can do
      const launch = t.plungerMinSpeed + rand() * (t.plungerMaxSpeed - t.plungerMinSpeed);
      ball.body.setLinearVelocity(new Vec2(0, -launch));
      lastLaunch = now;
      launches++;
    }

    pw.update(
      FIXED_DT,
      () => {
        ball.height.applyForces(ball.body);
        for (const m of magnets) m.applyForces([ball]);
        for (const d of discs) d.applyForces([ball]);
      },
      () => {
        const bp = ball.body.getPosition();
        const bv = ball.body.getLinearVelocity();
        ball.height.step(FIXED_DT, bp.x, bp.y, Math.hypot(bv.x, bv.y));
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


    if (drainFlag) {
      drainFlag = false;
      drains++;
      resetBall();
      stillTime = 0;
      loopBuf.length = 0;
      continue;
    }

    // Out-of-bounds: a ball outside the table envelope ghosted through the
    // shell (mis-layered) — always a bug, and invisible to the stuck/loop
    // detectors (it just falls forever). Flag it and reset.
    if (p.x < -0.03 || p.x > g.table.width + 0.03 || p.y < -0.03 || p.y > g.table.height + 0.03) {
      stuck.push({ x: p.x, y: p.y, time: now, kind: `OOB L${ball.layer}` });
      resetBall();
      stillTime = 0;
      loopBuf.length = 0;
      continue;
    }

    if (step % Math.round(0.5 / FIXED_DT) === 0) {
      if (p.y < 0.8 && p.x < g.table.laneWallX) {
        loopBuf.push({ x: p.x, y: p.y });
        if (loopBuf.length > LOOP_SAMPLES) loopBuf.shift();
        if (loopBuf.length === LOOP_SAMPLES) {
          const xs = loopBuf.map((s) => s.x);
          const ys = loopBuf.map((s) => s.y);
          const w = Math.max(...xs) - Math.min(...xs);
          const h = Math.max(...ys) - Math.min(...ys);
          if (w < LOOP_BOX && h < LOOP_BOX) {
            stuck.push({
              x: (Math.max(...xs) + Math.min(...xs)) / 2,
              y: (Math.max(...ys) + Math.min(...ys)) / 2,
              time: now,
              kind: "LOOP",
            });
            resetBall();
            loopBuf.length = 0;
          }
        }
      } else {
        loopBuf.length = 0;
      }
    }

    // stuck = motionless outside the lane. No flipper-state condition: the
    // random pattern toggles each flipper within 1.5 s, so a ball motionless
    // for the whole window cannot be resting on a flipper. Scripted holds
    // (magnet, a lift's dwell, a kicker's extended video-mode hold) are
    // legitimate stillness — exempt, like the drain guard; their own
    // cooldown/eject logic guarantees release.
    const scriptedHold =
      magnets.some((m) => m.holding) ||
      lifts.some((l) => l.active) ||
      kickers.some((k) => k.holding);
    if (!inLane && speed < 0.015 && !scriptedHold) {
      stillTime += FIXED_DT;
      if (stillTime >= STUCK_WINDOW) {
        stuck.push({ x: p.x, y: p.y, time: now, kind: `STUCK L${ball.layer}` });
        resetBall();
        stillTime = 0;
      }
    } else {
      stillTime = 0;
    }
  }

  console.log(
    `${tableId} seed=${seedArg}: ${SIM_SECONDS}s sim, ${launches} launches, ${drains} drains, ${stuck.length} stuck`,
  );
  for (const s of stuck) {
    console.log(`  ${s.kind} at (${s.x.toFixed(4)}, ${s.y.toFixed(4)}) t=${s.time.toFixed(1)}s`);
  }
  anyStuck += stuck.length;
}

process.exit(anyStuck ? 1 : 0);
