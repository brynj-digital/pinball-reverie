import { saveTuning, type Tuning } from "../tuning";
import { TuningPanel } from "../debug/TuningPanel";
import type { RenderMode, View3D } from "../render/Renderer";
import { TABLE_ORDER, TABLE_SPECS, saveTableId, type TableId } from "../table/specs";
import {
  ACTION_LABELS,
  Input,
  type BindableAction,
} from "../core/Input";

const ACTIONS: BindableAction[] = [
  "left",
  "right",
  "upper",
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
  /** Re-reads slider values from the shared tuning object on open. */
  private valueRefreshers: (() => void)[] = [];

  constructor(
    private tuning: Tuning,
    private tuningPanel: TuningPanel,
    private input: Input,
    private onOpenChange: (open: boolean) => void,
    private renderMode: { get: () => RenderMode; set: (mode: RenderMode) => Promise<void> },
    private view3d: { get: () => View3D; set: (view: View3D) => void },
    private tableId: TableId,
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
    card.appendChild(this.tableRow());
    card.appendChild(this.rendererRow());
    card.appendChild(this.view3dRow());
    card.appendChild(this.tuningVisibleRow());

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
    if (this.open) {
      this.refreshKeys();
      // sliders share the tuning object with the debug TuningPanel — re-read
      // on open, or a stale slider nudge writes old values back over changes
      this.valueRefreshers.forEach((fn) => fn());
    }
    this.onOpenChange(this.open);
  }

  private refreshKeys(): void {
    for (const [action, btn] of this.keyButtons) btn.textContent = this.input.label(action);
  }

  /**
   * Table select (M10): cycles the registry. Persists the id and reloads —
   * a table swap replaces physics/art/rules/logic/music wholesale, so a
   * clean boot is the honest implementation (see main.ts).
   */
  private tableRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "key-row";
    const span = document.createElement("span");
    span.textContent = "Table";
    const btn = document.createElement("button");
    btn.textContent = TABLE_SPECS[this.tableId].name;
    btn.onclick = () => {
      const next = TABLE_ORDER[(TABLE_ORDER.indexOf(this.tableId) + 1) % TABLE_ORDER.length];
      saveTableId(next);
      btn.textContent = `${TABLE_SPECS[next].name}…`;
      location.reload();
    };
    row.append(span, btn);
    return row;
  }

  /** 2D ↔ 3D renderer toggle (milestone 9: both behind the Renderer seam). */
  private rendererRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "key-row";
    const span = document.createElement("span");
    span.textContent = "Renderer";
    const btn = document.createElement("button");
    const label = () =>
      (btn.textContent = this.renderMode.get() === "3d" ? "3D (BETA)" : "2D CLASSIC");
    label();
    btn.onclick = async () => {
      btn.textContent = "SWITCHING…"; // 3D loads as its own chunk
      await this.renderMode.set(this.renderMode.get() === "3d" ? "2d" : "3d");
      label();
    };
    this.valueRefreshers.push(label);
    row.append(span, btn);
    return row;
  }

  /**
   * The physics tuning panel is a dev tool, hidden by default — this row is
   * the one place it can be summoned from (it persists its own visibility).
   */
  private tuningVisibleRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "key-row";
    const span = document.createElement("span");
    span.textContent = "Physics tuning";
    const btn = document.createElement("button");
    const label = () => (btn.textContent = this.tuningPanel.visible ? "SHOWN" : "HIDDEN");
    label();
    btn.onclick = () => {
      this.tuningPanel.setVisible(!this.tuningPanel.visible);
      label();
    };
    this.valueRefreshers.push(label);
    row.append(span, btn);
    return row;
  }

  /** Camera style within 3D mode: tilted chase or top-down classic view. */
  private view3dRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "key-row";
    const span = document.createElement("span");
    span.textContent = "3D camera";
    const btn = document.createElement("button");
    const label = () =>
      (btn.textContent = this.view3d.get() === "flat" ? "TOP-DOWN" : "TILTED");
    label();
    btn.onclick = () => {
      this.view3d.set(this.view3d.get() === "flat" ? "tilted" : "flat");
      label();
    };
    this.valueRefreshers.push(label);
    row.append(span, btn);
    return row;
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
    this.valueRefreshers.push(() => (input.value = String(this.tuning[key])));
    input.oninput = () => {
      this.tuning[key] = parseFloat(input.value);
      saveTuning(this.tuning);
      this.tuningPanel.notifyExternal();
    };
    row.append(span, input);
    return row;
  }
}
