import { saveTuning, type Tuning } from "../tuning";
import { TuningPanel } from "../debug/TuningPanel";
import {
  ACTION_LABELS,
  Input,
  type BindableAction,
} from "../core/Input";

const ACTIONS: BindableAction[] = [
  "left",
  "right",
  "plunger",
  "start",
  "nudgeLeft",
  "nudgeRight",
  "nudgeUp",
  "reset",
];

/**
 * Player-facing settings (plan §8): volumes and key remapping. Esc toggles
 * it; the game pauses while it's open. Distinct from the physics tuning
 * panel, which is a dev tool.
 */
export class SettingsPanel {
  open = false;

  private root: HTMLDivElement;
  private capturing?: BindableAction;
  private keyButtons = new Map<BindableAction, HTMLButtonElement>();

  constructor(
    private tuning: Tuning,
    private tuningPanel: TuningPanel,
    private input: Input,
    private onOpenChange: (open: boolean) => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "settings-overlay";
    this.root.style.display = "none";

    const card = document.createElement("div");
    card.className = "settings-card";
    this.root.appendChild(card);

    const title = document.createElement("h2");
    title.textContent = "Settings";
    card.appendChild(title);

    card.appendChild(this.sliderRow("SFX volume", "sfxVolume", 0));
    card.appendChild(this.sliderRow("Music volume", "musicVolume", 0));
    // performance option: fewer pixels to paint at the cost of sharpness
    card.appendChild(this.sliderRow("Render scale", "renderScale", 0.5));

    const keysTitle = document.createElement("h3");
    keysTitle.textContent = "Keys";
    card.appendChild(keysTitle);

    for (const action of ACTIONS) {
      const row = document.createElement("div");
      row.className = "key-row";
      const label = document.createElement("span");
      label.textContent = ACTION_LABELS[action];
      const btn = document.createElement("button");
      btn.textContent = this.input.label(action);
      btn.onclick = () => {
        this.capturing = action;
        btn.textContent = "PRESS A KEY…";
      };
      this.keyButtons.set(action, btn);
      row.append(label, btn);
      card.appendChild(row);
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "settings-reset";
    resetBtn.textContent = "Reset keys to defaults";
    resetBtn.onclick = () => {
      this.input.resetBindings();
      this.refreshKeys();
    };
    card.appendChild(resetBtn);

    const hint = document.createElement("p");
    hint.className = "settings-hint";
    hint.textContent = "Esc closes · game is paused while open";
    card.appendChild(hint);

    document.body.appendChild(this.root);

    // capture-phase so a rebinding keypress never reaches the game
    document.addEventListener(
      "keydown",
      (e) => {
        if (!this.capturing || e.code === "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        this.input.rebind(this.capturing, e.code);
        this.capturing = undefined;
        this.refreshKeys();
      },
      true,
    );
  }

  toggle(): void {
    this.open = !this.open;
    this.capturing = undefined;
    this.root.style.display = this.open ? "flex" : "none";
    if (this.open) this.refreshKeys();
    this.onOpenChange(this.open);
  }

  private refreshKeys(): void {
    for (const [action, btn] of this.keyButtons) btn.textContent = this.input.label(action);
  }

  private sliderRow(
    label: string,
    key: "sfxVolume" | "musicVolume" | "renderScale",
    min: number,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "vol-row";
    const span = document.createElement("span");
    span.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = "1";
    input.step = "0.05";
    input.value = String(this.tuning[key]);
    input.oninput = () => {
      this.tuning[key] = parseFloat(input.value);
      saveTuning(this.tuning);
      this.tuningPanel.notifyExternal();
    };
    row.append(span, input);
    return row;
  }
}
