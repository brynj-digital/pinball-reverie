import type { TableLogic, TableLogicCtx } from "./TableLogic";
import type { DmdScene } from "../render/dmd/DmdScene";
import type { DotMatrix } from "../render/dmd/DotMatrix";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/smallhours/rules.json";

/** Entry→exit (either direction) within this window counts as a City Sweep. */
const SWEEP_PAIR_WINDOW = 3.5;
const LANE_IDS = ["1", "2", "3", "4"] as const;

/**
 * REQUEST SHOW — the DMD video mode (the SIGNAL BOX pattern). Pure display:
 * SmallHoursLogic owns every timer and outcome (the headless sims have no
 * DMD, so the mode must resolve without this scene ever updating). The
 * scene draws the groove, the five requests, the needle, and the cue lever.
 */
class RequestShowScene implements DmdScene {
  constructor(
    private read: () => {
      active: boolean;
      progress: number; // 0..1 across the groove
      lever: "left" | "right";
      required: ("left" | "right")[];
      results: (boolean | null)[]; // per request, null = not reached yet
      cleared: number;
    },
  ) {}

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    if (!s.active) return true;
    dmd.clear();
    // NB: text/set take dot LEVELS 0-4 (dim -> hi), not font sizes — level 1
    // is near-black on the smoked glass; keep everything readable at 2+
    // (the SIGNAL BOX shipped that way once and read as a dead panel)
    dmd.centerText("REQUEST SHOW", 0, 3);
    // the groove: a dotted line with 5 requests; the needle is a 3-dot block
    const y = 16;
    for (let x = 6; x < 122; x += 2) dmd.set(x, y, 2);
    const n = s.required.length;
    for (let i = 0; i < n; i++) {
      const jx = 14 + Math.round((i * 100) / (n - 1));
      const res = s.results[i];
      // request glyph: side A cued up (left) or side B cued down (right);
      // brightness shows the outcome once the needle has passed
      const lv = res === null ? 3 : res ? 4 : 1;
      const dir = s.required[i] === "left" ? -1 : 1;
      for (let k = 0; k <= 3; k++) dmd.set(jx + k, y + k * dir, lv);
    }
    const nx = 6 + Math.round(s.progress * 112);
    for (let k = -2; k <= 2; k++) dmd.set(nx + k, y - 5, 4);
    dmd.set(nx + 3, y - 5, 2); // the stylus tip
    // the cued side as a bright letter at the left edge — flipper presses
    // must visibly DO something or the whole hold reads as a hang
    dmd.text(s.lever === "left" ? "A" : "B", 1, s.lever === "left" ? 7 : 19, 4);
    dmd.centerText(`CUE SIDE ${s.lever === "left" ? "A" : "B"}  ${s.cleared} RIGHT`, 25, 3);
    return false;
  }
}

/**
 * The Small Hours ruleset (design truth in the table's BRIEF.md), values
 * from the table's rules JSON:
 *
 * - THE CLOCK: completing W-A-V-E advances one hour (1 AM → 5 AM); the
 *   bonus multiplier tracks the hour and each completion lights the
 *   GENERATOR kickback. Letters lane-change on the flippers and persist
 *   across balls (the proven pattern).
 * - CITY SWEEP: full orbits (entry/exit pair); consecutive sweeps inside
 *   sweepCombo.windowS escalate ×2 per step (capped).
 * - THE DIAL: spinner spins tune the transmitter; TUNED arms one Signal
 *   Boost on the Aerial Run and starts the record deck's slow drift.
 * - AERIAL RUN: a completed ride (boarded at the mouth, released at the
 *   mast) pays SIGNAL; a TUNED ride pays SIGNAL BOOST × the Sweep step,
 *   consumes the light, and spots a Phone rung.
 * - THE PHONE: each capture awards the next request (wrapping); the
 *   MYSTERY B-SIDE advances the Clock and lights REQUEST SHOW; every
 *   capture lights the SIDE DOOR (right-outlane subway to the left inlane).
 * - REQUEST SHOW (video mode): the scoop holds the ball (holdScoop) while
 *   the flippers cue SIDE A / SIDE B ahead of the needle on the DMD; all
 *   five right puts a caller on the line. Timer-driven — sim-safe.
 * - ON AIR: fader bank completion lights CALLER; a lit switchboard capture
 *   puts a caller ON HOLD (physical lock, persists across balls).
 *   callersRequired on the line = ON AIR: ×scoreFactor scoring with
 *   jackpots on the Aerial Run and the City Sweep — the OTHER shot within
 *   segueS of a jackpot pays the PERFECT SEGUE bonus; lit switchboard
 *   arrivals mid-mode pay CALLER JACKPOT.
 * - DEAD AIR: score nothing for warnS (armed by the first score of the
 *   ball) and the static rolls in; every drainS after, a slice of the
 *   listeners (bonus units) tunes out. Suspended while REQUEST SHOW
 *   legitimately holds the ball.
 * - THE DAWN CHORUS (wizard): 5 AM + one ON AIR + one boost light the
 *   Phone; shooting it runs durationS of ×scoreFactor with both jackpot
 *   shots live and the segue still paying.
 * - Combos and running modes die with the ball; hours, letters, callers
 *   and lit saves persist across balls, reset per game.
 */
export class SmallHoursLogic implements TableLogic {
  private now = 0;
  // sweep pair
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private sweepStep = 0;
  private lastSweepAt = -Infinity;
  // clock
  private litLanes = new Set<string>();
  private hour = 0;
  private dawn = false;
  // dial
  private spins = 0;
  private tuned = false;
  private boosts = 0;
  private skillUsed = false;
  // aerial run
  private boarded = false;
  // phone ladder
  private phoneIdx = 0;
  private requestShowLit = false;
  // callers / ON AIR
  private callerLit = false;
  private callers = 0;
  private onAirs = 0;
  private onAirUntil = -Infinity;
  private onAirWasActive = false;
  // perfect segue
  private lastJackpotShot: "aerial" | "sweep" | null = null;
  private lastJackpotAt = -Infinity;
  // wizard
  private chorusReady = false;
  private chorusUntil = -Infinity;
  private chorusWasActive = false;
  // outlanes
  private generatorLit = false;
  private sidedoorLit = false;
  private onAirStartTotal = 0;
  private chorusStartTotal = 0;
  // request show video mode
  private rsActive = false;
  private rsStart = 0;
  private rsLever: "left" | "right" = "left";
  private rsRequired: ("left" | "right")[] = [];
  private rsResults: (boolean | null)[] = [];
  private rsCleared = 0;
  // dead air
  private daArmed = false;
  private daLastScoreAt = 0;
  private daWarned = false;
  private daNextLossAt = 0;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind }) => {
      if (kind === "ramp-entry") this.sweepEnd("entry");
      else if (kind === "ramp-exit") this.sweepEnd("exit");
    });
    // the aerial run is a surface: award on leave-at-the-mast, guarded by
    // boarded-at-the-mouth (the M11 convention)
    ctx.bus.on("surface", ({ from, to, y }) => {
      if (to === "aerial" && y > 0.55) this.boarded = true;
      else if (from === "aerial") {
        if (this.boarded && y < 0.3) this.onAerial();
        this.boarded = false;
      }
    });
    ctx.bus.on("spinnerTick", () => {
      if (this.tuned || this.ctx.scoring.muted) return;
      this.spins++;
      if (this.spins >= rules.dial.spinsToTune) {
        this.tuned = true;
        this.ctx.sfx("multiplier");
        const frames = this.ctx.baked("dial");
        this.ctx.push(
          frames
            ? new BakedDmdScene(frames, 9, "TUNED IN")
            : new MessageScene([["TUNED IN", "RIDE THE AERIAL"]], 1.3, true),
          1,
        );
      }
    });
    ctx.bus.on("bankComplete", () => {
      if (this.ctx.scoring.muted) return;
      this.callerLit = true;
      this.ctx.push(new MessageScene([["FADERS UP", "CALLER IS LIT"]], 1.3), 1);
    });
    // dead air runs on the score clock: any points reset (and arm) it
    ctx.bus.on("score", () => {
      this.daArmed = true;
      this.daLastScoreAt = this.now;
      this.daWarned = false;
    });
  }

  get onAirActive(): boolean {
    return this.now < this.onAirUntil;
  }

  get chorusActive(): boolean {
    return this.now < this.chorusUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.rsActive) this.updateRequestShow();
    this.updateDeadAir();
    if (this.onAirWasActive && !this.onAirActive) {
      this.onAirWasActive = false;
      if (!this.chorusActive) this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "onairEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["AND THAT IS THE SHOW", "STAY TUNED"],
            ["ON AIR TOTAL", fmtScore(this.ctx.scoring.total - this.onAirStartTotal)],
          ],
          1.4,
        ),
        2,
      );
      this.checkChorusReady();
    }
    if (this.chorusWasActive && !this.chorusActive) {
      this.chorusWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "chorusEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["THE CITY WOKE", "WITH THE RADIO ON"],
            ["DAWN CHORUS TOTAL", fmtScore(this.ctx.scoring.total - this.chorusStartTotal)],
          ],
          1.6,
        ),
        2,
      );
    }
  }

  endBall(): void {
    this.skillUsed = false;
    this.sweepStep = 0;
    this.lastSweepAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.boarded = false;
    this.daArmed = false;
    this.daWarned = false;
    // clock hours and letters PERSIST across balls (brief §3); modes die
    if (this.rsActive) this.endRequestShow(true);
    if (this.onAirActive) {
      this.onAirUntil = -Infinity;
      this.onAirWasActive = false;
      this.ctx.bus.emit("mode", { kind: "onairEnd" });
    }
    if (this.chorusActive) {
      this.chorusUntil = -Infinity;
      this.chorusWasActive = false;
      this.ctx.bus.emit("mode", { kind: "chorusEnd" });
    }
    this.ctx.scoring.eclipseFactor = 1;
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.hour = 0;
    this.dawn = false;
    this.spins = 0;
    this.tuned = false;
    this.boosts = 0;
    this.phoneIdx = 0;
    this.requestShowLit = false;
    this.callerLit = false;
    this.callers = 0;
    this.onAirs = 0;
    this.lastJackpotShot = null;
    this.lastJackpotAt = -Infinity;
    this.generatorLit = false;
    this.sidedoorLit = false;
    this.chorusReady = false;
  }

  /** W-A-V-E lanes: all four advance the clock + light the generator. */
  onRollover(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      const C = rules.clock;
      this.hour = Math.min(this.hour + 1, C.hours.length);
      if (this.hour === C.hours.length) this.dawn = true;
      this.ctx.scoring.multiplier = Math.min(this.hour + 1, C.maxMultiplier);
      this.generatorLit = true;
      this.ctx.sfx("multiplier");
      const caption = `${C.hours[this.hour - 1]}  X${this.ctx.scoring.multiplier}`;
      this.ctx.push(new MessageScene([[caption, this.dawn ? "DAWN IS COMING" : "THE NIGHT ROLLS ON"]], 1.4, true), 2);
      this.checkChorusReady();
    }
  }

  /** Classic lane change: flippers rotate the collected letters. */
  onFlipper(side: "left" | "right"): void {
    if (this.rsActive) {
      this.rsLever = side;
      return;
    }
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
    if (id === "tuned") return this.tuned ? 1 : 0;
    if (id === "onair") return this.onAirActive || this.chorusActive ? 1 : 0;
    if (id === "caller") return this.callerLit ? 1 : 0;
    if (id === "hold1") return this.callers >= 1 ? 1 : 0;
    if (id === "hold2") return this.callers >= 2 ? 1 : 0;
    if (id === "generator") return this.generatorLit ? 1 : 0;
    if (id === "sidedoor") return this.sidedoorLit ? 1 : 0;
    const n = Number(id.replace(/\D/g, ""));
    return n > 0 && n <= this.hour ? 1 : 0;
  }

  kickerLit(id: string): boolean {
    if (id === "generator") return this.generatorLit;
    if (id === "sidedoor") return this.sidedoorLit;
    if (id === "switchboard") return this.callerLit || this.onAirActive;
    return true; // the phone is always live
  }

  /** M12 hook: the record deck reads its spin from here. */
  discSpin(): number {
    if (this.onAirActive || this.chorusActive) return 7;
    return this.tuned ? 2.5 : 0; // the record drifts while TUNED
  }

  onCapture(id: string): void {
    if (id === "phone") this.onPhone();
    else if (id === "switchboard") this.onSwitchboard();
    else if (id === "generator") {
      this.generatorLit = false;
      this.ctx.push(new MessageScene([["THE GENERATOR", "KICKS THE POWER OVER"]], 1.2), 2);
    } else if (id === "sidedoor") {
      this.sidedoorLit = false;
      this.ctx.push(new MessageScene([["THE SIDE DOOR", "DOWN THE BACK STAIRS"]], 1.2), 2);
    }
  }

  /** While TUNED the studio monitors are up: sling kicks run hotter. */
  slingBoost(): number {
    return this.tuned ? rules.dial.slingBoost : 1;
  }

  /** NIGHT OWLS: soft plunge peaking in the lane band. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "nightowls" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return; // tilted
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "NIGHT OWLS");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["NIGHT OWLS", fmtScore(points)]], 1.4, true), 2);
  }

  /** A completed Aerial Run ride: SIGNAL, or the tuned SIGNAL BOOST. */
  private onAerial(): void {
    if (this.ctx.scoring.muted) return;
    if (this.onAirActive || this.chorusActive) {
      this.jackpot("AERIAL JACKPOT", "aerial");
      return;
    }
    if (this.tuned) {
      this.tuned = false;
      this.spins = 0;
      this.boosts++;
      const step = Math.max(1, this.sweepStep);
      const points = rules.dial.boostPoints * step;
      this.ctx.scoring.award(points, step > 1 ? `BOOST X${step}` : "SIGNAL BOOST");
      this.ctx.scoring.bonusUnits += rules.dial.bonusUnit;
      this.phoneIdx = (this.phoneIdx + 1) % rules.phone.items.length; // spots a rung
      const frames = this.ctx.baked("mast");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, `SIGNAL BOOST ${fmtScore(points)}`)
          : new MessageScene([["SIGNAL BOOST", fmtScore(points)]], 1.4),
        2,
      );
      this.checkChorusReady();
      return;
    }
    this.ctx.scoring.award(rules.aerial.points, "AERIAL RUN");
    this.ctx.scoring.bonusUnits += rules.aerial.bonusUnit;
  }

  /** Phone capture: wizard start > video mode > the request ladder. */
  private onPhone(): void {
    this.sidedoorLit = true;
    if (this.ctx.scoring.muted) return;
    if (this.chorusReady && !this.chorusActive) {
      this.startChorus();
      return;
    }
    if (this.requestShowLit && !this.rsActive) {
      this.startRequestShow();
      return;
    }
    const P = rules.phone;
    const item = P.items[this.phoneIdx];
    const bside = this.phoneIdx === P.items.length - 1;
    this.phoneIdx = (this.phoneIdx + 1) % P.items.length;
    const points = this.ctx.scoring.award(item.points, item.name);
    this.ctx.scoring.bonusUnits += P.bonusUnit;
    if (bside) {
      const C = rules.clock;
      this.hour = Math.min(this.hour + 1, C.hours.length);
      if (this.hour === C.hours.length) this.dawn = true;
      this.ctx.scoring.multiplier = Math.min(this.hour + 1, C.maxMultiplier);
      this.requestShowLit = true;
      this.checkChorusReady();
    }
    const frames = this.ctx.baked("caller");
    const reveal = frames
      ? new BakedDmdScene(frames, 8, `${item.name} ${fmtScore(points)}`)
      : new MessageScene([[item.name, fmtScore(points)]], 1.6, true);
    this.ctx.push(
      bside
        ? new SequenceScene([reveal, new MessageScene([["REQUEST SHOW", "IS LIT"]], 1.0, true)])
        : reveal,
      2,
    );
  }

  /** A lit switchboard arrival: a caller on hold (or CALLER JACKPOT).
   * With the engine's physical locks (Game) the caller PARKS visibly on
   * the hold line and a fresh ball is served; the headless sims have no
   * lockBall and keep the virtual clunk-and-release. */
  private onSwitchboard(): void {
    if (this.ctx.scoring.muted) return;
    if (this.onAirActive) {
      this.jackpot("CALLER JACKPOT", null);
      return;
    }
    this.callerLit = false;
    this.callers++;
    if (this.callers < rules.onAir.callersRequired) {
      // the hold line: berths stacked up-table beside the switchboard
      const berth = { x: 0.132, y: 0.335 - 0.03 * (this.callers - 1) };
      this.ctx.lockBall?.("switchboard", berth);
    }
    const frames = this.ctx.baked("caller");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 9, `CALLER ${this.callers} ON HOLD`)
        : new MessageScene([[`CALLER ${this.callers}`, "ON HOLD"]], 1.3),
      2,
    );
    this.ctx.shake(0.003);
    if (this.callers >= rules.onAir.callersRequired) this.startOnAir();
  }

  private sweepEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < SWEEP_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity; // consume the pair
      this.onSweep();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onSweep(): void {
    if (this.onAirActive || this.chorusActive) {
      this.jackpot("SWEEP JACKPOT", "sweep");
      return;
    }
    const combo = rules.sweepCombo;
    this.sweepStep =
      this.now - this.lastSweepAt < combo.windowS ? Math.min(combo.maxStep, this.sweepStep + 1) : 1;
    this.lastSweepAt = this.now;
    const factor = 2 ** (this.sweepStep - 1);
    const points = rules.points.orbit * factor;
    const label = factor > 1 ? `SWEEP X${factor}` : "CITY SWEEP";
    if (this.ctx.scoring.award(points, label) > 0) {
      const frames = this.ctx.baked("mast");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 11, `${label} ${fmtScore(points)}`)
          : new MessageScene([[label, fmtScore(points)]], 1.2),
        1,
      );
    }
  }

  /** Mode jackpot; the OTHER shot inside the segue window doubles up —
   * a clean segue is the whole craft of the small hours. */
  private jackpot(label: string, shot: "aerial" | "sweep" | null): void {
    const value = this.chorusActive ? rules.dawnChorus.jackpot : rules.onAir.jackpot;
    this.ctx.scoring.award(value, label);
    this.ctx.sfx("bank");
    let segue = false;
    if (shot) {
      segue =
        this.lastJackpotShot !== null &&
        this.lastJackpotShot !== shot &&
        this.now - this.lastJackpotAt < rules.onAir.segueS;
      this.lastJackpotShot = shot;
      this.lastJackpotAt = this.now;
      if (segue) this.ctx.scoring.award(rules.onAir.segueBonus, "PERFECT SEGUE");
    }
    const frames = this.ctx.baked("mast");
    if (segue) {
      this.ctx.push(
        new MessageScene([["PERFECT SEGUE", fmtScore(rules.onAir.segueBonus)]], 1.2, true),
        2,
      );
    } else if (frames) {
      this.ctx.push(new BakedDmdScene(frames, 9, `${label} ${fmtScore(value)}`), 2);
    } else {
      this.ctx.push(new MessageScene([[label, fmtScore(value)]], 1.1), 2);
    }
  }

  private startOnAir(): void {
    this.callers = 0;
    this.onAirs++;
    this.onAirStartTotal = this.ctx.scoring.total;
    this.onAirUntil = this.now + rules.onAir.durationS;
    this.onAirWasActive = true;
    this.lastJackpotShot = null;
    // the callers rejoin the show (M12 3-ball multiball): physically parked
    // holds release; any shortfall (virtual callers from the REQUEST SHOW)
    // tops up with served extras. The headless sims have neither seam and
    // stay single-ball.
    const released = this.ctx.releaseLocks?.() ?? 0;
    if (released < 2) this.ctx.addBalls?.(2 - released, { x: 0.132, y: 0.4 }, { x: 0.5, y: 1.2 });
    this.ctx.scoring.eclipseFactor = rules.onAir.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "onairStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("onair");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `ON AIR  X${rules.onAir.scoreFactor}`, 1.0)
        : new MessageScene([["ON AIR", `ALL SCORES X${rules.onAir.scoreFactor}`]], 1.5, true),
      3,
    );
  }

  private checkChorusReady(): void {
    if (
      !this.chorusReady &&
      !this.chorusActive &&
      this.dawn &&
      this.onAirs >= 1 &&
      this.boosts >= 1
    ) {
      this.chorusReady = true;
      this.ctx.bus.emit("mode", { kind: "chorusReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(
        new MessageScene([["THE SUN IS COMING UP", "ANSWER THE PHONE"]], 1.6, true),
        2,
      );
    }
  }

  private startChorus(): void {
    this.chorusReady = false;
    this.dawn = false;
    this.onAirs = 0;
    this.boosts = 0;
    this.chorusStartTotal = this.ctx.scoring.total;
    this.chorusUntil = this.now + rules.dawnChorus.durationS;
    this.chorusWasActive = true;
    this.lastJackpotShot = null;
    this.ctx.scoring.eclipseFactor = rules.dawnChorus.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "chorusStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("dawn");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `THE DAWN CHORUS  X${rules.dawnChorus.scoreFactor}`, 1.0)
        : new MessageScene(
            [["THE DAWN CHORUS", `ALL SCORES X${rules.dawnChorus.scoreFactor}`]],
            1.5,
            true,
          ),
      3,
    );
  }

  // ─────────────────── DEAD AIR ───────────────────
  // Runs on the score clock: armed by the first score of the ball, reset by
  // every score event, suspended while the REQUEST SHOW legitimately holds
  // the ball. Warn at warnS; every drainS after, listeners tune out.

  private updateDeadAir(): void {
    if (!this.daArmed || this.rsActive) return;
    const idle = this.now - this.daLastScoreAt;
    const DA = rules.deadAir;
    if (!this.daWarned && idle >= DA.warnS) {
      this.daWarned = true;
      this.daNextLossAt = this.daLastScoreAt + DA.warnS + DA.drainS;
      this.ctx.sfx("warning");
      const frames = this.ctx.baked("static");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, "DEAD AIR")
          : new MessageScene([["DEAD AIR", "SAY SOMETHING"]], 1.3, true),
        2,
      );
    }
    if (this.daWarned && this.now >= this.daNextLossAt) {
      this.daNextLossAt += DA.drainS;
      const loss = Math.floor(this.ctx.scoring.bonusUnits * DA.lossFraction);
      if (loss > 0) {
        this.ctx.scoring.bonusUnits -= loss;
        this.ctx.sfx("target");
        this.ctx.push(
          new MessageScene([[`${fmtScore(loss)} LISTENERS`, "TUNED OUT"]], 1.2),
          1,
        );
      }
    }
  }

  // ─────────────────── REQUEST SHOW (video mode) ───────────────────
  // Timer-driven: request i resolves at rsStart + 2.2 + i×1.6 (the first
  // AFTER the 1.4 s intro card — the player must see the groove before it
  // starts judging); the whole mode ends at rules.requestShow.durationS
  // regardless of the DMD, so the headless sims (no DotMatrix) release
  // the held ball on schedule.

  private startRequestShow(): void {
    this.requestShowLit = false;
    this.rsActive = true;
    this.rsStart = this.now;
    this.rsLever = "left";
    this.rsCleared = 0;
    const n = rules.requestShow.requests;
    this.rsRequired = Array.from({ length: n }, () => (Math.random() < 0.5 ? "left" : "right"));
    this.rsResults = Array.from({ length: n }, () => null);
    this.ctx.holdScoop?.("phone", true);
    this.ctx.sfx("multiplier");
    this.ctx.push(
      new SequenceScene([
        // 21 glyphs max on the second row: 128 dots / 6-per-glyph
        new MessageScene([["REQUEST SHOW", "FLIPPERS CUE A AND B"]], 1.4, true),
        new RequestShowScene(() => ({
          active: this.rsActive,
          progress: Math.min(
            1,
            Math.max(0, (this.now - this.rsStart - 2.2) / (1.6 * (rules.requestShow.requests - 1) + 0.8)),
          ),
          lever: this.rsLever,
          required: this.rsRequired,
          results: this.rsResults,
          cleared: this.rsCleared,
        })),
      ]),
      3,
    );
  }

  private updateRequestShow(): void {
    const t = this.now - this.rsStart;
    for (let i = 0; i < this.rsRequired.length; i++) {
      if (this.rsResults[i] === null && t >= 2.2 + i * 1.6) {
        const ok = this.rsLever === this.rsRequired[i];
        this.rsResults[i] = ok;
        if (ok) {
          this.rsCleared++;
          this.ctx.scoring.award(rules.requestShow.requestValue, "RIGHT SIDE");
          this.ctx.sfx("rollover");
        } else {
          this.ctx.sfx("target");
        }
      }
    }
    if (t >= rules.requestShow.durationS) this.endRequestShow(false);
  }

  private endRequestShow(abandoned: boolean): void {
    this.rsActive = false;
    this.ctx.holdScoop?.("phone", false);
    if (abandoned) return;
    const all = this.rsCleared === this.rsRequired.length;
    if (all && rules.requestShow.clearAllCaller) {
      this.ctx.push(new MessageScene([["EVERY CUE CLEAN", "CALLER ON THE LINE"]], 1.5, true), 3);
      this.callerLit = false;
      this.callers++;
      if (this.callers >= rules.onAir.callersRequired) this.startOnAir();
    } else {
      this.ctx.push(new MessageScene([[`${this.rsCleared} REQUESTS`, "PLAYED RIGHT"]], 1.3), 3);
    }
  }

  /** Live ticker for the score readout (DMD pass). */
  dmdStatus(): string | undefined {
    if (this.chorusActive) return `DAWN CHORUS ${Math.ceil(this.chorusUntil - this.now)}`;
    if (this.chorusReady) return "START AT THE PHONE";
    if (this.onAirActive) return `ON AIR ${Math.ceil(this.onAirUntil - this.now)}`;
    const letters = ["W", "A", "V", "E"].map((c, i) => (this.litLanes.has(String(i + 1)) ? c : ".")).join("");
    return `${letters}  CALLERS ${this.callers}/${rules.onAir.callersRequired}`;
  }

  /** Both-flipper progress readout (DMD pass). */
  statusReport(): string[][] {
    const missing =
      `${this.dawn ? "" : "5 AM "}${this.onAirs >= 1 ? "" : "ON AIR "}${this.boosts >= 1 ? "" : "BOOST"}`.trim();
    return [
      [
        `THE CLOCK  ${this.hour === 0 ? "MIDNIGHT" : rules.clock.hours[this.hour - 1]}`,
        `MULTIPLIER X${this.ctx.scoring.multiplier}`,
      ],
      [
        `CALLERS ${this.callers} OF ${rules.onAir.callersRequired}`,
        this.callerLit ? "CALLER IS LIT" : "DROP THE FADERS",
      ],
      this.chorusReady
        ? ["THE SKY IS PALING", "START AT THE PHONE"]
        : ["FOR THE DAWN CHORUS", missing || "READY SOON"],
    ];
  }
}
