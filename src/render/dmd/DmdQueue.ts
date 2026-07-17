import { DotMatrix } from "./DotMatrix";
import type { DmdScene } from "./DmdScene";

/**
 * Event → scene routing with priority interrupts (plan §5b): a queued scene
 * pre-empts the idle readout (and lower-priority scenes), then the idle
 * scene resumes. Game pushes scenes in response to EventBus events.
 */
export class DmdQueue {
  /** Wipe length (s) when one scene replaces another (DMD pass). */
  private static readonly WIPE_S = 0.16;

  private current: { scene: DmdScene; priority: number } | null = null;
  private wipe: { old: Uint8Array; t: number } | null = null;
  private pendingWipe = false;

  constructor(private idle: DmdScene) {}

  setIdle(scene: DmdScene): void {
    this.idle = scene;
    scene.invalidate?.();
  }

  /** Show a scene if nothing more important is already playing. */
  push(scene: DmdScene, priority = 1): void {
    if (!this.current || priority >= this.current.priority) {
      if (this.current?.scene !== scene) this.pendingWipe = true;
      this.current = { scene, priority };
    }
  }

  clear(): void {
    this.current = null;
    this.wipe = null;
    this.pendingWipe = false;
    this.idle.invalidate?.();
  }

  update(dt: number, dmd: DotMatrix): void {
    // a scene change begins a left-to-right wipe: snapshot the outgoing
    // frame BEFORE the incoming scene draws over it
    if (this.pendingWipe) {
      this.pendingWipe = false;
      this.wipe = { old: dmd.copyGrid(), t: 0 };
    }
    const active = this.current?.scene ?? this.idle;
    // during a wipe the active scene must redraw fully each frame (the
    // overlay corrupts its cached grid)
    if (this.wipe) active.invalidate?.();
    if (this.current) {
      if (this.current.scene.update(dt, dmd)) {
        this.current = null;
        this.idle.invalidate?.();
        this.pendingWipe = true; // wipe back to the idle readout too
        this.idle.update(0, dmd);
      }
    } else {
      this.idle.update(dt, dmd);
    }
    if (this.wipe) {
      this.wipe.t += dt;
      const col = Math.ceil((this.wipe.t / DmdQueue.WIPE_S) * 128);
      if (this.wipe.t >= DmdQueue.WIPE_S) this.wipe = null;
      else dmd.overlayFrom(this.wipe.old, col);
    }
  }
}
