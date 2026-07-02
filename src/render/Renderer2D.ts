import type { Camera } from "../core/Camera";
import { BALL_RADIUS, FLIPPER, PLUNGER, flipperVerts } from "../table/geometry";
import type {
  EffectKind,
  Renderer,
  TableRenderData,
  WorldSnapshot,
} from "./Renderer";

/** Load SVG text as an image with its intrinsic size forced to w×h px. */
function loadSvgAt(
  svgText: string,
  w: number,
  h: number,
  onload: (img: HTMLImageElement) => void,
): void {
  const sized = svgText.replace(
    /<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/,
    `<svg$1 width="${w}" height="${h}"`,
  );
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    onload(img);
  };
  img.src = url;
}

/**
 * Canvas-2D placeholder renderer for Milestones 0–3. Reads a WorldSnapshot;
 * never touches the physics world (plan §2 decoupling rule). Real playfield
 * art arrives from Claude Design at milestone 3.5.
 */
export class Renderer2D implements Renderer {
  private ctx: CanvasRenderingContext2D;
  private table!: TableRenderData;
  private art?: HTMLImageElement;
  private artScale = 0; // px per metre the current art raster was built for
  private artPendingScale = 0;
  private ballArt?: HTMLImageElement;
  private backglass?: HTMLImageElement;
  /** Recent ball positions for the speed-scaled motion trail. */
  private trail: { x: number; y: number }[] = [];
  private lastCharge = 0;
  private strikeAt = -Infinity; // performance.now()/1000 of the last release
  private lastOx = 0; // table centering offset (device px), for panel layout
  // frame-time diagnostics for the HUD (worst frame + slow count, trailing 2s)
  private frameTimes: number[] = [];
  private lastFrameAt = 0;

  constructor(private canvas: HTMLCanvasElement) {
    // alpha:false — the frame is fully painted every time, so an opaque
    // canvas lets the compositor skip blending it with the page
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }

  init(table: TableRenderData): void {
    this.table = table;
    if (table.ballSvgText) {
      // one-time: 128 px is plenty for a ball that renders at ~40–90 px
      loadSvgAt(table.ballSvgText, 128, 128, (img) => (this.ballArt = img));
    }
    if (table.backglassSvgText) {
      loadSvgAt(table.backglassSvgText, 600, 720, (img) => (this.backglass = img));
    }
  }

  /**
   * (Re)rasterize the playfield SVG at the current display scale. SVG images
   * rasterize at their intrinsic size, so the master's width/height attrs
   * are rewritten to the target pixel size before loading — that keeps the
   * art vector-crisp at any zoom / DPR. Rebuilds only on >15% scale change.
   */
  private ensureArt(pxPerMetre: number): void {
    if (!this.table.artSvgText) return;
    if (this.art && Math.abs(pxPerMetre - this.artScale) / pxPerMetre < 0.15) return;
    if (this.artPendingScale === pxPerMetre) return;
    this.artPendingScale = pxPerMetre;
    const w = Math.ceil(this.table.width * pxPerMetre);
    const h = Math.ceil(this.table.height * pxPerMetre);
    loadSvgAt(this.table.artSvgText, w, h, (img) => {
      this.art = img;
      this.artScale = pxPerMetre;
      this.artPendingScale = 0;
    });
  }

  drawFrame(snap: WorldSnapshot, camera: Camera): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    // world transform: metres → pixels, camera scroll + shake, table centred
    const s = h / camera.viewH;
    const ox = (w - s * this.table.width) / 2;
    this.lastOx = ox;

    // Background: the art column is opaque, so only the side margins need
    // the void fill — a full-canvas fill would repaint ~2× the pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0c0d14";
    if (ox > 0) {
      ctx.fillRect(0, 0, Math.ceil(ox), h);
      ctx.fillRect(Math.floor(ox + s * this.table.width), 0, Math.ceil(ox) + 1, h);
    }

    ctx.setTransform(s, 0, 0, s, ox + camera.shakeX * s, -(camera.y + camera.shakeY) * s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Playfield art — draw only the visible slice (the table is ~1.9 screens
    // tall; blitting all of it rasterized ~45% wasted pixels every frame).
    this.ensureArt(s); // s is device px per metre (canvas is DPR-sized)
    if (this.art) {
      const pad = 0.03 + Math.abs(camera.shakeY); // slack for shake + rounding
      const top = Math.max(0, camera.y - pad);
      const bot = Math.min(this.table.height, camera.y + camera.viewH + pad);
      const pxPerM = this.art.height / this.table.height;
      ctx.drawImage(
        this.art,
        0,
        top * pxPerM,
        this.art.width,
        (bot - top) * pxPerM,
        0,
        top,
        this.table.width,
        bot - top,
      );
    } else {
      ctx.fillStyle = "#1b1e2c";
      ctx.fillRect(0, 0, this.table.width, this.table.height);
    }

    this.drawElements(snap);
    this.drawEffects();
    this.drawPlunger(snap.plungerCharge);

    // flippers
    for (const f of snap.flippers) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      // brass ramp along the bat + rim light on the striking face (§7)
      const dir = f.side === "left" ? 1 : -1;
      const bat = ctx.createLinearGradient(0, 0, dir * FLIPPER.length, 0);
      bat.addColorStop(0, "#f4d27a");
      bat.addColorStop(0.55, "#e0b64e");
      bat.addColorStop(1, "#9c7c2c");
      ctx.beginPath();
      flipperVerts(f.side).forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.closePath();
      ctx.fillStyle = bat;
      ctx.fill();
      ctx.strokeStyle = "#07080d";
      ctx.lineWidth = 0.0025;
      ctx.stroke();
      // round base over the pivot, matching the physics fixture
      ctx.beginPath();
      ctx.arc(0, 0, FLIPPER.baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dir * 0.006, -FLIPPER.baseRadius + 0.0025);
      ctx.lineTo(dir * (FLIPPER.length - 0.005), -0.0055);
      ctx.strokeStyle = "rgba(255, 246, 214, 0.75)";
      ctx.lineWidth = 0.0022;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    // motion trail: additive ghosts, fading in above ~0.6 m/s
    const b = snap.ball;
    const speed = Math.hypot(b.vx, b.vy);
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(b.x - last.x, b.y - last.y) > 0.15) this.trail.length = 0; // teleport
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 9) this.trail.shift();
    const trailAlpha = Math.min(0.5, Math.max(0, (speed - 0.6) / 2.5));
    if (trailAlpha > 0.02) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const f = (i + 1) / this.trail.length;
        this.drawGlow(
          this.trail[i].x,
          this.trail[i].y,
          BALL_RADIUS * (0.4 + 0.6 * f),
          "215, 224, 240",
          trailAlpha * f * f,
        );
      }
    }

    // ball — stainless SVG art, procedural gradient until it loads
    ctx.save();
    ctx.globalAlpha = b.alpha;
    if (this.ballArt) {
      ctx.drawImage(
        this.ballArt,
        b.x - BALL_RADIUS,
        b.y - BALL_RADIUS,
        BALL_RADIUS * 2,
        BALL_RADIUS * 2,
      );
      // rolling cue: faint reflection smudges that rotate with the ball's spin
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.strokeStyle = "rgba(35, 38, 47, 0.22)";
      ctx.lineWidth = BALL_RADIUS * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_RADIUS * 0.58, -0.35, 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, BALL_RADIUS * 0.58, Math.PI - 0.35, Math.PI + 0.35);
      ctx.stroke();
      ctx.restore();
    } else {
      const grad = ctx.createRadialGradient(
        b.x - BALL_RADIUS * 0.35,
        b.y - BALL_RADIUS * 0.35,
        BALL_RADIUS * 0.15,
        b.x,
        b.y,
        BALL_RADIUS,
      );
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.5, "#aeb6c8");
      grad.addColorStop(1, "#565d6e");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore(); // ball alpha

    if (snap.debugShapes) this.drawDebug(snap);

    this.drawHud(snap, w, h, dpr);
  }

  private effects: { kind: EffectKind; x: number; y: number; born: number }[] = [];

  spawnEffect(kind: EffectKind, x: number, y: number): void {
    this.effects.push({ kind, x, y, born: performance.now() / 1000 });
    if (this.effects.length > 24) this.effects.shift();
  }

  /** Pooled expanding-ring effects, additive, per §5d. */
  private drawEffects(): void {
    if (this.effects.length === 0) return;
    const { ctx } = this;
    const now = performance.now() / 1000;
    const COLORS: Record<EffectKind, string> = {
      flash: "#52e0e8",
      launch: "#f4d27a",
      drain: "#8c6bff",
    };
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.effects = this.effects.filter((e) => {
      const f = (now - e.born) / 0.35;
      if (f >= 1) return false;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 0.012 + f * 0.045, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS[e.kind];
      ctx.globalAlpha = 0.7 * (1 - f);
      ctx.lineWidth = 0.005 * (1 - f) + 0.001;
      ctx.stroke();
      return true;
    });
    ctx.restore();
  }

  /**
   * Composite the DMD into the side panel (plan §4.5 landscape layout): the
   * void left of the table if it's wide enough, else a compact strip under
   * the fps readout. Steel bezel with a chrome top rim per the style guide.
   */
  private drawDmdPanel(dmd: HTMLCanvasElement): void {
    const { ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const margin = this.lastOx / dpr; // void left of the table, CSS px
    let w: number, x: number, y: number;
    if (margin >= 240) {
      w = Math.min(margin - 32, 560);
      x = (margin - w) / 2;
      y = 28;
    } else {
      // narrow window: compact strip under the fps readout
      w = 264;
      x = 10;
      y = 30;
    }
    const h = w / 4;
    ctx.fillStyle = "#2c3352";
    ctx.strokeStyle = "#07080d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#aeb6c8";
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 8);
    ctx.lineTo(x + w + 4, y - 8);
    ctx.stroke();
    ctx.drawImage(dmd, x, y, w, h);

    // backglass art below the DMD when the panel is wide enough (§4.5)
    if (this.backglass && margin >= 240) {
      const bw = w;
      const bh = bw * 1.2;
      const by = y + h + 22;
      const avail = this.canvas.height / dpr - by - 30;
      const scale = Math.min(1, avail / bh);
      if (scale > 0.4) ctx.drawImage(this.backglass, x, by, bw * scale, bh * scale);
    }
  }

  /**
   * The plunger assembly under the saddle: chrome rod + tip plate, a coil
   * spring that squashes as the charge pulls the rod down, and a brass base.
   * On release the tip snaps up with a brief overshoot past its rest.
   */
  private drawPlunger(charge: number): void {
    const { ctx } = this;
    const now = performance.now() / 1000;
    if (this.lastCharge > 0.1 && charge === 0) this.strikeAt = now;
    this.lastCharge = charge;

    const strikePhase = (now - this.strikeAt) / 0.14;
    const overshoot =
      strikePhase >= 0 && strikePhase < 1 ? Math.sin(Math.PI * strikePhase) * 0.007 : 0;
    const tipY = PLUNGER.tipRestY + PLUNGER.pull * charge - overshoot;
    const x = PLUNGER.x;

    // coil spring between rod bottom and base plate
    const springTop = tipY + 0.013;
    const springBot = PLUNGER.baseY;
    const coils = 6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const [w, color] of [
      [0.0045, "#07080d"],
      [0.0024, "#7f8fc9"],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, springTop);
      for (let i = 0; i < coils; i++) {
        const t0 = springTop + ((i + 0.5) * (springBot - springTop)) / coils;
        ctx.lineTo(x + (i % 2 === 0 ? 0.011 : -0.011), t0);
      }
      ctx.lineTo(x, springBot);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
    }

    // rod + tip plate
    ctx.fillStyle = "#aeb6c8";
    ctx.strokeStyle = "#07080d";
    ctx.lineWidth = 0.0015;
    ctx.beginPath();
    ctx.rect(x - 0.004, tipY, 0.008, 0.014);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x - 0.009, tipY - 0.005, 0.018, 0.005, 0.0015);
    ctx.fillStyle = "#d7dce8";
    ctx.fill();
    ctx.stroke();

    // base plate
    ctx.beginPath();
    ctx.roundRect(x - 0.011, springBot, 0.022, 0.006, 0.0015);
    ctx.fillStyle = "#e0b64e";
    ctx.fill();
    ctx.stroke();
  }

  private glowSprites = new Map<string, HTMLCanvasElement>();

  /**
   * Additive radial halo (style guide §7: lamps glow additively). The
   * gradient is baked once per color into a small sprite; per-frame cost is
   * a single drawImage with globalAlpha — same output as a live gradient.
   */
  private drawGlow(x: number, y: number, radius: number, rgb: string, alpha: number): void {
    if (alpha <= 0.01) return;
    let sprite = this.glowSprites.get(rgb);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const g = sprite.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${rgb}, 0.55)`);
      grad.addColorStop(0.4, `rgba(${rgb}, 0.25)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.glowSprites.set(rgb, sprite);
    }
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  /** Placeholder element art per the style guide's materials card. */
  private drawElements(snap: WorldSnapshot): void {
    const { ctx } = this;
    const el = snap.elements;

    // rollover inserts — the art carries the unlit moon-phase inserts;
    // the renderer only adds the lit glow (or a plain insert pre-art)
    for (const r of el.rollovers) {
      if (r.lit > 0) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 0.011, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 107, 255, ${0.4 + 0.6 * r.lit})`;
        ctx.fill();
        this.drawGlow(r.x, r.y, 0.032, "140, 107, 255", r.lit);
      } else if (!this.art) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 0.011, 0, Math.PI * 2);
        ctx.fillStyle = "#2f2547";
        ctx.fill();
        ctx.lineWidth = 0.002;
        ctx.strokeStyle = "#07080d";
        ctx.stroke();
      }
    }

    // spinner — bar whose projected thickness fakes rotation about the lane axis
    const sp = el.spinner;
    this.drawGlow(sp.x, sp.y, 0.03, "244, 210, 122", sp.spin * 0.9);
    const thick = Math.max(0.003, 0.013 * Math.abs(Math.cos(sp.angle)));
    ctx.fillStyle = "#e0b64e";
    ctx.strokeStyle = "#07080d";
    ctx.lineWidth = 0.0015;
    ctx.beginPath();
    ctx.rect(sp.x - sp.halfW + 0.004, sp.y - thick / 2, sp.halfW * 2 - 0.008, thick);
    ctx.fill();
    ctx.stroke();

    // slingshots — brass triangles, flash whitens with an additive halo
    for (const s of el.slings) {
      if (s.flash > 0.01) {
        const cx = s.verts.reduce((a, p) => a + p.x, 0) / s.verts.length;
        const cy = s.verts.reduce((a, p) => a + p.y, 0) / s.verts.length;
        this.drawGlow(cx, cy, 0.06, "244, 210, 122", s.flash);
      }
      const ys = s.verts.map((p) => p.y);
      const grad = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
      grad.addColorStop(0, "#f4d27a");
      grad.addColorStop(0.5, "#e0b64e");
      grad.addColorStop(1, "#9c7c2c");
      ctx.beginPath();
      s.verts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = s.flash > 0.01 ? `rgba(255, 240, 200, ${0.6 + 0.4 * s.flash})` : grad;
      ctx.fill();
      ctx.lineWidth = 0.003;
      ctx.strokeStyle = "#07080d";
      ctx.stroke();
      // rim light along the striking face (apex → second vertex)
      ctx.beginPath();
      ctx.moveTo(s.verts[0].x, s.verts[0].y);
      ctx.lineTo(s.verts[1].x, s.verts[1].y);
      ctx.strokeStyle = "rgba(255, 246, 214, 0.7)";
      ctx.lineWidth = 0.0025;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // drop targets — brass faces lit from the playfield side; dropped = dim outline
    for (const t of el.targets) {
      ctx.beginPath();
      ctx.rect(t.x - t.hw, t.y - t.hh, t.hw * 2, t.hh * 2);
      if (t.up) {
        const tg = ctx.createLinearGradient(t.x - t.hw, 0, t.x + t.hw, 0);
        tg.addColorStop(0, "#f4d27a");
        tg.addColorStop(1, "#9c7c2c");
        ctx.fillStyle = tg;
        ctx.fill();
        ctx.lineWidth = 0.002;
        ctx.strokeStyle = "#07080d";
        ctx.stroke();
      } else {
        ctx.lineWidth = 0.0015;
        ctx.strokeStyle = "#2c3352";
        ctx.stroke();
      }
    }

    // pop bumpers — chrome skirt, cyan cap, brass button (materials card)
    for (const b of el.bumpers) {
      ctx.lineWidth = 0.002;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "#23262f";
      ctx.fill();
      ctx.strokeStyle = "#07080d";
      ctx.stroke();
      const capR = b.r * 0.76;
      const cap = ctx.createRadialGradient(
        b.x - capR * 0.35,
        b.y - capR * 0.35,
        capR * 0.15,
        b.x,
        b.y,
        capR,
      );
      cap.addColorStop(0, "#52e0e8");
      cap.addColorStop(0.6, "#2fc9d6");
      cap.addColorStop(1, "#147986");
      ctx.beginPath();
      ctx.arc(b.x, b.y, capR, 0, Math.PI * 2);
      ctx.fillStyle = cap;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "#f4d27a";
      ctx.fill();
      // always-powered lamp: faint idle glow; hit: bright additive burst
      this.drawGlow(b.x, b.y, b.r * 1.8, "82, 224, 232", 0.16 + 0.84 * b.flash);
      if (b.flash > 0.01) {
        this.drawGlow(b.x, b.y, b.r * 3.2, "255, 255, 255", 0.55 * b.flash);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1 + 0.2 * b.flash), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * b.flash})`;
        ctx.fill();
      }
    }
  }

  private drawDebug(snap: WorldSnapshot): void {
    const { ctx } = this;
    ctx.lineWidth = 0.0025;
    for (const shape of snap.debugShapes!) {
      ctx.strokeStyle = shape.sensor ? "#ff9f43" : "#3ddc84";
      ctx.beginPath();
      if (shape.type === "circle") {
        ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
      } else {
        shape.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        if (shape.closed) ctx.closePath();
      }
      ctx.stroke();
    }
    // ball velocity vector
    const b = snap.ball;
    ctx.strokeStyle = "#ff5555";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.vx * 0.15, b.y + b.vy * 0.15);
    ctx.stroke();
  }

  private drawHud(snap: WorldSnapshot, w: number, h: number, dpr: number): void {
    const { ctx } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = w / dpr;
    const ch = h / dpr;

    const now = performance.now();
    if (this.lastFrameAt) {
      this.frameTimes.push(now - this.lastFrameAt);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
    }
    this.lastFrameAt = now;
    const worst = this.frameTimes.length ? Math.max(...this.frameTimes) : 0;
    const slow = this.frameTimes.filter((d) => d > 20).length;

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#8790b3";
    const speed = Math.hypot(snap.ball.vx, snap.ball.vy);
    ctx.fillText(
      `${snap.fps.toFixed(0)} fps · worst ${worst.toFixed(0)}ms · ${slow} slow/2s   ball ${speed.toFixed(2)} m/s`,
      10,
      18,
    );
    ctx.fillText(
      "Enter — start · Z / Shift — flippers · hold Space — plunger · arrows — nudge · Esc — settings",
      10,
      ch - 12,
    );

    if (snap.dmd) {
      this.drawDmdPanel(snap.dmd);
    } else {
      // pre-DMD fallback: plain score text
      ctx.font = "16px ui-monospace, monospace";
      ctx.fillStyle = "#d7dce8";
      ctx.fillText(`SCORE ${snap.score.toLocaleString("en-US").replace(/,/g, " ")}`, 10, 42);
    }

    if (snap.plungerCharge > 0) {
      const bw = 120;
      const x = cw - bw - 16;
      const y = ch - 26;
      ctx.strokeStyle = "#7f8fc9";
      ctx.strokeRect(x, y, bw, 12);
      ctx.fillStyle = "#e0b64e";
      ctx.fillRect(x + 1, y + 1, (bw - 2) * snap.plungerCharge, 10);
    }
  }
}
