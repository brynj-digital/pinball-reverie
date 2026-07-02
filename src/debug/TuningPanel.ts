import { DEFAULT_TUNING, saveTuning, type Tuning } from "../tuning";

interface SliderDef {
  key: Exclude<keyof Tuning, "debugOverlay">;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderDef[] = [
  { key: "slopeDeg", label: "table slope (°)", min: 3, max: 12, step: 0.1 },
  { key: "flipperMaxTorque", label: "flipper torque (N·m)", min: 0.2, max: 6, step: 0.05 },
  { key: "flipperUpSpeed", label: "flipper up speed (rad/s)", min: 5, max: 60, step: 1 },
  { key: "flipperDownSpeed", label: "flipper return speed (rad/s)", min: 1, max: 30, step: 1 },
  { key: "ballRestitution", label: "ball restitution", min: 0, max: 0.9, step: 0.01 },
  { key: "wallRestitution", label: "wall restitution", min: 0, max: 0.9, step: 0.01 },
  { key: "ballFriction", label: "ball friction", min: 0, max: 0.5, step: 0.01 },
  { key: "ballLinearDamping", label: "ball linear damping", min: 0, max: 0.5, step: 0.005 },
  { key: "plungerMaxSpeed", label: "plunger max speed (m/s)", min: 1, max: 4, step: 0.05 },
  { key: "bumperKick", label: "bumper kick (N·s)", min: 0.02, max: 0.25, step: 0.005 },
  { key: "slingKick", label: "sling kick (N·s)", min: 0.02, max: 0.25, step: 0.005 },
  { key: "cameraViewH", label: "camera view height (m)", min: 0.3, max: 1.05, step: 0.01 },
];

/**
 * The Milestone-1 tuning panel (plan §8/§9: expose every feel constant, never
 * hardcode). Mutates the shared Tuning object in place; Game reads it live.
 */
export class TuningPanel {
  /** Bumped on every user change; Game re-applies tuning only when it moves. */
  version = 0;

  private root: HTMLDivElement;
  private refreshers: (() => void)[] = [];

  constructor(
    private tuning: Tuning,
    host: HTMLElement = document.body,
  ) {
    this.root = document.createElement("div");
    this.root.className = "tuning-panel";

    const title = document.createElement("h3");
    title.textContent = "Physics tuning";
    const collapse = document.createElement("button");
    collapse.textContent = "–";
    collapse.onclick = () => this.root.classList.toggle("collapsed");
    title.appendChild(collapse);
    this.root.appendChild(title);

    const body = document.createElement("div");
    body.className = "body";
    this.root.appendChild(body);

    for (const def of SLIDERS) body.appendChild(this.buildSlider(def));
    body.appendChild(this.buildDebugToggle());
    body.appendChild(this.buildResetButton());

    host.appendChild(this.root);
  }

  private buildSlider(def: SliderDef): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("label");
    label.textContent = def.label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    const value = document.createElement("span");
    value.className = "value";

    const refresh = () => {
      const v = this.tuning[def.key] as number;
      input.value = String(v);
      value.textContent = v.toFixed(def.step < 0.1 ? 2 : 1);
    };
    refresh();
    this.refreshers.push(refresh);

    input.oninput = () => {
      (this.tuning as unknown as Record<string, number>)[def.key] = parseFloat(input.value);
      value.textContent = parseFloat(input.value).toFixed(def.step < 0.1 ? 2 : 1);
      this.version++;
      saveTuning(this.tuning);
    };

    row.append(label, input, value);
    return row;
  }

  private buildDebugToggle(): HTMLElement {
    const row = document.createElement("div");
    row.className = "check-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "debug-overlay";
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = "debug overlay (physics bodies)";

    const refresh = () => (input.checked = this.tuning.debugOverlay);
    refresh();
    this.refreshers.push(refresh);

    input.onchange = () => {
      this.tuning.debugOverlay = input.checked;
      saveTuning(this.tuning);
    };
    row.append(input, label);
    return row;
  }

  private buildResetButton(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "reset";
    btn.textContent = "Reset to defaults";
    btn.onclick = () => {
      Object.assign(this.tuning, DEFAULT_TUNING);
      this.version++;
      saveTuning(this.tuning);
      this.refreshers.forEach((fn) => fn());
    };
    return btn;
  }
}
