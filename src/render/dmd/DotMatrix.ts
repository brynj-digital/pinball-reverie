import { FONT_5X7, GLYPH_W } from "./font5x7";

/**
 * Tall numerals for the score readout (DMD pass, 2026-07-17): 8×12 digits
 * plus a narrow comma, the double-height look of real 90s displays. Rows
 * are bit patterns, MSB = left column.
 */
const BIG_DIGITS: Record<string, number[]> = {
  "0": [0x3c, 0x66, 0xc3, 0xc3, 0xc3, 0xc3, 0xc3, 0xc3, 0xc3, 0xc3, 0x66, 0x3c],
  "1": [0x18, 0x38, 0x78, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x7e],
  "2": [0x3c, 0x66, 0xc3, 0x03, 0x03, 0x06, 0x0c, 0x18, 0x30, 0x60, 0xc0, 0xff],
  "3": [0x3c, 0x66, 0xc3, 0x03, 0x06, 0x1c, 0x1c, 0x06, 0x03, 0xc3, 0x66, 0x3c],
  "4": [0x06, 0x0e, 0x1e, 0x36, 0x66, 0xc6, 0xc6, 0xff, 0x06, 0x06, 0x06, 0x06],
  "5": [0xff, 0xc0, 0xc0, 0xc0, 0xfc, 0xe6, 0x03, 0x03, 0x03, 0xc3, 0x66, 0x3c],
  "6": [0x1c, 0x30, 0x60, 0xc0, 0xfc, 0xe6, 0xc3, 0xc3, 0xc3, 0xc3, 0x66, 0x3c],
  "7": [0xff, 0x03, 0x03, 0x06, 0x06, 0x0c, 0x0c, 0x18, 0x18, 0x30, 0x30, 0x30],
  "8": [0x3c, 0x66, 0xc3, 0xc3, 0x66, 0x3c, 0x3c, 0x66, 0xc3, 0xc3, 0x66, 0x3c],
  "9": [0x3c, 0x66, 0xc3, 0xc3, 0xc3, 0x67, 0x3f, 0x03, 0x03, 0x06, 0x0c, 0x38],
};
const BIG_COMMA = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0x60, 0x60, 0xc0];
const BIG_W = 8;
const BIG_COMMA_W = 4;
export const BIG_H = 12;

/**
 * The LED dot-matrix surface (plan §5b): a 128×32 grid of 4-level amber dots
 * drawn to its own offscreen canvas. Renderer-agnostic — the 2D renderer
 * blits the canvas; a 3D renderer would map it onto the cabinet mesh.
 *
 * Dots render from per-level baked sprites (lit dots include their bloom),
 * and the surface only repaints when the grid actually changed.
 */
export const DMD_COLS = 128;
export const DMD_ROWS = 32;
const SCALE = 4; // px per dot on the offscreen canvas

/** Token amber ramp (style guide §6): off, dim, mid, lit. */
const LEVELS = ["#1a0e08", "#4a2410", "#c4671b", "#ffb637"] as const;

export class DotMatrix {
  readonly canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private grid = new Uint8Array(DMD_COLS * DMD_ROWS);
  private dirty = true;
  private sprites: HTMLCanvasElement[];
  /** The all-off panel (bg + every level-0 dot), baked once — repaints blit
   * this and then stamp only the lit dots (~10× fewer draw calls). */
  private unlitPanel: HTMLCanvasElement;

  constructor() {
    this.canvas.width = DMD_COLS * SCALE;
    this.canvas.height = DMD_ROWS * SCALE;
    this.sprites = LEVELS.map((color, lv) => {
      const c = document.createElement("canvas");
      c.width = c.height = SCALE * 2; // room for the lit dot's bloom
      const g = c.getContext("2d")!;
      const mid = SCALE;
      if (lv === 3) {
        g.shadowColor = color;
        g.shadowBlur = SCALE * 0.9;
      }
      g.beginPath();
      g.arc(mid, mid, SCALE * 0.36, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      if (lv === 3) {
        g.shadowBlur = 0;
        g.beginPath();
        g.arc(mid - 0.5, mid - 0.5, SCALE * 0.17, 0, Math.PI * 2);
        g.fillStyle = "#ffe29a";
        g.fill();
      }
      return c;
    });

    this.unlitPanel = document.createElement("canvas");
    this.unlitPanel.width = this.canvas.width;
    this.unlitPanel.height = this.canvas.height;
    const g = this.unlitPanel.getContext("2d")!;
    g.fillStyle = "#0f0805";
    g.fillRect(0, 0, this.unlitPanel.width, this.unlitPanel.height);
    for (let y = 0; y < DMD_ROWS; y++)
      for (let x = 0; x < DMD_COLS; x++)
        g.drawImage(this.sprites[0], x * SCALE - SCALE, y * SCALE - SCALE);
  }

  clear(): void {
    this.grid.fill(0);
    this.dirty = true;
  }

  /** Copy a whole baked frame onto the grid. */
  blit(levels: Uint8Array): void {
    this.grid.set(levels);
    this.dirty = true;
  }

  set(x: number, y: number, level: number): void {
    if (x < 0 || x >= DMD_COLS || y < 0 || y >= DMD_ROWS) return;
    this.grid[y * DMD_COLS + x] = level;
    this.dirty = true;
  }

  text(str: string, x: number, y: number, level: number): void {
    for (const ch of str.toUpperCase()) {
      const glyph = FONT_5X7[ch] ?? FONT_5X7[" "];
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 5; c++)
          if (glyph[r] & (1 << (4 - c))) this.set(x + c, y + r, level);
      x += GLYPH_W;
    }
  }

  /** Width (dots) of a big-digit string (digits + commas only). */
  static bigWidth(str: string): number {
    let w = 0;
    for (const ch of str) w += (ch === "," ? BIG_COMMA_W : BIG_W) + 1;
    return w - 1;
  }

  /** Tall 8×12 numerals (score readout); non-digit glyphs render as commas
   * only — callers format with fmtScore. */
  bigText(str: string, x: number, y: number, level: number): void {
    for (const ch of str) {
      const glyph = ch === "," ? BIG_COMMA : BIG_DIGITS[ch];
      const w = ch === "," ? BIG_COMMA_W : BIG_W;
      if (glyph)
        for (let r = 0; r < BIG_H; r++)
          for (let c = 0; c < 8; c++)
            if (glyph[r] & (1 << (7 - c))) this.set(x + c, y + r, level);
      x += w + 1;
    }
  }

  centerBigText(str: string, y: number, level: number): void {
    this.bigText(str, Math.max(0, Math.floor((DMD_COLS - DotMatrix.bigWidth(str)) / 2)), y, level);
  }

  /** Snapshot of the current grid (DMD pass: transition wipes). */
  copyGrid(): Uint8Array {
    return this.grid.slice();
  }

  /** Restore `old` for every column >= fromCol (the un-wiped remainder). */
  overlayFrom(old: Uint8Array, fromCol: number): void {
    if (fromCol >= DMD_COLS) return;
    for (let y = 0; y < DMD_ROWS; y++) {
      const row = y * DMD_COLS;
      for (let x = Math.max(0, fromCol); x < DMD_COLS; x++) this.grid[row + x] = old[row + x];
    }
    this.dirty = true;
  }

  centerText(str: string, y: number, level: number): void {
    // clamp: an over-wide line degrades to left-aligned (clipped right only)
    // instead of a negative x that chops BOTH ends
    const x = Math.max(0, Math.floor((DMD_COLS - (str.length * GLYPH_W - 1)) / 2));
    this.text(str, x, y, level);
  }

  /** Repaint the offscreen canvas if the grid changed since the last call. */
  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const { ctx, grid, sprites } = this;
    ctx.drawImage(this.unlitPanel, 0, 0);
    for (let y = 0; y < DMD_ROWS; y++) {
      const row = y * DMD_COLS;
      for (let x = 0; x < DMD_COLS; x++) {
        const lv = grid[row + x];
        if (lv) ctx.drawImage(sprites[lv], x * SCALE - SCALE, y * SCALE - SCALE);
      }
    }
  }
}
