/**
 * Vertical scroll following the ball, clamped to the table (plan §3).
 * Pure data + math; the renderer derives its transform from (y, viewH).
 */
export class Camera {
  /** Top edge of the visible window, in table metres. */
  y = 0;

  constructor(
    readonly tableW: number,
    readonly tableH: number,
    public viewH: number,
  ) {}

  follow(targetY: number, dt: number): void {
    const maxY = Math.max(0, this.tableH - this.viewH);
    const desired = Math.min(maxY, Math.max(0, targetY - this.viewH * 0.55));
    this.y += (desired - this.y) * Math.min(1, dt * 8);
  }
}
