/**
 * THỬ NGHIỆM (chưa vào game): vẽ ảnh mặt đất nhìn từ trên xuống HOÀN TOÀN BẰNG CODE từ GameMap,
 * để đánh giá phương án 1 của B8 (Docs/MAPS_PLAN.md mục 7). Không dùng ảnh hay tài nguyên nào.
 *   npx tsx src/tools/paint-ground-demo.ts <out.png> [cỡ ảnh]
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { getMap } from "../sim/maps";

type RGB = [number, number, number];
const out = process.argv[2] ?? "ground.png";
const N = Number(process.argv[3] ?? 1200);
const map = getMap("iron-valley");
const W = map.w;
const t0 = performance.now();

// ------------------------------------------------------------------ nhiễu (chỉ phần vẽ, không cần tất định)
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, s: number, oct = 4): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, s + i * 31);
    f *= 2.03;
    amp *= 0.5;
  }
  return v / (1 - Math.pow(0.5, oct));
}
/** Nhiễu ô (Worley): khoảng cách tới điểm hạt gần nhất và gần nhì — làm vân nứt cho đá. */
function worley(x: number, y: number, s: number): [number, number] {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const px = xi + i + hash(xi + i, yi + j, s), py = yi + j + hash(xi + i, yi + j, s + 7);
      const d = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return [d1, d2];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ vùng mẫu (rừng, đường, bùn) — đối xứng 180°
type P = [number, number];
const sym = <T extends { x: number; z: number }>(a: T[]): T[] => [...a, ...a.map((o) => ({ ...o, x: -o.x, z: -o.z }))];
const FORESTS = sym([
  { x: -64, z: -20, r: 9 }, { x: -40, z: 30, r: 7 }, { x: -18, z: 52, r: 8 }, { x: -70, z: 46, r: 6 },
  { x: -46, z: -46, r: 6 }, { x: 12, z: 66, r: 7 }, { x: -24, z: 10, r: 5 }
]);
const MUDS = sym([{ x: -52, z: 12, r: 6 }, { x: -12, z: 36, r: 5 }, { x: -66, z: 66, r: 7 }]);
const roadsHalf: P[][] = [
  [[-58, 58], [-40, 50], [-10, 48], [18, 50], [36, 42], [39.6, 39.6]],
  [[-58, 58], [-60, 30], [-56, 0], [-46, -26], [-39.6, -39.6]]
];
const ROADS: P[][] = [...roadsHalf, ...roadsHalf.map((r) => r.map(([x, z]) => [-x, -z] as P))];
function distSeg(x: number, z: number, a: P, b: P): number {
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const t = clamp01(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez));
  return Math.sqrt((a[0] + ex * t - x) ** 2 + (a[1] + ez * t - z) ** 2);
}
const roadDist = (x: number, z: number): number => {
  let d = 99;
  for (const r of ROADS) for (let i = 0; i + 1 < r.length; i++) d = Math.min(d, distSeg(x, z, r[i], r[i + 1]));
  return d;
};

// ------------------------------------------------------------------ lưới độ cao theo điểm ảnh (bóng nắng, bóng đổ)
const px = W / N;
const wx = (i: number): number => -map.halfW + (i + 0.5) * px;
const wz = (j: number): number => -map.halfH + (j + 0.5) * px;
const H = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = map.terrainHeight(wx(i), wz(j));
// làm mượt độ cao CHỈ cho phần tô bóng (độ cao của sim đổi bậc ở mép bãi cạn → vết gãy khi tính bóng)
function blur(src: Float32Array, r: number): Float32Array {
  const a = new Float32Array(src.length), b = new Float32Array(src.length);
  for (let j = 0; j < N; j++) { let acc = 0; for (let i = -r; i <= r; i++) acc += src[j * N + Math.min(N - 1, Math.max(0, i))];
    for (let i = 0; i < N; i++) { a[j * N + i] = acc / (2 * r + 1); acc += src[j * N + Math.min(N - 1, i + r + 1)] - src[j * N + Math.max(0, i - r)]; } }
  for (let i = 0; i < N; i++) { let acc = 0; for (let j = -r; j <= r; j++) acc += a[Math.min(N - 1, Math.max(0, j)) * N + i];
    for (let j = 0; j < N; j++) { b[j * N + i] = acc / (2 * r + 1); acc += a[Math.min(N - 1, j + r + 1) * N + i] - a[Math.max(0, j - r) * N + i]; } }
  return b;
}
const HS = blur(blur(H, 3), 3);
const hAt = (i: number, j: number): number => HS[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
// nắng từ góc trên trái (Tây Bắc), cao ~45°
const L = (() => { const v = [-0.55, 0.75, -0.55]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / l); })();
const SUN_TAN = 0.95;

// ------------------------------------------------------------------ bảng màu
const C = {
  grassA: [86, 124, 48] as RGB, grassB: [122, 152, 60] as RGB, dry: [146, 132, 80] as RGB, dirt: [126, 100, 66] as RGB,
  mud: [98, 76, 50] as RGB, wet: [64, 52, 38] as RGB,
  deep: [22, 78, 104] as RGB, shallowW: [54, 132, 140] as RGB, foam: [205, 228, 226] as RGB, fordStone: [150, 150, 136] as RGB,
  rock: [128, 126, 120] as RGB, rockDark: [64, 62, 60] as RGB, moss: [88, 108, 58] as RGB,
  road: [134, 128, 116] as RGB, roadEdge: [104, 94, 80] as RGB, cliff: [118, 106, 92] as RGB,
  plank: [128, 96, 62] as RGB, plankDark: [78, 56, 36] as RGB, rail: [70, 70, 72] as RGB,
  ore: [92, 84, 80] as RGB, oreGlint: [178, 150, 120] as RGB, oil: [24, 22, 26] as RGB
};

const img = new Float32Array(N * N * 3);
const bridges = map.crossings().filter((c) => c.def.kind === "bridge");

for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) {
    const x = wx(i), z = wz(j);
    // làm méo tọa độ (domain warp) để mép các vùng lượn tự nhiên
    const qx = x + (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 5;
    const qz = z + (fbm(x * 0.07, z * 0.07, 9) - 0.5) * 5;
    const fine = vnoise(x * 3.1, z * 3.1, 5) - 0.5;

    // nền cỏ: hai sắc xanh + mảng cỏ khô / đất trống tần số thấp + hạt mịn
    let col = mix(C.grassA, C.grassB, 0.25 + 0.5 * sstep(0.35, 0.65, fbm(x * 0.05, z * 0.05, 1)));
    col = mix(col, [104, 140, 46], 0.5 * sstep(0.45, 0.75, fbm(x * 0.35, z * 0.35, 3, 3))); // các bụi cỏ
    col = mix(col, C.dry, 0.6 * sstep(0.62, 0.7, fbm(qx * 0.04, qz * 0.04, 2)));
    col = mix(col, C.dirt, 0.75 * sstep(0.74, 0.8, fbm(qx * 0.07, qz * 0.07, 4)));
    col = mul(col, 1 + fine * 0.16 + (vnoise(x * 9, z * 9, 6) - 0.5) * 0.14 + (vnoise(x * 22, z * 22, 7) - 0.5) * 0.1);
    if (hash(Math.floor(x * 4), Math.floor(z * 4), 8) > 0.985) col = mix(col, [170, 165, 150], 0.6); // sỏi

    // bùn mẫu
    for (const m of MUDS) {
      const d = Math.hypot(qx - m.x, qz - m.z) / (m.r * (0.85 + fbm(x * 0.25, z * 0.25, 13) * 0.35));
      if (d < 1.05) {
        const [c1, c2] = worley(x * 0.8, z * 0.8, 15);
        let mud = mix(C.mud, C.wet, sstep(0.35, 0.65, fbm(x * 0.4, z * 0.4, 12)));
        mud = mul(mud, 0.9 + (vnoise(x * 5, z * 5, 16) - 0.5) * 0.25);
        if (c2 - c1 < 0.06) mud = mix(mud, [128, 104, 72], 0.5); // nứt khô
        if (fbm(x * 0.5, z * 0.5, 17) > 0.7) mud = mix(mud, [70, 82, 84], 0.55); // vũng nước
        col = mix(col, mud, sstep(1.05, 0.92, d));
      }
    }

    // đường đất: lõi sỏi, mép đất, vệt bánh xe
    const rd = roadDist(qx * 0.3 + x * 0.7, qz * 0.3 + z * 0.7);
    if (rd < 2.6) {
      const k = sstep(2.6, 1.6, rd);
      let road = mix(C.roadEdge, C.road, sstep(2.0, 0.6, rd));
      road = mul(road, 1 + (vnoise(x * 6, z * 6, 14) - 0.5) * 0.3 + (vnoise(x * 18, z * 18, 15) - 0.5) * 0.18);
      if (hash(Math.floor(x * 5), Math.floor(z * 5), 18) > 0.95) road = mul(road, 0.75);
      if (Math.abs(rd - 0.9) < 0.18) road = mul(road, 0.85);
      col = mix(col, road, k);
    }

    // sông: bờ bùn ẩm → nước nông có bọt → nước sâu
    const wa = map.waterAt(qx, qz, true);
    let onWater = false;
    let onRock = 0;
    if (wa) {
      const R = map.def.rivers[0];
      const d = wa.dist + (fine * 1.4);
      const bankK = sstep(R.bank + 0.5, R.half + 1.5, d);
      col = mix(col, mix(C.mud, C.wet, sstep(R.bank, R.half, d)), bankK);
      if (d < R.half + 0.4) {
        const ford = wa.crossing?.kind === "ford";
        const depth = sstep(R.half + 0.4, ford ? R.half : 1.5, d);
        let water = mix(C.shallowW, ford ? mix(C.shallowW, C.fordStone, 0.35) : C.deep, depth);
        // gợn sóng theo dòng chảy
        const flow = (x + z) * 0.7;
        water = mul(water, 1 + (fbm(flow * 0.5, (x - z) * 1.6, 21, 3) - 0.5) * 0.22);
        if (ford && hash(Math.floor(x * 2.2), Math.floor(z * 2.2), 30) > 0.8) water = mix(water, C.fordStone, 0.45);
        const shore = sstep(0.9, 0, Math.abs(d - (R.half + 0.1)) - fbm(x * 0.8, z * 0.8, 25) * 0.6);
        water = mix(water, C.foam, shore * 0.55);
        if (hash(Math.floor(x * 6), Math.floor(z * 6), 33) > 0.996) water = mix(water, [235, 245, 245], 0.8); // lấp lánh
        col = water;
        onWater = true;
      }
    }

    // mỏm đá: vân đá nứt, rêu, viền tối
    for (const b of map.rocks) {
      const dd = Math.hypot(x - b.x, z - b.z);
      // chân đá: đất và đá vụn trên sườn dốc (thay viền cỏ sáng)
      if (dd < b.r + 2.2) {
        col = mix(col, mul(C.dirt, 0.9), 0.55 * sstep(b.r + 2.2, b.r + 0.5, dd));
        if (hash(Math.floor(x * 3), Math.floor(z * 3), 44) > 0.93) col = mix(col, C.rock, 0.7);
      }
      const d = dd / (b.r * (0.95 + (fbm(x * 0.45, z * 0.45, 40) - 0.5) * 0.55));
      if (d < 1.05) {
        const [d1, d2] = worley(x * 0.55, z * 0.55, 41);
        const [e1, e2] = worley(x * 1.7, z * 1.7, 45);
        let rock = mix(C.rock, [140, 128, 112], hash(Math.floor(x * 0.55 + 99), Math.floor(z * 0.55), 46) * 0.6);
        rock = mul(rock, 0.78 + fbm(x * 0.9, z * 0.9, 42) * 0.4);
        rock = mix(rock, C.rockDark, sstep(0.07, 0.0, d2 - d1) * 0.85);
        rock = mix(rock, C.rockDark, sstep(0.05, 0.0, e2 - e1) * 0.35);
        rock = mix(rock, C.moss, 0.45 * sstep(0.66, 0.78, fbm(x * 0.6, z * 0.6, 43)));
        const k = sstep(1.05, 0.93, d);
        col = mix(col, rock, k);
        onRock = Math.max(onRock, k);
      }
    }

    // vách núi quanh rìa
    const inset = map.inset(x, z);
    if (inset < 8) {
      const [b1, b2] = worley(x * 0.5, z * 0.5, 51);
      let cliff = mul(C.cliff, 0.7 + fbm(x * 0.7, z * 0.7, 50) * 0.45);
      cliff = mix(cliff, C.rockDark, sstep(0.08, 0, b2 - b1) * 0.8);
      col = mix(col, cliff, sstep(7.5, 5, inset + (fbm(x * 0.2, z * 0.2, 52) - 0.5) * 4));
      col = mul(col, 0.55 + 0.45 * sstep(0, 4, inset)); // mép ngoài tối dần
    }

    // mỏ Sắt (đống quặng) và giàn Dầu (vũng dầu)
    for (const m of map.mines) {
      const d = Math.hypot(qx - m.x, qz - m.z);
      if (m.res === "iron" && d < 4.6) {
        // bãi quặng: từng cục đá sắt, có cục gỉ cam, mặt sáng phía trên trái
        const cx = x * 1.6, cz = z * 1.6;
        const [d1, d2] = worley(cx, cz, 60);
        const tone = hash(Math.floor(cx + 0.5), Math.floor(cz + 0.5), 62);
        let ore = tone > 0.7 ? [150, 86, 46] as RGB : mix(C.ore, [60, 56, 58], tone);
        ore = mul(ore, 0.8 + sstep(0.5, 0, d1) * 0.45);
        ore = mix(ore, [40, 36, 34], sstep(0.06, 0, d2 - d1));
        col = mix(col, ore, sstep(4.6, 3.4, d + fine * 1.5));
      } else if (m.res === "oil" && d < 3.6) {
        const sheen = fbm(x * 1.3, z * 1.3, 61);
        let oil = mix(C.oil, [52, 40, 70], sstep(0.55, 0.75, sheen) * 0.7);
        const ring = sstep(0.8, 0, Math.abs(d - 3.0));
        oil = mix(oil, [70, 96, 90], ring * 0.35); // ánh dầu loang ở mép
        col = mix(col, oil, sstep(3.6, 3.0, d + fine));
      }
    }

    // bóng nắng theo độ dốc (hillshade) + bóng đổ (dò về phía mặt trời trên lưới độ cao)
    const h = HS[j * N + i];
    const gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * px);
    const gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * px);
    const nl = Math.hypot(gx, 1, gz);
    const lam = (-gx * L[0] + L[1] - gz * L[2]) / nl;
    // đá: tương phản sáng tối mạnh hơn để thấy khối; mặt nước phẳng: không nhận bóng địa hình bên dưới
    let shade = onWater ? 1 : 0.45 + 0.75 * lam + onRock * (lam - 0.75) * 1.1;
    for (let s = 1; s <= 14 && !onWater; s++) {
      const dd = s * 0.6;
      const si = Math.round(i + (L[0] / Math.hypot(L[0], L[2])) * dd / px);
      const sj = Math.round(j + (L[2] / Math.hypot(L[0], L[2])) * dd / px);
      if (hAt(si, sj) > h + dd * SUN_TAN + 0.05) { shade *= 0.62; break; }
    }
    col = mul(col, shade);
    const o = (j * N + i) * 3;
    img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
  }

// ------------------------------------------------------------------ cầu: mặt ván dọc lối qua, lan can, bóng trên nước
const toPx = (x: number): number => (x + map.halfW) / px;
for (const c of bridges) {
  const R = c.river;
  const ax = -c.dirZ, az = c.dirX; // trục cầu: vuông góc dòng sông
  const len = R.bank + 1.5, half = 2.6;
  const cx0 = toPx(c.def.x), cz0 = toPx(c.def.z);
  const ext = Math.ceil((len + 4) / px);
  for (let j = Math.floor(cz0 - ext); j <= cz0 + ext; j++)
    for (let i = Math.floor(cx0 - ext); i <= cx0 + ext; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const dx = wx(i) - c.def.x, dz = wz(j) - c.def.z;
      const along = dx * ax + dz * az, across = dx * c.dirX + dz * c.dirZ;
      const o = (j * N + i) * 3;
      // bóng cầu đổ xuống nước (lệch về phía Đông Nam)
      const sa = (dx - 1.2) * ax + (dz - 1.2) * az, sc = (dx - 1.2) * c.dirX + (dz - 1.2) * c.dirZ;
      if (Math.abs(sa) < len && Math.abs(sc) < half && !(Math.abs(along) < len && Math.abs(across) < half))
        for (let k = 0; k < 3; k++) img[o + k] *= 0.6;
      if (Math.abs(along) < len && Math.abs(across) < half) {
        const plank = Math.abs(((along * 2.2) % 1 + 1) % 1 - 0.5) < 0.06;
        let col = mul(plank ? C.plankDark : C.plank, 0.85 + vnoise(along * 3, across * 0.6, 70) * 0.3);
        if (half - Math.abs(across) < 0.35) col = C.rail;
        img[o] = col[0] * 1.05; img[o + 1] = col[1] * 1.05; img[o + 2] = col[2] * 1.05;
      }
    }
}

// ------------------------------------------------------------------ cây: tán tròn sáng mé trên trái, bóng đổ Đông Nam
interface Tree { x: number; z: number; r: number; s: number }
const trees: Tree[] = [];
for (const f of FORESTS) {
  const step = 2.3;
  for (let gz = f.z - f.r - 2; gz <= f.z + f.r + 2; gz += step)
    for (let gx = f.x - f.r - 2; gx <= f.x + f.r + 2; gx += step) {
      const seed = Math.floor(gx * 13 + gz * 7);
      const x = gx + (hash(seed, 1, 80) - 0.5) * 1.8, z = gz + (hash(seed, 2, 80) - 0.5) * 1.8;
      const edge = Math.hypot(x - f.x, z - f.z) / (f.r * (0.8 + fbm(x * 0.2, z * 0.2, 81) * 0.45));
      if (edge > 1 || map.staticBlocked(x, z) || map.waterAt(x, z, true)) continue;
      trees.push({ x, z, r: 1.1 + hash(seed, 3, 80) * 0.9, s: seed });
    }
}
for (const pass of [0, 1])
  for (const t of trees) {
    const rr = (t.r + 0.2) / px;
    const cx = toPx(t.x) + (pass === 0 ? 1.3 / px : 0), cz = toPx(t.z) + (pass === 0 ? 1.3 / px : 0);
    for (let j = Math.floor(cz - rr); j <= cz + rr; j++)
      for (let i = Math.floor(cx - rr); i <= cx + rr; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const dx = (i - cx) * px, dz = (j - cz) * px;
        const lumpy = t.r * (0.88 + (vnoise(Math.atan2(dz, dx) * 2.5 + t.s, 0, 82) - 0.5) * 0.3);
        const d = Math.hypot(dx, dz);
        if (d > lumpy) continue;
        const o = (j * N + i) * 3;
        if (pass === 0) {
          for (let k = 0; k < 3; k++) img[o + k] *= 0.55;
          continue;
        }
        // tán cây: từng cụm lá, sáng ở mé trên trái
        const lit = clamp01(0.55 - (dx + dz) / (2.2 * t.r)) * 0.9 + 0.1;
        const clump = fbm(t.x * 3 + dx * 2.6, t.z * 3 + dz * 2.6, 83, 3);
        let col = mix([30, 58, 26], [92, 136, 50], clamp01(lit * 0.8 + (clump - 0.5) * 0.9));
        if (clump > 0.68 && lit > 0.5) col = mix(col, [150, 168, 72], 0.5);
        col = mul(col, 1 - sstep(0.7, 1, d / lumpy) * 0.35);
        img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
      }
  }

const ms = performance.now() - t0;

// ------------------------------------------------------------------ ghi PNG (zlib có sẵn trong Node)
const raw = Buffer.alloc(N * (N * 3 + 1));
for (let j = 0; j < N; j++) {
  raw[j * (N * 3 + 1)] = 0;
  for (let i = 0; i < N * 3; i++) raw[j * (N * 3 + 1) + 1 + i] = Math.max(0, Math.min(255, Math.round(img[j * N * 3 + i])));
}
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b: Buffer): number => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log(`${N}×${N} px, ${trees.length} cây, vẽ mất ${ms.toFixed(0)} ms`);
