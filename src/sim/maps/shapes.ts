/**
 * Trợ giúp dựng hình cho file dữ liệu bản đồ (chạy một lần lúc nạp, tất định: chỉ + − × ÷).
 */
import type { Vec2 } from "./types";

/** Làm mượt đường gấp khúc bằng spline Catmull-Rom: `steps` đoạn nhỏ giữa mỗi hai điểm điều khiển. */
export function smoothPath(pts: readonly Vec2[], steps: number): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i + 1 < n; i++) {
    const p0 = pts[i > 0 ? i - 1 : i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < n ? i + 2 : i + 1];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const a = -0.5 * t3 + t2 - 0.5 * t;
      const b = 1.5 * t3 - 2.5 * t2 + 1;
      const c = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const d = 0.5 * t3 - 0.5 * t2;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/**
 * Dòng sông chảy qua tâm, đối xứng xoay 180° tuyệt đối: khai báo nửa đầu (điểm cuối phải là tâm (0, 0)),
 * làm mượt cả dòng rồi lấy nửa đầu soi sang nửa sau.
 */
export function symmetricRiver(half: readonly Vec2[], steps: number): Vec2[] {
  const last = half[half.length - 1];
  if (last[0] !== 0 || last[1] !== 0) throw new Error("symmetricRiver: điểm cuối của nửa đầu phải là tâm (0, 0)");
  const full: Vec2[] = [...half, ...half.slice(0, -1).reverse().map(([x, z]): Vec2 => [-x, -z])];
  const smooth = smoothPath(full, steps);
  const mid = (half.length - 1) * steps;
  const first = smooth.slice(0, mid);
  return [...first, [0, 0], ...first.slice().reverse().map(([x, z]): Vec2 => [-x, -z])];
}

/** Đa giác méo tự nhiên quanh tâm (cx, cz), bán trục rx / rz, độ méo `irr` (0..1), xoay `rot` (bội của 90° cho đơn giản). Tất định theo `seed`. */
export function blobPoly(cx: number, cz: number, rx: number, rz: number, seed: number, irr = 0.3, n = 12): Vec2[] {
  // cos/sin của các góc chia đều tính bằng phép quay lặp (không dùng Math.sin/cos, giữ tất định)
  const out: Vec2[] = [];
  const step = (2 * Math.PI) / n;
  const c = 1 - (step * step) / 2 + (step * step * step * step) / 24 - (step ** 6) / 720;
  const s = step - (step * step * step) / 6 + (step ** 5) / 120 - (step ** 7) / 5040;
  let ux = 1;
  let uz = 0;
  let h = seed >>> 0;
  for (let i = 0; i < n; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    const f = 1 + irr * ((h / 4294967296) * 2 - 1);
    out.push([cx + ux * rx * f, cz + uz * rz * f]);
    const nx = ux * c - uz * s;
    uz = ux * s + uz * c;
    ux = nx;
  }
  return out;
}

/**
 * Làm viền đa giác lượn tự nhiên: chia mỗi cạnh thành đoạn dài khoảng `step` m rồi đẩy từng điểm ra / vào
 * tối đa `amp` m theo nhiễu mượt dọc chu vi (tất định theo `seed`). Đỉnh gốc giữ nguyên.
 */
export function wobblePoly(poly: readonly Vec2[], amp: number, seed: number, step = 4): Vec2[] {
  const out: Vec2[] = [];
  let h = seed >>> 0;
  const rnd = (): number => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (h / 4294967296) * 2 - 1;
  };
  let prev = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.sqrt(ex * ex + ez * ez);
    const n = Math.max(1, Math.round(len / step));
    const px = -ez / len;
    const pz = ex / len;
    out.push([ax, az]);
    for (let k = 1; k < n; k++) {
      // nhiễu mượt: trộn giá trị trước với giá trị mới
      prev = prev * 0.55 + rnd() * 0.45;
      const t = k / n;
      const o = prev * amp * 1.8;
      out.push([ax + ex * t + px * o, az + ez * t + pz * o]);
    }
  }
  return out;
}
