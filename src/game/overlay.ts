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

/** Một xe trên bàn tác chiến, ở vị trí đã giãn ra cho dễ thấy (`x`, `z`). */
export interface StrategicMark {
  x: number;
  z: number;
  unit: Unit;
  /** Tâm của cụm quân chứa xe này. */
  cx: number;
  cz: number;
  cluster: number;
}

/** Hai xe cách nhau dưới chừng này (m) coi như cùng một cụm. */
const CLUSTER_LINK = { ground: 16, air: 32 };
/** Mong muốn hai ký hiệu cạnh nhau cách nhau chừng này điểm ảnh. */
const MARK_SPACING_PX = 21;
/** Giãn đội hình tối đa chừng này lần: đủ thấy từng xe mà không nhảy khỏi vị trí thật quá xa. */
const MARK_SPREAD_MAX = 9;

/**
 * Mỗi xe một ký hiệu. Ở tầm xa vài mét chỉ còn một điểm ảnh, nên từng cụm quân được giãn đều quanh tâm của nó, giữ nguyên
 * hình đội hình (người dùng 09/11/2026: phải thấy sự hoành tráng của đội quân, không dồn cục). Chỉ giãn lúc vẽ, luật chơi không đổi.
 */
export function strategicMarks(world: World, viewer: Side | null, alpha: number, ppm: number): StrategicMark[] {
  const units = world.units.filter((u) => viewer === null || u.side === viewer || world.visibleTo(viewer, u));
  const pos = units.map((u) => Views.displayPos(world.map, u, alpha));
  const parent = units.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = units.map(() => Infinity);
  const isAir = (u: Unit): boolean => u.air !== "none";
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) {
      if (units[i].side !== units[j].side || isAir(units[i]) !== isAir(units[j])) continue;
      const d = Math.hypot(pos[i][0] - pos[j][0], pos[i][2] - pos[j][2]);
      near[i] = Math.min(near[i], d);
      near[j] = Math.min(near[j], d);
      if (d < (isAir(units[i]) ? CLUSTER_LINK.air : CLUSTER_LINK.ground)) parent[find(i)] = find(j);
    }
  const groups = new Map<number, number[]>();
  units.forEach((_, i) => {
    const r = find(i);
    const list = groups.get(r);
    if (list) list.push(i);
    else groups.set(r, [i]);
  });
  const out: StrategicMark[] = [];
  for (const [cluster, list] of groups) {
    let cx = 0;
    let cz = 0;
    let gap = 0;
    for (const i of list) {
      cx += pos[i][0] / list.length;
      cz += pos[i][2] / list.length;
      gap += Math.min(near[i], 40) / list.length;
    }
    const k = list.length > 1 ? Math.max(1, Math.min(MARK_SPREAD_MAX, MARK_SPACING_PX / (Math.max(0.5, gap) * ppm))) : 1;
    for (const i of list) out.push({ x: cx + (pos[i][0] - cx) * k, z: cz + (pos[i][2] - cz) * k, unit: units[i], cx, cz, cluster });
  }
  return out;
}

/** Màu ký hiệu theo phe trên màn hình tối. */
const MARK_NEON = ["#54c6ff", "#ff6a5f"];
const MARK_BODY = "rgba(6, 16, 28, 0.86)";
const MARK_NEUTRAL = "#a9bccd";

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
  private glyph(code: GroupCode, x: number, y: number, color: string): void {
    const g = this.ctx;
    g.strokeStyle = color;
    g.fillStyle = color;
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

  /** Ký hiệu quân, công trình, mỏ trên bàn tác chiến. Giữ cỡ cố định trên màn hình dù kéo xa tới đâu. */
  private drawMarks(world: World, viewer: Side | null, cam: RtsCamera, alpha: number, selected: ReadonlySet<number>, w: number, h: number): void {
    const g = this.ctx;
    g.globalAlpha = cam.strategic;
    const off = (p: { x: number; y: number; visible: boolean }): boolean => !p.visible || p.x < -30 || p.y < -30 || p.x > w + 30 || p.y > h + 30;
    const ownerColor = (o: number): string => (o === -1 ? MARK_NEUTRAL : MARK_NEON[o]);

    for (const m of world.mines) {
      const p = cam.project(m.x, 0, m.z, w, h);
      if (off(p)) continue;
      g.beginPath();
      g.arc(p.x, p.y, 7, 0, Math.PI * 2);
      g.fillStyle = MARK_BODY;
      g.fill();
      g.strokeStyle = ownerColor(m.owner);
      g.lineWidth = 1.4;
      g.stroke();
      g.fillStyle = ownerColor(m.owner);
      g.font = "bold 9px Consolas, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(m.res === "iron" ? "S" : "D", p.x, p.y + 0.5);
    }
    for (const up of world.uplinks) {
      const p = cam.project(up.x, 0, up.z, w, h);
      if (off(p)) continue;
      g.fillStyle = MARK_BODY;
      g.strokeStyle = ownerColor(up.owner);
      g.lineWidth = 1.4;
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
      const sel = selected.has(b.id);
      g.fillStyle = MARK_BODY;
      g.strokeStyle = sel ? "#ffffff" : MARK_NEON[b.side];
      g.lineWidth = sel ? 2.4 : 1.4;
      g.fillRect(p.x - size, p.y - size, size * 2, size * 2);
      g.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
      if (hq) {
        g.fillStyle = MARK_NEON[b.side];
        g.font = "bold 14px 'Be Vietnam Pro', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("★", p.x, p.y + 1);
      }
    }

    const marks = strategicMarks(world, viewer, alpha, cam.ppm());
    // đường lệnh của cụm đang chọn: mỗi cụm một đường từ tâm, thấy ngay nó đang đi đâu
    const lined = new Set<number>();
    for (const m of marks) {
      const u = m.unit;
      if (lined.has(m.cluster) || !selected.has(u.id) || u.side !== viewer || u.order === "idle") continue;
      lined.add(m.cluster);
      const a = cam.project(m.cx, 0, m.cz, w, h);
      const t = cam.project(u.tx, 0, u.tz, w, h);
      g.strokeStyle = "rgba(255, 255, 255, 0.6)";
      g.lineWidth = 1.4;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(t.x, t.y);
      g.stroke();
      g.setLineDash([]);
    }

    const W = 8;
    const H = 5.5;
    for (const m of marks) {
      const u = m.unit;
      const p = cam.project(m.x, 0, m.z, w, h);
      if (off(p)) continue;
      const sel = selected.has(u.id);
      const spec = UNITS[u.kind];
      const color = MARK_NEON[u.side];
      // xe hậu cần đi lại liên tục quanh căn cứ: chỉ là chấm nhỏ, chọn thì mới hiện đầy đủ, để bàn tác chiến khỏi rối
      if (spec.group === "HC" && !sel) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.fillStyle = MARK_BODY;
      g.strokeStyle = sel ? "#ffffff" : color;
      g.lineWidth = sel ? 2.2 : 1.3;
      g.beginPath();
      if (spec.domain === "air") {
        // khung vòm: máy bay
        g.moveTo(p.x - W, p.y + H);
        g.lineTo(p.x - W, p.y - 1);
        g.quadraticCurveTo(p.x, p.y - H * 2.2, p.x + W, p.y - 1);
        g.lineTo(p.x + W, p.y + H);
        g.closePath();
      } else g.rect(p.x - W, p.y - H, W * 2, H * 2);
      g.fill();
      g.stroke();
      g.save();
      g.translate(p.x, p.y);
      g.scale(0.58, 0.58);
      this.glyph(spec.group, 0, 0, sel ? "#ffffff" : color);
      g.restore();
      // chỉ xe bị thương mới có vạch máu, bàn tác chiến đỡ rối
      if (u.hp < u.maxHp) this.bar(p.x, p.y + H + 2, W * 2, u.hp / u.maxHp, u.hp / u.maxHp > 0.6 ? "#6fdc8c" : u.hp / u.maxHp > 0.3 ? "#ffb547" : "#ff6b5e");
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

    // kéo xa: thanh máu của từng xe nhường chỗ cho ký hiệu trên bàn tác chiến
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
      // drone hỗ trợ (của ta): vạch xanh năng lượng, hiện khi chọn hoặc khi đã hao
      const E = spec.energy;
      const showEnergy = !!E && (viewer === null || u.side === viewer) && (sel || u.fuel < E.max);
      const bars = sel || u.hp < u.maxHp || showFuel || reload || showEnergy;
      if (!bars && u.rank === 0) continue;
      const [x, y, z] = Views.displayPos(world.map, u, alpha);
      const p = cam.project(x, y + (spec.barHeight ?? (isAir ? 2.2 : 3.4)), z, w, h);
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
      if (showEnergy && E) {
        const f = u.fuel / E.max;
        this.bar(p.x, p.y + 5, bw, f, f < E.low ? "#ff6b5e" : "#5fd3ff");
      }
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
