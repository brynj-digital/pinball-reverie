/**
 * On-screen touch control layer (plan §4.5, style guide §8). A transparent
 * overlay of pointer zones sits over the playfield and drives the same `Input`
 * a keyboard would — flippers on the lower-left/right halves, a hold-to-charge
 * plunger in the bottom-right corner, and a swipe anywhere on the open table
 * for nudge. It writes through Input's touch backend (setTouchFlipper /
 * setTouchPlunger / fireNudge) so touch and keys stay fully interchangeable.
 *
 * The root lives INSIDE the canvas's parent (#app), as a sibling of the canvas
 * rather than under document.body, so it survives Game.applyRenderMode's
 * `canvas.replaceWith(...)` swap and tracks the table column across the 2D↔3D
 * switch and orientation changes.
 */
import type { Input } from "../core/Input";
import type { Haptics } from "./Haptics";

export type TouchPref = "auto" | "on" | "off";

const STORAGE_KEY = "pinball-touch-v1";

/** Does the device report a touch/coarse pointer? */
export function touchAvailable(): boolean {
  try {
    return (
      (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches) ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
    );
  } catch {
    return false;
  }
}

/** Auto shows only on touch devices; on/off force it. */
export function resolveTouchEnabled(pref: TouchPref): boolean {
  return pref === "on" || (pref === "auto" && touchAvailable());
}

export function loadTouchPref(): TouchPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "on" || raw === "off" || raw === "auto") return raw;
  } catch {
    // fall through
  }
  return "auto";
}

export function saveTouchPref(pref: TouchPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // best-effort
  }
}

// A flick shorter than this (device px) is a tap, not a nudge; longer than the
// window (ms) is a slow drag we ignore so a resting thumb never nudges.
const SWIPE_MIN_PX = 34;
const SWIPE_MAX_MS = 500;

export class TouchControls {
  private root: HTMLDivElement;
  private enabled = false;
  private plungerZone!: HTMLDivElement; // assigned in buildPlungerZone (ctor)
  private releasePlunger: () => void = () => {};
  private plungerActive = true;

  constructor(
    private input: Input,
    container: HTMLElement,
    private hasUpper: boolean,
    private haptics: Haptics,
  ) {
    this.root = document.createElement("div");
    this.root.className = "touch-overlay";
    this.root.style.display = "none";

    // Nudge/table area first (lowest), flipper halves over it, plunger on top —
    // so a corner press routes to the plunger, not the right flipper.
    this.buildNudgeZone();
    this.buildFlipperZone("left");
    this.buildFlipperZone("right");
    this.buildPlungerZone();

    container.appendChild(this.root);
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.root.style.display = on ? "block" : "none";
    if (!on) this.input.releaseTouch();
  }

  /**
   * The plunger zone sits over the right flipper's corner, so it only
   * captures pointers while the plunger can actually act — Game gates this
   * on the ball sitting in the shooter lane (always on outside play, where
   * the plunger button starts/confirms). Inert, touches fall through to the
   * flipper zone below; a hold in flight is force-released so it can't stick.
   */
  setPlungerZoneActive(on: boolean): void {
    if (on === this.plungerActive) return;
    this.plungerActive = on;
    this.plungerZone.style.pointerEvents = on ? "auto" : "none";
    if (!on) this.releasePlunger();
  }

  private buildFlipperZone(side: "left" | "right"): void {
    const zone = document.createElement("div");
    zone.className = `touch-zone touch-flipper touch-flipper-${side}`;
    const active = new Set<number>();
    const press = (on: boolean) => {
      this.input.setTouchFlipper(side, on);
      // the right zone also works the upper flipper where a table has one,
      // mirroring the default keyboard wiring (upper shares the right keys)
      if (side === "right" && this.hasUpper) this.input.setTouchFlipper("upper", on);
      zone.classList.toggle("active", on);
      if (on) this.haptics.tick();
    };
    zone.addEventListener("pointerdown", (e) => {
      zone.setPointerCapture(e.pointerId);
      if (active.size === 0) press(true);
      active.add(e.pointerId);
      e.preventDefault();
    });
    const release = (e: PointerEvent) => {
      if (active.delete(e.pointerId) && active.size === 0) press(false);
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);
    this.root.appendChild(zone);
  }

  private buildPlungerZone(): void {
    const zone = document.createElement("div");
    zone.className = "touch-zone touch-plunger";
    this.plungerZone = zone;
    const active = new Set<number>();
    const press = (on: boolean) => {
      this.input.setTouchPlunger(on);
      zone.classList.toggle("active", on);
    };
    // deactivation mid-hold clears the gesture; the eventual pointerup finds
    // an empty set and no-ops (release() only fires on a successful delete)
    this.releasePlunger = () => {
      active.clear();
      press(false);
    };
    zone.addEventListener("pointerdown", (e) => {
      zone.setPointerCapture(e.pointerId);
      if (active.size === 0) press(true);
      active.add(e.pointerId);
      e.preventDefault();
    });
    // tick on the release, not the press — that's when the ball launches.
    // The force-release path clears `active` first, so an aborted hold
    // (plunger zone deactivated mid-gesture) never buzzes.
    const release = (e: PointerEvent) => {
      if (active.delete(e.pointerId) && active.size === 0) {
        press(false);
        this.haptics.tick();
      }
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);
    this.root.appendChild(zone);
  }

  private buildNudgeZone(): void {
    const zone = document.createElement("div");
    zone.className = "touch-zone touch-nudge";
    // one nudge per gesture: a flick past the threshold fires once, then the
    // gesture is spent until the finger lifts (nudge's own tilt budget/guard
    // in Game handles the rest)
    const gestures = new Map<number, { x: number; y: number; t: number; fired: boolean }>();
    zone.addEventListener("pointerdown", (e) => {
      zone.setPointerCapture(e.pointerId);
      gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fired: false });
    });
    zone.addEventListener("pointermove", (e) => {
      const g = gestures.get(e.pointerId);
      if (!g || g.fired) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) < SWIPE_MIN_PX) return;
      if (performance.now() - g.t > SWIPE_MAX_MS) {
        g.fired = true; // too slow — spend the gesture without nudging
        return;
      }
      // dominant axis: sideways → left/right, upward → up (a downward flick,
      // like pulling the plunger, isn't a nudge)
      if (Math.abs(dx) > Math.abs(dy)) {
        this.input.fireNudge(dx < 0 ? "left" : "right");
        this.haptics.nudge();
      } else if (dy < 0) {
        this.input.fireNudge("up");
        this.haptics.nudge();
      }
      g.fired = true;
    });
    const end = (e: PointerEvent) => gestures.delete(e.pointerId);
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
    this.root.appendChild(zone);
  }
}
