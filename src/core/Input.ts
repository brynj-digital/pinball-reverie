/**
 * Keyboard → game-command mapping layer (plan §4.5). Game polls `state`;
 * touch and gamepad backends can later write to the same structure.
 *
 * Hardened against the ways browsers lose keyups, all of which present as a
 * "stuck" flipper:
 * - Windows swallows the keyup of one Shift while the other Shift is held, so
 *   Shift state is re-derived from e.shiftKey on EVERY keyboard event rather
 *   than trusting keyup delivery.
 * - All keys are released on window blur / tab switch.
 * - A tap faster than one frame (keydown+keyup between two polls) is latched
 *   in `pulse` so it still produces a flip.
 */
export interface InputState {
  left: boolean;
  right: boolean;
  plunger: boolean;
}

const LEFT = ["ShiftLeft", "KeyZ"];
const RIGHT = ["ShiftRight", "Slash"];
const PLUNGER = ["Space", "ArrowDown"];
const RESET = ["KeyR"];
const START = ["Enter"];
const NUDGES: Record<string, "left" | "right" | "up"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
};

export class Input {
  readonly state: InputState = { left: false, right: false, plunger: false };
  private down = new Set<string>();
  private pulse = { left: false, right: false };
  private resetHandlers: (() => void)[] = [];
  private startHandlers: (() => void)[] = [];
  private nudgeHandlers: ((dir: "left" | "right" | "up") => void)[] = [];

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => this.onKey(e, true));
    target.addEventListener("keyup", (e) => this.onKey(e, false));
    target.addEventListener("blur", () => {
      this.down.clear();
      this.sync();
    });
  }

  onReset(fn: () => void): void {
    this.resetHandlers.push(fn);
  }

  onStart(fn: () => void): void {
    this.startHandlers.push(fn);
  }

  onNudge(fn: (dir: "left" | "right" | "up") => void): void {
    this.nudgeHandlers.push(fn);
  }

  /** True if the flipper was tapped since the last poll, even sub-frame. Clears on read. */
  consumeTap(side: "left" | "right"): boolean {
    const was = this.pulse[side];
    this.pulse[side] = false;
    return was;
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    // Do NOT trust e.repeat: Chrome on Windows derives it from the key VALUE,
    // so pressing the second Shift while the first is held arrives as
    // repeat=true and an early return would drop it (one flipper up → the
    // other Shift dead). A Set makes real repeats harmless; edges are
    // detected from membership instead.
    const isNew = isDown && !this.down.has(e.code);
    if (isDown) this.down.add(e.code);
    else this.down.delete(e.code);

    // Shift keyups can be swallowed (dual-Shift on Windows); the modifier
    // snapshot on the event is the ground truth
    if (!e.shiftKey) {
      this.down.delete("ShiftLeft");
      this.down.delete("ShiftRight");
    }

    if (isNew && LEFT.includes(e.code)) this.pulse.left = true;
    if (isNew && RIGHT.includes(e.code)) this.pulse.right = true;
    if (isNew && RESET.includes(e.code)) this.resetHandlers.forEach((fn) => fn());
    if (isNew && START.includes(e.code)) this.startHandlers.forEach((fn) => fn());
    if (isNew && NUDGES[e.code]) this.nudgeHandlers.forEach((fn) => fn(NUDGES[e.code]));

    this.sync();

    // stop Space/arrows scrolling the page
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  }

  private sync(): void {
    this.state.left = LEFT.some((c) => this.down.has(c));
    this.state.right = RIGHT.some((c) => this.down.has(c));
    this.state.plunger = PLUNGER.some((c) => this.down.has(c));
  }
}
