import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Camera } from "../core/Camera";
import { BALL_RADIUS, FLIPPER, type FlipperSide, type Pt } from "../table/geometry";
import { heightAt, parseTableSvg } from "../table/SvgCollision";
import { buildSurfaces } from "../table/Surfaces";
import { loadSvgAt, splitElevatedOverlay } from "./svgImage";
import { roundCorners } from "./shape";
import type {
  EffectKind,
  Renderer,
  TableRenderData,
  View3D,
  WorldSnapshot,
} from "./Renderer";

/**
 * Three.js renderer (plan §7 / milestone 9). The planar Planck world stays
 * the source of truth: physics (x, y-down) maps to scene (x, z), height (y)
 * exists only here. Same playfield SVG does double duty again — its raster
 * textures the table plane, and its collision polylines are extruded into
 * chrome rails so the 3D walls line up with physics by construction.
 *
 * DMD + backglass live in a DOM side panel (the DMD subsystem owns its
 * canvas; this renderer just mounts it — plan §5b).
 */

/** Physics metres → scene units 1:1; (x, yDown) → (x, h, z=yDown). */

/** Fixed-distance corner rounding (two passes, 8 mm then 4 mm): rounds
 * polyline elbows for smooth tubes/ribbons while leaving long straights
 * perfectly straight — raw Chaikin cuts 25% of each segment, which turned
 * the shell's 790 mm bottom straights into giant chamfer arcs. */
function roundElbows<T extends { x: number; y: number; h?: number }>(
  pts: T[],
  closed = false,
): T[] {
  let out = pts;
  for (const cut of [0.008, 0.004]) {
    if (out.length < 3) return out;
    const next: T[] = [];
    const n = out.length;
    const lerp = (a: T, b: T, t: number): T => ({
      ...a,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      h: (a.h ?? 0) + ((b.h ?? 0) - (a.h ?? 0)) * t,
    });
    const corner = (a: T, b: T, c: T) => {
      const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
      next.push(lerp(b, a, Math.min(cut, l1 * 0.4) / l1));
      next.push(lerp(b, c, Math.min(cut, l2 * 0.4) / l2));
    };
    if (closed) {
      for (let i = 0; i < n; i++) corner(out[(i - 1 + n) % n], out[i], out[(i + 1) % n]);
    } else {
      next.push(out[0]);
      for (let i = 1; i < n - 1; i++) corner(out[i - 1], out[i], out[i + 1]);
      next.push(out[n - 1]);
    }
    out = next;
  }
  return out;
}

const RAIL_LOW = 0.011; // lower rail centre height (ball equator-ish)
const RAIL_HIGH = 0.024; // upper rail — walls read taller than the ball
const PALETTE = {
  bg: 0x0c0d14,
  rail: 0xbdc9dc,
  bumper: 0x123339,
  bumperGlow: 0x35e0d6,
  slingBody: 0x23262f, // rubber (STYLE-GUIDE §7) — the lamp colour is the table accent
  rollover: 0x8f7bff,
  ball: 0xe8ecf2,
  effect: { flash: 0xffd27a, launch: 0x9a6cff, drain: 0xff5a4a } as Record<EffectKind, number>,
} as const;

interface RingFx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  live: boolean;
  grow: number;
}

export class Renderer3D implements Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam3 = new THREE.PerspectiveCamera(38, 1, 0.05, 6);
  /** Top-down orthographic camera for the "flat" classic view. */
  private camFlat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 3);
  private view: View3D = "tilted";
  private fog = new THREE.FogExp2(PALETTE.bg, 0.14);
  // post chain (plan §7's final step), SINGLE pass — no double render.
  // Bloom threshold sits at 1.3, and every chrome material clamps its
  // outgoing light to 1.25 in-shader (clampBloom): ACES compresses those
  // values to near-white anyway, so the clamp is invisible — but chrome can
  // never cross the threshold, so only emissive lamps/flashes bloom.
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private bloom?: UnrealBloomPass;
  /** Soft light pool on the art, following the ball (the plane is unlit —
   * this is how it appears to respond to the ball's presence). */
  private ballGlow?: THREE.Mesh;
  private ballGlowMat?: THREE.MeshBasicMaterial;
  private pmrem?: THREE.PMREMGenerator;
  private envTex?: THREE.Texture;
  private table!: TableRenderData;

  private ballMesh?: THREE.Mesh;
  private ballMat?: THREE.MeshStandardMaterial;
  /** M12 multiball: pooled extra-ball meshes (hidden when unused). */
  private extraBallMeshes: THREE.Mesh[] = [];
  private prevBallPos = new THREE.Vector3();
  private flipperMeshes: THREE.Mesh[] = [];
  private bumperGlowMats: THREE.MeshStandardMaterial[] = [];
  private bumperLights: THREE.PointLight[] = [];
  private slingMats: THREE.MeshStandardMaterial[] = [];
  private targetMeshes: THREE.Mesh[] = [];
  private rolloverMats: THREE.MeshStandardMaterial[] = [];
  private rolloverGlowMats: THREE.MeshBasicMaterial[] = [];
  private lampGlowMats: THREE.MeshBasicMaterial[] = [];
  private spinnerMesh?: THREE.Mesh;
  /** Moving plunger assembly (tip pad + rod + knob); origin at the tip face. */
  private plungerGroup?: THREE.Group;
  private plungerSpring?: THREE.Mesh;
  private plungerSpringRest = 1;
  /** 3D-only tip rest: the saddle bar isn't drawn here, so the tip sits where
   * the ball's surface actually is — saddleY minus the saddle wall's 6 mm
   * collision radius (tipRestY itself is authored for the 2D under-saddle
   * layout and would leave a 4 mm float). */
  private plungerTipRestZ = 0;
  private plungerLastCharge = 0;
  private plungerStrikeAt = -1;
  private built = false;

  private fx: RingFx[] = [];
  private lastT = 0;

  // DOM chrome: DMD + backglass panel and the HUD line
  private panelEl?: HTMLDivElement;
  private hudEl?: HTMLDivElement;
  private dmdMounted = false;
  private hudAccum = 0;

  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;
  /** Canvas height below the portrait DMD strip (css px; = lastH in landscape). */
  private lastAvailH = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // with the composer, ACES applies to the WHOLE frame (art included, via
    // OutputPass) — exposure compensates for ACES's mid-tone compression
    this.renderer.toneMappingExposure = 1.3;
  }

  setView3D(view: View3D): void {
    this.view = view;
  }

  /** Css px reserved above the table in portrait: the DOM DMD strip
   * (.panel3d spans the width at 4:1 plus its insets) — the same band
   * Renderer2D reserves (style guide §8). 0 in landscape. */
  private topStripCss(cssW: number, cssH: number): number {
    const inset = 12;
    return cssW < cssH ? (cssW - inset * 2) / 4 + inset * 2 : 0;
  }

  effectiveViewH(baseViewH: number): number {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (!cssW || !cssH || !this.table) return baseViewH;
    const availH = cssH - this.topStripCss(cssW, cssH);
    // Metres visible when width binds the scale (same rule as Renderer2D):
    // exact for the flat ortho view; the tilted view starts from the same
    // window and drawFrame pulls its camera back to cover the width.
    const widthBound = availH * (this.table.width / cssW);
    return Math.min(this.table.height, Math.max(baseViewH, widthBound));
  }

  init(table: TableRenderData): void {
    this.table = table;
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = this.fog;
    this.camFlat.up.set(0, 0, -1); // screen-up is up-table when looking down

    // metallic reflections for the ball and rails ONLY — assigned per-material,
    // never as scene.environment (as an IBL it would out-shine the scene
    // lights on every diffuse element). Hand-built, intensity-CAPPED room:
    // three's stock RoomEnvironment has emissive panels at 17–100×, which
    // ACES used to clamp — but bloom reads the linear HDR frame, so those
    // reflections detonated on the ball/spinner. Panels here top out ~2.2×.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = this.pmrem.fromScene(makeCabinetEnv(), 0.04).texture;

    this.buildLights();
    this.buildPlayfield();
    this.buildWalls();
    this.buildPlunger();
    this.buildPanel();

    // the composer renders offscreen, where the canvas's MSAA doesn't
    // apply — without a multisampled target, adding post-processing
    // silently turns antialiasing OFF (the rail stepping seen in playtest).
    // 4x MSAA + half-float keeps both the smooth edges and the HDR range
    // the bloom threshold needs.
    this.composer = new EffectComposer(
      this.renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    this.renderPass = new RenderPass(this.scene, this.cam3);
    // threshold above the (clamped) chrome ceiling: only emissives bloom —
    // lit lamps (2.45), bumper flashes (2.75), sling flashes
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 1.3);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  private buildLights(): void {
    // these are the ONLY lights on the elements (no env IBL — see init()), so
    // total irradiance on up-facing surfaces stays near 1.0: the playfield art
    // is unlit, and any overexposure here reads as washed-out elements sitting
    // on correctly-saturated art (hemi + key·cosθ ≈ 0.25 + 0.7)
    this.scene.add(new THREE.HemisphereLight(0x8899cc, 0x14101f, 0.4));
    // key light overhead from the player's side, like cabinet GI — the old
    // top-of-table grazing angle blew out the arch rails and upper lamps
    const key = new THREE.DirectionalLight(0xfff2dd, 0.9);
    key.position.set(0.55, 1.6, 1.5);
    key.target.position.set(this.table.width / 2, 0, this.table.height * 0.45);
    key.castShadow = true;
    // shadow frustum hugs the table (±0.8 wasted half the map off-board)
    // and the map doubled — crisper element/ball contact shadows
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -0.45;
    sc.right = 0.45;
    sc.top = 0.7;
    sc.bottom = -0.7;
    sc.near = 0.1;
    sc.far = 4;
    this.scene.add(key, key.target);
  }

  private buildPlayfield(): void {
    const geo = new THREE.PlaneGeometry(this.table.width, this.table.height);
    geo.rotateX(-Math.PI / 2); // face up; texture top edge lands at z=0
    // UNLIT: the art must not become albedo (scene lighting would multiply
    // the palette away from the masters). Tone mapping now happens on the
    // whole frame in the composer's OutputPass — the exposure bump in the
    // constructor keeps the art's overall brightness at authored levels,
    // and the bake below adds the light direction the flat plane can't get.
    const mat = new THREE.MeshBasicMaterial({ color: 0x232438 });
    const plane = new THREE.Mesh(geo, mat);
    plane.position.set(this.table.width / 2, 0, this.table.height / 2);
    this.scene.add(plane);

    // basic materials can't receive shadows — a transparent shadow catcher
    // just above the art keeps the ball/flipper shadows. Opacity stays low:
    // at 0.3 the ball's shadow read as a hard dark blob (playtest)
    const catcher = new THREE.Mesh(
      geo.clone(),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );
    catcher.position.set(this.table.width / 2, 0.0004, this.table.height / 2);
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    if (this.table.artSvgText) {
      // the same SVG the 2D renderer draws, rasterized once as the plane map
      // — minus the elevated-rail art: up here the ramp is real geometry,
      // and its painted twin on the floor read as a ghost of itself (M10)
      const baseArt = splitElevatedOverlay(this.table.artSvgText)?.base ?? this.table.artSvgText;
      loadSvgAt(
        baseArt,
        1280,
        Math.round((1280 * this.table.height) / this.table.width),
        (img) => {
          // bake a subtle lighting pass into the raster (key-light falloff
          // toward bottom-right + edge occlusion): the plane stays unlit for
          // palette fidelity, so this is how the field joins the same light
          // story as the elements sitting on it
          const cnv = document.createElement("canvas");
          cnv.width = img.width;
          cnv.height = img.height;
          const c = cnv.getContext("2d")!;
          c.drawImage(img, 0, 0);
          c.globalCompositeOperation = "multiply";
          const lin = c.createLinearGradient(0, 0, cnv.width * 0.6, cnv.height);
          lin.addColorStop(0, "#ffffff");
          lin.addColorStop(1, "#dfe3ea");
          c.fillStyle = lin;
          c.fillRect(0, 0, cnv.width, cnv.height);
          const rad = c.createRadialGradient(
            cnv.width * 0.5, cnv.height * 0.45, cnv.height * 0.28,
            cnv.width * 0.5, cnv.height * 0.5, cnv.height * 0.62,
          );
          rad.addColorStop(0, "#ffffff");
          rad.addColorStop(1, "#e3e6ec");
          c.fillStyle = rad;
          c.fillRect(0, 0, cnv.width, cnv.height);
          const tex = new THREE.CanvasTexture(cnv);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        },
        "playfield",
      );
    }
  }

  /**
   * Walls: the SVG's collision polylines extruded as two stacked rails.
   * Layered walls (M10) ride their height profile — this is where the 3D
   * renderer earns its keep: ramps and habitrails are genuinely elevated.
   */
  private buildWalls(): void {
    if (!this.table.artSvgText) return;
    const makeRailMat = (color: number) =>
      clampBloom(new THREE.MeshStandardMaterial({
        color,
        metalness: 0.9,
        roughness: 0.38,
        envMap: this.envTex,
        envMapIntensity: 0.9, // rebalanced for the capped cabinet env
      }));
    // field walls follow the table's theme; elevated wireforms stay OPAQUE
    // chrome on every table — only the ramp BED between them is glass
    // (buildGlassBeds below; STYLE-GUIDE §2)
    const railMat = makeRailMat(this.table.theme?.rail3d ?? 0xaebcd0);
    // wireform chrome: near-mirror finish, unlike the softer field rails
    const railMatElevated = clampBloom(new THREE.MeshStandardMaterial({
      color: this.table.theme?.rail3dElevated ?? 0xbdc9dc,
      metalness: 1.0,
      roughness: 0.13,
      envMap: this.envTex,
      envMapIntensity: 1.5,
    }));
    const parsed = parseTableSvg(this.table.artSvgText);
    const elevation = (p: { x: number; y: number }, layer: number) =>
      layer === 0 ? 0 : heightAt(parsed.profiles, layer, p.x, p.y, 0.08);
    for (const wall of parsed.walls) {
      // the plunger saddle stays physics-only here: no real machine has a bar
      // across the shooter lane — the ball visually rests on the plunger tip
      // instead (buildPlunger places the tip at the saddle's contact face)
      if (wall.name.includes("plunger-saddle")) continue;
      // field walls read as solid rails at their physical width; elevated
      // wireforms are true wire gauge — the collision radius stays 6 mm,
      // the LOOK slims to ~2.5 mm
      const radii: ReadonlyArray<readonly [number, number]> =
        wall.layer === 0
          ? [
              [RAIL_LOW, wall.radius],
              [RAIL_HIGH, wall.radius * 0.7],
            ]
          : [
              [RAIL_LOW, 0.0026],
              [RAIL_HIGH, 0.0018],
            ];
      const smooth = roundElbows(wall.pts, wall.loop);
      for (const [h, r] of radii) {
        const path = new THREE.CurvePath<THREE.Vector3>();
        const at = (p: { x: number; y: number }) =>
          new THREE.Vector3(p.x, h + elevation(p, wall.layer), p.y);
        for (let i = 0; i < smooth.length - 1; i++) {
          path.add(new THREE.LineCurve3(at(smooth[i]), at(smooth[i + 1])));
        }
        if (wall.loop) {
          path.add(new THREE.LineCurve3(at(smooth[smooth.length - 1]), at(smooth[0])));
        }
        const geo = new THREE.TubeGeometry(
          path,
          Math.max(8, smooth.length * 2),
          r,
          10,
          wall.loop,
        );
        this.scene.add(new THREE.Mesh(geo, wall.layer === 0 ? railMat : railMatElevated));
      }
    }

    // M11 surfaces: ONE continuous structure per surface — a seam-free
    // theme-tinted glass bed over the chained profiles, wireform cross-ties,
    // vertical support posts down to the playfield, and edge wires for
    // surfaces that have no collision rails (the queue's jump wedge)
    const bedMat = new THREE.MeshBasicMaterial({
      color: this.table.theme?.rampGlass3d ?? 0x39ff14,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const postMat = clampBloom(
      new THREE.MeshStandardMaterial({
        color: 0x565d6e,
        metalness: 0.8,
        roughness: 0.4,
        envMap: this.envTex,
        envMapIntensity: 0.8,
      }),
    );
    const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) =>
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8, false), mat));
    // Lift tracks (M12): layer-1 profiles WITHOUT data-surface are scripted
    // carries — no physics surface exists (the ball can't free-ride them),
    // but the track itself must: build the same wireform/bed/posts over
    // them (the Night Mail's incline). Narrow gauge: the carry is a cradle,
    // not a channel.
    const liftTracks = parsed.profiles
      .filter((p) => p.layer === 1 && !p.surface)
      .map((p) => ({ name: p.name, profiles: [p], halfWidth: 0.013 }));
    for (const surf of [...buildSurfaces(parsed.profiles), ...liftTracks]) {
      // merge the chained profiles into one run with per-point height
      const run: { x: number; y: number; h: number }[] = [];
      for (const prof of surf.profiles) {
        const total = prof.cumLen[prof.cumLen.length - 1] || 1;
        prof.pts.forEach((pt, i) => {
          const h = prof.hFrom + (prof.hTo - prof.hFrom) * (prof.cumLen[i] / total);
          const last = run[run.length - 1];
          if (last && Math.hypot(last.x - pt.x, last.y - pt.y) < 1e-4) {
            last.h = h;
            return;
          }
          run.push({ x: pt.x, y: pt.y, h });
        });
      }
      if (run.length < 2) continue;
      const smoothRun = roundElbows(run);
      run.length = 0;
      run.push(...smoothRun);
      const hw = Math.max(0.012, surf.halfWidth - 0.0025);
      const nx: number[] = [];
      const ny: number[] = [];
      for (let i = 0; i < run.length; i++) {
        const a = run[Math.max(0, i - 1)];
        const b = run[Math.min(run.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        nx.push(-dy / l);
        ny.push(dx / l);
      }
      // the glass bed, mitred through every joint
      const pos: number[] = [];
      for (let i = 0; i < run.length; i++) {
        pos.push(run[i].x - nx[i] * hw, run[i].h + 0.002, run[i].y - ny[i] * hw);
        pos.push(run[i].x + nx[i] * hw, run[i].h + 0.002, run[i].y + ny[i] * hw);
      }
      const idx: number[] = [];
      for (let i = 0; i < run.length - 1; i++) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      this.scene.add(new THREE.Mesh(geo, bedMat));
      // arc-length walk for ties + posts
      const cum = [0];
      for (let i = 1; i < run.length; i++)
        cum.push(cum[i - 1] + Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y));
      const total = cum[cum.length - 1];
      const at = (sLen: number) => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < sLen) i++;
        const u = (sLen - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        return {
          x: run[i - 1].x + (run[i].x - run[i - 1].x) * u,
          y: run[i - 1].y + (run[i].y - run[i - 1].y) * u,
          h: run[i - 1].h + (run[i].h - run[i - 1].h) * u,
          nx: nx[i - 1] + (nx[i] - nx[i - 1]) * u,
          ny: ny[i - 1] + (ny[i] - ny[i - 1]) * u,
        };
      };
      for (let sLen = 0.014; sLen < total; sLen += 0.028) {
        const p = at(sLen); // wireform cross-tie
        tube(
          new THREE.Vector3(p.x - p.nx * hw, p.h + 0.0015, p.y - p.ny * hw),
          new THREE.Vector3(p.x + p.nx * hw, p.h + 0.0015, p.y + p.ny * hw),
          0.0011,
          railMatElevated,
        );
      }
      for (let sLen = 0.03; sLen < total; sLen += 0.085) {
        const p = at(sLen); // support posts, skipped near the mouths
        if (p.h < 0.016) continue;
        for (const side of [-1, 1])
          tube(
            new THREE.Vector3(p.x + side * p.nx * hw, p.h, p.y + side * p.ny * hw),
            new THREE.Vector3(p.x + side * p.nx * hw, 0, p.y + side * p.ny * hw),
            0.0013,
            postMat,
          );
      }
      // edge wires where the surface has no collision rails
      if (!parsed.walls.some((w) => w.surfaceName === surf.name)) {
        for (const side of [-1, 1]) {
          const path = new THREE.CurvePath<THREE.Vector3>();
          for (let i = 0; i < run.length - 1; i++)
            path.add(
              new THREE.LineCurve3(
                new THREE.Vector3(run[i].x + side * nx[i] * hw, run[i].h + 0.006, run[i].y + side * ny[i] * hw),
                new THREE.Vector3(run[i + 1].x + side * nx[i + 1] * hw, run[i + 1].h + 0.006, run[i + 1].y + side * ny[i + 1] * hw),
              ),
            );
          this.scene.add(
            new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(8, run.length * 2), 0.0022, 8, false), railMatElevated),
          );
        }
      }
    }
  }

  /** The 2D renderer's plunger assembly in the round: rubber tip pad + chrome
   * rod sliding through a brass housing to a knob, with a coil spring that
   * squashes as the charge pulls the rod back (and stretches on the release
   * overshoot). The rod protruding past the housing is the shooter handle —
   * the housing is what makes that read as through-the-cabinet, not floating. */
  private buildPlunger(): void {
    const PLUNGER = this.table.plunger;
    this.plungerTipRestZ = PLUNGER.saddleY - 0.006;
    const y = BALL_RADIUS; // strike the ball on its equator
    const chrome = clampBloom(
      new THREE.MeshStandardMaterial({
        color: 0x9aa5b8,
        metalness: 0.85,
        roughness: 0.35,
        envMap: this.envTex,
        envMapIntensity: 0.9,
      }),
    );

    const g = new THREE.Group();
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0085, 0.0085, 0.005, 16).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8 }),
    );
    tip.position.z = 0.0025;
    const rodLen = PLUNGER.baseY - this.plungerTipRestZ + 0.008;
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0032, rodLen, 10).rotateX(Math.PI / 2),
      chrome,
    );
    rod.position.z = 0.005 + rodLen / 2;
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.0075, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }),
    );
    knob.position.z = 0.005 + rodLen;
    for (const m of [tip, rod, knob]) m.castShadow = true;
    g.add(tip, rod, knob);
    g.position.set(PLUNGER.x, y, this.plungerTipRestZ);
    this.plungerGroup = g;
    this.scene.add(g);

    // coil spring built at rest length, squashed per-frame via scale.z — the
    // slight wire flattening under compression is invisible at 1.1 mm gauge
    this.plungerSpringRest = PLUNGER.baseY - this.plungerTipRestZ - 0.005;
    const coils = 7;
    const segsPerCoil = 16;
    const n = coils * segsPerCoil;
    const helix: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / segsPerCoil) * Math.PI * 2;
      helix.push(
        new THREE.Vector3(
          Math.cos(a) * 0.0068,
          Math.sin(a) * 0.0068,
          (i / n) * this.plungerSpringRest,
        ),
      );
    }
    this.plungerSpring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), n, 0.0011, 6, false),
      clampBloom(
        new THREE.MeshStandardMaterial({
          color: 0x7f8fc9,
          metalness: 0.8,
          roughness: 0.45,
          envMap: this.envTex,
          envMapIntensity: 0.7,
        }),
      ),
    );
    this.plungerSpring.position.set(PLUNGER.x, y, this.plungerTipRestZ + 0.005);
    this.scene.add(this.plungerSpring);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.02, 0.007),
      clampBloom(
        new THREE.MeshStandardMaterial({
          color: 0xe0b64e,
          metalness: 0.6,
          roughness: 0.4,
          envMap: this.envTex,
          envMapIntensity: 0.5,
        }),
      ),
    );
    base.position.set(PLUNGER.x, y - 0.002, PLUNGER.baseY + 0.0035);
    base.castShadow = true;
    this.scene.add(base);
  }

  /** DMD + backglass as a DOM side panel; HUD line along the bottom. */
  private buildPanel(): void {
    this.panelEl = document.createElement("div");
    this.panelEl.className = "panel3d";
    document.body.appendChild(this.panelEl);
    if (this.table.backglassSvgText) {
      loadSvgAt(this.table.backglassSvgText, 560, 672, (img) => {
        this.panelEl?.appendChild(img);
      }, "backglass");
    }
    this.hudEl = document.createElement("div");
    this.hudEl.className = "hud3d";
    // hidden until the first snapshot says which HUD lines are enabled
    this.hudEl.style.display = "none";
    document.body.appendChild(this.hudEl);
  }

  /** Element meshes are built from the first snapshot — the renderer learns
   * counts and placements from the world, not from table constants. */
  private buildDynamic(snap: WorldSnapshot): void {
    this.built = true;

    this.ballMat = clampBloom(
      new THREE.MeshStandardMaterial({
        color: PALETTE.ball,
        metalness: 1,
        // mirror chrome: clampBloom caps its output under the bloom
        // threshold, and low roughness avoids the banded look of blurred
        // env-map mips on the lower hemisphere
        roughness: 0.12,
        transparent: true,
        envMap: this.envTex,
        envMapIntensity: 0.9,
      }),
    );
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), this.ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    this.prevBallPos.set(snap.ball.x, BALL_RADIUS, snap.ball.y);

    // light pool under the ball: the unlit art can't receive a real point
    // light, so a soft additive pool rides the floor beneath the ball.
    // Radial-gradient sprite, NOT a plain disc — a uniform circle has a
    // hard edge and reads as a spotlight cutout (seen in playtest).
    const glowCnv = document.createElement("canvas");
    glowCnv.width = glowCnv.height = 64;
    const gctx = glowCnv.getContext("2d")!;
    // Kept deliberately faint: at higher alphas the pool reads as a halo
    // around the ball from the tilted camera (playtest feedback, twice).
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(191, 216, 255, 0.2)");
    grad.addColorStop(0.35, "rgba(191, 216, 255, 0.08)");
    grad.addColorStop(0.7, "rgba(191, 216, 255, 0.02)");
    grad.addColorStop(1, "rgba(191, 216, 255, 0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    this.ballGlowMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(glowCnv),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ballGlow = new THREE.Mesh(new THREE.CircleGeometry(0.044, 24), this.ballGlowMat);
    this.ballGlow.geometry.rotateX(-Math.PI / 2);
    this.scene.add(this.ballGlow);

    // element materials get NO envMap — see init(); they're lit by the scene
    // lights alone so their albedo reads at authored saturation.
    // Brass gradient runs base→tip like the 2D bat, so each side mirrors it.
    const flipTex = { left: brassTexture("u"), right: brassTexture("u-rev") };
    this.flipperMeshes = snap.flippers.map((f) => {
      const mat = new THREE.MeshStandardMaterial({
        map: flipTex[f.side],
        metalness: 0.3,
        roughness: 0.45,
      });
      const mesh = extrudeFlat(flipperShapePts(f.side), 0.016, mat);
      mesh.position.set(f.x, 0.002, f.y);
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    });

    // rim ring matches the rail chrome so bumpers share the table's metal
    const bumperRimMat = clampBloom(
      new THREE.MeshStandardMaterial({
        color: 0xbdc9dc,
        metalness: 0.9,
        roughness: 0.35,
        envMap: this.envTex,
        envMapIntensity: 0.9,
      }),
    );
    for (const b of snap.elements.bumpers) {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r * 0.92, b.r, 0.026, 24),
        new THREE.MeshStandardMaterial({ color: PALETTE.bumper, roughness: 0.5 }),
      );
      body.position.set(b.x, 0.013, b.y);
      body.castShadow = true;
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0x0d2326,
        emissive: PALETTE.bumperGlow,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      });
      // domed cap + chrome rim: the old flat disc showed the tilted camera
      // nothing but a featureless top face and read as a 2D decal
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(b.r * 0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        glowMat,
      );
      cap.scale.y = 0.5;
      cap.position.set(b.x, 0.026, b.y);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.92, 0.002, 10, 28), bumperRimMat);
      rim.geometry.rotateX(Math.PI / 2);
      rim.position.set(b.x, 0.026, b.y);
      const light = new THREE.PointLight(PALETTE.bumperGlow, 0, 0.16);
      light.position.set(b.x, 0.05, b.y);
      this.bumperGlowMats.push(glowMat);
      this.bumperLights.push(light);
      this.scene.add(body, cap, rim, light);
    }

    // table-accent element lamps (STYLE-GUIDE §7) — slings and drop targets
    // carry the table's neon pair, not the flipper brass
    const accent = this.table.theme?.accent ?? 0x8c6bff;
    const accentDeep = this.table.theme?.accentDeep ?? 0x4e37a8;
    for (const s of snap.elements.slings) {
      const mat = new THREE.MeshStandardMaterial({
        color: PALETTE.slingBody, // rubber body; the accent light lives in the emissive
        emissive: accent,
        emissiveIntensity: 0.12,
        metalness: 0.05,
        roughness: 0.8,
      });
      // rubber-ring corners — the raw physics triangle is razor-sharp; 12 mm
      // (up from 8, 2026-07-16 "too angular" feedback) because the acute
      // up-table apex still reads pointed through the quadratic's midpoint
      const mesh = extrudeFlat(roundCorners(s.verts, 0.012), 0.018, mat);
      mesh.position.y = 0.001;
      mesh.castShadow = true;
      this.slingMats.push(mat);
      this.scene.add(mesh);
    }

    const targetMat = new THREE.MeshStandardMaterial({
      color: accentDeep,
      emissive: accent,
      emissiveIntensity: 0.25,
      roughness: 0.45,
    });
    this.targetMeshes = snap.elements.targets.map((t) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(t.hw * 2, 0.022, t.hh * 2),
        targetMat,
      );
      mesh.position.set(t.x, 0.011, t.y);
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    });

    for (const r of snap.elements.rollovers) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x241f3a,
        emissive: PALETTE.rollover,
        emissiveIntensity: 0.25,
        roughness: 0.4,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0018, 10, 24), mat);
      ring.geometry.rotateX(Math.PI / 2); // lie flat
      ring.position.set(r.x, 0.002, r.y);
      // lamp-insert glow under the ring: an additive disc, like the 2D art's
      // soft radial lamp bloom — the bare torus alone read as an unlit decal
      const glowMat = new THREE.MeshBasicMaterial({
        color: PALETTE.rollover,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.014, 24), glowMat);
      glow.geometry.rotateX(-Math.PI / 2);
      glow.position.set(r.x, 0.0012, r.y);
      this.rolloverMats.push(mat);
      this.rolloverGlowMats.push(glowMat);
      this.scene.add(ring, glow);
    }

    // extra insert lamps (depth gauge etc.): additive discs like the
    // rollover glow, colored per-lamp from the snapshot's rgb string
    for (const l of snap.elements.lamps) {
      const [r, g, b] = l.rgb.split(",").map((v) => Number(v.trim()) / 255);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r, g, b),
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), glowMat);
      glow.geometry.rotateX(-Math.PI / 2);
      glow.position.set(l.x, 0.0012, l.y);
      this.lampGlowMats.push(glowMat);
      this.scene.add(glow);
    }

    const sp = snap.elements.spinner;
    this.spinnerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sp.halfW * 2 - 0.004, 0.0016, 0.02),
      clampBloom(
        new THREE.MeshStandardMaterial({
          color: 0xd8dee9,
          metalness: 0.85,
          roughness: 0.42,
          envMap: this.envTex,
          envMapIntensity: 0.5,
        }),
      ),
    );
    // tilt lays the axle across a diagonal lane (the table-plane rotation
    // is about the scene Y axis, negated: table y maps to scene z)
    const spinnerRig = new THREE.Group();
    spinnerRig.position.set(sp.x, BALL_RADIUS, sp.y);
    spinnerRig.rotation.y = -(sp.tilt ?? 0);
    spinnerRig.add(this.spinnerMesh);
    this.scene.add(spinnerRig);
  }

  spawnEffect(kind: EffectKind, x: number, y: number): void {
    let fx = this.fx.find((f) => !f.live);
    if (!fx) {
      if (this.fx.length >= 16) return;
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 28), mat);
      mesh.geometry.rotateX(-Math.PI / 2);
      this.scene.add(mesh);
      fx = { mesh, mat, t: 0, live: false, grow: 0.1 };
      this.fx.push(fx);
    }
    fx.live = true;
    fx.t = 0;
    fx.grow = kind === "flash" ? 0.06 : 0.09;
    fx.mat.color.set(PALETTE.effect[kind]);
    fx.mesh.position.set(x, 0.004, y);
    fx.mesh.visible = true;
  }

  drawFrame(snap: WorldSnapshot, camera: Camera): void {
    this.resize(snap.renderScale);
    if (!this.built) this.buildDynamic(snap);
    const now = performance.now() / 1000;
    const dt = this.lastT ? Math.min(now - this.lastT, 0.1) : 0.016;
    this.lastT = now;

    // ball: position + faked rolling (real spin is planar and reads wrong).
    // Height (M10) is real here: ramps lift the ball, subways sink it.
    const ball = this.ballMesh!;
    ball.position.set(snap.ball.x, BALL_RADIUS + snap.ball.h, snap.ball.y);
    const delta = ball.position.clone().sub(this.prevBallPos);
    const dist = delta.length();
    if (dist > 1e-6) {
      const axis = new THREE.Vector3(0, 1, 0).cross(delta).normalize();
      ball.rotateOnWorldAxis(axis, dist / BALL_RADIUS);
    }
    this.prevBallPos.copy(ball.position);
    this.ballMat!.opacity = snap.ball.alpha;
    ball.visible = snap.ball.alpha > 0.02;
    // the light pool stays on the floor; it spreads and dims as the ball
    // climbs a ramp, and follows it dimmer through a subway
    const pool = 1 + Math.max(0, snap.ball.h) * 12;
    this.ballGlow!.position.set(snap.ball.x, 0.0018, snap.ball.y);
    this.ballGlow!.scale.set(pool, 1, pool);
    this.ballGlowMat!.opacity =
      (snap.ball.layer === -1 ? 0.07 : 0.16 / pool) * snap.ball.alpha;
    this.ballGlow!.visible = ball.visible;

    // M12 multiball extras: pooled clones sharing the ball geometry/material
    while (this.extraBallMeshes.length < snap.extraBalls.length) {
      const m = new THREE.Mesh(ball.geometry, this.ballMat!);
      m.castShadow = true;
      this.scene.add(m);
      this.extraBallMeshes.push(m);
    }
    for (let i = 0; i < this.extraBallMeshes.length; i++) {
      const mesh = this.extraBallMeshes[i];
      const eb = snap.extraBalls[i];
      if (!eb) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(eb.x, BALL_RADIUS + eb.h, eb.y);
    }

    snap.flippers.forEach((f, i) => {
      this.flipperMeshes[i].rotation.y = -f.angle;
    });

    snap.elements.bumpers.forEach((b, i) => {
      this.bumperGlowMats[i].emissiveIntensity = 0.35 + b.flash * 2.4;
      this.bumperLights[i].intensity = b.flash * 0.05;
    });
    snap.elements.slings.forEach((s, i) => {
      // idle 0.12 keeps the lamp faintly powered; a kick flares the accent
      this.slingMats[i].emissiveIntensity = 0.12 + s.flash * 1.6;
    });
    snap.elements.targets.forEach((t, i) => {
      const mesh = this.targetMeshes[i];
      const want = t.up ? 0.011 : -0.014; // dropped targets sink into the field
      mesh.position.y += (want - mesh.position.y) * Math.min(1, dt * 14);
    });
    snap.elements.rollovers.forEach((r, i) => {
      this.rolloverMats[i].emissiveIntensity = 0.25 + r.lit * 2.2;
      this.rolloverGlowMats[i].opacity = 0.1 + r.lit * 0.5;
    });
    snap.elements.lamps.forEach((l, i) => {
      this.lampGlowMats[i].opacity = 0.08 + l.lit * 0.55;
    });
    this.spinnerMesh!.rotation.x = snap.elements.spinner.angle;
    // plunger travel with the 2D renderer's release snap: a brief sine
    // overshoot past rest when the charge lets go
    const PLUNGER = this.table.plunger;
    if (this.plungerLastCharge > 0.1 && snap.plungerCharge === 0) this.plungerStrikeAt = now;
    this.plungerLastCharge = snap.plungerCharge;
    const strikePhase = (now - this.plungerStrikeAt) / 0.14;
    const overshoot =
      strikePhase >= 0 && strikePhase < 1 ? Math.sin(Math.PI * strikePhase) * 0.007 : 0;
    const tipZ = this.plungerTipRestZ + PLUNGER.pull * snap.plungerCharge - overshoot;
    this.plungerGroup!.position.z = tipZ;
    const springTop = tipZ + 0.005;
    this.plungerSpring!.position.z = springTop;
    this.plungerSpring!.scale.z = Math.max(
      0.15,
      (PLUNGER.baseY - springTop) / this.plungerSpringRest,
    );

    for (const fx of this.fx) {
      if (!fx.live) continue;
      fx.t += dt;
      const k = fx.t / 0.45;
      if (k >= 1) {
        fx.live = false;
        fx.mesh.visible = false;
        continue;
      }
      const s = 0.015 + k * fx.grow;
      fx.mesh.scale.set(s, 1, s);
      // subtle impact cue, not a shockwave — quadratic fade ends it early
      fx.mat.opacity = 0.3 * (1 - k) * (1 - k);
    }

    const cx = this.table.width / 2;
    if (this.view === "flat") {
      // top-down ortho framing the exact 2D scroll window [camera.y, +viewH];
      // fog off — depth is uniform straight down, it would only wash the art
      this.scene.fog = null;
      const halfH = camera.viewH / 2;
      const halfW = halfH * (this.lastW / this.lastAvailH);
      this.camFlat.left = -halfW;
      this.camFlat.right = halfW;
      this.camFlat.top = halfH;
      this.camFlat.bottom = -halfH;
      this.camFlat.updateProjectionMatrix();
      const cz = camera.y + halfH + camera.shakeY;
      this.camFlat.position.set(cx + camera.shakeX, 1.2, cz);
      this.camFlat.lookAt(cx + camera.shakeX, 0, cz);
      this.renderPass!.camera = this.camFlat;
      this.composer!.render();
    } else {
      // tilted chase camera mirroring the 2D scroll window [camera.y, +viewH].
      // Framing solved against the frustum: with fov 38 these factors put the
      // bottom screen edge at ≈ window bottom + 0.04 m and the top edge just
      // above the window top — the old factors over-covered the top and cut
      // the flipper/drain area off the bottom of the screen.
      this.scene.fog = this.fog;
      const focusZ = camera.y + camera.viewH * 0.62;
      // These factors were solved for a landscape frustum; on a narrow
      // (portrait) canvas the horizontal wedge is thinner than the table, so
      // pull the camera back along its boom until the window-bottom ground
      // line (view-space depth ≈ 1.126·viewH at k = 1) spans the table width.
      const tanHalfW = Math.tan((this.cam3.fov * Math.PI) / 360) * this.cam3.aspect;
      const k = Math.max(
        1,
        (this.table.width / 2 + 0.012) / (tanHalfW * camera.viewH * 1.126),
      );
      this.cam3.position.set(
        cx + camera.shakeX,
        camera.viewH * 1.13 * k + camera.shakeY,
        focusZ + camera.viewH * 0.69 * k,
      );
      this.cam3.lookAt(cx, 0, focusZ);
      this.renderPass!.camera = this.cam3;
      this.composer!.render();
    }

    // DOM chrome updates (throttled; the DMD canvas repaints itself)
    if (snap.dmd && !this.dmdMounted && this.panelEl) {
      this.dmdMounted = true;
      this.panelEl.prepend(snap.dmd);
    }
    this.hudAccum += dt;
    if (this.hudEl && this.hudAccum > 0.25) {
      this.hudAccum = 0;
      const parts: string[] = [];
      if (snap.hudStats) parts.push(`${Math.round(snap.fps)} fps · js ${snap.jsMs.toFixed(1)}ms · 3D`);
      if (snap.hudKeys)
        parts.push(
          "Enter — start · Z / Shift — flippers · hold Space — plunger · arrows — nudge · Esc — settings",
        );
      this.hudEl.textContent = parts.join(" — ");
      this.hudEl.style.display = parts.length ? "" : "none";
    }
  }

  private resize(renderScale: number): void {
    const dpr = (window.devicePixelRatio || 1) * (renderScale || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === this.lastW && h === this.lastH && dpr === this.lastDpr) return;
    this.lastW = w;
    this.lastH = h;
    this.lastDpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w * dpr, h * dpr);
    // Portrait: the DOM DMD strip owns the top band. Both cameras frame the
    // scroll window against the region BELOW it — the virtual view is
    // w × availH and the canvas extends `strip` px above it, so the strip
    // covers table-top overdraw, never the window itself.
    const strip = this.topStripCss(w, h);
    this.lastAvailH = Math.max(1, h - strip);
    for (const cam of [this.cam3, this.camFlat]) {
      if (strip > 0) cam.setViewOffset(w, this.lastAvailH, 0, -strip, w, h);
      else cam.clearViewOffset();
    }
    this.cam3.aspect = w / this.lastAvailH;
    this.cam3.updateProjectionMatrix();
  }

  dispose(): void {
    this.panelEl?.remove();
    this.hudEl?.remove();
    this.dmdMounted = false;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    this.pmrem?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

/**
 * Clamp a material's outgoing light in-shader, just under the bloom
 * threshold. ACES already compresses these values to near-white, so the
 * clamp is visually invisible — but the bloom pass can never see chrome
 * speculars (the key light's lobe on a smooth metal sphere peaks 5–10×,
 * past any sane threshold). Zero cost: one min() in the fragment shader.
 */
function clampBloom<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "outgoingLight = min(outgoingLight, vec3(1.25));\n#include <opaque_fragment>",
    );
  };
  return mat;
}

/**
 * Environment for the chrome reflections: a dim arcade room with one long
 * ceiling striplight, two soft side panels and a faint warm back wall —
 * cabinet GI, essentially. Every emitter is intensity-capped (≤2.2×) so
 * env glints stay just above the bloom threshold instead of overdriving it.
 */
function makeCabinetEnv(): THREE.Scene {
  const s = new THREE.Scene();
  // Stainless is a GRADIENT, not a level: bright above, a dark "chrome
  // horizon" band at the equator, softer bounce below — the same 3-stop
  // chrome ramp with a hard mid-stop the style guide (§7) uses for the 2D
  // ball. A gradient dome gives the metal that structure; a uniform room
  // reads as flat reflective grey (playtested both ways).
  const cnv = document.createElement("canvas");
  cnv.width = 2;
  cnv.height = 256;
  const c = cnv.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#eef3fa"); // zenith — bright sky
  g.addColorStop(0.38, "#a8b2c2");
  g.addColorStop(0.52, "#3a4048"); // the horizon band, hard-ish stop
  g.addColorStop(0.6, "#272c33");
  g.addColorStop(0.78, "#4e565f"); // floor bounce
  g.addColorStop(1, "#3d444c");
  c.fillStyle = g;
  c.fillRect(0, 0, 2, 256);
  const domeTex = new THREE.CanvasTexture(cnv);
  domeTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 24),
    new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide }),
  );
  s.add(dome);
  const panel = (
    w: number,
    h: number,
    intensity: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
  ) => {
    const mat = new THREE.MeshBasicMaterial();
    mat.color.setScalar(intensity);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    s.add(m);
  };
  panel(6, 1.2, 2.2, 0, 4, 0, Math.PI / 2); // ceiling striplight
  panel(3, 2, 1.4, -4, 1.5, 0, 0, Math.PI / 2); // left softbox
  panel(3, 2, 1.4, 4, 1.5, 0, 0, -Math.PI / 2); // right softbox

  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.85, 0.65) });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.5), warm);
  back.position.set(0, 1.2, -4.5);
  s.add(back);
  return s;
}

/**
 * Extrude a 2D table-space polygon (x, y-down) into a solid standing on the
 * playfield: shape plane → xz, thickness along +y (height 0..depth).
 */
function extrudeFlat(
  pts: { x: number; y: number }[],
  depth: number,
  mat: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
  // bevelled edges catch the key light — an unbevelled extrusion's flat top
  // shades uniformly and reads as a 2D sticker. bevelOffset cancels bevelSize
  // so the widest cross-section stays on the physics outline, and the depth
  // is trimmed so total height still equals `depth` (bevel adds to both ends)
  const bevel = Math.min(0.0025, depth * 0.2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
  });
  // planar-map UVs from the shape's bbox (top-down projection, before the
  // rotate) so a gradient map spans the part edge-to-edge; the extrude's own
  // UVs mix cap (shape-space) and wall (depth-space) coordinates and a
  // gradient sampled through them tears at the cap/wall seam
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (pos.getX(i) - minX) / (maxX - minX || 1),
      (pos.getY(i) - minY) / (maxY - minY || 1),
    );
  }
  geo.rotateX(Math.PI / 2); // (x, y, 0) → (x, 0, y); extrusion ends up below…
  geo.translate(0, depth - bevel, 0); // …so lift the solid back onto the floor
  return new THREE.Mesh(geo, mat);
}

/**
 * Flipper bat outline for rendering: the convex hull of the round base (the
 * physics base-circle fixture the old mesh omitted — its absence is why the
 * pivot end looked chopped off) and a rounded tip. Stays inside the physics
 * silhouette: base radius is the fixture's, tip circle is inset so it rounds
 * within the trapezoid's x ≤ length, |y| ≤ tip half-width envelope.
 */
function flipperShapePts(side: FlipperSide): Pt[] {
  const r = FLIPPER.baseRadius;
  const tipR = 0.007; // flipperVerts' tip half-width
  const cx = FLIPPER.length - tipR;
  const th = Math.acos((r - tipR) / cx); // common-tangent contact angle
  const pts: Pt[] = [];
  const arc = (cx0: number, rad: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push({ x: cx0 + rad * Math.cos(a), y: rad * Math.sin(a) });
    }
  };
  arc(0, r, th, 2 * Math.PI - th, 24); // back of the base, the long way round
  arc(cx, tipR, -th, th, 10); // rounded tip; tangent lines join the arcs
  if (side === "left") return pts;
  return pts.map((p) => ({ x: -p.x, y: p.y })).reverse();
}

/**
 * The 2D renderer's approved brass ramp (#f4d27a → #e0b64e → #9c7c2c) baked
 * to a small gradient texture. extrudeFlat planar-maps UVs over the shape's
 * bbox, so "u" runs along its x extent (flipper base→tip; "u-rev" for the
 * mirrored right bat). Flippers only — slings left brass on 2026-07-16 (§7).
 */
function brassTexture(dir: "u" | "u-rev"): THREE.CanvasTexture {
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 64;
  const ctx = cnv.getContext("2d")!;
  const grad =
    dir === "u"
      ? ctx.createLinearGradient(0, 0, 64, 0)
      : ctx.createLinearGradient(64, 0, 0, 0);
  grad.addColorStop(0, "#f4d27a");
  grad.addColorStop(0.55, "#e0b64e");
  grad.addColorStop(1, "#9c7c2c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
