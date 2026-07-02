import type { Camera } from "../core/Camera";
import { BALL_RADIUS, FLIPPER, flipperVerts } from "../table/geometry";
import type {
  EffectKind,
  Renderer,
  TableRenderData,
  WorldSnapshot,
} from "./Renderer";

/**
 * Canvas-2D placeholder renderer for Milestones 0–3. Reads a WorldSnapshot;
 * never touches the physics world (plan §2 decoupling rule). Real playfield
 * art arrives from Claude Design at milestone 3.5.
 */
export class Renderer2D implements Renderer {
  private ctx: CanvasRenderingContext2D;
  private table!: TableRenderData;
  private art?: HTMLImageElement;
  private artReady = false;
  private ballArt?: HTMLImageElement;
  private ballArtReady = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  init(table: TableRenderData): void {
    this.table = table;
    if (table.artUrl) {
      this.art = new Image();
      this.art.onload = () => (this.artReady = true);
      this.art.src = table.artUrl;
    }
    if (table.ballArtUrl) {
      this.ballArt = new Image();
      this.ballArt.onload = () => (this.ballArtReady = true);
      this.ballArt.src = table.ballArtUrl;
    }
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0c0d14";
    ctx.fillRect(0, 0, w, h);

    // world transform: metres → pixels, camera scroll, table centred
    const s = h / camera.viewH;
    const ox = (w - s * this.table.width) / 2;
    ctx.setTransform(s, 0, 0, s, ox, -camera.y * s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // playfield art (the SVG master, walls included) — flat fallback until loaded
    if (this.artReady) {
      ctx.drawImage(this.art!, 0, 0, this.table.width, this.table.height);
    } else {
      ctx.fillStyle = "#1b1e2c";
      ctx.fillRect(0, 0, this.table.width, this.table.height);
    }

    this.drawElements(snap);

    // flippers
    for (const f of snap.flippers) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.beginPath();
      flipperVerts(f.side).forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.closePath();
      ctx.fillStyle = "#e0b64e";
      ctx.fill();
      ctx.strokeStyle = "#9c7c2c";
      ctx.lineWidth = 0.003;
      ctx.stroke();
      // round base over the pivot, matching the physics fixture
      ctx.beginPath();
      ctx.arc(0, 0, FLIPPER.baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // ball — SVG chrome art, procedural gradient until it loads
    const b = snap.ball;
    if (this.ballArtReady) {
      ctx.drawImage(
        this.ballArt!,
        b.x - BALL_RADIUS,
        b.y - BALL_RADIUS,
        BALL_RADIUS * 2,
        BALL_RADIUS * 2,
      );
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

    if (snap.debugShapes) this.drawDebug(snap);

    this.drawHud(snap, w, h, dpr);
  }

  spawnEffect(_kind: EffectKind, _x: number, _y: number): void {
    // in-world juice lands in Milestone 5
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
        ctx.arc(r.x, r.y, 0.012, 0, Math.PI * 2);
        ctx.fillStyle = "#8c6bff";
        ctx.save();
        ctx.shadowColor = "#8c6bff";
        ctx.shadowBlur = 0.035 * r.lit;
        ctx.fill();
        ctx.restore();
      } else if (!this.artReady) {
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
    const thick = Math.max(0.003, 0.013 * Math.abs(Math.cos(sp.angle)));
    ctx.fillStyle = "#e0b64e";
    ctx.strokeStyle = "#07080d";
    ctx.lineWidth = 0.0015;
    ctx.beginPath();
    ctx.rect(sp.x - sp.halfW + 0.004, sp.y - thick / 2, sp.halfW * 2 - 0.008, thick);
    ctx.fill();
    ctx.stroke();

    // slingshots — brass triangles, flash whitens
    for (const s of el.slings) {
      ctx.beginPath();
      s.verts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = s.flash > 0.01 ? `rgba(244, 210, 122, ${0.55 + 0.45 * s.flash})` : "#9c7c2c";
      ctx.fill();
      ctx.lineWidth = 0.003;
      ctx.strokeStyle = "#07080d";
      ctx.stroke();
    }

    // drop targets — brass faces; dropped = dim outline
    for (const t of el.targets) {
      ctx.beginPath();
      ctx.rect(t.x - t.hw, t.y - t.hh, t.hw * 2, t.hh * 2);
      if (t.up) {
        ctx.fillStyle = "#e0b64e";
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
      if (b.flash > 0.01) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1 + 0.25 * b.flash), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * b.flash})`;
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

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#8790b3";
    const speed = Math.hypot(snap.ball.vx, snap.ball.vy);
    ctx.fillText(`${snap.fps.toFixed(0)} fps   ball ${speed.toFixed(2)} m/s`, 10, 18);
    ctx.fillText("Z / Shift — flippers · hold Space — plunger · R — reset ball", 10, ch - 12);

    // score (the DMD takes this over in M4)
    ctx.font = "16px ui-monospace, monospace";
    ctx.fillStyle = "#d7dce8";
    ctx.fillText(`SCORE ${snap.score.toLocaleString("en-US").replace(/,/g, " ")}`, 10, 42);
    if (snap.scoreLabelAge < 1.2) {
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = `rgba(255, 62, 154, ${Math.max(0, 1 - snap.scoreLabelAge / 1.2)})`;
      ctx.fillText(snap.scoreLabel, 10, 60);
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
