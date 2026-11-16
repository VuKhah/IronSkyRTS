/**
 * NHƯỜNG ĐƯỜNG CHỦ ĐỘNG (T2 kế hoạch A1 làm lại, người dùng duyệt 16/11/2026; Docs/plans/2026-11-16-A1-tuong-su-doan-ke-hoach.md).
 *
 * Việc của "tướng dưới quyền": xe cùng phe ĐANG ĐỨNG nằm trên đường sắp đi của xe khác thì tự dạt ra vừa đủ cho xe kia qua, rồi
 * về ô. Thay luật lách mềm (đo khe chính xác, ai vừa khe mới qua) và luật "đẩy": đội hình đứng gọn mà xe nào cũng đi xuyên qua
 * được, kể cả xe cùng cỡ; không cần bảng bậc đế.
 * - Ai nhường (`canYield`): xe mặt đất đứng chờ (lệnh idle), không trong đội hình đang chạy, KHÔNG phải quân cố định (đã hạ bệ),
 *   không phải tiểu đội bộ binh (luật chạm mềm riêng), không phải Xe Vận Tải (máy trạng thái riêng).
 * - Đường cần dọn: đoạn đường A* phía trước xe đi, dài theo YIELD_LOOK_T giây chạy (YIELD_LOOK_MIN … YIELD_LOOK_MAX m); xe không
 *   có đường (nhích trong đội hình) thì theo hướng vừa chạy. Lối rộng = tổng hai vòng thân + YIELD_MARGIN.
 * - Dạt về phía xa đường đi (đứng ngay trên đường thì sang PHẢI người đi: xoay 180° không đổi trái phải nên hai phe đối xứng).
 * - CHẠY THEO XÍCH (người dùng 16/11/2026: "Titan không đi ngang"): hướng dạt chọn gần trục thân nhất. Thân lệch đường đi ≥ 30°:
 *   tiến / lùi thẳng theo trục thân; thân gần song song đường đi: xoay chéo đúng 30° rồi tiến / lùi chéo ra (Titan quay 45°/s, xoay
 *   vuông góc mất 2 s). Về ô thì chạy ngược đúng trục đó, khỏi quay lại.
 * - Chỗ dạt bị chặn (vách, nhà) thì thử phía kia; vẫn chặn thì không nhường (xe đi tự lách / đi vòng). Chỗ dạt đè xe đứng bên cạnh
 *   thì xe đó dạt tiếp cùng hướng, tối đa MỘT tầng.
 * - Đích của xe đi nằm TRONG thân xe đứng: không nhường (luật "tới gần là tới" cho xe đi dừng cạnh); đích đè một phần: xe đứng
 *   dạt cho xe đi vào chỗ, ô nhà bị chiếm thì nhận chỗ mới (`updateGround`).
 */
import { UNITS } from "../content";
import type { Unit } from "../types";
import { bodyRadius, isSquad, sec } from "./shared";
import { World } from "./core";

/** Lối dọn cho xe đi: tổng hai vòng thân + chừng này (m). */
const YIELD_MARGIN = 0.3;
/** Nhìn trước đường đi chừng này giây chạy, kẹp trong [MIN, MAX] m. */
const YIELD_LOOK_T = 2.5;
const YIELD_LOOK_MIN = 4;
const YIELD_LOOK_MAX = 14;
/** Không yêu cầu nữa thì giữ chỗ dạt chừng này rồi mới về ô (người dùng duyệt 1 giây). */
const YIELD_HOLD = sec(1);
/** Dạt xa nhất (m, quãng chạy). */
const YIELD_MAX = 4;
/** |cos| giữa trục thân và hướng cần dạt từ chừng này trở lên thì chạy thẳng theo trục thân (thân lệch đường đi ≥ 30°). */
/** Chờ lối: xét đoạn lối dài chừng này giây chạy (tối thiểu LANE_AHEAD_MIN m) trước mũi xe đi. */
const LANE_AHEAD_T = 0.6;
const LANE_AHEAD_MIN = 1.5;
/** Chờ lối quá chừng này tick thì thôi chờ: xe chắn thành vật cản cứng YIELD_BLOCK tick, xe đi tìm đường vòng. */
const LANE_WAIT_MAX = sec(3);
const YIELD_BLOCK = sec(8);

function canYield(this: World, v: Unit): boolean {
  return v.air === "none" && v.hp > 0 && v.order === "idle" && v.squad === 0 && v.kind !== "hauler" && !isSquad(v.kind) && !this.anchored(v) && this.tick >= v.yieldBlock;
}

/** Xe đang tự đi (có đường còn lại, hoặc vừa chạy trong đội hình) và đòi lối; xe đang nhường / về ô thì không đòi. */
function lane(this: World, m: Unit): number[] | null {
  if (m.air !== "none" || m.hp <= 0 || this.anchored(m) || isSquad(m.kind) || (m.order === "idle" && m.yieldAway)) return null;
  const look = Math.max(YIELD_LOOK_MIN, Math.min(YIELD_LOOK_MAX, UNITS[m.kind].speed * YIELD_LOOK_T));
  const pts = [m.x, m.z];
  let left = look;
  if (m.pathI * 2 < m.path.length) {
    let ax = m.x;
    let az = m.z;
    for (let k = m.pathI; k * 2 < m.path.length && left > 0; k++) {
      const bx = m.path[k * 2];
      const bz = m.path[k * 2 + 1];
      const l = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      if (l < 1e-6) continue;
      const t = l > left ? left / l : 1;
      pts.push(ax + (bx - ax) * t, az + (bz - az) * t);
      left -= l;
      ax = bx;
      az = bz;
    }
    return pts.length >= 4 ? pts : null;
  }
  // nhích trong đội hình (không có đường): theo hướng vừa chạy
  if (!m.squad || !m.moved) return null;
  const vx = m.x - m.px;
  const vz = m.z - m.pz;
  const v = Math.sqrt(vx * vx + vz * vz);
  if (v < 1e-4) return null;
  pts.push(m.x + (vx / v) * YIELD_LOOK_MIN, m.z + (vz / v) * YIELD_LOOK_MIN);
  return pts;
}

/** Chỗ (x, z) đứng được cho thân xe s (không vào ô chặn, thân không chạm vách / nhà). */
function freeFor(w: World, s: Unit, x: number, z: number): boolean {
  return !w.grid.blockedAt(x, z) && w.bodyContact(s, x, z)[2] === 0 && w.map.inset(x, z) >= 1;
}

/** Ghi yêu cầu dạt cho xe s tới (x, z): giữ yêu cầu dạt xa ô nhà hơn khi có nhiều xe đi cùng đòi. */
function request(w: World, s: Unit, x: number, z: number): void {
  const active = w.tick < s.yieldUntil;
  if (active) {
    const cur = (s.yieldX - s.tx) * (s.yieldX - s.tx) + (s.yieldZ - s.tz) * (s.yieldZ - s.tz);
    const nxt = (x - s.tx) * (x - s.tx) + (z - s.tz) * (z - s.tz);
    if (nxt < cur) {
      s.yieldUntil = w.tick + YIELD_HOLD;
      return;
    }
  }
  s.yieldX = x;
  s.yieldZ = z;
  s.yieldUntil = w.tick + YIELD_HOLD;
  s.yieldAway = true;
}

/** Khoảng cách bình phương từ (x, z) tới đường gấp khúc `pts`. */
function laneDist2(pts: readonly number[], x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k];
    const az = pts[k + 1];
    const ex = pts[k + 2] - ax;
    const ez = pts[k + 3] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 < 1e-9 ? 0 : ((x - ax) * ex + (z - az) * ez) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + ex * t);
    const dz = z - (az + ez * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

/** Hướng thử khi chọn chỗ dạt (lệch so với mũi xe: cos, sin, độ): giữ thân, ±30°, ±60°, ±90°; mỗi hướng tiến hoặc lùi. */
const TRY_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0.8660254037844386, 0.5, 30],
  [0.8660254037844386, -0.5, 30],
  [0.5, 0.8660254037844386, 60],
  [0.5, -0.8660254037844386, 60],
  [0, 1, 90],
  [0, -1, 90]
];
/** Bước dò quãng chạy (m). */
const TRY_STEP = 0.25;
/** Chỗ dạt đè xe đứng khác (biết nhường, sẽ dạt dây chuyền) bị tính thêm chừng này giây: ưu tiên chỗ trống. */
const CHAIN_COST = 1;

/**
 * CHỌN CHỖ DẠT NHANH NHẤT cho xe s (chạy theo xích): thử các hướng TRY_DIRS (quay thân rồi tiến / lùi), mỗi hướng lấy quãng
 * ngắn nhất (bước TRY_STEP, tối đa YIELD_MAX) thỏa: ra khỏi lối (cách đường gấp khúc `lane` ≥ `clear`), cách `keepOff` (chỗ dạt
 * của xe trước, khi dạt dây chuyền), không chạm vách / nhà, không đè xe đi hay quân không nhường được. Thời gian = quay thân
 * (độ ÷ turnRate) + quãng ÷ tốc độ (lùi nửa tốc độ) + CHAIN_COST mỗi xe đứng bị đè. Tính từ Ô NHÀ (tx, tz): yêu cầu lặp mỗi tick
 * không cộng dồn. Trả về [x, z] hoặc null nếu không có chỗ.
 */
function planYield(w: World, s: Unit, lane: readonly number[], clear: number, keepOff: readonly [number, number, number] | null, ground: readonly Unit[], m: Unit): [number, number] | null {
  const spec = UNITS[s.kind];
  const turnRate = spec.turnRate ?? 90;
  const speed = spec.speed;
  const rs = bodyRadius(s.kind);
  const ox = s.tx;
  const oz = s.tz;
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (const [ca, sa, deg] of TRY_DIRS) {
    const dx = s.hx * ca - s.hz * sa;
    const dz = s.hx * sa + s.hz * ca;
    for (const sg of [1, -1]) {
      const turn = deg / turnRate;
      const v = speed * (sg < 0 ? 0.5 : 1);
      for (let t = TRY_STEP; t <= YIELD_MAX + 1e-9; t += TRY_STEP) {
        let cost = turn + t / v;
        if (cost >= best) break;
        const x = ox + dx * sg * t;
        const z = oz + dz * sg * t;
        if (laneDist2(lane, x, z) < clear * clear) continue;
        if (keepOff && (x - keepOff[0]) * (x - keepOff[0]) + (z - keepOff[1]) * (z - keepOff[1]) < keepOff[2] * keepOff[2]) continue;
        let hard = false;
        for (const o of ground) {
          if (o === s) continue;
          const lim = rs + bodyRadius(o.kind) - 0.05;
          // xe biết nhường xét theo ô nhà của nó (sẽ dạt dây chuyền); xe khác theo chỗ đang đứng
          const yo = o !== m && o.side === s.side && w.canYield(o);
          const qx = yo ? o.tx : o.x;
          const qz = yo ? o.tz : o.z;
          const ex = x - qx;
          const ez = z - qz;
          if (ex > lim || ex < -lim || ez > lim || ez < -lim || ex * ex + ez * ez >= lim * lim) continue;
          if (!yo) {
            hard = true;
            break;
          }
          cost += CHAIN_COST;
        }
        if (hard || cost >= best) continue;
        if (!freeFor(w, s, x, z)) continue;
        best = cost;
        bx = x;
        bz = z;
        break;
      }
    }
  }
  return best < Infinity ? [bx, bz] : null;
}
function yieldPass(this: World): void {
  const ground: Unit[] = [];
  for (const u of this.units) if (u.air === "none" && u.hp > 0) ground.push(u);
  for (const m of ground) {
    const pts = this.lane(m);
    if (!pts) continue;
    const rm = bodyRadius(m.kind);
    const gx = pts[pts.length - 2];
    const gz = pts[pts.length - 1];
    // đích cuối thật của xe đi (đường có thể dài hơn đoạn nhìn trước)
    const fx = m.path.length >= 2 ? m.path[m.path.length - 2] : gx;
    const fz = m.path.length >= 2 ? m.path[m.path.length - 1] : gz;
    // đoạn nhìn trước bị cắt (chưa tới đích thật): xe nằm quá điểm cuối thì chưa cần nhường. Không thì "dạt xa điểm cuối" thành
    // chạy dọc đường ngay trước mũi xe đi, bị đuổi mãi (đo 16/11: Titan chạy trước mũi 14,5 m)
    const cut = m.path.length < 2 || (gx - fx) * (gx - fx) + (gz - fz) * (gz - fz) > 1e-4;
    const lastK = pts.length - 4;
    const reach = YIELD_LOOK_MAX + rm + 4;
    // CHỜ LỐI: xe nhường (vị trí THẬT lúc này) còn lấn vào đoạn lối ngay trước mũi thì xe đi đứng chờ (quay thân sẵn), không lao
    // vào; chờ quá LANE_WAIT_MAX thì những xe đó tạm thành vật cản cứng (`yieldBlock`), xe đi tìm đường vòng
    if (m.path.length >= 2) {
      const ahead = Math.max(LANE_AHEAD_MIN, UNITS[m.kind].speed * LANE_AHEAD_T) + rm;
      const near: Unit[] = [];
      for (const s of ground) {
        if (s === m || s.side !== m.side || !this.canYield(s)) continue;
        const dx = s.x - m.x;
        const dz = s.z - m.z;
        const lim = rm + bodyRadius(s.kind) + 0.05;
        if (dx > ahead + lim || dx < -ahead - lim || dz > ahead + lim || dz < -ahead - lim) continue;
        // chỉ đoạn lối trong `ahead` m đầu và ở phía trước mũi
        if (dx * (pts[2] - m.x) + dz * (pts[3] - m.z) <= 0) continue;
        if (laneDist2(pts, s.x, s.z) >= lim * lim) continue;
        if (dx * dx + dz * dz > (ahead + lim) * (ahead + lim)) continue;
        // đích nằm trong thân nó: "tới gần là tới" lo, không chờ
        if ((fx - s.x) * (fx - s.x) + (fz - s.z) * (fz - s.z) < bodyRadius(s.kind) * bodyRadius(s.kind)) continue;
        near.push(s);
      }
      if (near.length) {
        m.laneWait++;
        if (m.laneWait > LANE_WAIT_MAX) {
          for (const s of near) s.yieldBlock = this.tick + YIELD_BLOCK;
          m.laneWait = 0;
          this.standTick.fill(-1);
          this.setPath(m, fx, fz);
        }
      } else m.laneWait = 0;
    } else m.laneWait = 0;
    for (const s of ground) {
      if (s === m || s.side !== m.side || !this.canYield(s)) continue;
      // xe đứng xét theo Ô NHÀ (tx, tz): đang dạt dở vẫn tính đúng chỗ nó sẽ về
      const sx0 = s.tx;
      const sz0 = s.tz;
      const ox = sx0 - m.x;
      const oz = sz0 - m.z;
      if (ox > reach || ox < -reach || oz > reach || oz < -reach) continue;
      const rs = bodyRadius(s.kind);
      // đích nằm trong thân xe đứng: không nhường, xe đi dừng cạnh ("tới gần là tới")
      if ((fx - sx0) * (fx - sx0) + (fz - sz0) * (fz - sz0) < rs * rs) continue;
      // điểm gần nhất trên đường nhìn trước
      let best = Infinity;
      let px = 0;
      let pz = 0;
      let first = false;
      let end = false;
      for (let k = 0; k + 3 < pts.length; k += 2) {
        const ax = pts[k];
        const az = pts[k + 1];
        const bx = pts[k + 2];
        const bz = pts[k + 3];
        const ex = bx - ax;
        const ez = bz - az;
        const l2 = ex * ex + ez * ez;
        if (l2 < 1e-9) continue;
        let t = ((sx0 - ax) * ex + (sz0 - az) * ez) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + ex * t;
        const cz = az + ez * t;
        const d2 = (sx0 - cx) * (sx0 - cx) + (sz0 - cz) * (sz0 - cz);
        if (d2 < best) {
          best = d2;
          const l = Math.sqrt(l2);
          px = ex / l;
          pz = ez / l;
          first = k === 0 && t === 0;
          end = k === lastK && t === 1;
        }
      }
      const need = rm + rs + YIELD_MARGIN;
      if (best >= need * need) continue;
      if (end && cut) continue;
      // xe đứng ở sau lưng xe đi (gần nhất là điểm đầu đường và nằm phía sau) và không chạm thân xe đi: không cản đường. Đang chạm
      // thì vẫn phải tránh (không thì nó lùi về ô đè lên xe đi, hai xe chặn nhau mãi: đo 16/11 lưới 3×3)
      if (first && ox * px + oz * pz < 0 && ox * ox + oz * oz >= (rm + rs) * (rm + rs)) continue;
      const spot = planYield(this, s, pts, need, null, ground, m);
      if (!spot) continue;
      request(this, s, spot[0], spot[1]);
      // chỗ dạt đè ô nhà xe đứng bên cạnh: xe đó dạt tiếp (một tầng), tránh cả lối lẫn chỗ dạt của xe trước
      const [yx, yz] = spot;
      for (const s2 of ground) {
        if (s2 === s || s2 === m || s2.side !== s.side || !this.canYield(s2)) continue;
        const r2 = rs + bodyRadius(s2.kind) + 0.1;
        const ex = s2.tx - yx;
        const ez = s2.tz - yz;
        if (ex > r2 || ex < -r2 || ez > r2 || ez < -r2 || ex * ex + ez * ez >= r2 * r2) continue;
        const spot2 = planYield(this, s2, pts, rm + bodyRadius(s2.kind) + YIELD_MARGIN, [yx, yz, r2], ground, m);
        if (spot2) request(this, s2, spot2[0], spot2[1]);
      }
    }
  }
}

const methods = { canYield, lane, yieldPass };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
