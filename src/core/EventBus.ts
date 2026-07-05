/**
 * Typed pub/sub bus. Physics sensor contacts, scoring, audio, effects and the
 * DMD all communicate through here (plan §3) — no direct cross-module calls.
 */
export interface GameEvents {
  /** The ball touched a sensor fixture; kind/id come from the fixture tag. */
  sensor: {
    kind: string;
    id?: string;
    toLayer?: number;
    upOnly?: boolean;
    bounds?: { cx: number; cy: number; hw: number; hh: number };
  };
  /** The ball struck a solid scoring element (bumper, sling, drop target). */
  hit: { kind: string; id: string };
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
