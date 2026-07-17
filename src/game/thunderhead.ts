import type { TableLogic, TableLogicCtx } from "./TableLogic";
import type { DmdScene } from "../render/dmd/DmdScene";
import type { DotMatrix } from "../render/dmd/DotMatrix";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/thunderhead/rules.json";

/** Entry→exit (either direction) within this window counts as a Circuit. */
const CIRCUIT_PAIR_WINDOW = 3.5;

const LANE_IDS = ["1", "2", "3", "4"] as const;

/** The storm route chain, in shot order after the opening cell fling. */
const ROUTE_STEPS = ["spine", "circuit", "nacelle"] as const;
type RouteStep = (typeof ROUTE_STEPS)[number];

/**
 * LIGHTNING WATCH — the DMD video mode (SIGNAL BOX pattern: pure display;
 * the logic owns every timer and outcome, sim-safe).
 */
export class LightningScene implements DmdScene {
  constructor(
    private read: () => {
      active: boolean;
      quadrant: "left" | "right" | null;
      chargeT: number; // 0..1 while a strike charges
      results: (boolean | null)[];
    },
  ) {}

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    if (!s.active) return true;
    dmd.clear();
    dmd.centerText("LIGHTNING WATCH", 0, 3);
    // the cloud deck
    for (let x = 4; x <= 124; x += 3) dmd.set(x, 30, 1);
    if (s.quadrant) {
      const cx = s.quadrant === "left" ? 32 : 96;
      // the charge arc builds down from the cloud line toward the deck
      const depth = 8 + Math.round(s.chargeT * 16);
      let y = 9;
      let x = cx;
      let flip = 1;
      while (y < 9 + depth && y < 29) {
        dmd.set(x, y, 4);
        dmd.set(x + flip, y + 1, 3);
        x += flip * 2;
        flip = -flip;
        y += 2;
      }
      dmd.centerText(s.quadrant === "left" ? "CALL PORT" : "CALL STARBOARD", 25, 3);
    }
    s.results.forEach((r, i) => {
      const bx = 4 + i * 6;
      const lv = r === null ? 1 : r ? 4 : 2;
      dmd.set(bx, 3, lv);
      dmd.set(bx + 1, 3, lv);
      dmd.set(bx, 4, lv);
      dmd.set(bx + 1, 4, lv);
    });
    return false;
  }
}

/**
 * The Thunderhead ruleset (table 9 GREY-BOX prototype; design truth in the
 * table's BRIEF.md), values from the rules JSON:
 *
 * - THE CIRCUIT: full orbit loops around the storm's rim, combo-stepped.
 * - G-A-L-E: completion steps the bonus multiplier (persistent letters,
 *   lane change) and feeds CHARGE.
 * - CHARGE CELLS: vane spins + lane completions build charge; at
 *   cellCharge a cell lights (alternating). A lit cell grabs a passing
 *   ground ball and flings it — toward the next STORM ROUTE shot when the
 *   route is running, outward otherwise (chaos with intent).
 * - STORM ROUTE: a cell fling opens spine → circuit → nacelle on a
 *   per-step timer; the full chain banks a STRIKE.
 * - BALLAST: dropping the bank sheds ballast — ballastS of ×2 with both
 *   outlane saves lit (STATIC kickback + KEEL subway).
 * - SPINE RUN: the rigging surface past the storm; pays on the airborne
 *   leave at the top, boarded-at-the-mouth guarded (M11 rules).
 * - THE NACELLE: instrument ladder (wrapping); the top lights LIGHTNING
 *   WATCH (video mode — call the strike quadrant with the flippers).
 * - SQUALL: strikesForSquall STRIKES → timed multiball, both cells run
 *   continuously, cell-fling jackpots, double at the spine.
 * - THE EYE (wizard): a squall + two routes + max bonus X light the
 *   nacelle — dead calm, everything ×2, the cells stand down.
 * - STORM GLASS: soft-plunge skill shot, pays and spots a lane.
 * - Combos, routes and running modes die with the ball; letters, charge,
 *   strikes and lit cells persist.
 */
export class ThunderheadLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private circuitStep = 0;
  private lastCircuitAt = -Infinity;
  private litLanes = new Set<string>();
  private skillUsed = false;
  // charge + cells
  private charge = 0;
  private litCell: "cell1" | "cell2" | null = null;
  private nextCell: "cell1" | "cell2" = "cell1";
  // storm route
  private routeStep: RouteStep | null = null;
  private routeUntil = -Infinity;
  private routes = 0;
  private strikes = 0;
  // ballast
  private ballastUntil = -Infinity;
  /** STATIC starts lit each ball (classic kickback), consumed on fire,
   * relit (with the keel) by shedding ballast. */
  private staticLit = true;
  // spine
  private spineBoarded = false;
  // nacelle ladder
  private rungIdx = 0;
  private watchLit = false;
  // squall
  private squallUntil = -Infinity;
  private squallWasActive = false;
  private squalled = false;
  private squallStartTotal = 0;
  // the eye
  eyeReady = false;
  private eyeUntil = -Infinity;
  private eyeWasActive = false;
  private eyeStartTotal = 0;
  // lightning watch
  private lwActive = false;
  private lwStart = 0;
  private lwStrike = 0;
  private lwQuadrants: ("left" | "right")[] = [];
  private lwResults: (boolean | null)[] = [];

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind }) => {
      if (kind === "ramp-entry") this.circuitEnd("entry");
      else if (kind === "ramp-exit") this.circuitEnd("exit");
    });
    ctx.bus.on("spinnerTick", () => this.onSpin());
    ctx.bus.on("surface", ({ from, to, y }) => {
      if (to === "spine") this.spineBoarded = y > 0.55; // boarded at the mouth
      else if (from === "spine") {
        if (y < 0.32 && this.spineBoarded) this.onSpine();
        this.spineBoarded = false;
      }
    });
    ctx.bus.on("bankComplete", () => this.onBallast());
  }

  get ballastActive(): boolean {
    return this.now < this.ballastUntil;
  }
  get squallActive(): boolean {
    return this.now < this.squallUntil;
  }
  get eyeActive(): boolean {
    return this.now < this.eyeUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.lwActive) this.updateLightning();
    // one combined factor: any doubled mode doubles, never stacks
    this.ctx.scoring.eclipseFactor =
      this.ballastActive || this.squallActive || this.eyeActive ? rules.ballast.scoreFactor : 1;
    if (this.routeStep && this.now > this.routeUntil) this.endRoute(false);
    if (this.squallWasActive && !this.squallActive) {
      this.squallWasActive = false;
      this.ctx.bus.emit("mode", { kind: "squallEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["THE SQUALL PASSES"],
            ["SQUALL TOTAL", fmtScore(this.ctx.scoring.total - this.squallStartTotal)],
          ],
          1.3,
        ),
        2,
      );
    }
    if (this.eyeWasActive && !this.eyeActive) {
      this.eyeWasActive = false;
      this.ctx.bus.emit("mode", { kind: "eyeEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["THE WALL CLOSES", "BACK INTO THE WEATHER"],
            ["EYE TOTAL", fmtScore(this.ctx.scoring.total - this.eyeStartTotal)],
          ],
          1.5,
        ),
        2,
      );
    }
  }

  endBall(): void {
    if (this.lwActive) this.endLightning(true);
    this.skillUsed = false;
    this.staticLit = true;
    this.circuitStep = 0;
    this.lastCircuitAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.spineBoarded = false;
    this.ballastUntil = -Infinity;
    this.endRoute(true);
    if (this.squallActive) {
      this.squallUntil = -Infinity;
      this.squallWasActive = false;
      this.ctx.bus.emit("mode", { kind: "squallEnd" });
    }
    if (this.eyeActive) {
      this.eyeUntil = -Infinity;
      this.eyeWasActive = false;
      this.ctx.bus.emit("mode", { kind: "eyeEnd" });
    }
    this.ctx.scoring.eclipseFactor = 1;
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.charge = 0;
    this.litCell = null;
    this.nextCell = "cell1";
    this.routes = 0;
    this.strikes = 0;
    this.rungIdx = 0;
    this.watchLit = false;
    this.squalled = false;
    this.eyeReady = false;
  }

  /** G-A-L-E: completion steps the bonus X and adds charge. */
  onRollover(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      if (this.ctx.scoring.multiplier < rules.gale.maxMultiplier) this.ctx.scoring.multiplier++;
      const points = this.ctx.scoring.award(rules.gale.points, "G-A-L-E");
      this.addCharge(rules.charge.laneCharge);
      this.ctx.sfx("multiplier");
      const frames = this.ctx.baked("charge");
      const caption = `G-A-L-E  X${this.ctx.scoring.multiplier}`;
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, caption)
          : new MessageScene([[caption, fmtScore(points)]], 1.3, true),
        2,
      );
      this.checkEyeReady();
    }
  }

  onFlipper(side: "left" | "right"): void {
    if (this.lwActive) {
      this.lwCall(side);
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
    if (id === "cell1" || id === "cell2") {
      if (this.eyeActive) return 0.3; // dead calm — the cells stand down
      if (this.squallActive) return 0.95;
      return this.litCell === id ? 0.9 : 0;
    }
    if (id === "static") return this.staticLit || this.ballastActive ? 0.9 : 0;
    if (id === "keel") return this.ballastActive ? 0.9 : 0;
    if (id === "nacelle")
      return this.eyeReady || this.watchLit ? 0.9 : this.routeStep === "nacelle" ? 0.7 : 0.25;
    return 0;
  }

  /** STATIC is lit per ball; both saves ride high while ballast is shed. */
  kickerLit(id: string): boolean {
    if (id === "static") return this.staticLit || this.ballastActive;
    if (id === "keel") return this.ballastActive;
    return true; // the nacelle is always live
  }

  /** THE CHARGE CELLS: lit by charge; both run through a squall; calm in the eye. */
  magnetLit(id: string): boolean {
    if (this.eyeActive) return false;
    if (this.squallActive) return true;
    return this.litCell === id;
  }

  /**
   * Directed fling: the storm delivers the ball to the BAT that makes the
   * next route shot (a straight line at the shot itself would cross the
   * spine rails — simcheck-found). Spine + nacelle are left-bat shots,
   * the circuit entry is the right bat's cross shot.
   */
  magnetFling(id: string): { x: number; y: number } | undefined {
    const cell = id === "cell1" ? { x: 0.2, y: 0.27 } : { x: 0.33, y: 0.255 };
    const bat =
      this.routeStep === "circuit" ? { x: 0.335, y: 0.9 } : { x: 0.185, y: 0.88 };
    if (this.routeStep) return { x: bat.x - cell.x, y: bat.y - cell.y };
    return undefined; // no route / squall chaos: the def's outward fling
  }

  /** STORM GLASS: soft plunge pays and spots a lane. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "stormglass" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return;
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "STORM GLASS");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["STORM GLASS", fmtScore(points)]], 1.4, true), 2);
    const unlit = LANE_IDS.find((l) => !this.litLanes.has(l));
    if (unlit) this.onRollover(unlit);
  }

  onCapture(id: string): void {
    if (this.ctx.scoring.muted) return;
    if (id === "nacelle") {
      if (this.lwActive) return;
      if (this.eyeReady && !this.eyeActive) {
        this.startEye();
        return;
      }
      if (this.routeStep === "nacelle") {
        this.bankStrike();
        return;
      }
      if (this.watchLit) {
        this.startLightning();
        return;
      }
      this.onNacelle();
    } else if (id === "cell1" || id === "cell2") {
      this.onCellGrab(id);
    } else if (id === "static") {
      this.staticLit = false;
      this.ctx.push(new MessageScene([["STATIC", "BALL SAVED"]], 1.1), 2);
    } else if (id === "keel") {
      this.ctx.push(new MessageScene([["THE KEEL", "THROUGH THE HULL"]], 1.1), 2);
    }
  }

  /** A cell grabbed the ball (it flings on its own hold timer): score, and
   * open the storm route — the fling that follows aims at the spine mouth
   * via magnetFling. */
  private onCellGrab(id: string): void {
    if (this.squallActive) {
      this.ctx.scoring.award(rules.squall.jackpot, "CELL JACKPOT");
      this.ctx.sfx("bank");
      return;
    }
    this.ctx.scoring.award(rules.charge.flingPoints, "THE STORM TAKES IT");
    this.ctx.sfx("bank");
    this.ctx.shake(0.004);
    if (this.litCell === id) {
      this.litCell = null;
      if (!this.routeStep) this.startRoute();
    }
  }

  private addCharge(n: number): void {
    if (this.litCell || this.squallActive || this.eyeActive) return;
    this.charge += n;
    if (this.charge >= rules.charge.cellCharge) {
      this.charge = 0;
      this.litCell = this.nextCell;
      this.nextCell = this.nextCell === "cell1" ? "cell2" : "cell1";
      this.ctx.sfx("multiplier");
      const frames = this.ctx.baked("charge");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "A CELL IS CHARGED")
          : new MessageScene([["A CELL IS CHARGED", "THE STORM COMES ABOARD"]], 1.4, true),
        2,
      );
    }
  }

  private onSpin(): void {
    if (this.ctx.scoring.muted) return;
    this.addCharge(rules.charge.spinCharge);
    if (this.routeStep === "spine") {
      // a vane rip is not the spine — no route effect
    }
  }

  // ─────────────── the storm route ───────────────

  private startRoute(): void {
    this.routeStep = "spine";
    this.routeUntil = this.now + rules.route.stepS;
    this.ctx.push(new MessageScene([["STORM ROUTE", "RIDE THE SPINE"]], 1.3, true), 2);
  }

  private advanceRoute(expect: RouteStep, label: string): void {
    if (this.routeStep !== expect) return;
    const i = ROUTE_STEPS.indexOf(expect);
    this.ctx.scoring.award(rules.route.stepPoints, label);
    if (i + 1 < ROUTE_STEPS.length) {
      this.routeStep = ROUTE_STEPS[i + 1];
      this.routeUntil = this.now + rules.route.stepS;
      const next = this.routeStep === "circuit" ? "RIDE THE CIRCUIT" : "SHOOT THE NACELLE";
      this.ctx.push(new MessageScene([["ROUTE HOLDS", next]], 1.2, true), 2);
    }
  }

  private endRoute(silent: boolean): void {
    if (!this.routeStep) return;
    this.routeStep = null;
    this.routeUntil = -Infinity;
    if (!silent) this.ctx.push(new MessageScene([["THE ROUTE CLOSES"]], 1.0), 1);
  }

  private bankStrike(): void {
    this.endRoute(true);
    this.routes++;
    this.strikes++;
    const points = this.ctx.scoring.award(rules.route.strikePoints, "STRIKE BANKED");
    this.ctx.sfx("bank");
    this.ctx.shake(0.005);
    const frames = this.ctx.baked("strike");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `STRIKE ${this.strikes}  ${fmtScore(points)}`)
        : new MessageScene([[`STRIKE ${this.strikes} BANKED`, fmtScore(points)]], 1.4, true),
      2,
    );
    if (this.strikes >= rules.squall.strikesForSquall && !this.squallActive) this.startSquall();
    this.checkEyeReady();
  }

  // ─────────────── the field shots ───────────────

  private onSpine(): void {
    if (this.ctx.scoring.muted) return;
    const factor = this.squallActive ? rules.squall.spineFactor : 1;
    const points = this.ctx.scoring.award(
      rules.spine.points * factor,
      factor > 1 ? "SPINE JACKPOT" : "SPINE RUN",
    );
    this.ctx.scoring.bonusUnits += rules.spine.bonusUnit;
    this.ctx.sfx("rollover");
    this.advanceRoute("spine", "ROUTE: THE SPINE");
    this.ctx.push(new MessageScene([["SPINE RUN", fmtScore(points)]], 1.1), 1);
  }

  private onBallast(): void {
    this.staticLit = true;
    this.ballastUntil = this.now + rules.ballast.ballastS;
    this.ctx.sfx("bank");
    this.ctx.shake(0.005);
    const frames = this.ctx.baked("squall");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "BALLAST AWAY  X2", 1.0)
        : new MessageScene([["BALLAST AWAY", "THE SHIP CLIMBS  X2"]], 1.5, true),
      2,
    );
  }

  private onNacelle(): void {
    const R = rules.nacelle.rungs[this.rungIdx];
    const topped = this.rungIdx === rules.nacelle.rungs.length - 1;
    this.rungIdx = (this.rungIdx + 1) % rules.nacelle.rungs.length;
    const points = this.ctx.scoring.award(R.points, R.name);
    this.ctx.scoring.bonusUnits += rules.nacelle.bonusUnit;
    if (topped) this.watchLit = true; // the glass is falling: watch the sky
    this.ctx.push(new MessageScene([[R.name, fmtScore(points)]], 1.4, true), 2);
  }

  private circuitEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < CIRCUIT_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity;
      this.onCircuit();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onCircuit(): void {
    if (this.ctx.scoring.muted) return;
    const combo = rules.circuitCombo;
    this.circuitStep =
      this.now - this.lastCircuitAt < combo.windowS
        ? Math.min(combo.maxStep, this.circuitStep + 1)
        : 1;
    this.lastCircuitAt = this.now;
    const factor = 2 ** (this.circuitStep - 1);
    this.ctx.scoring.award(
      rules.points.orbit * factor,
      factor > 1 ? `CIRCUIT ×${factor}` : "CIRCUIT",
    );
    this.advanceRoute("circuit", "ROUTE: THE CIRCUIT");
  }

  // ─────────────── squall + the eye ───────────────

  private startSquall(): void {
    this.strikes = 0;
    this.squalled = true;
    this.squallStartTotal = this.ctx.scoring.total;
    this.squallUntil = this.now + rules.squall.durationS;
    this.squallWasActive = true;
    this.endRoute(true);
    this.ctx.addBalls?.(rules.squall.balls);
    this.ctx.bus.emit("mode", { kind: "squallStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("squall");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "SQUALL  X2", 1.0)
        : new MessageScene([["SQUALL", "THE STORM COMES ABOARD  X2"]], 1.6, true),
      3,
    );
    this.checkEyeReady();
  }

  private checkEyeReady(): void {
    if (
      !this.eyeReady &&
      !this.eyeActive &&
      this.squalled &&
      this.routes >= rules.eye.routesRequired &&
      this.ctx.scoring.multiplier >= rules.gale.maxMultiplier
    ) {
      this.eyeReady = true;
      this.ctx.bus.emit("mode", { kind: "eyeReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["THE AIR GOES STILL", "SHOOT THE NACELLE"]], 1.6, true), 2);
    }
  }

  private startEye(): void {
    this.eyeReady = false;
    this.squalled = false;
    this.routes = 0;
    this.eyeStartTotal = this.ctx.scoring.total;
    this.eyeUntil = this.now + rules.eye.durationS;
    this.eyeWasActive = true;
    this.ctx.bus.emit("mode", { kind: "eyeStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("eye");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "DEAD CALM  X2", 1.0)
        : new MessageScene([["THE EYE", "DEAD CALM  ALL LIT  X2"]], 1.6, true),
      3,
    );
  }

  // ─────────────── LIGHTNING WATCH (DMD video mode) ───────────────
  // Strikes charge in a quadrant (port/starboard); the call is the MATCHING
  // flipper before the charge lands. An uncalled strike judges as a miss.
  // Ends at lightning.durationS (sim-safe).

  private lwStrikeAt(i: number): number {
    return 1.6 + i * 2.6;
  }

  private lwCurrent(): "left" | "right" | null {
    const t = this.now - this.lwStart;
    if (this.lwStrike >= this.lwQuadrants.length) return null;
    const at = this.lwStrikeAt(this.lwStrike);
    return t >= at && t <= at + 2.0 ? this.lwQuadrants[this.lwStrike] : null;
  }

  private lwCall(side: "left" | "right"): void {
    const q = this.lwCurrent();
    if (q === null) return;
    const ok = side === q;
    this.lwResults[this.lwStrike] = ok;
    if (ok) {
      this.ctx.scoring.award(rules.lightning.strikeValue, "CALLED IT");
      this.ctx.sfx("rollover");
    } else {
      this.ctx.sfx("target");
    }
    this.lwStrike++;
  }

  private startLightning(): void {
    this.watchLit = false;
    this.lwActive = true;
    this.lwStart = this.now;
    this.lwStrike = 0;
    this.lwQuadrants = Array.from({ length: rules.lightning.strikes }, (_, i) =>
      i % 2 === 0 ? "right" : "left",
    );
    this.lwResults = Array.from({ length: rules.lightning.strikes }, () => null);
    this.ctx.holdScoop?.("nacelle", true);
    this.ctx.sfx("multiplier");
    this.ctx.push(
      new SequenceScene([
        new MessageScene([["LIGHTNING WATCH", "CALL THE QUADRANT"]], 1.4, true),
        new LightningScene(() => {
          const t = this.now - this.lwStart;
          const at = this.lwStrike < this.lwQuadrants.length ? this.lwStrikeAt(this.lwStrike) : 0;
          return {
            active: this.lwActive,
            quadrant: this.lwCurrent(),
            chargeT: Math.max(0, Math.min(1, (t - at) / 2.0)),
            results: this.lwResults,
          };
        }),
      ]),
      3,
    );
  }

  private updateLightning(): void {
    const t = this.now - this.lwStart;
    if (this.lwStrike < this.lwResults.length && t > this.lwStrikeAt(this.lwStrike) + 2.0) {
      this.lwResults[this.lwStrike] = false;
      this.ctx.sfx("target");
      this.lwStrike++;
    }
    if (t >= rules.lightning.durationS) this.endLightning(false);
  }

  private endLightning(abandoned: boolean): void {
    this.lwActive = false;
    this.ctx.holdScoop?.("nacelle", false);
    if (abandoned) return;
    const called = this.lwResults.filter(Boolean).length;
    if (called === this.lwResults.length) {
      this.ctx.push(new MessageScene([["A PERFECT WATCH", "A STRIKE IS BANKED"]], 1.5, true), 3);
      this.strikes++;
      if (this.strikes >= rules.squall.strikesForSquall && !this.squallActive) this.startSquall();
    } else {
      this.ctx.push(new MessageScene([[`CALLED ${called} OF ${this.lwResults.length}`]], 1.3), 3);
    }
  }

  // ─────────────── status (DMD pass) ───────────────

  /** Live ticker for the score readout. */
  dmdStatus(): string | undefined {
    if (this.eyeActive) return `THE EYE ${Math.ceil(this.eyeUntil - this.now)}`;
    if (this.eyeReady) return "SHOOT THE NACELLE";
    if (this.squallActive) return `SQUALL ${Math.ceil(this.squallUntil - this.now)}`;
    if (this.routeStep)
      return `ROUTE  ${this.routeStep.toUpperCase()} ${Math.ceil(this.routeUntil - this.now)}`;
    const letters = ["G", "A", "L", "E"]
      .map((c, i) => (this.litLanes.has(String(i + 1)) ? c : "."))
      .join("");
    return `${letters}  STRIKES ${this.strikes}/${rules.squall.strikesForSquall}`;
  }

  /** Both-flipper progress readout. */
  statusReport(): string[][] {
    const missing =
      `${this.squalled ? "" : "SQUALL "}${this.routes >= rules.eye.routesRequired ? "" : "ROUTES "}${this.ctx.scoring.multiplier >= rules.gale.maxMultiplier ? "" : "MAX X"}`.trim();
    return [
      [
        `CHARGE ${this.litCell ? "CELL LIT" : `${this.charge} OF ${rules.charge.cellCharge}`}`,
        `MULTIPLIER X${this.ctx.scoring.multiplier}`,
      ],
      [
        `STRIKES ${this.strikes} OF ${rules.squall.strikesForSquall}`,
        `ROUTES RUN ${this.routes}`,
      ],
      this.eyeReady
        ? ["THE AIR IS STILL", "SHOOT THE NACELLE"]
        : ["FOR THE EYE", missing || "READY SOON"],
    ];
  }
}
