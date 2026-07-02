import { FONT_5X7, GLYPH_W } from "./font5x7";

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

  centerText(str: string, y: number, level: number): void {
    this.text(str, Math.floor((DMD_COLS - (str.length * GLYPH_W - 1)) / 2), y, level);
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
