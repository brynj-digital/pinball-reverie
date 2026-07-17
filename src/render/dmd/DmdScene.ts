import { DotMatrix } from "./DotMatrix";

/**
 * A playable DMD sequence (plan §5b). update() draws into the DotMatrix and
 * returns true when finished; idle scenes never finish. Baked Claude Design
 * sprite scenes join in Milestone 5 behind this same interface.
 */
export interface DmdScene {
  update(dt: number, dmd: DotMatrix): boolean;
  /** Force a full redraw (called when an interrupting scene ends). */
  invalidate?(): void;
}

export function fmtScore(n: number): string {
  return n.toLocaleString("en-US"); // thousands commas; the 5×7 font has a ',' glyph
}

/** Idle scene during play: tall-digit score, ball line, and the table's
 * live status ticker (DMD pass — TableLogic.dmdStatus). */
export class ScoreScene implements DmdScene {
  private lastKey = "";

  constructor(
    private read: () => { score: number; ball: number; mult: number },
    private status?: () => string | undefined,
  ) {}

  invalidate(): void {
    this.lastKey = "";
  }

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    const st = this.status?.() ?? "";
    const key = `${s.score}|${s.ball}|${s.mult}|${st}`;
    if (key === this.lastKey) return false;
    this.lastKey = key;
    dmd.clear();
    dmd.centerBigText(fmtScore(s.score), 1, 3);
    dmd.centerText(`BALL ${s.ball}${s.mult > 1 ? `  ×${s.mult}` : ""}`, 16, 2);
    if (st) dmd.centerText(st, 25, 2);
    return false;
  }
}

/** One or more pages of centered text, optionally blinking; finite. */
export class MessageScene implements DmdScene {
  private t = 0;
  private drawnKey = "";

  constructor(
    private pages: string[][],
    private perPage = 1.4,
    private blink = false,
  ) {}

  invalidate(): void {
    this.drawnKey = "";
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    const page = Math.floor(this.t / this.perPage);
    if (page >= this.pages.length) return true;
    const on = !this.blink || Math.floor(this.t / 0.22) % 2 === 0;
    const key = `${page}|${on}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      dmd.clear();
      if (on) {
        const lines = this.pages[page];
        if (lines.length === 1) dmd.centerText(lines[0], 12, 3);
        else {
          dmd.centerText(lines[0], 4, 3);
          dmd.centerText(lines[1], 19, 2);
        }
      }
    }
    return false;
  }
}

/**
 * A baked animation (frames from bake.ts) with an optional caption row —
 * the runtime form of Claude Design-authored event scenes (plan §5c).
 */
export class BakedDmdScene implements DmdScene {
  private t = 0;
  private lastFrame = -1;

  constructor(
    private frames: Uint8Array[],
    private fps: number,
    private caption?: string,
    private holdS = 0.7,
    /** If set, frames cycle for this many seconds instead of playing once. */
    private loopForS?: number,
    private captionY = 24,
  ) {}

  invalidate(): void {
    this.lastFrame = -1;
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    const total = this.loopForS ?? this.frames.length / this.fps + this.holdS;
    if (this.t >= total) return true;
    const raw = Math.floor(this.t * this.fps);
    const idx = this.loopForS
      ? raw % this.frames.length
      : Math.min(this.frames.length - 1, raw);
    if (idx !== this.lastFrame) {
      this.lastFrame = idx;
      dmd.blit(this.frames[idx]);
      if (this.caption) dmd.centerText(this.caption, this.captionY, 2);
    }
    return false;
  }
}

/** Play scenes back to back; finishes when the last one does. */
export class SequenceScene implements DmdScene {
  private i = 0;

  constructor(private scenes: DmdScene[]) {}

  invalidate(): void {
    this.scenes[this.i]?.invalidate?.();
  }

  update(dt: number, dmd: DotMatrix): boolean {
    while (this.i < this.scenes.length) {
      if (!this.scenes[this.i].update(dt, dmd)) return false;
      this.i++;
    }
    return true;
  }
}

/**
 * End-of-game match sequence (M12): the classic free-game lottery. The
 * board flap-cycles two-digit multiples of ten, slowing, then settles on
 * `final`; matching the player's last two score digits wins. Purely
 * ceremonial in a coinless machine — the payoff is the knocker moment
 * (Game plays it via onSettle) and the FREE GAME flash.
 */
export class MatchScene implements DmdScene {
  /** Spin phase length (s); total duration = SPIN + hold. */
  private static readonly SPIN = 2.2;

  static duration(win: boolean): number {
    return MatchScene.SPIN + (win ? 2.4 : 1.2);
  }

  private t = 0;
  private settled = false;
  private drawnKey = "";

  constructor(
    private playerDigits: number,
    private final: number,
    private win: boolean,
    private onSettle?: () => void,
  ) {}

  invalidate(): void {
    this.drawnKey = "";
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    if (this.t >= MatchScene.duration(this.win)) return true;
    const spinning = this.t < MatchScene.SPIN;
    let shown: number;
    if (spinning) {
      // flap cadence eases from fast to slow across the spin
      const u = this.t / MatchScene.SPIN;
      const flaps = Math.floor((2 * u - u * u) * 22);
      shown = ((flaps * 3 + 7) % 10) * 10; // decorative shuffle of the tens
    } else {
      shown = this.final;
      if (!this.settled) {
        this.settled = true;
        this.onSettle?.();
      }
    }
    const blinkOn = spinning || !this.win || Math.floor(this.t / 0.25) % 2 === 0;
    const key = `${shown}|${blinkOn}|${spinning}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      dmd.clear();
      dmd.centerText("MATCH", 1, 2);
      if (blinkOn) dmd.centerText(String(shown).padStart(2, "0"), 12, 3);
      dmd.centerText(
        !spinning && this.win
          ? "FREE GAME"
          : `YOURS ${String(this.playerDigits).padStart(2, "0")}`,
        24,
        2, // dot LEVEL, not a size — 1 is near-invisible on the glass
      );
    }
    return false;
  }
}

/**
 * End-of-ball bonus count-up (DMD pass): the classic tally — units tick
 * up with sfx pips, the multiplier slams in, then the tall-digit total.
 */
export class BonusScene implements DmdScene {
  private t = 0;
  private lastKey = "";
  private ticked = -1;
  private readonly countS: number;
  private readonly totalS: number;

  constructor(
    private units: number,
    private mult: number,
    private total: number,
    private onTick?: () => void,
  ) {
    this.countS = Math.min(1.5, Math.max(0.5, units * 0.012));
    this.totalS = 0.4 + this.countS + (mult > 1 ? 0.7 : 0) + 1.3;
  }

  invalidate(): void {
    this.lastKey = "";
  }

  static duration(units: number, mult: number): number {
    const countS = Math.min(1.5, Math.max(0.5, units * 0.012));
    return 0.4 + countS + (mult > 1 ? 0.7 : 0) + 1.3;
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    if (this.t >= this.totalS) return true;
    const countT = Math.min(1, Math.max(0, (this.t - 0.4) / this.countS));
    const shown = Math.round(this.units * countT);
    // pip roughly every counted 6% — audible ticking without sfx spam
    const tick = Math.floor(countT * 16);
    if (tick !== this.ticked && countT > 0 && countT < 1) {
      this.ticked = tick;
      this.onTick?.();
    }
    const multIn = this.mult > 1 && this.t >= 0.4 + this.countS + 0.25;
    const slam = this.t >= 0.4 + this.countS + (this.mult > 1 ? 0.7 : 0.25);
    const blinkOn = !slam || Math.floor(this.t / 0.2) % 2 === 0;
    const key = `${shown}|${multIn}|${slam}|${blinkOn}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      dmd.clear();
      dmd.centerText("BONUS", 0, 2);
      if (!slam) {
        dmd.centerBigText(fmtScore(shown), 10, 3);
        if (multIn) dmd.centerText(`× ${this.mult}`, 25, 3);
      } else if (blinkOn) {
        dmd.centerBigText(fmtScore(this.total), 10, 3);
        if (this.mult > 1) dmd.centerText(`${fmtScore(this.units)} × ${this.mult}`, 25, 2);
      }
    }
    return false;
  }
}

/** Firework bursts (DMD pass): new high score / replay celebration. */
export class FireworksScene implements DmdScene {
  private t = 0;
  private bursts: { x: number; y: number; born: number; rays: number }[] = [];
  private nextBurst = 0;

  constructor(
    private caption: string,
    private durationS = 2.8,
  ) {}

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    if (this.t >= this.durationS) return true;
    if (this.t >= this.nextBurst && this.t < this.durationS - 0.8) {
      this.nextBurst = this.t + 0.34;
      this.bursts.push({
        x: 12 + Math.random() * 104,
        y: 4 + Math.random() * 14,
        born: this.t,
        rays: 7 + Math.floor(Math.random() * 4),
      });
    }
    dmd.clear();
    for (const b of this.bursts) {
      const age = this.t - b.born;
      if (age > 1.0) continue;
      const r = age * 16;
      const lv = age < 0.35 ? 4 : age < 0.7 ? 2 : 1;
      for (let i = 0; i < b.rays; i++) {
        const a = (i / b.rays) * Math.PI * 2;
        dmd.set(Math.round(b.x + Math.cos(a) * r), Math.round(b.y + Math.sin(a) * r * 0.6), lv);
        if (age > 0.3)
          dmd.set(
            Math.round(b.x + Math.cos(a) * r * 0.6),
            Math.round(b.y + Math.sin(a) * r * 0.36),
            1,
          );
      }
    }
    const on = Math.floor(this.t / 0.24) % 2 === 0;
    if (on) dmd.centerText(this.caption, 24, 3);
    return false;
  }
}

/**
 * Attract-mode show reel (DMD pass): title/prompt cards, per-table rules
 * teasers, the baked-scene reel, and a top-scores table. Never finishes.
 */
export class AttractScene implements DmdScene {
  private t = 0;
  private drawnKey = "";

  constructor(
    private top: () => { initials: string; score: number }[],
    private title = "PINBALL REVERIE",
    /** >1 adds the table-select teaser page (flippers browse in attract). */
    private tableCount = 1,
    /** Per-table rules-teaser cards (TableSpec.attractTips). */
    private tips: string[][] = [],
    /** Baked scene strips to loop between the text cards. */
    private reel: () => Uint8Array[][] = () => [],
  ) {}

  invalidate(): void {
    this.drawnKey = "";
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    const strips = this.reel().slice(0, 3);
    type Page = { dur: number; draw: (tLocal: number) => string };
    const text = (a: string, b: string): Page => ({
      dur: 2.4,
      draw: () => {
        dmd.clear();
        dmd.centerText(a, 4, 3);
        dmd.centerText(b, 19, 2);
        return `${a}|${b}`;
      },
    });
    const pages: Page[] = [
      text(this.title, "PINBALL REVERIE"),
      text("PRESS ENTER", "TO PLAY"),
      ...(this.tableCount > 1 ? [text(`${this.tableCount} TABLES`, "FLIPPERS TO BROWSE")] : []),
      ...strips.map(
        (frames): Page => ({
          dur: 2.8,
          draw: (tLocal) => {
            const idx = Math.floor(tLocal * 10) % frames.length;
            dmd.blit(frames[idx]);
            return `reel${idx}`;
          },
        }),
      ),
      ...this.tips.map((tip) => text(tip[0], tip[1] ?? "")),
      {
        dur: 3.2,
        draw: () => {
          const list = this.top().slice(0, 3);
          dmd.clear();
          dmd.centerText("HIGH SCORES", 0, 3);
          if (list.length === 0) dmd.centerText("BE THE FIRST", 14, 2);
          list.forEach((e, i) =>
            dmd.centerText(`${i + 1} ${e.initials} ${fmtScore(e.score)}`, 9 + i * 8, 2),
          );
          return `scores${list.map((e) => e.score).join(",")}`;
        },
      },
    ];
    const total = pages.reduce((a, p) => a + p.dur, 0);
    let tl = this.t % total;
    let page = pages[0];
    let idx = 0;
    for (const p of pages) {
      if (tl < p.dur) {
        page = p;
        break;
      }
      tl -= p.dur;
      idx++;
    }
    // draw() returns a content key; only mark drawn when it changes
    const probeKey = `${idx}|${Math.floor(tl * 10)}`;
    if (probeKey !== this.drawnKey) {
      this.drawnKey = probeKey;
      page.draw(tl);
    }
    return false;
  }
}

/**
 * High-score initials entry: flippers cycle the letter, plunger/start
 * confirms it. Game owns the entry state; this renders it. Never finishes —
 * Game leaves the phase when the third letter confirms.
 */
export class InitialsScene implements DmdScene {
  private t = 0;
  private last = "";

  constructor(
    private read: () => { letters: string[]; slot: number; score: number },
  ) {}

  invalidate(): void {
    this.last = "";
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    const s = this.read();
    const blinkOn = Math.floor(this.t / 0.28) % 2 === 0;
    const shown = s.letters.map((ch, i) => (i === s.slot && !blinkOn ? " " : ch)).join(" ");
    // footer cycles hints / score — combined they overflow the 21-glyph
    // display width for any qualifying score and would clip
    const page = Math.floor(this.t / 1.6) % 3;
    const footer =
      page === 0 ? "FLIPPERS·PLUNGER" : page === 1 ? "OR TYPE A-Z" : fmtScore(s.score);
    const key = `${shown}|${s.slot}|${footer}`;
    if (key !== this.last) {
      this.last = key;
      dmd.clear();
      dmd.centerText("ENTER INITIALS", 1, 2);
      dmd.centerText(shown, 12, 3);
      dmd.centerText(footer, 24, 1);
    }
    return false;
  }
}
