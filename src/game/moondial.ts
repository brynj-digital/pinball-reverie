import type { TableLogic, TableLogicCtx } from "./TableLogic";
import type { DmdScene } from "../render/dmd/DmdScene";
import type { DotMatrix } from "../render/dmd/DotMatrix";
import { BakedDmdScene, MessageScene, SequenceScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/moondial/rules.json";

/**
 * ALIGN THE SCOPE — the DMD video mode (SIGNAL BOX pattern: pure display,
 * MoondialLogic owns every timer and outcome; the headless sims resolve
 * the mode without this scene ever updating).
 */
export class AlignScopeScene implements DmdScene {
  constructor(
    private read: () => {
      active: boolean;
      offset: number; // reticle offset from the star, dots
      results: (boolean | null)[];
      locking: boolean; // inside the judge flash window
    },
  ) {}

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    if (!s.active) return true;
    dmd.clear();
    dmd.centerText("ALIGN THE SCOPE", 0, 3);
    // the star, fixed at centre; the reticle drifts around it
    const cx = 64;
    const cy = 16;
    dmd.set(cx, cy, 4);
    dmd.set(cx - 1, cy, 2);
    dmd.set(cx + 1, cy, 2);
    dmd.set(cx, cy - 1, 2);
    dmd.set(cx, cy + 1, 2);
    const rx = cx + Math.round(s.offset);
    const lv = s.locking ? 4 : 3;
    for (let k = -1; k <= 1; k++) {
      dmd.set(rx - 5, cy + k, lv);
      dmd.set(rx + 5, cy + k, lv);
      dmd.set(rx + k, cy - 4, lv);
      dmd.set(rx + k, cy + 4, lv);
    }
    // result stars along the bottom
    s.results.forEach((r, i) => {
      const x = 52 + i * 12;
      const level = r === null ? 1 : r ? 4 : 2;
      dmd.set(x, 27, level);
      dmd.set(x - 1, 28, level);
      dmd.set(x + 1, 28, level);
      dmd.set(x, 29, level);
    });
    return false;
  }
}

/** Entry→exit (either direction) within this window counts as an orbit. */
const ORBIT_PAIR_WINDOW = 3.5;

/**
 * The Moondial ruleset (plan §8 M7), values from the table's rules JSON:
 *
 * - Orbit combos: consecutive orbits inside orbitCombo.windowS escalate the
 *   award ×2 per step (capped at maxStep).
 * - LUNAR ECLIPSE: complete the comet bank banksRequired times AND shoot
 *   orbitsRequired orbits to light it; the next orbit starts the mode —
 *   durationS seconds of ×scoreFactor scoring with orbitValue orbit jackpots.
 * - TELESCOPE: each scoop capture awards the next sighting in the telescope
 *   list (wrapping); the last sighting also spots one orbit toward lighting
 *   the eclipse. Progression persists across balls, resets per game.
 * - MOON LANES: light all three to raise the bonus multiplier (max ×5).
 * - THE GNOMON (differentiation pass): the centre post rises while the
 *   ball-saver is live and during the eclipse (diverterBlade below).
 * - FIRST LIGHT (skill shot): a soft plunge peaking in the lane band pays
 *   skill.points and spots one moon lane. Once per ball.
 * - Combos and any running eclipse end with the ball.
 *
 * Owns the table's DMD narration too (M10: per-table logic behind the
 * TableLogic seam — Game only runs the universal machine).
 */
export class MoondialLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private orbitStep = 0;
  private lastOrbitAt = -Infinity;
  private banks = 0;
  private orbits = 0;
  private sightingIdx = 0;
  eclipseReady = false;
  private eclipseUntil = -Infinity;
  private eclipseWasActive = false;
  private litMoons = new Set<string>();
  private skillUsed = false;
  private scopeLit = false;
  private asActive = false;
  private asStart = 0;
  private asOffset = 0;
  private asDrift = 1;
  private asResults: (boolean | null)[] = [];
  private eclipseStartTotal = 0;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind }) => {
      if (kind === "ramp-entry") this.orbitEnd("entry");
      else if (kind === "ramp-exit") this.orbitEnd("exit");
      else if (kind === "kicker") this.onTelescope();
    });
    ctx.bus.on("bankComplete", () => {
      this.banks++;
      this.checkReady();
    });
    ctx.bus.on("score", ({ label, points }) => {
      const isOrbit = label.startsWith("ORBIT") || label === "ECLIPSE ORBIT";
      const orbitFrames = ctx.baked("orbit");
      const bankFrames = ctx.baked("bank");
      if (isOrbit && orbitFrames) {
        ctx.push(
          new BakedDmdScene(orbitFrames, 11, `${label} ${fmtScore(points)}`),
          label === "ECLIPSE ORBIT" ? 2 : 1,
        );
      } else if (label === "BANK BONUS" && bankFrames) {
        ctx.push(new BakedDmdScene(bankFrames, 11, `BANK ${fmtScore(points)}`));
      } else if (isOrbit || label === "BANK BONUS") {
        ctx.push(new MessageScene([[label, fmtScore(points)]], 1.3));
      }
    });
  }

  get eclipseActive(): boolean {
    return this.now < this.eclipseUntil;
  }

  /** Seconds of eclipse remaining (0 when inactive). */
  get eclipseRemaining(): number {
    return Math.max(0, this.eclipseUntil - this.now);
  }

  update(dt: number): void {
    this.now += dt;
    if (this.asActive) this.updateAlignScope(dt);
    if (this.eclipseWasActive && !this.eclipseActive) {
      this.eclipseWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "eclipseEnd" });
      this.ctx.push(
        new MessageScene(
          [["ECLIPSE OVER"], ["ECLIPSE TOTAL", fmtScore(this.ctx.scoring.total - this.eclipseStartTotal)]],
          1.3,
        ),
        2,
      );
    }
  }

  /** Live ticker for the score readout (DMD pass). */
  dmdStatus(): string | undefined {
    if (this.eclipseActive) return `ECLIPSE ${Math.ceil(this.eclipseRemaining)}`;
    if (this.eclipseReady) return "SHOOT THE ORBIT";
    return `MOONS ${this.litMoons.size}/3  X${this.ctx.scoring.multiplier}`;
  }

  /** Both-flipper progress readout (DMD pass). */
  statusReport(): string[][] {
    const T = rules.telescope;
    return [
      [`MOONS ${this.litMoons.size}/3`, `MULTIPLIER X${this.ctx.scoring.multiplier}`],
      [
        `BANKS ${Math.min(this.banks, rules.eclipse.banksRequired)}/${rules.eclipse.banksRequired} ORBITS ${Math.min(this.orbits, rules.eclipse.orbitsRequired)}/${rules.eclipse.orbitsRequired}`,
        this.eclipseReady ? "ECLIPSE IS LIT" : "LIGHT THE ECLIPSE",
      ],
      ["NEXT SIGHTING", T.sightings[this.sightingIdx].name],
    ];
  }

  /** Ball drained: combos and any running eclipse die with it. */
  endBall(): void {
    if (this.asActive) this.endAlignScope(true);
    this.skillUsed = false;
    this.orbitStep = 0;
    this.lastOrbitAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.litMoons.clear();
    if (this.eclipseActive) {
      this.eclipseUntil = -Infinity;
      this.eclipseWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "eclipseEnd" });
    }
  }

  resetGame(): void {
    this.endBall();
    this.banks = 0;
    this.orbits = 0;
    this.sightingIdx = 0;
    this.eclipseReady = false;
  }

  /** Moon lanes: light all three to raise the bonus multiplier (max ×5). */
  onRollover(id: string): void {
    this.spotMoon(id);
  }

  private spotMoon(id: string): void {
    this.litMoons.add(id);
    if (this.litMoons.size === 3) {
      this.litMoons.clear();
      if (this.ctx.scoring.multiplier < 5) {
        this.ctx.scoring.multiplier++;
        this.ctx.sfx("multiplier");
        const caption = `MULTIPLIER ×${this.ctx.scoring.multiplier}`;
        const frames = this.ctx.baked("moon");
        this.ctx.push(
          frames
            ? new BakedDmdScene(frames, 9, caption)
            : new MessageScene([[caption]], 1.4, true),
          2,
        );
      }
    }
  }

  laneLit(id: string): number {
    return this.litMoons.has(id) ? 0.55 : 0;
  }

  lamp(): number {
    return 0;
  }

  kickerLit(): boolean {
    return true; // the telescope scoop is always live
  }

  /** Confirmed captures start the lit video mode (the hold is real now). */
  onCapture(id: string): void {
    if (id !== "telescope") return;
    if (this.scopeLit && !this.asActive && !this.ctx.scoring.muted) this.startAlignScope();
  }

  /** THE GNOMON rises while the saver is live and during the eclipse. */
  diverterBlade(id: string): string {
    if (id !== "gnomon") return "down";
    return (this.ctx.saverActive?.() ?? false) || this.eclipseActive ? "up" : "down";
  }

  /** FIRST LIGHT: soft plunge peaking in the lane band. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "firstlight" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return; // tilted
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "FIRST LIGHT");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["FIRST LIGHT", fmtScore(points)]], 1.4, true), 2);
    // spot one unlit moon lane (completion logic shared with onRollover)
    const unlit = ["1", "2", "3"].find((m) => !this.litMoons.has(m));
    if (unlit) this.spotMoon(unlit);
  }

  /** Telescope scoop capture: award the next sighting in the logbook. */
  private onTelescope(): void {
    if (this.ctx.scoring.muted) return; // tilted: no sighting, no progression
    // a lit scope consumes this capture for the video mode — which starts
    // from onCapture (AFTER the kicker actually holds; starting from the
    // raw sensor made beginExtendedHold a no-op on an idle kicker)
    if (this.scopeLit || this.asActive) return;
    const T = rules.telescope;
    const s = T.sightings[this.sightingIdx];
    const spotted = T.lastSpotsOrbit && this.sightingIdx === T.sightings.length - 1;
    this.sightingIdx = (this.sightingIdx + 1) % T.sightings.length;
    if (this.sightingIdx === 0) this.scopeLit = true; // the log is full: align
    const points = this.ctx.scoring.award(s.points, s.name);
    this.ctx.scoring.bonusUnits += T.bonusUnit;
    if (spotted && !this.eclipseReady && !this.eclipseActive) {
      this.orbits++;
      this.checkReady();
    }
    this.ctx.bus.emit("telescope", { name: s.name, points, spotted });
    // the ball sits captive in the scoop while this plays — the one moment
    // the player is guaranteed to be watching the DMD
    const frames = this.ctx.baked("telescope");
    const reveal = frames
      ? new BakedDmdScene(frames, 8, `${s.name} ${fmtScore(points)}`)
      : new MessageScene([[s.name, fmtScore(points)]], 1.6, true);
    this.ctx.push(
      spotted ? new SequenceScene([reveal, new MessageScene([["ORBIT SPOTTED"]], 1.0)]) : reveal,
      2,
    );
  }

  private orbitEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < ORBIT_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity; // consume the pair
      this.onOrbit();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onOrbit(): void {
    if (this.eclipseActive) {
      this.ctx.scoring.award(rules.eclipse.orbitValue, "ECLIPSE ORBIT");
      return;
    }
    const combo = rules.orbitCombo;
    this.orbitStep =
      this.now - this.lastOrbitAt < combo.windowS ? Math.min(combo.maxStep, this.orbitStep + 1) : 1;
    this.lastOrbitAt = this.now;
    const factor = 2 ** (this.orbitStep - 1);
    this.ctx.scoring.award(rules.points.orbit * factor, factor > 1 ? `ORBIT ×${factor}` : "ORBIT");

    if (this.eclipseReady) {
      this.startEclipse();
    } else {
      this.orbits++;
      this.checkReady();
    }
  }

  private checkReady(): void {
    if (
      !this.eclipseReady &&
      !this.eclipseActive &&
      this.banks >= rules.eclipse.banksRequired &&
      this.orbits >= rules.eclipse.orbitsRequired
    ) {
      this.eclipseReady = true;
      this.ctx.bus.emit("mode", { kind: "eclipseReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["ECLIPSE IS LIT", "SHOOT THE ORBIT"]], 1.6, true), 2);
    }
  }

  // ─────────────── ALIGN THE SCOPE (DMD video mode) ───────────────
  // Timer-driven: star i judges at asStart + 2.4 + i×2.4; the mode ends at
  // alignScope.durationS regardless of the DMD (the headless sims have no
  // DotMatrix, and an unclosed hold is a stuck ball).

  onFlipper(side: "left" | "right"): void {
    if (this.asActive) this.asOffset += side === "left" ? -3 : 3;
  }

  private startAlignScope(): void {
    this.scopeLit = false;
    this.asActive = true;
    this.asStart = this.now;
    this.asOffset = Math.random() < 0.5 ? -7 : 7;
    this.asDrift = (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 1.4);
    this.asResults = Array.from({ length: rules.alignScope.stars }, () => null);
    this.ctx.holdScoop?.("telescope", true);
    this.ctx.sfx("multiplier");
    this.ctx.push(
      new SequenceScene([
        new MessageScene([["ALIGN THE SCOPE", "FLIPPERS NUDGE THE TUBE"]], 1.4, true),
        new AlignScopeScene(() => ({
          active: this.asActive,
          offset: this.asOffset,
          results: this.asResults,
          locking: ((this.now - this.asStart - 2.4) % 2.4) > 1.9,
        })),
      ]),
      3,
    );
  }

  private updateAlignScope(dt: number): void {
    const t = this.now - this.asStart;
    // the tube drifts; it reverses now and then so holding one flipper
    // can't trivially pin it
    this.asOffset += this.asDrift * dt;
    if (Math.abs(this.asOffset) > 10) {
      this.asOffset = Math.sign(this.asOffset) * 10;
      this.asDrift = -this.asDrift;
    }
    for (let i = 0; i < this.asResults.length; i++) {
      if (this.asResults[i] === null && t >= 2.4 + i * 2.4) {
        const ok = Math.abs(this.asOffset) <= 2.5;
        this.asResults[i] = ok;
        if (ok) {
          this.ctx.scoring.award(rules.alignScope.starValue, "STAR FIXED");
          this.ctx.sfx("rollover");
        } else {
          this.ctx.sfx("target");
        }
        this.asDrift = (Math.random() < 0.5 ? -1 : 1) * (2.6 + Math.random() * 1.6);
      }
    }
    if (t >= rules.alignScope.durationS) this.endAlignScope(false);
  }

  private endAlignScope(abandoned: boolean): void {
    this.asActive = false;
    this.ctx.holdScoop?.("telescope", false);
    if (abandoned) return;
    const fixed = this.asResults.filter(Boolean).length;
    if (fixed === this.asResults.length && rules.alignScope.allSpotsOrbit) {
      this.ctx.push(new MessageScene([["EVERY STAR FIXED", "ORBIT SPOTTED"]], 1.5, true), 3);
      if (!this.eclipseReady && !this.eclipseActive) {
        this.orbits++;
        this.checkReady();
      }
    } else {
      this.ctx.push(new MessageScene([[`${fixed} STARS FIXED`]], 1.3), 3);
    }
  }

  private startEclipse(): void {
    this.eclipseStartTotal = this.ctx.scoring.total;
    this.eclipseReady = false;
    this.banks = 0;
    this.orbits = 0;
    this.eclipseUntil = this.now + rules.eclipse.durationS;
    this.eclipseWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.eclipse.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "eclipseStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("eclipse");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "ALL SCORES ×2", 1.0)
        : new MessageScene([["LUNAR ECLIPSE", "ALL SCORES ×2"]], 1.5, true),
      3,
    );
  }
}
