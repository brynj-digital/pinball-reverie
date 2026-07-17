import type { TableLogic, TableLogicCtx } from "./TableLogic";
import type { DmdScene } from "../render/dmd/DmdScene";
import type { DotMatrix } from "../render/dmd/DotMatrix";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/tidebreaker/rules.json";

/**
 * SONAR SWEEP — the DMD video mode (SIGNAL BOX pattern: pure display; the
 * logic owns every timer and outcome, sim-safe).
 */
export class SonarScene implements DmdScene {
  constructor(
    private read: () => {
      active: boolean;
      sweepX: number; // 0..1 across the display
      contacts: number[]; // 0..1 positions
      results: (boolean | null)[];
    },
  ) {}

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    if (!s.active) return true;
    dmd.clear();
    dmd.centerText("SONAR SWEEP", 0, 3);
    for (let x = 4; x < 124; x += 3) dmd.set(x, 24, 1); // the scan floor
    s.contacts.forEach((c, i) => {
      const x = 8 + Math.round(c * 112);
      const lv = s.results[i] === null ? 2 : s.results[i] ? 4 : 1;
      dmd.set(x, 20, lv);
      dmd.set(x - 1, 21, lv);
      dmd.set(x + 1, 21, lv);
      dmd.set(x, 22, lv);
    });
    const sx = 8 + Math.round(s.sweepX * 112);
    for (let y = 9; y <= 24; y++) dmd.set(sx, y, 3);
    dmd.set(sx, 8, 4);
    return false;
  }
}

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
  private skillUsed = false;
  private sonarLit = false;
  private snActive = false;
  private snStart = 0;
  private snContacts: number[] = [];
  private snResults: (boolean | null)[] = [];
  private snLastPress = -Infinity;
  private leviathanStartTotal = 0;

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
      const frames = this.ctx.baked("airlock");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "AIRLOCK CYCLED")
          : new MessageScene([["AIRLOCK CYCLED"]], 1.2),
      );
      this.checkReady();
    });
  }

  get leviathanActive(): boolean {
    return this.now < this.leviathanUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.snActive) this.updateSonar();
    if (this.leviathanWasActive && !this.leviathanActive) {
      this.leviathanWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "leviathanEnd" });
      this.ctx.push(
        new MessageScene(
          [["IT RETURNS", "TO THE DEEP"], ["LEVIATHAN TOTAL", fmtScore(this.ctx.scoring.total - this.leviathanStartTotal)]],
          1.4,
        ),
        2,
      );
    }
  }

  endBall(): void {
    if (this.snActive) this.endSonar(true);
    this.skillUsed = false;
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
    this.spotLane(id);
  }

  private spotLane(id: string): void {
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

  /** SOUNDING: soft plunge peaking in the lane band. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "sounding" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return; // tilted
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "SOUNDING");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["SOUNDING", fmtScore(points)]], 1.4, true), 2);
    // spot one unlit D-I-V-E lane (completion logic shared with onRollover)
    const unlit = ["1", "2", "3", "4"].find((m) => !this.litLanes.has(m));
    if (unlit) this.spotLane(unlit);
  }

  /** Depth-gauge inserts g1..g5 lit up to the reached stage; the outlane
   * save inserts mirror their kickback/subway lit state. */
  lamp(id: string): number {
    if (id === "hatch") return this.hatchLit ? 1 : 0;
    if (id === "gutter") return this.gutterLit ? 1 : 0;
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
    if (id === "divebell" && this.sonarLit && !this.snActive && !this.ctx.scoring.muted) {
      this.startSonar();
      return;
    }
    if (id === "divebell") {
      if (this.snActive) return; // captures during the hold don't re-award
      this.onHaul();
      return;
    }
    if (id === "divebell") this.onHaul();
    else if (id === "trench") {
      if (this.ctx.scoring.muted) return;
      this.ctx.scoring.award(rules.trench.points, "TRENCH RUN");
      this.ctx.scoring.bonusUnits += rules.trench.bonusUnit;
      const frames = this.ctx.baked("trench");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, `TRENCH RUN ${fmtScore(rules.trench.points)}`)
          : new MessageScene([["TRENCH RUN"]], 1.0),
      );
    } else if (id === "hatch") {
      this.hatchLit = false;
      const frames = this.ctx.baked("hatch");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, "BALLAST BLOWN")
          : new MessageScene([["ESCAPE HATCH", "BALLAST BLOWN"]], 1.2),
        2,
      );
    } else if (id === "gutter") {
      this.gutterLit = false;
      const frames = this.ctx.baked("gutter");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "TRENCH GUTTER")
          : new MessageScene([["TRENCH GUTTER", "RIDING THE FLOW"]], 1.2),
        2,
      );
    }
  }

  /** Dive bell capture: award the next salvage haul in the manifest. */
  private onHaul(): void {
    if (this.ctx.scoring.muted) return; // tilted: no haul, no progression
    const B = rules.diveBell;
    const haul = B.hauls[this.haulIdx];
    const last = B.lastSpotsLeviathan && this.haulIdx === B.hauls.length - 1;
    this.haulIdx = (this.haulIdx + 1) % B.hauls.length;
    if (this.haulIdx === 0) this.sonarLit = true; // the manifest is full: sweep
    const points = this.ctx.scoring.award(haul.points, haul.name);
    this.ctx.scoring.bonusUnits += B.bonusUnit;
    this.gutterLit = true;
    if (last && !this.leviathanReady && !this.leviathanActive) {
      this.banks++; // the motherlode counts as an airlock cycle
      this.checkReady();
    }
    this.ctx.bus.emit("telescope", { name: haul.name, points, spotted: last });
    // the ball sits captive in the bell while this plays
    const frames = this.ctx.baked("divebell");
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
      const frames = this.ctx.baked("current");
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
    this.leviathanStartTotal = this.ctx.scoring.total;
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

  /** Live ticker for the score readout (DMD pass). */
  dmdStatus(): string | undefined {
    if (this.leviathanActive) return `LEVIATHAN ${Math.ceil(this.leviathanUntil - this.now)}`;
    if (this.leviathanReady) return "SHOOT THE CURRENT";
    const letters = ["D", "I", "V", "E"].map((c, i) => (this.litLanes.has(String(i + 1)) ? c : ".")).join("");
    return `${letters}  DEPTH ${this.stage}/5`;
  }

  /** Both-flipper progress readout (DMD pass). */
  statusReport(): string[][] {
    const B = rules.diveBell;
    return [
      [`DEPTH ${this.stage} OF 5`, `MULTIPLIER X${this.ctx.scoring.multiplier}`],
      [`AIRLOCKS ${this.banks}`, this.leviathanReady ? "LEVIATHAN IS LIT" : "WAKE LEVIATHAN"],
      ["NEXT HAUL", B.hauls[this.haulIdx].name],
    ];
  }

  // ─────────────── SONAR SWEEP (DMD video mode) ───────────────
  // The sweep crosses the scope in sweepS; contact i is "hit" when a
  // flipper press lands within windowS of the sweep passing it. Ends at
  // sonar.durationS regardless of the DMD (sim-safe).

  onFlipper(): void {
    if (this.snActive) this.snLastPress = this.now;
  }

  private startSonar(): void {
    this.sonarLit = false;
    this.snActive = true;
    this.snStart = this.now;
    this.snContacts = Array.from(
      { length: rules.sonar.pings },
      (_, i) => 0.18 + (i / rules.sonar.pings) * 0.62 + Math.random() * 0.12,
    );
    this.snResults = this.snContacts.map(() => null);
    this.snLastPress = -Infinity;
    this.ctx.holdScoop?.("divebell", true);
    this.ctx.sfx("multiplier");
    this.ctx.push(
      new SequenceScene([
        new MessageScene([["SONAR SWEEP", "FLIP ON EACH CONTACT"]], 1.4, true),
        new SonarScene(() => ({
          active: this.snActive,
          sweepX: Math.min(1, Math.max(0, (this.now - this.snStart - 1.6) / (rules.sonar.durationS - 3))),
          contacts: this.snContacts,
          results: this.snResults,
        })),
      ]),
      3,
    );
  }

  private updateSonar(): void {
    const t = this.now - this.snStart;
    const sweep = Math.min(1, Math.max(0, (t - 1.6) / (rules.sonar.durationS - 3)));
    this.snContacts.forEach((c, i) => {
      if (this.snResults[i] === null && sweep >= c) {
        const ok = this.now - this.snLastPress <= rules.sonar.windowS;
        this.snResults[i] = ok;
        if (ok) {
          this.ctx.scoring.award(rules.sonar.pingValue, "CONTACT");
          this.ctx.sfx("rollover");
        } else {
          this.ctx.sfx("target");
        }
      }
    });
    if (t >= rules.sonar.durationS) this.endSonar(false);
  }

  private endSonar(abandoned: boolean): void {
    this.snActive = false;
    this.ctx.holdScoop?.("divebell", false);
    if (abandoned) return;
    const hits = this.snResults.filter(Boolean).length;
    this.ctx.push(
      new MessageScene(
        [hits === this.snResults.length ? ["FULL CONTACT", "THE TRENCH ANSWERS"] : [`${hits} CONTACTS`]],
        1.4,
        hits === this.snResults.length,
      ),
      3,
    );
  }
}
