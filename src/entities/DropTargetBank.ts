import { Body, Box, Fixture, Vec2, World } from "planck";
import { EventBus } from "../core/EventBus";
import type { PhysicsWorld, FixtureTag } from "../core/PhysicsWorld";
import { DROP_TARGETS } from "../table/geometry";

interface Target {
  id: string;
  y: number;
  up: boolean;
  fixture: Fixture | null;
}

const RESET_DELAY = 1.2; // s after the last target drops

/**
 * A bank of drop targets: each hit destroys that target's fixture (post-step
 * — the world is locked during the contact). When all are down the bank
 * emits `bankComplete` and resets after a delay.
 */
export class DropTargetBank {
  readonly body: Body;
  readonly targets: Target[];
  private resetTimer = 0;

  constructor(
    world: World,
    private physics: PhysicsWorld,
    private bus: EventBus,
  ) {
    this.body = world.createBody();
    this.targets = DROP_TARGETS.ys.map((y, i) => {
      const t: Target = { id: String(i + 1), y, up: false, fixture: null };
      return t;
    });
    for (const t of this.targets) this.raise(t);
  }

  /** Route a `hit` event with kind "target" here. */
  onHit(id: string): void {
    const t = this.targets.find((t) => t.id === id);
    if (!t || !t.up) return;
    t.up = false;
    this.physics.queuePostStep(() => {
      if (t.fixture) this.body.destroyFixture(t.fixture);
      t.fixture = null;
    });
    if (this.targets.every((t) => !t.up)) {
      this.bus.emit("bankComplete", {});
      this.resetTimer = RESET_DELAY;
    }
  }

  update(dt: number): void {
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) {
        this.physics.queuePostStep(() => {
          for (const t of this.targets) if (!t.up) this.raise(t);
        });
      }
    }
  }

  private raise(t: Target): void {
    t.up = true;
    t.fixture = this.body.createFixture({
      shape: new Box(DROP_TARGETS.hw, DROP_TARGETS.hh, new Vec2(DROP_TARGETS.x, t.y), 0),
      restitution: 0.2,
      friction: 0.1,
      userData: { kind: "target", id: t.id } satisfies FixtureTag,
    });
  }
}
