/**
 * BẢN VẼ ĐỊA HÌNH (map-editor.html, chỉ khi chạy dev): trang 2D để người dùng và Claude cùng phác địa hình trên đúng lưới
 * bản đồ, trước khi dựng thành MapDef. Dữ liệu là Docs/maps/<mã>/layout.json (qua /__layout/<mã>, vite.config.ts):
 * người dùng tô thì trang tự lưu; Claude sửa file thì trang tự nạp lại (hỏi file mỗi 2 giây khi không đang tô).
 *
 * layout.json: { w, h, cell: 2, rows: string[] }: mỗi hàng một chuỗi, mỗi ký tự một ô 2 m (hàng đầu là phía Bắc):
 *   "0" "1" "2" = tầng · "d" = ô dốc · "r" = mỏm đá (trên tầng 0). Hướng dốc không lưu: mỗi khối dốc (ô "d" liền nhau)
 *   tự lấy hướng đi LÊN về phía tầng cao hơn ở hai đầu (cùng cách khi dựng MapDef). Bản cũ "n/e/s/w" được đổi thành "d".
 * `refs`: mốc đối chiếu cỡ thật (không phải địa hình): Pháo Tự Hành, dãy 4 Titan, tầm nhìn Drone Trinh Sát, Xưởng Xe
 * Chuyên Dụng; `rot` = độ, 0 = mũi xe / cửa xưởng hướng Bắc, theo chiều kim đồng hồ. Bấm lại vào mốc để xoay 15° (xưởng 90°),
 * Shift: ngược lại.
 * Chỉ vẽ lại khi có thay đổi, nên nhẹ máy (không như trang game 3D).
 */
import { BUILDINGS, UNITS } from "../sim/content";
import { colName, getMap, mapRuler } from "../sim/maps";
import { cellTier, rampDirOf } from "./layout";

const ID = new URLSearchParams(location.search).get("map") ?? "standard";
const map = getMap(ID);
const ruler = mapRuler(map);
const CELL = 2;
const COLS = map.w / CELL;
const ROWS = map.h / CELL;

interface Layout {
  w: number;
  h: number;
  cell: number;
  rows: string[];
  /** Lớp mặt đất, cùng cỡ `rows`: "." cỏ · "f" rừng · "w" nước sâu · "s" nước nông · "m" đầm lầy · "o" đường đất. */
  surf?: string[];
  refs?: Ref[];
}

type RefKind = "art" | "titan" | "titan4" | "drone" | "sfac";
interface Ref {
  k: RefKind;
  x: number;
  z: number;
  rot: number;
}
let refs: Ref[] = [];
let rot = 0;

let grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill("0"));
let surf: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill("."));
let lastText = "";
let dirty = false;
let painting = false;
const undoStack: { g: string[][]; s: string[][]; refs: Ref[] }[] = [];

// ------------------------------------------------------------------ công cụ
/** Công cụ lớp mặt đất: "s" + ký tự lớp (ví dụ "sf" = rừng). */
type SurfTool = "s." | "sf" | "sw" | "ss" | "sm" | "so";
type Tool = "0" | "1" | "2" | "d" | "r" | RefKind | "delref" | SurfTool;
const TOOLS: { id: Tool; label: string; color?: string }[] = [
  { id: "0", label: "Tầng 0", color: "#d6d0bd" },
  { id: "1", label: "Tầng 1", color: "#a99f86" },
  { id: "2", label: "Tầng 2", color: "#7d735d" },
  { id: "d", label: "Dốc", color: "#c6b48a" },
  { id: "r", label: "Đá", color: "#55504a" }
];
/** Khối mặt đất chủ đề thảo nguyên đồi: mỗi khối là một loại địa hình game đã có luật (terrain.ts). */
const SURF_TOOLS: { id: SurfTool; label: string; color: string }[] = [
  { id: "sf", label: "Rừng", color: "#3f6b35" },
  { id: "sw", label: "Nước sâu", color: "#2c6fa8" },
  { id: "ss", label: "Nước nông", color: "#7fb6d8" },
  { id: "sm", label: "Đầm lầy", color: "#6b5536" },
  { id: "so", label: "Đường đất", color: "#b89a6a" },
  { id: "s.", label: "Cỏ (xóa lớp)", color: "#d6d0bd" }
];
const SURF_COLOR: Record<string, string> = { f: "rgba(52, 96, 44, 0.82)", w: "#2c6fa8", s: "#7fb6d8", m: "rgba(96, 74, 46, 0.85)", o: "rgba(184, 154, 106, 0.9)" };
const MARK_TOOLS: { id: Tool; label: string; color?: string }[] = [
  { id: "art", label: "Mốc: Pháo" },
  { id: "titan", label: "Mốc: 1 Titan" },
  { id: "titan4", label: "Mốc: 4 Titan" },
  { id: "drone", label: "Mốc: tầm Drone TS" },
  { id: "sfac", label: "Mốc: Xưởng Chuyên Dụng" },
  { id: "delref", label: "Xóa mốc" }
];
const BRUSHES = [
  { m: 2, label: "2 m" },
  { m: 10, label: "Ô ly 10 m" },
  { m: 30, label: "Ô lớn 30 m" }
];
let tool: Tool = "1";
let brush = 10;
const isRamp = (v: string | undefined): boolean => v === "d";

function buttons(host: string, items: { key: string; html: string }[], get: () => string, set: (k: string) => void): void {
  const el = document.getElementById(host)!;
  el.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.innerHTML = it.html;
    b.className = get() === it.key ? "on" : "";
    b.onclick = () => {
      set(it.key);
      buttons(host, items, get, set);
    };
    el.appendChild(b);
  }
}
// ba nhóm công cụ dùng chung một lựa chọn: bấm nhóm nào cũng vẽ lại cả ba để nút sáng đúng
const toolItems = (list: { id: Tool; label: string; color?: string }[]) =>
  list.map((t) => ({ key: t.id, html: (t.color ? `<span class="sw" style="background:${t.color}"></span>` : "") + t.label }));
function renderTools(): void {
  const set = (k: string): void => {
    tool = k as Tool;
    renderTools();
  };
  buttons("tools", toolItems(TOOLS), () => tool, set);
  buttons("surface", toolItems(SURF_TOOLS), () => tool, set);
  buttons("marks", toolItems(MARK_TOOLS), () => tool, set);
}
renderTools();
buttons("brushes", BRUSHES.map((b) => ({ key: String(b.m), html: b.label })), () => String(brush), (k) => (brush = Number(k)));
const symBox = document.getElementById("sym") as HTMLInputElement;
const statusEl = document.getElementById("status")!;
const hoverEl = document.getElementById("hover")!;

// ------------------------------------------------------------------ vẽ
const cv = document.getElementById("cv") as HTMLCanvasElement;
const g = cv.getContext("2d")!;
const PAD = 26;
let K = 3; // điểm ảnh mỗi mét

// phóng to: K = cỡ vừa khung × zoom; lăn chuột để phóng quanh con trỏ, giữ chuột phải (hoặc giữa) kéo để dời
const wrap = document.getElementById("wrap")!;
let zoom = 1;
const fitK = (): number => Math.max(1.5, Math.min(4, (wrap.clientWidth - PAD * 2) / map.w));

function setZoom(z: number, clientX?: number, clientY?: number): void {
  const rc = wrap.getBoundingClientRect();
  const px = clientX ?? rc.left + wrap.clientWidth / 2;
  const py = clientY ?? rc.top + wrap.clientHeight / 2;
  // điểm bản đồ (m) đang nằm dưới con trỏ, giữ nguyên chỗ đó trên màn hình sau khi phóng
  const mx = (wrap.scrollLeft + px - rc.left - PAD) / K;
  const mz = (wrap.scrollTop + py - rc.top - PAD) / K;
  // khung vẽ trình duyệt tối đa khoảng 16.000 điểm ảnh mỗi chiều
  const maxZoom = Math.min(10, 15000 / ((window.devicePixelRatio || 1) * (map.w * fitK() + PAD * 2)));
  zoom = Math.max(1, Math.min(maxZoom, z));
  resize();
  wrap.scrollLeft = PAD + mx * K - (px - rc.left);
  wrap.scrollTop = PAD + mz * K - (py - rc.top);
  document.getElementById("zoomPct")!.textContent = `${Math.round(zoom * 100)}%`;
}

function resize(): void {
  K = fitK() * zoom;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round((map.w * K + PAD * 2) * dpr);
  cv.height = Math.round((map.h * K + PAD * 2) * dpr);
  cv.style.width = `${map.w * K + PAD * 2}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
const X = (x: number): number => PAD + (x + map.halfW) * K;
const Y = (z: number): number => PAD + (z + map.halfH) * K;
const COLOR: Record<string, string> = { "0": "#d6d0bd", "1": "#a99f86", "2": "#7d735d", r: "#55504a" };

/** Tầng của ô (ô dốc: −1). Đọc bản vẽ dùng chung với trang 3D: layout.ts. */
const tierAt = (c: number, r: number): number => cellTier(grid, c, r);
const rampDir = (c0: number, r0: number, c1: number, r1: number) => rampDirOf(grid, c0, r0, c1, r1);

/** Cỡ thân xe (m) lấy thẳng từ content.ts: dài = 2 × halfLen, ngang ≈ 2 × radius. */
const ART = UNITS.artillery;
const TITAN = UNITS.titan;
const SCOUT = UNITS.scout;
/** Xưởng Xe Chuyên Dụng: thân 2 × half (m), nền móng thêm viền 1 ô (2 m) mỗi bên (content.ts). */
const SFAC = BUILDINGS["special-factory"];
/** Khoảng cách tâm hai Titan đứng cạnh nhau trong dãy (m): thân rộng ~3,8 m + khe 2 m. */
const TITAN_GAP = 6;

function drawRef(f: Ref): void {
  const a = (f.rot * Math.PI) / 180;
  g.save();
  g.translate(X(f.x), Y(f.z));
  if (f.k === "drone") {
    g.fillStyle = "rgba(60, 170, 255, 0.16)";
    g.strokeStyle = "rgba(30, 120, 220, 0.9)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, SCOUT.sight * K, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#1e78dc";
    g.beginPath();
    g.arc(0, 0, 3, 0, Math.PI * 2);
    g.fill();
    g.font = "11px system-ui, sans-serif";
    g.fillText(`Drone TS · tầm nhìn ${SCOUT.sight} m`, 0, -SCOUT.sight * K - 7);
    g.restore();
    return;
  }
  g.rotate(a);
  if (f.k === "sfac") {
    const [hx, hz] = SFAC.half;
    const fx = hx + CELL;
    const fz = hz + CELL;
    // nền móng (nét đứt), thân xưởng, cửa ra ở cạnh trước (phía Bắc khi rot = 0)
    g.setLineDash([5, 3]);
    g.strokeStyle = "#0b2a4a";
    g.lineWidth = 1;
    g.strokeRect(-fx * K, -fz * K, fx * 2 * K, fz * 2 * K);
    g.setLineDash([]);
    g.fillStyle = "rgba(46, 158, 255, 0.55)";
    g.fillRect(-hx * K, -hz * K, hx * 2 * K, hz * 2 * K);
    g.strokeRect(-hx * K, -hz * K, hx * 2 * K, hz * 2 * K);
    g.fillStyle = "#0b2a4a";
    g.fillRect(-hx * 0.45 * K, -hz * K - 1, hx * 0.9 * K, 1.2 * K);
    g.beginPath();
    g.moveTo(0, (-fz - 4) * K);
    g.lineTo(-2.2 * K, (-fz - 1) * K);
    g.lineTo(2.2 * K, (-fz - 1) * K);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = "#0b2a4a";
    g.font = "bold 11px system-ui, sans-serif";
    g.fillText("Xưởng Chuyên Dụng", X(f.x), Y(f.z) - 6);
    g.font = "11px system-ui, sans-serif";
    g.fillText(`${hx * 2}×${hz * 2} m · nền ${fx * 2}×${fz * 2} m`, X(f.x), Y(f.z) + 8);
    return;
  }
  const hull = (cx: number, len: number, wid: number): void => {
    g.fillStyle = "rgba(46, 158, 255, 0.85)";
    g.strokeStyle = "#0b2a4a";
    g.lineWidth = 1;
    g.fillRect((cx - wid / 2) * K, (-len / 2) * K, wid * K, len * K);
    g.strokeRect((cx - wid / 2) * K, (-len / 2) * K, wid * K, len * K);
    // mũi xe: tam giác trắng ở đầu phía trước (phía Bắc khi rot = 0)
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(cx * K, (-len / 2) * K + 1);
    g.lineTo((cx - wid * 0.3) * K, (-len / 2 + wid * 0.45) * K);
    g.lineTo((cx + wid * 0.3) * K, (-len / 2 + wid * 0.45) * K);
    g.closePath();
    g.fill();
  };
  if (f.k === "art") hull(0, (ART.halfLen ?? ART.radius) * 2, ART.radius * 2 * 0.9);
  else if (f.k === "titan") hull(0, (TITAN.halfLen ?? TITAN.radius) * 2, TITAN.radius * 2);
  else for (let i = 0; i < 4; i++) hull((i - 1.5) * TITAN_GAP, (TITAN.halfLen ?? TITAN.radius) * 2, TITAN.radius * 2);
  g.restore();
  g.fillStyle = "#0b2a4a";
  g.font = "bold 11px system-ui, sans-serif";
  g.fillText(f.k === "art" ? "Pháo Tự Hành" : f.k === "titan" ? "Titan" : "4 Titan", X(f.x), Y(f.z) + (f.k === "art" ? 7 : 6) * K + 8);
}

/** Mốc dưới điểm (x, z), nếu có (vùng bắt: bán kính theo cỡ mốc). */
function refAt(x: number, z: number): number {
  for (let i = refs.length - 1; i >= 0; i--) {
    const f = refs[i];
    const reach = f.k === "titan4" ? 13 : f.k === "sfac" ? 11 : 6;
    if ((x - f.x) ** 2 + (z - f.z) ** 2 < reach * reach) return i;
  }
  return -1;
}

function draw(): void {
  g.fillStyle = "#121a24";
  g.fillRect(0, 0, cv.width, cv.height);
  // ô: tầng / đá; ô dốc tô màu trung gian rồi kẻ sọc
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      g.fillStyle = COLOR[v] ?? "#c6b48a";
      g.fillRect(PAD + c * CELL * K, PAD + r * CELL * K, CELL * K + 0.5, CELL * K + 0.5);
      const sc = SURF_COLOR[surf[r][c]];
      if (sc) {
        g.fillStyle = sc;
        g.fillRect(PAD + c * CELL * K, PAD + r * CELL * K, CELL * K + 0.5, CELL * K + 0.5);
      }
    }
  // vách: cạnh chung hai ô khác tầng (không tính ô dốc)
  g.strokeStyle = "#2a251d";
  g.lineWidth = 1.4;
  g.beginPath();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const t = tierAt(c, r);
      if (t < 0) continue;
      if (c + 1 < COLS) {
        const u = tierAt(c + 1, r);
        if (u >= 0 && u !== t) {
          g.moveTo(PAD + (c + 1) * CELL * K, PAD + r * CELL * K);
          g.lineTo(PAD + (c + 1) * CELL * K, PAD + (r + 1) * CELL * K);
        }
      }
      if (r + 1 < ROWS) {
        const u = tierAt(c, r + 1);
        if (u >= 0 && u !== t) {
          g.moveTo(PAD + c * CELL * K, PAD + (r + 1) * CELL * K);
          g.lineTo(PAD + (c + 1) * CELL * K, PAD + (r + 1) * CELL * K);
        }
      }
    }
  g.stroke();
  // mũi tên dốc: mỗi khối dốc (các ô dốc liền nhau) một hàng mũi tên dài đúng từ chân tới đỉnh dốc, lặp theo bề ngang
  // mỗi ~14 m; hướng tự suy: phía nào tầng cao hơn là phía đỉnh. Hai đầu bằng tầng, hay chênh khác đúng 1 tầng: viền đỏ.
  const seen = new Uint8Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!isRamp(grid[r][c]) || seen[r * COLS + c]) continue;
      let c0 = c, c1 = c, r0 = r, r1 = r;
      const q = [r * COLS + c];
      seen[r * COLS + c] = 1;
      while (q.length) {
        const i = q.pop()!;
        const cc = i % COLS;
        const rr = (i - cc) / COLS;
        c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); r0 = Math.min(r0, rr); r1 = Math.max(r1, rr);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = cc + dc, nr = rr + dr;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[nr * COLS + nc] || !isRamp(grid[nr][nc])) continue;
          seen[nr * COLS + nc] = 1;
          q.push(nr * COLS + nc);
        }
      }
      const x0 = PAD + c0 * CELL * K, x1 = PAD + (c1 + 1) * CELL * K;
      const y0 = PAD + r0 * CELL * K, y1 = PAD + (r1 + 1) * CELL * K;
      const rd = rampDir(c0, r0, c1, r1);
      if (!rd || !rd.ok) {
        g.strokeStyle = "#e0402a";
        g.lineWidth = 2;
        g.strokeRect(x0, y0, x1 - x0, y1 - y0);
        if (!rd) continue;
      }
      const d = rd.dir;
      const ns = d === "n" || d === "s";
      const len = ns ? y1 - y0 : x1 - x0; // chiều dài dốc theo hướng leo
      const wid = ns ? x1 - x0 : y1 - y0;
      const n = Math.max(1, Math.round(wid / (14 * K)));
      const head = Math.min(len * 0.45, 3 * K);
      g.strokeStyle = g.fillStyle = rd.ok ? "#3b3122" : "#e0402a";
      g.lineWidth = 1.6;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const across = ns ? x0 + wid * t : y0 + wid * t;
        // chân → đỉnh, chừa một chút ở hai đầu
        const m = Math.min(1.5, len * 0.1);
        let ax: number, ay: number, bx: number, by: number;
        if (ns) {
          ax = bx = across;
          [ay, by] = d === "s" ? [y0 + m, y1 - m] : [y1 - m, y0 + m];
        } else {
          ay = by = across;
          [ax, bx] = d === "e" ? [x0 + m, x1 - m] : [x1 - m, x0 + m];
        }
        const ux = Math.sign(bx - ax), uy = Math.sign(by - ay);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx - ux * head * 0.6, by - uy * head * 0.6);
        g.stroke();
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx - ux * head - uy * head * 0.55, by - uy * head - ux * head * 0.55);
        g.lineTo(bx - ux * head + uy * head * 0.55, by - uy * head + ux * head * 0.55);
        g.closePath();
        g.fill();
      }
    }
  // lưới: ô ly, ô lớn + tên, đường vàng
  const vl = (x: number): void => {
    g.beginPath();
    g.moveTo(X(x), Y(-map.halfH));
    g.lineTo(X(x), Y(map.halfH));
    g.stroke();
  };
  const hl = (z: number): void => {
    g.beginPath();
    g.moveTo(X(-map.halfW), Y(z));
    g.lineTo(X(map.halfW), Y(z));
    g.stroke();
  };
  g.lineWidth = 0.5;
  g.strokeStyle = "rgba(0,0,0,0.13)";
  ruler.minorX.forEach(vl);
  ruler.minorZ.forEach(hl);
  g.lineWidth = 0.9;
  g.strokeStyle = "rgba(0,0,0,0.45)";
  ruler.colEdges.forEach(vl);
  ruler.rowEdges.forEach(hl);
  g.setLineDash([6, 4]);
  g.lineWidth = 1.2;
  g.strokeStyle = "#d99a1e";
  ruler.guideX.forEach(vl);
  ruler.guideZ.forEach(hl);
  g.setLineDash([]);
  g.fillStyle = "#e6edf2";
  g.font = "12px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  ruler.colEdges.slice(0, -1).forEach((x, i) => g.fillText(colName(i), X((x + ruler.colEdges[i + 1]) / 2), PAD / 2));
  ruler.rowEdges.slice(0, -1).forEach((z, i) => g.fillText(String(i + 1), PAD / 2, Y((z + ruler.rowEdges[i + 1]) / 2)));
  // mốc đối chiếu
  for (const f of refs) drawRef(f);
  // HQ
  map.bases.forEach(([x, z], i) => {
    g.fillStyle = i === 0 ? "#2e9eff" : "#f23d3d";
    g.fillRect(X(x) - 9, Y(z) - 9, 18, 18);
    g.strokeStyle = "#fff";
    g.lineWidth = 1.5;
    g.strokeRect(X(x) - 9, Y(z) - 9, 18, 18);
    g.fillStyle = "#fff";
    g.font = "bold 10px system-ui, sans-serif";
    g.fillText("HQ", X(x), Y(z) + 1);
  });
}

// ------------------------------------------------------------------ tô
/** Khoảng ô 2 m [c0, c1) × [r0, r1) mà cọ phủ khi trỏ vào (x, z). */
function brushRect(x: number, z: number): [number, number, number, number] | null {
  if (Math.abs(x) >= map.halfW || Math.abs(z) >= map.halfH) return null;
  if (brush === 2) {
    const c = Math.floor((x + map.halfW) / CELL);
    const r = Math.floor((z + map.halfH) / CELL);
    return [c, r, c + 1, r + 1];
  }
  const xs = brush === 30 ? ruler.colEdges : [-map.halfW, ...ruler.minorX, ...ruler.colEdges.slice(1, -1), map.halfW].sort((a, b) => a - b);
  const zs = brush === 30 ? ruler.rowEdges : [-map.halfH, ...ruler.minorZ, ...ruler.rowEdges.slice(1, -1), map.halfH].sort((a, b) => a - b);
  const pick = (e: number[], v: number): [number, number] => {
    let i = 0;
    while (i < e.length - 2 && v >= e[i + 1]) i++;
    return [e[i], e[i + 1]];
  };
  const [x0, x1] = pick(xs, x);
  const [z0, z1] = pick(zs, z);
  // ô 2 m có TÂM nằm trong khung
  const c0 = Math.round((x0 + map.halfW) / CELL);
  const c1 = Math.round((x1 + map.halfW) / CELL);
  const r0 = Math.round((z0 + map.halfH) / CELL);
  const r1 = Math.round((z1 + map.halfH) / CELL);
  return [c0, r0, Math.max(c0 + 1, c1), Math.max(r0 + 1, r1)];
}

function paintAt(x: number, z: number): void {
  const b = brushRect(x, z);
  if (!b) return;
  const [c0, r0, c1, r1] = b;
  for (let r = r0; r < r1; r++)
    for (let c = c0; c < c1; c++) {
      if (tool[0] === "s") {
        surf[r][c] = tool[1];
        if (symBox.checked) surf[ROWS - 1 - r][COLS - 1 - c] = tool[1];
        continue;
      }
      grid[r][c] = tool;
      if (symBox.checked) grid[ROWS - 1 - r][COLS - 1 - c] = tool;
    }
  dirty = true;
  draw();
}

function eventPos(e: PointerEvent): [number, number] {
  const rc = cv.getBoundingClientRect();
  const sx = ((e.clientX - rc.left) / rc.width) * (map.w * K + PAD * 2);
  const sy = ((e.clientY - rc.top) / rc.height) * (map.h * K + PAD * 2);
  return [(sx - PAD) / K - map.halfW, (sy - PAD) / K - map.halfH];
}

function cellLabel(x: number, z: number): string {
  if (Math.abs(x) >= map.halfW || Math.abs(z) >= map.halfH) return "";
  const idx = (e: number[], v: number): number => {
    let i = 0;
    while (i < e.length - 2 && v >= e[i + 1]) i++;
    return i;
  };
  return `${colName(idx(ruler.colEdges, x))}${idx(ruler.rowEdges, z) + 1} · x ${x.toFixed(0)} m, z ${z.toFixed(0)} m`;
}

document.getElementById("zoomIn")!.onclick = () => setZoom(zoom * 1.25);
document.getElementById("zoomOut")!.onclick = () => setZoom(zoom / 1.25);
document.getElementById("zoomFit")!.onclick = () => setZoom(1);
wrap.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  },
  { passive: false }
);
let pan: { x: number; y: number; sl: number; st: number } | null = null;
cv.addEventListener("contextmenu", (e) => e.preventDefault());

cv.addEventListener("pointerdown", (e) => {
  if (e.button === 1 || e.button === 2) {
    pan = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop };
    cv.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  undoStack.push({ g: grid.map((row) => row.slice()), s: surf.map((row) => row.slice()), refs: refs.map((f) => ({ ...f })) });
  if (undoStack.length > 50) undoStack.shift();
  if (MARK_TOOLS.some((m) => m.id === tool)) {
    // mốc: bấm chỗ trống = đặt; bấm vào mốc = xoay 15° (Shift: ngược lại); công cụ Xóa mốc = xóa
    const [x, z] = eventPos(e);
    const i = refAt(x, z);
    if (tool === "delref") {
      if (i >= 0) refs.splice(i, 1);
    } else if (i >= 0) {
      const step = refs[i].k === "sfac" ? 90 : 15; // nhà trong game xoay theo bội 90°
      refs[i].rot = (refs[i].rot + (e.shiftKey ? -step : step) + 360) % 360;
      rot = refs[i].rot;
    } else if (Math.abs(x) < map.halfW && Math.abs(z) < map.halfH) refs.push({ k: tool as RefKind, x: Math.round(x), z: Math.round(z), rot });
    draw();
    void save();
    return;
  }
  painting = true;
  cv.setPointerCapture(e.pointerId);
  paintAt(...eventPos(e));
});
cv.addEventListener("pointermove", (e) => {
  if (pan) {
    wrap.scrollLeft = pan.sl - (e.clientX - pan.x);
    wrap.scrollTop = pan.st - (e.clientY - pan.y);
    return;
  }
  const [x, z] = eventPos(e);
  hoverEl.textContent = cellLabel(x, z);
  if (painting) paintAt(x, z);
});
const endStroke = (): void => {
  pan = null;
  if (!painting) return;
  painting = false;
  void save();
};
cv.addEventListener("pointerup", endStroke);
cv.addEventListener("pointercancel", endStroke);

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  grid = prev.g;
  surf = prev.s;
  refs = prev.refs;
  dirty = true;
  draw();
  void save();
}
document.getElementById("undo")!.onclick = undo;
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }
});

// ------------------------------------------------------------------ lưu / nạp
function serialize(): string {
  const data: Layout = { w: map.w, h: map.h, cell: CELL, refs, rows: grid.map((r) => r.join("")), surf: surf.map((r) => r.join("")) };
  return JSON.stringify(data, null, 0).replace(/","/g, '",\n"').replace('"rows":["', '"rows":[\n"');
}

async function save(): Promise<void> {
  const text = serialize();
  statusEl.textContent = "Đang lưu…";
  await fetch(`/__layout/${ID}`, { method: "PUT", body: text });
  lastText = text;
  dirty = false;
  statusEl.textContent = `Đã lưu Docs/maps/${ID}/layout.json`;
}

function apply(text: string): void {
  const data = JSON.parse(text) as Layout;
  if (data.rows.length !== ROWS || data.rows[0].length !== COLS) throw new Error("layout.json không khớp kích thước bản đồ");
  grid = data.rows.map((r) => r.split("").map((v) => ("nesw".includes(v) ? "d" : v)));
  refs = data.refs ?? [];
  surf = data.surf?.length === ROWS ? data.surf.map((r) => r.split("")) : Array.from({ length: ROWS }, () => Array(COLS).fill("."));
  lastText = text;
  draw();
}

async function poll(): Promise<void> {
  if (painting || dirty) return;
  const res = await fetch(`/__layout/${ID}`, { cache: "no-store" });
  if (!res.ok) return;
  const text = await res.text();
  if (text !== lastText) {
    apply(text);
    statusEl.textContent = "Đã nạp bản mới từ file";
  }
}

async function init(): Promise<void> {
  const res = await fetch(`/__layout/${ID}`, { cache: "no-store" });
  if (res.ok) apply(await res.text());
  else await save(); // chưa có file: tạo bản trống
  statusEl.textContent = `Docs/maps/${ID}/layout.json`;
  resize();
  window.setInterval(() => void poll(), 2000);
}
window.addEventListener("resize", resize);
void init();
