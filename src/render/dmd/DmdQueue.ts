import { DotMatrix } from "./DotMatrix";
import type { DmdScene } from "./DmdScene";

/**
 * Event → scene routing with priority interrupts (plan §5b): a queued scene
 * pre-empts the idle readout (and lower-priority scenes), then the idle
 * scene resumes. Game pushes scenes in response to EventBus events.
 */
export class DmdQueue {
  private current: { scene: DmdScene; priority: number } | null = null;

  constructor(private idle: DmdScene) {}

  setIdle(scene: DmdScene): void {
    this.idle = scene;
    scene.invalidate?.();
  }

  /** Show a scene if nothing more important is already playing. */
  push(scene: DmdScene, priority = 1): void {
    if (!this.current || priority >= this.current.priority) {
      this.current = { scene, priority };
    }
  }

  clear(): void {
    this.current = null;
    this.idle.invalidate?.();
  }

  update(dt: number, dmd: DotMatrix): void {
    if (this.current) {
      if (this.current.scene.update(dt, dmd)) {
        this.current = null;
        this.idle.invalidate?.();
      } else {
        return;
      }
    }
    this.idle.update(dt, dmd);
  }
}
