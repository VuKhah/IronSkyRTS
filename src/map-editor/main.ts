/**
 * BẢN VẼ ĐỊA HÌNH (map-editor.html, chỉ khi chạy dev): trang 2D để người dùng và Claude cùng phác địa hình trên đúng lưới
 * bản đồ, trước khi dựng thành MapDef. Dữ liệu là Docs/maps/<mã>/layout.json (qua /__layout/<mã>, vite.config.ts):
 * người dùng tô thì trang tự lưu; Claude sửa file thì trang tự nạp lại (hỏi file mỗi 2 giây khi không đang tô).
 *
 * layout.json: { w, h, cell: 2, rows: string[] }: mỗi hàng một chuỗi, mỗi ký tự một ô 2 m (hàng đầu là phía Bắc):
 *   "0" "1" "2" = tầng · "n" "e" "s" "w" = ô dốc, chữ là hướng đi LÊN · "r" = mỏm đá (trên tầng 0).
 * Chỉ vẽ lại khi có thay đổi, nên nhẹ máy (không như trang game 3D).
 */
import { colName, getMap, mapRuler } from "../sim/maps";

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
}

let grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill("0"));
let lastText = "";
let dirty = false;
let painting = false;
const undoStack: string[][][] = [];

// ------------------------------------------------------------------ công cụ
type Tool = "0" | "1" | "2" | "n" | "e" | "s" | "w" | "r";
const TOOLS: { id: Tool; label: string; color?: string }[] = [
  { id: "0", label: "Tầng 0", color: "#d6d0bd" },
  { id: "1", label: "Tầng 1", color: "#a99f86" },
  { id: "2", label: "Tầng 2", color: "#7d735d" },
  { id: "n", label: "Dốc ↑" },
  { id: "e", label: "Dốc →" },
  { id: "s", label: "Dốc ↓" },
  { id: "w", label: "Dốc ←" },
  { id: "r", label: "Đá", color: "#55504a" }
];
const BRUSHES = [
  { m: 2, label: "2 m" },
  { m: 10, label: "Ô ly 10 m" },
  { m: 30, label: "Ô lớn 30 m" }
];
let tool: Tool = "1";
let brush = 10;
const MIRROR: Record<string, string> = { n: "s", s: "n", e: "w", w: "e" };

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
buttons("tools", TOOLS.map((t) => ({ key: t.id, html: (t.color ? `<span class="sw" style="background:${t.color}"></span>` : "") + t.label })), () => tool, (k) => (tool = k as Tool));
buttons("brushes", BRUSHES.map((b) => ({ key: String(b.m), html: b.label })), () => String(brush), (k) => (brush = Number(k)));
const symBox = document.getElementById("sym") as HTMLInputElement;
const statusEl = document.getElementById("status")!;
const hoverEl = document.getElementById("hover")!;

// ------------------------------------------------------------------ vẽ
const cv = document.getElementById("cv") as HTMLCanvasElement;
const g = cv.getContext("2d")!;
const PAD = 26;
let K = 3; // điểm ảnh mỗi mét

function resize(): void {
  K = Math.max(1.5, Math.min(4, (window.innerWidth - 28 - PAD * 2) / map.w));
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

/** Tầng của ô (ô dốc: tầng chân dốc, đoán theo ô ngay sau chân dốc). */
function tierAt(c: number, r: number): number {
  const v = grid[r]?.[c];
  if (v === undefined) return 0;
  if (v === "0" || v === "r") return 0;
  if (v === "1" || v === "2") return Number(v);
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
  // mũi tên dốc: mỗi khối dốc (các ô liền nhau cùng hướng) một hàng mũi tên dài đúng từ chân tới đỉnh dốc,
  // lặp theo bề ngang mỗi ~14 m
  const seen = new Uint8Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = grid[r][c];
      if (!MIRROR[d] || seen[r * COLS + c]) continue;
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
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[nr * COLS + nc] || grid[nr][nc] !== d) continue;
          seen[nr * COLS + nc] = 1;
          q.push(nr * COLS + nc);
        }
      }
      const x0 = PAD + c0 * CELL * K, x1 = PAD + (c1 + 1) * CELL * K;
      const y0 = PAD + r0 * CELL * K, y1 = PAD + (r1 + 1) * CELL * K;
      const ns = d === "n" || d === "s";
      const len = ns ? y1 - y0 : x1 - x0; // chiều dài dốc theo hướng leo
      const wid = ns ? x1 - x0 : y1 - y0;
      const n = Math.max(1, Math.round(wid / (14 * K)));
      const head = Math.min(len * 0.45, 3 * K);
      g.strokeStyle = g.fillStyle = "#3b3122";
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
      grid[r][c] = tool;
      if (symBox.checked) grid[ROWS - 1 - r][COLS - 1 - c] = MIRROR[tool] ?? tool;
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

cv.addEventListener("pointerdown", (e) => {
  undoStack.push(grid.map((row) => row.slice()));
  if (undoStack.length > 50) undoStack.shift();
  painting = true;
  cv.setPointerCapture(e.pointerId);
  paintAt(...eventPos(e));
});
cv.addEventListener("pointermove", (e) => {
  const [x, z] = eventPos(e);
  hoverEl.textContent = cellLabel(x, z);
  if (painting) paintAt(x, z);
});
const endStroke = (): void => {
  if (!painting) return;
  painting = false;
  void save();
};
cv.addEventListener("pointerup", endStroke);
cv.addEventListener("pointercancel", endStroke);

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  grid = prev;
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
  const data: Layout = { w: map.w, h: map.h, cell: CELL, rows: grid.map((r) => r.join("")) };
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
  grid = data.rows.map((r) => r.split(""));
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
