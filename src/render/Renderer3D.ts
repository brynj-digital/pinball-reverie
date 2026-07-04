import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Camera } from "../core/Camera";
import { BALL_RADIUS, PLUNGER, TABLE, flipperVerts } from "../table/geometry";
import { parseTableSvg } from "../table/SvgCollision";
import { loadSvgAt } from "./svgImage";
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
const RAIL_LOW = 0.011; // lower rail centre height (ball equator-ish)
const RAIL_HIGH = 0.024; // upper rail — walls read taller than the ball
const PALETTE = {
  bg: 0x0c0d14,
  rail: 0xbdc9dc,
  flipper: 0xd9a94a,
  bumper: 0x123339,
  bumperGlow: 0x35e0d6,
  sling: 0xd9b24a,
  target: 0xe0b64e,
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
  private fog = new THREE.FogExp2(PALETTE.bg, 0.22);
  private pmrem?: THREE.PMREMGenerator;
  private envTex?: THREE.Texture;
  private table!: TableRenderData;

  private ballMesh?: THREE.Mesh;
  private ballMat?: THREE.MeshStandardMaterial;
  private prevBallPos = new THREE.Vector3();
  private flipperMeshes: THREE.Mesh[] = [];
  private bumperGlowMats: THREE.MeshStandardMaterial[] = [];
  private bumperLights: THREE.PointLight[] = [];
  private slingMats: THREE.MeshStandardMaterial[] = [];
  private targetMeshes: THREE.Mesh[] = [];
  private rolloverMats: THREE.MeshStandardMaterial[] = [];
  private rolloverGlowMats: THREE.MeshBasicMaterial[] = [];
  private spinnerMesh?: THREE.Mesh;
  private plungerRod?: THREE.Mesh;
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

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  setView3D(view: View3D): void {
    this.view = view;
  }

  init(table: TableRenderData): void {
    this.table = table;
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = this.fog;
    this.camFlat.up.set(0, 0, -1); // screen-up is up-table when looking down

    // metallic reflections for the ball and rails ONLY — assigned per-material,
    // never as scene.environment: RoomEnvironment is strongly HDR (emissive
    // panels at 17–100×) and as an IBL it out-shines the scene lights on every
    // diffuse element, washing the palette no matter how the lights are tuned
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.buildLights();
    this.buildPlayfield();
    this.buildWalls();
    this.buildPlunger();
    this.buildPanel();
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
    key.target.position.set(TABLE.width / 2, 0, TABLE.height * 0.45);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -0.8;
    sc.right = 0.8;
    sc.top = 0.8;
    sc.bottom = -0.8;
    sc.near = 0.1;
    sc.far = 4;
    this.scene.add(key, key.target);
  }

  private buildPlayfield(): void {
    const geo = new THREE.PlaneGeometry(this.table.width, this.table.height);
    geo.rotateX(-Math.PI / 2); // face up; texture top edge lands at z=0
    // UNLIT and un-tonemapped: the art must display exactly as authored, like
    // the 2D renderer shows it — through a lit material it becomes albedo and
    // scene lighting multiplies the whole palette brighter than the masters
    const mat = new THREE.MeshBasicMaterial({ color: 0x232438 });
    mat.toneMapped = false;
    const plane = new THREE.Mesh(geo, mat);
    plane.position.set(this.table.width / 2, 0, this.table.height / 2);
    this.scene.add(plane);

    // basic materials can't receive shadows — a transparent shadow catcher
    // just above the art keeps the ball/flipper shadows
    const catcher = new THREE.Mesh(
      geo.clone(),
      new THREE.ShadowMaterial({ opacity: 0.3 }),
    );
    catcher.position.set(this.table.width / 2, 0.0004, this.table.height / 2);
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    if (this.table.artSvgText) {
      // the same SVG the 2D renderer draws, rasterized once as the plane map
      loadSvgAt(
        this.table.artSvgText,
        1280,
        Math.round((1280 * this.table.height) / this.table.width),
        (img) => {
          const tex = new THREE.Texture(img);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          tex.needsUpdate = true;
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        },
        "playfield",
      );
    }
  }

  /** Walls: the SVG's collision polylines extruded as two stacked rails. */
  private buildWalls(): void {
    if (!this.table.artSvgText) return;
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xaebcd0,
      metalness: 0.9,
      roughness: 0.38,
      envMap: this.envTex,
      envMapIntensity: 0.55, // full env reflections read white-hot on the arch
    });
    for (const wall of parseTableSvg(this.table.artSvgText).walls) {
      for (const [h, r] of [
        [RAIL_LOW, wall.radius],
        [RAIL_HIGH, wall.radius * 0.7],
      ] as const) {
        const path = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i < wall.pts.length - 1; i++) {
          path.add(
            new THREE.LineCurve3(
              new THREE.Vector3(wall.pts[i].x, h, wall.pts[i].y),
              new THREE.Vector3(wall.pts[i + 1].x, h, wall.pts[i + 1].y),
            ),
          );
        }
        if (wall.loop) {
          const last = wall.pts[wall.pts.length - 1];
          path.add(
            new THREE.LineCurve3(
              new THREE.Vector3(last.x, h, last.y),
              new THREE.Vector3(wall.pts[0].x, h, wall.pts[0].y),
            ),
          );
        }
        const geo = new THREE.TubeGeometry(
          path,
          Math.max(8, wall.pts.length * 2),
          r,
          10,
          wall.loop,
        );
        this.scene.add(new THREE.Mesh(geo, railMat));
      }
    }
  }

  private buildPlunger(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9aa5b8,
      metalness: 0.85,
      roughness: 0.35,
      envMap: this.envTex,
      envMapIntensity: 0.55,
    });
    const rod = new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 10);
    rod.rotateX(Math.PI / 2); // lie along z (down the lane)
    this.plungerRod = new THREE.Mesh(rod, mat);
    this.plungerRod.position.set(PLUNGER.x, 0.01, PLUNGER.tipRestY + 0.025);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }),
    );
    tip.position.set(0, 0, -0.025);
    this.plungerRod.add(tip);
    this.scene.add(this.plungerRod);
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
    this.hudEl.textContent =
      "Enter — start · Z / Shift — flippers · hold Space — plunger · arrows — nudge · Esc — settings";
    document.body.appendChild(this.hudEl);
  }

  /** Element meshes are built from the first snapshot — the renderer learns
   * counts and placements from the world, not from table constants. */
  private buildDynamic(snap: WorldSnapshot): void {
    this.built = true;

    this.ballMat = new THREE.MeshStandardMaterial({
      color: PALETTE.ball,
      metalness: 1,
      roughness: 0.12,
      transparent: true,
      envMap: this.envTex,
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), this.ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    this.prevBallPos.set(snap.ball.x, BALL_RADIUS, snap.ball.y);

    // element materials get NO envMap — see init(); they're lit by the scene
    // lights alone so their albedo reads at authored saturation
    const flipMat = new THREE.MeshStandardMaterial({
      color: PALETTE.flipper,
      metalness: 0.3,
      roughness: 0.45,
    });
    this.flipperMeshes = snap.flippers.map((f) => {
      const mesh = extrudeFlat(flipperVerts(f.side), 0.016, flipMat);
      mesh.position.set(f.x, 0.002, f.y);
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    });

    // rim ring matches the rail chrome so bumpers share the table's metal
    const bumperRimMat = new THREE.MeshStandardMaterial({
      color: 0xbdc9dc,
      metalness: 0.9,
      roughness: 0.35,
      envMap: this.envTex,
      envMapIntensity: 0.55,
    });
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

    for (const s of snap.elements.slings) {
      const mat = new THREE.MeshStandardMaterial({
        color: PALETTE.sling,
        emissive: PALETTE.sling,
        emissiveIntensity: 0,
        metalness: 0.3,
        roughness: 0.5,
      });
      const mesh = extrudeFlat(s.verts, 0.018, mat);
      mesh.position.y = 0.001;
      mesh.castShadow = true;
      this.slingMats.push(mat);
      this.scene.add(mesh);
    }

    const targetMat = new THREE.MeshStandardMaterial({
      color: PALETTE.target,
      emissive: PALETTE.target,
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

    const sp = snap.elements.spinner;
    this.spinnerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sp.halfW * 2 - 0.004, 0.0016, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0xd8dee9,
        metalness: 0.85,
        roughness: 0.3,
        envMap: this.envTex,
        envMapIntensity: 0.55,
      }),
    );
    this.spinnerMesh.position.set(sp.x, BALL_RADIUS, sp.y);
    this.scene.add(this.spinnerMesh);
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
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 28), mat);
      mesh.geometry.rotateX(-Math.PI / 2);
      this.scene.add(mesh);
      fx = { mesh, mat, t: 0, live: false, grow: 0.1 };
      this.fx.push(fx);
    }
    fx.live = true;
    fx.t = 0;
    fx.grow = kind === "flash" ? 0.09 : 0.14;
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

    // ball: position + faked rolling (real spin is planar and reads wrong)
    const ball = this.ballMesh!;
    ball.position.set(snap.ball.x, BALL_RADIUS, snap.ball.y);
    const delta = ball.position.clone().sub(this.prevBallPos);
    const dist = delta.length();
    if (dist > 1e-6) {
      const axis = new THREE.Vector3(0, 1, 0).cross(delta).normalize();
      ball.rotateOnWorldAxis(axis, dist / BALL_RADIUS);
    }
    this.prevBallPos.copy(ball.position);
    this.ballMat!.opacity = snap.ball.alpha;
    ball.visible = snap.ball.alpha > 0.02;

    snap.flippers.forEach((f, i) => {
      this.flipperMeshes[i].rotation.y = -f.angle;
    });

    snap.elements.bumpers.forEach((b, i) => {
      this.bumperGlowMats[i].emissiveIntensity = 0.35 + b.flash * 2.4;
      this.bumperLights[i].intensity = b.flash * 0.05;
    });
    snap.elements.slings.forEach((s, i) => {
      this.slingMats[i].emissiveIntensity = s.flash * 1.6;
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
    this.spinnerMesh!.rotation.x = snap.elements.spinner.angle;
    this.plungerRod!.position.z =
      PLUNGER.tipRestY + PLUNGER.pull * snap.plungerCharge + 0.025;

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
      fx.mat.opacity = 0.85 * (1 - k);
    }

    const cx = this.table.width / 2;
    if (this.view === "flat") {
      // top-down ortho framing the exact 2D scroll window [camera.y, +viewH];
      // fog off — depth is uniform straight down, it would only wash the art
      this.scene.fog = null;
      const halfH = camera.viewH / 2;
      const halfW = halfH * (this.lastW / Math.max(1, this.lastH));
      this.camFlat.left = -halfW;
      this.camFlat.right = halfW;
      this.camFlat.top = halfH;
      this.camFlat.bottom = -halfH;
      this.camFlat.updateProjectionMatrix();
      const cz = camera.y + halfH + camera.shakeY;
      this.camFlat.position.set(cx + camera.shakeX, 1.2, cz);
      this.camFlat.lookAt(cx + camera.shakeX, 0, cz);
      this.renderer.render(this.scene, this.camFlat);
    } else {
      // tilted chase camera mirroring the 2D scroll window [camera.y, +viewH].
      // Framing solved against the frustum: with fov 38 these factors put the
      // bottom screen edge at ≈ window bottom + 0.04 m and the top edge just
      // above the window top — the old factors over-covered the top and cut
      // the flipper/drain area off the bottom of the screen.
      this.scene.fog = this.fog;
      const focusZ = camera.y + camera.viewH * 0.62;
      this.cam3.position.set(
        cx + camera.shakeX,
        camera.viewH * 1.13 + camera.shakeY,
        focusZ + camera.viewH * 0.69,
      );
      this.cam3.lookAt(cx, 0, focusZ);
      this.renderer.render(this.scene, this.cam3);
    }

    // DOM chrome updates (throttled; the DMD canvas repaints itself)
    if (snap.dmd && !this.dmdMounted && this.panelEl) {
      this.dmdMounted = true;
      this.panelEl.prepend(snap.dmd);
    }
    this.hudAccum += dt;
    if (this.hudEl && this.hudAccum > 0.25) {
      this.hudAccum = 0;
      this.hudEl.textContent =
        `${Math.round(snap.fps)} fps · js ${snap.jsMs.toFixed(1)}ms · 3D — ` +
        "Enter — start · Z / Shift — flippers · hold Space — plunger · arrows — nudge · Esc — settings";
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
    this.cam3.aspect = w / h;
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
    this.renderer.dispose();
  }
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
  geo.rotateX(Math.PI / 2); // (x, y, 0) → (x, 0, y); extrusion ends up below…
  geo.translate(0, depth - bevel, 0); // …so lift the solid back onto the floor
  return new THREE.Mesh(geo, mat);
}
