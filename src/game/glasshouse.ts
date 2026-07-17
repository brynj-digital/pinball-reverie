import type { TableLogic, TableLogicCtx } from "./TableLogic";
import { BakedDmdScene, MessageScene, fmtScore } from "../render/dmd/DmdScene";
import rules from "../../design/tables/glasshouse/rules.json";

/** Entry→exit (either direction) within this window counts as a Gallery. */
const GALLERY_PAIR_WINDOW = 3.5;

const LANE_IDS = ["1", "2", "3", "4"] as const;
const POLLEN_IDS = ["pol1", "pol2", "pol3", "pol4"] as const;
const LAMP_IDS = ["lampA", "lampB", "lampC"] as const;

/**
 * The Glasshouse ruleset (M14; design truth in the table's BRIEF.md):
 *
 * - THE GALLERY: full orbit loops, combo-stepped like the lineup.
 * - M-O-T-H lanes: completion pays and resets the lamp wander clock.
 *   Letters persist across balls; lane change on the flippers.
 * - POLLEN COUNT: roll all FOUR return lanes (the widebody's double
 *   inlanes) → bonus multiplier step, THE MISTER lit, and a fresh
 *   cross-pollination window.
 * - THE LAMPS (phototaxis): one maintenance lamp lit at a time, wandering
 *   on a timer; hits at the lit lamp pay double and bank a moth.
 *   mothsForSwarm moths light SWARM at the Orchid.
 * - THE VINE RUN: the lineup's only LATERAL surface — a completed
 *   west→east ride pays CANOPY; landing inside a fresh pollen window pays
 *   CROSS-POLLINATION.
 * - BLOOM bank (5 targets): each completion opens a bloom; five = FULL
 *   BED (wizard qualifier).
 * - THE ORCHID: scoop ladder (wrapping); the top rung starts LIGHTS OUT
 *   (video mode — call the moonlit pane; holdScoop + TIMER, sim-safe).
 *   Every capture lights the COLD FRAME subway.
 * - SWARM: banked moths release as a timed multiball frenzy; lit-lamp
 *   hits pay jackpots (the jackpot keeps wandering).
 * - THE CENTURY BLOOM (wizard): FULL BED + a swarm + a cross-pollination;
 *   every lamp lit at once, scores doubled.
 * - NIGHT SHIFT: skill shot — soft plunge pays and banks a moth.
 */
export class GlasshouseLogic implements TableLogic {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private galleryStep = 0;
  private lastGalleryAt = -Infinity;
  private litLanes = new Set<string>();
  private pollen = new Set<string>();
  private pollenFreshUntil = -Infinity;
  private lampIdx = 0;
  private lampWanderAt = 0;
  private moths = 0;
  private swarmReady = false;
  private swarmUntil = -Infinity;
  private swarmWasActive = false;
  private swarmed = false;
  private blooms = 0;
  private crossPollinated = false;
  private rungIdx = 0;
  private misterLit = false;
  private coldframeLit = false;
  private skillUsed = false;
  private vineFromMouth = false;
  centuryReady = false;
  private centuryUntil = -Infinity;
  private centuryWasActive = false;
  private swarmStartTotal = 0;
  private centuryStartTotal = 0;
  // LIGHTS OUT video mode (timer-driven; the scene is pure display)
  private loActive = false;
  private loCue = 0;
  private loCueAt = 0;
  private loHits = 0;
  private loCall: "left" | "right" | null = null;

  constructor(private ctx: TableLogicCtx) {
    ctx.bus.on("sensor", ({ kind, id }) => {
      if (kind === "ramp-entry") this.galleryEnd("entry");
      else if (kind === "ramp-exit") this.galleryEnd("exit");
      else if (kind === "lane" && id?.startsWith("pol")) this.onPollen(id);
      else if (kind === "lane" && id?.startsWith("lamp")) this.onLampZone(id);
    });
    // the lamp zones are sensor-lane-mothA/B/C; map zone id -> lamp id
    ctx.bus.on("sensor", ({ kind, id }) => {
      if (kind === "lane" && (id === "mothA" || id === "mothB" || id === "mothC"))
        this.onLampZone("lamp" + id.slice(4));
    });
    ctx.bus.on("surface", ({ from, to, x }) => {
      if (to === "vine") this.vineFromMouth = x < 0.32;
      else if (from === "vine") {
        if (x > 0.52 && this.vineFromMouth) this.onVine();
        this.vineFromMouth = false;
      }
    });
    ctx.bus.on("bankComplete", () => this.onBloom());
  }

  get swarmActive(): boolean {
    return this.now < this.swarmUntil;
  }
  get centuryActive(): boolean {
    return this.now < this.centuryUntil;
  }

  update(dt: number): void {
    this.now += dt;
    // the lit lamp wanders (phototaxis) — paused during the wizard
    if (!this.centuryActive && this.now - this.lampWanderAt > rules.lamps.wanderS) {
      this.lampWanderAt = this.now;
      this.lampIdx = (this.lampIdx + 1) % LAMP_IDS.length;
    }
    if (this.swarmWasActive && !this.swarmActive) {
      this.swarmWasActive = false;
      if (!this.centuryActive) this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "swarmEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["THE SWARM SETTLES"],
            ["SWARM TOTAL", fmtScore(this.ctx.scoring.total - this.swarmStartTotal)],
          ],
          1.3,
        ),
        2,
      );
    }
    if (this.centuryWasActive && !this.centuryActive) {
      this.centuryWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "centuryEnd" });
      this.ctx.push(
        new MessageScene(
          [
            ["THE FLOWER CLOSES", "A HUNDRED YEARS"],
            ["CENTURY TOTAL", fmtScore(this.ctx.scoring.total - this.centuryStartTotal)],
          ],
          1.5,
        ),
        2,
      );
    }
    // LIGHTS OUT cues run on a timer the logic owns (sims have no DMD)
    if (this.loActive && this.now - this.loCueAt > rules.lightsOut.cueS) this.loAdvance();
  }

  endBall(): void {
    this.skillUsed = false;
    this.galleryStep = 0;
    this.lastGalleryAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    this.pollenFreshUntil = -Infinity;
    this.vineFromMouth = false;
    if (this.loActive) this.loFinish(); // releases the held scoop
    if (this.swarmActive) {
      this.swarmUntil = -Infinity;
      this.swarmWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "swarmEnd" });
    }
    if (this.centuryActive) {
      this.centuryUntil = -Infinity;
      this.centuryWasActive = false;
      this.ctx.scoring.eclipseFactor = 1;
      this.ctx.bus.emit("mode", { kind: "centuryEnd" });
    }
  }

  resetGame(): void {
    this.endBall();
    this.litLanes.clear();
    this.pollen.clear();
    this.moths = 0;
    this.blooms = 0;
    this.rungIdx = 0;
    this.swarmReady = false;
    this.swarmed = false;
    this.crossPollinated = false;
    this.misterLit = false;
    this.coldframeLit = false;
    this.centuryReady = false;
    this.lampIdx = 0;
  }

  /** M-O-T-H: completion pays and resets the wander clock. */
  onRollover(id: string): void {
    this.litLanes.add(id);
    if (this.litLanes.size === 4) {
      this.litLanes.clear();
      const points = this.ctx.scoring.award(rules.mothLanes.points, "M-O-T-H");
      this.lampWanderAt = this.now; // the moths regroup on the lit lamp
      this.ctx.sfx("multiplier");
      const frames = this.ctx.baked("moth");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, `M-O-T-H ${fmtScore(points)}`)
          : new MessageScene([["M-O-T-H", fmtScore(points)]], 1.3, true),
        2,
      );
    }
  }

  /** LIGHTS OUT cue call rides the flippers; else classic lane change. */
  onFlipper(side: "left" | "right"): void {
    if (this.loActive) {
      this.loCall = side;
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
    if (id.startsWith("lamp")) {
      if (this.centuryActive) return 0.95; // the whole house ablaze
      return LAMP_IDS[this.lampIdx] === id ? 0.85 : 0;
    }
    if (id === "mister") return this.misterLit ? 0.8 : 0;
    if (id === "coldframe") return this.coldframeLit ? 0.8 : 0;
    return 0;
  }

  kickerLit(id: string): boolean {
    if (id === "mister") return this.misterLit;
    if (id === "coldframe") return this.coldframeLit;
    return true; // the orchid is always live
  }

  /** NIGHT SHIFT: soft plunge peaking in the lane band. Once per ball. */
  onSkillShot(id: string, speed: number): void {
    if (id !== "nightshift" || this.skillUsed) return;
    if (speed > rules.skill.maxSpeed) return;
    if (this.ctx.scoring.muted) return;
    this.skillUsed = true;
    const points = this.ctx.scoring.award(rules.skill.points, "NIGHT SHIFT");
    this.ctx.scoring.bonusUnits += rules.skill.bonusUnit;
    this.ctx.sfx("rollover");
    this.ctx.push(new MessageScene([["NIGHT SHIFT", fmtScore(points)]], 1.4, true), 2);
    this.bankMoth();
  }

  onCapture(id: string): void {
    if (this.ctx.scoring.muted) return;
    if (id === "orchid") this.onOrchid();
    else if (id === "mister") {
      this.misterLit = false;
      this.ctx.push(new MessageScene([["THE MISTER", "BALL SAVED"]], 1.1), 2);
    } else if (id === "coldframe") {
      this.coldframeLit = false;
      this.ctx.push(new MessageScene([["COLD FRAME", "ROUND THE BACK"]], 1.1), 2);
    }
  }

  /** POLLEN COUNT: all four return lanes → multiplier + mister + window. */
  private onPollen(id: string): void {
    if (this.ctx.scoring.muted) return;
    this.pollen.add(id);
    if (this.pollen.size === POLLEN_IDS.length) {
      this.pollen.clear();
      if (this.ctx.scoring.multiplier < rules.pollen.maxMultiplier) this.ctx.scoring.multiplier++;
      this.misterLit = true;
      this.pollenFreshUntil = this.now + rules.pollen.freshS;
      this.ctx.sfx("multiplier");
      const frames = this.ctx.baked("bloom");
      const caption = `POLLEN COUNT  X${this.ctx.scoring.multiplier}`;
      this.ctx.push(
        frames ? new BakedDmdScene(frames, 8, caption) : new MessageScene([[caption]], 1.4, true),
        2,
      );
    }
  }

  /** A lamp zone hit: double at the lit lamp, and a moth banked. */
  private onLampZone(lampId: string): void {
    if (this.ctx.scoring.muted) return;
    const lit = this.centuryActive || LAMP_IDS[this.lampIdx] === lampId;
    if (!lit) {
      this.ctx.scoring.award(rules.lamps.points / 2, "DARK BED");
      return;
    }
    if (this.swarmActive) {
      this.ctx.scoring.award(rules.swarm.jackpot, "SWARM JACKPOT");
      this.ctx.sfx("bank");
      return;
    }
    const points = this.ctx.scoring.award(rules.lamps.points * 2, "PHOTOTAXIS");
    this.ctx.sfx("target");
    this.ctx.push(new MessageScene([["PHOTOTAXIS", fmtScore(points)]], 1.1), 1);
    this.bankMoth();
  }

  private bankMoth(): void {
    this.moths++;
    if (this.moths >= rules.lamps.mothsForSwarm && !this.swarmReady && !this.swarmActive) {
      this.swarmReady = true;
      this.ctx.push(new MessageScene([["SWARM IS LIT", "SHOOT THE ORCHID"]], 1.5, true), 2);
    } else if (!this.swarmReady) {
      this.ctx.push(
        new MessageScene([[`MOTH ${this.moths} OF ${rules.lamps.mothsForSwarm}`]], 1.0),
        1,
      );
    }
  }

  /** A completed west→east vine ride. */
  private onVine(): void {
    if (this.ctx.scoring.muted) return;
    if (this.now < this.pollenFreshUntil) {
      this.crossPollinated = true;
      this.pollenFreshUntil = -Infinity;
      const points = this.ctx.scoring.award(rules.vine.crossPoints, "CROSS-POLLINATION");
      this.ctx.shake(0.004);
      const frames = this.ctx.baked("crossing");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 9, `CROSS-POLLINATION ${fmtScore(points)}`)
          : new MessageScene([["CROSS-POLLINATION", fmtScore(points)]], 1.6, true),
        2,
      );
      this.checkReady();
    } else {
      const points = this.ctx.scoring.award(rules.vine.canopyPoints, "CANOPY");
      const frames = this.ctx.baked("crossing");
      this.ctx.push(
        frames
          ? new BakedDmdScene(frames, 10, `CANOPY ${fmtScore(points)}`)
          : new MessageScene([["CANOPY", fmtScore(points)]], 1.2),
        1,
      );
    }
  }

  /** The 5-bank: a bloom opens; five = FULL BED. */
  private onBloom(): void {
    if (this.blooms < rules.bloom.blooms) this.blooms++;
    const frames = this.ctx.baked("bloom");
    const full = this.blooms === rules.bloom.blooms;
    const caption = full ? "FULL BED" : `BLOOM ${this.blooms} OF ${rules.bloom.blooms}`;
    this.ctx.push(
      frames ? new BakedDmdScene(frames, 9, caption) : new MessageScene([[caption]], 1.3, true),
      2,
    );
    if (full) this.checkReady();
  }

  private onOrchid(): void {
    this.coldframeLit = true;
    if (this.centuryReady && !this.centuryActive) {
      this.startCentury();
      return;
    }
    if (this.swarmReady) {
      this.startSwarm();
      return;
    }
    const R = rules.orchid.rungs[this.rungIdx];
    const topped = this.rungIdx === rules.orchid.rungs.length - 1;
    this.rungIdx = (this.rungIdx + 1) % rules.orchid.rungs.length;
    const points = this.ctx.scoring.award(R.points, R.name);
    this.ctx.scoring.bonusUnits += rules.orchid.bonusUnit;
    this.ctx.push(new MessageScene([[R.name, fmtScore(points)]], 1.4, true), 2);
    if (topped) this.startLightsOut();
  }

  // ── LIGHTS OUT (video mode; TIMER-driven, the sims have no DMD) ──
  private startLightsOut(): void {
    this.loActive = true;
    this.loCue = 0;
    this.loHits = 0;
    this.loCall = null;
    this.loCueAt = this.now;
    this.ctx.holdScoop?.("orchid", true);
    const frames = this.ctx.baked("lightsout");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 6, "CALL THE MOONLIT PANE", 0.8)
        : new MessageScene([["LIGHTS OUT", "FLIPPERS CALL THE PANE"]], 1.4, true),
      3,
    );
  }

  private loAdvance(): void {
    // the moonlit pane alternates deterministically; a correct call pays
    const correct: "left" | "right" = this.loCue % 2 === 0 ? "left" : "right";
    if (this.loCall === correct) {
      this.loHits++;
      this.ctx.scoring.award(rules.lightsOut.cuePoints, "MOONLIT PANE");
      this.ctx.sfx("rollover");
    }
    this.loCall = null;
    this.loCue++;
    this.loCueAt = this.now;
    if (this.loCue >= rules.lightsOut.cues) this.loFinish();
  }

  private loFinish(): void {
    if (!this.loActive) return;
    this.loActive = false;
    this.ctx.holdScoop?.("orchid", false);
    if (this.loHits === rules.lightsOut.cues && rules.lightsOut.perfectMoth) {
      this.ctx.push(new MessageScene([["EVERY PANE CALLED", "A MOTH JOINS"]], 1.4, true), 2);
      this.bankMoth();
    }
  }

  private startSwarm(): void {
    this.swarmReady = false;
    this.swarmed = true;
    this.moths = 0;
    this.swarmStartTotal = this.ctx.scoring.total;
    this.swarmUntil = this.now + rules.swarm.durationS;
    this.swarmWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.swarm.scoreFactor;
    this.ctx.addBalls?.(rules.swarm.balls);
    this.ctx.bus.emit("mode", { kind: "swarmStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.005);
    const frames = this.ctx.baked("swarm");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "SWARM  X2", 1.0)
        : new MessageScene([["SWARM", "FOLLOW THE LIT LAMP"]], 1.6, true),
      3,
    );
    this.checkReady();
  }

  private checkReady(): void {
    if (
      !this.centuryReady &&
      !this.centuryActive &&
      this.blooms >= rules.bloom.blooms &&
      this.swarmed &&
      this.crossPollinated
    ) {
      this.centuryReady = true;
      this.ctx.bus.emit("mode", { kind: "centuryReady" });
      this.ctx.sfx("multiplier");
      this.ctx.push(new MessageScene([["THE CENTURY BLOOM", "SHOOT THE ORCHID"]], 1.6, true), 2);
    }
  }

  private startCentury(): void {
    this.centuryReady = false;
    this.blooms = 0;
    this.swarmed = false;
    this.crossPollinated = false;
    this.centuryStartTotal = this.ctx.scoring.total;
    this.centuryUntil = this.now + rules.century.durationS;
    this.centuryWasActive = true;
    this.ctx.scoring.eclipseFactor = rules.century.scoreFactor;
    this.ctx.bus.emit("mode", { kind: "centuryStart" });
    this.ctx.sfx("bank");
    this.ctx.shake(0.006);
    const frames = this.ctx.baked("century");
    this.ctx.push(
      frames
        ? new BakedDmdScene(frames, 8, "ALL SCORES X2", 1.0)
        : new MessageScene([["THE CENTURY BLOOM", "EVERY LAMP ON  X2"]], 1.6, true),
      3,
    );
  }

  private galleryEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < GALLERY_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity;
      this.onGallery();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onGallery(): void {
    const combo = rules.galleryCombo;
    this.galleryStep =
      this.now - this.lastGalleryAt < combo.windowS
        ? Math.min(combo.maxStep, this.galleryStep + 1)
        : 1;
    this.lastGalleryAt = this.now;
    const factor = 2 ** (this.galleryStep - 1);
    this.ctx.scoring.award(
      rules.points.orbit * factor,
      factor > 1 ? `GALLERY ×${factor}` : "THE GALLERY",
    );
  }

  /** Live ticker for the score readout (DMD pass). */
  dmdStatus(): string | undefined {
    if (this.centuryActive) return `CENTURY ${Math.ceil(this.centuryUntil - this.now)}`;
    if (this.centuryReady) return "SHOOT THE ORCHID";
    if (this.swarmActive) return `THE SWARM ${Math.ceil(this.swarmUntil - this.now)}`;
    const letters = ["M", "O", "T", "H"].map((c, i) => (this.litLanes.has(String(i + 1)) ? c : ".")).join("");
    return `${letters}  BLOOMS ${this.blooms}/${rules.bloom.blooms}`;
  }

  /** Both-flipper progress readout (DMD pass). */
  statusReport(): string[][] {
    const missing =
      `${this.blooms >= rules.bloom.blooms ? "" : "FULL BED "}${this.swarmed ? "" : "SWARM "}${this.crossPollinated ? "" : "POLLEN"}`.trim();
    return [
      [`BLOOMS ${this.blooms} OF ${rules.bloom.blooms}`, `MULTIPLIER X${this.ctx.scoring.multiplier}`],
      [
        this.swarmed ? "THE SWARM HAS FLOWN" : "RAISE THE SWARM",
        this.crossPollinated ? "POLLEN CARRIED" : "RIDE VINE TO CANOPY",
      ],
      this.centuryReady
        ? ["THE CENTURY BLOOM", "SHOOT THE ORCHID"]
        : ["FOR THE CENTURY", missing || "READY SOON"],
    ];
  }
}
