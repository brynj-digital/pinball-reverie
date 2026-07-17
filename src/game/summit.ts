import type { TableLogic, TableLogicCtx } from "./TableLogic";
import { BakedDmdScene, MessageScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/summit/rules.json";

/** Entry→exit (either direction) within this window counts as a Ridge Run. */
const RIDGE_PAIR_WINDOW = 3.5;

const LANE_IDS = ["1", "2", "3", "4"] as const;
const INSTRUMENTS = ["baro", "thermo", "anemo"] as const;

/**
 * The Summit ruleset (M15; design truth in the table's BRIEF.md):
 *
 * - THE RIDGE RUN: full orbit loops, combo-stepped; anemometer spins
 *   accumulate WIND — at galeSpins the cable car closes for galeS (the
 *   hazard you farmed for points).
 * - P-E-A-K: completion lights a free cable-car ride + the WINDBREAK.
 * - THE TERRACE: the cable car lands the ball on the platform; rolling
 *   the three INSTRUMENT pads (across any number of visits) makes a
 *   FORECAST — the bonus-X step and aurora progress.
 * - THE LAUNCH: leaving the terrace through the east opening above the
 *   gutter line pays; a dribble out the gutter is safe and unpaid.
 * - THE CORNICE: bank completion runs an avalanche (doubled scoring); a
 *   terrace leave during the slide pays the SNOW JACKPOT.
 * - THE BOTHY: scoop ladder (wrapping); the top rung spots an instrument
 *   and lights the GALLERY subway.
 * - LAST CAR UP: ridesRequired lit rides start a timed multiball —
 *   ride jackpots, SUMMIT JACKPOT on a mid-mode LAUNCH. (Virtual locks;
 *   the physical dock berths were the brief's cut line.)
 * - THE AURORA (wizard): forecasts + a multiball + a snow jackpot light
 *   the Bothy; doubled scores, gale-proof car.
 * - LAST CAR (skill shot): soft plunge pays and spots an instrument.
 */
export class SummitLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private ridgeStep = 0;
  private lastRidgeAt = -Infinity;
  private litLanes = new Set<string>();
  private reads = new Set<string>();
  private forecasts = 0;
  private carLit = false;
  private windbreakLit = false;
  private galleryLit = false;
  private skillUsed = false;
  private wind = 0;
  private galeUntil = -Infinity;
  private avalancheUntil = -Infinity;
  private snowJackpoted = false;
  private rungIdx = 0;
  private litRides = 0;
  private lastCarUntil = -Infinity;
  private lastCarWasActive = false;
  private multiballed = false;
  auroraReady = false;
  private auroraUntil = -Infinity;
  private auroraWasActive = false;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind, id }) => {
      if (kind === "ramp-entry") this.ridgeEnd("entry");
      else if (kind === "ramp-exit") this.ridgeEnd("exit");
      else if (kind === "lane" && id && (INSTRUMENTS as readonly string[]).includes(id))
        this.onInstrument(id);
    });
    ctx.bus.on("spinnerTick", () => this.onSpin());
    ctx.bus.on("surface", ({ from, x, y }) => {
      if (from === "terrace") this.onTerraceLeave(x, y);
    });
    ctx.bus.on("bankComplete", () => this.onCornice());
  }

  get galeActive(): boolean {
    return this.now < this.galeUntil;
  }
  get avalancheActive(): boolean {
    return this.now < this.avalancheUntil;
  }
  get lastCarActive(): boolean {
    return this.now < this.lastCarUntil;
  }
  get auroraActive(): boolean {
    return this.now < this.auroraUntil;
  }

  update(dt: number): void {
    this.now += dt;
    // one combined score factor: any doubled mode doubles, never stacks
    this.ctx.scoring.eclipseFactor =
      this.avalancheActive || this.lastCarActive || this.auroraActive
        ? rules.lastCar.scoreFactor
        : 1;
    if (this.lastCarWasActive && !this.lastCarActive) {
      this.lastCarWasActive = false;
      this.ctx.bus.emit("mode", { kind: "lastCarEnd" });
      this.ctx.push(new MessageScene([["THE CAR REACHES THE DOCK"]], 1.2), 2);
    }
    if (this.auroraWasActive && !this.auroraActive) {
      this.auroraWasActive = false;
      this.ctx.bus.emit("mode", { kind: "auroraEnd" });
      this.ctx.push(new MessageScene([["THE LOG CLOSES", "DAWN ON THE RIDGE"]], 1.5), 2);
    }
  }

  endBall(): void {
    this.skillUsed = false;
    this.ridgeStep = 0;
    this.lastRidgeAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.avalancheUntil = -Infinity;
    this.galeUntil = -Infinity;
    this.wind = 0;
    if (this.lastCarActive) {
      this.lastCarUntil = -Infinity;
      this.lastCarWasActive = false;
      this.ctx.bus.emit("mode", { kind: "lastCarEnd" });
    }
    if (this.auroraActive) {
      this.auroraUntil = -Infinity;
      this.auroraWasActive = false;
      this.ctx.bus.emit("mode", { kind: "auroraEnd" });
    }
    this.ctx.scoring.eclipseFactor = 1;
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.reads.clear();
    this.forecasts = 0;
    this.carLit = false;
    this.windbreakLit = false;
    this.galleryLit = false;
    this.rungIdx = 0;
    this.litRides = 0;
    this.multiballed = false;
    this.snowJackpoted = false;
    this.auroraReady = false;
  }

  /** P-E-A-K: completion lights a free ride + the windbreak. */
  onRollover(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      this.carLit = true;
      this.windbreakLit = true;
      const points = this.ctx.scoring.award(rules.peakLanes.points, "P-E-A-K");
      this.ctx.sfx("multiplier");
      const frames = this.ctx.baked("car");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, `RIDE FREE ${fmtScore(points)}`)
          : new MessageScene([["P-E-A-K", "THE CAR RIDES FREE"]], 1.3, true),
        2,
      );
    }
  }

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

  lamp(id: string): number {
    if ((INSTRUMENTS as readonly string[]).includes(id))
      return this.auroraActive ? 0.95 : this.reads.has(id) ? 0.8 : 0;
    if (id === "car") return this.galeActive ? 0 : this.carLit ? 0.9 : 0.35;
    if (id === "windbreak") return this.windbreakLit ? 0.8 : 0;
    if (id === "gallery") return this.galleryLit ? 0.8 : 0;
    return 0;
  }

  /** The car closes in a gale (unless the aurora is running); saves gate. */
  kickerLit(id: string): boolean {
    if (id === "car") return this.auroraActive || !this.galeActive;
    if (id === "windbreak") return this.windbreakLit;
    if (id === "gallery") return this.galleryLit;
    return true; // the bothy is always live
  }

  /** LAST CAR: soft plunge pays and spots an instrument. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "lastcar" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return;
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "LAST CAR");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["LAST CAR", fmtScore(points)]], 1.4, true), 2);
    const unread = INSTRUMENTS.find((i) => !this.reads.has(i));
    if (unread) this.onInstrument(unread);
  }

  onCapture(id: string): void {
    if (this.ctx.scoring.muted) return;
    if (id === "bothy") this.onBothy();
    else if (id === "windbreak") {
      this.windbreakLit = false;
      this.ctx.push(new MessageScene([["WINDBREAK", "BALL SAVED"]], 1.1), 2);
    } else if (id === "gallery") {
      this.galleryLit = false;
      this.ctx.push(new MessageScene([["THE GALLERY", "THROUGH THE ROCK"]], 1.1), 2);
    } else if (id === "car") this.onRide();
  }

  private onRide(): void {
    if (this.lastCarActive) {
      this.ctx.scoring.award(rules.lastCar.jackpot, "RIDE JACKPOT");
      this.ctx.sfx("bank");
      return;
    }
    if (this.carLit) {
      this.carLit = false;
      this.litRides++;
      if (this.litRides >= rules.lastCar.ridesRequired) this.startLastCar();
      else
        this.ctx.push(
          new MessageScene(
            [[`CAR ${this.litRides} OF ${rules.lastCar.ridesRequired}`, "BANKED"]],
            1.1,
          ),
          1,
        );
    }
    const frames = this.ctx.baked("car");
    if (frames) this.ctx.push(new BakedDmdScene(frames, 10, "GOING UP"), 1);
  }

  /** A terrace instrument pad read. */
  private onInstrument(id: string): void {
    if (this.ctx.scoring.muted) return;
    if (this.reads.has(id)) return;
    this.reads.add(id);
    const points = this.ctx.scoring.award(rules.instruments.readPoints, `${id.toUpperCase()} READ`);
    this.ctx.sfx("rollover");
    if (this.reads.size === INSTRUMENTS.length) {
      this.reads.clear();
      this.forecasts++;
      if (this.ctx.scoring.multiplier < rules.instruments.maxMultiplier)
        this.ctx.scoring.multiplier++;
      const frames = this.ctx.baked("read");
      const caption = `FORECAST  X${this.ctx.scoring.multiplier}`;
      this.ctx.push(
        frames ? new BakedDmdScene(frames, 8, caption) : new MessageScene([[caption]], 1.4, true),
        2,
      );
      this.checkReady();
    } else {
      this.ctx.push(new MessageScene([[`${id.toUpperCase()} READ`, fmtScore(points)]], 1.0), 1);
    }
  }

  /** Leaving the terrace: the launch, the dribble, or the snow jackpot. */
  private onTerraceLeave(x: number, y: number): void {
    if (this.ctx.scoring.muted) return;
    if (this.avalancheActive && !this.snowJackpoted) {
      this.snowJackpoted = true;
      this.ctx.scoring.award(rules.cornice.snowJackpot, "SNOW JACKPOT");
      this.ctx.sfx("bank");
      this.checkReady();
    }
    if (x >= rules.launch.eastX && y < rules.launch.gutterY) {
      const label = this.lastCarActive ? "SUMMIT JACKPOT" : "THE LAUNCH";
      const pts = this.lastCarActive ? rules.lastCar.summitJackpot : rules.launch.points;
      const points = this.ctx.scoring.award(pts, label);
      this.ctx.shake(0.003);
      const frames = this.ctx.baked("launchscene");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, `${label} ${fmtScore(points)}`)
          : new MessageScene([[label, fmtScore(points)]], 1.4, true),
        2,
      );
    }
  }

  private onSpin(): void {
    if (this.ctx.scoring.muted || this.galeActive) return;
    this.wind++;
    if (this.wind >= rules.wind.galeSpins) {
      this.wind = 0;
      this.galeUntil = this.now + rules.wind.galeS;
      this.ctx.sfx("warning");
      const frames = this.ctx.baked("wind");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "GALE  CAR CLOSED")
          : new MessageScene([["GALE ON THE RIDGE", "THE CAR IS CLOSED"]], 1.4, true),
        2,
      );
    }
  }

  private onCornice(): void {
    this.avalancheUntil = this.now + rules.cornice.avalancheS;
    this.ctx.sfx("bank");
    this.ctx.shake(0.005);
    const frames = this.ctx.baked("avalanche");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "AVALANCHE  X2", 1.0)
        : new MessageScene([["THE CORNICE GOES", "ALL SCORES X2"]], 1.5, true),
      2,
    );
  }

  private onBothy(): void {
    if (this.auroraReady && !this.auroraActive) {
      this.startAurora();
      return;
    }
    const R = rules.bothy.rungs[this.rungIdx];
    const topped = this.rungIdx === rules.bothy.rungs.length - 1;
    this.rungIdx = (this.rungIdx + 1) % rules.bothy.rungs.length;
    const points = this.ctx.scoring.award(R.points, R.name);
    this.ctx.scoring.bonusUnits += rules.bothy.bonusUnit;
    if (topped) {
      this.galleryLit = true;
      const unread = INSTRUMENTS.find((i) => !this.reads.has(i));
      if (unread) this.onInstrument(unread);
    }
    this.ctx.push(new MessageScene([[R.name, fmtScore(points)]], 1.4, true), 2);
  }

  private startLastCar(): void {
    this.litRides = 0;
    this.multiballed = true;
    this.lastCarUntil = this.now + rules.lastCar.durationS;
    this.lastCarWasActive = true;
    this.ctx.addBalls?.(rules.lastCar.balls);
    this.ctx.bus.emit("mode", { kind: "lastCarStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.005);
    const frames = this.ctx.baked("car");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "LAST CAR UP  X2", 1.0)
        : new MessageScene([["LAST CAR UP", "EVERY CAR RUNNING  X2"]], 1.6, true),
      3,
    );
    this.checkReady();
  }

  private checkReady(): void {
    if (
      !this.auroraReady &&
      !this.auroraActive &&
      this.forecasts >= rules.aurora.forecastsRequired &&
      this.multiballed &&
      this.snowJackpoted
    ) {
      this.auroraReady = true;
      this.ctx.bus.emit("mode", { kind: "auroraReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["THE SKY IS MOVING", "SHOOT THE BOTHY"]], 1.6, true), 2);
    }
  }

  private startAurora(): void {
    this.auroraReady = false;
    this.forecasts = 0;
    this.multiballed = false;
    this.snowJackpoted = false;
    this.auroraUntil = this.now + rules.aurora.durationS;
    this.auroraWasActive = true;
    this.ctx.bus.emit("mode", { kind: "auroraStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("aurora");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "ALL SCORES X2", 1.0)
        : new MessageScene([["THE AURORA", "THE WHOLE SKY  X2"]], 1.6, true),
      3,
    );
  }

  private ridgeEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < RIDGE_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity;
      this.onRidge();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onRidge(): void {
    const combo = rules.ridgeCombo;
    this.ridgeStep =
      this.now - this.lastRidgeAt < combo.windowS ? Math.min(combo.maxStep, this.ridgeStep + 1) : 1;
    this.lastRidgeAt = this.now;
    const factor = 2 ** (this.ridgeStep - 1);
    this.ctx.scoring.award(
      rules.points.orbit * factor,
      factor > 1 ? `RIDGE RUN ×${factor}` : "RIDGE RUN",
    );
  }
}
