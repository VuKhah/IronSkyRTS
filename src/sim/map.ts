/**
 * Bản đồ MVP "Thung Lũng Sông Sắt": 160 × 160 m, đối xứng xoay 180° quanh tâm (x, z) → (-x, -z).
 *
 * Hệ tọa độ: x sang Đông, z sang Nam (giống Three.js: camera mặc định nhìn về -z).
 * Sông chạy chéo theo đường x = z. Ta dùng hệ trục xoay (u, v):
 *   u = (x - z)/√2: khoảng cách có dấu tới dòng sông (u < 0 là đất Liên Minh Lam, u > 0 là đất Tập Đoàn Đỏ)
 *   v = (x + z)/√2: vị trí dọc theo dòng sông
 * Mọi hàm ở đây chỉ dùng phép tính cơ bản nên tất định.
 */
import type { Res, Side } from "./content";

export const MAP_HALF = 80;
export const CELL = 2;
export const GRID = (MAP_HALF * 2) / CELL;
export const INV_SQRT2 = 0.7071067811865476;
/** Nửa bề rộng lòng sông có nước (m). */
export const RIVER_HALF = 7.5;
/** Nửa bề rộng cả bờ dốc hai bên (m). */
export const BANK_HALF = 11.5;
/** Ngoài khung này là vách núi bao quanh bản đồ. */
export const EDGE = 76;

export const toU = (x: number, z: number): number => (x - z) * INV_SQRT2;
export const toV = (x: number, z: number): number => (x + z) * INV_SQRT2;
export function fromUV(u: number, v: number): [number, number] {
  return [(u + v) * INV_SQRT2, (v - u) * INV_SQRT2];
}

export interface Crossing {
  v: number;
  half: number;
  kind: "bridge" | "ford";
}

/** 3 chỗ vượt sông: cầu cánh Nam, bãi cạn rộng ở giữa, cầu cánh Bắc. */
export const CROSSINGS: readonly Crossing[] = [
  { v: -56, half: 4.5, kind: "bridge" },
  { v: 0, half: 11, kind: "ford" },
  { v: 56, half: 4.5, kind: "bridge" }
];

export function crossingAt(v: number): Crossing | null {
  for (const c of CROSSINGS) if (Math.abs(v - c.v) < c.half) return c;
  return null;
}

export interface Blob {
  x: number;
  z: number;
  r: number;
  h: number;
}

/** Mỏm đá: chặn đường xe, tạo lối đi hẹp gần bờ sông. */
export const ROCKS: readonly Blob[] = [
  { x: -29.7, z: -9.9, r: 6, h: 4.5 },
  { x: 29.7, z: 9.9, r: 6, h: 4.5 },
  { x: 9.9, z: 29.7, r: 5.5, h: 4 },
  { x: -9.9, z: -29.7, r: 5.5, h: 4 }
];

/** Đồi thấp: đứng trên đồi được cộng tầm nhìn và tầm bắn; đồi che tầm nhìn của quân mặt đất (RULES.terrain). */
export const HILLS: readonly Blob[] = [
  { x: -28, z: 66, r: 13, h: 4 },
  { x: 28, z: -66, r: 13, h: 4 },
  { x: -70, z: 0, r: 12, h: 3.5 },
  { x: 70, z: 0, r: 12, h: 3.5 },
  { x: 40, z: 62, r: 12, h: 3 },
  { x: -40, z: -62, r: 12, h: 3 }
];

export interface MineDef {
  res: Res;
  x: number;
  z: number;
  owner: Side | -1;
  /** Trữ lượng riêng (mặc định lấy theo RULES.mineAmount). */
  amount?: number;
}

/**
 * 4 mỏ Sắt (mỗi bên 1 mỏ nhà + 1 mỏ tiền tuyến) và 5 giàn Dầu:
 * mỗi bên 1 giàn nhà trữ lượng nhỏ (có sẵn từ đầu trận) + 3 giàn trung lập (giữa sông + 2 đầu cầu cánh).
 */
export const MINES: readonly MineDef[] = [
  { res: "iron", x: -66, z: 30, owner: 0 },
  { res: "iron", x: 66, z: -30, owner: 1 },
  { res: "iron", x: -2, z: 34, owner: -1 },
  { res: "iron", x: 2, z: -34, owner: -1 },
  { res: "oil", x: 0, z: 0, owner: -1 },
  { res: "oil", x: -44.5, z: -20.5, owner: -1 },
  { res: "oil", x: 44.5, z: 20.5, owner: -1 },
  // giàn Dầu nhà: đủ khởi động điện và máy bay, cạn sớm nên vẫn phải ra tranh giàn giữa bản đồ
  { res: "oil", x: -42, z: 68, owner: 0, amount: 1200 },
  { res: "oil", x: 42, z: -68, owner: 1, amount: 1200 }
];

export const HQ_POS: readonly (readonly [number, number])[] = [
  [-58, 58],
  [58, -58]
];

/** Ô này xe mặt đất có đi được không (chưa tính công trình). */
export function staticBlocked(x: number, z: number): boolean {
  if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return true;
  if (Math.abs(toU(x, z)) < RIVER_HALF && !crossingAt(toV(x, z))) return true;
  for (const r of ROCKS) {
    const dx = x - r.x;
    const dz = z - r.z;
    if (dx * dx + dz * dz < r.r * r.r) return true;
  }
  return false;
}

function smooth01(t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

/**
 * Độ cao địa hình (m). Dùng cho cả phần vẽ lẫn lõi sim (tầm nhìn bị che, cộng tầm khi đứng cao).
 * Chỉ dùng + − × ÷, trị tuyệt đối, min/max nên tất định trên mọi máy. Đừng thêm Math.sin/cos vào đây.
 */
export function terrainHeight(x: number, z: number): number {
  let h = 0;
  for (const b of HILLS) {
    const dx = x - b.x;
    const dz = z - b.z;
    const d2 = dx * dx + dz * dz;
    const r2 = b.r * b.r;
    if (d2 < r2) {
      const k = 1 - d2 / r2;
      h += b.h * k * k;
    }
  }
  for (const b of ROCKS) {
    const dx = x - b.x;
    const dz = z - b.z;
    const d2 = dx * dx + dz * dz;
    const r2 = (b.r + 1.5) * (b.r + 1.5);
    if (d2 < r2) h += b.h * smooth01((1 - d2 / r2) * 1.6);
  }
  const u = Math.abs(toU(x, z));
  if (u < BANK_HALF) {
    const s = smooth01((BANK_HALF - u) / (BANK_HALF - RIVER_HALF + 1.5));
    const c = crossingAt(toV(x, z));
    const depth = c && c.kind === "ford" ? 0.3 : 2.6;
    h = h * (1 - s) - depth * s;
  }
  const e = Math.min(90, Math.max(Math.abs(x), Math.abs(z)));
  if (e > 72) {
    const k = (e - 72) / 8;
    h += k * k * 7;
  }
  return h;
}

/** Mặt cầu cho xe chạy trên cầu (null nếu không ở trên cầu). */
export function deckHeight(x: number, z: number): number | null {
  const c = crossingAt(toV(x, z));
  if (!c || c.kind !== "bridge") return null;
  return Math.abs(toU(x, z)) < BANK_HALF + 0.5 ? 0.45 : null;
}

/** Độ cao mặt đất xe đứng (cầu hoặc địa hình). */
export function groundY(x: number, z: number): number {
  const d = deckHeight(x, z);
  const h = terrainHeight(x, z);
  return d !== null && d > h ? d : h;
}
