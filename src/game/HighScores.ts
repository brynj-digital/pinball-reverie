/** Top-5 high scores in localStorage (initials entry is later polish). */
const KEY = "pinball-highscores-v1";
const MAX = 5;

export class HighScores {
  private scores: number[] = [];

  constructor() {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(KEY);
        if (raw) this.scores = (JSON.parse(raw) as number[]).slice(0, MAX);
      }
    } catch {
      // unreadable storage — start fresh
    }
  }

  get top(): number {
    return this.scores[0] ?? 0;
  }

  /** Record a finished game; returns true if it made the table. */
  submit(score: number): boolean {
    if (score <= 0) return false;
    const qualifies = this.scores.length < MAX || score > this.scores[this.scores.length - 1];
    if (!qualifies) return false;
    this.scores.push(score);
    this.scores.sort((a, b) => b - a);
    this.scores = this.scores.slice(0, MAX);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(this.scores));
    } catch {
      // persistence is best-effort
    }
    return true;
  }
}
