/**
 * Toán học TẤT ĐỊNH cho lõi mô phỏng.
 *
 * Vì sao cần? Chuẩn JavaScript chỉ bảo đảm + - * / và Math.sqrt cho ra đúng từng bit trên mọi máy.
 * Math.sin, Math.cos, Math.atan2, Math.hypot, Math.exp… thì mỗi trình duyệt có thể lệch nhau ở chữ số cuối.
 * Với lockstep multiplayer và replay, lệch 1 bit ở tick 100 có thể thành hai trận khác hẳn ở tick 5000.
 * Nên trong src/sim/ ta chỉ dùng các phép cơ bản và các hàm tự viết dưới đây.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const SQRT2 = 1.4142135623730951;
export const DEG = PI / 180;

/** sin tự viết: thu gọn góc về [-π/2, π/2] rồi dùng chuỗi Taylor (sai số ~1e-8, đủ cho game). */
export function dsin(x: number): number {
  const k = Math.floor(x / TAU + 0.5);
  let r = x - k * TAU;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return (
    r *
    (1 +
      r2 *
        (-0.16666666666666666 +
          r2 * (0.008333333333333333 + r2 * (-0.0001984126984126984 + r2 * (0.0000027557319223985893 + r2 * -2.505210838544172e-8)))))
  );
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

/** Một bước quay cố định (cos, sin tính sẵn), dùng để giới hạn tốc độ ngoặt. */
export interface TurnStep {
  c: number;
  s: number;
}

export function turnStep(angle: number): TurnStep {
  return { c: dcos(angle), s: dsin(angle) };
}

/**
 * Xoay hướng (hx, hz) về phía hướng mong muốn (dx, dz) nhưng không quá một bước ngoặt.
 * Cả hai vector đều đã chuẩn hóa. Không dùng góc, chỉ dùng tích vô hướng và tích có hướng.
 */
export function turnToward(hx: number, hz: number, dx: number, dz: number, step: TurnStep, out: { x: number; z: number }): void {
  const dot = hx * dx + hz * dz;
  if (dot >= step.c) {
    out.x = dx;
    out.z = dz;
    return;
  }
  const cross = hx * dz - hz * dx;
  const s = cross >= 0 ? step.s : -step.s;
  const nx = hx * step.c - hz * s;
  const nz = hx * s + hz * step.c;
  const l = Math.sqrt(nx * nx + nz * nz);
  out.x = nx / l;
  out.z = nz / l;
}

/** Bộ sinh số ngẫu nhiên có seed (mulberry32): cùng seed thì cùng dãy số trên mọi máy. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}
