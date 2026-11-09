/**
 * Lớp chi tiết của Siêu Tàu Sân Bay (người dùng 09/11/2026: mỗi mét vuông đều phải có giá trị). Mọi chi tiết là một hệ thống
 * có lý do tồn tại: đường ghép tấm, cửa sổ, khoang chứa, cáp hãm, đèn dẫn đáp, ô đỗ, ống phóng tên lửa, xe kéo, thủy thủ.
 * Chi tiết lặp lại được gộp thành một khối cho mỗi loại (`Batch`), nên hàng nghìn món vẫn chỉ tốn vài lệnh vẽ.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { facets, part, type Palette } from "../kit";

type Vec = readonly [number, number];

export interface CarrierLayout {
  deck: readonly Vec[];
  deckY: number;
  wx: number;
  lz: number;
  lanes: readonly { x: number; z: number; yaw: number; len: number }[];
  laneWidth: number;
  island: readonly [number, number, number, number];
  parked: readonly { x: number; z: number; yaw: number }[];
  elevators: readonly Vec[];
  guns: readonly Vec[];
  onDeck(x: number, z: number): boolean;
}

/** Gom nhiều khối cùng vật liệu thành một khối duy nhất. */
export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  constructor(
    private name: string,
    private mat: THREE.Material
  ) {}

  box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0): void {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.geos.push(g);
  }

  cyl(r: number, h: number, x: number, y: number, z: number, seg = 8): void {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y, z);
    this.geos.push(g);
  }

  ball(r: number, x: number, y: number, z: number): void {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.translate(x, y, z);
    this.geos.push(g);
  }

  /** Thanh nằm ngang nối hai điểm trên mặt phẳng (x, z). */
  line(x1: number, z1: number, x2: number, z2: number, y: number, w: number, h: number): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    this.box(w, h, Math.sqrt(dx * dx + dz * dz), (x1 + x2) / 2, y, (z1 + z2) / 2, Math.atan2(dx, dz));
  }

  addTo(root: THREE.Object3D): void {
    if (!this.geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(this.geos), this.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(part(this.name, m));
    for (const g of this.geos) g.dispose();
  }
}

let shared: { gold: THREE.Material; hull: THREE.Material; antifoul: THREE.Material; foam: THREE.Material; wake: THREE.Material; yellow: THREE.Material } | null = null;

/** Vật liệu riêng của tàu: sơn thân, chống hà, viền vàng, bọt sóng. */
export function carrierPaint(): NonNullable<typeof shared> {
  shared ??= {
    gold: new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 0.28, metalness: 0.95, flatShading: true }),
    hull: new THREE.MeshStandardMaterial({ color: 0x3b4149, roughness: 0.5, metalness: 0.55, flatShading: true }),
    antifoul: new THREE.MeshStandardMaterial({ color: 0x70302a, roughness: 0.75, metalness: 0.1, flatShading: true }),
    foam: new THREE.MeshStandardMaterial({ color: 0xf2f7fa, roughness: 0.8, transparent: true, opacity: 0.75, depthWrite: false }),
    wake: new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.8, transparent: true, opacity: 0.3, depthWrite: false }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe0b526, roughness: 0.55, metalness: 0.2, flatShading: true })
  };
  return shared;
}

/** Đường mạn tàu (nửa bề rộng): nội suy theo chiều dọc `z` và chiều cao `t` (0 = mặt nước, 1 = sát boong). Tọa độ gốc chưa nhân hệ số dáng. */
const WATERLINE: readonly Vec[] = [[-41, 7], [-22, 10], [10, 10], [33, 4.5], [41, 0]];
const TOPLINE: readonly Vec[] = [[-44, 10.5], [-20, 12.2], [14, 12.2], [38, 7.8], [48, 5.3]];
function along(line: readonly Vec[], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 0; i + 1 < line.length; i++) {
    const [z0, x0] = line[i];
    const [z1, x1] = line[i + 1];
    if (z <= z1) return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0);
  }
  return line[line.length - 1][1];
}
const hullHalf = (z: number, t: number): number => along(WATERLINE, z) * (1 - t) + along(TOPLINE, z) * t;

function addHull(root: THREE.Object3D, p: Palette, L: CarrierLayout): void {
  const paint = carrierPaint();
  const seams = new Batch("Đường ghép tấm vỏ", p.metal);
  const ports = new Batch("Cửa sổ thân tàu", p.glass);
  const band = new Batch("Sơn chống hà", paint.antifoul);
  const gold = new Batch("Viền vàng thân tàu", paint.gold);
  const top = L.deckY - 0.4;
  const X = (z: number, t: number): number => hullHalf(z, t) * L.wx;
  for (const side of [-1, 1]) {
    for (let z = -40; z < 38; z += 3) {
      const a = z * L.lz;
      const b = (z + 3) * L.lz;
      for (const t of [0.34, 0.6, 0.8]) seams.line(side * (X(z, t) + 0.03), a, side * (X(z + 3, t) + 0.03), b, t * top, 0.05, 0.05);
      band.line(side * (X(z, 0.09) + 0.03), a, side * (X(z + 3, 0.09) + 0.03), b, 0.09 * top + 0.05, 0.08, 1.1);
      gold.line(side * (X(z, 0.93) + 0.04), a, side * (X(z + 3, 0.93) + 0.04), b, 0.93 * top, 0.06, 0.1);
    }
    for (let z = -39; z < 36; z += 6) {
      const lean = X(z, 0.95) - X(z, 0.15);
      const span = 0.8 * top;
      seams.box(0.05, Math.sqrt(span * span + lean * lean), 0.05, side * (X(z, 0.55) + 0.04), 0.55 * top, z * L.lz, 0, -side * Math.atan2(lean, span));
    }
    for (let z = -38; z < 35; z += 1.5) ports.box(0.05, 0.24, 0.24, side * (X(z, 0.86) + 0.04), 0.86 * top, z * L.lz);
    // neo và lỗ xích ở hai bên mũi
    const nx = X(30, 0.62);
    seams.box(0.14, 1.0, 0.9, side * (nx + 0.08), 0.62 * top, 30 * L.lz);
    gold.box(0.16, 0.12, 1.04, side * (nx + 0.08), 0.62 * top + 0.55, 30 * L.lz);
  }
  // khoang chứa máy bay sáng đèn phía sau mỗi thang nâng
  const frame = new Batch("Khung khoang chứa máy bay", p.hullDark);
  const glow = new Batch("Khoang chứa máy bay sáng đèn", p.teamGlow);
  for (const [ex, ez] of L.elevators) {
    const side = ex > 0 ? 1 : -1;
    const z = ez / L.lz;
    const x = side * (X(z, 0.7) + 0.05);
    frame.box(0.1, 2.5, 7.2, x, 0.7 * top, ez);
    glow.box(0.12, 1.9, 6.4, x + side * 0.03, 0.7 * top, ez);
    for (let k = -2; k <= 2; k++) frame.box(0.14, 2.0, 0.12, x + side * 0.06, 0.7 * top, ez + k * 1.5);
  }
  // huy hiệu ở mũi, cửa thuyền và huy hiệu ở đuôi
  const bowZ = 54.1;
  gold.box(0.9, 0.9, 0.1, 0, 5.3, bowZ, 0, Math.PI / 4);
  glow.box(0.42, 0.42, 0.14, 0, 5.3, bowZ + 0.03, 0, Math.PI / 4);
  const sternZ = -44 * L.lz - 0.02;
  for (const x of [-4.4, 0, 4.4]) {
    frame.box(3.3, 1.7, 0.1, x, 4.5, sternZ);
    glow.box(2.9, 1.3, 0.12, x, 4.5, sternZ - 0.03);
  }
  gold.box(1.5, 1.5, 0.1, 0, 2.5, sternZ + 0.9, 0, Math.PI / 4);
  for (const b of [seams, ports, band, gold, frame, glow]) b.addTo(root);
}

function addEdge(root: THREE.Object3D, p: Palette, L: CarrierLayout): void {
  const paint = carrierPaint();
  const rails = new Batch("Lan can mép boong", p.metal);
  const rafts = new Batch("Thùng phao cứu sinh", p.white);
  const gold = new Batch("Viền vàng mép boong", paint.gold);
  const y = L.deckY;
  for (let i = 0; i < L.deck.length; i++) {
    const [x1, z1] = L.deck[i];
    const [x2, z2] = L.deck[(i + 1) % L.deck.length];
    const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    let nx = uz;
    let nz = -ux;
    if (L.onDeck((x1 + x2) / 2 + nx, (z1 + z2) / 2 + nz)) {
      nx = -nx;
      nz = -nz;
    }
    gold.line(x1, z1, x2, z2, y + 0.09, 0.14, 0.03);
    rails.line(x1 + nx * 0.42, z1 + nz * 0.42, x2 + nx * 0.42, z2 + nz * 0.42, y + 0.3, 0.05, 0.05);
    for (let d = 0.8; d < len; d += 1.6) rails.box(0.05, 0.75, 0.05, x1 + ux * d + nx * 0.42, y - 0.08, z1 + uz * d + nz * 0.42);
    for (let d = 2.5; d < len - 1; d += 5) rafts.box(0.5, 0.42, 1.1, x1 + ux * d + nx * 0.45, y - 0.72, z1 + uz * d + nz * 0.45, Math.atan2(ux, uz));
  }
  // viền vàng quanh sàn đài pháo và thang nâng
  for (const [x, z] of L.guns) {
    const yy = y - 1.05;
    gold.box(3.5, 0.05, 0.08, x, yy, z + 1.9);
    gold.box(3.5, 0.05, 0.08, x, yy, z - 1.9);
    gold.box(0.08, 0.05, 3.9, x + 1.72, yy, z);
    gold.box(0.08, 0.05, 3.9, x - 1.72, yy, z);
  }
  const hazard = new Batch("Vạch cảnh báo thang nâng", p.warning);
  for (const [x, z] of L.elevators) {
    for (const s of [-1, 1]) hazard.box(5.4, 0.03, 0.18, x, y + 0.05, z + s * 3.92);
    for (const s of [-1, 1]) hazard.box(0.18, 0.03, 8, x + s * 2.62, y + 0.05, z);
  }
  for (const b of [rails, rafts, gold, hazard]) b.addTo(root);
}

function addDeck(root: THREE.Object3D, p: Palette, L: CarrierLayout): void {
  const paint = carrierPaint();
  const y = L.deckY;
  const reserved: { x: number; z: number; r: number }[] = [];
  const laneHit = (x: number, z: number, r: number): boolean =>
    L.lanes.some((l) => {
      const sin = Math.sin(l.yaw);
      const cos = Math.cos(l.yaw);
      const a = (x - l.x) * sin + (z - l.z) * cos;
      const c = (x - l.x) * cos - (z - l.z) * sin;
      return Math.abs(c) < L.laneWidth / 2 + r && a > -1 - r && a < l.len + 1 + r;
    });
  const [ix0, ix1, iz0, iz1] = L.island;
  const free = (x: number, z: number, r: number): boolean => {
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].every(([ox, oz]) => L.onDeck(x + ox, z + oz))) return false;
    if (laneHit(x, z, r)) return false;
    if (x > ix0 - r && x < ix1 + r && z > iz0 - r && z < iz1 + r) return false;
    if (L.parked.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < (r + 2.5) ** 2)) return false;
    return !reserved.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < (r + s.r) ** 2);
  };

  // ống phóng tên lửa thẳng đứng: khối lớn nên đặt trước, chọn chỗ trống đầu tiên từ mũi và từ đuôi
  const vlsBase = new Batch("Bệ ống phóng tên lửa", p.hull);
  const vlsHatch = new Batch("Nắp ống phóng tên lửa", p.metal);
  const vlsGlow = new Batch("Đèn ống phóng tên lửa", p.teamGlow);
  const placeVls = (zs: number[]): void => {
    for (const z of zs)
      for (let x = 8; x > -18; x -= 1) {
        if (!free(x, z, 3.1)) continue;
        reserved.push({ x, z, r: 3.1 });
        vlsBase.box(4.1, 0.14, 5.3, x, y + 0.1, z);
        for (let i = -2; i <= 2; i++)
          for (let k = -3; k <= 3; k++) {
            vlsHatch.box(0.62, 0.05, 0.62, x + i * 0.76, y + 0.2, z + k * 0.72);
            vlsGlow.box(0.16, 0.03, 0.16, x + i * 0.76, y + 0.24, z + k * 0.72);
          }
        return;
      }
  };
  placeVls([50, 46, 42, 38, 34, 30, 26, 22, 18]);
  placeVls([-48, -44, -40, -36, -32, -28, -24]);

  // ô đỗ từng máy bay, trụ tiếp liệu nằm ở phía đuôi máy bay
  const frames = new Batch("Ô đỗ máy bay", p.white);
  const fuelBase = new Batch("Trụ tiếp liệu", p.hullDark);
  const fuelCap = new Batch("Nắp trụ tiếp liệu", paint.gold);
  for (const s of L.parked) {
    const sin = Math.sin(s.yaw);
    const cos = Math.cos(s.yaw);
    const P = (a: number, b: number): Vec => [s.x + sin * a + cos * b, s.z + cos * a - sin * b];
    const corners: Vec[] = [P(3.5, 3), P(3.5, -3), P(-2.6, -3), P(-2.6, 3)];
    corners.forEach((c, i) => {
      const d = corners[(i + 1) % 4];
      if (L.onDeck(c[0], c[1]) && L.onDeck(d[0], d[1])) frames.line(c[0], c[1], d[0], d[1], y + 0.07, 0.07, 0.02);
    });
    const [fx, fz] = P(-2, 3.4);
    if (L.onDeck(fx, fz)) {
      fuelBase.cyl(0.2, 0.75, fx, y + 0.4, fz);
      fuelCap.cyl(0.24, 0.1, fx, y + 0.82, fz);
    }
  }

  // đường băng: đèn dẫn đáp, vạch ngưỡng; cáp hãm chỉ có ở đường băng xiên
  const lights = new Batch("Đèn dẫn đáp", p.teamGlow);
  const keys = new Batch("Vạch ngưỡng đường băng", p.white);
  const cables = new Batch("Cáp hãm máy bay", p.metal);
  const cableEnd = new Batch("Bộ hãm cáp", paint.yellow);
  L.lanes.forEach((l, index) => {
    const sin = Math.sin(l.yaw);
    const cos = Math.cos(l.yaw);
    const P = (a: number, c: number): Vec => [l.x + sin * a + cos * c, l.z + cos * a - sin * c];
    for (let a = 1.5; a < l.len; a += 3)
      for (const c of [-L.laneWidth / 2 - 0.16, L.laneWidth / 2 + 0.16]) {
        const [x, z] = P(a, c);
        lights.box(0.16, 0.06, 0.34, x, y + 0.08, z, l.yaw);
      }
    for (let c = -L.laneWidth / 2 + 0.5; c < L.laneWidth / 2 - 0.3; c += 0.72) {
      const [x, z] = P(1.8, c);
      keys.box(0.36, 0.02, 2.4, x, y + 0.1, z, l.yaw);
    }
    if (index === 1)
      for (const a of [7.5, 12, 16.5, 21]) {
        const [x1, z1] = P(a, -L.laneWidth / 2);
        const [x2, z2] = P(a, L.laneWidth / 2);
        cables.line(x1, z1, x2, z2, y + 0.14, 0.06, 0.06);
        for (const [hx, hz] of [P(a, -L.laneWidth / 2 - 0.5), P(a, L.laneWidth / 2 + 0.5)]) cableEnd.box(0.8, 0.24, 0.5, hx, y + 0.17, hz, l.yaw);
      }
  });

  // tấm boong và điểm móc xích trên phần trống, lấp mọi khoảng còn lại
  const plateA = new Batch("Tấm boong chống trượt", p.concreteDark);
  const plateB = new Batch("Tấm boong gia cường", p.hull);
  const ties = new Batch("Điểm móc xích", p.metal);
  let cell = 0;
  for (let z = -52; z < 58; z += 4)
    for (let x = -22; x < 13; x += 4) {
      // tấm boong là mặt sàn nên nằm được cả dưới máy bay, chỉ cần tránh đường băng và đài chỉ huy
      if (![[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]].every(([ox, oz]) => L.onDeck(x + ox, z + oz)) || laneHit(x, z, 1.75)) continue;
      if (x > ix0 - 1.75 && x < ix1 + 1.75 && z > iz0 - 1.75 && z < iz1 + 1.75) continue;
      cell++;
      if (cell % 3 === 0) plateA.box(3.5, 0.02, 3.5, x, y + 0.06, z);
      else if (cell % 3 === 1) plateB.box(3.5, 0.02, 3.5, x, y + 0.06, z);
      ties.box(0.16, 0.04, 0.16, x - 1.9, y + 0.07, z - 1.9);
    }

  // xe kéo, xe tiếp đạn và thủy thủ: cho thấy tỉ lệ khổng lồ và một boong đang làm việc
  const tugBody = new Batch("Xe kéo máy bay", paint.yellow);
  const tugDark = new Batch("Bánh xe kéo", p.rubber);
  const cart = new Batch("Xe chở đạn", p.white);
  const crewA = new Batch("Thủy thủ áo màu phe", p.team);
  const crewB = new Batch("Thủy thủ áo vàng", paint.yellow);
  const crewC = new Batch("Thủy thủ áo trắng", p.white);
  const heads = new Batch("Mũ thủy thủ", p.hullDark);
  let n = 0;
  for (let z = -46; z < 52; z += 3.1)
    for (let x = 11; x > -20; x -= 3.7) {
      n++;
      if (n % 4 === 1 && free(x, z, 1.3)) {
        reserved.push({ x, z, r: 1.3 });
        const ry = ((n * 37) % 180) * (Math.PI / 180);
        if (n % 8 === 1) {
          tugBody.box(1.1, 0.5, 2, x, y + 0.45, z, ry);
          tugBody.box(0.9, 0.5, 0.7, x, y + 0.9, z, ry);
          for (const s of [-1, 1]) for (const f of [-0.65, 0.65]) tugDark.box(0.2, 0.42, 0.42, x + Math.cos(ry) * s * 0.58 + Math.sin(ry) * f, y + 0.22, z - Math.sin(ry) * s * 0.58 + Math.cos(ry) * f, ry);
        } else {
          cart.box(1.0, 0.42, 1.7, x, y + 0.5, z, ry);
          for (const a of [-0.5, 0.5]) tugDark.box(1.06, 0.22, 0.22, x + Math.sin(ry) * a, y + 0.16, z + Math.cos(ry) * a, ry);
        }
      } else if (n % 4 === 3 && free(x, z, 0.5)) {
        const body = n % 3 === 0 ? crewA : n % 3 === 1 ? crewB : crewC;
        body.box(0.42, 1.25, 0.26, x, y + 0.72, z);
        heads.ball(0.15, x, y + 1.52, z);
      }
    }

  // hệ thống quang học dẫn đáp bên đường băng xiên
  const opt = L.lanes[1];
  const optSin = Math.sin(opt.yaw);
  const optCos = Math.cos(opt.yaw);
  const ox = opt.x + optSin * 16 + optCos * -(L.laneWidth / 2 + 2);
  const oz = opt.z + optCos * 16 - optSin * -(L.laneWidth / 2 + 2);
  if (L.onDeck(ox, oz)) {
    const base = new Batch("Hệ quang học dẫn đáp", p.hullDark);
    const lens = new Batch("Đèn quang học dẫn đáp", p.teamGlow);
    base.box(0.6, 2.2, 3.4, ox, y + 1.1, oz, opt.yaw);
    for (let k = -2; k <= 2; k++) lens.box(0.08, 0.26, 2.8, ox + 0.33 * optCos, y + 1.1 + k * 0.38, oz - 0.33 * optSin, opt.yaw);
    base.addTo(root);
    lens.addTo(root);
  }

  for (const b of [vlsBase, vlsHatch, vlsGlow, frames, fuelBase, fuelCap, lights, keys, cables, cableEnd, plateA, plateB, ties, tugBody, tugDark, cart, crewA, crewB, crewC, heads]) b.addTo(root);
}

/** Sóng mũi và vệt rẽ nước sau đuôi. */
function addSea(root: THREE.Object3D, L: CarrierLayout): void {
  const paint = carrierPaint();
  const y0 = 0.06;
  const y1 = 0.12;
  const flat = (pts: Vec[], mat: THREE.Material, name: string): void => {
    const m = facets(pts.flatMap(([x, z]) => [[x, y0, z], [x, y1, z]] as [number, number, number][]), mat);
    m.castShadow = false;
    m.renderOrder = 1;
    root.add(part(name, m));
  };
  const bow = 41 * L.lz;
  for (const s of [-1, 1]) {
    flat([[0, bow + 2.5], [s * 7.6, bow - 13], [s * 9.2, bow - 19], [s * 4.8, bow - 11]], paint.foam, "Sóng mũi");
    flat([[s * 7.4, -22 * L.lz], [s * 8.4, -6 * L.lz], [s * 10.4, 10 * L.lz], [s * 9.4, -22 * L.lz]], paint.wake, "Bọt dọc mạn");
  }
  const stern = -41 * L.lz;
  flat([[-5.4, stern], [5.4, stern], [17, stern - 72], [-17, stern - 72]], paint.wake, "Vệt rẽ nước");
  flat([[-2, stern - 1], [2, stern - 1], [5, stern - 44], [-5, stern - 44]], paint.foam, "Bọt chân vịt");
}

export function addCarrierDetails(root: THREE.Object3D, p: Palette, layout: CarrierLayout): void {
  addHull(root, p, layout);
  addEdge(root, p, layout);
  addDeck(root, p, layout);
  addSea(root, layout);
}

/** Chi tiết đài chỉ huy, trong khung của đài (x ±1.9, z ±5.5, cao tới 6.9). */
export function addIslandDetails(g: THREE.Object3D, p: Palette): void {
  const paint = carrierPaint();
  const glass = new Batch("Cửa kính các tầng", p.glass);
  const frame = new Batch("Giàn và ống trên đài", p.metal);
  const arrayFace = new Batch("Radar mảng pha", p.hullDark);
  const arrayGlow = new Batch("Phần tử radar mảng pha", p.teamGlow);
  const gold = new Batch("Viền vàng đài chỉ huy", paint.gold);
  const white = new Batch("Thiết bị trắng trên đài", p.white);
  for (const side of [-1, 1]) {
    for (let z = -4.6; z <= 4.6; z += 0.92) {
      glass.box(0.05, 0.36, 0.56, side * 1.86, 1.25, z);
      glass.box(0.05, 0.3, 0.5, side * 1.74, 3.75, z * 0.86);
    }
    // radar mảng pha ốp hai bên
    arrayFace.box(0.1, 1.5, 2, side * 1.72, 4.1 + 0.05, -2.8);
    for (let a = -2; a <= 2; a++)
      for (let b = -1; b <= 1; b++) arrayGlow.box(0.04, 0.18, 0.3, side * 1.79, 4.15 + b * 0.42, -2.8 + a * 0.36);
    // cửa thoát khí, thang và lan can
    for (let k = 0; k < 4; k++) frame.box(0.08, 0.12, 0.9, side * 1.9, 0.5 + k * 0.28, 3.2);
    frame.box(0.05, 6.2, 0.05, side * 1.98, 3.3, 5.1);
    frame.box(0.05, 6.2, 0.05, side * 1.98, 3.3, 4.7);
    white.ball(0.32, side * 1.25, 7.25, -2.4);
    white.box(0.5, 0.42, 0.9, side * 0.95, 7.08, 2.5);
  }
  // radar mảng pha mặt trước và sau, viền vàng quanh tầng chỉ huy
  for (const f of [-1, 1]) {
    arrayFace.box(2.3, 1.5, 0.1, 0, 3.2, f * 5.05);
    for (let a = -3; a <= 3; a++) for (let b = -1; b <= 1; b++) arrayGlow.box(0.26, 0.18, 0.04, a * 0.3, 3.2 + b * 0.42, f * 5.12);
    gold.box(3.9, 0.08, 0.08, 0, 6.68, f === 1 ? 4.3 : -3.3);
  }
  for (const s of [-1, 1]) gold.box(0.08, 0.08, 7.7, s * 1.94, 6.68, 0.5);
  gold.box(3.9, 0.1, 9.6, 0, 0.05, 0);
  // ống xả, cột thông tin, cờ
  for (const x of [-0.8, 0.8]) frame.cyl(0.28, 1.1, x, 7.4, -0.9);
  for (const [x, z, h] of [[-1.5, 3.4, 3.2], [1.5, 3.4, 2.6], [-1.1, -3.2, 2.2], [1.1, -3.2, 2.8], [0.5, 4, 1.8]] as const) frame.cyl(0.03, h, x, 6.9 + h / 2, z, 4);
  for (const b of [glass, frame, arrayFace, arrayGlow, gold, white]) b.addTo(g);
  const flagPole = new Batch("Cột cờ", p.metal);
  flagPole.cyl(0.03, 2.2, 0, 7.9, -5, 4);
  flagPole.addTo(g);
  const flag = new Batch("Cờ (màu phe)", p.team);
  flag.box(0.04, 0.6, 1.1, 0, 8.65, -5.58);
  flag.addTo(g);
}
