import type { TableLogic, TableLogicCtx } from "./TableLogic";
import type { DmdScene } from "../render/dmd/DmdScene";
import type { DotMatrix } from "../render/dmd/DotMatrix";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/nightmail/rules.json";

/** Entry→exit (either direction) within this window counts as an Express run. */
const EXPRESS_PAIR_WINDOW = 3.5;
/** Points auto-return to MAIN this long after a mode ends (never mid-mode). */
const LANE_IDS = ["1", "2", "3", "4"] as const;

/**
 * SIGNAL BOX — the M12 DMD video mode. Pure display: NightMailLogic owns
 * every timer and outcome (the headless sims have no DMD, so the mode must
 * resolve without this scene ever updating). The scene draws the junction
 * ladder, the little train, and the lever state from the logic's state.
 */
export class SignalBoxScene implements DmdScene {
  constructor(
    private read: () => {
      active: boolean;
      progress: number; // 0..1 across the ladder
      lever: "left" | "right";
      required: ("left" | "right")[];
      results: (boolean | null)[]; // per junction, null = not reached yet
      cleared: number;
    },
  ) {}

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    if (!s.active) return true;
    dmd.clear();
    // NB: text/set take dot LEVELS 0–4 (dim→hi), not font sizes — level 1
    // is near-black on the smoked glass; keep everything readable at 2+
    // (an early draft at 1/2 made the whole mode look like a dead panel)
    dmd.centerText("SIGNAL BOX", 0, 3);
    // the line: a dotted track with 5 junctions; the train is a 3-dot block
    const y = 16;
    for (let x = 6; x < 122; x += 2) dmd.set(x, y, 2);
    const n = s.required.length;
    for (let i = 0; i < n; i++) {
      const jx = 14 + Math.round((i * 100) / (n - 1));
      const res = s.results[i];
      // junction glyph: switch blade up (left) or down (right); brightness
      // shows the outcome once passed (missed goes dim, cleared goes hot)
      const lv = res === null ? 3 : res ? 4 : 1;
      const dir = s.required[i] === "left" ? -1 : 1;
      for (let k = 0; k <= 3; k++) dmd.set(jx + k, y + k * dir, lv);
    }
    const tx = 6 + Math.round(s.progress * 112);
    for (let k = -2; k <= 2; k++) dmd.set(tx + k, y - 5, 4);
    dmd.set(tx + 3, y - 5, 2); // lamp at the front
    // the lever, as a fat arrow at the left edge — flipper presses must
    // visibly DO something or the whole hold reads as a hang
    const ly = s.lever === "left" ? 9 : 23;
    for (let k = 0; k < 3; k++) {
      dmd.set(1 + k, ly - k, 4);
      dmd.set(1 + k, ly + k, 4);
    }
    dmd.centerText(`LEVER ${s.lever === "left" ? "UP" : "DOWN"}  ${s.cleared} CLEAR`, 25, 3);
    return false;
  }
}

/**
 * The Night Mail ruleset (M12; design truth in the table's BRIEF.md),
 * values from the table's rules JSON:
 *
 * - THE POINTS: every signal-gantry lever (drop target) hit toggles the
 *   diverter MAIN ↔ BRANCH; the summit lamps show the road.
 * - EXPRESS RUN: full Main Line orbits (entry/exit pair); consecutive runs
 *   inside expressCombo.windowS escalate ×2 per step (capped).
 * - TIMETABLE: completing M-A-I-L advances one station (KETTLEBECK →
 *   TERMINUS); the bonus multiplier tracks the station and each completion
 *   lights the BANKER kickback. Letters lane-change on the flippers and
 *   persist across balls (Midway's proven pattern).
 * - EXCHANGE: spinner spins arm the mail-hook magnet; the snag pays
 *   snagPoints × the Express step and spots a Sorting Office rung.
 * - SORTING OFFICE: each scoop capture awards the next mailbag item
 *   (wrapping); the STRONGBOX spots a station and lights SIGNAL BOX; every
 *   capture lights the LOOP LINE (right-outlane subway to the turntable).
 * - SIGNAL BOX (video mode): the scoop holds the ball (holdScoop) while
 *   the flippers pull junction levers ahead of the train on the DMD; all
 *   junctions cleared couples a wagon. Timer-driven — sim-safe.
 * - COUPLING/DEPARTURE: a gantry bank completion lights LOCK; a lit siding
 *   arrival couples a wagon (persists across balls). wagonsRequired coupled
 *   = DEPARTURE: ×scoreFactor scoring with jackpots on the Express and the
 *   branch, the Points auto-toggling every jackpot, the turntable spinning.
 * - THE CONNECTION (wizard): TERMINUS + one DEPARTURE + one snag light the
 *   scoop; shooting it runs durationS of ×scoreFactor with Express jackpots.
 * - Combos and running modes die with the ball; stations, wagons, letters
 *   and lit saves persist across balls, reset per game.
 */
export class NightMailLogic implements TableLogic {
  private now = 0;
  // express pair
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private expressStep = 0;
  private lastExpressAt = -Infinity;
  // timetable
  private litLanes = new Set<string>();
  private skillUsed = false;
  private station = 0;
  private terminus = false;
  // points
  private blade: "main" | "branch" = "main";
  // exchange
  private spins = 0;
  private exchangeLit = false;
  private snags = 0;
  // sorting ladder
  private sortIdx = 0;
  private signalBoxLit = false;
  // coupling
  private lockLit = false;
  private wagons = 0;
  private departures = 0;
  private departureUntil = -Infinity;
  private departureWasActive = false;
  // wizard
  private connectionReady = false;
  private connectionUntil = -Infinity;
  private connectionWasActive = false;
  // outlanes
  private bankerLit = false;
  private loopLit = false;
  // signal box video mode
  private sbActive = false;
  private sbStart = 0;
  private sbLever: "left" | "right" = "left";
  private sbRequired: ("left" | "right")[] = [];
  private sbResults: (boolean | null)[] = [];
  private sbCleared = 0;
  private departureStartTotal = 0;
  private connectionStartTotal = 0;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind, id }) => {
      if (kind === "ramp-entry") this.expressEnd("entry");
      else if (kind === "ramp-exit") this.expressEnd("exit");
      else if (kind === "lane" && id === "branch") this.onBranch();
    });
    ctx.bus.on("hit", ({ kind }) => {
      // every signal lever pulled throws the points — the table's brain
      if (kind === "target") this.blade = this.blade === "main" ? "branch" : "main";
    });
    ctx.bus.on("spinnerTick", () => {
      if (this.exchangeLit || this.ctx.scoring.muted) return;
      this.spins++;
      if (this.spins >= rules.exchange.spinsToLight) {
        this.exchangeLit = true;
        this.ctx.sfx("multiplier");
        this.ctx.push(new MessageScene([["EXCHANGE IS SET", "CATCH THE MAILS"]], 1.3, true), 1);
      }
    });
    ctx.bus.on("bankComplete", () => {
      if (this.ctx.scoring.muted) return;
      this.lockLit = true;
      const frames = this.ctx.baked("gantry");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "LOCK IS LIT")
          : new MessageScene([["SIGNALS CLEARED", "LOCK IS LIT"]], 1.3),
        1,
      );
    });
  }

  get departureActive(): boolean {
    return this.now < this.departureUntil;
  }

  get connectionActive(): boolean {
    return this.now < this.connectionUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.sbActive) this.updateSignalBox();
    if (this.departureWasActive && !this.departureActive) {
      this.departureWasActive = false;
      if (!this.connectionActive) this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "departureEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["RIGHT AWAY", "DRIVER"],
            ["DEPARTURE TOTAL", fmtScore(this.ctx.scoring.total - this.departureStartTotal)],
          ],
          1.4,
        ),
        2,
      );
      this.checkConnectionReady();
    }
    if (this.connectionWasActive && !this.connectionActive) {
      this.connectionWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "connectionEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["THE MAILS", "GO THROUGH"],
            ["CONNECTION TOTAL", fmtScore(this.ctx.scoring.total - this.connectionStartTotal)],
          ],
          1.6,
        ),
        2,
      );
    }
  }

  endBall(): void {
    this.skillUsed = false;
    this.expressStep = 0;
    this.lastExpressAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    // timetable letters PERSIST across balls (brief §3); modes die
    if (this.sbActive) this.endSignalBox(true);
    if (this.departureActive) {
      this.departureUntil = -Infinity;
      this.departureWasActive = false;
      this.ctx.bus.emit("mode", { kind: "departureEnd" });
    }
    if (this.connectionActive) {
      this.connectionUntil = -Infinity;
      this.connectionWasActive = false;
      this.ctx.bus.emit("mode", { kind: "connectionEnd" });
    }
    this.ctx.scoring.eclipseFactor = 1;
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.station = 0;
    this.terminus = false;
    this.blade = "main";
    this.spins = 0;
    this.exchangeLit = false;
    this.snags = 0;
    this.sortIdx = 0;
    this.signalBoxLit = false;
    this.lockLit = false;
    this.wagons = 0;
    this.departures = 0;
    this.bankerLit = false;
    this.loopLit = false;
    this.connectionReady = false;
  }

  /** M-A-I-L lanes: all four advance the timetable + light the banker. */
  onRollover(id: string): void {
    this.spotLetter(id);
  }

  private spotLetter(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      const T = rules.timetable;
      this.station = Math.min(this.station + 1, T.stations.length);
      if (this.station === T.stations.length) this.terminus = true;
      this.ctx.scoring.multiplier = Math.min(this.station + 1, T.maxMultiplier);
      this.bankerLit = true;
      this.ctx.sfx("multiplier");
      const caption = `${T.stations[this.station - 1]}  X${this.ctx.scoring.multiplier}`;
      const frames = this.ctx.baked("board");
      this.ctx.push(
        frames ? new BakedDmdScene(frames, 8, caption) : new MessageScene([[caption]], 1.4, true),
        2,
      );
      this.checkConnectionReady();
    }
  }

  /** THE SIGNAL: soft plunge peaking in the lane band. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "signal" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return; // tilted
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "THE SIGNAL");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["THE SIGNAL", fmtScore(points)]], 1.4, true), 2);
    // spot one uncollected timetable letter (shared completion logic)
    const unlit = ["1", "2", "3", "4"].find((m) => !this.litLanes.has(m));
    if (unlit) this.spotLetter(unlit);
  }

  /** Classic lane change: flippers rotate the collected letters. */
  onFlipper(side: "left" | "right"): void {
    if (this.sbActive) {
      this.sbLever = side;
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
    if (id === "pmain") return this.blade === "main" ? 1 : 0;
    if (id === "pbranch") return this.blade === "branch" ? 1 : 0;
    if (id === "lock") return this.lockLit ? 1 : 0;
    if (id === "banker") return this.bankerLit ? 1 : 0;
    if (id === "loop") return this.loopLit ? 1 : 0;
    const n = Number(id.replace(/\D/g, ""));
    return n > 0 && n <= this.station ? 1 : 0;
  }

  kickerLit(id: string): boolean {
    if (id === "banker") return this.bankerLit;
    if (id === "loop") return this.loopLit;
    if (id === "siding") return this.lockLit || this.departureActive;
    return true; // sorting office + incline are always live
  }

  /** M12 hooks: the diverter/magnet/disc read their state from here. */
  diverterBlade(): "main" | "branch" {
    return this.blade;
  }

  magnetLit(): boolean {
    return this.exchangeLit;
  }

  discSpin(): number {
    return this.departureActive || this.connectionActive ? 7 : 0;
  }

  onCapture(id: string): void {
    if (id === "sorting") this.onSorting();
    else if (id === "incline") {
      if (this.ctx.scoring.muted) return;
      this.ctx.scoring.award(rules.incline.points, "BANKING ENGINE");
      this.ctx.scoring.bonusUnits += rules.incline.bonusUnit;
      const frames = this.ctx.baked("incline");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "BANKING ENGINE ON")
          : new MessageScene([["BANKING ENGINE", "COUPLED ON"]], 1.2),
      );
    } else if (id === "hook") this.onSnag();
    else if (id === "siding") this.onSiding();
    else if (id === "banker") {
      this.bankerLit = false;
      this.ctx.push(new MessageScene([["THE BANKER", "SHOVES YOU CLEAR"]], 1.2), 2);
    } else if (id === "loop") {
      this.loopLit = false;
      const frames = this.ctx.baked("loop");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "THE LOOP LINE")
          : new MessageScene([["THE LOOP LINE", "ROUND THE ROUNDHOUSE"]], 1.2),
        2,
      );
    }
  }

  /** A ball tipped through the Points onto the exchange lane. */
  private onBranch(): void {
    if (this.ctx.scoring.muted) return;
    if (this.departureActive || this.connectionActive) {
      this.jackpot("BRANCH JACKPOT");
      return;
    }
    this.ctx.scoring.award(rules.branch.points, "THE BRANCH");
    this.ctx.scoring.bonusUnits += rules.branch.bonusUnit;
  }

  /** The mail hook snagged the ball at speed. */
  private onSnag(): void {
    this.exchangeLit = false;
    this.spins = 0;
    if (this.ctx.scoring.muted) return;
    this.snags++;
    const step = Math.max(1, this.expressStep);
    const points = rules.exchange.snagPoints * step;
    this.ctx.scoring.award(points, step > 1 ? `SNAG X${step}` : "MAIL SNAGGED");
    this.ctx.scoring.bonusUnits += rules.exchange.bonusUnit;
    this.sortIdx = (this.sortIdx + 1) % rules.sorting.items.length; // spots a rung
    const frames = this.ctx.baked("exchange");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 10, `ON THE FLY ${fmtScore(points)}`)
        : new MessageScene([["MAIL SNAGGED", fmtScore(points)]], 1.4),
      2,
    );
    this.checkConnectionReady();
  }

  /** Sorting Office capture: wizard start > video mode > mailbag ladder. */
  private onSorting(): void {
    this.loopLit = true;
    if (this.ctx.scoring.muted) return;
    if (this.connectionReady && !this.connectionActive) {
      this.startConnection();
      return;
    }
    if (this.signalBoxLit && !this.sbActive) {
      this.startSignalBox();
      return;
    }
    const S = rules.sorting;
    const item = S.items[this.sortIdx];
    const strongbox = this.sortIdx === S.items.length - 1;
    this.sortIdx = (this.sortIdx + 1) % S.items.length;
    const points = this.ctx.scoring.award(item.points, item.name);
    this.ctx.scoring.bonusUnits += S.bonusUnit;
    if (strongbox) {
      const T = rules.timetable;
      this.station = Math.min(this.station + 1, T.stations.length);
      if (this.station === T.stations.length) this.terminus = true;
      this.ctx.scoring.multiplier = Math.min(this.station + 1, T.maxMultiplier);
      this.signalBoxLit = true;
      this.checkConnectionReady();
    }
    const frames = this.ctx.baked("sorting");
    const reveal = frames
      ? new BakedDmdScene(frames, 8, `${item.name} ${fmtScore(points)}`)
      : new MessageScene([[item.name, fmtScore(points)]], 1.6, true);
    this.ctx.push(
      strongbox
        ? new SequenceScene([reveal, new MessageScene([["SIGNAL BOX", "IS LIT"]], 1.0, true)])
        : reveal,
      2,
    );
  }

  /** A lit siding arrival: couple a wagon (or pay jackpot mid-DEPARTURE).
   * With the engine's physical locks (Game) the wagon PARKS visibly on the
   * siding berth and a fresh ball is served; the headless sims have no
   * lockBall and keep the virtual clunk-and-release. */
  private onSiding(): void {
    if (this.ctx.scoring.muted) return;
    if (this.departureActive) {
      this.jackpot("COUPLING JACKPOT");
      return;
    }
    this.lockLit = false;
    this.wagons++;
    if (this.wagons < rules.departure.wagonsRequired) {
      // berths sit on the siding apron beside the lane, stacked up-table
      const berth = { x: 0.15, y: 0.362 - 0.032 * (this.wagons - 1) };
      this.ctx.lockBall?.("siding", berth);
    }
    const frames = this.ctx.baked("coupling");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 9, `WAGON ${this.wagons} COUPLED`)
        : new MessageScene([[`WAGON ${this.wagons}`, "COUPLED"]], 1.3),
      2,
    );
    this.ctx.shake(0.003);
    if (this.wagons >= rules.departure.wagonsRequired) this.startDeparture();
  }

  private expressEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < EXPRESS_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity; // consume the pair
      this.onExpress();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onExpress(): void {
    if (this.departureActive || this.connectionActive) {
      this.jackpot(this.connectionActive ? "CONNECTION JACKPOT" : "EXPRESS JACKPOT");
      return;
    }
    const combo = rules.expressCombo;
    this.expressStep =
      this.now - this.lastExpressAt < combo.windowS
        ? Math.min(combo.maxStep, this.expressStep + 1)
        : 1;
    this.lastExpressAt = this.now;
    const factor = 2 ** (this.expressStep - 1);
    const points = rules.points.orbit * factor;
    const label = factor > 1 ? `EXPRESS X${factor}` : "EXPRESS RUN";
    if (this.ctx.scoring.award(points, label) > 0) {
      const frames = this.ctx.baked("tunnel");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 11, `${label} ${fmtScore(points)}`)
          : new MessageScene([[label, fmtScore(points)]], 1.2),
        1,
      );
    }
  }

  /** Mode jackpot: pays, and the Points throw themselves — the shot you
   * just made becomes the other shot (the DEPARTURE/CONNECTION mechanic). */
  private jackpot(label: string): void {
    const value = this.connectionActive ? rules.connection.jackpot : rules.departure.jackpot;
    this.ctx.scoring.award(value, label);
    this.blade = this.blade === "main" ? "branch" : "main";
    this.ctx.sfx("bank");
    const frames = this.ctx.baked("connection");
    if (frames && this.connectionActive)
      this.ctx.push(new BakedDmdScene(frames, 9, `JACKPOT ${fmtScore(value)}`), 2);
    else this.ctx.push(new MessageScene([[label, fmtScore(value)]], 1.1), 2);
  }

  private startDeparture(): void {
    this.wagons = 0;
    this.departures++;
    this.departureStartTotal = this.ctx.scoring.total;
    this.departureUntil = this.now + rules.departure.durationS;
    this.departureWasActive = true;
    // the full consist departs (M12 3-ball multiball): the physically
    // parked wagons rejoin play; any shortfall (virtual couplings, e.g.
    // SIGNAL BOX wagons) is topped up with served extras. The headless
    // sims have neither seam and stay single-ball.
    const released = this.ctx.releaseLocks?.() ?? 0;
    if (released < 2) this.ctx.addBalls?.(2 - released, { x: 0.095, y: 0.375 }, { x: 0.5, y: 1.4 });
    this.ctx.scoring.eclipseFactor = rules.departure.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "departureStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("coupling");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `DEPARTURE  X${rules.departure.scoreFactor}`, 1.0)
        : new MessageScene(
            [["DEPARTURE", `ALL SCORES X${rules.departure.scoreFactor}`]],
            1.5,
            true,
          ),
      3,
    );
  }

  private checkConnectionReady(): void {
    if (
      !this.connectionReady &&
      !this.connectionActive &&
      this.terminus &&
      this.departures >= 1 &&
      this.snags >= 1
    ) {
      this.connectionReady = true;
      this.ctx.bus.emit("mode", { kind: "connectionReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(
        new MessageScene([["THE DAWN TRAIN WAITS", "SHOOT THE SORTING OFFICE"]], 1.6, true),
        2,
      );
    }
  }

  private startConnection(): void {
    this.connectionReady = false;
    this.terminus = false;
    this.departures = 0;
    this.snags = 0;
    this.connectionStartTotal = this.ctx.scoring.total;
    this.connectionUntil = this.now + rules.connection.durationS;
    this.connectionWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.connection.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "connectionStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("connection");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `THE CONNECTION  X${rules.connection.scoreFactor}`, 1.0)
        : new MessageScene(
            [["THE CONNECTION", `ALL SCORES X${rules.connection.scoreFactor}`]],
            1.5,
            true,
          ),
      3,
    );
  }

  // ─────────────────── SIGNAL BOX (M12 video mode) ───────────────────
  // Timer-driven: junction i resolves at sbStart + 2.2 + i×1.6 (the first
  // AFTER the 1.4 s intro card — the player must see the ladder before it
  // starts judging); the whole mode ends at rules.signalBox.durationS
  // regardless of the DMD, so the headless sims (no DotMatrix) release the
  // held ball on schedule.

  private startSignalBox(): void {
    this.signalBoxLit = false;
    this.sbActive = true;
    this.sbStart = this.now;
    this.sbLever = "left";
    this.sbCleared = 0;
    const n = rules.signalBox.junctions;
    this.sbRequired = Array.from({ length: n }, () => (Math.random() < 0.5 ? "left" : "right"));
    this.sbResults = Array.from({ length: n }, () => null);
    this.ctx.holdScoop?.("sorting", true);
    this.ctx.sfx("multiplier");
    this.ctx.push(
      new SequenceScene([
        // 21 glyphs max on the second row: 128 dots / 6-per-glyph
        new MessageScene([["SIGNAL BOX", "FLIPPERS SET THE ROAD"]], 1.4, true),
        new SignalBoxScene(() => ({
          active: this.sbActive,
          progress: Math.min(1, Math.max(0, (this.now - this.sbStart - 2.2) / (1.6 * (rules.signalBox.junctions - 1) + 0.8))),
          lever: this.sbLever,
          required: this.sbRequired,
          results: this.sbResults,
          cleared: this.sbCleared,
        })),
      ]),
      3,
    );
  }

  private updateSignalBox(): void {
    const t = this.now - this.sbStart;
    for (let i = 0; i < this.sbRequired.length; i++) {
      if (this.sbResults[i] === null && t >= 2.2 + i * 1.6) {
        const ok = this.sbLever === this.sbRequired[i];
        this.sbResults[i] = ok;
        if (ok) {
          this.sbCleared++;
          this.ctx.scoring.award(rules.signalBox.junctionValue, "JUNCTION CLEAR");
          this.ctx.sfx("rollover");
        } else {
          this.ctx.sfx("target");
        }
      }
    }
    if (t >= rules.signalBox.durationS) this.endSignalBox(false);
  }

  private endSignalBox(abandoned: boolean): void {
    this.sbActive = false;
    this.ctx.holdScoop?.("sorting", false);
    if (abandoned) return;
    const all = this.sbCleared === this.sbRequired.length;
    if (all && rules.signalBox.clearAllWagon) {
      this.ctx.push(
        new MessageScene([["ALL SIGNALS CLEAR", "WAGON COUPLED"]], 1.5, true),
        3,
      );
      this.lockLit = false;
      this.wagons++;
      if (this.wagons >= rules.departure.wagonsRequired) this.startDeparture();
    } else {
      this.ctx.push(
        new MessageScene([[`${this.sbCleared} JUNCTIONS`, "CLEARED"]], 1.3),
        3,
      );
    }
  }

  /** Live ticker for the score readout (DMD pass). */
  dmdStatus(): string | undefined {
    if (this.connectionActive) return `CONNECTION ${Math.ceil(this.connectionUntil - this.now)}`;
    if (this.connectionReady) return "SHOOT THE SORTING";
    if (this.departureActive) return `DEPARTURE ${Math.ceil(this.departureUntil - this.now)}`;
    const letters = ["M", "A", "I", "L"].map((c, i) => (this.litLanes.has(String(i + 1)) ? c : ".")).join("");
    return `${letters}  WAGONS ${this.wagons}/${rules.departure.wagonsRequired}`;
  }

  /** Both-flipper progress readout (DMD pass). */
  statusReport(): string[][] {
    const missing =
      `${this.terminus ? "" : "TERMINUS "}${this.departures >= 1 ? "" : "DEPART "}${this.snags >= 1 ? "" : "SNAG"}`.trim();
    return [
      [
        `STATION ${this.station} OF ${rules.timetable.stations.length}`,
        `MULTIPLIER X${this.ctx.scoring.multiplier}`,
      ],
      [
        `WAGONS ${this.wagons} OF ${rules.departure.wagonsRequired}`,
        this.lockLit ? "THE LOCK IS LIT" : "HIT THE GANTRY",
      ],
      this.connectionReady
        ? ["THE DAWN TRAIN WAITS", "SHOOT THE SORTING"]
        : ["FOR THE CONNECTION", missing || "READY SOON"],
    ];
  }
}
