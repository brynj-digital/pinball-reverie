import type { TableLogic, TableLogicCtx } from "./TableLogic";
import { BakedDmdScene, MessageScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/midway/rules.json";

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
  private prizeIdx = 0;
  private boothLit = false;
  private chickenLit = false;
  private stampLit = false;
  /** The ghost train's turnstile. Lit (open) at ball start; a ride consumes
   * the light, then relightSpins turnstile spins re-open it — so the dark
   * ride stops swallowing every ball that reaches mid-field (it used to be
   * always-on, which walled the top half off). */
  private ghostLit = true;
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
      this.ctx.push(new MessageScene([["TOWER DROPPED", "PRIZE BOOTH LIT"]], 1.4), 2);
    });
  }

  get fireworksActive(): boolean {
    return this.now < this.fireworksUntil;
  }

  update(dt: number): void {
    this.now += dt;
    if (this.fireworksWasActive && !this.fireworksActive) {
      this.fireworksWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "fireworksEnd" });
      this.ctx.push(new MessageScene([["THE SMOKE CLEARS", "GOODNIGHT"]], 1.5), 2);
    }
  }

  endBall(): void {
    this.comboStep = 0;
    this.lastLoopAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    // collected letters survive the drain — the lanes are the table's
    // hardest real estate, and losing them per ball made P-A-R-K a fantasy
    this.swingActive = false;
    this.swingScored = false;
    this.aAt = -Infinity;
    // the next ball starts with the dark ride open (one ride before it must
    // be re-earned at the turnstile)
    this.ghostLit = true;
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
      this.ctx.push(new MessageScene([["HAND STAMP", "BACK IN THE PARK"]], 1.2), 2);
    } else if (id === "chicken") {
      this.chickenLit = false;
      this.ctx.push(new MessageScene([["CHICKEN EXIT", "BACK TO THE QUEUE"]], 1.2), 2);
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
    const points = this.ctx.scoring.award(prize.points, prize.name);
    this.ctx.scoring.bonusUnits += B.bonusUnit;
    this.chickenLit = true;
    this.ctx.bus.emit("telescope", { name: prize.name, points, spotted: last });
    // the ball sits captive under the canopy while this plays
    const frames = this.ctx.baked("wheel");
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
      this.ctx.push(new MessageScene([[label, fmtScore(points)]], 1.2), 1);
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
}
