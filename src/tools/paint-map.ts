/**
 * VẼ ẢNH MẶT ĐẤT của một bản đồ, nhìn thẳng từ trên xuống, HOÀN TOÀN BẰNG CODE từ GameMap (B8a,
 * Docs/design/MAPS_PLAN.md mục 7). Ảnh khớp với luật chơi vì vẽ từ chính dữ liệu bản đồ: sông, cầu, đồi, đá,
 * rừng nằm đúng chỗ sim coi là sông, cầu, đồi, đá, rừng. Không dùng ảnh hay tài nguyên ngoài nào.
 *
 *   npm run paint-map -- <mã bản đồ> [điểm ảnh mỗi mét = 10] [file ra = ground-<mã>.png]
 *
 * Cách vẽ (chỉ phần vẽ, không cần tất định, nhưng mọi nhiễu đều có seed nên chạy lại ra đúng ảnh cũ):
 * 1. Trường dữ liệu ở 4 điểm ảnh / m: độ cao, khoảng cách tới mép nước, mặt nạ rừng, khoảng cách tới mép bản đồ.
 * 2. Lưới "vật che nắng" = độ cao + đá + tán cây + mặt cầu → bóng đổ bằng cách dò về phía mặt trời (trên trái).
 * 3. Từng điểm ảnh: cỏ nhiều tầng nhiễu, đất trống, sỏi, bờ sông ướt, nước theo độ sâu + vệt chảy + bọt ven bờ,
 *    nền rừng; nhân nắng theo sườn dốc, bóng đổ, tối hõm.
 * 4. Đá (theo map.rocks), cầu (theo lối qua), cây (rải theo vùng rừng, mép bản đồ, lác đác ngoài đồng).
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { getMap } from "../sim/maps";

const ID = process.argv[2] ?? "two-crossings";
const PPM = Number(process.argv[3] ?? 10);
const OUT = process.argv[4] ?? `ground-${ID}.png`;
const map = getMap(ID);
const NW = Math.round(map.w * PPM);
const NH = Math.round(map.h * PPM);
const t0 = performance.now();
const log = (s: string): void => console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s  ${s}`);

// ------------------------------------------------------------------ nhiễu có seed
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, s: number, oct = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, s + i * 31);
    norm += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v / norm;
}
/** Nhiễu gờ (ridged): gờ sắc ở giữa, dùng cho vân nứt đá. */
function ridged(x: number, y: number, s: number, oct = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, s + i * 17) * 2 - 1);
    v += amp * n * n;
    norm += amp;
    f *= 2.1;
    amp *= 0.5;
  }
  return v / norm;
}
/** Nhiễu ô (Worley): khoảng cách tới hạt gần nhất (W1) và gần nhì (W2), ghi vào biến chung để khỏi tạo mảng. */
let W1 = 0;
let W2 = 0;
let WC = 0;
function worley(x: number, y: number, s: number): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let c = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const px = xi + i + hash(xi + i, yi + j, s);
      const py = yi + j + hash(xi + i, yi + j, s + 7);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        c = hash(xi + i, yi + j, s + 13);
      } else if (d < d2) d2 = d;
    }
  W1 = Math.sqrt(d1);
  W2 = Math.sqrt(d2);
  WC = c;
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ------------------------------------------------------------------ màu (RGB 0..1)
type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const C = {
  grassLush: hex(0x4f7d2c),
  grassDeep: hex(0x3e6b25),
  grassOlive: hex(0x76843a),
  grassDry: hex(0x9a9452),
  soil: hex(0x7d6040),
  soilDark: hex(0x5a4430),
  pebble: hex(0xa59a86),
  sand: hex(0xc2ab7a),
  sandWet: hex(0x7c6a4b),
  rockLight: hex(0xa79e8f),
  rockDark: hex(0x5c544a),
  lichen: hex(0x8e9a52),
  forestFloor: hex(0x2f4a22),
  waterShallow: hex(0x4fa39a),
  waterMid: hex(0x2a7690),
  waterDeep: hex(0x184b6c),
  foam: hex(0xe8f2ef),
  wood: hex(0x8a6440),
  woodDark: hex(0x4e3624),
  stone: hex(0x8d877d)
};
const TREE_COLORS: RGB[] = [hex(0x2e5a24), hex(0x3a6a2a), hex(0x4a7a30), hex(0x2a4f22), hex(0x587f34), hex(0x6a7f32)];

// ------------------------------------------------------------------ mặt trời: chiếu từ trên trái (Tây Bắc)
const SUN = (() => {
  const v = [-0.62, 0.68, -0.4]; // x (Đông), y (lên), z (Nam)
  const l = Math.hypot(v[0], v[1], v[2]);
  return { x: v[0] / l, y: v[1] / l, z: v[2] / l };
})();
const SUN_FLAT = Math.hypot(SUN.x, SUN.z);
const SUN_TAN = SUN.y / SUN_FLAT; // độ dốc tia nắng

// ------------------------------------------------------------------ 1. trường dữ liệu ở R điểm ảnh / m
const R = 4;
const FW = Math.round(map.w * R);
const FH = Math.round(map.h * R);
const fx = (i: number): number => -map.halfW + (i + 0.5) / R;
const fz = (j: number): number => -map.halfH + (j + 0.5) / R;
const Hf = new Float32Array(FW * FH); // độ cao địa hình
const Wd = new Float32Array(FW * FH); // khoảng cách có dấu tới mép nước (âm = dưới nước)
const Bw = new Float32Array(FW * FH); // bề rộng bờ dốc của dòng sông gần nhất
const Fm = new Float32Array(FW * FH); // mặt nạ rừng 0/1
const In = new Float32Array(FW * FH); // khoảng cách tới mép bản đồ
for (let j = 0; j < FH; j++)
  for (let i = 0; i < FW; i++) {
    const x = fx(i);
    const z = fz(j);
    const k = j * FW + i;
    Hf[k] = map.terrainHeight(x, z);
    const we = map.waterEdge(x, z);
    Wd[k] = Math.min(999, we.d);
    Bw[k] = we.bank;
    Fm[k] = map.terrainAt(x, z) === "forest" ? 1 : 0;
    In[k] = map.inset(x, z);
  }
// Ụ đất của mỏm đá trong luật chơi (GameMap cộng vào độ cao để đá che tầm nhìn): khi vẽ thì bỏ đi,
// vì hình tảng đá tự có khối và bóng đổ; giữ lại sẽ thành một đĩa sáng tối tròn quanh mỗi tảng.
// Công thức phải khớp GameMap.terrainHeight (phần mỏm đá).
for (const rb of map.rocks) {
  const R2 = (rb.r + 1.5) * (rb.r + 1.5);
  for (let j = Math.max(0, Math.floor((rb.z - rb.r - 2 + map.halfH) * R)); j < Math.min(FH, Math.ceil((rb.z + rb.r + 2 + map.halfH) * R)); j++)
    for (let i = Math.max(0, Math.floor((rb.x - rb.r - 2 + map.halfW) * R)); i < Math.min(FW, Math.ceil((rb.x + rb.r + 2 + map.halfW) * R)); i++) {
      const d2 = (fx(i) - rb.x) ** 2 + (fz(j) - rb.z) ** 2;
      if (d2 < R2) {
        const t = clamp01((1 - d2 / R2) * 1.6);
        Hf[j * FW + i] -= rb.h * t * t * (3 - 2 * t);
      }
    }
}
log(`trường dữ liệu ${FW}×${FH}`);

function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let j = 0; j < h; j++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[j * w + Math.min(w - 1, Math.max(0, i))];
    for (let i = 0; i < w; i++) {
      tmp[j * w + i] = s / n;
      s += src[j * w + Math.min(w - 1, i + r + 1)] - src[j * w + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < w; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) s += tmp[Math.min(h - 1, Math.max(0, j)) * w + i];
    for (let j = 0; j < h; j++) {
      out[j * w + i] = s / n;
      s += tmp[Math.min(h - 1, j + r + 1) * w + i] - tmp[Math.max(0, j - r) * w + i];
    }
  }
  return out;
}
const FmSoft = blur(blur(Fm, FW, FH, 3), FW, FH, 3); // mép rừng mềm
// nền đất trống quanh căn cứ và mỏ (xe ra vào giẫm nát cỏ)
const Pad = new Float32Array(FW * FH);
for (let j = 0; j < FH; j++)
  for (let i = 0; i < FW; i++) {
    const x = fx(i);
    const z = fz(j);
    let p = 0;
    for (const [bx, bz] of map.bases) p = Math.max(p, sstep(15, 8, Math.sqrt((x - bx) ** 2 + (z - bz) ** 2)) * 0.75);
    for (const m of map.mines) p = Math.max(p, sstep(6, 2.5, Math.sqrt((x - m.x) ** 2 + (z - m.z) ** 2)) * 0.6);
    Pad[j * FW + i] = p;
  }
/** Phóng đại độ cao khi tính nắng theo sườn (chỉ để vẽ; luật chơi không đổi) cho đồi hiện rõ nhìn từ trên xuống. */
const EXAG = 1.6;
const Hs = blur(blur(Hf, FW, FH, 3), FW, FH, 2); // độ cao làm mượt cho pháp tuyến
const Hbig = blur(blur(Hf, FW, FH, 12), FW, FH, 12); // để tính hõm (tối hõm / AO)

/** Lấy mẫu song tuyến một trường tại tọa độ thế giới. */
function samp(F: Float32Array, x: number, z: number): number {
  let u = (x + map.halfW) * R - 0.5;
  let v = (z + map.halfH) * R - 0.5;
  u = u < 0 ? 0 : u > FW - 1.001 ? FW - 1.001 : u;
  v = v < 0 ? 0 : v > FH - 1.001 ? FH - 1.001 : v;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const a = u - i;
  const b = v - j;
  const k = j * FW + i;
  const t = F[k] + (F[k + 1] - F[k]) * a;
  const d = F[k + FW] + (F[k + FW + 1] - F[k + FW]) * a;
  return t + (d - t) * b;
}

// ------------------------------------------------------------------ 2. đá, cây, cầu (hình học dùng chung cho bóng đổ và tô màu)
interface Boulder {
  /** đa giác lồi (tọa độ thế giới) và pháp tuyến hướng vào trong của từng cạnh */
  vx: number[];
  vz: number[];
  nx: number[];
  nz: number[];
  /** hộp bao */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  /** bề rộng mặt vát (m): càng lớn đá càng tròn */
  bevel: number;
  seed: number;
}
interface Rock {
  x: number;
  z: number;
  r: number;
  parts: Boulder[];
}
/** Tảng đá đa giác lồi: n đỉnh quanh tâm, bán kính méo, thuôn theo một trục. */
function boulder(cx: number, cz: number, r: number, h: number, seed: number): Boulder {
  const n = 6 + Math.floor(hash(seed, 1, 4) * 4);
  const rot = hash(seed, 2, 4) * Math.PI * 2;
  const el = 0.72 + hash(seed, 3, 4) * 0.28;
  const vx: number[] = [];
  const vz: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (hash(seed, 10 + i, 4) - 0.5) * (Math.PI / n);
    const rr = r * (0.78 + hash(seed, 30 + i, 4) * 0.4);
    const lx = Math.cos(a) * rr;
    const lz = Math.sin(a) * rr * el;
    vx.push(cx + lx * Math.cos(rot) - lz * Math.sin(rot));
    vz.push(cz + lx * Math.sin(rot) + lz * Math.cos(rot));
  }
  const nx: number[] = [];
  const nz: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = vx[j] - vx[i];
    const ez = vz[j] - vz[i];
    const l = Math.hypot(ex, ez);
    // đỉnh xếp ngược chiều kim đồng hồ trong hệ (x Đông, z Nam) → pháp tuyến trong là (-ez, ex)
    nx.push(-ez / l);
    nz.push(ex / l);
  }
  // nếu đa giác xếp chiều kia thì lật pháp tuyến (kiểm bằng tâm)
  let inside = 0;
  for (let i = 0; i < n; i++) inside += (cx - vx[i]) * nx[i] + (cz - vz[i]) * nz[i];
  if (inside < 0) for (let i = 0; i < n; i++) {
    nx[i] = -nx[i];
    nz[i] = -nz[i];
  }
  return { vx, vz, nx, nz, x0: Math.min(...vx), x1: Math.max(...vx), z0: Math.min(...vz), z1: Math.max(...vz), h, bevel: r * (0.45 + hash(seed, 5, 4) * 0.3), seed };
}
/** Mỗi mỏm đá của bản đồ thành một cụm: tảng chính + 2–4 tảng nhỏ chồng quanh mép (vẫn trong vùng chặn đường). */
const rocks: Rock[] = map.rocks.map((b, i) => {
  const seed = 100 + i * 13;
  // tảng chính phủ kín vùng chặn đường của luật chơi (người chơi phải thấy đúng chỗ xe không qua được)
  const parts: Boulder[] = [boulder(b.x, b.z, b.r * 1.22, b.h * 1.15, seed)];
  const n = 2 + Math.floor(hash(seed, 1, 3) * 3);
  for (let k = 0; k < n; k++) {
    const a = hash(seed, 10 + k, 3) * Math.PI * 2;
    const d = b.r * (0.55 + hash(seed, 20 + k, 3) * 0.35);
    parts.push(boulder(b.x + Math.cos(a) * d, b.z + Math.sin(a) * d, b.r * (0.45 + hash(seed, 30 + k, 3) * 0.3), b.h * (0.5 + hash(seed, 40 + k, 3) * 0.4), seed + 50 + k));
  }
  return { x: b.x, z: b.z, r: b.r * 1.75, parts };
});
/** Độ cao của đá tại điểm (0 nếu ngoài đá). Ghi thêm RK_CRACK (0..1, gần khe nứt) và RK_TONE (sắc độ khối). */
let RK_CRACK = 0;
let RK_TONE = 0.5;
function rockHeight(rk: Rock, x: number, z: number): number {
  let best = 0;
  for (const p of rk.parts) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    let dmin = Infinity;
    for (let i = 0; i < p.vx.length; i++) {
      const d = (x - p.vx[i]) * p.nx[i] + (z - p.vz[i]) * p.nz[i];
      if (d < dmin) dmin = d;
    }
    if (dmin <= 0) continue;
    // mặt vát phẳng theo từng cạnh, đỉnh bằng; thêm gợn nhỏ cho đỡ trơn
    let hh = p.h * Math.min(1, dmin / p.bevel) * (0.92 + 0.08 * vnoise(x * 1.3, z * 1.3, p.seed));
    worley(x * 0.55 + p.seed, z * 0.55, p.seed);
    const crack = sstep(0.06, 0.0, W2 - W1) * sstep(0, 0.3, dmin);
    hh -= crack * 0.12;
    hh += (WC - 0.5) * 0.18 * Math.min(1, dmin / p.bevel);
    if (hh > best) {
      best = hh;
      RK_CRACK = crack;
      RK_TONE = WC;
    }
  }
  return best;
}

interface Tree {
  x: number;
  z: number;
  r: number;
  h: number;
  col: RGB;
  lobes: { ox: number; oz: number; r: number; h: number; t: number }[];
}
const trees: Tree[] = [];
const bases = map.bases;
const clearOf = (x: number, z: number): boolean => {
  for (const [bx, bz] of bases) if ((x - bx) ** 2 + (z - bz) ** 2 < 16 * 16) return false;
  for (const m of map.mines) if ((x - m.x) ** 2 + (z - m.z) ** 2 < 7 * 7) return false;
  for (const rk of rocks) if ((x - rk.x) ** 2 + (z - rk.z) ** 2 < (rk.r + 1.5) ** 2) return false;
  return true;
};
function addTree(x: number, z: number, scale: number, seed: number): void {
  const r = (1.7 + hash(seed, 1, 5) * 1.3) * scale;
  const h = r * (2.1 + hash(seed, 2, 5) * 0.6);
  const base = TREE_COLORS[Math.floor(hash(seed, 3, 5) * TREE_COLORS.length)];
  const tint = 0.9 + hash(seed, 4, 5) * 0.2;
  const col: RGB = [base[0] * tint, base[1] * tint, base[2] * tint];
  const lobes: Tree["lobes"] = [{ ox: 0, oz: 0, r: r * 0.62, h: 1, t: 1 }];
  const n = 5 + Math.floor(hash(seed, 5, 5) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, 10 + i, 5);
    const d = r * (0.32 + hash(seed, 20 + i, 5) * 0.28);
    lobes.push({ ox: Math.cos(a) * d, oz: Math.sin(a) * d, r: r * (0.38 + hash(seed, 30 + i, 5) * 0.2), h: 0.85 + hash(seed, 40 + i, 5) * 0.15, t: 0.9 + hash(seed, 50 + i, 5) * 0.2 });
  }
  trees.push({ x, z, r, h, col, lobes });
}
// rải cây: lưới xô lệch; rừng dày, mép bản đồ dày, ngoài đồng gom thành từng lùm nhỏ, ven sông vài bụi
{
  const step = 2.5;
  let seed = 1;
  for (let z = -map.halfH; z < map.halfH; z += step)
    for (let x = -map.halfW; x < map.halfW; x += step) {
      seed++;
      const px = x + hash(seed, 1, 9) * step;
      const pz = z + hash(seed, 2, 9) * step;
      const f = samp(FmSoft, px, pz);
      const inset = samp(In, px, pz);
      const wd = samp(Wd, px, pz);
      if (wd < 1.8) continue;
      const copse = sstep(0.7, 0.82, fbm(px * 0.045, pz * 0.045, 77, 4));
      let p: number;
      if (f > 0.5) p = 0.93;
      else if (inset < 10) p = 0.9 * sstep(10, 4, inset);
      else p = 0.002 + 0.55 * copse + 0.3 * f * f;
      if (wd < 6 && f < 0.5) p = Math.max(p, 0.35 * sstep(0.62, 0.75, fbm(px * 0.12, pz * 0.12, 78, 3)));
      if (hash(seed, 3, 9) > p || !clearOf(px, pz)) continue;
      const big = f > 0.5 || inset < 10;
      addTree(px, pz, big ? 0.95 + hash(seed, 4, 9) * 0.25 : 0.65 + hash(seed, 4, 9) * 0.35, seed);
    }
}
log(`${trees.length} cây`);

interface Bridge {
  cx: number;
  cz: number;
  ax: number; // trục dọc cầu (băng qua sông)
  az: number;
  len: number;
  wid: number;
}
const bridges: Bridge[] = map.crossings()
  .filter((c) => c.def.kind === "bridge")
  .map((c) => ({ cx: c.def.x, cz: c.def.z, ax: -c.dirZ, az: c.dirX, len: (c.river.bank + 1.5) * 2, wid: c.def.half * 2 }));
/** Tọa độ cục bộ trên cầu: u dọc cầu (−len/2..len/2), v ngang cầu; null nếu ngoài cầu. */
function onBridge(b: Bridge, x: number, z: number): [number, number] | null {
  const dx = x - b.cx;
  const dz = z - b.cz;
  const u = dx * b.ax + dz * b.az;
  const v = -dx * b.az + dz * b.ax;
  if (Math.abs(u) > b.len / 2 || Math.abs(v) > b.wid / 2) return null;
  return [u, v];
}

// ------------------------------------------------------------------ lưới vật che nắng và bóng đổ (ở R điểm ảnh / m)
const Sh = Float32Array.from(Hf);
for (const rk of rocks) {
  const r = rk.r * 1.1;
  for (let j = Math.max(0, Math.floor((rk.z - r + map.halfH) * R)); j < Math.min(FH, Math.ceil((rk.z + r + map.halfH) * R)); j++)
    for (let i = Math.max(0, Math.floor((rk.x - r + map.halfW) * R)); i < Math.min(FW, Math.ceil((rk.x + r + map.halfW) * R)); i++)
      Sh[j * FW + i] += rockHeight(rk, fx(i), fz(j));
}
for (const t of trees) {
  for (let j = Math.max(0, Math.floor((t.z - t.r + map.halfH) * R)); j < Math.min(FH, Math.ceil((t.z + t.r + map.halfH) * R)); j++)
    for (let i = Math.max(0, Math.floor((t.x - t.r + map.halfW) * R)); i < Math.min(FW, Math.ceil((t.x + t.r + map.halfW) * R)); i++) {
      const q = ((fx(i) - t.x) ** 2 + (fz(j) - t.z) ** 2) / (t.r * t.r);
      if (q < 1) {
        const k = j * FW + i;
        Sh[k] = Math.max(Sh[k], Hf[k] + t.h * (0.55 + 0.45 * Math.sqrt(1 - q)));
      }
    }
}
for (const b of bridges)
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) {
      if (Math.abs(fx(i) - b.cx) > b.len || Math.abs(fz(j) - b.cz) > b.len) continue;
      if (onBridge(b, fx(i), fz(j))) Sh[j * FW + i] = Math.max(Sh[j * FW + i], 0.8);
    }
const Shadow = new Float32Array(FW * FH);
{
  const stepM = 0.35;
  // SUN chỉ về phía mặt trời (Tây Bắc); dò từ điểm đang xét đi về phía đó: x - sx·d, z - sz·d
  const sx = -SUN.x / SUN_FLAT;
  const sz = -SUN.z / SUN_FLAT;
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) {
      const x = fx(i);
      const z = fz(j);
      const h0 = Sh[j * FW + i] + 0.05;
      let lit = 1;
      for (let s = 1; s <= 70; s++) {
        const d = s * stepM;
        const hh = samp(Sh, x - sx * d, z - sz * d);
        const ray = h0 + d * SUN_TAN;
        if (hh > ray) {
          lit = Math.min(lit, 1 - clamp01((hh - ray) * 1.6));
          if (lit <= 0) break;
        }
      }
      Shadow[j * FW + i] = lit;
    }
}
const ShadowSoft = blur(Shadow, FW, FH, 1);
log("bóng đổ");

// ------------------------------------------------------------------ 3. tô từng điểm ảnh
const img = new Float32Array(NW * NH * 3);
const px2x = (i: number): number => -map.halfW + (i + 0.5) / PPM;
const px2z = (j: number): number => -map.halfH + (j + 0.5) / PPM;
const e = 0.5 / R; // bước sai phân cho pháp tuyến
for (let j = 0; j < NH; j++) {
  const z = px2z(j);
  for (let i = 0; i < NW; i++) {
    const x = px2x(i);
    // làm méo tọa độ (domain warp) để mép các vùng lượn tự nhiên
    const wx = x + (fbm(x * 0.08, z * 0.08, 11, 3) - 0.5) * 6;
    const wz = z + (fbm(x * 0.08 + 40, z * 0.08, 12, 3) - 0.5) * 6;
    const h = samp(Hf, x, z);
    const wd = samp(Wd, x, z);
    const bw = samp(Bw, x, z);
    const forest = samp(FmSoft, wx * 0.3 + x * 0.7, wz * 0.3 + z * 0.7);
    const inset = samp(In, x, z);
    // pháp tuyến từ độ cao làm mượt
    const gx = ((samp(Hs, x + e, z) - samp(Hs, x - e, z)) / (2 * e)) * EXAG;
    const gz = ((samp(Hs, x, z + e) - samp(Hs, x, z - e)) / (2 * e)) * EXAG;
    const slope = Math.sqrt(gx * gx + gz * gz);
    const nl = 1 / Math.sqrt(1 + gx * gx + gz * gz);
    const lambert = (-gx * SUN.x + SUN.y - gz * SUN.z) * nl;
    const shade = Math.min(1.35, Math.max(0.45, 1 + (lambert / SUN.y - 1) * 0.9));
    const hollow = samp(Hbig, x, z) - h; // dương = chỗ trũng
    let r: number;
    let g: number;
    let b: number;

    // --- cỏ: vĩ mô (vùng màu) + trung (mảng) + vi mô (lá cỏ, đốm)
    const macro = fbm(wx * 0.025, wz * 0.025, 1, 4);
    const meso = fbm(wx * 0.12, wz * 0.12, 2, 4);
    const moist = clamp01(1 - (wd - 4) / 26); // ẩm gần sông
    const highDry = sstep(1.2, 4.5, h); // đồi cao khô hơn
    let t1 = sstep(0.3, 0.7, macro);
    r = lerp(C.grassLush[0], C.grassOlive[0], t1);
    g = lerp(C.grassLush[1], C.grassOlive[1], t1);
    b = lerp(C.grassLush[2], C.grassOlive[2], t1);
    const dry = clamp01(highDry * 0.7 + sstep(0.58, 0.82, meso) * 0.3 - moist * 0.35);
    r = lerp(r, C.grassDry[0], dry);
    g = lerp(g, C.grassDry[1], dry);
    b = lerp(b, C.grassDry[2], dry);
    const deep = moist * 0.45 + sstep(0.35, 0.15, meso) * 0.25;
    r = lerp(r, C.grassDeep[0], deep);
    g = lerp(g, C.grassDeep[1], deep);
    b = lerp(b, C.grassDeep[2], deep);
    // vân lá cỏ: nhiễu kéo dài theo một hướng thay đổi chậm
    const ang = fbm(x * 0.05, z * 0.05, 3, 2) * 6.283;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const blade = vnoise((x * ca + z * sa) * 9, (-x * sa + z * ca) * 2.2, 4);
    const fine = vnoise(x * 4.5, z * 4.5, 5) * 0.6 + vnoise(x * 11, z * 11, 6) * 0.4;
    let lum = 0.86 + blade * 0.16 + fine * 0.14;
    worley(x * 0.9, z * 0.9, 7); // mảng cỏ
    lum *= 0.93 + 0.1 * sstep(0.05, 0.6, W1);
    // bụi cỏ nhỏ: tối ở giữa, sáng mép phía nắng
    worley(x * 1.8, z * 1.8, 61);
    if (WC > 0.35) {
      const tuft = sstep(0.36, 0.08, W1);
      lum *= 1 - tuft * 0.2;
      worley(x * 1.8 + 0.09, z * 1.8 + 0.07, 61);
      lum *= 1 + sstep(0.36, 0.1, W1) * (1 - tuft) * 0.12;
    }
    // ấm / lạnh theo vùng cho đỡ đơn điệu
    const warm = (fbm(wx * 0.04 + 3, wz * 0.04, 62, 3) - 0.5) * 0.12;
    r *= lum * (1 + warm);
    g *= lum;
    b *= lum * (1 - warm);
    // hoa dại lác đác trên đồng (không trên đồi khô, không trong rừng)
    if (hash(Math.floor(x * 3.2), Math.floor(z * 3.2), 63) > 0.992 && fbm(x * 0.06, z * 0.06, 65, 3) > 0.64 && dry < 0.5 && forest < 0.2) {
      const yellow = hash(Math.floor(x * 3.2), Math.floor(z * 3.2), 64) > 0.4;
      r = yellow ? 0.92 : 0.95;
      g = yellow ? 0.85 : 0.95;
      b = yellow ? 0.35 : 0.9;
    }

    // --- đất trống: mảng đất nâu có sỏi, nhiều hơn ở sườn dốc và quanh căn cứ / mỏ
    const sw = fbm(x * 0.2, z * 0.2, 81, 3) - 0.5;
    let soilAmt = sstep(0.69, 0.79, fbm(wx * 0.05 + 9 + sw * 0.6, wz * 0.05 + sw * 0.6, 8, 4)) * (0.45 + 0.5 * highDry) * (1 - moist * 0.6);
    soilAmt *= 0.55 + 0.45 * sstep(0.3, 0.6, vnoise(x * 1.6, z * 1.6, 82));
    soilAmt = Math.max(soilAmt, sstep(0.3, 0.75, slope) * 0.75);
    soilAmt = Math.max(soilAmt, samp(Pad, wx, wz) * (0.6 + 0.4 * sstep(0.25, 0.6, vnoise(x * 1.3, z * 1.3, 83))));
    if (soilAmt > 0.01) {
      const grain = 0.85 + vnoise(x * 6, z * 6, 13) * 0.3;
      let sr = lerp(C.soil[0], C.soilDark[0], fbm(x * 0.3, z * 0.3, 14, 3)) * grain;
      let sg = lerp(C.soil[1], C.soilDark[1], fbm(x * 0.3, z * 0.3, 14, 3)) * grain;
      let sb = lerp(C.soil[2], C.soilDark[2], fbm(x * 0.3, z * 0.3, 14, 3)) * grain;
      worley(x * 2.2, z * 2.2, 15); // sỏi
      const peb = sstep(0.28, 0.12, W1) * (hash(Math.floor(x * 2.2), Math.floor(z * 2.2), 16) > 0.55 ? 1 : 0);
      sr = lerp(sr, C.pebble[0], peb * 0.8);
      sg = lerp(sg, C.pebble[1], peb * 0.8);
      sb = lerp(sb, C.pebble[2], peb * 0.8);
      r = lerp(r, sr, soilAmt);
      g = lerp(g, sg, soilAmt);
      b = lerp(b, sb, soilAmt);
    }

    // --- đá lộ trên sườn rất dốc (vách núi quanh mép)
    const cliff = sstep(0.75, 1.3, slope);
    if (cliff > 0.01) {
      const cr = ridged(x * 0.4, z * 0.4, 21, 4);
      const k = 0.55 + 0.6 * cr;
      r = lerp(r, lerp(C.rockDark[0], C.rockLight[0], cr) * k, cliff);
      g = lerp(g, lerp(C.rockDark[1], C.rockLight[1], cr) * k, cliff);
      b = lerp(b, lerp(C.rockDark[2], C.rockLight[2], cr) * k, cliff);
    }

    // --- nền rừng: tối, nâu xanh
    if (forest > 0.01) {
      const ff = forest * 0.85;
      const n = 0.8 + fbm(x * 0.5, z * 0.5, 22, 3) * 0.4;
      r = lerp(r, C.forestFloor[0] * n, ff);
      g = lerp(g, C.forestFloor[1] * n, ff);
      b = lerp(b, C.forestFloor[2] * n, ff);
    }

    // --- bờ sông: bề rộng thay đổi; cát, sỏi hoặc bùn cỏ tùy chỗ; ướt sẫm sát mép nước; lau sậy từng đám
    if (wd >= 0) {
      const bandW = bw * (0.3 + 0.7 * fbm(x * 0.11, z * 0.11, 23, 3));
      if (wd < bandW + 1.2) {
        const tb = sstep(bandW + 1.2, bandW - 0.6, wd);
        const wet = sstep(1.1, 0, wd) * 0.65;
        const mat = fbm(x * 0.18 + 5, z * 0.18, 31, 3);
        const mud = sstep(0.68, 0.78, mat) * 0.8;
        worley(x * 1.7, z * 1.7, 24);
        const peb = sstep(0.32, 0.1, W1) * (WC > 0.45 ? 0.55 : 0.15) * (1 - mud);
        const n = 0.88 + vnoise(x * 5, z * 5, 25) * 0.24;
        let sr = lerp(lerp(C.sand[0], C.pebble[0], peb), C.soilDark[0] * 1.05, mud);
        let sg = lerp(lerp(C.sand[1], C.pebble[1], peb), C.soilDark[1] * 1.1, mud);
        let sb = lerp(lerp(C.sand[2], C.pebble[2], peb), C.soilDark[2], mud);
        sr = lerp(sr, C.sandWet[0], wet) * n;
        sg = lerp(sg, C.sandWet[1], wet) * n;
        sb = lerp(sb, C.sandWet[2], wet) * n;
        r = lerp(r, sr, tb);
        g = lerp(g, sg, tb);
        b = lerp(b, sb, tb);
      }
      // lau sậy: nét ngắn xanh sẫm sát mép nước, từng đám
      if (wd < 2.6 && fbm(x * 0.25, z * 0.25, 32, 3) > 0.6) {
        const reed = sstep(0.55, 0.8, vnoise(x * 10, z * 3.5, 33)) * sstep(2.6, 0.6, wd);
        r = lerp(r, 0.24, reed * 0.8);
        g = lerp(g, 0.33, reed * 0.8);
        b = lerp(b, 0.14, reed * 0.8);
      }
    }

    // --- ánh sáng mặt đất: nắng theo sườn, bóng đổ, tối hõm
    const shadow = samp(ShadowSoft, x, z);
    const ao = 1 - clamp01(hollow * 0.09) * 0.35;
    let light = shade * (0.55 + 0.45 * shadow) * ao;

    // --- nước: màu theo độ sâu, vệt chảy, bọt ven bờ, lấp lánh
    if (wd < 0) {
      const depth = clamp01(-wd / 6);
      const dw = Math.sqrt(depth);
      let wr = lerp(C.waterShallow[0], C.waterMid[0], sstep(0, 0.5, dw));
      let wg = lerp(C.waterShallow[1], C.waterMid[1], sstep(0, 0.5, dw));
      let wb = lerp(C.waterShallow[2], C.waterMid[2], sstep(0, 0.5, dw));
      wr = lerp(wr, C.waterDeep[0], sstep(0.45, 1, dw));
      wg = lerp(wg, C.waterDeep[1], sstep(0.45, 1, dw));
      wb = lerp(wb, C.waterDeep[2], sstep(0.45, 1, dw));
      // hướng dòng chảy ≈ vuông góc với hướng tăng của khoảng cách tới mép
      const ddx = samp(Wd, x + 0.5, z) - samp(Wd, x - 0.5, z);
      const ddz = samp(Wd, x, z + 0.5) - samp(Wd, x, z - 0.5);
      const dl = Math.hypot(ddx, ddz) || 1;
      const tx = -ddz / dl;
      const tz = ddx / dl;
      const along = x * tx + z * tz;
      const across = -x * tz + z * tx;
      const streak = fbm(along * 0.35, across * 2.2, 26, 3);
      const ripple = vnoise(x * 3, z * 3, 27) * 0.5 + vnoise(x * 7, z * 7, 28) * 0.5;
      const k = 0.88 + streak * 0.2 + ripple * 0.08;
      wr *= k;
      wg *= k;
      wb *= k;
      // bọt trắng sát bờ: dải mảnh, đứt quãng
      const foamBand = sstep(-1.4, -0.1, wd) * sstep(0.35, 0.65, fbm(along * 0.6, across * 1.5, 29, 3) + (wd + 1.4) * 0.15);
      wr = lerp(wr, C.foam[0], foamBand * 0.75);
      wg = lerp(wg, C.foam[1], foamBand * 0.75);
      wb = lerp(wb, C.foam[2], foamBand * 0.75);
      // lấp lánh
      if (vnoise(x * 9, z * 9, 30) > 0.965 && depth > 0.35) {
        wr = lerp(wr, 1, 0.5);
        wg = lerp(wg, 1, 0.5);
        wb = lerp(wb, 1, 0.5);
      }
      // nước phẳng: chỉ nhận bóng đổ (cầu, cây ven bờ), không nhận nắng theo sườn đáy
      const edgeMix = sstep(0, -0.8, wd);
      r = lerp(r, wr, edgeMix);
      g = lerp(g, wg, edgeMix);
      b = lerp(b, wb, edgeMix);
      light = lerp(light, 0.62 + 0.38 * shadow, edgeMix);
    }

    // mép bản đồ (sau vách): tối dần cho khỏi lộ cạnh
    if (inset < 3) light *= 0.75 + 0.25 * clamp01(inset / 3 + 1);

    const o = (j * NW + i) * 3;
    img[o] = r * light;
    img[o + 1] = g * light;
    img[o + 2] = b * light;
  }
  if (j % 400 === 0) log(`mặt đất ${j}/${NH}`);
}
log("mặt đất xong");

// ------------------------------------------------------------------ 4a. đá
for (const rk of rocks) {
  const rr = rk.r * 1.1;
  const i0 = Math.max(0, Math.floor((rk.x - rr + map.halfW) * PPM));
  const i1 = Math.min(NW - 1, Math.ceil((rk.x + rr + map.halfW) * PPM));
  const j0 = Math.max(0, Math.floor((rk.z - rr + map.halfH) * PPM));
  const j1 = Math.min(NH - 1, Math.ceil((rk.z + rr + map.halfH) * PPM));
  const d = 0.1;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = px2x(i);
      const z = px2z(j);
      const hh = rockHeight(rk, x, z);
      if (hh <= 0) continue;
      const crack = RK_CRACK;
      const tone = RK_TONE;
      const nx = -(rockHeight(rk, x + d, z) - rockHeight(rk, x - d, z)) / (2 * d);
      const nz = -(rockHeight(rk, x, z + d) - rockHeight(rk, x, z - d)) / (2 * d);
      const nl = 1 / Math.sqrt(1 + nx * nx + nz * nz);
      const lam = clamp01((nx * SUN.x + SUN.y + nz * SUN.z) * nl);
      const grain = ridged(x * 2.2, z * 2.2, 71, 3);
      const rough = vnoise(x * 6, z * 6, 74) * 0.5 + vnoise(x * 14, z * 14, 75) * 0.5;
      const k = 0.3 + tone * 0.45 + grain * 0.25 + (rough - 0.5) * 0.25;
      let r = lerp(C.rockDark[0], C.rockLight[0], k);
      let g = lerp(C.rockDark[1], C.rockLight[1], k);
      let b = lerp(C.rockDark[2], C.rockLight[2], k);
      // hơi ấm / lạnh theo khối
      r *= 1.03 + (tone - 0.5) * 0.08;
      b *= 0.97 - (tone - 0.5) * 0.06;
      // rêu / địa y trên mặt hướng lên
      const lich = sstep(0.6, 0.78, fbm(x * 1.4, z * 1.4, 72, 3)) * Math.pow(nl, 3) * 0.75;
      r = lerp(r, C.lichen[0], lich);
      g = lerp(g, C.lichen[1], lich);
      b = lerp(b, C.lichen[2], lich);
      const sh = samp(ShadowSoft, x, z);
      const light = (0.28 + 1.1 * lam) * (0.72 + 0.28 * sh) * (1 - crack * 0.55) * (0.9 + 0.2 * vnoise(x * 12, z * 12, 73));
      const a = sstep(0, 0.08, hh);
      const o = (j * NW + i) * 3;
      img[o] = lerp(img[o], r * light, a);
      img[o + 1] = lerp(img[o + 1], g * light, a);
      img[o + 2] = lerp(img[o + 2], b * light, a);
    }
}
log("đá");

// ------------------------------------------------------------------ 4b. cầu gỗ
for (const br of bridges) {
  const ext = Math.hypot(br.len, br.wid) / 2 + 1;
  const i0 = Math.max(0, Math.floor((br.cx - ext + map.halfW) * PPM));
  const i1 = Math.min(NW - 1, Math.ceil((br.cx + ext + map.halfW) * PPM));
  const j0 = Math.max(0, Math.floor((br.cz - ext + map.halfH) * PPM));
  const j1 = Math.min(NH - 1, Math.ceil((br.cz + ext + map.halfH) * PPM));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = px2x(i);
      const z = px2z(j);
      const uv = onBridge(br, x, z);
      if (!uv) continue;
      const [u, v] = uv;
      const halfW = br.wid / 2;
      let r: number;
      let g: number;
      let b: number;
      let light = 1;
      const plank = 0.55; // bề rộng ván (m)
      const pu = u / plank;
      const pi = Math.floor(pu);
      const gap = Math.abs(pu - pi - 0.5) > 0.44;
      if (Math.abs(v) > halfW - 0.45) {
        // dầm biên hai bên
        r = C.woodDark[0];
        g = C.woodDark[1];
        b = C.woodDark[2];
        light = Math.abs(v) > halfW - 0.2 ? 0.75 : 1.05;
      } else {
        const tone = 0.85 + hash(pi, 0, 41) * 0.3;
        const grain = 0.88 + vnoise(v * 1.5, u * 18, 42 + pi) * 0.22;
        r = C.wood[0] * tone * grain;
        g = C.wood[1] * tone * grain;
        b = C.wood[2] * tone * grain;
        if (gap) light = 0.45;
      }
      // mố đá hai đầu cầu
      if (Math.abs(u) > br.len / 2 - 1.2) {
        const s = 0.85 + vnoise(x * 3, z * 3, 43) * 0.3;
        r = C.stone[0] * s;
        g = C.stone[1] * s;
        b = C.stone[2] * s;
        light = 1;
      }
      const o = (j * NW + i) * 3;
      img[o] = r * light * 1.05;
      img[o + 1] = g * light * 1.05;
      img[o + 2] = b * light * 1.05;
    }
}
log("cầu");

// ------------------------------------------------------------------ 4c. cây: tán ghép từ nhiều khối cầu, từ Bắc xuống Nam
trees.sort((a, b) => a.z - b.z);
for (const t of trees) {
  const rr = t.r * 1.15;
  const i0 = Math.max(0, Math.floor((t.x - rr + map.halfW) * PPM));
  const i1 = Math.min(NW - 1, Math.ceil((t.x + rr + map.halfW) * PPM));
  const j0 = Math.max(0, Math.floor((t.z - rr + map.halfH) * PPM));
  const j1 = Math.min(NH - 1, Math.ceil((t.z + rr + map.halfH) * PPM));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = px2x(i) - t.x;
      const z = px2z(j) - t.z;
      // khối cầu cao nhất tại điểm này
      let best = -1;
      let bnx = 0;
      let bnz = 0;
      let bny = 1;
      let bt = 1;
      let bq = 1;
      for (const L of t.lobes) {
        const dx = (x - L.ox) / L.r;
        const dz = (z - L.oz) / L.r;
        const q = dx * dx + dz * dz;
        if (q >= 1) continue;
        const ny = Math.sqrt(1 - q);
        const top = L.h * (0.6 + 0.4 * ny);
        if (top > best) {
          best = top;
          bnx = dx;
          bnz = dz;
          bny = ny;
          bt = L.t;
          bq = q;
        }
      }
      if (best < 0) continue;
      // vân lá: đẩy pháp tuyến theo nhiễu nhỏ
      const lx = (vnoise((x + t.x) * 3.2, (z + t.z) * 3.2, 51) - 0.5) * 0.9;
      const lz = (vnoise((x + t.x) * 3.2 + 9, (z + t.z) * 3.2, 52) - 0.5) * 0.9;
      const nx = bnx + lx;
      const nz = bnz + lz;
      const nl = 1 / Math.sqrt(nx * nx + bny * bny + nz * nz);
      const lam = clamp01((nx * SUN.x + bny * SUN.y + nz * SUN.z) * nl);
      worley((x + t.x) * 2.4, (z + t.z) * 2.4, 53); // chùm lá
      const clump = 0.8 + 0.3 * sstep(0.7, 0.15, W1);
      const light = (0.28 + 0.95 * lam) * clump * bt * (0.75 + 0.25 * best);
      const edge = sstep(1, 0.86, bq); // mép khối mềm
      const o = (j * NW + i) * 3;
      img[o] = lerp(img[o], t.col[0] * light, edge);
      img[o + 1] = lerp(img[o + 1], t.col[1] * light, edge);
      img[o + 2] = lerp(img[o + 2], t.col[2] * light * 0.95, edge);
    }
}
log("cây");

// ------------------------------------------------------------------ ghi PNG (zlib có sẵn trong Node), kèm ảnh xem trước nhỏ
function writePng(path: string, w: number, h: number, get: (i: number, j: number, c: number) => number): void {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let j = 0; j < h; j++) {
    raw[j * (w * 3 + 1)] = 0;
    for (let i = 0; i < w; i++)
      for (let c = 0; c < 3; c++) {
        // nắn màu nhẹ: tăng tương phản, ấm hơn một chút
        let v = get(i, j, c);
        v = Math.pow(clamp01(v), 0.95);
        raw[j * (w * 3 + 1) + 1 + i * 3 + c] = Math.round(clamp01(v) * 255);
      }
  }
  const CRC = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (buf: Buffer): number => {
    let c = -1;
    for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}
writePng(OUT, NW, NH, (i, j, c) => img[(j * NW + i) * 3 + c]);
// ảnh xem trước 1/2 (lấy trung bình 2×2)
const PW = Math.floor(NW / 2);
const PH = Math.floor(NH / 2);
writePng(OUT.replace(/\.png$/, "-preview.png"), PW, PH, (i, j, c) => {
  const a = (2 * j * NW + 2 * i) * 3 + c;
  return (img[a] + img[a + 3] + img[a + NW * 3] + img[a + NW * 3 + 3]) / 4;
});
log(`xong: ${OUT} (${NW}×${NH}) + ảnh xem trước ${PW}×${PH}`);
