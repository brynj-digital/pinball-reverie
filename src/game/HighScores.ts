/** Top-5 high scores with initials, in localStorage. */
const KEY = "pinball-highscores-v2";
const MAX = 5;

export interface ScoreEntry {
  initials: string;
  score: number;
}

export class HighScores {
  private scores: ScoreEntry[] = [];

  constructor() {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          this.scores = (JSON.parse(raw) as ScoreEntry[]).slice(0, MAX);
        } else {
          // migrate the pre-initials v1 format (plain numbers)
          const old = localStorage.getItem("pinball-highscores-v1");
          if (old)
            this.scores = (JSON.parse(old) as number[])
              .slice(0, MAX)
              .map((score) => ({ initials: "---", score }));
        }
      }
    } catch {
      // unreadable storage — start fresh
    }
  }

  get top(): ScoreEntry | undefined {
    return this.scores[0];
  }

  qualifies(score: number): boolean {
    if (score <= 0) return false;
    return this.scores.length < MAX || score > this.scores[this.scores.length - 1].score;
  }

  add(initials: string, score: number): void {
    this.scores.push({ initials, score });
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, MAX);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(this.scores));
    } catch {
      // persistence is best-effort
    }
  }
}
