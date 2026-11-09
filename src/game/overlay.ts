/**
 * Lớp vẽ 2D phủ lên cảnh 3D: thanh máu, thanh dầu máy bay, vòng tiến độ chiếm mỏ,
 * khung quét chọn và đường tới điểm tập kết. Vẽ bằng canvas 2D cho nét và rẻ.
 */
import { BUILDINGS, canStrike, RULES, UNITS, type GroupCode, type Side } from "../sim/content";
import type { Unit } from "../sim/types";
import type { World } from "../sim/world";
import type { RtsCamera } from "./camera";
import { Views } from "./views";

const SIDE_COLOR = ["#3ea8ff", "#ff4d4d"];

/** Một ký hiệu trên bản đồ giấy: cả lô chung một ký hiệu, đặt ở trung bình vị trí các xe đang thấy. */
export interface StrategicMark {
  x: number;
  z: number;
  units: Unit[];
}

export function strategicMarks(world: World, viewer: Side | null, alpha: number): StrategicMark[] {
  const lots = new Map<number, Unit[]>();
  const marks: Unit[][] = [];
  for (const u of world.units) {
    if (viewer !== null && u.side !== viewer && !world.visibleTo(viewer, u)) continue;
    if (!u.lot) {
      marks.push([u]);
      continue;
    }
    let list = lots.get(u.lot);
    if (!list) {
      list = [];
      lots.set(u.lot, list);
      marks.push(list);
    }
    list.push(u);
  }
  return marks.map((units) => {
    let x = 0;
    let z = 0;
    for (const u of units) {
      const p = Views.displayPos(world.map, u, alpha);
      x += p[0] / units.length;
      z += p[2] / units.length;
    }
    return { x, z, units };
  });
}

/** Màu khung ký hiệu theo phe, nhạt như mực tô trên giấy. */
const MARK_FILL = ["#9fd0f2", "#f0a6a0"];
const MARK_INK = "#1f1810";

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  /** Chữ nổi bay lên rồi mờ dần (ví dụ "+45 Sắt" khi nhặt xác). */
  private floats: { x: number; y: number; z: number; text: string; color: string; t0: number }[] = [];
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Thêm chữ nổi tại điểm 3D (x, y, z). */
  float(x: number, y: number, z: number, text: string, color: string): void {
    this.floats.push({ x, y, z, text, color, t0: performance.now() });
  }

  private drawFloats(cam: RtsCamera, w: number, h: number): void {
    const g = this.ctx;
    const now = performance.now();
    this.floats = this.floats.filter((f) => now - f.t0 < 1400);
    g.font = "bold 13px 'Be Vietnam Pro', sans-serif";
    g.textAlign = "center";
    for (const f of this.floats) {
      const k = (now - f.t0) / 1400;
      const p = cam.project(f.x, f.y + k * 2.5, f.z, w, h);
      if (!p.visible) continue;
      g.globalAlpha = 1 - k * k;
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.75)";
      g.strokeText(f.text, p.x, p.y);
      g.fillStyle = f.color;
      g.fillText(f.text, p.x, p.y);
    }
    g.globalAlpha = 1;
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

  /** Hình vai trò bên trong khung, theo mã phân nhóm: nhìn là biết loại quân, quân mới cùng mã tự có hình. */
  private glyph(code: GroupCode, x: number, y: number): void {
    const g = this.ctx;
    g.strokeStyle = MARK_INK;
    g.fillStyle = MARK_INK;
    g.lineWidth = 1.6;
    g.beginPath();
    switch (code) {
      case "GIAP": // bầu dục xích: xe tăng
        g.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2);
        g.stroke();
        break;
      case "MUI": // gạch chéo: trinh sát, quấy rối
        g.moveTo(x - 12, y + 8);
        g.lineTo(x + 12, y - 8);
        g.stroke();
        break;
      case "HL": // tia gấp khúc: hỏa lực trực tiếp
        g.moveTo(x - 7, y - 5);
        g.lineTo(x + 2, y - 1);
        g.lineTo(x - 2, y + 1);
        g.lineTo(x + 7, y + 5);
        g.stroke();
        break;
      case "PK": // vòm: phòng không
        g.arc(x, y + 6, 9, Math.PI, 0);
        g.stroke();
        break;
      case "XA": // chấm: hỏa lực gián tiếp
        g.arc(x, y, 3.6, 0, Math.PI * 2);
        g.fill();
        break;
      case "DAN": // mũi tên lên: đạn đạo
        g.moveTo(x, y + 6);
        g.lineTo(x, y - 6);
        g.moveTo(x - 5, y - 1);
        g.lineTo(x, y - 6);
        g.lineTo(x + 5, y - 1);
        g.stroke();
        break;
      case "HC": // bánh xe: hậu cần
        g.moveTo(x - 8, y - 1);
        g.lineTo(x + 8, y - 1);
        g.stroke();
        g.beginPath();
        g.arc(x - 5, y + 3, 2.2, 0, Math.PI * 2);
        g.arc(x + 5, y + 3, 2.2, 0, Math.PI * 2);
        g.fill();
        break;
      case "TL": // cờ: chỉ huy
        g.moveTo(x - 4, y + 6);
        g.lineTo(x - 4, y - 6);
        g.lineTo(x + 6, y - 3);
        g.lineTo(x - 4, y);
        g.stroke();
        break;
      case "KQ": // cánh: máy bay
        g.moveTo(x - 9, y + 3);
        g.lineTo(x, y - 3);
        g.lineTo(x + 9, y + 3);
        g.stroke();
        break;
    }
  }

  /** Ký hiệu quân, công trình, mỏ trên bản đồ giấy. Giữ cỡ cố định trên màn hình dù kéo xa tới đâu. */
  private drawMarks(world: World, viewer: Side | null, cam: RtsCamera, alpha: number, selected: ReadonlySet<number>, w: number, h: number): void {
    const g = this.ctx;
    g.globalAlpha = cam.strategic;
    const off = (p: { x: number; y: number; visible: boolean }): boolean => !p.visible || p.x < -30 || p.y < -30 || p.x > w + 30 || p.y > h + 30;

    for (const m of world.mines) {
      const p = cam.project(m.x, 0, m.z, w, h);
      if (off(p)) continue;
      g.beginPath();
      g.arc(p.x, p.y, 7, 0, Math.PI * 2);
      g.fillStyle = m.owner === -1 ? "#efe6cc" : MARK_FILL[m.owner];
      g.fill();
      g.strokeStyle = MARK_INK;
      g.lineWidth = 1.3;
      g.stroke();
      g.fillStyle = MARK_INK;
      g.font = "bold 9px 'Be Vietnam Pro', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(m.res === "iron" ? "S" : "D", p.x, p.y + 0.5);
    }
    for (const up of world.uplinks) {
      const p = cam.project(up.x, 0, up.z, w, h);
      if (off(p)) continue;
      g.fillStyle = up.owner === -1 ? "#efe6cc" : MARK_FILL[up.owner];
      g.strokeStyle = MARK_INK;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(p.x, p.y - 8);
      g.lineTo(p.x + 8, p.y);
      g.lineTo(p.x, p.y + 8);
      g.lineTo(p.x - 8, p.y);
      g.closePath();
      g.fill();
      g.stroke();
    }
    for (const b of world.buildings) {
      if (viewer !== null && b.side !== viewer && !world.sides[viewer].known.has(b.id)) continue;
      const p = cam.project(b.x, 0, b.z, w, h);
      if (off(p)) continue;
      const hq = b.kind === "hq";
      const size = hq ? 10 : 5;
      g.fillStyle = MARK_FILL[b.side];
      g.strokeStyle = selected.has(b.id) ? "#fff3a8" : MARK_INK;
      g.lineWidth = selected.has(b.id) ? 3 : 1.5;
      g.fillRect(p.x - size, p.y - size, size * 2, size * 2);
      g.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
      if (hq) {
        g.fillStyle = MARK_INK;
        g.font = "bold 14px 'Be Vietnam Pro', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("★", p.x, p.y + 1);
      }
    }

    const W = 13;
    const H = 9;
    for (const m of strategicMarks(world, viewer, alpha)) {
      const u = m.units[0];
      const p = cam.project(m.x, 0, m.z, w, h);
      if (off(p)) continue;
      const sel = m.units.some((v) => selected.has(v.id));
      const spec = UNITS[u.kind];
      // xe hậu cần đi lại liên tục quanh căn cứ: chỉ là chấm nhỏ, chọn thì mới hiện đầy đủ, để bản đồ khỏi rối
      if (spec.group === "HC" && !sel) {
        g.fillStyle = MARK_FILL[u.side];
        g.strokeStyle = MARK_INK;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        continue;
      }
      // đường lệnh của lô đang chọn: thấy ngay nó đang đi đâu
      if (sel && u.side === viewer && u.order !== "idle") {
        const t = cam.project(u.tx, 0, u.tz, w, h);
        g.strokeStyle = "rgba(31, 24, 16, 0.75)";
        g.lineWidth = 1.5;
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(t.x, t.y);
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = MARK_FILL[u.side];
      g.strokeStyle = sel ? "#fff3a8" : MARK_INK;
      g.lineWidth = sel ? 3 : 1.6;
      g.beginPath();
      if (spec.domain === "air") {
        // khung vòm: máy bay
        g.moveTo(p.x - W, p.y + H);
        g.lineTo(p.x - W, p.y - 2);
        g.quadraticCurveTo(p.x, p.y - H * 2.2, p.x + W, p.y - 2);
        g.lineTo(p.x + W, p.y + H);
        g.closePath();
      } else g.rect(p.x - W, p.y - H, W * 2, H * 2);
      g.fill();
      g.stroke();
      this.glyph(spec.group, p.x, p.y);
      // số xe còn lại của lô, vạch máu trung bình
      let hp = 0;
      let max = 0;
      for (const v of m.units) {
        hp += v.hp;
        max += v.maxHp;
      }
      this.bar(p.x, p.y + H + 3, W * 2, hp / max, hp / max > 0.6 ? "#3f9a55" : hp / max > 0.3 ? "#d98a1f" : "#c9402f");
      if (m.units.length > 1) {
        g.fillStyle = MARK_INK;
        g.font = "bold 10px 'Be Vietnam Pro', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
        g.fillText(String(m.units.length), p.x, p.y - H - 3);
      }
    }
    g.globalAlpha = 1;
    g.textBaseline = "alphabetic";
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

    // kéo xa: thanh máu của từng xe nhường chỗ cho ký hiệu lô trên bản đồ giấy
    const far = cam.strategic >= 0.5;
    if (cam.strategic > 0) this.drawMarks(world, viewer, cam, alpha, selected, w, h);
    for (const u of far ? [] : world.units) {
      if (viewer !== null && u.side !== viewer && !world.visibleTo(viewer, u)) continue;
      const sel = selected.has(u.id);
      const spec = UNITS[u.kind];
      const isAir = u.air !== "none";
      const showFuel = isAir && spec.fuel && (viewer === null || u.side === viewer) && (sel || u.air !== "parked" || u.fuel < spec.fuel.tank * RULES.air.takeoffMin);
      // dàn phóng đang nạp đạn (của ta): vạch cam dưới thanh máu, đầy là bắn được loạt mới
      const reload = canStrike(u.kind) && (viewer === null || u.side === viewer) && u.cooldown > 0 && u.burst === 0;
      const bars = sel || u.hp < u.maxHp || showFuel || reload;
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
      if (reload) this.bar(p.x, p.y + 5, bw, 1 - u.cooldown / (spec.weapon!.cooldown * RULES.tickRate), "#ffb547");
      if (u.kind === "commander") {
        g.fillStyle = SIDE_COLOR[u.side];
        g.font = "bold 11px 'Be Vietnam Pro', sans-serif";
        g.textAlign = "center";
        g.fillText("★", p.x, p.y - 4);
      }
    }

    for (const b of far ? [] : world.buildings) {
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
    for (const m of far ? [] : world.mines) {
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

    // vòng tiến độ chiếm Đài Liên Lạc (khi đang giằng co / chiếm dở)
    for (const up of far ? [] : world.uplinks) {
      if (!(up.cap > 0 && up.cap < 1)) continue;
      const p = cam.project(up.x, world.map.groundY(up.x, up.z) + 8.5, up.z, w, h);
      if (!p.visible) continue;
      const side = up.owner !== -1 ? up.owner : up.capSide;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.arc(p.x, p.y, 13, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = side === -1 ? "#dddddd" : SIDE_COLOR[side];
      g.beginPath();
      g.arc(p.x, p.y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * up.cap);
      g.stroke();
      g.font = "bold 11px 'Be Vietnam Pro', sans-serif";
      g.textAlign = "center";
      g.fillStyle = "#ffe2b3";
      g.fillText("📡", p.x, p.y + 4);
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
    this.drawFloats(cam, w, h);
  }
}
