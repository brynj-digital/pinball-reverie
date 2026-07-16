/**
 * Parses the table's playfield SVG into physics data (plan §5e): the SVG is
 * the single source of truth for table shape. Elements are recognised by id
 * prefix per the style-guide contract (design/STYLE-GUIDE.md §4):
 *
 *   collision-wall-<name>     <path d="M x y L x y ...">      open chain
 *   collision-loop-<name>     <path d="... Z">                closed chain
 *   collision-diverter-<id>-<blade>  <path>                   diverter blade
 *                                     (M12: swappable — one blade solid at a
 *                                      time, owned by the Diverter entity)
 *   sensor-<kind>-<name>      <rect x y width height>         sensor fixture
 *   anchor-<entity>           <circle cx cy>                  placement point
 *   height-profile-<name>     <path>                          render-height /
 *                                                             subway/lift guide
 *
 * Height (M11, plan §7a): height profiles carry data-height-from/-to (mm
 * relative to the playfield surface). Profiles with data-surface (plus
 * data-surface-width, mm) group into physical SURFACES — the ball really
 * rides them (src/table/Surfaces.ts): slope forces, airborne drops, and
 * per-contact height gating replace M10's layer bits and switch sensors.
 * Walls may carry data-surface (an elevated run's own rails — their band
 * follows the local surface height) or data-z="all" (full-height: the
 * shell and plunger-lane wall, i.e. the cabinet glass). Sensors may carry
 * data-z-min/-max (mm) to admit only balls at those heights. data-layer
 * remains on paths/profiles as a RENDER styling hint (1 raised, -1 subway).
 *
 * Deliberately a plain-string parser (no DOMParser): the same code runs in
 * the browser and in the headless simcheck/soak under Node. Authoring is
 * constrained to polyline paths (M/L/Z) — curves are flattened to points in
 * the master, per the style guide's ≤1 mm chord rule.
 *
 * SVG units are millimetres; everything returned here is in metres.
 */

export interface HeightProfile {
  name: string;
  pts: { x: number; y: number }[];
  layer: number;
  /** Height (m) at the first / last point; linear in arc length between. */
  hFrom: number;
  hTo: number;
  /** Cumulative arc length at each point (m); total = last entry. */
  cumLen: number[];
  /** Physical surface this profile belongs to (M11), if any. */
  surface?: string;
  /** Footprint half-width (m) when part of a surface. */
  surfaceHalfWidth?: number;
}

/**
 * One blade of a logic-controlled diverter (M12):
 * `collision-diverter-<diverter>-<blade>` — same path/width contract as a
 * wall, but built as a swappable fixture by the Diverter entity instead of
 * static table shape. Blade names are single-segment (the last hyphen splits
 * diverter from blade).
 */
export interface DiverterBlade {
  diverter: string;
  blade: string;
  pts: { x: number; y: number }[];
  radius: number;
  zAll?: boolean;
  zMin?: number;
  zMax?: number;
}

export interface ParsedTable {
  walls: {
    name: string;
    pts: { x: number; y: number }[];
    loop: boolean;
    /**
     * Half the path's stroke-width: the physics chain gets this as its shape
     * radius, so the collision surface IS the drawn stroke edge — without it
     * the ball visually sinks half a wall-width into the art.
     */
    radius: number;
    /** Render styling hint (1 = elevated); derived from data-surface. */
    layer: number;
    /** M11 height band: rails of this surface (band follows local height). */
    surfaceName?: string;
    /** Full-height wall (shell / lane wall — the cabinet glass). */
    zAll?: boolean;
    /** Explicit band (m): e.g. a ramp's BACK wall across its throat —
     * blocks ground balls, clears the riders passing above it. */
    zMin?: number;
    zMax?: number;
  }[];
  sensors: {
    kind: string;
    id?: string;
    cx: number;
    cy: number;
    hw: number;
    hh: number;
    /** Optional height band (m): the sensor admits only balls within it. */
    zMin?: number;
    zMax?: number;
  }[];
  anchors: Map<string, { x: number; y: number }>;
  profiles: HeightProfile[];
  diverters: DiverterBlade[];
}

/** Sensor kinds may themselves contain hyphens; match longest-first. */
const SENSOR_KINDS = [
  "ramp-entry",
  "ramp-exit",
  "rollover",
  "spinner",
  "subway",
  "drain",
  "lane",
  "kicker",
  "target",
  "lift",
  "skill",
];

const MM = 1 / 1000;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function parsePathPoints(d: string): { pts: { x: number; y: number }[]; loop: boolean } {
  const loop = /z\s*$/i.test(d);
  const nums = d
    .replace(/[MLZz]/g, " ")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (Number.isNaN(nums[i]) || Number.isNaN(nums[i + 1]))
      throw new Error(`non-polyline path data: "${d.slice(0, 40)}…"`);
    pts.push({ x: nums[i] * MM, y: nums[i + 1] * MM });
  }
  return { pts, loop };
}

export function parseTableSvg(svgText: string): ParsedTable {
  const result: ParsedTable = {
    walls: [],
    sensors: [],
    anchors: new Map(),
    profiles: [],
    diverters: [],
  };

  for (const tag of svgText.match(/<path\b[^>]*>/g) ?? []) {
    const a = attrs(tag);
    if (!a.id || !a.d) continue;
    if (a.id.startsWith("collision-diverter-")) {
      // M12: a diverter blade — swappable, so NOT part of the static walls
      const { pts } = parsePathPoints(a.d);
      if (pts.length < 2) throw new Error(`diverter blade ${a.id} has <2 points`);
      const width = a["data-width"] ?? a["stroke-width"];
      if (!width)
        throw new Error(`diverter blade ${a.id} needs an explicit data-width (or stroke-width)`);
      const rest = a.id.slice("collision-diverter-".length);
      const split = rest.lastIndexOf("-");
      if (split <= 0 || split === rest.length - 1)
        throw new Error(`diverter blade id "${a.id}" must be collision-diverter-<id>-<blade>`);
      result.diverters.push({
        diverter: rest.slice(0, split),
        blade: rest.slice(split + 1),
        pts,
        radius: (Number(width) / 2) * MM,
        zAll: a["data-z"] === "all" || undefined,
        zMin: a["data-z-min"] !== undefined ? Number(a["data-z-min"]) * MM : undefined,
        zMax: a["data-z-max"] !== undefined ? Number(a["data-z-max"]) * MM : undefined,
      });
    } else if (a.id.startsWith("collision-")) {
      const { pts, loop } = parsePathPoints(a.d);
      if (pts.length < 2) throw new Error(`collision path ${a.id} has <2 points`);
      // data-width is preferred: it isn't a presentation attribute, so art
      // layers can restroke the same path via <use> at decorative widths
      const width = a["data-width"] ?? a["stroke-width"];
      if (!width)
        throw new Error(`collision path ${a.id} needs an explicit data-width (or stroke-width)`);
      result.walls.push({
        name: a.id,
        pts,
        loop: loop || a.id.startsWith("collision-loop-"),
        radius: (Number(width) / 2) * MM,
        layer: a["data-surface"] ? 1 : 0,
        surfaceName: a["data-surface"],
        zAll: a["data-z"] === "all" || undefined,
        zMin: a["data-z-min"] !== undefined ? Number(a["data-z-min"]) * MM : undefined,
        zMax: a["data-z-max"] !== undefined ? Number(a["data-z-max"]) * MM : undefined,
      });
    } else if (a.id.startsWith("height-profile-")) {
      const { pts } = parsePathPoints(a.d);
      if (pts.length < 2) throw new Error(`height profile ${a.id} has <2 points`);
      const cumLen = [0];
      for (let i = 1; i < pts.length; i++)
        cumLen.push(cumLen[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      result.profiles.push({
        name: a.id.slice("height-profile-".length),
        pts,
        layer: Number(a["data-layer"] ?? 0),
        hFrom: Number(a["data-height-from"] ?? 0) * MM,
        hTo: Number(a["data-height-to"] ?? 0) * MM,
        cumLen,
        surface: a["data-surface"],
        surfaceHalfWidth: a["data-surface-width"]
          ? (Number(a["data-surface-width"]) / 2) * MM
          : undefined,
      });
    }
  }

  for (const tag of svgText.match(/<rect\b[^>]*>/g) ?? []) {
    const a = attrs(tag);
    if (!a.id?.startsWith("sensor-")) continue;
    const rest = a.id.slice("sensor-".length);
    const kind = SENSOR_KINDS.find((k) => rest === k || rest.startsWith(k + "-"));
    if (!kind) throw new Error(`unknown sensor kind in id "${a.id}"`);
    const id = rest.length > kind.length ? rest.slice(kind.length + 1) : undefined;
    const w = Number(a.width) * MM;
    const h = Number(a.height) * MM;
    result.sensors.push({
      kind,
      id,
      cx: Number(a.x) * MM + w / 2,
      cy: Number(a.y) * MM + h / 2,
      hw: w / 2,
      hh: h / 2,
      zMin: a["data-z-min"] !== undefined ? Number(a["data-z-min"]) * MM : undefined,
      zMax: a["data-z-max"] !== undefined ? Number(a["data-z-max"]) * MM : undefined,
    });
  }

  for (const tag of svgText.match(/<circle\b[^>]*>/g) ?? []) {
    const a = attrs(tag);
    if (!a.id?.startsWith("anchor-")) continue;
    result.anchors.set(a.id.slice("anchor-".length), {
      x: Number(a.cx) * MM,
      y: Number(a.cy) * MM,
    });
  }

  if (result.walls.length === 0) throw new Error("table SVG contains no collision layers");
  if (!result.sensors.some((s) => s.kind === "drain"))
    throw new Error("table SVG has no drain sensor");
  return result;
}

/**
 * Project (x, y) onto a profile polyline: returns the perpendicular distance
 * and the interpolated height at the nearest point (linear in arc length
 * between hFrom and hTo).
 */
export function projectOnProfile(
  p: HeightProfile,
  x: number,
  y: number,
): { dist: number; h: number; t: number } {
  let best = { dist: Infinity, h: p.hFrom, t: 0 };
  const total = p.cumLen[p.cumLen.length - 1] || 1;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const a = p.pts[i];
    const b = p.pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    const px = a.x + dx * u;
    const py = a.y + dy * u;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) {
      const s = (p.cumLen[i] + Math.sqrt(len2) * u) / total;
      best = { dist, h: p.hFrom + (p.hTo - p.hFrom) * s, t: s };
    }
  }
  return best;
}

/**
 * Display height (m) for a ball at (x, y) on `layer`: the height from the
 * nearest same-layer profile, or 0 when on the main playfield / far from
 * any profile (safety: a layer-1 ball that somehow left its rail renders —
 * and should be reset — at ground level).
 */
export function heightAt(
  profiles: HeightProfile[],
  layer: number,
  x: number,
  y: number,
  maxDist = 0.05,
): number {
  if (layer === 0) return 0;
  let h = 0;
  let bestDist = maxDist;
  for (const p of profiles) {
    if (p.layer !== layer) continue;
    const r = projectOnProfile(p, x, y);
    if (r.dist < bestDist) {
      bestDist = r.dist;
      h = r.h;
    }
  }
  return h;
}
