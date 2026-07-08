import { loadSvgAt } from "../render/svgImage";
import { fmtScore } from "../render/dmd/DmdScene";
import { HighScores } from "../game/HighScores";
import { TABLE_ORDER, TABLE_SPECS, type TableId } from "../table/specs";
import { TABLE_ASSETS } from "../table/assets";

/** Abandoned browsing returns to plain attract after this long. */
const IDLE_CLOSE_S = 12;

/**
 * Attract-mode table select (M10): the choice is made from the backglass
 * art — one lit backglass card per registered table, like walking the
 * arcade aisle. Game drives it from attract-phase input: flippers/arrows
 * (or a click) move the focus, plunger/start confirms — the current table
 * starts a game directly, another table persists the id and reloads, per
 * the table-swap-by-reload contract (see main.ts). Browsing itself never
 * reloads: the backglass SVGs are already bundled, so previews are free.
 */
export class TableSelect {
  open = false;

  private root: HTMLDivElement;
  private cards = new Map<TableId, HTMLDivElement>();
  private hint: HTMLParagraphElement;
  private focused: TableId;
  private idleTimer: number | undefined;
  private switching = false;

  constructor(
    private current: TableId,
    private onPlay: () => void,
    private onSwitch: (id: TableId) => void,
    private sfx: (name: "rollover" | "target") => void,
  ) {
    this.focused = current;
    this.root = document.createElement("div");
    this.root.className = "tablesel-overlay";
    this.root.style.display = "none";

    const title = document.createElement("h2");
    title.textContent = "SELECT TABLE";
    this.root.appendChild(title);

    const row = document.createElement("div");
    row.className = "tablesel-row";
    this.root.appendChild(row);

    for (const id of TABLE_ORDER) {
      const spec = TABLE_SPECS[id];
      const card = document.createElement("div");
      card.className = "tablesel-card";

      // backglass masters are 300×360; rasterize at 2× display size so the
      // art stays crisp on high-DPR screens (same trick as the side panel)
      loadSvgAt(TABLE_ASSETS[id].backglassSvg, 520, 624, (img) => {
        card.prepend(img);
      }, `${id} backglass`);

      const name = document.createElement("div");
      name.className = "tablesel-name";
      name.textContent = spec.name;
      const tag = document.createElement("div");
      tag.className = "tablesel-tag";
      tag.textContent = spec.tagline;
      const score = document.createElement("div");
      score.className = "tablesel-score";
      const top = new HighScores(spec.highScoreKey).top;
      score.textContent = top ? `HI  ${top.initials}  ${fmtScore(top.score)}` : "NO SCORES YET";
      card.append(name, tag, score);

      card.onclick = () => {
        if (!this.open || this.switching) return;
        if (this.focused === id) this.confirm();
        else this.focus(id);
      };
      this.cards.set(id, card);
      row.appendChild(card);
    }

    this.hint = document.createElement("p");
    this.hint.className = "tablesel-hint";
    this.root.appendChild(this.hint);

    document.body.appendChild(this.root);
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.focused = this.current; // always reopen on what's installed
    this.applyFocus();
    this.hint.textContent = "FLIPPERS CHOOSE · PLUNGER PLAYS · ESC BACKS OUT";
    this.root.style.display = "flex";
    this.sfx("rollover");
    this.armIdleClose();
  }

  hide(): void {
    if (this.switching) return; // reload underway — don't blank the loading hint
    this.open = false;
    this.root.style.display = "none";
    if (this.idleTimer !== undefined) window.clearTimeout(this.idleTimer);
  }

  cycle(dir: -1 | 1): void {
    const next = TABLE_ORDER[(TABLE_ORDER.indexOf(this.focused) + dir + TABLE_ORDER.length) % TABLE_ORDER.length];
    this.focus(next);
  }

  /** Plunger/start on the focused card: play it, or switch the machine. */
  confirm(): void {
    if (this.switching) return;
    if (this.focused === this.current) {
      this.hide();
      this.onPlay();
      return;
    }
    this.switching = true;
    this.sfx("target");
    this.hint.textContent = `LOADING ${TABLE_SPECS[this.focused].name.toUpperCase()}…`;
    this.onSwitch(this.focused);
  }

  private focus(id: TableId): void {
    if (id === this.focused) return;
    this.focused = id;
    this.applyFocus();
    this.sfx("rollover");
    this.armIdleClose();
  }

  private applyFocus(): void {
    for (const [id, card] of this.cards) card.classList.toggle("focused", id === this.focused);
  }

  private armIdleClose(): void {
    if (this.idleTimer !== undefined) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.hide(), IDLE_CLOSE_S * 1000);
  }
}
