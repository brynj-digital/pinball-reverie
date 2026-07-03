/**
 * Keyboard → game-command mapping layer (plan §4.5). Game polls `state`;
 * touch and gamepad backends can later write to the same structure. All
 * game keys are remappable (SettingsPanel); bindings persist in localStorage.
 *
 * Hardened against the ways browsers lose keyups, all of which present as a
 * "stuck" flipper:
 * - Windows swallows the keyup of one Shift while the other Shift is held, so
 *   Shift state is re-derived from e.shiftKey on EVERY keyboard event rather
 *   than trusting keyup delivery.
 * - All keys are released on window blur / tab switch.
 * - A tap faster than one frame (keydown+keyup between two polls) is latched
 *   in `pulse` so it still produces a flip.
 * - Chrome on Windows marks the second Shift's keydown repeat=true (repeat is
 *   derived from the key VALUE), so edges come from the pressed-key set.
 */
export interface InputState {
  left: boolean;
  right: boolean;
  plunger: boolean;
}

export type BindableAction =
  | "left"
  | "right"
  | "plunger"
  | "start"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeUp"
  | "reset";

export type Bindings = Record<BindableAction, string[]>;

export const ACTION_LABELS: Record<BindableAction, string> = {
  left: "Left flipper",
  right: "Right flipper",
  plunger: "Plunger",
  start: "Start game",
  nudgeLeft: "Nudge left",
  nudgeRight: "Nudge right",
  nudgeUp: "Nudge up",
  reset: "Reset ball",
};

export const DEFAULT_BINDINGS: Bindings = {
  left: ["ShiftLeft", "KeyZ"],
  right: ["ShiftRight", "Slash"],
  plunger: ["Space", "ArrowDown"],
  start: ["Enter"],
  nudgeLeft: ["ArrowLeft"],
  nudgeRight: ["ArrowRight"],
  nudgeUp: ["ArrowUp"],
  reset: ["KeyR"],
};

const STORAGE_KEY = "pinball-bindings-v1";

/** Human-readable key name for the settings UI. */
export function prettyCode(code: string): string {
  const MAP: Record<string, string> = {
    ShiftLeft: "L·Shift",
    ShiftRight: "R·Shift",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Slash: "/",
    Space: "Space",
    Enter: "Enter",
  };
  if (MAP[code]) return MAP[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export class Input {
  readonly state: InputState = { left: false, right: false, plunger: false };
  bindings: Bindings;

  private down = new Set<string>();
  private pulse = { left: false, right: false };
  private resetHandlers: (() => void)[] = [];
  private startHandlers: (() => void)[] = [];
  private nudgeHandlers: ((dir: "left" | "right" | "up") => void)[] = [];
  private escapeHandlers: (() => void)[] = [];

  constructor(target: Window = window) {
    this.bindings = loadBindings();
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

  /** Escape is fixed (opens settings) and not rebindable. */
  onEscape(fn: () => void): void {
    this.escapeHandlers.push(fn);
  }

  /** True if the flipper was tapped since the last poll, even sub-frame. Clears on read. */
  consumeTap(side: "left" | "right"): boolean {
    const was = this.pulse[side];
    this.pulse[side] = false;
    return was;
  }

  /** Replace an action's binding with a single key. */
  rebind(action: BindableAction, code: string): void {
    // a key drives exactly one action: scrub it from every other binding
    // list, or the old owner keeps firing alongside the new one (persisted)
    for (const other of Object.keys(this.bindings) as BindableAction[]) {
      if (other !== action)
        this.bindings[other] = this.bindings[other].filter((c) => c !== code);
    }
    this.bindings[action] = [code];
    saveBindings(this.bindings);
  }

  resetBindings(): void {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    saveBindings(this.bindings);
  }

  label(action: BindableAction): string {
    return this.bindings[action].map(prettyCode).join(" / ");
  }

  private is(action: BindableAction, code: string): boolean {
    return this.bindings[action].includes(code);
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    if (e.code === "Escape") {
      if (isDown && !e.repeat) this.escapeHandlers.forEach((fn) => fn());
      return;
    }

    const isNew = isDown && !this.down.has(e.code);
    if (isDown) this.down.add(e.code);
    else this.down.delete(e.code);

    // Shift keyups can be swallowed (dual-Shift on Windows); the modifier
    // snapshot on the event is the ground truth
    if (!e.shiftKey) {
      this.down.delete("ShiftLeft");
      this.down.delete("ShiftRight");
    }

    if (isNew) {
      if (this.is("left", e.code)) this.pulse.left = true;
      if (this.is("right", e.code)) this.pulse.right = true;
      if (this.is("reset", e.code)) this.resetHandlers.forEach((fn) => fn());
      if (this.is("start", e.code)) this.startHandlers.forEach((fn) => fn());
      if (this.is("nudgeLeft", e.code)) this.nudgeHandlers.forEach((fn) => fn("left"));
      if (this.is("nudgeRight", e.code)) this.nudgeHandlers.forEach((fn) => fn("right"));
      if (this.is("nudgeUp", e.code)) this.nudgeHandlers.forEach((fn) => fn("up"));
    }

    this.sync();

    // stop Space/arrows scrolling the page
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  }

  private sync(): void {
    this.state.left = this.bindings.left.some((c) => this.down.has(c));
    this.state.right = this.bindings.right.some((c) => this.down.has(c));
    this.state.plunger = this.bindings.plunger.some((c) => this.down.has(c));
  }
}

function loadBindings(): Bindings {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...structuredClone(DEFAULT_BINDINGS), ...JSON.parse(raw) };
    }
  } catch {
    // fall through to defaults
  }
  return structuredClone(DEFAULT_BINDINGS);
}

function saveBindings(b: Bindings): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // best-effort
  }
}
