/**
 * Haptic feedback for touch play, via the Vibration API. In practice this is
 * Android-only — iOS Safari exposes no web haptics at all — so everything here
 * degrades to a silent no-op where `navigator.vibrate` is missing.
 *
 * Kept sparse by design: very short ticks on the player's OWN actions (flipper
 * press, plunger launch, nudge), never continuous world feedback — cheap
 * rotation motors turn frequent patterns into mush. Each vibrate() call
 * cancels the previous pattern, which is the right behavior for rapid
 * flipper work.
 *
 * The preference persists outside `Tuning` (like render mode / touch pref) so
 * tuning resets can't flip it.
 */

const STORAGE_KEY = "pinball-haptics-v1";

/** Does the platform expose the Vibration API? (No on iOS/desktop Safari.) */
export function hapticsAvailable(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

export function loadHapticsPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveHapticsPref(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // best-effort
  }
}

export class Haptics {
  enabled = loadHapticsPref();

  /** Crisp tick for a flipper press or plunger launch. Not shorter: ERM
   * motors need ~20ms+ to spin up — 12ms proved imperceptible on hardware. */
  tick(): void {
    this.pulse(25);
  }

  /** Heavier thump for a nudge — the whole cabinet moved. */
  nudge(): void {
    this.pulse(50);
  }

  private pulse(ms: number): void {
    if (!this.enabled || !hapticsAvailable()) return;
    try {
      navigator.vibrate(ms);
    } catch {
      // some browsers throw without sticky user activation — just skip
    }
  }
}
