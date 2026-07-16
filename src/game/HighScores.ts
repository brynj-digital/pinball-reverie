/** Top-5 high scores with initials, in localStorage — one list per table. */
const MAX = 5;

export interface ScoreEntry {
  initials: string;
  score: number;
}

export class HighScores {
  private scores: ScoreEntry[] = [];

  constructor(private key: string) {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(this.key);
        if (raw) {
          this.scores = (JSON.parse(raw) as ScoreEntry[]).slice(0, MAX);
        } else if (this.key === "pinball-highscores-v2") {
          // migrate the pre-initials v1 format (plain numbers, Moondial era)
          const old = localStorage.getItem("pinball-highscores-v1");
          if (old)
            this.scores = (JSON.parse(old) as number[])
              .slice(0, MAX)
              .map((score) => ({ initials: "---", score }));
        } else if (this.key === "pinball-highscores-smallhours-v1") {
          // migrate the table-5 rename (Night Waves -> Small Hours, 2026-07-17)
          const old = localStorage.getItem("pinball-highscores-nightwaves-v1");
          if (old) this.scores = (JSON.parse(old) as ScoreEntry[]).slice(0, MAX);
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
      if (typeof localStorage !== "undefined") localStorage.setItem(this.key, JSON.stringify(this.scores));
    } catch {
      // persistence is best-effort
    }
  }
}
