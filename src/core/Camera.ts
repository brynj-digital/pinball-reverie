/**
 * Vertical scroll following the ball, clamped to the table (plan §3).
 * Pure data + math; the renderer derives its transform from (y, viewH).
 */
export class Camera {
  /** Top edge of the visible window, in table metres. */
  y = 0;
  /** Decaying shake offsets (metres) the renderer adds to its transform. */
  shakeX = 0;
  shakeY = 0;

  private shakeMag = 0;

  constructor(
    readonly tableW: number,
    readonly tableH: number,
    public viewH: number,
  ) {}

  /** Kick the shake (nudges, big hits, tilt). Magnitude in metres. */
  shake(magnitude: number): void {
    this.shakeMag = Math.min(0.015, this.shakeMag + magnitude);
  }

  follow(targetY: number, dt: number): void {
    const maxY = Math.max(0, this.tableH - this.viewH);
    const desired = Math.min(maxY, Math.max(0, targetY - this.viewH * 0.55));
    this.y += (desired - this.y) * Math.min(1, dt * 8);

    this.shakeMag *= Math.exp(-dt * 9);
    if (this.shakeMag < 0.0003) this.shakeMag = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeMag;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeMag;
  }
}
