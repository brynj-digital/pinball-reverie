/**
 * Typed pub/sub bus. Physics sensor contacts, scoring, audio, effects and the
 * DMD all communicate through here (plan §3) — no direct cross-module calls.
 */
export interface GameEvents {
  /** A ball touched a sensor fixture; kind/id come from the fixture tag.
   * zMin/zMax (M11): the sensor's height admission band — consumers skip
   * the event when that ball's z falls outside it. ballId (M12 multiball)
   * says which live ball touched it; absent = the primary. */
  sensor: {
    kind: string;
    id?: string;
    zMin?: number;
    zMax?: number;
    ballId?: number;
  };
  /** The ball's height support changed (M11): surface names, "field",
   * "air" or "subway". Table logic keys ramp rides off these. */
  surface: { from: string; to: string; x: number; y: number; z: number };
  /** A ball struck a solid scoring element (bumper, sling, drop target). */
  hit: { kind: string; id: string; ballId?: number };
  /** One spinner rotation tick while it's spinning down. */
  spinnerTick: Record<string, never>;
  /** All targets in a bank dropped. */
  bankComplete: Record<string, never>;
  /** Mode progression (per-table TableLogic): kind strings are table-owned. */
  mode: { kind: string };
  /** Kicker award ladder step (Moondial sightings, Tidebreaker hauls). */
  telescope: { name: string; points: number; spotted: boolean };
  /** Score changed; label describes what scored (drives HUD, later the DMD). */
  score: { points: number; total: number; label: string };
  launch: { power: number };
  ballSpawn: Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers: { [K in keyof GameEvents]?: Handler<GameEvents[K]>[] } = {};

  on<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): () => void {
    const list = (this.handlers[event] ??= []) as Handler<GameEvents[K]>[];
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const list = this.handlers[event] as Handler<GameEvents[K]>[] | undefined;
    list?.forEach((fn) => fn(payload));
  }
}
