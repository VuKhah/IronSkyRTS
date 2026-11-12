/** Hằng số và hàm phụ dùng chung cho các phần của World (tách từ world.ts). */
import { PAD_OFFSETS, RULES, type WeaponVisual } from "../content";
import { dcos, DEG, dsin, TAU, turnStep, type TurnStep } from "../fmath";
import { CELL, GameMap } from "../maps";
import type { SideState } from "../types";


export const TICK_RATE = RULES.tickRate;
export const DT = 1 / TICK_RATE;
/** Đổi giây sang số tick. */
export const sec = (s: number): number => Math.round(s * TICK_RATE);

/** Cao hơn mức này thì máy bay là mục tiêu "trên không". */
export const AIRBORNE_ALT = 2;
export { PAD_OFFSETS };
export const SHOT_SPEED: Record<WeaponVisual, number> = { bullet: 90, cannon: 60, missile: 40, rocket: 30, bomb: 25, pulse: 120 };
/** 3 chỗ đứng đào quanh một mỏ. */
export const SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [3.9, 0],
  [-1.95, 3.38],
  [-1.95, -3.38]
];
export const IDLE_ACQUIRE_BONUS = 4;
export const LEASH = 12;
/** Lệnh trục vớt: các xác trong bán kính này (m) quanh xác được chạm được chia cho những xe còn lại. */
export const SALVAGE_POOL = 14;
/** Đường tới xác bị chặn quá chừng này lần thì bỏ, không tìm đường lại mãi. */
export const SALVAGE_RETRIES = 5;

/** Đội hình: khe hở giữa hai thân xe cạnh nhau (m). Hình dạng từng kiểu đội hình nằm ở `FORMATIONS` trong content.ts. */
export const FORMATION_GAP = 1.4;
/** Xe chậm hơn tốc độ khối được chạy nhanh hơn khối một chút để còn đuổi kịp ô của mình. */
export const SQUAD_CATCHUP = 1.08;
/** Khoảng cách giữa hai máy bay cạnh nhau trong đội hình mũi tên (m). */
export const AIR_FORMATION_GAP = 18;
/** Tới nơi mà phải đổi số xe mỗi hàng thì chờ thêm chừng này giây cho xe vào ô mới. */
export const SQUAD_RESHAPE_EXTRA = 8;
/** Va chạm giữa xe đang chạy và xe đứng yên: phần lực đẩy xe chạy phải chịu (xe đứng chịu phần còn lại). */
export const MOVER_SHARE = 0.85;
/**
 * Đẩy khỏi vách (địa hình bậc thang, 11/11/2026): tâm xe đã không vào được ô bị chặn, nhưng thân xe còn lấn vào vách / đá /
 * sông tới gần một bán kính (đo: Titan bán kính 1,9 m sát vách còn 1,0 m). Mỗi tick dò 8 điểm quanh thân ở chừng này lần bán
 * kính; điểm nào rơi vào ô bị chặn cố định thì đẩy xe ngược lại, tối đa WALL_PUSH m mỗi tick. Đẩy chứ không cấm bước: ở khe
 * hẹp hai bên đẩy triệt tiêu nhau nên xe vẫn đi giữa khe, không kẹt ở chỗ A* cho là đi được.
 */
export const WALL_CLEAR = 0.85;
export const WALL_PUSH = 0.3;
/** Đích sát vách được dời ra xa nhất chừng này (m) cho vừa thân xe (World.clearGoal). */
export const GOAL_SHIFT = 3;
/** Ô cách ô bị chặn cố định hơn chừng này ô (≥ 5 m > nửa thân xe dài nhất 4,5 m × WALL_CLEAR) thì thân xe chắc chắn không chạm vách. */
export const WALL_FAR = 3;
/** 16 hướng dò cách đều 22,5° (cos / sin viết sẵn thành hằng số, không gọi Math.cos trong sim); hướng đối nhau đứng liền nhau. */
export const C1 = 0.9238795325112867;
export const S1 = 0.3826834323650898;
export const R2 = 0.7071067811865476;
/** Hướng thử khi tìm chỗ đứng rải thảm: thẳng, rồi lệch dần hai bên (cos, sin). */
export const APPROACH_DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [C1, S1], [C1, -S1], [R2, R2], [R2, -R2], [S1, C1], [S1, -C1], [0, 1], [0, -1]
];
export const PROBES: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [R2, R2], [-R2, -R2], [R2, -R2], [-R2, R2],
  [C1, S1], [-C1, -S1], [S1, C1], [-S1, -C1],
  [-S1, C1], [S1, -C1], [-C1, S1], [C1, -S1]
];
/** Ô cửa ra trước cửa nhà có xe chạy ra: rộng × sâu (m). Loang tìm bãi trống trong ± `EXIT_ESCAPE` ô, hoặc đủ `EXIT_ROOM` ô. */
export const EXIT_W = 4;
export const EXIT_D = 2;
export const EXIT_ESCAPE = 12;
export const EXIT_ROOM = 300;
export const N4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Ô đỗ dỡ hàng của Xe Vận Tải: số ô mỗi cạnh Tổng Hành Dinh, khoảng cách giữa hai ô (m), tâm ô cách mép nhà (m). */
export const DOCK_PER_SIDE = 3;
export const DOCK_GAP = 3.2;
export const DOCK_OUT = 2.6;
/** Đội hình hành quân: bán kính quay nhỏ nhất của người dẫn đầu (m) khi đội hình hẹp (một hai xe mỗi hàng). */
export const SQUAD_MIN_TURN_R = 3;
/** Hướng đội hình lệch hướng đi mới quá góc này thì cả đội xoay tại chỗ trước rồi mới hành quân. */
export const SQUAD_PIVOT_COS = dcos(25 * DEG);
/** Xe lệch hướng muốn đi quá góc này thì đứng lại xoay tại chỗ; lệch ít hơn thì vừa chạy vừa chỉnh. */
export const PIVOT_COS = dcos(30 * DEG);
/** Coi như đã quay xong (lệch ≤ 3°). */
export const ALIGNED_COS = dcos(3 * DEG);
/** Xe lệch khỏi ô quá chừng này (m) thì cả khối chậm lại chờ; lệch gấp đôi thì dừng hẳn. */
export const SQUAD_LAG = 3;
/** Nhìn trước bao xa (m) theo đường đi để co đội hình trước khi vào chỗ hẹp. */
export const SQUAD_LOOK = 10;
/** Xe cách ô xa hơn chừng này (m), hoặc bị vật cản che, thì tìm đường A* tới ô thay vì đi thẳng. */
export const SQUAD_FAR = 9;
/** Tập hợp vào hàng / ổn định chỗ khi tới nơi tối đa bao lâu (giây), rồi cứ đi tiếp / giải tán. */
export const SQUAD_FORM_MAX = 15;
/**
 * Quãng ngắn (tâm nhóm → đích không quá chừng này mét, đường thẳng không vướng): mỗi xe đi thẳng tới ô của nó ở đích
 * (xoay một lần, chạy thẳng, xoay lại), không hành quân thành khối. Quãng dài hay phải vòng (cầu, khe) mới hành quân.
 */
export const SQUAD_DIRECT = 40;
export const SQUAD_SETTLE_MAX = 6;
/** Cả đội xoay tại chỗ tối đa bao lâu (giây): quá thì cứ đi tiếp (an toàn). */
export const SQUAD_PIVOT_MAX = 20;
/** Giãn thêm hàng khi đã đủ rộng liên tục bấy nhiêu lần đo (mỗi lần cách 3 tick: 7 lần ≈ 2 giây). */
export const SQUAD_WIDEN_CHECKS = 7;
/** Dời cả khối đội hình cho vừa chỗ: các vòng 2, 4, … 12 m quanh điểm bấm, 16 hướng, gần trước. */
export const SHIFT_OFFSETS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let r = 2; r <= 12; r += 2) for (let k = 0; k < 16; k++) out.push([r * dcos((k * TAU) / 16), r * dsin((k * TAU) / 16)]);
  return out;
})();
/** Ô dự phòng quanh một vị trí đội hình bị chặn / trùng: tính theo bước 1 ô lưới, gần trước. */
export const SLOT_NUDGE: readonly (readonly [number, number])[] = (() => {
  const pts: [number, number][] = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) pts.push([i, j]);
  pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || Math.abs(a[1]) - Math.abs(b[1]) || Math.abs(a[0]) - Math.abs(b[0]));
  return pts;
})();

export const TMP = { x: 0, z: 0 };

/** Bước xoay tháp pháo mỗi tick, tính sẵn theo tốc độ xoay (độ/giây). */
export const TRAVERSE = new Map<number, TurnStep>();
export function traverseStep(degPerSec: number): TurnStep {
  let t = TRAVERSE.get(degPerSec);
  if (!t) {
    t = turnStep(degPerSec * DEG * DT);
    TRAVERSE.set(degPerSec, t);
  }
  return t;
}
/** Nòng lệch dưới ~5° là coi như đã ngắm trúng. */
export const AIM_COS = dcos(5 * DEG);
/** Lái máy bay: vùng nắn nhẹ ±30° và thời gian để tốc độ ngoặt lên hết cỡ (giây). */
export const STEER_SOFT_COS = dcos(30 * DEG);
export const STEER_SOFT_SIN = dsin(30 * DEG);
export const STEER_RAMP = 0.25;
/** Tên lửa treo dưới cánh cách trục thân chừng này (m). */
export const MISSILE_PYLON = 1.35;
/** Khoảng cách giữa hai nòng súng đôi (m), ví dụ súng ở hai bên cánh. */
/** Số ô lưới một công trình chiếm theo một chiều: nhà nhỏ hơn bội số ô thì nằm chính giữa khối ô (chừa viền đều hai bên). */
export function cellsFor(half: number): number {
  return Math.ceil((half * 2) / CELL - 1e-9);
}

/**
 * Đưa tọa độ về tâm khối `n` ô: `n` chẵn thì tâm nằm trên đường lưới, `n` lẻ thì nằm giữa ô.
 * Làm tròn theo trị tuyệt đối để hai điểm đối xứng qua tâm bản đồ cho kết quả đối xứng (công bằng giữa hai phe).
 */
export function snapAxis(v: number, n: number, halfExtent: number, tie: number): number {
  const a = v < 0 ? -v : v;
  // đúng trên trục giữa bản đồ thì hai phía cách đều: để tọa độ kia quyết định, kết quả vẫn soi gương
  const flip = v < 0 || (v === 0 && tie < 0);
  const first = -halfExtent + (n % 2 === 0 ? 0 : CELL / 2);
  const r = first + Math.round((a - first) / CELL) * CELL;
  return flip ? -r : r;
}

export const BARREL_GAP = 1.6;
/** Bom rơi từ độ cao bay tới đất mất chừng này giây (bom trôi theo đà máy bay). */
export const BOMB_FALL = 1.2;
export const COS_CACHE = new Map<number, number>();
export function cosDeg(deg: number): number {
  let c = COS_CACHE.get(deg);
  if (c === undefined) {
    c = dcos(deg * DEG);
    COS_CACHE.set(deg, c);
  }
  return c;
}

/** Vòng tròn ô cho sương mù, tính sẵn theo bán kính (đơn vị ô). */
/**
 * Các tia nhìn của vùng nhìn bán kính r ô, tính sẵn theo bán kính (giống nhau cho mọi quân): mỗi tia đi từ tâm ra một
 * ô biên của đĩa. `off` là độ lệch ô (x, z) từng bước, `inv` là 1 / khoảng cách (m), `start[k]..start[k+1]` là tia k.
 */
export interface Rays {
  off: Int16Array;
  inv: Float64Array;
  start: Int32Array;
}
export const RAYS = new Map<number, Rays>();
export function rays(r: number): Rays {
  let R = RAYS.get(r);
  if (!R) {
    const lim = r * r + r;
    const inside = (x: number, z: number): boolean => x * x + z * z <= lim;
    const off: number[] = [];
    const inv: number[] = [];
    const start: number[] = [0];
    for (let z = -r; z <= r; z++)
      for (let x = -r; x <= r; x++) {
        if (!inside(x, z) || (inside(x + 1, z) && inside(x - 1, z) && inside(x, z + 1) && inside(x, z - 1))) continue;
        const n = Math.max(Math.abs(x), Math.abs(z));
        for (let i = 1; i <= n; i++) {
          const ox = Math.round((x * i) / n);
          const oz = Math.round((z * i) / n);
          if (!inside(ox, oz)) break;
          off.push(ox, oz);
          inv.push(1 / (Math.sqrt(ox * ox + oz * oz) * CELL));
        }
        start.push(inv.length);
      }
    R = { off: Int16Array.from(off), inv: Float64Array.from(inv), start: Int32Array.from(start) };
    RAYS.set(r, R);
  }
  return R;
}

export const DISCS = new Map<number, Int16Array>();
export function disc(r: number): Int16Array {
  let d = DISCS.get(r);
  if (!d) {
    const pts: number[] = [];
    for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) if (x * x + z * z <= r * r + r) pts.push(x, z);
    d = Int16Array.from(pts);
    DISCS.set(r, d);
  }
  return d;
}

export function dirToCenter(x: number, z: number): [number, number] {
  const l = Math.sqrt(x * x + z * z);
  return l < 1e-6 ? [1, 0] : [-x / l, -z / l];
}

export function newSide(cells: number): SideState {
  return {
    iron: RULES.startIron,
    oil: RULES.startOil,
    mobilizeUntil: -1,
    mobilizeReady: 0,
    retreatLevel: 0,
    droneFrac: 1,
    vis: new Uint8Array(cells),
    visAir: new Uint8Array(cells),
    explored: new Uint8Array(cells),
    known: new Set(),
    mono: 0,
    monoRes: null,
    powerCap: 0,
    powerUse: 0,
    powerPending: 0,
    eff: 1,
    battery: 0,
    batteryMax: 0,
    batteryFlow: 0,
    oilBurn: 0,
    alerts: { commander: -1000, base: -1000, hauler: -1000, lowfuel: -1000, nooil: -1000, mineLost: -1000, powerShort: -1000, powerForecast: -1000, oilLow: -1000, batteryLow: -1000, uplinkLost: -1000, droneLow: -1000 },
    stats: { unitsBuilt: 0, unitsLost: 0, kills: 0, ironMined: 0, oilMined: 0, buildingsBuilt: 0, damageDealt: 0, salvaged: 0, salvos: 0, promotions: 0, topRank: 0, uplinkTime: 0 }
  };
}

export interface WorldOptions {
  /** Tự xử hòa sau số tick này (0 = không giới hạn). Dùng cho chạy thử không giao diện. */
  maxTicks?: number;
  /** Phòng Thử Nghiệm: chỉ có 2 Tổng Hành Dinh, tài nguyên vô hạn, không xử thắng thua, nhận lệnh sb*. */
  sandbox?: boolean;
  /** Bản đồ: mã trong MAP_DEFS (mặc định "Thung Lũng Sông Sắt") hoặc một GameMap dựng sẵn (dùng cho kiểm thử). */
  map?: string | GameMap;
}

export interface SandboxState {
  /** Phe đang ngừng bắn. */
  hold: [boolean, boolean];
  infiniteFuel: boolean;
}

/** Tài nguyên luôn được nạp lại tới mức này trong Phòng Thử Nghiệm. */
export const SANDBOX_RES = 99999;
