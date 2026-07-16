/**
 * Small render-side geometry/colour helpers shared by both renderers.
 * Render-only: physics never sees these (plan §2 decoupling rule).
 */
import type { Pt } from "../table/geometry";

/** Round each polygon corner with a quadratic arc of ~radius (clamped so
 * short edges keep some straight run). Render-side only — physics keeps the
 * sharp verts; the rounding stays inside them, never wider. Both renderers
 * use the same fillet so the slings match across modes (STYLE-GUIDE §7). */
export function roundCorners(pts: readonly Pt[], radius: number, steps = 6): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const la = Math.hypot(prev.x - cur.x, prev.y - cur.y);
    const lb = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rr = Math.min(radius, 0.35 * la, 0.35 * lb);
    const ax = cur.x + ((prev.x - cur.x) / la) * rr;
    const ay = cur.y + ((prev.y - cur.y) / la) * rr;
    const bx = cur.x + ((next.x - cur.x) / lb) * rr;
    const by = cur.y + ((next.y - cur.y) / lb) * rr;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push({
        x: u * u * ax + 2 * u * t * cur.x + t * t * bx,
        y: u * u * ay + 2 * u * t * cur.y + t * t * by,
      });
    }
  }
  return out;
}

/** "#rrggbb" from a 0xRRGGBB theme tint (TableSpec.theme). */
export function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** "r, g, b" from a 0xRRGGBB theme tint, for rgba() fills and glow sprites. */
export function rgbTriplet(n: number): string {
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
}
