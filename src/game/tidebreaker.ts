import type { TableLogic, TableLogicCtx } from "./TableLogic";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/tidebreaker/rules.json";

/** Entry→exit (either direction) within this window counts as a Current loop. */
const CURRENT_PAIR_WINDOW = 3.5;

/**
 * The Tidebreaker ruleset (M10; design truth in the table's BRIEF.md),
 * values from the table's rules JSON:
 *
 * - THE CURRENT: full orbit loops; consecutive loops inside
 *   currentCombo.windowS escalate ×2 per step (capped at maxStep).
 * - DEPTH GAUGE: completing the D-I-V-E lanes advances one stage
 *   (100M → TRENCH FLOOR); the bonus multiplier tracks the stage and each
 *   completion lights the ESCAPE HATCH kickback (left outlane, one save).
 * - WINCH: a full ramp + habitrail trip (rail-out) pays winch points.
 * - DIVE BELL: each scoop capture awards the next salvage haul (wrapping);
 *   every capture lights the TRENCH GUTTER (right-outlane subway back to
 *   the hatch); the last haul feeds LEVIATHAN.
 * - TRENCH: the under-field subway from the trench mouth to the bell.
 * - LEVIATHAN: reach TRENCH FLOOR + cycle the airlock banksRequired times
 *   to light it; the next Current starts durationS seconds of ×scoreFactor
 *   scoring with currentValue Current jackpots.
 * - Combos and a running Leviathan die with the ball; depth, hauls and lit
 *   hatch/gutter persist across balls, reset per game.
 */
export class TidebreakerLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private currentStep = 0;
  private lastCurrentAt = -Infinity;
  private litLanes = new Set<string>();
  private stage = 0; // depth gauge, 0..stages.length
  private trenchFloor = false;
  private banks = 0;
  private haulIdx = 0;
  private hatchLit = false;
  private gutterLit = false;
  leviathanReady = false;
  private leviathanUntil = -Infinity;
  private leviathanWasActive = false;

  /** A haul only counts when the ramp was boarded at the mouth (both ends
   * of the winch circuit sit at ground height). */
  private winchFromMouth = false;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind }) => {
      if (kind === "ramp-entry") this.currentEnd("entry");
      else if (kind === "ramp-exit") this.currentEnd("exit");
    });
    // M11: the ramp ride is a surface event — boarded at the mouth (right,
    // x ≈ 0.349), paid when the habitrail drops it off at the left wall
    ctx.bus.on("surface", ({ from, to, x }) => {
      if (to === "winch") this.winchFromMouth = x > 0.25;
      else if (from === "winch") {
        if (x < 0.15 && this.winchFromMouth) this.onWinch();
        this.winchFromMouth = false;
      }
    });
    ctx.bus.on("bankComplete", () => {
      if (this.ctx.scoring.muted) return;
      this.banks++;
      this.ctx.push(new MessageScene([["AIRLOCK CYCLED"]], 1.2));
      this.checkReady();
    });
  }

  get leviathanActive(): boolean {
    return this.now < this.leviathanUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.leviathanWasActive && !this.leviathanActive) {
      this.leviathanWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "leviathanEnd" });
      this.ctx.push(new MessageScene([["IT RETURNS", "TO THE DEEP"]], 1.5), 2);
    }
  }

  endBall(): void {
    this.currentStep = 0;
    this.lastCurrentAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.litLanes.clear();
    if (this.leviathanActive) {
      this.leviathanUntil = -Infinity;
      this.leviathanWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "leviathanEnd" });
    }
  }

  resetGame(): void {
    this.endBall();
    this.stage = 0;
    this.trenchFloor = false;
    this.banks = 0;
    this.haulIdx = 0;
    this.hatchLit = false;
    this.gutterLit = false;
    this.leviathanReady = false;
  }

  /** D-I-V-E lanes: all four advance the depth gauge + light the hatch. */
  onRollover(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      const G = rules.depthGauge;
      this.stage = Math.min(this.stage + 1, G.stages.length);
      if (this.stage === G.stages.length) this.trenchFloor = true;
      this.ctx.scoring.multiplier = Math.min(this.stage + 1, G.maxMultiplier);
      this.hatchLit = true;
      this.ctx.sfx("multiplier");
      const caption = `DEPTH ${G.stages[this.stage - 1]}  X${this.ctx.scoring.multiplier}`;
      const frames = this.ctx.baked("sonar");
      this.ctx.push(
        frames ? new BakedDmdScene(frames, 8, caption) : new MessageScene([[caption]], 1.4, true),
        2,
      );
      this.checkReady();
    }
  }

  laneLit(id: string): number {
    return this.litLanes.has(id) ? 0.55 : 0;
  }

  /** Depth-gauge inserts g1..g5: lit up to the reached stage. */
  lamp(id: string): number {
    const n = Number(id.replace(/\D/g, ""));
    return n > 0 && n <= this.stage ? 1 : 0;
  }

  kickerLit(id: string): boolean {
    if (id === "hatch") return this.hatchLit;
    if (id === "gutter") return this.gutterLit;
    return true; // dive bell + trench mouth are always live
  }

  /** Game confirmed a kicker/subway capture (awards live here, not on the
   * raw sensor, so a cooldown re-trigger can't double-award). */
  onCapture(id: string): void {
    if (id === "divebell") this.onHaul();
    else if (id === "trench") {
      if (this.ctx.scoring.muted) return;
      this.ctx.scoring.award(rules.trench.points, "TRENCH RUN");
      this.ctx.scoring.bonusUnits += rules.trench.bonusUnit;
      const frames = this.ctx.baked("sonar");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, `TRENCH RUN ${fmtScore(rules.trench.points)}`)
          : new MessageScene([["TRENCH RUN"]], 1.0),
      );
    } else if (id === "hatch") {
      this.hatchLit = false;
      this.ctx.push(new MessageScene([["ESCAPE HATCH", "BALLAST BLOWN"]], 1.2), 2);
    } else if (id === "gutter") {
      this.gutterLit = false;
      this.ctx.push(new MessageScene([["TRENCH GUTTER", "RIDING THE FLOW"]], 1.2), 2);
    }
  }

  /** Dive bell capture: award the next salvage haul in the manifest. */
  private onHaul(): void {
    if (this.ctx.scoring.muted) return; // tilted: no haul, no progression
    const B = rules.diveBell;
    const haul = B.hauls[this.haulIdx];
    const last = B.lastSpotsLeviathan && this.haulIdx === B.hauls.length - 1;
    this.haulIdx = (this.haulIdx + 1) % B.hauls.length;
    const points = this.ctx.scoring.award(haul.points, haul.name);
    this.ctx.scoring.bonusUnits += B.bonusUnit;
    this.gutterLit = true;
    if (last && !this.leviathanReady && !this.leviathanActive) {
      this.banks++; // the motherlode counts as an airlock cycle
      this.checkReady();
    }
    this.ctx.bus.emit("telescope", { name: haul.name, points, spotted: last });
    // the ball sits captive in the bell while this plays
    const frames = this.ctx.baked("winch");
    const reveal = frames
      ? new BakedDmdScene(frames, 8, `${haul.name} ${fmtScore(points)}`)
      : new MessageScene([[haul.name, fmtScore(points)]], 1.6, true);
    this.ctx.push(
      last
        ? new SequenceScene([reveal, new MessageScene([["SOMETHING STIRS"]], 1.0)])
        : reveal,
      2,
    );
  }

  /** Full winch ramp + habitrail trip completed (rail-out sensor). */
  private onWinch(): void {
    if (this.ctx.scoring.muted) return;
    this.ctx.scoring.award(rules.winch.points, "WINCH HAUL");
    this.ctx.scoring.bonusUnits += rules.winch.bonusUnit;
    const frames = this.ctx.baked("winch");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 11, `WINCH ${fmtScore(rules.winch.points)}`)
        : new MessageScene([["WINCH HAUL"]], 1.0),
    );
  }

  private currentEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < CURRENT_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity; // consume the pair
      this.onCurrent();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onCurrent(): void {
    if (this.leviathanActive) {
      this.ctx.scoring.award(rules.leviathan.currentValue, "LEVIATHAN CURRENT");
      const frames = this.ctx.baked("leviathan");
      if (frames)
        this.ctx.push(
          new BakedDmdScene(frames, 9, `JACKPOT ${fmtScore(rules.leviathan.currentValue)}`),
          2,
        );
      return;
    }
    const combo = rules.currentCombo;
    this.currentStep =
      this.now - this.lastCurrentAt < combo.windowS
        ? Math.min(combo.maxStep, this.currentStep + 1)
        : 1;
    this.lastCurrentAt = this.now;
    const factor = 2 ** (this.currentStep - 1);
    const points = rules.points.orbit * factor;
    const label = factor > 1 ? `CURRENT X${factor}` : "CURRENT";
    if (this.ctx.scoring.award(points, label) > 0) {
      const frames = this.ctx.baked("sonar");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 11, `${label} ${fmtScore(points)}`)
          : new MessageScene([[label, fmtScore(points)]], 1.2),
        1,
      );
    }
    if (this.leviathanReady) this.startLeviathan();
  }

  private checkReady(): void {
    if (
      !this.leviathanReady &&
      !this.leviathanActive &&
      this.trenchFloor &&
      this.banks >= rules.leviathan.banksRequired
    ) {
      this.leviathanReady = true;
      this.ctx.bus.emit("mode", { kind: "leviathanReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["LEVIATHAN LURKS", "SHOOT THE CURRENT"]], 1.6, true), 2);
    }
  }

  private startLeviathan(): void {
    this.leviathanReady = false;
    this.banks = 0;
    this.trenchFloor = false;
    this.leviathanUntil = this.now + rules.leviathan.durationS;
    this.leviathanWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.leviathan.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "leviathanStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("leviathan");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `ALL SCORES X${rules.leviathan.scoreFactor}`, 1.0)
        : new MessageScene([["LEVIATHAN", `ALL SCORES X${rules.leviathan.scoreFactor}`]], 1.5, true),
      3,
    );
  }
}
