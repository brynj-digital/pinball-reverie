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

/** Idle scene during play: live score, ball number, multiplier. */
export class ScoreScene implements DmdScene {
  private lastScore = -1;
  private lastBall = -1;
  private lastMult = -1;

  constructor(
    private read: () => { score: number; ball: number; mult: number },
  ) {}

  invalidate(): void {
    this.lastScore = -1;
  }

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    // numeric comparison first — no per-frame string formatting when idle
    if (s.score === this.lastScore && s.ball === this.lastBall && s.mult === this.lastMult)
      return false;
    this.lastScore = s.score;
    this.lastBall = s.ball;
    this.lastMult = s.mult;
    dmd.clear();
    dmd.centerText(fmtScore(s.score), 5, 3);
    dmd.centerText(`BALL ${s.ball}${s.mult > 1 ? `  ×${s.mult}` : ""}`, 20, 2);
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

/** Attract-mode loop: title, prompt, high score. Never finishes. */
export class AttractScene implements DmdScene {
  private t = 0;
  private drawnPage = -1;

  constructor(
    private top: () => { initials: string; score: number } | undefined,
    private title = "PINBALL REVERIE",
    /** >1 adds the table-select teaser page (flippers browse in attract). */
    private tableCount = 1,
  ) {}

  invalidate(): void {
    this.drawnPage = -1;
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    const top = this.top();
    const pages: string[][] = [
      [this.title, "PINBALL REVERIE"],
      ["PRESS ENTER", "TO PLAY"],
      ...(this.tableCount > 1
        ? [[`${this.tableCount} TABLES`, "FLIPPERS TO BROWSE"]]
        : []),
      ["HIGH SCORE", top ? `${top.initials}  ${fmtScore(top.score)}` : fmtScore(0)],
    ];
    const page = Math.floor(this.t / 2.4) % pages.length;
    if (page !== this.drawnPage) {
      this.drawnPage = page;
      dmd.clear();
      dmd.centerText(pages[page][0], 4, 3);
      dmd.centerText(pages[page][1], 19, 2);
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
