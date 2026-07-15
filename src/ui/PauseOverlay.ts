/**
 * In-play pause card: Esc freezes the game; this overlay makes the frozen
 * state visible instead of a silent freeze, and offers the only way to
 * abandon a game mid-ball (back to attract — the score is forfeited, real
 * machines don't record quit games). Reuses the settings-card chrome; the
 * buttons give touch players the same resume/exit reach as Esc.
 */
export class PauseOverlay {
  private root: HTMLDivElement;

  constructor(onResume: () => void, onExit: () => void) {
    this.root = document.createElement("div");
    this.root.className = "settings-overlay pause-overlay";
    this.root.style.display = "none";

    const card = document.createElement("div");
    card.className = "settings-card pause-card";

    const title = document.createElement("h2");
    title.textContent = "Paused";
    card.appendChild(title);

    const resume = document.createElement("button");
    resume.className = "settings-reset";
    resume.textContent = "Resume";
    resume.onclick = onResume;
    card.appendChild(resume);

    const exit = document.createElement("button");
    exit.className = "settings-reset pause-exit";
    exit.textContent = "Exit game";
    exit.onclick = onExit;
    card.appendChild(exit);

    const hint = document.createElement("p");
    hint.className = "settings-hint";
    hint.textContent = "Esc resumes · exiting forfeits the game";
    card.appendChild(hint);

    this.root.appendChild(card);
    document.body.appendChild(this.root);
  }

  setOpen(open: boolean): void {
    this.root.style.display = open ? "flex" : "none";
  }
}
