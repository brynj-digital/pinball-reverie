import type { TableLogic, TableLogicCtx } from "./TableLogic";
import type { DmdScene } from "../render/dmd/DmdScene";
import type { DotMatrix } from "../render/dmd/DotMatrix";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/midway/rules.json";

/**
 * RING THE BELL — the DMD video mode (SIGNAL BOX pattern: pure display;
 * the logic owns every timer and outcome, sim-safe).
 */
export class BellGameScene implements DmdScene {
  constructor(
    private read: () => {
      active: boolean;
      power: number; // 0..1 meter position
      results: (number | null)[]; // 0 miss, 1 fair, 2 strong, 3 ding
    },
  ) {}

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    if (!s.active) return true;
    dmd.clear();
    dmd.centerText("RING THE BELL", 0, 3);
    // the tower: a vertical track at centre with the puck at power height
    const x = 64;
    for (let y = 8; y <= 28; y++) dmd.set(x, y, 1);
    dmd.set(x - 2, 8, 4);
    dmd.set(x + 2, 8, 4);
    dmd.set(x, 7, 4); // the bell
    const py = 28 - Math.round(s.power * 19);
    for (let k = -2; k <= 2; k++) dmd.set(x + k, py, 4);
    // swing results as bells bottom-left
    s.results.forEach((r, i) => {
      const bx = 12 + i * 10;
      const lv = r === null ? 1 : r >= 3 ? 4 : r >= 2 ? 3 : 2;
      dmd.set(bx, 28, lv);
      dmd.set(bx - 1, 29, lv);
      dmd.set(bx + 1, 29, lv);
    });
    return false;
  }
}

/** Entry→exit (either direction) within this window counts as a Sky Ride loop. */
const SKYRIDE_PAIR_WINDOW = 3.5;
/** A striker swing older than this can't claim a WEAK on roll-back. */
const SWING_WINDOW = 3;

/**
 * The Midnight Midway ruleset (design truth in the table's BRIEF.md),
 * values from the table's rules JSON:
 *
 * - SKY RIDE: full orbit loops; consecutive loops inside skyRideCombo.windowS
 *   escalate ×2 per step; a passChain-deep chain punches the ride pass.
 * - P-A-R-K: completing the lanes loads a ferris-wheel gondola and lights
 *   the HAND STAMP kickback (left outlane, one save).
 * - FERRIS WHEEL: gondolas (P-A-R-K completions, striker DINGs, the PANDA)
 *   fill the ring; a full wheel turns — bonus multiplier steps, ring resets.
 * - COASTER: a full circuit (drop-off sensor) pays coaster points and
 *   punches the pass; during FIREWORKS it pays the jackpot instead.
 * - HIGH STRIKER: the mallet's shot. Timing gates a→b grade the swing
 *   (DING / STRONG / FAIR); a roll-back without reaching b is WEAK. DING
 *   loads a gondola; STRONG or better punches the pass.
 * - GHOST TRAIN: the under-field subway; each transit punches the pass.
 * - DROP TOWER: bank complete lights the PRIZE BOOTH and punches the pass.
 * - PRIZE BOOTH: each lit capture awards the next prize (wrapping); every
 *   capture lights the CHICKEN EXIT (right-outlane subway to the queue).
 * - FIREWORKS FINALE: punch all five rides to light the booth for the
 *   finale; shooting it starts durationS of ×scoreFactor scoring with
 *   coasterJackpot circuits.
 * - Combos, a live swing and a running finale die with the ball; gondolas,
 *   wheel turns, pass punches, collected P-A-R-K letters and lit states
 *   persist, reset per game.
 * - LANE CHANGE: any main-flipper press rotates the collected letters
 *   across the four lanes (left ← / right →), so one repeatable feed —
 *   the striker drop-off or a dying Sky Ride loop — can finish the set.
 */
export class MidwayLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private comboStep = 0;
  private lastLoopAt = -Infinity;
  private litLanes = new Set<string>();
  private gondolas = 0;
  private wheelTurns = 0;
  private skillUsed = false;
  private bellLit = false;
  private bgActive = false;
  private bgStart = 0;
  private bgResults: (number | null)[] = [];
  private bgSwing = 0;
  private finaleStartTotal = 0;
  private prizeIdx = 0;
  private boothLit = false;
  private chickenLit = false;
  private stampLit = false;
  /** The ghost train's turnstile. CLOSED at ball start; relightSpins turnstile
   * spins open it for one ride, then a ride closes it again — so the dark ride
   * only ever takes the ball when the player has opted in (it used to be
   * always-on, which walled the top half off). */
  private ghostLit = false;
  private turnstileSpins = 0;
  private pass = new Set<string>();
  fireworksReady = false;
  private fireworksUntil = -Infinity;
  private fireworksWasActive = false;
  // striker swing state
  private swingActive = false;
  private swingScored = false;
  private aAt = -Infinity;

  /** Rides only count when boarded at the mouth (both coaster ends sit at
   * ground height, so a stray can attach at the drop-off too). */
  private coasterFromMouth = false;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind, id }) => {
      if (kind === "ramp-entry") this.loopEnd("entry");
      else if (kind === "ramp-exit") this.loopEnd("exit");
      else if (kind === "lane") {
        if (id === "striker-a") this.onStrikerA();
        else if (id === "striker-b") this.onStrikerB();
      } else if (kind === "spinner") this.onTurnstile();
    });
    // M11: rides are surface events — the ball genuinely boards and leaves
    ctx.bus.on("surface", ({ from, to, x }) => {
      if (to === "striker") this.onSwingStart();
      else if (from === "striker") {
        // rolled back out over the mallet (the bell end exits airborne
        // far left; the mouth sits over the bat at x ≈ 0.47)
        if (x > 0.35) this.onSwingBack();
        else this.swingReset();
      } else if (to === "coaster") {
        this.coasterFromMouth = x < 0.3;
      } else if (from === "coaster") {
        if (x > 0.35 && this.coasterFromMouth) this.onCoaster();
        this.coasterFromMouth = false;
      }
    });
    ctx.bus.on("bankComplete", () => {
      if (this.ctx.scoring.muted) return;
      this.boothLit = true;
      this.punch("tower");
      const frames = this.ctx.baked("tower");
      const drop = frames
        ? new SequenceScene([
            new BakedDmdScene(frames, 9, "TOWER DROPPED"),
            new MessageScene([["PRIZE BOOTH LIT"]], 1.0, true),
          ])
        : new MessageScene([["TOWER DROPPED", "PRIZE BOOTH LIT"]], 1.4);
      this.ctx.push(drop, 2);
    });
  }

  get fireworksActive(): boolean {
    return this.now < this.fireworksUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.bgActive) this.updateBellGame();
    if (this.fireworksWasActive && !this.fireworksActive) {
      this.fireworksWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "fireworksEnd" });
      this.ctx.push(
        new MessageScene(
          [["THE SMOKE CLEARS", "GOODNIGHT"], ["FINALE TOTAL", fmtScore(this.ctx.scoring.total - this.finaleStartTotal)]],
          1.4,
        ),
        2,
      );
    }
  }

  endBall(): void {
    if (this.bgActive) this.endBellGame(true);
    this.skillUsed = false;
    this.comboStep = 0;
    this.lastLoopAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    // collected letters survive the drain — the lanes are the table's
    // hardest real estate, and losing them per ball made P-A-R-K a fantasy
    this.swingActive = false;
    this.swingScored = false;
    this.aAt = -Infinity;
    // the next ball starts with the dark ride CLOSED — the turnstile must be
    // spun to open it, so the ghost never takes the ball uninvited
    this.ghostLit = false;
    this.turnstileSpins = 0;
    if (this.fireworksActive) {
      this.fireworksUntil = -Infinity;
      this.fireworksWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "fireworksEnd" });
    }
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.gondolas = 0;
    this.wheelTurns = 0;
    this.prizeIdx = 0;
    this.boothLit = false;
    this.chickenLit = false;
    this.stampLit = false;
    this.pass.clear();
    this.fireworksReady = false;
  }

  /** P-A-R-K lanes: all four load a gondola + light the hand stamp. */
  onRollover(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      this.stampLit = true;
      this.ctx.sfx("multiplier");
      this.loadGondola("P-A-R-K");
    }
  }

  laneLit(id: string): number {
    return this.litLanes.has(id) ? 0.55 : 0;
  }

  /** Lane change: a flipper press rotates the collected letters across the
   * lanes, so the player can line an unlit lane up under a repeatable feed. */
  onFlipper(side: "left" | "right"): void {
    if (this.bgActive) {
      this.bgSwingNow();
      return;
    }
    if (this.litLanes.size === 0 || this.litLanes.size === 4) return;
    const ids = ["1", "2", "3", "4"];
    const shift = side === "right" ? 1 : ids.length - 1;
    const rotated = new Set<string>();
    for (const id of this.litLanes) rotated.add(ids[(ids.indexOf(id) + shift) % ids.length]);
    this.litLanes = rotated;
  }

  /** Gondola inserts g1..g5 lit while loaded on the current ring; the
   * outlane save inserts mirror their kickback/subway lit state. */
  lamp(id: string): number {
    if (id === "stamp") return this.stampLit ? 1 : 0;
    if (id === "chicken") return this.chickenLit ? 1 : 0;
    if (id === "ghost") return this.ghostLit ? 1 : 0;
    const n = Number(id.replace(/\D/g, ""));
    return n > 0 && n <= this.gondolas ? 1 : 0;
  }

  kickerLit(id: string): boolean {
    if (id === "booth") return this.boothLit || this.fireworksReady;
    if (id === "stamp") return this.stampLit;
    if (id === "chicken") return this.chickenLit;
    if (id === "ghost") return this.ghostLit; // gated by the turnstile light
    return true;
  }

  /** Turnstile spins re-open the dark ride once its light has been spent. */
  private onTurnstile(): void {
    if (this.ghostLit) return;
    if (++this.turnstileSpins >= rules.ghostTrain.relightSpins) {
      this.ghostLit = true;
      this.turnstileSpins = 0;
    }
  }

  /** Game confirmed a kicker/subway capture (awards live here, not on the
   * raw sensor, so a cooldown re-trigger can't double-award). */
  onCapture(id: string): void {
    if (id === "booth" && this.bellLit && !this.bgActive && !this.ctx.scoring.muted) {
      this.startBellGame();
      return;
    }
    if (id === "booth" && this.bgActive) return;
    if (id === "booth") this.onBooth();
    else if (id === "ghost") {
      // the ride is spent; the turnstile must be spun to re-open it
      this.ghostLit = false;
      this.turnstileSpins = 0;
      if (this.ctx.scoring.muted) return;
      this.ctx.scoring.award(rules.ghostTrain.points, "GHOST TRAIN");
      this.ctx.scoring.bonusUnits += rules.ghostTrain.bonusUnit;
      this.punch("ghost");
      const frames = this.ctx.baked("ghost");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, `GHOST TRAIN ${fmtScore(rules.ghostTrain.points)}`)
          : new MessageScene([["GHOST TRAIN"]], 1.0),
      );
    } else if (id === "stamp") {
      this.stampLit = false;
      const frames = this.ctx.baked("stamp");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, "BACK IN THE PARK")
          : new MessageScene([["HAND STAMP", "BACK IN THE PARK"]], 1.2),
        2,
      );
    } else if (id === "chicken") {
      this.chickenLit = false;
      const frames = this.ctx.baked("chicken");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, "CHICKEN EXIT")
          : new MessageScene([["CHICKEN EXIT", "BACK TO THE QUEUE"]], 1.2),
        2,
      );
    }
  }

  /** Prize booth capture: the finale if it's lit, else the next prize. */
  private onBooth(): void {
    if (this.ctx.scoring.muted) return; // tilted: no prizes, no progression
    if (this.fireworksReady) {
      this.startFireworks();
      return;
    }
    this.boothLit = false;
    const B = rules.prizeBooth;
    const prize = B.prizes[this.prizeIdx];
    const last = this.prizeIdx === B.prizes.length - 1;
    this.prizeIdx = (this.prizeIdx + 1) % B.prizes.length;
    if (this.prizeIdx === 0) this.bellLit = true; // every prize won: swing
    const points = this.ctx.scoring.award(prize.points, prize.name);
    this.ctx.scoring.bonusUnits += B.bonusUnit;
    this.chickenLit = true;
    this.ctx.bus.emit("telescope", { name: prize.name, points, spotted: last });
    // the ball sits captive under the canopy while this plays
    const frames = this.ctx.baked("booth");
    const reveal = frames
      ? new BakedDmdScene(frames, 8, `${prize.name} ${fmtScore(points)}`)
      : new MessageScene([[prize.name, fmtScore(points)]], 1.6, true);
    this.ctx.push(reveal, 2);
    if (last && B.lastLoadsGondola) this.loadGondola(prize.name);
  }

  /** Full coaster circuit (drop-off sensor into the right inlane). */
  private onCoaster(): void {
    if (this.ctx.scoring.muted) return;
    const jackpot = this.fireworksActive;
    const points = jackpot ? rules.fireworks.coasterJackpot : rules.coaster.points;
    this.ctx.scoring.award(points, jackpot ? "COASTER JACKPOT" : "COASTER");
    this.ctx.scoring.bonusUnits += rules.coaster.bonusUnit;
    this.punch("coaster");
    const frames = this.ctx.baked("coaster");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 10, `${jackpot ? "JACKPOT" : "COASTER"} ${fmtScore(points)}`)
        : new MessageScene([[jackpot ? "COASTER JACKPOT" : "COASTER", fmtScore(points)]], 1.2),
      jackpot ? 2 : 1,
    );
  }

  // ── the high striker ──

  private onSwingStart(): void {
    this.swingActive = true;
    this.swingScored = false;
    this.aAt = -Infinity;
  }

  private onStrikerA(): void {
    // first upward crossing only — the roll-back re-cross must not re-arm
    if (this.swingActive && this.aAt === -Infinity) this.aAt = this.now;
  }

  private onStrikerB(): void {
    if (!this.swingActive || this.swingScored || this.aAt === -Infinity) return;
    this.swingScored = true;
    const dt = this.now - this.aAt;
    const S = rules.striker;
    const tier =
      dt < S.dingS ? "DING" : dt < S.strongS ? "STRONG" : "FAIR";
    const points = tier === "DING" ? S.points.ding : tier === "STRONG" ? S.points.strong : S.points.fair;
    if (this.ctx.scoring.muted) return;
    this.ctx.scoring.award(points, tier === "DING" ? "DING!" : `${tier} SWING`);
    this.ctx.scoring.bonusUnits += S.bonusUnit;
    this.ctx.sfx(tier === "DING" ? "bank" : "target");
    this.ctx.bus.emit("mode", { kind: `striker${tier}` });
    if (tier !== "FAIR") this.punch("striker");
    const frames = this.ctx.baked("striker");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 12, `${tier === "DING" ? "DING!" : tier} ${fmtScore(points)}`)
        : new MessageScene([[tier === "DING" ? "DING!" : `${tier} SWING`, fmtScore(points)]], 1.2),
      2,
    );
    if (tier === "DING") this.loadGondola("DING");
  }

  /** Roll-back out of the striker lane: a swing that never rang anything. */
  private onSwingBack(): void {
    if (this.swingActive && !this.swingScored && this.now - this.aAt < SWING_WINDOW) {
      if (!this.ctx.scoring.muted) {
        this.ctx.scoring.award(rules.striker.points.weak, "WEAK SWING");
        this.ctx.push(new MessageScene([["WEAK SWING", "PUT YOUR BACK IN IT"]], 1.0));
      }
    }
    this.swingReset();
  }

  private swingReset(): void {
    this.swingActive = false;
    this.swingScored = false;
    this.aAt = -Infinity;
  }

  // ── the ferris wheel ──

  /** TEST YOUR STRENGTH: soft plunge peaking in the lane band. Once per
   * ball; pays and loads a gondola. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "strength" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return; // tilted
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "TEST YOUR STRENGTH");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["TEST YOUR STRENGTH", fmtScore(points)]], 1.4, true), 2);
    this.loadGondola("SKILL SHOT");
  }

  private loadGondola(source: string): void {
    this.gondolas++;
    const W = rules.ferrisWheel;
    if (this.gondolas < W.gondolas) {
      this.ctx.push(
        new MessageScene([[source, `GONDOLA ${this.gondolas} OF ${W.gondolas}`]], 1.2),
        1,
      );
      return;
    }
    this.gondolas = 0;
    this.wheelTurns++;
    this.ctx.scoring.multiplier = Math.min(this.wheelTurns + 1, W.maxMultiplier);
    this.ctx.sfx("multiplier");
    const caption = `WHEEL TURNS  X${this.ctx.scoring.multiplier}`;
    const frames = this.ctx.baked("wheel");
    this.ctx.push(
      frames ? new BakedDmdScene(frames, 8, caption) : new MessageScene([[caption]], 1.4, true),
      2,
    );
  }

  // ── the sky ride ──

  private loopEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < SKYRIDE_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity; // consume the pair
      this.onSkyRide();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onSkyRide(): void {
    const combo = rules.skyRideCombo;
    this.comboStep =
      this.now - this.lastLoopAt < combo.windowS ? Math.min(combo.maxStep, this.comboStep + 1) : 1;
    this.lastLoopAt = this.now;
    if (this.comboStep >= combo.passChain) this.punch("skyride");
    const factor = 2 ** (this.comboStep - 1);
    const points = rules.points.orbit * factor;
    const label = factor > 1 ? `SKY RIDE X${factor}` : "SKY RIDE";
    if (this.ctx.scoring.award(points, label) > 0) {
      const frames = this.ctx.baked("skyride");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, `${label} ${fmtScore(points)}`)
          : new MessageScene([[label, fmtScore(points)]], 1.2),
        1,
      );
    }
  }

  // ── the ride pass + fireworks finale ──

  private punch(ride: string): void {
    if (this.pass.has(ride) || this.fireworksReady || this.fireworksActive) return;
    this.pass.add(ride);
    this.ctx.push(
      new MessageScene([["RIDE PASS", `${this.pass.size} OF ${rules.ridePass.rides.length} PUNCHED`]], 1.1),
      1,
    );
    if (this.pass.size >= rules.ridePass.rides.length) {
      this.fireworksReady = true;
      this.ctx.bus.emit("mode", { kind: "fireworksReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["A PERFECT DAY", "SHOOT THE PRIZE BOOTH"]], 1.6, true), 2);
    }
  }

  private startFireworks(): void {
    this.fireworksReady = false;
    this.pass.clear();
    this.finaleStartTotal = this.ctx.scoring.total;
    this.fireworksUntil = this.now + rules.fireworks.durationS;
    this.fireworksWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.fireworks.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "fireworksStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("fireworks");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, `ALL SCORES X${rules.fireworks.scoreFactor}`, 1.0)
        : new MessageScene(
            [["FIREWORKS FINALE", `ALL SCORES X${rules.fireworks.scoreFactor}`]],
            1.5,
            true,
          ),
      3,
    );
  }

  /** Live ticker for the score readout (DMD pass). */
  dmdStatus(): string | undefined {
    if (this.fireworksActive) return `FINALE ${Math.ceil(this.fireworksUntil - this.now)}`;
    const letters = ["P", "A", "R", "K"].map((c, i) => (this.litLanes.has(String(i + 1)) ? c : ".")).join("");
    return `${letters}  WHEEL ${this.gondolas}/${rules.ferrisWheel.gondolas}`;
  }

  /** Both-flipper progress readout (DMD pass). */
  statusReport(): string[][] {
    return [
      [`WHEEL ${this.gondolas} OF ${rules.ferrisWheel.gondolas}`, `MULTIPLIER X${this.ctx.scoring.multiplier}`],
      ["RIDE THE PARK", "PUNCH ALL FIVE"],
      ["NEXT PRIZE", rules.prizeBooth.prizes[this.prizeIdx].name],
    ];
  }

  // ─────────────── RING THE BELL (DMD video mode) ───────────────
  // The power meter oscillates; a flipper press takes the swing at the
  // meter's current height (DING >= 0.88, STRONG >= 0.6, else FAIR); an
  // unswung window judges as a miss. Ends at bellGame.durationS (sim-safe).

  private bgPower(): number {
    const t = this.now - this.bgStart - 1.6;
    return t < 0 ? 0 : Math.abs(Math.sin(t * 2.6));
  }

  private bgSwingNow(): void {
    if (this.bgSwing >= this.bgResults.length || this.bgResults[this.bgSwing] !== null) return;
    const p = this.bgPower();
    const tier = p >= 0.88 ? 3 : p >= 0.6 ? 2 : 1;
    this.bgResults[this.bgSwing] = tier;
    if (tier === 3) {
      this.ctx.scoring.award(rules.bellGame.dingValue, "DING");
      this.ctx.sfx("bank");
      if (rules.bellGame.dingLoadsGondola) this.loadGondola("BELL GAME");
    } else if (tier === 2) {
      this.ctx.scoring.award(Math.floor(rules.bellGame.dingValue / 2), "STRONG");
      this.ctx.sfx("rollover");
    } else {
      this.ctx.scoring.award(Math.floor(rules.bellGame.dingValue / 5), "FAIR");
      this.ctx.sfx("target");
    }
    this.bgSwing++;
  }

  private startBellGame(): void {
    this.bellLit = false;
    this.bgActive = true;
    this.bgStart = this.now;
    this.bgSwing = 0;
    this.bgResults = Array.from({ length: rules.bellGame.swings }, () => null);
    this.ctx.holdScoop?.("booth", true);
    this.ctx.sfx("multiplier");
    this.ctx.push(
      new SequenceScene([
        (() => {
          const f = this.ctx.baked("bellgame");
          return f
            ? new BakedDmdScene(f, 9, "FLIP AT THE TOP")
            : new MessageScene([["RING THE BELL", "FLIP AT THE TOP"]], 1.4, true);
        })(),
        new BellGameScene(() => ({
          active: this.bgActive,
          power: this.bgPower(),
          results: this.bgResults,
        })),
      ]),
      3,
    );
  }

  private updateBellGame(): void {
    const t = this.now - this.bgStart;
    // each swing window is 2.6 s; letting it lapse judges as a miss
    const windowEnd = 1.6 + (this.bgSwing + 1) * 2.6;
    if (this.bgSwing < this.bgResults.length && t >= windowEnd) {
      this.bgResults[this.bgSwing] = 0;
      this.ctx.sfx("target");
      this.bgSwing++;
    }
    if (t >= rules.bellGame.durationS) this.endBellGame(false);
  }

  private endBellGame(abandoned: boolean): void {
    this.bgActive = false;
    this.ctx.holdScoop?.("booth", false);
    if (abandoned) return;
    const dings = this.bgResults.filter((r) => r === 3).length;
    this.ctx.push(
      new MessageScene(
        [dings === this.bgResults.length ? ["EVERY SWING RANG", "THE WHOLE MIDWAY HEARD"] : [`${dings} DINGS`]],
        1.4,
        dings === this.bgResults.length,
      ),
      3,
    );
  }
}
