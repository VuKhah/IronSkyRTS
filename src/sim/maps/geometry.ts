/** Hình học thuần cho bản đồ: khoảng cách tới đoạn sông, hộp bao và khoảng cách tới viền đa giác. Tách từ game-map.ts (16/11/2026). */
import type { Vec2 } from "./types";

/** Dư thêm cho sai số làm tròn số thực. */
export const ACCEL_EPS = 1e-6;

/** Hộp bao của vùng tô đa giác: x0, z0, x1, z1. */
export type Box = readonly [number, number, number, number];

export interface Segment {
  ax: number;
  az: number;
  /** Hướng đơn vị và độ dài đoạn. */
  dx: number;
  dz: number;
  len: number;
  /** Độ dài dọc sông tính tới đầu đoạn này. */
  cum: number;
}

/** Khoảng cách tới dòng sông và vị trí dọc sông của điểm gần nhất. */
export interface RiverHit {
  dist: number;
  along: number;
}

/** Điểm gần nhất trên danh sách đoạn sông (giữ đúng thứ tự duyệt, để hai đoạn cách đều vẫn chọn như nhau). */
export function nearestOn(segs: readonly Segment[], x: number, z: number): RiverHit {
  let best = Infinity;
  let along = 0;
  for (const s of segs) {
    const px = x - s.ax;
    const pz = z - s.az;
    const t = px * s.dx + pz * s.dz;
    let d: number;
    let a: number;
    if (t <= 0) {
      d = Math.sqrt(px * px + pz * pz);
      a = s.cum;
    } else if (t >= s.len) {
      const qx = x - (s.ax + s.dx * s.len);
      const qz = z - (s.az + s.dz * s.len);
      d = Math.sqrt(qx * qx + qz * qz);
      a = s.cum + s.len;
    } else {
      d = Math.abs(px * s.dz - pz * s.dx);
      a = s.cum + t;
    }
    if (d < best) {
      best = d;
      along = a;
    }
  }
  return { dist: best, along };
}

export function segDist(s: Segment, x: number, z: number): number {
  return nearestOn([s], x, z).dist;
}

export function polyBox(p: readonly Vec2[]): Box {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const v of p) {
    x0 = Math.min(x0, v[0]);
    z0 = Math.min(z0, v[1]);
    x1 = Math.max(x1, v[0]);
    z1 = Math.max(z1, v[1]);
  }
  return [x0 - ACCEL_EPS, z0 - ACCEL_EPS, x1 + ACCEL_EPS, z1 + ACCEL_EPS];
}

/** Khoảng cách có dấu (m) từ điểm tới viền đa giác: dương ở trong, âm ở ngoài. */
export function polyInset(b: readonly Vec2[], x: number, z: number): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const pi = b[i];
    const pj = b[j];
    const xi = pi[0];
    const zi = pi[1];
    const xj = pj[0];
    const zj = pj[1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const ex = xj - xi;
    const ez = zj - zi;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - xi) * ex + (z - zi) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = xi + ex * t - x;
    const pz = zi + ez * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best);
  return inside ? d : -d;
}

export function pointInPoly(p: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i];
    const b = p[j];
    const xi = a[0];
    const zi = a[1];
    const xj = b[0];
    const zj = b[1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
