/**
 * Lớp vẽ 2D phủ lên cảnh 3D: thanh máu, thanh dầu máy bay, vòng tiến độ chiếm mỏ,
 * khung quét chọn và đường tới điểm tập kết. Vẽ bằng canvas 2D cho nét và rẻ.
 */
import { BUILDINGS, RULES, UNITS, type Side } from "../sim/content";
import type { World } from "../sim/world";
import type { RtsCamera } from "./camera";
import { Views } from "./views";

const SIDE_COLOR = ["#3ea8ff", "#ff4d4d"];

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Quân hàm cựu binh: `n` vạch chữ V vàng xếp chồng, đáy ở (x, y). */
  private chevrons(x: number, y: number, n: number): void {
    const g = this.ctx;
    g.lineWidth = 2;
    g.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      const yy = y - i * 4.6;
      g.beginPath();
      g.moveTo(x - 6.5, yy - 4);
      g.lineTo(x, yy);
      g.lineTo(x + 6.5, yy - 4);
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.lineWidth = 3.6;
      g.stroke();
      g.strokeStyle = "#ffd34d";
      g.lineWidth = 2;
      g.stroke();
    }
  }

  private bar(x: number, y: number, w: number, k: number, color: string): void {
    const g = this.ctx;
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), 3);
  }

  draw(
    world: World,
    viewer: Side | null,
    cam: RtsCamera,
    alpha: number,
    selected: ReadonlySet<number>,
    box: { x0: number; y0: number; x1: number; y1: number } | null,
    w: number,
    h: number
  ): void {
    const g = this.ctx;
    g.clearRect(0, 0, w, h);
    const hpColor = (k: number): string => (k > 0.6 ? "#6fdc8c" : k > 0.3 ? "#ffb547" : "#ff6b5e");

    for (const u of world.units) {
      if (viewer !== null && u.side !== viewer && !world.visibleTo(viewer, u)) continue;
      const sel = selected.has(u.id);
      const spec = UNITS[u.kind];
      const isAir = u.air !== "none";
      const showFuel = isAir && spec.fuel && (viewer === null || u.side === viewer) && (sel || u.air !== "parked" || u.fuel < spec.fuel.tank * RULES.air.takeoffMin);
      const bars = sel || u.hp < u.maxHp || showFuel;
      if (!bars && u.rank === 0) continue;
      const [x, y, z] = Views.displayPos(world.map, u, alpha);
      const p = cam.project(x, y + (isAir ? 2.2 : 3.4), z, w, h);
      if (!p.visible || p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      if (u.rank > 0) this.chevrons(p.x, p.y - (bars ? 4 : -2), u.rank);
      if (!bars) continue;
      const bw = Math.max(18, spec.radius * 14);
      const k = u.hp / u.maxHp;
      this.bar(p.x, p.y, bw, k, hpColor(k));
      if (showFuel && spec.fuel) {
        const f = u.fuel / spec.fuel.tank;
        this.bar(p.x, p.y + 5, bw, f, f <= RULES.air.bingo ? "#ff6b5e" : "#d17af2");
      }
      if (u.kind === "commander") {
        g.fillStyle = SIDE_COLOR[u.side];
        g.font = "bold 11px 'Be Vietnam Pro', sans-serif";
        g.textAlign = "center";
        g.fillText("★", p.x, p.y - 4);
      }
    }

    for (const b of world.buildings) {
      if (viewer !== null && b.side !== viewer && !world.sides[viewer].known.has(b.id)) continue;
      const sel = selected.has(b.id);
      const spec = BUILDINGS[b.kind];
      // công trình của ta đang thiếu điện / nhà máy không phát: nhấp nháy tia sét
      const unpowered = b.side === viewer && b.built && spec.power < 0 && b.powerFrac < 1;
      if (unpowered && Math.floor(performance.now() / 500) % 2 === 0) {
        const q = cam.project(b.x, world.map.groundY(b.x, b.z) + 4, b.z, w, h);
        if (q.visible) {
          g.font = "bold 18px 'Be Vietnam Pro', sans-serif";
          g.textAlign = "center";
          g.fillStyle = "#ffd36e";
          g.strokeStyle = "rgba(0,0,0,0.7)";
          g.lineWidth = 3;
          g.strokeText("⚡", q.x, q.y);
          g.fillText("⚡", q.x, q.y);
        }
      }
      if (!sel && b.hp >= b.maxHp && b.built) continue;
      const p = cam.project(b.x, world.map.groundY(b.x, b.z) + (b.kind === "airfield" ? 5 : 6), b.z, w, h);
      if (!p.visible) continue;
      const bw = Math.max(30, Math.max(spec.half[0], spec.half[1]) * 10);
      const k = b.hp / b.maxHp;
      this.bar(p.x, p.y, bw, k, hpColor(k));
      if (!b.built) this.bar(p.x, p.y + 5, bw, b.progress, "#ffb547");
      if (sel && b.side === viewer && spec.produces && b.rallySet) {
        const r = cam.project(b.rallyX, world.map.groundY(b.rallyX, b.rallyZ) + 0.3, b.rallyZ, w, h);
        const o = cam.project(b.x, world.map.groundY(b.x, b.z) + 0.5, b.z, w, h);
        if (r.visible && o.visible) {
          g.strokeStyle = "rgba(255, 211, 110, 0.8)";
          g.setLineDash([5, 5]);
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(o.x, o.y);
          g.lineTo(r.x, r.y);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = "#ffd36e";
          g.fillRect(r.x - 1, r.y - 14, 2, 14);
          g.fillRect(r.x + 1, r.y - 14, 8, 6);
        }
      }
    }

    // vòng tiến độ chiếm mỏ
    for (const m of world.mines) {
      const contested = m.cap > 0 && m.cap < 1;
      if (!contested && !selected.has(m.id)) continue;
      const p = cam.project(m.x, world.map.groundY(m.x, m.z) + 5, m.z, w, h);
      if (!p.visible) continue;
      const side = m.owner !== -1 ? m.owner : m.capSide;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.arc(p.x, p.y, 12, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = side === -1 ? "#dddddd" : SIDE_COLOR[side];
      g.beginPath();
      g.arc(p.x, p.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.cap);
      g.stroke();
      g.fillStyle = m.res === "iron" ? "#8fc7f5" : "#d17af2";
      g.font = "bold 10px 'Be Vietnam Pro', sans-serif";
      g.textAlign = "center";
      g.fillText(m.res === "iron" ? "S" : "D", p.x, p.y + 3.5);
    }

    if (box) {
      g.strokeStyle = "#6fdc8c";
      g.lineWidth = 1.5;
      g.fillStyle = "rgba(111, 220, 140, 0.12)";
      const x = Math.min(box.x0, box.x1);
      const y = Math.min(box.y0, box.y1);
      g.fillRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
      g.strokeRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
    }
  }
}
