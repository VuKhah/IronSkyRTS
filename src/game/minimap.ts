/**
 * Bản đồ nhỏ: xoay theo camera (phía trên minimap = hướng camera đang nhìn).
 * Chạm / nhấp để đưa camera tới đó; chuột phải để ra lệnh di chuyển cho quân đang chọn.
 */
import { BUILDINGS, type Side } from "../sim/content";
import type { GameMap } from "../sim/maps";
import type { World } from "../sim/world";

const SIDE_COLOR = ["#3ea8ff", "#ff4d4d"];
const RES_COLOR = { iron: "#8fc7f5", oil: "#d17af2" };

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogImg: ImageData;
  private yaw = 0;
  private dragging = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private map: GameMap,
    private onJump: (x: number, z: number) => void,
    private onCommand: (x: number, z: number) => void
  ) {
    this.ctx = canvas.getContext("2d")!;
    // ảnh nền: 1 điểm ảnh = 1 m
    const W = Math.round(map.w);
    const H = Math.round(map.h);
    this.bg = document.createElement("canvas");
    this.bg.width = W;
    this.bg.height = H;
    const b = this.bg.getContext("2d")!;
    const img = b.createImageData(W, H);
    for (let pz = 0; pz < H; pz++)
      for (let px = 0; px < W; px++) {
        const x = px - map.halfW + 0.5;
        const z = pz - map.halfH + 0.5;
        const h = map.terrainHeight(x, z);
        let c = [78, 104, 52];
        if (h > 1.5) c = [104, 120, 70];
        const river = map.nearRiver(x, z);
        if (river && river.dist < river.river.half + 1 && h < 0) c = h < -1 ? [44, 98, 140] : [140, 128, 100];
        if (map.inset(x, z) < 5 || h > 3.8) c = [70, 66, 60];
        const i = (pz * W + px) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = 255;
      }
    b.putImageData(img, 0, 0);
    this.fog = document.createElement("canvas");
    this.fog.width = map.cols;
    this.fog.height = map.rows;
    this.fogImg = this.fog.getContext("2d")!.createImageData(map.cols, map.rows);

    canvas.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      canvas.setPointerCapture(e.pointerId);
      const p = this.toWorld(e);
      if (e.button === 2) this.onCommand(p[0], p[1]);
      else {
        this.dragging = true;
        this.onJump(p[0], p[1]);
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const p = this.toWorld(e);
      this.onJump(p[0], p[1]);
    });
    canvas.addEventListener("pointerup", () => (this.dragging = false));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private scale(): number {
    // minimap xoay theo camera: đường chéo bản đồ phải lọt khung
    return this.canvas.width / (Math.hypot(this.map.w, this.map.h) * 1.004);
  }

  private toWorld(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / r.width;
    const cx = (e.clientX - r.left) * k - this.canvas.width / 2;
    const cy = (e.clientY - r.top) * k - this.canvas.height / 2;
    const s = this.scale();
    const c = Math.cos(-this.yaw);
    const sn = Math.sin(-this.yaw);
    return [(cx * c - cy * sn) / s, (cx * sn + cy * c) / s];
  }

  draw(world: World, viewer: Side | null, yaw: number, view: [number, number][]): void {
    const cv = this.canvas;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr);
    if (cv.width !== W) cv.width = cv.height = W;
    this.yaw = yaw;
    const g = this.ctx;
    const s = this.scale();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0d131c";
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(yaw);
    g.imageSmoothingEnabled = true;
    const m = this.map;
    g.drawImage(this.bg, -m.halfW * s, -m.halfH * s, m.w * s, m.h * s);
    if (viewer !== null) {
      const st = world.sides[viewer];
      const d = this.fogImg.data;
      for (let i = 0; i < st.vis.length; i++) {
        d[i * 4 + 3] = st.vis[i] ? 0 : st.explored[i] ? 110 : 215;
      }
      this.fog.getContext("2d")!.putImageData(this.fogImg, 0, 0);
      g.drawImage(this.fog, -m.halfW * s, -m.halfH * s, m.w * s, m.h * s);
    }
    for (const m of world.mines) {
      g.fillStyle = RES_COLOR[m.res];
      g.strokeStyle = m.owner === -1 ? "#dddddd" : SIDE_COLOR[m.owner];
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(m.x * s, m.z * s, 3.2 * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const b of world.buildings) {
      if (viewer !== null && b.side !== viewer && !world.sides[viewer].known.has(b.id)) continue;
      const [hw, hd] = BUILDINGS[b.kind].half;
      g.fillStyle = SIDE_COLOR[b.side];
      g.fillRect((b.x - hw) * s, (b.z - hd) * s, Math.max(3, hw * 2 * s), Math.max(3, hd * 2 * s));
    }
    for (const u of world.units) {
      if (viewer !== null && u.side !== viewer && !world.visibleTo(viewer, u)) continue;
      g.fillStyle = SIDE_COLOR[u.side];
      const rr = (u.air !== "none" ? 1.6 : u.kind === "commander" ? 2.4 : 1.4) * dpr;
      g.fillRect(u.x * s - rr, u.z * s - rr, rr * 2, rr * 2);
      if (u.kind === "commander") {
        g.strokeStyle = "#fff";
        g.lineWidth = dpr;
        g.strokeRect(u.x * s - rr, u.z * s - rr, rr * 2, rr * 2);
      }
    }
    if (view.length === 4) {
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      view.forEach(([x, z], i) => (i ? g.lineTo(x * s, z * s) : g.moveTo(x * s, z * s)));
      g.closePath();
      g.stroke();
    }
  }
}
