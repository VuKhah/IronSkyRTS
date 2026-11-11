/**
 * SA BÀN 3D (map-3d.html?map=<mã>&area=C2:E5, chỉ khi chạy dev): dựng một vùng của BẢN VẼ địa hình (layout.json) thành
 * khối 3D để người dùng quan sát độ cao, dốc, vách trước khi dựng MapDef. Tầng cao TIER_H mỗi bậc (như game), dốc nghiêng
 * thật theo hướng tự suy (layout.ts), mặt cắt quanh vùng như sa bàn. Chỉ vẽ khi xoay / phóng hoặc khi bản vẽ đổi.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { UNITS } from "../sim/content";
import { colName, getMap, mapRuler, TIER_H } from "../sim/maps";
import { cellTier, rampBlocks, type RampBlock } from "./layout";

const q = new URLSearchParams(location.search);
const ID = q.get("map") ?? "standard";
const AREA = (q.get("area") ?? "C2:E5").toUpperCase();
const map = getMap(ID);
const ruler = mapRuler(map);
const CELL = 2;
const BASE = -3; // đáy sa bàn (m)

// ------------------------------------------------------------------ vùng xem
function parseArea(a: string): { c0: number; r0: number; c1: number; r1: number; x0: number; x1: number; z0: number; z1: number } {
  const m = /^([A-Z])(\d+):([A-Z])(\d+)$/.exec(a);
  if (!m) throw new Error(`area phải dạng C2:E5, nhận "${a}"`);
  const ci = (s: string): number => s.charCodeAt(0) - 65;
  const [ca, cb] = [ci(m[1]), ci(m[3])].sort((p, q2) => p - q2);
  const [ra, rb] = [Number(m[2]) - 1, Number(m[4]) - 1].sort((p, q2) => p - q2);
  const x0 = ruler.colEdges[ca];
  const x1 = ruler.colEdges[cb + 1];
  const z0 = ruler.rowEdges[ra];
  const z1 = ruler.rowEdges[rb + 1];
  const cell = (v: number, half: number): number => Math.round((v + half) / CELL);
  return { c0: cell(x0, map.halfW), c1: cell(x1, map.halfW), r0: cell(z0, map.halfH), r1: cell(z1, map.halfH), x0, x1, z0, z1 };
}
const A = parseArea(AREA);

// ------------------------------------------------------------------ cảnh
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121a24);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4630, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-0.8, 2, 0.5);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 3000);
const cx = (A.x0 + A.x1) / 2;
const cz = (A.z0 + A.z1) / 2;
const span = Math.max(A.x1 - A.x0, A.z1 - A.z0);
camera.position.set(cx - span * 0.35, span * 0.75, cz + span * 0.85);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(cx, 2, cz);
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();
const render = (): void => renderer.render(scene, camera);
controls.addEventListener("change", render);
function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  render();
}
window.addEventListener("resize", resize);

// ------------------------------------------------------------------ dựng khối từ bản vẽ
const C_TOP = [new THREE.Color(0x8fa35a), new THREE.Color(0xa3a565), new THREE.Color(0xb7ad78)];
const C_RAMP = new THREE.Color(0xb49a68);
const C_CLIFF = new THREE.Color(0x7a6e60);
const C_SOIL = new THREE.Color(0x56483a);
const C_SURF: Record<string, THREE.Color> = {
  f: new THREE.Color(0x4a6e33),
  w: new THREE.Color(0x2c6fa8),
  s: new THREE.Color(0x7fb6d8),
  m: new THREE.Color(0x6b5536),
  o: new THREE.Color(0xb89a6a)
};
let group = new THREE.Group();
scene.add(group);

function build(grid: string[][], surf: string[][]): void {
  scene.remove(group);
  group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  group = new THREE.Group();
  const { blocks, owner } = rampBlocks(grid);
  const cols = grid[0].length;
  const wx = (c: number): number => -map.halfW + c * CELL;
  const wz = (r: number): number => -map.halfH + r * CELL;
  const rampH = (b: RampBlock, x: number, z: number): number => {
    const fx0 = wx(b.c0), fx1 = wx(b.c1 + 1), fz0 = wz(b.r0), fz1 = wz(b.r1 + 1);
    const len = b.dir === "e" || b.dir === "w" ? fx1 - fx0 : fz1 - fz0;
    const run = b.dir === "e" ? x - fx0 : b.dir === "w" ? fx1 - x : b.dir === "s" ? z - fz0 : fz1 - z;
    return (b.low + Math.max(0, Math.min(1, run / len))) * TIER_H;
  };
  /** Độ cao bốn góc ô [Tây Bắc, Đông Bắc, Đông Nam, Tây Nam]; nước hạ thấp mặt. */
  const corners = (c: number, r: number): number[] => {
    const k = owner[r * cols + c];
    const x0 = wx(c), x1 = wx(c + 1), z0 = wz(r), z1 = wz(r + 1);
    let h: number[];
    if (k >= 0) h = [rampH(blocks[k], x0, z0), rampH(blocks[k], x1, z0), rampH(blocks[k], x1, z1), rampH(blocks[k], x0, z1)];
    else {
      const t = Math.max(0, cellTier(grid, c, r)) * TIER_H;
      h = [t, t, t, t];
    }
    const s = surf[r]?.[c];
    const drop = s === "w" ? 1.4 : s === "s" ? 0.35 : 0;
    return h.map((v) => v - drop);
  };
  const pos: number[] = [];
  const col: number[] = [];
  const quad = (p: number[][], color: THREE.Color): void => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[i]);
      col.push(color.r, color.g, color.b);
    }
  };
  const inA = (c: number, r: number): boolean => c >= A.c0 && c < A.c1 && r >= A.r0 && r < A.r1;
  const trees: [number, number, number][] = [];
  const rocks: [number, number, number][] = [];
  for (let r = A.r0; r < A.r1; r++)
    for (let c = A.c0; c < A.c1; c++) {
      const h = corners(c, r);
      const x0 = wx(c), x1 = wx(c + 1), z0 = wz(r), z1 = wz(r + 1);
      const v = grid[r][c];
      const s = surf[r]?.[c] ?? ".";
      const top = C_SURF[s] ?? (owner[r * cols + c] >= 0 ? C_RAMP : C_TOP[Math.max(0, Math.min(2, cellTier(grid, c, r)))]);
      quad([[x0, h[0], z0], [x0, h[3], z1], [x1, h[2], z1], [x1, h[1], z0]], top);
      // cạnh Đông và cạnh Nam: vách giữa hai ô lệch độ cao; mép vùng: mặt cắt sa bàn xuống đáy
      const side = (a: number[], b: number[], ha: number, hb: number, la: number, lb: number, color: THREE.Color): void => {
        if (ha - la < 0.05 && hb - lb < 0.05) return;
        quad([[a[0], la, a[1]], [a[0], ha, a[1]], [b[0], hb, b[1]], [b[0], lb, b[1]]], color);
      };
      const east = inA(c + 1, r) ? corners(c + 1, r) : null;
      if (east) {
        if (h[1] + h[2] > east[0] + east[3]) side([x1, z1], [x1, z0], h[2], h[1], east[3], east[0], C_CLIFF);
        else side([x1, z0], [x1, z1], east[0], east[3], h[1], h[2], C_CLIFF);
      } else side([x1, z1], [x1, z0], h[2], h[1], BASE, BASE, C_SOIL);
      const south = inA(c, r + 1) ? corners(c, r + 1) : null;
      if (south) {
        if (h[3] + h[2] > south[0] + south[1]) side([x0, z1], [x1, z1], h[3], h[2], south[0], south[1], C_CLIFF);
        else side([x1, z1], [x0, z1], south[1], south[0], h[2], h[3], C_CLIFF);
      } else side([x0, z1], [x1, z1], h[3], h[2], BASE, BASE, C_SOIL);
      if (!inA(c - 1, r)) side([x0, z0], [x0, z1], h[0], h[3], BASE, BASE, C_SOIL);
      if (!inA(c, r - 1)) side([x1, z0], [x0, z0], h[1], h[0], BASE, BASE, C_SOIL);
      // rừng: cây trên nửa số ô (xô lệch tất định); đá: khối xám
      const hash = ((c * 73856093) ^ (r * 19349663)) >>> 0;
      if (s === "f" && hash % 2 === 0) trees.push([x0 + 0.4 + (hash % 7) * 0.18, h[0], z0 + 0.4 + ((hash >> 3) % 7) * 0.18]);
      if (v === "r") rocks.push([x0 + 1, h[0], z0 + 1]);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  const inst = (g: THREE.BufferGeometry, color: number, list: [number, number, number][], dy: number): void => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color, flatShading: true }), list.length);
    const mat = new THREE.Matrix4();
    list.forEach(([x, y, z], i) => m.setMatrixAt(i, mat.makeTranslation(x, y + dy, z)));
    group.add(m);
  };
  // mô hình đối chiếu dạng hộp (không phải mô hình thật): Titan và Pháo Tự Hành đang hạ bệ, đặt giữa vùng
  const groundAt = (x: number, z: number): number => {
    const c = Math.floor((x + map.halfW) / CELL);
    const r = Math.floor((z + map.halfH) / CELL);
    const h = corners(c, r);
    return (h[0] + h[1] + h[2] + h[3]) / 4;
  };
  group.add(titanBox(cx - 12, cz, groundAt(cx - 12, cz)), artilleryBox(cx + 12, cz, groundAt(cx + 12, cz)));
  inst(new THREE.ConeGeometry(1.3, 4.5, 6), 0x2f5527, trees, 2.25);
  inst(new THREE.BoxGeometry(2, 3, 2), 0x6b6258, rocks, 1.5);
  scene.add(group);
  render();
}

// ------------------------------------------------------------------ mô hình hộp đối chiếu
const TEAM = new THREE.MeshLambertMaterial({ color: 0x2e7fd0, flatShading: true });
const DARK = new THREE.MeshLambertMaterial({ color: 0x1d3f63, flatShading: true });
function boxAt(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  return m;
}
/** Titan: thân dài 2 × halfLen, ngang 2 × radius (content.ts), cao ~2 m + tháp pháo và nòng; mũi xe hướng Bắc. */
function titanBox(x: number, z: number, y: number): THREE.Group {
  const t = UNITS.titan;
  const len = (t.halfLen ?? t.radius) * 2;
  const wid = t.radius * 2;
  const g = new THREE.Group();
  g.add(boxAt(wid, 1.6, len, TEAM, 0, 0, 0), boxAt(wid * 0.62, 0.9, len * 0.45, DARK, 0, 1.6, 0.3), boxAt(0.3, 0.3, 3.6, DARK, 0, 1.9, -2.2));
  g.position.set(x, y, z);
  return g;
}
/** Pháo Tự Hành đang HẠ BỆ: thân dài 2 × halfLen; bốn càng xoè chéo cắm đất; tháp pháo nòng dài ngóc lên. */
function artilleryBox(x: number, z: number, y: number): THREE.Group {
  const a = UNITS.artillery;
  const len = (a.halfLen ?? a.radius) * 2;
  const wid = a.radius * 2 * 0.6;
  const g = new THREE.Group();
  g.add(boxAt(wid, 1.4, len * 0.7, TEAM, 0, 0.3, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const arm = boxAt(0.7, 0.5, len * 0.45, DARK, 0, 0, 0);
      arm.position.set(sx * wid * 0.7, 0, sz * len * 0.3);
      arm.rotation.y = sx * sz * -0.6; // xoè ra ngoài
      g.add(arm);
    }
  g.add(boxAt(3, 1.4, 3.4, DARK, 0, 1.7, 0.4));
  const barrel = boxAt(0.4, 0.4, 8, DARK, 0, 0, 0);
  barrel.position.set(0, 3.2, -3.4);
  barrel.rotation.x = 0.35; // ngóc nòng
  g.add(barrel);
  g.position.set(x, y, z);
  return g;
}

// ------------------------------------------------------------------ nạp bản vẽ, tự nạp lại khi file đổi
let lastText = "";
async function load(): Promise<void> {
  const res = await fetch(`/__layout/${ID}`, { cache: "no-store" });
  if (!res.ok) return;
  const text = await res.text();
  if (text === lastText) return;
  lastText = text;
  const data = JSON.parse(text) as { rows: string[]; surf?: string[] };
  build(
    data.rows.map((r) => r.split("").map((v) => ("nesw".includes(v) ? "d" : v))),
    (data.surf ?? data.rows.map((r) => ".".repeat(r.length))).map((r) => r.split(""))
  );
}
document.getElementById("info")!.innerHTML =
  `<b>Sa bàn ${AREA}</b> · ${Math.round(A.x1 - A.x0)} × ${Math.round(A.z1 - A.z0)} m · mỗi bậc tầng cao ${TIER_H} m<br>` +
  `Hộp xanh: Titan (trái) và Pháo Tự Hành đang hạ bệ (phải) để so cỡ<br>` +
  `Kéo chuột trái: xoay · lăn: phóng · chuột phải: dời · đổi vùng: ?area=${colName(0)}1:${colName(2)}3`;
resize();
void load();
window.setInterval(() => void load(), 2000);
