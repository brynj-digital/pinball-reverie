import { EventBus } from "../core/EventBus";

/**
 * Spinner: a bar across the orbit lane. Physically it's only a sensor — the
 * ball passes through and sets it spinning; each half-turn emits a
 * spinnerTick for scoring while the spin decays. The renderer fakes the
 * rotation by drawing the bar's projected thickness from `angle`.
 */
export class Spinner {
  angle = 0;
  private angularVel = 0;

  constructor(private bus: EventBus) {}

  /** Normalised spin intensity, 0..1 — drives the renderer's glow. */
  get spin01(): number {
    return Math.min(1, Math.abs(this.angularVel) / 60);
  }

  /** Called when the ball crosses the spinner sensor. */
  trip(ballVy: number): void {
    // spin with the ball's direction of travel through the lane
    this.angularVel = Math.max(-90, Math.min(90, -ballVy * 40));
  }

  update(dt: number): void {
    if (Math.abs(this.angularVel) < 0.8) {
      this.angularVel = 0;
      return;
    }
    const before = Math.floor(this.angle / Math.PI);
    this.angle += this.angularVel * dt;
    this.angularVel *= Math.exp(-dt * 1.6); // friction spin-down
    // one tick per half-turn actually crossed — a slow or hitched frame can
    // span several, and a boolean check would undercount on slow machines
    const crossings = Math.abs(Math.floor(this.angle / Math.PI) - before);
    for (let i = 0; i < crossings; i++) this.bus.emit("spinnerTick", {});
  }
}
