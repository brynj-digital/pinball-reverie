/**
 * Every physics-feel constant lives here and is exposed in the debug panel
 * (plan §8, milestone 1: flipper feel is make-or-break — tune, don't hardcode).
 * All units are SI: metres, seconds, radians, N·m.
 */
export interface Tuning {
  /** Table slope in degrees; effective gravity = 9.81 * sin(slope). */
  slopeDeg: number;
  ballDensity: number;
  ballRestitution: number;
  ballFriction: number;
  ballLinearDamping: number;
  ballAngularDamping: number;
  wallRestitution: number;
  wallFriction: number;
  flipperMaxTorque: number;
  /** Motor speed (rad/s) driving the flipper to its up-stop. */
  flipperUpSpeed: number;
  /** Motor speed (rad/s) returning the flipper to rest. */
  flipperDownSpeed: number;
  plungerMinSpeed: number;
  plungerMaxSpeed: number;
  /** Seconds of holding the plunger to reach full power. */
  plungerChargeTime: number;
  /** Radial impulse (N·s) a pop bumper applies to the ball. */
  bumperKick: number;
  /** Impulse (N·s) a slingshot applies along its face normal. */
  slingKick: number;
  /** Speed (m/s) the telescope scoop ejects the ball at, along KICKER.eject. */
  kickerEject: number;
  /** Visible playfield height in metres (camera zoom). */
  cameraViewH: number;
  /**
   * Canvas resolution as a fraction of native DPI (0.5–1). Lower = fewer
   * pixels to paint — the lever for paint-bound machines. 1 = full sharpness.
   */
  renderScale: number;
  sfxVolume: number;
  musicVolume: number;
  debugOverlay: boolean;
}

export const DEFAULT_TUNING: Tuning = {
  slopeDeg: 6.5,
  ballDensity: 140, // ~80 g for a 13.5 mm-radius disc, matching a real ball
  ballRestitution: 0.2,
  ballFriction: 0.05,
  ballLinearDamping: 0.1,
  ballAngularDamping: 0.02,
  wallRestitution: 0.15,
  wallFriction: 0.1,
  flipperMaxTorque: 1.5,
  flipperUpSpeed: 30,
  flipperDownSpeed: 8,
  plungerMinSpeed: 0.8,
  plungerMaxSpeed: 2.0,
  plungerChargeTime: 1.1,
  bumperKick: 0.09, // Δv ≈ 1.1 m/s on an 80 g ball
  slingKick: 0.11,
  kickerEject: 1.35, // lands mid left flipper from the scoop (simcheck-verified)
  cameraViewH: 0.75,
  renderScale: 1,
  sfxVolume: 0.5,
  musicVolume: 0.25,
  debugOverlay: false,
};

export function effectiveGravity(t: Tuning): number {
  return 9.81 * Math.sin((t.slopeDeg * Math.PI) / 180);
}

const STORAGE_KEY = "pinball-tuning-v1";

export function loadTuning(): Tuning {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_TUNING };
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_TUNING, ...JSON.parse(raw) } : { ...DEFAULT_TUNING };
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

export function saveTuning(t: Tuning): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    }
  } catch {
    // storage unavailable (private mode etc.) — tuning just won't persist
  }
}
