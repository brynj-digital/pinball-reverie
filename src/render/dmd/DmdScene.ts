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
  private last = "";

  constructor(
    private read: () => { score: number; ball: number; mult: number },
  ) {}

  invalidate(): void {
    this.last = "";
  }

  update(_dt: number, dmd: DotMatrix): boolean {
    const s = this.read();
    const line1 = fmtScore(s.score);
    const line2 = `BALL ${s.ball}${s.mult > 1 ? `  ×${s.mult}` : ""}`;
    const key = `${line1}|${line2}`;
    if (key !== this.last) {
      this.last = key;
      dmd.clear();
      dmd.centerText(line1, 5, 3);
      dmd.centerText(line2, 20, 2);
    }
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
  ) {}

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    if (this.t >= this.frames.length / this.fps + this.holdS) return true;
    const idx = Math.min(this.frames.length - 1, Math.floor(this.t * this.fps));
    if (idx !== this.lastFrame) {
      this.lastFrame = idx;
      dmd.blit(this.frames[idx]);
      if (this.caption) dmd.centerText(this.caption, 24, 2);
    }
    return false;
  }
}

/** Attract-mode loop: title, prompt, high score. Never finishes. */
export class AttractScene implements DmdScene {
  private t = 0;
  private drawnPage = -1;

  constructor(private topScore: () => number) {}

  invalidate(): void {
    this.drawnPage = -1;
  }

  update(dt: number, dmd: DotMatrix): boolean {
    this.t += dt;
    const pages: string[][] = [
      ["MOONDIAL", "PINBALL REVERIE"],
      ["PRESS ENTER", "TO PLAY"],
      ["HIGH SCORE", fmtScore(this.topScore())],
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
