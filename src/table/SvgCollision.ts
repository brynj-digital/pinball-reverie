/**
 * Parses the table's playfield SVG into physics data (plan §5e): the SVG is
 * the single source of truth for table shape. Elements are recognised by id
 * prefix per the style-guide contract (design/STYLE-GUIDE.md §4):
 *
 *   collision-wall-<name>   <path d="M x y L x y ...">      open chain
 *   collision-loop-<name>   <path d="... Z">                closed chain
 *   sensor-<kind>-<name>    <rect x y width height>         sensor fixture
 *   anchor-<entity>         <circle cx cy>                  placement point
 *
 * Deliberately a plain-string parser (no DOMParser): the same code runs in
 * the browser and in the headless simcheck/soak under Node. Authoring is
 * constrained to polyline paths (M/L/Z) — curves are flattened to points in
 * the master, per the style guide's ≤1 mm chord rule.
 *
 * SVG units are millimetres; everything returned here is in metres.
 */

export interface ParsedTable {
  walls: { name: string; pts: { x: number; y: number }[]; loop: boolean }[];
  sensors: { kind: string; id?: string; cx: number; cy: number; hw: number; hh: number }[];
  anchors: Map<string, { x: number; y: number }>;
}

/** Sensor kinds may themselves contain hyphens; match longest-first. */
const SENSOR_KINDS = [
  "ramp-entry",
  "ramp-exit",
  "rollover",
  "spinner",
  "drain",
  "lane",
  "kicker",
  "target",
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
  const result: ParsedTable = { walls: [], sensors: [], anchors: new Map() };

  for (const tag of svgText.match(/<path\b[^>]*>/g) ?? []) {
    const a = attrs(tag);
    if (!a.id?.startsWith("collision-") || !a.d) continue;
    const { pts, loop } = parsePathPoints(a.d);
    if (pts.length < 2) throw new Error(`collision path ${a.id} has <2 points`);
    result.walls.push({
      name: a.id,
      pts,
      loop: loop || a.id.startsWith("collision-loop-"),
    });
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
