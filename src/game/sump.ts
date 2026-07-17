import type { TableLogic, TableLogicCtx } from "./TableLogic";
import { BakedDmdScene, MessageScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/sump/rules.json";

/** Entry→exit (either direction) within this window counts as an Outflow. */
const OUTFLOW_PAIR_WINDOW = 3.5;

const LANE_IDS = ["1", "2", "3", "4"] as const;

/**
 * The Sump ruleset (M13; design truth in the table's BRIEF.md), values from
 * the table's rules JSON:
 *
 * - THE OUTFLOW: full orbit loops; consecutive loops inside
 *   outflowCombo.windowS escalate ×2 per step (capped at maxStep).
 * - WATER LEVEL: completing the S-U-M-P lanes raises the level (1..5); the
 *   bonus multiplier tracks it, each completion lights THE GRATE kickback.
 *   Letters persist across balls; lane change on the flippers.
 * - THE FLOODGATE: a SLUICE completion lights the gate. While lit, the
 *   diverter routes a centre drain INTO the sump chamber — SUMP PLAY
 *   begins instead of a ball loss (the structural thesis of the table).
 * - SUMP PLAY: chamber scoring runs at ×waterLevel; sumpPlay.valveHits on
 *   the manifold light the RETURN PIPE; riding it pays the outflow ladder
 *   and returns the ball to the left inlane. After pumpS the pumps spool
 *   (warning); at floodS the return lights FREE — the escape is offered,
 *   never forced (the chamber gap stays a real drain).
 * - PUMP HOUSE: scoop ladder (wrapping); the top rung spots a valve in the
 *   next sump play.
 * - HIGH WATER (wizard): level 5 + two outflow rides + the ladder top
 *   light the Pump House; the mode locks the gate open and doubles scores.
 * - THE READING: skill shot — soft plunge pays and spots a lane.
 * - Combos, sump play and a running High Water die with the ball; the
 *   level, letters, ladder and lit gate/grate persist across balls.
 */
export class SumpLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private outflowStep = 0;
  private lastOutflowAt = -Infinity;
  private litLanes = new Set<string>();
  private stage = 0; // water level, 0..stages.length
  private gateLit = false;
  private grateLit = false;
  private skillUsed = false;
  // sump play
  private inChamber = false;
  private chamberT = 0;
  private valveCount = 0;
  private returnLit = false;
  private pumpsWarned = false;
  private spotValveNext = false;
  // progression
  private outflowIdx = 0;
  private outflowRides = 0;
  private rungIdx = 0;
  private ladderTopped = false;
  highWaterReady = false;
  private highWaterUntil = -Infinity;
  private highWaterWasActive = false;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind, id }) => {
      if (kind === "ramp-entry") this.outflowEnd("entry");
      else if (kind === "ramp-exit") this.outflowEnd("exit");
      else if (kind === "lane" && id === "descent") this.onDescent();
      else if (kind === "target" && id === "valves") this.onValve();
    });
    ctx.bus.on("bankComplete", () => {
      if (this.gateLit) return;
      this.gateLit = true;
      this.ctx.sfx("bank");
      const frames = this.ctx.baked("gate");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "FLOODGATE OPEN")
          : new MessageScene([["FLOODGATE OPEN", "SHOOT THE DRAIN"]], 1.6, true),
        2,
      );
    });
  }

  get highWaterActive(): boolean {
    return this.now < this.highWaterUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.highWaterWasActive && !this.highWaterActive) {
      this.highWaterWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "highWaterEnd" });
      this.ctx.push(new MessageScene([["THE PUMPS WIN", "LEVEL FALLS"]], 1.4), 2);
      // the water table wins in the end: the mode drains the level back
      this.stage = 1;
      this.ctx.scoring.multiplier = 2;
    }
    if (this.inChamber && !this.highWaterActive) {
      this.chamberT += dt;
      const S = rules.sumpPlay;
      if (!this.pumpsWarned && this.chamberT > S.pumpS) {
        this.pumpsWarned = true;
        this.ctx.sfx("warning");
        const frames = this.ctx.baked("pumps");
        this.ctx.push(
          frames
            ? new BakedDmdScene(frames, 9, "THE PUMPS ARE ON")
            : new MessageScene([["THE PUMPS ARE ON"]], 1.2, true),
          2,
        );
      }
      if (this.chamberT > S.floodS && !this.returnLit) {
        // flooding: the escape is offered free — never forced
        this.returnLit = true;
        this.ctx.push(new MessageScene([["CHAMBER FLOODING", "RETURN PIPE OPEN"]], 1.4, true), 2);
      }
    }
  }

  endBall(): void {
    this.skillUsed = false;
    this.outflowStep = 0;
    this.lastOutflowAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.exitChamber();
    if (this.highWaterActive) {
      this.highWaterUntil = -Infinity;
      this.highWaterWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "highWaterEnd" });
    }
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.stage = 0;
    this.gateLit = false;
    this.grateLit = false;
    this.outflowIdx = 0;
    this.outflowRides = 0;
    this.rungIdx = 0;
    this.ladderTopped = false;
    this.spotValveNext = false;
    this.highWaterReady = false;
  }

  /** S-U-M-P lanes: all four raise the water level + light the grate. */
  onRollover(id: string): void {
    this.spotLane(id);
  }

  private spotLane(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      const W = rules.waterLevel;
      this.stage = Math.min(this.stage + 1, W.stages.length);
      this.ctx.scoring.multiplier = Math.min(this.stage + 1, W.maxMultiplier);
      if (W.litsGrate) this.grateLit = true;
      this.ctx.sfx("multiplier");
      const caption = `${W.stages[this.stage - 1]}  X${this.ctx.scoring.multiplier}`;
      const frames = this.ctx.baked("gauge");
      this.ctx.push(
        frames ? new BakedDmdScene(frames, 8, caption) : new MessageScene([[caption]], 1.4, true),
        2,
      );
      this.checkReady();
    }
  }

  /** Classic lane change: flippers rotate the collected letters. */
  onFlipper(side: "left" | "right"): void {
    if (this.litLanes.size === 0 || this.litLanes.size === 4) return;
    const shift = side === "left" ? -1 : 1;
    const next = new Set<string>();
    for (const id of this.litLanes) {
      const i = LANE_IDS.indexOf(id as (typeof LANE_IDS)[number]);
      next.add(LANE_IDS[(i + shift + LANE_IDS.length) % LANE_IDS.length]);
    }
    this.litLanes = next;
  }

  laneLit(id: string): number {
    return this.litLanes.has(id) ? 0.55 : 0;
  }

  /** Gauge inserts g1..g5 to the level; gate/grate/return mirror lit state. */
  lamp(id: string): number {
    if (id.startsWith("g") && id.length === 2) {
      const n = Number(id[1]);
      return n <= this.stage ? 0.8 : 0;
    }
    if (id === "gate") return this.gateLit || this.highWaterActive ? 0.9 : 0;
    if (id === "grate") return this.grateLit ? 0.8 : 0;
    if (id === "return") return this.returnLit ? 0.9 : 0;
    return 0;
  }

  kickerLit(id: string): boolean {
    if (id === "grate") return this.grateLit;
    if (id === "return") return this.returnLit;
    return true; // the pump scoop is always live
  }

  /** THE FLOODGATE: open while lit and for the whole of High Water. */
  diverterBlade(id: string): string {
    if (id !== "floodgate") return "shut";
    return this.gateLit || this.highWaterActive ? "open" : "shut";
  }

  /** THE READING: soft plunge peaking in the lane band. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "reading" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return; // tilted
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "THE READING");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["THE READING", fmtScore(points)]], 1.4, true), 2);
    const unlit = LANE_IDS.find((m) => !this.litLanes.has(m));
    if (unlit) this.spotLane(unlit);
  }

  /** Kicker/subway captures: the pump ladder, the grate, the return ride. */
  onCapture(id: string): void {
    if (this.ctx.scoring.muted) return;
    if (id === "pump") this.onPump();
    else if (id === "grate") {
      this.grateLit = false;
      this.ctx.push(new MessageScene([["THE GRATE", "BALL SAVED"]], 1.1), 2);
    } else if (id === "return") this.onOutflowRide();
  }

  private onPump(): void {
    if (this.highWaterReady && !this.highWaterActive) {
      this.startHighWater();
      return;
    }
    const R = rules.pump.rungs[this.rungIdx];
    const topped = this.rungIdx === rules.pump.rungs.length - 1;
    this.rungIdx = (this.rungIdx + 1) % rules.pump.rungs.length;
    const points = this.ctx.scoring.award(R.points, R.name);
    this.ctx.scoring.bonusUnits += rules.pump.bonusUnit;
    if (topped) {
      this.ladderTopped = true;
      this.spotValveNext = true;
      this.checkReady();
    }
    const frames = this.ctx.baked("gauge");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `${R.name} ${fmtScore(points)}`)
        : new MessageScene([[R.name, fmtScore(points)]], 1.5, true),
      2,
    );
  }

  /** The gated descent fired: SUMP PLAY begins (the drain that wasn't). */
  private onDescent(): void {
    if (this.inChamber) return; // already down (chamber rattle re-fires)
    if (!this.gateLit && !this.highWaterActive) return; // shut gate: a real drain
    if (!this.highWaterActive) this.gateLit = false; // consume the light
    this.inChamber = true;
    this.chamberT = 0;
    this.pumpsWarned = false;
    this.valveCount = this.spotValveNext ? 1 : 0;
    this.spotValveNext = false;
    this.returnLit = false;
    const level = Math.max(1, this.stage);
    if (!this.highWaterActive) this.ctx.scoring.eclipseFactor = level;
    const points = this.ctx.scoring.award(rules.floodgate.descentPoints, "SUMP PLAY");
    this.ctx.sfx("scoop");
    this.ctx.shake(0.004);
    const frames = this.ctx.baked("gate");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 9, `SUMP PLAY X${level}`)
        : new MessageScene([["SUMP PLAY", `SCORES X${level} ${fmtScore(points)}`]], 1.6, true),
      2,
    );
    this.ctx.bus.emit("mode", { kind: "sumpPlayStart" });
  }

  private onValve(): void {
    if (!this.inChamber || this.ctx.scoring.muted) return;
    if (this.returnLit) {
      this.ctx.scoring.award(rules.sumpPlay.valvePoints, "VALVE");
      return;
    }
    this.valveCount++;
    const points = this.ctx.scoring.award(rules.sumpPlay.valvePoints, `VALVE ${this.valveCount}`);
    this.ctx.sfx("target");
    if (this.valveCount >= rules.sumpPlay.valveHits) {
      this.returnLit = true;
      const frames = this.ctx.baked("valve");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "OUTFLOW OPEN")
          : new MessageScene([["OUTFLOW OPEN", "RIDE THE PIPE"]], 1.5, true),
        2,
      );
    } else {
      this.ctx.push(
        new MessageScene([[`VALVE ${this.valveCount} OF ${rules.sumpPlay.valveHits}`, fmtScore(points)]], 1.1),
        1,
      );
    }
  }

  /** The return pipe took the ball home: the outflow pays. */
  private onOutflowRide(): void {
    const L = rules.sumpPlay.outflowLadder;
    const points = this.ctx.scoring.award(L[Math.min(this.outflowIdx, L.length - 1)], "OUTFLOW");
    this.outflowIdx = Math.min(this.outflowIdx + 1, L.length - 1);
    this.outflowRides++;
    this.exitChamber();
    // the gate re-lights at "half price": the sluice walls stay down, one
    // fresh completion is not required — carried as a free relight
    this.gateLit = true;
    this.ctx.sfx("kickout");
    const frames = this.ctx.baked("outflow");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 9, `OUTFLOW ${fmtScore(points)}`)
        : new MessageScene([["OUTFLOW", fmtScore(points)]], 1.5, true),
      2,
    );
    this.checkReady();
  }

  private exitChamber(): void {
    this.inChamber = false;
    this.chamberT = 0;
    this.valveCount = 0;
    this.returnLit = false;
    this.pumpsWarned = false;
    if (!this.highWaterActive) this.ctx.scoring.eclipseFactor = 1;
  }

  private outflowEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < OUTFLOW_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity;
      this.onOutflow();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onOutflow(): void {
    const combo = rules.outflowCombo;
    this.outflowStep =
      this.now - this.lastOutflowAt < combo.windowS
        ? Math.min(combo.maxStep, this.outflowStep + 1)
        : 1;
    this.lastOutflowAt = this.now;
    const factor = 2 ** (this.outflowStep - 1);
    this.ctx.scoring.award(
      rules.points.orbit * factor,
      factor > 1 ? `OUTFLOW ×${factor}` : "THE OUTFLOW",
    );
  }

  private checkReady(): void {
    if (
      !this.highWaterReady &&
      !this.highWaterActive &&
      this.stage >= rules.waterLevel.stages.length &&
      this.outflowRides >= rules.highWater.outflowsRequired &&
      this.ladderTopped
    ) {
      this.highWaterReady = true;
      this.ctx.bus.emit("mode", { kind: "highWaterReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["HIGH WATER IS LIT", "SHOOT THE PUMP HOUSE"]], 1.6, true), 2);
    }
  }

  private startHighWater(): void {
    this.highWaterReady = false;
    this.outflowRides = 0;
    this.ladderTopped = false;
    this.highWaterUntil = this.now + rules.highWater.durationS;
    this.highWaterWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.highWater.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "highWaterStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("highwater");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "ALL SCORES X2", 1.0)
        : new MessageScene([["HIGH WATER", "GATE LOCKED OPEN  X2"]], 1.6, true),
      3,
    );
  }
}
