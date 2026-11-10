/**
 * LÕI MÔ PHỎNG — World.
 *
 * Mỗi lần gọi step(lệnh) là trận đấu tiến thêm đúng 1 tick (0.1 giây). Thứ tự trong một tick luôn cố định:
 *   1. lưu vị trí cũ (để phần vẽ nội suy)   2. áp dụng lệnh   3. kinh tế   4. công trình (xây, đúc quân, tháp bắn)
 *   5. chiếm mỏ   6. quân (đi, nhắm, bắn; máy bay bay và đốt dầu)   7. đẩy xe không chồng lên nhau
 *   8. đạn tới đích → trừ máu   9. dọn xác   10. sương mù   11. kiểm tra thắng thua
 * Không có gì phụ thuộc thời gian thật hay số ngẫu nhiên không seed, nên cùng seed + cùng lệnh thì ra cùng trận.
 */
import { BUILDINGS, canStrike, defaultRot, DEFAULT_FORMATION, doorDir, normRot, rotHalf, rotOffset, FORMATIONS, lotCost, lotTime, PAD_OFFSETS, REAR_RANK, RULES, UNITS, valueOf, type BuildingId, type FormationId, type Mobility, type Res, type Side, type UnitId, type UnitSpec, type WeaponSpec, type WeaponVisual } from "./content";
import { assignMin } from "./assign";
import { clamp, dcos, DEG, dist2, dsin, Rng, TAU, turnStep, turnToward, type TurnStep } from "./fmath";
import { Grid } from "./grid";
import { CELL, GameMap, getMap, TERRAIN, TERRAIN_KINDS } from "./maps";
import type {
  Squad, AlertKind, Building, Command, Entity, Mine, Order, Shot, SideState, SimEvent, Target, Unit, Uplink, WinReason, Wreck } from "./types";

export const TICK_RATE = RULES.tickRate;
export const DT = 1 / TICK_RATE;
/** Đổi giây sang số tick. */
export const sec = (s: number): number => Math.round(s * TICK_RATE);

/** Cao hơn mức này thì máy bay là mục tiêu "trên không". */
export const AIRBORNE_ALT = 2;
export { PAD_OFFSETS };
const SHOT_SPEED: Record<WeaponVisual, number> = { bullet: 90, cannon: 60, missile: 40, rocket: 30, bomb: 25, pulse: 120 };
/** 3 chỗ đứng đào quanh một mỏ. */
const SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [3.9, 0],
  [-1.95, 3.38],
  [-1.95, -3.38]
];
const IDLE_ACQUIRE_BONUS = 4;
const LEASH = 12;
/** Lệnh trục vớt: các xác trong bán kính này (m) quanh xác được chạm được chia cho những xe còn lại. */
const SALVAGE_POOL = 14;
/** Đường tới xác bị chặn quá chừng này lần thì bỏ, không tìm đường lại mãi. */
const SALVAGE_RETRIES = 5;

/** Đội hình: khe hở giữa hai thân xe cạnh nhau (m). Hình dạng từng kiểu đội hình nằm ở `FORMATIONS` trong content.ts. */
const FORMATION_GAP = 1.4;
/** Xe chậm hơn tốc độ khối được chạy nhanh hơn khối một chút để còn đuổi kịp ô của mình. */
const SQUAD_CATCHUP = 1.08;
/** Khoảng cách giữa hai máy bay cạnh nhau trong đội hình mũi tên (m). */
const AIR_FORMATION_GAP = 18;
/** Tới nơi mà phải đổi số xe mỗi hàng thì chờ thêm chừng này giây cho xe vào ô mới. */
const SQUAD_RESHAPE_EXTRA = 8;
/** Va chạm giữa xe đang chạy và xe đứng yên: phần lực đẩy xe chạy phải chịu (xe đứng chịu phần còn lại). */
const MOVER_SHARE = 0.85;
/** Ô cửa ra trước cửa nhà có xe chạy ra: rộng × sâu (m). Loang tìm bãi trống trong ± `EXIT_ESCAPE` ô, hoặc đủ `EXIT_ROOM` ô. */
const EXIT_W = 4;
const EXIT_D = 2;
const EXIT_ESCAPE = 12;
const EXIT_ROOM = 300;
const N4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Ô đỗ dỡ hàng của Xe Vận Tải: số ô mỗi cạnh Tổng Hành Dinh, khoảng cách giữa hai ô (m), tâm ô cách mép nhà (m). */
const DOCK_PER_SIDE = 3;
const DOCK_GAP = 3.2;
const DOCK_OUT = 2.6;
/** Đội hình hành quân: bán kính quay nhỏ nhất của người dẫn đầu (m) khi đội hình hẹp (một hai xe mỗi hàng). */
const SQUAD_MIN_TURN_R = 3;
/** Hướng đội hình lệch hướng đi mới quá góc này thì cả đội xoay tại chỗ trước rồi mới hành quân. */
const SQUAD_PIVOT_COS = dcos(25 * DEG);
/** Xe lệch hướng muốn đi quá góc này thì đứng lại xoay tại chỗ; lệch ít hơn thì vừa chạy vừa chỉnh. */
const PIVOT_COS = dcos(30 * DEG);
/** Coi như đã quay xong (lệch ≤ 3°). */
const ALIGNED_COS = dcos(3 * DEG);
/** Xe lệch khỏi ô quá chừng này (m) thì cả khối chậm lại chờ; lệch gấp đôi thì dừng hẳn. */
const SQUAD_LAG = 3;
/** Nhìn trước bao xa (m) theo đường đi để co đội hình trước khi vào chỗ hẹp. */
const SQUAD_LOOK = 10;
/** Xe cách ô xa hơn chừng này (m), hoặc bị vật cản che, thì tìm đường A* tới ô thay vì đi thẳng. */
const SQUAD_FAR = 9;
/** Tập hợp vào hàng / ổn định chỗ khi tới nơi tối đa bao lâu (giây), rồi cứ đi tiếp / giải tán. */
const SQUAD_FORM_MAX = 15;
/**
 * Quãng ngắn (tâm nhóm → đích không quá chừng này mét, đường thẳng không vướng): mỗi xe đi thẳng tới ô của nó ở đích
 * (xoay một lần, chạy thẳng, xoay lại), không hành quân thành khối. Quãng dài hay phải vòng (cầu, khe) mới hành quân.
 */
const SQUAD_DIRECT = 40;
const SQUAD_SETTLE_MAX = 6;
/** Cả đội xoay tại chỗ tối đa bao lâu (giây): quá thì cứ đi tiếp (an toàn). */
const SQUAD_PIVOT_MAX = 20;
/** Giãn thêm hàng khi đã đủ rộng liên tục bấy nhiêu lần đo (mỗi lần cách 3 tick: 7 lần ≈ 2 giây). */
const SQUAD_WIDEN_CHECKS = 7;
/** Dời cả khối đội hình cho vừa chỗ: các vòng 2, 4, … 12 m quanh điểm bấm, 16 hướng, gần trước. */
const SHIFT_OFFSETS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let r = 2; r <= 12; r += 2) for (let k = 0; k < 16; k++) out.push([r * dcos((k * TAU) / 16), r * dsin((k * TAU) / 16)]);
  return out;
})();
/** Ô dự phòng quanh một vị trí đội hình bị chặn / trùng: tính theo bước 1 ô lưới, gần trước. */
const SLOT_NUDGE: readonly (readonly [number, number])[] = (() => {
  const pts: [number, number][] = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) pts.push([i, j]);
  pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || Math.abs(a[1]) - Math.abs(b[1]) || Math.abs(a[0]) - Math.abs(b[0]));
  return pts;
})();

const TMP = { x: 0, z: 0 };

/** Bước xoay tháp pháo mỗi tick, tính sẵn theo tốc độ xoay (độ/giây). */
const TRAVERSE = new Map<number, TurnStep>();
function traverseStep(degPerSec: number): TurnStep {
  let t = TRAVERSE.get(degPerSec);
  if (!t) {
    t = turnStep(degPerSec * DEG * DT);
    TRAVERSE.set(degPerSec, t);
  }
  return t;
}
/** Nòng lệch dưới ~5° là coi như đã ngắm trúng. */
const AIM_COS = dcos(5 * DEG);
/** Lái máy bay: vùng nắn nhẹ ±30° và thời gian để tốc độ ngoặt lên hết cỡ (giây). */
const STEER_SOFT_COS = dcos(30 * DEG);
const STEER_SOFT_SIN = dsin(30 * DEG);
const STEER_RAMP = 0.25;
/** Tên lửa treo dưới cánh cách trục thân chừng này (m). */
const MISSILE_PYLON = 1.35;
/** Khoảng cách giữa hai nòng súng đôi (m), ví dụ súng ở hai bên cánh. */
/** Số ô lưới một công trình chiếm theo một chiều: nhà nhỏ hơn bội số ô thì nằm chính giữa khối ô (chừa viền đều hai bên). */
function cellsFor(half: number): number {
  return Math.ceil((half * 2) / CELL - 1e-9);
}

/**
 * Đưa tọa độ về tâm khối `n` ô: `n` chẵn thì tâm nằm trên đường lưới, `n` lẻ thì nằm giữa ô.
 * Làm tròn theo trị tuyệt đối để hai điểm đối xứng qua tâm bản đồ cho kết quả đối xứng (công bằng giữa hai phe).
 */
function snapAxis(v: number, n: number, halfExtent: number, tie: number): number {
  const a = v < 0 ? -v : v;
  // đúng trên trục giữa bản đồ thì hai phía cách đều: để tọa độ kia quyết định, kết quả vẫn soi gương
  const flip = v < 0 || (v === 0 && tie < 0);
  const first = -halfExtent + (n % 2 === 0 ? 0 : CELL / 2);
  const r = first + Math.round((a - first) / CELL) * CELL;
  return flip ? -r : r;
}

const BARREL_GAP = 1.6;
/** Bom rơi từ độ cao bay tới đất mất chừng này giây (bom trôi theo đà máy bay). */
const BOMB_FALL = 1.2;
const COS_CACHE = new Map<number, number>();
function cosDeg(deg: number): number {
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
interface Rays {
  off: Int16Array;
  inv: Float64Array;
  start: Int32Array;
}
const RAYS = new Map<number, Rays>();
function rays(r: number): Rays {
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

const DISCS = new Map<number, Int16Array>();
function disc(r: number): Int16Array {
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

function newSide(cells: number): SideState {
  return {
    iron: RULES.startIron,
    oil: RULES.startOil,
    mobilizeUntil: -1,
    mobilizeReady: 0,
    vis: new Uint8Array(cells),
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
    alerts: { commander: -1000, base: -1000, hauler: -1000, lowfuel: -1000, nooil: -1000, mineLost: -1000, powerShort: -1000, powerForecast: -1000, oilLow: -1000, batteryLow: -1000, uplinkLost: -1000 },
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
const SANDBOX_RES = 99999;

export class World {
  tick = 0;
  readonly rng: Rng;
  /** Bản đồ của trận (không đổi trong trận). Trận được xác định bởi bản đồ + seed + danh sách lệnh. */
  readonly map: GameMap;
  readonly grid: Grid;
  /** Bảng ô đỗ dỡ hàng quanh Tổng Hành Dinh (tính một lần, xem `dockSlots`). */
  private docks: (readonly [number, number, number, number])[] | null = null;
  /** Độ cao mặt đất ở tâm từng ô lưới (m), tính một lần lúc tạo trận (địa hình không đổi). */
  readonly cellH: Float64Array;
  /** Vật che tầm nhìn đứng trên mặt đất từng ô (m): rừng cao 4 m, còn lại 0 (TERRAIN.losHeight). */
  readonly cellLos: Float64Array;
  units: Unit[] = [];
  /** Các đội hình đang hành quân (lệnh di chuyển cho từ 2 xe chiến đấu trở lên). */
  squads: Squad[] = [];
  buildings: Building[] = [];
  readonly mines: Mine[] = [];
  shots: Shot[] = [];
  /** Xác quân còn nằm trên chiến trường. */
  wrecks: Wreck[] = [];
  /** Đài Liên Lạc (điểm chiếm), theo vị trí trong dữ liệu bản đồ. */
  readonly uplinks: Uplink[] = [];
  readonly byId = new Map<number, Entity>();
  readonly sides: [SideState, SideState];
  events: SimEvent[] = [];
  winner: Side | 2 | -1 = -1;
  winReason: WinReason | null = null;
  readonly maxTicks: number;
  /** null = trận thường. */
  readonly sandbox: SandboxState | null;
  private nextId = 1;
  private commanders: [Unit | null, Unit | null] = [null, null];
  private sold = new Set<number>();

  constructor(
    readonly seed: number,
    opts: WorldOptions = {}
  ) {
    this.rng = new Rng(seed ^ 0x2545f491);
    this.maxTicks = opts.maxTicks ?? 0;
    this.sandbox = opts.sandbox ? { hold: [false, false], infiniteFuel: true } : null;
    const map = (this.map = opts.map instanceof GameMap ? opts.map : getMap(opts.map));
    const grid = (this.grid = new Grid(map));
    this.sides = [newSide(grid.size), newSide(grid.size)];
    this.cellH = new Float64Array(grid.size);
    for (let cz = 0; cz < grid.rows; cz++) for (let cx = 0; cx < grid.cols; cx++) this.cellH[cz * grid.cols + cx] = map.groundY(grid.centerX(cx), grid.centerZ(cz));
    this.cellLos = new Float64Array(grid.size);
    for (let i = 0; i < grid.size; i++) this.cellLos[i] = TERRAIN[TERRAIN_KINDS[grid.kind[i]]].losHeight;
    for (const m of map.mines) {
      const mine: Mine = {
        id: this.nextId++,
        cat: "mine",
        res: m.res,
        x: m.x,
        z: m.z,
        amount: m.amount ?? RULES.mineAmount[m.res],
        max: m.amount ?? RULES.mineAmount[m.res],
        owner: m.owner,
        cap: m.owner >= 0 ? 1 : 0,
        capSide: m.owner,
        slots: [],
        cells: this.grid.cellsInRect(m.x, m.z, 1.9, 1.9)
      };
      this.grid.block(mine.cells, 1);
      this.mines.push(mine);
      this.byId.set(mine.id, mine);
    }
    for (const [x, z] of map.points) this.uplinks.push({ id: this.nextId++, x, z, owner: -1, cap: 0, capSide: -1 });
    for (const s of [0, 1] as Side[]) {
      const [hx, hz] = map.bases[s];
      this.addBuilding("hq", s, hx, hz, true);
      if (this.sandbox) continue;
      const [dx, dz] = dirToCenter(hx, hz);
      const px = -dz;
      const pz = dx;
      this.spawnUnit("commander", s, hx + dx * 9, hz + dz * 9);
      this.spawnUnit("lynx", s, hx + dx * 9 + px * 5, hz + dz * 9 + pz * 5);
      const home = this.mines.find((m) => m.owner === s)!;
      for (let i = 0; i < 2; i++) this.spawnUnit("hauler", s, (hx + home.x) / 2 + px * (i * 3.5 - 1.75), (hz + home.z) / 2 + pz * (i * 3.5 - 1.75));
    }
    this.updateFog();
  }

  // ------------------------------------------------------------------ truy vấn công khai

  target(id: number): Target | null {
    const e = this.byId.get(id);
    return e && e.cat !== "mine" && e.hp > 0 ? e : null;
  }

  isAirborne(e: Target): boolean {
    return e.cat === "unit" && e.alt > AIRBORNE_ALT;
  }

  /** Phe `side` có đang nhìn thấy ô chứa điểm (x, z) không. */
  cellVisible(side: Side, x: number, z: number): boolean {
    return this.sides[side].vis[this.grid.index(x, z)] === 1;
  }

  visibleTo(side: Side, e: Target | Mine): boolean {
    if (e.cat !== "mine" && e.side === side) return true;
    // Lộ vị trí sau khi bắn (Pháo): thấy xuyên sương mù trong vài giây
    if (e.cat === "unit") {
      const rv = UNITS[e.kind].weapon?.reveal;
      if (rv && this.tick - e.lastShot <= sec(rv)) return true;
    }
    if (e.cat === "building") {
      const vis = this.sides[side].vis;
      for (const c of e.cells) if (vis[c] === 1) return true;
      return false;
    }
    return this.cellVisible(side, e.x, e.z);
  }

  radiusOf(e: Target): number {
    return e.cat === "unit" ? UNITS[e.kind].radius : Math.max(BUILDINGS[e.kind].half[0], BUILDINGS[e.kind].half[1]);
  }

  hqOf(side: Side): Building | null {
    for (const b of this.buildings) if (b.side === side && b.kind === "hq" && b.hp > 0) return b;
    return null;
  }

  commanderOf(side: Side): Unit | null {
    const c = this.commanders[side];
    return c && c.hp > 0 ? c : null;
  }

  /** Số quân tính vào giới hạn (không gồm Xe Tư Lệnh), cộng cả quân đang chờ đúc. */
  unitCount(side: Side): number {
    let n = 0;
    for (const u of this.units) if (u.side === side && u.kind !== "commander") n++;
    for (const b of this.buildings) if (b.side === side) for (const k of b.queue) n += UNITS[k].batch;
    return n;
  }

  canHit(w: WeaponSpec, t: Target): boolean {
    return this.isAirborne(t) ? w.dmgAir > 0 : w.dmgGround > 0;
  }

  padPos(b: Building, i: number): [number, number] {
    const [ox, oz] = rotOffset(PAD_OFFSETS[i][0], PAD_OFFSETS[i][1], b.rot);
    return [b.x + ox, b.z + oz];
  }

  /** Tọa độ thật của công trình nếu đặt ở (x, z): tâm khối ô lưới mà nó chiếm. */
  snapBuilding(kind: BuildingId, x: number, z: number, rot = 0): [number, number] {
    const [hw, hd] = rotHalf(kind, rot);
    return [snapAxis(x, cellsFor(hw), this.map.halfW, z), snapAxis(z, cellsFor(hd), this.map.halfH, x)];
  }

  /** Số ô lưới công trình chiếm theo x và z. */
  blockCells(kind: BuildingId, rot = 0): [number, number] {
    const [hw, hd] = rotHalf(kind, rot);
    return [cellsFor(hw), cellsFor(hd)];
  }

  /** Nửa kích thước khối ô lưới công trình chiếm (lớn hơn hoặc bằng `half`). */
  blockHalf(kind: BuildingId, rot = 0): [number, number] {
    const [hw, hd] = rotHalf(kind, rot);
    return [(cellsFor(hw) * CELL) / 2, (cellsFor(hd) * CELL) / 2];
  }

  /**
   * Ô cửa ra của công trình có xe mặt đất chạy ra (Tổng Hành Dinh, Xưởng Xe Tăng, Xưởng Xe Chuyên Dụng): hình chữ nhật
   * `EXIT_W` × `EXIT_D` m ngay trước cửa (phía `doorDir(rot)`). Trả về [tâm x, tâm z, nửa rộng, nửa sâu], hoặc null nếu nhà
   * không có xe chạy ra. Người dùng 10/11/2026: nhà được đặt sát nhau, miễn là xe vẫn ra được.
   */
  exitRect(kind: BuildingId, x: number, z: number, rot: number): [number, number, number, number] | null {
    if (!BUILDINGS[kind].produces?.some((u) => UNITS[u].domain === "ground")) return null;
    const [bw, bd] = this.blockHalf(kind, rot);
    const [dx, dz] = doorDir(rot);
    return dz !== 0 ? [x, z + dz * (bd + EXIT_D / 2), EXIT_W / 2, EXIT_D / 2] : [x + dx * (bw + EXIT_D / 2), z, EXIT_D / 2, EXIT_W / 2];
  }

  /**
   * Từ ô cửa ra có ra được bãi trống không, coi như các ô `extra` cũng bị chắn (nền móng của nhà đang định đặt).
   * Loang theo 4 hướng trong cửa sổ ± `EXIT_ESCAPE` ô: chạm mép cửa sổ, hoặc vùng loang được từ `EXIT_ROOM` ô trở lên,
   * thì coi là thông. Kết quả chỉ là đúng / sai nên không phụ thuộc thứ tự loang (tất định, đối xứng giữa hai phe).
   */
  private exitOpen(e: readonly [number, number, number, number], extra: ReadonlySet<number>): boolean {
    const g = this.grid;
    const ox = g.cellX(e[0]);
    const oz = g.cellZ(e[1]);
    const seen = new Set<number>();
    const queue: number[] = [];
    for (const i of g.cellsInRect(e[0], e[1], e[2], e[3]))
      if (!g.blockedIdx(i) && !extra.has(i)) {
        seen.add(i);
        queue.push(i);
      }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const cx = i % g.cols;
      const cz = (i - cx) / g.cols;
      if (Math.max(Math.abs(cx - ox), Math.abs(cz - oz)) >= EXIT_ESCAPE || seen.size >= EXIT_ROOM) return true;
      for (const [dx, dz] of N4) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= g.cols || nz >= g.rows) continue;
        const j = nz * g.cols + nx;
        if (seen.has(j) || g.blockedIdx(j) || extra.has(j)) continue;
        seen.add(j);
        queue.push(j);
      }
    }
    return false;
  }

  /**
   * Luật bố trí khi đặt nhà ở (x, z) (đã nằm trên lưới, nền móng đã trống): không đè lên cửa ra của nhà nào, cửa ra của
   * chính nó phải trống, và mọi cửa ra gần đó (kể cả của nó) vẫn thông ra bãi trống. Thay cho luật cũ "chừa lối 2 ô".
   */
  private layoutError(kind: BuildingId, x: number, z: number, rot: number): string | null {
    const [hw, hd] = this.blockHalf(kind, rot);
    const exits: { name: string; e: [number, number, number, number] }[] = [];
    const myClear = (BUILDINGS[kind].clearCells ?? 0) * CELL;
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      // đệm cho xe vận tải ra vào (Tổng Hành Dinh…): lấy đệm lớn hơn của hai nhà
      const pad = Math.max(myClear, (BUILDINGS[b.kind].clearCells ?? 0) * CELL);
      if (pad > 0) {
        const [ow, od] = this.blockHalf(b.kind, b.rot);
        if (Math.abs(b.x - x) < hw + ow + pad - 1e-6 && Math.abs(b.z - z) < hd + od + pad - 1e-6) {
          const who = BUILDINGS[b.kind].clearCells ? BUILDINGS[b.kind].name : BUILDINGS[kind].name;
          return `Phải chừa ${pad / CELL} ô quanh ${who} cho xe vận tải ra vào`;
        }
      }
      const e = this.exitRect(b.kind, b.x, b.z, b.rot);
      if (!e) continue;
      if (Math.abs(e[0] - x) < e[2] + hw - 1e-6 && Math.abs(e[1] - z) < e[3] + hd - 1e-6) return `Không được chắn cửa ra của ${BUILDINGS[b.kind].name}`;
      if (Math.abs(e[0] - x) <= hw + EXIT_ESCAPE * CELL && Math.abs(e[1] - z) <= hd + EXIT_ESCAPE * CELL) exits.push({ name: BUILDINGS[b.kind].name, e });
    }
    const foot = new Set(this.grid.cellsInRect(x, z, hw, hd));
    const own = this.exitRect(kind, x, z, rot);
    if (own) {
      if (!this.map.fits(own[0], own[1], own[2], own[3])) return "Cửa ra nằm ngoài bản đồ";
      for (const i of this.grid.cellsInRect(own[0], own[1], own[2], own[3])) if (this.grid.blockedIdx(i)) return "Cửa ra bị chắn, xe không ra được";
      if (!this.exitOpen(own, foot)) return "Cửa ra bị vây kín, xe không ra được";
    }
    for (const { name, e } of exits) if (!this.exitOpen(e, foot)) return `Sẽ vây kín cửa ra của ${name}`;
    return null;
  }

  /**
   * Ô lưới có tâm (x, z) có bị cấm xây với mọi công trình không (chỉ để hiện lưới đỏ khi Tư lệnh đang chọn chỗ đặt; người
   * dùng 10/11/2026). Cùng luật với `canPlace`: ngoài vùng xây, vướng sông / đá / nhà / mỏ, sát mỏ, là ô cửa ra, hoặc nằm
   * trong đệm `clearCells` của nhà khác. Không thay đổi trạng thái.
   */
  cellForbidden(side: Side, x: number, z: number): boolean {
    if (this.grid.blockedAt(x, z)) return true;
    for (const m of this.mines) if (dist2(m.x, m.z, x, z) < 5 * 5) return true;
    let inZone = false;
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      const e = this.exitRect(b.kind, b.x, b.z, b.rot);
      if (e && Math.abs(x - e[0]) < e[2] && Math.abs(z - e[1]) < e[3]) return true;
      const pad = (BUILDINGS[b.kind].clearCells ?? 0) * CELL;
      if (pad > 0) {
        const [ow, od] = this.blockHalf(b.kind, b.rot);
        if (Math.abs(x - b.x) < ow + pad && Math.abs(z - b.z) < od + pad) return true;
      }
      const zone = BUILDINGS[b.kind].zone;
      if (!inZone && zone && b.side === side && b.built && dist2(b.x, b.z, x, z) <= zone * zone) inZone = true;
    }
    return !inZone;
  }

  /** null = được phép xây; ngược lại là lý do (tiếng Việt) để hiện cho người chơi. */
  canPlace(side: Side, kind: BuildingId, x: number, z: number, rotIn?: number): string | null {
    const rot = normRot(rotIn) ?? defaultRot(kind, z);
    [x, z] = this.snapBuilding(kind, x, z, rot);
    const [hw, hd] = this.blockHalf(kind, rot);
    if (!this.map.fits(x, z, hw, hd)) return "Ngoài bản đồ";
    for (const i of this.grid.cellsInRect(x, z, hw, hd)) if (this.grid.blockedIdx(i)) return "Vướng sông, đá hoặc công trình";
    const lay = this.layoutError(kind, x, z, rot);
    if (lay) return lay;
    const big = Math.max(hw, hd);
    for (const m of this.mines) if (dist2(m.x, m.z, x, z) < (5 + big) * (5 + big)) return "Quá gần mỏ";
    for (const u of this.units) {
      if (u.air !== "none" && u.air !== "parked") continue;
      const r = UNITS[u.kind].radius;
      if (Math.abs(u.x - x) < hw + r && Math.abs(u.z - z) < hd + r) return "Có xe đang đứng ở đó";
    }
    for (const b of this.buildings) {
      if (b.side !== side || !b.built || b.hp <= 0) continue;
      const zone = BUILDINGS[b.kind].zone;
      if (!zone) continue;
      const reach = zone + big;
      if (dist2(b.x, b.z, x, z) <= reach * reach) return null;
    }
    return "Phải xây trong vùng của Tổng Hành Dinh, Nhà Máy Điện hoặc Cột Điện";
  }

  // ------------------------------------------------------------------ vòng tick

  step(cmds: readonly Command[]): void {
    if (this.winner !== -1) return;
    this.events = [];
    for (const u of this.units) {
      u.px = u.x;
      u.pz = u.z;
      u.palt = u.alt;
      u.phx = u.hx;
      u.phz = u.hz;
      u.moved = false;
      u.packing = false;
    }
    if (this.sandbox)
      for (const st of this.sides) {
        st.iron = SANDBOX_RES;
        st.oil = SANDBOX_RES;
      }
    for (const c of cmds) this.applyOrder(c.side, c.order);
    for (const s of [0, 1] as Side[]) if (this.hqOf(s)?.built) this.sides[s].iron += RULES.hqTrickle * DT;
    this.updateBuildings();
    this.updateMines();
    this.updateSquads();
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      if (u.air !== "none") this.updateAir(u);
      else this.updateGround(u);
    }
    this.separate();
    this.resolveShots();
    this.veteranRegen();
    this.cleanup();
    this.updateWrecks();
    this.updateFog();
    if (!this.sandbox) this.checkVictory();
    this.tick++;
  }

  // ------------------------------------------------------------------ tạo thực thể

  private spawnUnit(kind: UnitId, side: Side, x: number, z: number): Unit {
    const spec = UNITS[kind];
    let px = x;
    let pz = z;
    if (spec.domain === "ground") {
      const f = this.grid.nearestFree(x, z, 12);
      if (f) [px, pz] = f;
    }
    const [hx, hz] = dirToCenter(px, pz);
    const u: Unit = {
      id: this.nextId++,
      cat: "unit",
      kind,
      side,
      formation: null,
      lot: 0,
      x: px,
      z: pz,
      px,
      pz,
      hx,
      hz,
      phx: hx,
      phz: hz,
      alt: 0,
      palt: 0,
      hp: spec.hp,
      maxHp: spec.hp,
      cooldown: 0,
      lastShot: -1000,
      burst: 0,
      still: 0,
      aimX: hx,
      aimZ: hz,
      pd: spec.pointDefense?.charges ?? 0,
      pdT: 0,
      order: "idle",
      tx: px,
      tz: pz,
      targetId: 0,
      autoTarget: 0,
      path: [],
      pathI: 0,
      repathAt: 0,
      stuck: 0,
      moved: false,
      packing: false,
      chasing: false,
      faceX: 0,
      faceZ: 0,
      squad: 0,
      hState: "idle",
      mineId: 0,
      manual: false,
      cargo: 0,
      cargoRes: "iron",
      hTimer: 0,
      wreckId: 0,
      scrap: 0,
      air: spec.domain === "air" ? "parked" : "none",
      fuel: spec.fuel?.tank ?? 0,
      padB: 0,
      padI: -1,
      speed: 0,
      airT: 0,
      mission: "none",
      mx: px,
      mz: pz,
      rtb: false,
      ax: 0,
      az: 0,
      crashed: false,
      ext: false,
      yawRate: 0,
      cd2: 0,
      ammo2: spec.secondary?.ammo ?? 0,
      xp: 0,
      rank: 0,
      lastHit: -1000
    };
    this.units.push(u);
    this.byId.set(u.id, u);
    if (kind === "commander") this.commanders[side] = u;
    this.events.push({ t: "spawn", id: u.id, kind, side });
    return u;
  }

  private addBuilding(kind: BuildingId, side: Side, x: number, z: number, built: boolean, rotIn?: number): Building {
    const spec = BUILDINGS[kind];
    const rot = normRot(rotIn) ?? defaultRot(kind, z);
    [x, z] = this.snapBuilding(kind, x, z, rot);
    const [blockW, blockD] = this.blockHalf(kind, rot);
    const cells = this.grid.cellsInRect(x, z, blockW, blockD);
    this.grid.block(cells, 1);
    const [dx, dz] = dirToCenter(x, z);
    const reach = Math.max(spec.half[0], spec.half[1]) + 6;
    const b: Building = {
      id: this.nextId++,
      cat: "building",
      kind,
      side,
      x,
      z,
      rot,
      hp: built ? spec.hp : spec.hp * 0.1,
      maxHp: spec.hp,
      progress: built ? 1 : 0,
      built,
      queue: [],
      prog: 0,
      rallyX: x + dx * reach,
      rallyZ: z + dz * reach,
      rallySet: false,
      aimX: dx,
      aimZ: dz,
      cooldown: 0,
      lastShot: -1000,
      burst: 0,
      targetId: 0,
      cells,
      pads: kind === "airfield" ? new Array<number>(RULES.air.pads).fill(0) : [],
      active: false,
      powerFrac: 1,
      load: 0,
      charge: 0
    };
    this.buildings.push(b);
    this.byId.set(b.id, b);
    return b;
  }

  // ------------------------------------------------------------------ lệnh

  private ownUnits(side: Side, ids: readonly number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const e = this.byId.get(id);
      if (e && e.cat === "unit" && e.side === side && e.hp > 0 && !out.includes(e)) out.push(e);
    }
    return out.sort((a, b) => a.id - b.id);
  }

  private ownBuilding(side: Side, id: number): Building | null {
    const e = this.byId.get(id);
    return e && e.cat === "building" && e.side === side && e.hp > 0 ? e : null;
  }

  private applyOrder(side: Side, o: Order): void {
    // lệnh mới cho xe nào thì xe đó rời đội hình cũ (lệnh di chuyển nhóm sẽ lập đội hình mới)
    if ("ids" in o)
      for (const id of o.ids) {
        const u = this.byId.get(id);
        if (u && u.cat === "unit" && u.side === side && u.squad) this.leaveSquad(u);
      }
    switch (o.t) {
      case "move":
      case "amove":
        this.orderMove(side, o.ids, o.x, o.z, o.t, o.formation);
        break;
      case "barrage":
        this.orderStrike(side, o.ids, o.x, o.z);
        break;
      case "mobilize":
        this.mobilize(side);
        break;
      case "attack": {
        const t = this.target(o.target);
        if (!t || t.side === side) break;
        for (const u of this.ownUnits(side, o.ids)) this.orderAttack(u, t);
        break;
      }
      case "stop":
        for (const u of this.ownUnits(side, o.ids)) this.orderStop(u);
        break;
      case "harvest": {
        const m = this.byId.get(o.mine);
        if (!m || m.cat !== "mine") break;
        const others: number[] = [];
        for (const u of this.ownUnits(side, o.ids)) {
          if (u.kind !== "hauler") {
            others.push(u.id);
            continue;
          }
          u.manual = false;
          u.order = "idle";
          this.releaseWreck(u);
          if (!this.assignMine(u, m.id)) {
            // mỏ chưa thuộc phe mình: chạy tới đó chờ (quân khác sẽ chiếm)
            u.manual = true;
            u.order = "move";
            this.setPath(u, m.x, m.z);
          }
        }
        if (others.length) this.orderMove(side, others, m.x, m.z, "amove");
        break;
      }
      case "salvage": {
        const first = this.wrecks.find((wr) => wr.id === o.wreck);
        if (!first) break;
        // mỗi xe một xác: xác được chạm trước, rồi các xác khác ở gần đó
        const pool = [first, ...this.wrecks.filter((wr) => wr !== first && dist2(wr.x, wr.z, first.x, first.z) <= SALVAGE_POOL * SALVAGE_POOL)];
        const taken = new Set<Wreck>();
        const others: number[] = [];
        for (const u of this.ownUnits(side, o.ids)) {
          if (u.kind !== "hauler") {
            others.push(u.id);
            continue;
          }
          // ưu tiên xác chưa có xe phe mình nhận; hết thì nhận thay xe hậu cần tự điều (xe đó quay về việc cũ)
          const free = pool.find((wr) => !taken.has(wr) && (wr.claim[side] <= 0 || wr.claim[side] === u.id));
          const wr = free ?? pool.find((p) => !taken.has(p));
          if (!wr) continue;
          taken.add(wr);
          u.manual = false;
          u.order = "idle";
          this.startSalvage(u, wr);
        }
        if (others.length) this.orderMove(side, others, first.x, first.z, "amove");
        break;
      }
      case "rtb":
        for (const u of this.ownUnits(side, o.ids)) {
          if (u.air === "flying" || u.air === "takeoff") u.rtb = true;
          if (u.air === "parked") u.mission = "none";
        }
        break;
      case "build":
        this.orderBuild(side, o.kind, o.x, o.z, o.rot);
        break;
      case "produce": {
        const b = this.ownBuilding(side, o.building);
        if (!b || !b.built || !BUILDINGS[b.kind].produces?.includes(o.kind)) break;
        const us = UNITS[o.kind];
        if (!us.cost || !us.mvp || b.queue.length >= RULES.queueMax || this.unitCount(side) + us.batch > RULES.unitCap) break;
        const cost = lotCost(o.kind);
        const st = this.sides[side];
        if (st.iron < cost.iron || st.oil < cost.oil) break;
        st.iron -= cost.iron;
        st.oil -= cost.oil;
        b.queue.push(o.kind);
        break;
      }
      case "cancel": {
        const b = this.ownBuilding(side, o.building);
        if (!b || b.queue.length === 0) break;
        const k = b.queue.pop()!;
        const cost = lotCost(k);
        this.sides[side].iron += cost.iron;
        this.sides[side].oil += cost.oil;
        if (b.queue.length === 0) b.prog = 0;
        break;
      }
      case "rally": {
        const b = this.ownBuilding(side, o.building);
        if (!b) break;
        b.rallyX = clamp(o.x, -this.map.edgeX, this.map.edgeX);
        b.rallyZ = clamp(o.z, -this.map.edgeZ, this.map.edgeZ);
        b.rallySet = true;
        break;
      }
      case "sell": {
        const b = this.ownBuilding(side, o.building);
        if (!b || b.kind === "hq") break;
        const cost = BUILDINGS[b.kind].cost;
        if (cost) {
          const k = b.built ? RULES.sellRefund : 1;
          this.sides[side].iron += cost.iron * k;
          this.sides[side].oil += cost.oil * k;
        }
        for (const q of b.queue) {
          const c = lotCost(q);
          this.sides[side].iron += c.iron;
          this.sides[side].oil += c.oil;
        }
        b.queue = [];
        b.hp = 0;
        this.sold.add(b.id);
        break;
      }
      default:
        if (this.sandbox) this.applySandbox(this.sandbox, o);
        break;
    }
  }

  // ------------------------------------------------------------------ Phòng Thử Nghiệm

  /** null = thả được công trình ở đây (Phòng Thử Nghiệm bỏ qua luật vùng xây và giá tiền). */
  sandboxPlaceError(kind: BuildingId, x: number, z: number, rotIn?: number): string | null {
    const rot = normRot(rotIn) ?? defaultRot(kind, z);
    [x, z] = this.snapBuilding(kind, x, z, rot);
    const [hw, hd] = this.blockHalf(kind, rot);
    if (!this.map.fits(x, z, hw, hd)) return "Ngoài bản đồ";
    for (const i of this.grid.cellsInRect(x, z, hw, hd)) if (this.grid.blockedIdx(i)) return "Vướng sông, đá, mỏ hoặc công trình";
    const lay = this.layoutError(kind, x, z, rot);
    if (lay) return lay;
    return null;
  }

  private applySandbox(sb: SandboxState, o: Order): void {
    switch (o.t) {
      case "sbSpawn": {
        if (o.kind in BUILDINGS) {
          const kind = o.kind as BuildingId;
          const x = Math.round(o.x);
          const z = Math.round(o.z);
          if (this.sandboxPlaceError(kind, x, z, o.rot) === null) this.addBuilding(kind, o.side, x, z, true, o.rot);
          break;
        }
        const kind = o.kind as UnitId;
        if (!(kind in UNITS)) break;
        const x = clamp(o.x, -this.map.edgeX + 2, this.map.edgeX - 2);
        const z = clamp(o.z, -this.map.edgeZ + 2, this.map.edgeZ - 2);
        const u = this.spawnUnit(kind, o.side, x, z);
        const spec = UNITS[kind];
        if (spec.domain === "air") {
          // không có Sân Đáp thì không cất cánh được: thả thẳng lên trời, bay vòng chờ tại chỗ
          u.air = "flying";
          u.alt = u.palt = RULES.air.cruiseAlt;
          u.speed = spec.speed;
          u.mission = "move";
          u.mx = clamp(x, -this.map.airX, this.map.airX);
          u.mz = clamp(z, -this.map.airZ, this.map.airZ);
        }
        if (o.gx !== undefined && o.gz !== undefined) {
          if (spec.domain === "air") {
            // máy bay thả ra đã hướng mũi về đích, để đường bay thẳng
            const dx = o.gx - u.x;
            const dz = o.gz - u.z;
            const l = Math.sqrt(dx * dx + dz * dz);
            if (l > 1e-6) {
              u.hx = u.phx = dx / l;
              u.hz = u.phz = dz / l;
            }
          }
          this.orderMove(o.side, [u.id], o.gx, o.gz, o.go ?? "amove");
        }
        break;
      }
      case "sbRemove":
        for (const id of o.ids) {
          const e = this.target(id);
          if (!e) continue;
          e.hp = 0;
          // xóa bằng công cụ: công trình không nổ to, quân không để lại xác
          this.sold.add(e.id);
        }
        break;
      case "sbHeal":
        for (const id of o.ids) {
          const e = this.target(id);
          if (!e) continue;
          e.hp = e.maxHp;
          if (e.cat === "unit") e.fuel = UNITS[e.kind].fuel?.tank ?? 0;
        }
        break;
      case "sbClear":
        for (const u of this.units) {
          u.hp = 0;
          this.sold.add(u.id);
        }
        this.wrecks = [];
        for (const b of this.buildings)
          if (b.kind !== "hq") {
            b.hp = 0;
            this.sold.add(b.id);
          }
        this.shots = [];
        for (const st of this.sides) {
          st.stats.damageDealt = 0;
          st.stats.kills = 0;
          st.stats.unitsLost = 0;
        }
        break;
      case "sbHold":
        sb.hold[o.side] = o.on;
        break;
      case "sbGo": {
        const ids = this.units.filter((u) => u.side === o.side && u.air === "none" && u.hp > 0).map((u) => u.id);
        if (ids.length) this.orderMove(o.side, ids, o.x, o.z, "amove");
        break;
      }
      case "sbFuel":
        sb.infiniteFuel = o.on;
        break;
      default:
        break;
    }
  }

  /**
   * Đội hình hiện tại của một nhóm xe: kiểu được nhiều xe nhất (ghép hai sư đoàn khác kiểu thì theo bên đông hơn, bằng nhau
   * thì theo thứ tự bảng FORMATIONS để tất định). null = chưa xe nào được chọn kiểu.
   */
  formationOf(units: readonly Unit[]): FormationId | null {
    let best: FormationId | null = null;
    let most = 0;
    for (const id of Object.keys(FORMATIONS) as FormationId[]) {
      let n = 0;
      for (const u of units) if (u.formation === id) n++;
      if (n > most) {
        most = n;
        best = id;
      }
    }
    return best;
  }

  /**
   * Máy bay cùng một lệnh bay theo đội hình mũi tên, mỗi chiếc một điểm đến, thay vì cùng lao vào một điểm rồi dồn cục
   * (người dùng 09/11/2026: phải thấy được sự hoành tráng của đội bay). Chiếc số nhỏ dẫn đầu, các chiếc sau xòe hai cánh.
   */
  private airSlots(units: readonly Unit[], x: number, z: number): Map<number, [number, number]> {
    const out = new Map<number, [number, number]>();
    const air = units.filter((u) => u.air !== "none").sort((a, b) => a.id - b.id);
    if (air.length < 2) return out;
    let cx = 0;
    let cz = 0;
    for (const u of air) {
      cx += u.x / air.length;
      cz += u.z / air.length;
    }
    let hx = x - cx;
    let hz = z - cz;
    const l = Math.sqrt(hx * hx + hz * hz);
    if (l < 1e-6) {
      hx = 0;
      hz = 1;
    } else {
      hx /= l;
      hz /= l;
    }
    air.forEach((u, i) => {
      const wing = Math.ceil(i / 2);
      const lat = (i % 2 === 1 ? -wing : wing) * AIR_FORMATION_GAP;
      const back = wing * AIR_FORMATION_GAP * 0.7;
      out.set(u.id, [x + hz * lat - hx * back, z - hx * lat - hz * back]);
    });
    return out;
  }

  private orderMove(side: Side, ids: readonly number[], x: number, z: number, kind: "move" | "amove", formation?: FormationId): void {
    const units = this.ownUnits(side, ids);
    // từ 2 xe chiến đấu trở lên: hành quân thành đội hình (Xe Vận Tải đi riêng, vì còn việc hậu cần)
    const fighters = units.filter((u) => u.air === "none" && u.kind !== "hauler");
    const inSquad = fighters.length > 1 ? new Set(fighters.map((u) => u.id)) : null;
    if (inSquad) this.createSquad(side, fighters, x, z, kind, formation);
    if (formation) for (const u of units) u.formation = formation;
    const ground = units.filter((u) => u.air === "none" && !inSquad?.has(u.id));
    const plan = this.formation(ground, x, z);
    const airSlots = this.airSlots(units, x, z);
    for (const u of units) {
      if (inSquad?.has(u.id)) continue;
      if (u.air !== "none") {
        const [ax, az] = airSlots.get(u.id) ?? [x, z];
        u.mission = "move";
        u.mx = clamp(ax, -this.map.airX, this.map.airX);
        u.mz = clamp(az, -this.map.airZ, this.map.airZ);
        u.targetId = 0;
        u.autoTarget = 0;
        this.cancelRtbIfFuel(u);
        continue;
      }
      if (u.kind === "hauler") {
        this.releaseMine(u);
        this.releaseWreck(u);
        u.manual = true;
        u.hState = "idle";
      }
      const f = plan.slots.get(u.id) ?? [x, z];
      u.faceX = plan.fx;
      u.faceZ = plan.fz;
      u.order = kind;
      u.targetId = 0;
      u.autoTarget = 0;
      u.chasing = false;
      u.tx = f[0];
      u.tz = f[1];
      this.setPath(u, f[0], f[1]);
    }
  }

  /**
   * Đội hình hàng ngang cho một nhóm quân mặt đất (người dùng 06/11/2026: "xếp hàng ngay ngắn, không dính cục"):
   * - quay mặt theo hướng hành quân (tâm nhóm → đích; đích quá gần thì theo hướng trung bình của nhóm);
   * - hàng đầu / giữa / sau theo `UnitSpec.formation`; mỗi vai trò bắt đầu hàng mới; bề ngang ≈ √(n × 2,5) xe;
   * - khoảng cách theo kích cỡ xe thật (2 × bán kính lớn nhất trong hàng + khe hở), hàng cuối thiếu thì căn giữa;
   * - chia ô theo vị trí đang đứng (xe phía trước vào hàng trước, xe bên trái vào ô bên trái) để đường đi không cắt nhau;
   * - ô bị chặn hoặc trùng thì dịch sang ô trống gần nhất.
   * Tâm khối đội hình nằm ở điểm đích. Tất định: chỉ + − × ÷ √ và sắp xếp có khóa phụ là id.
   */
  private formation(units: readonly Unit[], x: number, z: number): { slots: Map<number, [number, number]>; fx: number; fz: number } {
    const slots = new Map<number, [number, number]>();
    const n = units.length;
    if (n === 0) return { slots, fx: 0, fz: 0 };
    let cx = 0;
    let cz = 0;
    for (const u of units) {
      cx += u.x / n;
      cz += u.z / n;
    }
    let fx = x - cx;
    let fz = z - cz;
    let l = Math.sqrt(fx * fx + fz * fz);
    if (l < 2) {
      fx = 0;
      fz = 0;
      for (const u of units) {
        fx += u.hx;
        fz += u.hz;
      }
      l = Math.sqrt(fx * fx + fz * fz);
      if (l < 1e-6) {
        fx = 0;
        fz = 1;
        l = 1;
      }
    }
    fx /= l;
    fz /= l;
    if (n === 1) {
      const u = units[0];
      slots.set(u.id, this.grid.nearestFree(x, z, 8) ?? [x, z]);
      return { slots, fx, fz };
    }
    const rx = fz; // vector sang phải (vuông góc hướng hành quân)
    const rz = -fx;
    const fwd = (u: Unit): number => (u.x - cx) * fx + (u.z - cz) * fz;
    const lat = (u: Unit): number => (u.x - cx) * rx + (u.z - cz) * rz;
    const rank = (u: Unit): number => FORMATIONS[DEFAULT_FORMATION].rank[UNITS[u.kind].group];
    const order = [...units].sort((a, b) => rank(a) - rank(b) || fwd(b) - fwd(a) || a.id - b.id);
    const cols = Math.min(n, Math.ceil(Math.sqrt(n * FORMATIONS[DEFAULT_FORMATION].wide)));
    const rows: Unit[][] = [];
    for (const u of order) {
      const row = rows[rows.length - 1];
      if (!row || row.length >= cols || rank(row[0]) !== rank(u)) rows.push([u]);
      else row.push(u);
    }
    const rMax = (row: Unit[]): number => {
      let r = 0;
      for (const u of row) r = Math.max(r, UNITS[u.kind].radius);
      return r;
    };
    // vị trí từng hàng theo chiều sâu (hàng đầu = 0, lùi dần), rồi dời cho tâm khối nằm ở đích
    const depth: number[] = [0];
    for (let i = 1; i < rows.length; i++) depth.push(depth[i - 1] - (rMax(rows[i - 1]) + rMax(rows[i]) + FORMATION_GAP));
    const shift = -depth[depth.length - 1] / 2; // nửa bề sâu: đẩy cả khối lên để tâm khối nằm ở đích
    const used = new Set<number>();
    rows.forEach((row, ri) => {
      const spacing = 2 * rMax(row) + FORMATION_GAP;
      const f = depth[ri] + shift;
      row.sort((a, b) => lat(a) - lat(b) || a.id - b.id);
      row.forEach((u, i) => {
        const s = (i - (row.length - 1) / 2) * spacing;
        slots.set(u.id, this.freeSlot(x + rx * s + fx * f, z + rz * s + fz * f, rx, rz, fx, fz, used));
      });
    });
    return { slots, fx, fz };
  }

  /** Ô trống gần (x, z) nhất chưa có xe nào trong đội hình nhận (dò theo khung đội hình, bước 1 ô lưới). */
  private freeSlot(x: number, z: number, rx: number, rz: number, fx: number, fz: number, used: Set<number>, from?: readonly [number, number]): [number, number] {
    for (const [i, j] of SLOT_NUDGE) {
      const px = x + (rx * i + fx * j) * CELL;
      const pz = z + (rz * i + fz * j) * CELL;
      if (!this.map.fits(px, pz, 1, 1) || this.grid.blockedAt(px, pz)) continue;
      // phải cùng một khoảng trống với tâm đội hình (không nhảy sang bờ sông bên kia hay sau vách đá)
      if (from && !this.grid.los(from[0], from[1], px, pz)) continue;
      const c = this.grid.index(px, pz);
      if (used.has(c)) continue;
      used.add(c);
      return [px, pz];
    }
    const f = this.grid.nearestFree(x, z, 8) ?? [x, z];
    used.add(this.grid.index(f[0], f[1]));
    return f;
  }

  /** Tới đích lệnh di chuyển: đứng chờ; thân xe tự xoay dần về `faceX/faceZ` (cuối updateGround). */
  private arrive(u: Unit): void {
    this.setIdle(u);
  }

  /**
   * Quay thân xe về hướng (dx, dz) với tốc độ `turnRate` độ/giây: xoay tại chỗ (người dùng chốt 06/11/2026, mọi xe mặt đất).
   * Trả về true khi lệch ≤ 30° (được lăn bánh, vừa chạy vừa chỉnh tiếp). Quân cố định đang hạ bệ thì thu bệ trước, chưa quay.
   * Quay thân cũng tính là chuyển động (mất trạng thái cố định, phần vẽ cho xích / bánh chạy).
   */
  private turnHull(u: Unit, dx: number, dz: number): boolean {
    const spec = UNITS[u.kind];
    if (u.hx * dx + u.hz * dz < ALIGNED_COS) {
      const dep = spec.weapon?.deploy;
      if (dep && u.still > 0) {
        u.still = Math.min(u.still, sec(dep.time)) - 1;
        u.packing = true;
        return false;
      }
      turnToward(u.hx, u.hz, dx, dz, traverseStep(spec.turnRate ?? 90), TMP);
      u.hx = TMP.x;
      u.hz = TMP.z;
      u.moved = true;
    }
    return u.hx * dx + u.hz * dz >= PIVOT_COS;
  }

  // ------------------------------------------------------------------ đội hình hành quân (squad)

  /** Lập đội hình cho một nhóm xe chiến đấu (từ 2 xe) đi tới (x, z). Xem `Squad` trong types.ts. */
  private createSquad(side: Side, units: readonly Unit[], x: number, z: number, kind: "move" | "amove", chosen?: FormationId): void {
    const n = units.length;
    // Tư lệnh chọn thì theo lựa chọn đó; không chọn thì đi tiếp kiểu đang dùng; chưa từng chọn thì mặc định
    const current = this.formationOf(units);
    const formation = chosen ?? current ?? DEFAULT_FORMATION;
    if (current) for (const u of units) u.formation = current; // ghép nhóm: mọi xe về một kiểu
    let cx = 0;
    let cz = 0;
    let ax = 0;
    let az = 0;
    for (const u of units) {
      cx += u.x / n;
      cz += u.z / n;
      ax += u.hx;
      az += u.hz;
    }
    // đội vừa giải tán cùng nhận một hướng đội hình (faceX/faceZ): dùng hướng đó, thân xe có thể đang quay dở
    const f0 = units[0];
    if ((f0.faceX !== 0 || f0.faceZ !== 0) && units.every((u) => u.faceX * f0.faceX + u.faceZ * f0.faceZ > 0.999)) {
      ax = f0.faceX * n;
      az = f0.faceZ * n;
    }
    const al = Math.sqrt(ax * ax + az * az);
    let wx = x - cx;
    let wz = z - cz;
    let wl = Math.sqrt(wx * wx + wz * wz);
    if (wl < 1e-6) {
      wx = al > 1e-6 ? ax : 0;
      wz = al > 1e-6 ? az : 1;
      wl = Math.sqrt(wx * wx + wz * wz);
    }
    wx /= wl;
    wz /= wl;
    const sq: Squad = {
      id: this.nextId++,
      side,
      kind,
      formation,
      rankOf: {},
      speed: 0,
      rigid: false,
      rolling: false,
      ids: [],
      offLat: [],
      offBack: [],
      cols: 1,
      colsMax: 1,
      width: 0,
      depth: 0,
      rMax: 0,
      x: cx,
      z: cz,
      hx: wx,
      hz: wz,
      wantX: wx,
      wantZ: wz,
      goalX: x,
      goalZ: z,
      path: [],
      pathI: 0,
      trail: [],
      s: 0,
      phase: "form",
      phaseT: 0,
      byRank: true,
      hold: false,
      holding: false,
      shift: 0,
      shiftWant: 0,
      wideFor: 0,
      settleMax: 0
    };
    // Đội vừa cùng nhau tới nơi (cùng nhận một hướng đội hình, ai cũng còn đứng gần ô cuối của mình) là ĐÃ VÀO HÀNG:
    // giữ nguyên hình dạng đang đứng (người dùng chốt 06/11/2026: không ai đổi chỗ), dù nó có giống lưới chuẩn hay không.
    const sameFace = (f0.faceX !== 0 || f0.faceZ !== 0) && units.every((u) => u.faceX * f0.faceX + u.faceZ * f0.faceZ > 0.999);
    // Tư lệnh đổi sang kiểu đội hình khác thì dựng lại theo kiểu đó. Lệnh tấn công mà phải quay đầu thì cũng dựng lại để giáp
    // ra trước, vì đưa Pháo đi đầu vào giao tranh là sai về chiến thuật (người dùng chốt 09/11/2026). Còn lại giữ chỗ đứng.
    const turnsBack = sameFace && wx * f0.faceX + wz * f0.faceZ < 0;
    const changed = chosen !== undefined && chosen !== current;
    const formed = sameFace && !changed && !(kind === "amove" && turnsBack) && units.every((u) => u.order === "idle" && dist2(u.x, u.z, u.tx, u.tz) < 9);
    const colsFull = Math.min(n, Math.ceil(Math.sqrt(n * FORMATIONS[sq.formation].wide)));
    sq.byRank = !formed;
    sq.ids = units.map((u) => u.id);
    this.squadRanks(sq, units, wx, wz, cx, cz);
    sq.speed = this.squadSpeed(units);
    if (formed) {
      // hình dạng hiện tại, đo theo hướng đội hình đang quay
      this.squadAdopt(sq, f0.faceX, f0.faceZ);
      sq.colsMax = Math.max(colsFull, sq.cols);
    }
    let direct = false;
    if (wl <= SQUAD_DIRECT) direct = this.squadDirect(sq, units, wx, wz, cx, cz, colsFull, formed);
    sq.rigid = direct && formed;
    if (!direct) {
      if (formed) {
        this.squadAdopt(sq, f0.faceX, f0.faceZ);
        sq.colsMax = Math.max(colsFull, sq.cols);
      } else {
        // quân lộn xộn: dựng đội hình theo vai trò ngay tại chỗ, quay theo hướng đi, chia ô tối ưu rồi tập hợp
        this.squadArrange(sq, units, wx, wz, cx, cz, colsFull);
        this.squadAssign(sq);
        sq.colsMax = colsFull;
      }
    }
    // ô cuối cùng của từng xe khi tới nơi (tâm khối ở đích, quay theo hướng đi): AI và "về lại chỗ" dùng
    const fx = x + wx * (sq.depth / 2);
    const fz = z + wz * (sq.depth / 2);
    sq.ids.forEach((id, i) => {
      const u = this.byId.get(id) as Unit;
      u.squad = sq.id;
      u.order = kind;
      u.targetId = 0;
      u.autoTarget = 0;
      u.chasing = false;
      u.path = [];
      u.pathI = 0;
      if (direct) [u.tx, u.tz] = this.squadSlot(sq, i);
      else {
        u.tx = fx + wz * sq.offLat[i] - wx * sq.offBack[i];
        u.tz = fz - wx * sq.offLat[i] - wz * sq.offBack[i];
      }
      u.faceX = wx;
      u.faceZ = wz;
    });
    if (direct) {
      // đã đặt ở squadDirect
    } else if (formed && sq.hx * wx + sq.hz * wz < SQUAD_PIVOT_COS) {
      sq.phase = "pivot";
      sq.phaseT = 0;
    } else if (formed) this.squadMarch(sq);
    // quân lộn xộn cũng lăn bánh ngay, tự vào hàng trên đường đi (cả khối chậm lại chờ xe đang tụt), không đứng tập hợp tại chỗ
    else this.squadMarch(sq);
    this.squads.push(sq);
  }

  /**
   * Thử chế độ "đi thẳng tới ô" cho quãng ngắn: đội hình dựng sẵn ở đích (tâm khối ở đích, quay theo hướng đi), chia ô bằng
   * phân công tối ưu (không đường nào cắt nhau). Đội đã vào hàng thì đội hình ở đích là chính hình dạng đang đứng, xoay
   * theo hướng đi; quân lộn xộn thì dựng lưới chuẩn theo vai trò. Được khi mọi ô đứng được và đường thẳng tới ô không vướng.
   */
  private squadDirect(sq: Squad, units: readonly Unit[], wx: number, wz: number, cx: number, cz: number, cols: number, formed: boolean): boolean {
    if (formed) {
      // đội đã vào hàng: DỊCH NGUYÊN KHỐI, mọi xe đi cùng một vector (đường song song, không ai đổi chỗ), tới nơi quay mặt
      // về hướng vừa đi. Lùi lại thì hàng sau thành hàng đầu (người dùng chốt giữ nguyên chỗ đứng).
      sq.x += sq.goalX - cx;
      sq.z += sq.goalZ - cz;
    } else {
      this.squadArrange(sq, units, wx, wz, cx, cz, cols);
      sq.colsMax = cols;
      sq.hx = wx;
      sq.hz = wz;
      sq.x = sq.goalX + wx * (sq.depth / 2);
      sq.z = sq.goalZ + wz * (sq.depth / 2);
    }
    sq.phase = "direct";
    // phải đi vòng xa thật sự (qua cầu, vòng khe núi) thì không đi thẳng được: hành quân thành khối
    const mob = this.slowestMobility(sq);
    const route = this.grid.findPath(cx, cz, sq.goalX, sq.goalZ, this.grid.field(mob, false));
    if (!route) {
      sq.phase = "form";
      return false;
    }
    let len = 0;
    let px = cx;
    let pz = cz;
    for (let k = 0; k < route.length; k += 2) {
      len += Math.sqrt(dist2(px, pz, route[k], route[k + 1]));
      px = route[k];
      pz = route[k + 1];
    }
    if (len > Math.sqrt(dist2(cx, cz, sq.goalX, sq.goalZ)) * 1.35 + 4) {
      sq.phase = "form";
      return false;
    }
    // Bấm sát vật cản (bờ sông, vách đá): tìm chỗ gần nhất mà CẢ KHỐI đứng vừa, giữ nguyên hình dạng
    if (!this.squadFits(sq)) {
      const bx = sq.x;
      const bz = sq.z;
      let found = false;
      for (const [ox, oz] of SHIFT_OFFSETS) {
        sq.x = bx + ox;
        sq.z = bz + oz;
        if (this.squadFits(sq)) {
          found = true;
          break;
        }
      }
      if (!found) {
        sq.x = bx;
        sq.z = bz;
      }
    }
    // vẫn có ô vướng thì dời riêng ô đó sang ô trống gần nhất (cùng khoảng trống với tâm khối) chưa ai nhận
    const used = new Set<number>();
    const rx = sq.hz;
    const rz = -sq.hx;
    for (let i = 0; i < sq.ids.length; i++) {
      const [sx, sz] = this.squadSlot(sq, i);
      const ccx = sq.x - sq.hx * (sq.depth / 2);
      const ccz = sq.z - sq.hz * (sq.depth / 2);
      const [fx, fz] = this.freeSlot(sx, sz, rx, rz, sq.hx, sq.hz, used, [ccx, ccz]);
      if (this.grid.blockedAt(fx, fz) || !this.grid.los(ccx, ccz, fx, fz)) {
        sq.phase = "form";
        return false;
      }
      sq.offLat[i] = (fx - sq.x) * rx + (fz - sq.z) * rz;
      sq.offBack[i] = (sq.x - fx) * sq.hx + (sq.z - fz) * sq.hz;
    }
    // dịch nguyên khối thì ai ở ô nấy; dựng mới thì chia ô tối ưu
    if (!formed) this.squadAssign(sq);
    sq.phaseT = 0;
    return true;
  }

  /** Mọi ô của đội hình (đặt theo người dẫn đầu hiện tại) đều đứng được và cùng một khoảng trống với tâm khối. */
  private squadFits(sq: Squad): boolean {
    const cx = sq.x - sq.hx * (sq.depth / 2);
    const cz = sq.z - sq.hz * (sq.depth / 2);
    if (this.grid.blockedAt(cx, cz)) return false;
    for (let i = 0; i < sq.ids.length; i++) {
      const [sx, sz] = this.squadSlot(sq, i);
      if (this.grid.blockedAt(sx, sz) || this.map.inset(sx, sz) < 1 || !this.grid.los(cx, cz, sx, sz)) return false;
    }
    return true;
  }

  /**
   * Chia ô cho các xe hiện có bằng phân công tối ưu (tổng quãng đường thẳng nhỏ nhất, `assignMin`): không hai đường đi nào
   * cắt nhau. Ô giữ nguyên chỗ (offLat / offBack theo chỉ số), chỉ đổi xe nào vào ô nào. Đang xếp theo vai trò thì mỗi xe
   * chỉ nhận ô của hàng đúng vai trò của nó.
   */
  private squadAssign(sq: Squad): void {
    const n = sq.ids.length;
    if (n < 2) return;
    const units = sq.ids.map((id) => this.byId.get(id) as Unit);
    // mỗi ô thuộc về tuyến + lô của xe đang giữ nó: đổi chỗ trong cùng lô, xe cùng lô luôn đứng cạnh nhau
    // (xe "hai cánh" chỉ đổi chỗ với xe hai cánh, không thì phân công đẩy chúng vào giữa đội hình)
    const flankCode = FORMATIONS[sq.formation].flank;
    const key = (u: Unit): string => `${sq.rankOf[u.id]}:${u.lot}:${UNITS[u.kind].group === flankCode ? 1 : 0}`;
    const cost: number[][] = [];
    for (let i = 0; i < n; i++) {
      const [sx, sz] = this.squadSlot(sq, i);
      const want = key(units[i]);
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const u = units[j];
        row.push(sq.byRank && key(u) !== want ? 1e9 : Math.sqrt(dist2(u.x, u.z, sx, sz)));
      }
      cost.push(row);
    }
    const a = assignMin(cost);
    sq.ids = a.map((j) => units[j].id);
  }

  /**
   * Lấy đúng hình dạng các xe đang đứng làm đội hình, đo theo hướng (hx, hz): gom hàng theo chiều sâu (lệch ≤ 1,5 m là cùng
   * hàng), thứ tự "gấp dây", người dẫn đầu ở giữa hàng đầu. Không ai phải nhích. Tắt xếp theo vai trò.
   */
  private squadAdopt(sq: Squad, hx: number, hz: number): void {
    const units = sq.ids.map((id) => this.byId.get(id) as Unit);
    const n = units.length;
    let cx = 0;
    let cz = 0;
    for (const u of units) {
      cx += u.x / n;
      cz += u.z / n;
    }
    const fwd = (u: Unit): number => (u.x - cx) * hx + (u.z - cz) * hz;
    const lat = (u: Unit): number => (u.x - cx) * hz - (u.z - cz) * hx;
    let front = -Infinity;
    for (const u of units) front = Math.max(front, fwd(u));
    const sorted = [...units].sort((a, b) => fwd(b) - fwd(a) || a.id - b.id);
    const rows: Unit[][] = [];
    for (const u of sorted) {
      const row = rows[rows.length - 1];
      if (row && fwd(row[0]) - fwd(u) <= 1.5) row.push(u);
      else rows.push([u]);
    }
    sq.byRank = false;
    sq.ids = [];
    sq.offLat = [];
    sq.offBack = [];
    let minL = Infinity;
    let maxL = -Infinity;
    let cols = 1;
    let rMax = 0;
    rows.forEach((row, ri) => {
      row.sort((a, b) => lat(a) - lat(b) || a.id - b.id);
      if (ri % 2 === 1) row.reverse();
      cols = Math.max(cols, row.length);
      for (const u of row) {
        sq.ids.push(u.id);
        sq.offLat.push(lat(u));
        sq.offBack.push(front - fwd(u));
        minL = Math.min(minL, lat(u));
        maxL = Math.max(maxL, lat(u));
        rMax = Math.max(rMax, UNITS[u.kind].radius);
      }
    });
    sq.cols = cols;
    sq.rMax = rMax;
    sq.width = maxL - minL + 2 * rMax;
    sq.depth = Math.max(...sq.offBack);
    sq.hx = hx;
    sq.hz = hz;
    sq.x = cx + hx * front;
    sq.z = cz + hz * front;
  }

  /**
   * Xếp thứ tự và ô trong đội hình theo hướng (hx, hz), tâm khối ở (cx, cz): vai trò (đầu / giữa / sau) trước, xe đang ở
   * phía trước vào hàng trước, trong hàng thì trái sang phải theo vị trí đang đứng (đường đi không cắt nhau).
   */
  private squadArrange(sq: Squad, units: readonly Unit[], hx: number, hz: number, cx: number, cz: number, cols: number): void {
    const rx = hz;
    const rz = -hx;
    const fwd = (u: Unit): number => (u.x - cx) * hx + (u.z - cz) * hz;
    const lat = (u: Unit): number => (u.x - cx) * rx + (u.z - cz) * rz;
    const rank = (u: Unit): number => (sq.byRank ? sq.rankOf[u.id] : 0);
    // xe cùng lô đi liền nhau trên "sợi dây": lô nào đang ở trước vào trước
    const lotFwd = new Map<number, number>();
    for (const u of units) if (u.lot && (!lotFwd.has(u.lot) || fwd(u) > (lotFwd.get(u.lot) as number))) lotFwd.set(u.lot, fwd(u));
    const lead = (u: Unit): number => (u.lot ? (lotFwd.get(u.lot) as number) : fwd(u));
    const order = [...units].sort((a, b) => rank(a) - rank(b) || lead(b) - lead(a) || a.lot - b.lot || fwd(b) - fwd(a) || a.id - b.id);
    const rows: Unit[][] = [];
    for (const u of order) {
      const row = rows[rows.length - 1];
      if (!row || row.length >= cols || rank(row[0]) !== rank(u)) rows.push([u]);
      else row.push(u);
    }
    // thứ tự "gấp dây": hàng chẵn trái → phải, hàng lẻ phải → trái (khớp squadLayout)
    sq.ids = [];
    rows.forEach((row, ri) => {
      // trong một hàng, lô nào đứng bên trái thì vào trước, không để hai lô xen kẽ nhau
      const lotSum = new Map<number, [number, number]>();
      for (const u of row) {
        const e = lotSum.get(u.lot) ?? [0, 0];
        e[0] += lat(u);
        e[1]++;
        lotSum.set(u.lot, e);
      }
      const lotLat = (u: Unit): number => {
        if (!u.lot) return lat(u);
        const e = lotSum.get(u.lot) as [number, number];
        return e[0] / e[1];
      };
      row.sort((a, b) => lotLat(a) - lotLat(b) || a.lot - b.lot || lat(a) - lat(b) || a.id - b.id);
      if (ri % 2 === 1) row.reverse();
      for (const u of row) sq.ids.push(u.id);
    });
    sq.colsMax = cols;
    sq.cols = cols;
    this.squadLayout(sq);
    sq.hx = hx;
    sq.hz = hz;
    sq.x = cx + hx * (sq.depth / 2);
    sq.z = cz + hz * (sq.depth / 2);
  }

  /**
   * Tính ô (lệch ngang, lùi sau) cho `sq.cols` xe mỗi hàng, theo đúng thứ tự `sq.ids`; mỗi vai trò bắt đầu hàng mới.
   * Thứ tự kiểu "gấp dây": hàng chẵn xếp trái → phải, hàng lẻ phải → trái. Co / giãn hàng chỉ là gấp lại sợi dây với độ
   * dài khúc khác: hai xe cạnh nhau trên dây vẫn cạnh nhau (không ai chạy chéo qua đội), xe đầu dây (hàng đầu) vẫn ở đầu.
   */
  private squadLayout(sq: Squad): void {
    const unit = (id: number): Unit => this.byId.get(id) as Unit;
    const rank = (id: number): number => (sq.byRank ? sq.rankOf[id] : 0);
    const def = FORMATIONS[sq.formation];
    // mã "hai cánh" (phòng không của đội hình hộ tống) đứng dọc hai bên tuyến giữa, chỉ khi đội đang giãn hết cỡ; đội co hàng qua chỗ hẹp thì xếp hàng như thường
    const flanking = sq.byRank && def.flank !== undefined && sq.cols >= sq.colsMax;
    const flank: number[] = [];
    const rows: number[][] = [];
    sq.ids.forEach((id, i) => {
      if (flanking && UNITS[unit(id).kind].group === def.flank) {
        flank.push(i);
        return;
      }
      const row = rows[rows.length - 1];
      if (!row || row.length >= sq.cols || rank(sq.ids[row[0]]) !== rank(id)) rows.push([i]);
      else row.push(i);
    });
    const rMax = (row: number[]): number => {
      let r = 0;
      for (const i of row) r = Math.max(r, UNITS[unit(sq.ids[i]).kind].radius);
      return r;
    };
    sq.offLat = new Array<number>(sq.ids.length).fill(0);
    sq.offBack = new Array<number>(sq.ids.length).fill(0);
    sq.width = 0;
    sq.rMax = 0;
    let back = 0;
    rows.forEach((row, ri) => {
      const r = rMax(row);
      if (ri > 0) back += rMax(rows[ri - 1]) + r + FORMATION_GAP;
      const spacing = 2 * r + FORMATION_GAP;
      row.forEach((i, j) => {
        const col = ri % 2 === 1 ? row.length - 1 - j : j;
        sq.offLat[i] = (col - (row.length - 1) / 2) * spacing;
        sq.offBack[i] = back;
      });
      sq.width = Math.max(sq.width, (row.length - 1) * spacing + 2 * r);
      sq.rMax = Math.max(sq.rMax, r);
    });
    sq.depth = back;
    if (flank.length) this.squadFlanks(sq, flank, rows);
  }

  /** Đặt các xe "hai cánh" dọc hai bên tuyến giữa, chia đều hai phía, từ trước ra sau. Chưa có hàng nào thì xếp một hàng. */
  private squadFlanks(sq: Squad, flank: readonly number[], rows: readonly number[][]): void {
    const rankOfRow = (row: readonly number[]): number => sq.rankOf[sq.ids[row[0]]];
    const center = rows.filter((row) => rankOfRow(row) !== 0 && rankOfRow(row) !== REAR_RANK);
    const pool = center.length ? center : rows;
    let from = Infinity;
    let to = -Infinity;
    let halfW = 0;
    for (const row of pool)
      for (const i of row) {
        from = Math.min(from, sq.offBack[i]);
        to = Math.max(to, sq.offBack[i]);
        halfW = Math.max(halfW, Math.abs(sq.offLat[i]));
      }
    if (from === Infinity) {
      from = to = 0;
    }
    let r = 0;
    for (const i of flank) r = Math.max(r, UNITS[(this.byId.get(sq.ids[i]) as Unit).kind].radius);
    const lat = halfW + sq.rMax + r + FORMATION_GAP;
    const perSide = Math.ceil(flank.length / 2);
    flank.forEach((i, k) => {
      const s = Math.floor(k / 2);
      sq.offLat[i] = k % 2 === 0 ? -lat : lat;
      sq.offBack[i] = perSide > 1 ? from + ((to - from) * s) / (perSide - 1) : (from + to) / 2;
    });
    sq.width = Math.max(sq.width, 2 * (lat + r));
    sq.rMax = Math.max(sq.rMax, r);
  }

  /** Tính tuyến của từng xe theo mã phân nhóm; đội hình có đoạn hậu thì 1/3 số xe GIAP ở phía sau, tính cả lô, thành tuyến cuối. */
  private squadRanks(sq: Squad, units: readonly Unit[], hx: number, hz: number, cx: number, cz: number): void {
    const def = FORMATIONS[sq.formation];
    sq.rankOf = {};
    for (const u of units) sq.rankOf[u.id] = def.rank[UNITS[u.kind].group];
    if (!def.rearGuard) return;
    const fwd = (u: Unit): number => (u.x - cx) * hx + (u.z - cz) * hz;
    const armor = units.filter((u) => UNITS[u.kind].group === "GIAP").sort((a, b) => fwd(a) - fwd(b) || a.id - b.id);
    const want = Math.floor(armor.length / 3);
    if (want === 0) return;
    let taken = 0;
    const lots = new Set<number>();
    for (const u of armor) {
      if (taken >= want && !(u.lot && lots.has(u.lot))) break;
      sq.rankOf[u.id] = REAR_RANK;
      taken++;
      if (u.lot) lots.add(u.lot);
    }
  }

  /** Tốc độ chung của khối: xe chậm được hộ tống nên đi nhanh hơn chính nó, tới mức trần. Chỉ toàn xe chậm thì không đổi. */
  private squadSpeed(units: readonly Unit[]): number {
    let min = Infinity;
    let sum = 0;
    for (const u of units) {
      const v = UNITS[u.kind].speed;
      min = Math.min(min, v);
      sum += v;
    }
    return Math.min(sum / units.length, min * RULES.escortBoost);
  }

  /** Tốc độ riêng của một xe lúc này: trong đội thì không thấp hơn tốc độ khối (cộng phần đuổi kịp). */
  private speedOf(u: Unit): number {
    const v = UNITS[u.kind].speed;
    if (!u.squad) return v;
    const sq = this.squadById(u.squad);
    if (!sq) return v;
    // dịch nguyên khối: tất cả đúng một tốc độ, xe nhanh không vượt lên chiếm làn của xe chậm
    if (sq.phase === "direct" && sq.rigid) return sq.speed;
    return sq.speed > v ? sq.speed * SQUAD_CATCHUP : v;
  }

  /** Ô của xe thứ i: [x, z, hướng x, hướng z]. Đang hành quân thì bám vệt người dẫn đầu, còn lại theo khối cứng. */
  private squadSlot(sq: Squad, i: number): [number, number, number, number] {
    const lat = sq.offLat[i] + sq.shift;
    const back = sq.offBack[i];
    if (sq.phase === "march") {
      const p = this.trailAt(sq, sq.s - back);
      return [p[0] + p[3] * lat, p[1] - p[2] * lat, p[2], p[3]];
    }
    return [sq.x + sq.hz * lat - sq.hx * back, sq.z - sq.hx * lat - sq.hz * back, sq.hx, sq.hz];
  }

  /** Điểm trên vệt người dẫn đầu tại quãng đường s (nội suy; trước điểm đầu thì kéo thẳng lùi theo hướng điểm đầu). */
  private trailAt(sq: Squad, s: number): [number, number, number, number] {
    const t = sq.trail;
    const n = t.length / 6;
    if (n === 0) return [sq.x, sq.z, sq.hx, sq.hz];
    if (s <= t[4]) {
      const d = t[4] - s;
      return [t[0] - t[2] * d, t[1] - t[3] * d, t[2], t[3]];
    }
    let k = n - 1;
    while (k > 0 && t[k * 6 + 4] > s) k--;
    if (k === n - 1) return [t[k * 6], t[k * 6 + 1], t[k * 6 + 2], t[k * 6 + 3]];
    const a = k * 6;
    const b = a + 6;
    const span = t[b + 4] - t[a + 4];
    const f = span > 1e-9 ? (s - t[a + 4]) / span : 0;
    let hx = t[a + 2] + (t[b + 2] - t[a + 2]) * f;
    let hz = t[a + 3] + (t[b + 3] - t[a + 3]) * f;
    const hl = Math.sqrt(hx * hx + hz * hz);
    if (hl > 1e-9) {
      hx /= hl;
      hz /= hl;
    } else {
      hx = t[b + 2];
      hz = t[b + 3];
    }
    return [t[a] + (t[b] - t[a]) * f, t[a + 1] + (t[b + 1] - t[a + 1]) * f, hx, hz];
  }

  /**
   * Cả đội đã xoay tại chỗ xong: GIỮ NGUYÊN CHỖ ĐỨNG (không xếp lại theo vai trò, người dùng chốt 06/11/2026: quay đầu
   * 180° thì hàng sau thành hàng đầu). Đội hình mới lấy đúng vị trí đang đứng, đo theo hướng mới: xoay bao nhiêu độ cũng
   * không ai phải nhích. Thứ tự vẫn kiểu "gấp dây" (theo hàng từ trước ra sau) để sau này co / giãn hàng vẫn gọn.
   */
  private squadAfterPivot(sq: Squad): void {
    this.squadAdopt(sq, sq.wantX, sq.wantZ);
    sq.cols = Math.min(sq.cols, sq.colsMax);
    this.squadMarch(sq);
  }

  /** Bắt đầu hành quân: tìm đường cho người dẫn đầu (tới đích + nửa bề sâu, để tâm khối dừng đúng đích), vệt thẳng phía sau. */
  private squadMarch(sq: Squad): void {
    const [gx, gz] = this.grid.nearestFree(sq.goalX + sq.wantX * (sq.depth / 2), sq.goalZ + sq.wantZ * (sq.depth / 2), 8) ?? [sq.goalX, sq.goalZ];
    const [hx0, hz0] = this.grid.nearestFree(sq.x, sq.z, 6) ?? [sq.x, sq.z];
    let mob: Mobility = "wheel";
    let slowest = Infinity;
    for (const id of sq.ids) {
      const spec = UNITS[(this.byId.get(id) as Unit).kind];
      if (spec.speed < slowest) {
        slowest = spec.speed;
        mob = spec.mobility ?? "wheel";
      }
    }
    // người dẫn đầu đi giữa hành lang (tránh men sát vật cản): đội hình khỏi co / dạt vô cớ
    sq.path = this.grid.findPath(hx0, hz0, gx, gz, this.grid.corridor(mob)) ?? this.grid.findPath(hx0, hz0, gx, gz, this.grid.field(mob, false)) ?? [gx, gz];
    sq.pathI = 0;
    sq.trail = [];
    const L = sq.depth + 12;
    for (let b = L; b >= 0; b -= 1) sq.trail.push(sq.x - sq.hx * b, sq.z - sq.hz * b, sq.hx, sq.hz, sq.s - b, 0);
    sq.phase = "march";
    sq.phaseT = 0;
  }

  /** Kiểu di chuyển của xe chậm nhất trong đội (dùng để tìm đường cho cả đội). */
  private slowestMobility(sq: Squad): Mobility {
    let mob: Mobility = "wheel";
    let slowest = Infinity;
    for (const id of sq.ids) {
      const spec = UNITS[(this.byId.get(id) as Unit).kind];
      if (spec.speed < slowest) {
        slowest = spec.speed;
        mob = spec.mobility ?? "wheel";
      }
    }
    return mob;
  }

  private squadById(id: number): Squad | undefined {
    for (const sq of this.squads) if (sq.id === id) return sq;
    return undefined;
  }

  /** Mọi xe đã thu bệ và quay thân gần đúng hướng tới ô của mình. */
  private squadReady(sq: Squad): boolean {
    return sq.ids.every((id, i) => {
      const u = this.byId.get(id) as Unit;
      const [sx, sz] = this.squadSlot(sq, i);
      const d = Math.sqrt(dist2(u.x, u.z, sx, sz));
      if (d <= 0.4) return true;
      if (UNITS[u.kind].weapon?.deploy && u.still > 0) return false;
      return d < 3 || (u.hx * (sx - u.x) + u.hz * (sz - u.z)) / d >= PIVOT_COS;
    });
  }

  /** Xe rời đội hình (lệnh mới, bị hạ): các xe còn lại dồn hàng, giữ thứ tự. */
  private leaveSquad(u: Unit): void {
    const sq = this.squadById(u.squad);
    u.squad = 0;
    if (!sq) return;
    const i = sq.ids.indexOf(u.id);
    if (i < 0) return;
    sq.ids.splice(i, 1);
    // xe vừa bị hạ trong tick trước có thể chưa được dọn khỏi đội (updateSquads chạy sau lệnh)
    sq.ids = sq.ids.filter((id) => {
      const m = this.byId.get(id);
      return !!m && m.cat === "unit" && m.hp > 0;
    });
    if (sq.ids.length) this.squadLayout(sq);
  }

  /** Giải tán đội hình khi tới nơi: mọi xe đứng chờ tại chỗ, quay theo hướng đội hình. */
  private disbandSquad(sq: Squad): void {
    for (const id of sq.ids) {
      const u = this.byId.get(id);
      if (!u || u.cat !== "unit") continue;
      u.squad = 0;
      this.setIdle(u);
      u.faceX = sq.phase === "direct" ? sq.wantX : sq.hx;
      u.faceZ = sq.phase === "direct" ? sq.wantZ : sq.hz;
    }
    sq.ids = [];
  }

  /** Mỗi tick, trước khi xe di chuyển: dọn xe đã mất, rồi cho người dẫn đầu của từng đội hình đi một bước. */
  private updateSquads(): void {
    for (const sq of this.squads) {
      const before = sq.ids.length;
      sq.ids = sq.ids.filter((id) => {
        const u = this.byId.get(id);
        return !!u && u.cat === "unit" && u.hp > 0 && u.squad === sq.id;
      });
      if (sq.ids.length && sq.ids.length !== before) this.squadLayout(sq);
      if (sq.ids.length === 1) this.disbandSquad(sq);
      if (sq.ids.length) this.stepSquad(sq);
    }
    this.squads = this.squads.filter((sq) => sq.ids.length > 0);
  }

  private stepSquad(sq: Squad): void {
    sq.phaseT++;
    const hold = sq.hold;
    sq.hold = false;
    sq.holding = hold;
    sq.speed = this.squadSpeed(sq.ids.map((id) => this.byId.get(id) as Unit));
    const speed = sq.speed;
    let lag = 0;
    for (let i = 0; i < sq.ids.length; i++) lag = Math.max(lag, this.squadLag(sq, i, this.byId.get(sq.ids[i]) as Unit)[0]);
    // xe tụt khỏi ô thì cả khối chậm lại chờ; lúc hành quân không dừng hẳn (tối thiểu 25%) để không bao giờ kẹt chết
    const wait = clamp(1 - (lag - SQUAD_LAG) / SQUAD_LAG, sq.phase === "march" ? 0.25 : 0, 1);
    switch (sq.phase) {
      case "form":
        if (lag < 1.2 || sq.phaseT > sec(SQUAD_FORM_MAX)) this.squadMarch(sq);
        return;
      case "pivot": {
        // cả đội xoay tại chỗ, đồng bộ theo xe quay chậm nhất; xong khi mọi thân xe đã quay đúng hướng
        let rate = Infinity;
        for (const id of sq.ids) rate = Math.min(rate, UNITS[(this.byId.get(id) as Unit).kind].turnRate ?? 90);
        turnToward(sq.hx, sq.hz, sq.wantX, sq.wantZ, traverseStep(rate), TMP);
        sq.hx = TMP.x;
        sq.hz = TMP.z;
        const done =
          sq.hx === sq.wantX &&
          sq.hz === sq.wantZ &&
          sq.ids.every((id) => {
            const u = this.byId.get(id) as Unit;
            return u.hx * sq.wantX + u.hz * sq.wantZ >= ALIGNED_COS;
          });
        if (done || sq.phaseT > sec(SQUAD_PIVOT_MAX)) this.squadAfterPivot(sq);
        return;
      }
      case "settle":
        if (lag < 0.8 || sq.phaseT > sq.settleMax) this.disbandSquad(sq);
        return;
      case "direct":
        if (sq.rigid && !sq.rolling) {
          // quân cố định thu bệ, xe chậm xoay thân lâu hơn: chờ đủ mặt rồi mới cùng đi, không thì xe nhanh vượt lên rồi đỗ chắn làn của xe chậm
          if (this.squadReady(sq) || sq.phaseT > sec(SQUAD_PIVOT_MAX)) {
            sq.rolling = true;
            sq.phaseT = 0;
          }
          return;
        }
        // mỗi xe tự đi thẳng tới ô; xong khi ai cũng tới ô (hoặc quá lâu)
        if (lag < 0.8 || sq.phaseT > sec(SQUAD_FORM_MAX + SQUAD_DIRECT / speed)) this.disbandSquad(sq);
        return;
      case "march":
        break;
    }
    if (sq.phaseT % 3 === 1) this.squadFit(sq);
    const R = Math.max(sq.width / 2, SQUAD_MIN_TURN_R);
    // các hàng đang ở khúc cua (vệt đang quay): xe mép ngoài phải chạy xa hơn, nên cả khối chậm lại cho vừa tốc độ
    let turning = false;
    const t = sq.trail;
    for (let k = t.length - 6; k >= 0 && t[k + 4] >= sq.s - sq.depth - 0.5; k -= 6)
      if (t[k + 5]) {
        turning = true;
        break;
      }
    let v = speed * wait * (hold ? 0 : 1) * (turning ? R / (R + sq.width / 2) : 1);
    if (v <= 0) return;
    // dạt ngang dần (nửa tốc độ hành quân) để né vật cản một bên
    const slide = v * DT * 0.5;
    sq.shift += clamp(sq.shiftWant - sq.shift, -slide, slide);
    // người dẫn đầu đi đúng theo đường A*
    let rem = v * DT;
    while (rem > 1e-9 && sq.pathI * 2 < sq.path.length) {
      const wx = sq.path[sq.pathI * 2];
      const wz = sq.path[sq.pathI * 2 + 1];
      const d = Math.sqrt(dist2(sq.x, sq.z, wx, wz));
      if (d <= rem) {
        sq.x = wx;
        sq.z = wz;
        sq.s += d;
        rem -= d;
        sq.pathI++;
        continue;
      }
      sq.x += ((wx - sq.x) / d) * rem;
      sq.z += ((wz - sq.z) / d) * rem;
      sq.s += rem;
      rem = 0;
    }
    // hướng đội hình quay dần về hướng đường đi, bán kính quay R (bề ngang / 2): khúc cua thành cú xoay cánh cửa từng hàng
    let turned = false;
    if (sq.pathI * 2 < sq.path.length) {
      const dx = sq.path[sq.pathI * 2] - sq.x;
      const dz = sq.path[sq.pathI * 2 + 1] - sq.z;
      const dl = Math.sqrt(dx * dx + dz * dz);
      if (dl > 1e-6) {
        turnToward(sq.hx, sq.hz, dx / dl, dz / dl, turnStep((v * DT) / R), TMP);
        turned = TMP.x !== sq.hx || TMP.z !== sq.hz;
        sq.hx = TMP.x;
        sq.hz = TMP.z;
      }
    }
    t.push(sq.x, sq.z, sq.hx, sq.hz, sq.s, turned ? 1 : 0);
    // bỏ phần vệt đã ở quá xa phía sau hàng cuối
    let drop = 0;
    while (drop + 12 < t.length && t[drop + 6 + 4] < sq.s - sq.depth - 12) drop += 6;
    if (drop) t.splice(0, drop);
    if (sq.pathI * 2 >= sq.path.length) this.squadSettle(sq, speed);
  }

  /**
   * Người dẫn đầu tới cuối đường: đội hình chuyển sang hình dạng cuối cùng (khối cứng, giãn hết cỡ mà chỗ đứng cho phép,
   * tâm ở đích, quay theo hướng đang đi). Xe còn ở xa (đuôi cột chưa qua cầu…) tự tìm đường về ô của mình.
   */
  private squadSettle(sq: Squad, speed: number): void {
    sq.settleMax = sec(SQUAD_SETTLE_MAX + sq.depth / speed);
    sq.phase = "settle";
    sq.phaseT = 0;
    sq.shift = 0;
    sq.shiftWant = 0;
    // đội hình đang có (kể cả hình "giữ nguyên chỗ đứng" sau khi xoay) đứng vừa ở đây và không đang co hàng: giữ nguyên
    if (sq.cols >= sq.colsMax) {
      let ok = true;
      for (let i = 0; i < sq.ids.length && ok; i++) {
        const [sx, sz] = this.squadSlot(sq, i);
        ok = !this.grid.blockedAt(sx, sz) && this.map.inset(sx, sz) >= 1;
      }
      if (ok) return;
    }
    // khối đang đứng ở cuối đường: giữ nguyên chỗ; chỉ khi đổi số xe mỗi hàng (cột vừa qua chỗ hẹp giãn ra) mới đặt lại
    // tâm khối vào đích. Dời chỗ không cần thiết làm xe phải nhích và quay thân lung tung lúc dừng.
    const was = sq.cols;
    const hx0 = sq.x;
    const hz0 = sq.z;
    const place = (): void => {
      if (sq.cols === was) {
        sq.x = hx0;
        sq.z = hz0;
        return;
      }
      sq.x = sq.goalX + sq.hx * (sq.depth / 2);
      sq.z = sq.goalZ + sq.hz * (sq.depth / 2);
    };
    let c = sq.colsMax;
    for (; c > 1; c--) {
      sq.cols = c;
      this.squadLayout(sq);
      place();
      let ok = true;
      for (let i = 0; i < sq.ids.length && ok; i++) {
        const [sx, sz] = this.squadSlot(sq, i);
        ok = !this.grid.blockedAt(sx, sz) && this.map.inset(sx, sz) >= 1;
      }
      if (ok) break;
    }
    sq.cols = c;
    this.squadLayout(sq);
    place();
    // vừa giãn lại hàng (cột qua chỗ hẹp xong): chia ô ở đích theo phân công tối ưu, không ai chạy chéo
    if (c !== was) {
      this.squadAssign(sq);
      sq.settleMax += sec(SQUAD_RESHAPE_EXTRA); // xe phải đổi chỗ thật sự, cho đủ thời gian trước khi giải tán
    }
  }

  /**
   * Co / giãn / dạt đội hình theo bề rộng đường: đo khoảng trống bên trái, bên phải ở chỗ từng hàng đang đứng và vài điểm
   * phía trước trên đường đi. Vật cản chỉ ở một bên thì cả khối dạt sang bên trống; hai bên đều hẹp (cầu, khe núi) thì co
   * bớt số xe mỗi hàng ngay; chỉ giãn lại khi đã đủ rộng liên tục khoảng 2 giây (cả cột đã qua khỏi chỗ hẹp).
   */
  private squadFit(sq: Squad): void {
    const spacing = 2 * sq.rMax + FORMATION_GAP;
    const fullW = (sq.colsMax - 1) * spacing + 2 * sq.rMax;
    const scan = fullW + 1;
    const left: number[] = [];
    const right: number[] = [];
    const sample = (x: number, z: number, hx: number, hz: number): void => {
      left.push(this.freeSide(x, z, hx, hz, -1, scan));
      right.push(this.freeSide(x, z, hx, hz, 1, scan));
    };
    for (const b of new Set(sq.offBack)) {
      const p = this.trailAt(sq, sq.s - b);
      sample(p[0], p[1], p[2], p[3]);
    }
    // nhìn trước theo đường đi
    let px = sq.x;
    let pz = sq.z;
    let k = sq.pathI;
    let ahead = 0;
    while (ahead < SQUAD_LOOK && k * 2 < sq.path.length) {
      const wx = sq.path[k * 2];
      const wz = sq.path[k * 2 + 1];
      const d = Math.sqrt(dist2(px, pz, wx, wz));
      if (d < 1e-6) {
        k++;
        continue;
      }
      const step = Math.min(2, d, SQUAD_LOOK - ahead);
      const dx = (wx - px) / d;
      const dz = (wz - pz) / d;
      px += dx * step;
      pz += dz * step;
      ahead += step;
      sample(px, pz, dx, dz);
      if (step >= d) k++;
    }
    // với c xe mỗi hàng: khoảng dạt ngang khả thi [lo, hi] (null = không vừa)
    const range = (c: number, margin: number): [number, number] | null => {
      const half = ((c - 1) * spacing + 2 * sq.rMax) / 2 + margin;
      let lo = -Infinity;
      let hi = Infinity;
      for (let i = 0; i < left.length; i++) {
        lo = Math.max(lo, half - left[i]);
        hi = Math.min(hi, right[i] - half);
      }
      return lo <= hi ? [lo, hi] : null;
    };
    let c = sq.cols;
    if (!range(c, 0)) {
      // hẹp: co ngay tới mức vừa (1 xe mỗi hàng thì đành chịu)
      while (c > 1 && !range(c, 0)) c--;
      sq.wideFor = 0;
    } else if (c < sq.colsMax && range(c + 1, 0.5)) {
      // đủ rộng để giãn thêm một hàng (dư 0,5 m mỗi bên): chờ ổn định rồi mới giãn
      if (++sq.wideFor >= SQUAD_WIDEN_CHECKS) {
        c++;
        sq.wideFor = 0;
      }
    } else sq.wideFor = 0;
    if (c !== sq.cols) {
      sq.cols = c;
      this.squadLayout(sq);
    }
    const r = range(sq.cols, 0);
    sq.shiftWant = r ? clamp(0, r[0], r[1]) : 0;
  }

  /** Khoảng trống (m) từ điểm (x, z) sang một bên (side = 1 phải, −1 trái) của hướng (hx, hz), đo tối đa `max` m. */
  private freeSide(x: number, z: number, hx: number, hz: number, side: number, max: number): number {
    let t = 0;
    while (t + 1 <= max) {
      const qx = x + hz * side * (t + 1);
      const qz = z - hx * side * (t + 1);
      if (this.grid.blockedAt(qx, qz) || this.map.inset(qx, qz) < 1) break;
      t += 1;
    }
    return t + 0.5;
  }

  /** Một xe trong đội hình: bắn mục tiêu trong tầm (không bỏ hàng đi đuổi), rồi đi về ô của mình. */
  private squadMember(u: Unit, w: WeaponSpec | undefined, range: number): Target | null {
    const sq = this.squadById(u.squad);
    const i = sq ? sq.ids.indexOf(u.id) : -1;
    if (!sq || i < 0) {
      u.squad = 0;
      this.setIdle(u);
      return null;
    }
    let fireAt: Target | null = null;
    if (w) {
      const t = this.acquire(u, w, range);
      if (t && this.inRange(u.x, u.z, w, t, range)) {
        fireAt = t;
        if (sq.kind === "amove") sq.hold = true;
      }
    }
    if (sq.phase === "pivot") {
      // cả đội xoay tại chỗ: không ai di chuyển, thân quay theo hướng đội hình (đội quay theo xe chậm nhất nên đồng bộ)
      this.turnHull(u, sq.hx, sq.hz);
      return fireAt;
    }
    // đi-và-đánh: cả đội đang dừng bắn thì xe đang tự đi tới ô cũng đứng lại
    if (sq.phase === "direct" && sq.kind === "amove" && sq.holding) return fireAt;
    const [, shx, shz, sx, sz] = this.squadLag(sq, i, u);
    const d = Math.sqrt(dist2(u.x, u.z, sx, sz));
    if (sq.phase === "direct" && sq.rigid && !sq.rolling) {
      // chưa lăn bánh: chỉ thu bệ và xoay thân về hướng sắp đi
      const dep = UNITS[u.kind].weapon?.deploy;
      if (dep && u.still > 0 && d > 0.4) {
        u.still = Math.min(u.still, sec(dep.time)) - 1;
        u.packing = true;
      } else if (d >= 3) this.turnHull(u, (sx - u.x) / d, (sz - u.z) / d);
      return fireAt;
    }
    if (d > SQUAD_FAR || (d > 2 && !this.grid.los(u.x, u.z, sx, sz))) {
      // xa ô hoặc bị che: tìm đường tới ô (mỗi giây tìm lại một lần, ô còn đang di chuyển)
      if (u.path.length === 0 || this.tick >= u.repathAt) {
        this.setPath(u, sx, sz);
        u.repathAt = this.tick + sec(1);
      }
      // không tìm được đường (ô bị bao kín…): vẫn nhích thẳng về phía ô, đừng đứng im
      if (u.path.length) this.follow(u);
      else this.stepToward(u, sx, sz, d);
    } else {
      u.path = [];
      u.pathI = 0;
      this.stepToward(u, sx, sz, d);
    }
    // đứng sát ô: thân quay dần theo hướng đội hình (đi thẳng tới ô: hướng vừa đi), đi đều, không lắc theo từng chỉnh nhỏ
    if (d < 1.5) {
      if (sq.phase === "direct") this.turnHull(u, sq.wantX, sq.wantZ);
      else this.turnHull(u, shx, shz);
    }
    return fireAt;
  }

  /**
   * Độ tụt của xe thứ i so với ô (m) và điểm nó nên tới: [tụt, hướng x, hướng z, đích x, đích z]. Lúc hành quân, xe đang
   * đứng TRƯỚC ô của mình (ví dụ đoàn vừa co thành hàng một trước cầu) thì chờ tới lượt: chỉ chỉnh ngang cho thẳng cột,
   * không lùi lại, và không bị tính là tụt (không làm cả khối dừng chờ).
   */
  private squadLag(sq: Squad, i: number, u: Unit): [number, number, number, number, number] {
    const [sx, sz, hx, hz] = this.squadSlot(sq, i);
    const along = (u.x - sx) * hx + (u.z - sz) * hz;
    if (sq.phase === "march" && along > 0.3) {
      const tx = sx + hx * along;
      const tz = sz + hz * along;
      return [Math.sqrt(dist2(u.x, u.z, tx, tz)), hx, hz, tx, tz];
    }
    return [Math.sqrt(dist2(u.x, u.z, sx, sz)), hx, hz, sx, sz];
  }

  /** Đi thẳng về (x, z) cách d mét, không quá tốc độ của xe; quân cố định thì thu bệ trước. */
  private stepToward(u: Unit, x: number, z: number, d: number): void {
    if (d < 0.05) return;
    const spec = UNITS[u.kind];
    const dep = spec.weapon?.deploy;
    if (dep && u.still > 0) {
      // lệch rất ít thì đứng yên giữ bệ; lệch nhiều thì phải thu bệ rồi mới chạy
      if (d > 0.4) {
        u.still = Math.min(u.still, sec(dep.time)) - 1;
        u.packing = true;
      }
      return;
    }
    const dx = (x - u.x) / d;
    const dz = (z - u.z) / d;
    // đi xa (từ 3 m): quay thân về hướng đi trước, lệch nhiều thì xoay tại chỗ; nhích chỉnh hàng thì khỏi quay thân
    if (d >= 3 && !this.turnHull(u, dx, dz)) return;
    const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
    const step = Math.min(this.speedOf(u) * DT * rally * this.moveFactor(u, dx, dz), d);
    const ox = u.x;
    const oz = u.z;
    this.tryMove(u, u.x + dx * step, u.z + dz * step);
    u.moved = u.moved || dist2(ox, oz, u.x, u.z) > 1e-6;
  }

  private cancelRtbIfFuel(u: Unit): void {
    const spec = UNITS[u.kind];
    const fuel = spec.fuel;
    if (!fuel) return;
    if (u.fuel > Math.max(fuel.tank * RULES.air.bingo, this.fuelToReturn(u, spec)) + 2) {
      u.rtb = false;
      if (u.air === "returning") u.air = "flying";
    }
  }

  private orderAttack(u: Unit, t: Target): void {
    const w = UNITS[u.kind].weapon;
    if (u.air !== "none") {
      if (!w || !this.canHit(w, t)) return;
      u.mission = "attack";
      u.targetId = t.id;
      this.cancelRtbIfFuel(u);
      return;
    }
    if (!w || !this.canHit(w, t)) {
      this.orderMove(u.side, [u.id], t.x, t.z, "move");
      return;
    }
    if (u.kind === "hauler") return;
    u.order = "attack";
    u.targetId = t.id;
    u.chasing = false;
    u.path = [];
    u.pathI = 0;
    u.repathAt = 0;
  }

  private orderStop(u: Unit): void {
    if (u.air === "none") {
      if (u.kind === "hauler") {
        this.releaseMine(u);
        this.releaseWreck(u);
        u.manual = true;
        u.hState = "idle";
      }
      this.setIdle(u);
      return;
    }
    if (u.air === "parked") u.mission = "none";
    else {
      u.mission = "move";
      u.mx = u.x;
      u.mz = u.z;
      u.targetId = 0;
    }
  }

  private orderBuild(side: Side, kind: BuildingId, rx: number, rz: number, rot?: number): void {
    const spec = BUILDINGS[kind];
    const cost = spec.cost;
    if (!spec.mvp || !cost || kind === "hq") return;
    const x = Math.round(rx);
    const z = Math.round(rz);
    if (this.canPlace(side, kind, x, z, rot) !== null) return;
    const st = this.sides[side];
    if (st.iron < cost.iron || st.oil < cost.oil) return;
    st.iron -= cost.iron;
    st.oil -= cost.oil;
    const b = this.addBuilding(kind, side, x, z, false, rot);
    this.events.push({ t: "placed", id: b.id, kind, side });
    // báo trước: xây xong công trình này thì căn cứ có đủ điện không?
    if (spec.power < 0) {
      const after = st.powerUse + st.powerPending - spec.power;
      const cap = st.powerCap;
      if (after > cap + 1e-6) this.alert(side, "powerForecast", x, z, Math.ceil(after - cap));
      st.powerPending -= spec.power;
    }
  }

  // ------------------------------------------------------------------ công trình

  /**
   * ĐIỆN — bộ phận hậu cần tự điều độ mỗi tick (Tư lệnh không phải chỉnh tay):
   *   1. Tổng Hành Dinh phát trước (miễn phí).
   *   2. Nhà Máy Điện bù phần còn thiếu, đốt Dầu đúng theo lượng điện phát (không tải thì không đốt).
   *   3. Trạm Tích Điện xả bù khi vẫn thiếu; khi dư thì nạp bằng điện miễn phí của HQ,
   *      và chỉ đốt Dầu để nạp khi kho Dầu còn dư.
   *   4. Vẫn thiếu thì cắt theo ưu tiên: phòng thủ (1) → Sân Đáp (2) → Xưởng Xe (3).
   * Kèm cảnh báo sớm: sắp hết Dầu cho nhà máy, pin sắp cạn, đang thiếu điện.
   */
  private computePower(): void {
    const P = RULES.power;
    const plantSpec = BUILDINGS["power-plant"];
    const oilPerMwTick = ((plantSpec.oilBurn ?? 0) / plantSpec.power) * DT;
    for (const s of [0, 1] as Side[]) {
      const st = this.sides[s];
      const tier = [0, 0, 0, 0];
      let hqCap = 0;
      let pending = 0;
      const plants: Building[] = [];
      const batteries: Building[] = [];
      for (const b of this.buildings) {
        if (b.side !== s) continue;
        const spec = BUILDINGS[b.kind];
        b.load = 0;
        if (b.hp <= 0) continue;
        if (!b.built) {
          if (spec.power < 0) pending -= spec.power;
          b.active = false;
          continue;
        }
        if (spec.oilBurn) plants.push(b);
        else if (spec.power > 0) hqCap += spec.power;
        else if (spec.power < 0) tier[spec.priority ?? 3] -= spec.power;
        if (spec.storage) batteries.push(b);
      }
      const use = tier[1] + tier[2] + tier[3];
      const plantFull = plants.length * plantSpec.power;
      const plantCap = oilPerMwTick > 0 ? Math.min(plantFull, st.oil / oilPerMwTick) : plantFull;
      let stored = 0;
      let maxStored = 0;
      let disCap = 0;
      let chgCap = 0;
      for (const b of batteries) {
        const sp = BUILDINGS[b.kind];
        stored += b.charge;
        maxStored += sp.storage!;
        disCap += Math.min(sp.dischargeMax!, b.charge / DT);
        chgCap += Math.min(sp.chargeMax!, (sp.storage! - b.charge) / DT);
      }
      // điều độ: HQ → nhà máy → pin
      const fromHq = Math.min(hqCap, use);
      let rest = use - fromHq;
      const fromPlants = Math.min(plantCap, rest);
      rest -= fromPlants;
      const fromBattery = Math.min(disCap, rest);
      rest -= fromBattery;
      if (rest < 1e-9) rest = 0;
      // nạp pin bằng phần dư
      let charge = 0;
      let plantCharge = 0;
      if (rest === 0 && fromBattery < 1e-9 && chgCap > 0) {
        charge = Math.min(chgCap, hqCap - fromHq);
        if (charge < chgCap && st.oil > P.chargeOilReserve) {
          plantCharge = Math.min(chgCap - charge, plantCap - fromPlants);
          charge += plantCharge;
        }
      }
      const plantLoad = fromPlants + plantCharge;
      st.oil = Math.max(0, st.oil - plantLoad * oilPerMwTick);
      for (const b of plants) {
        b.load = plantLoad / plants.length;
        b.active = b.load > 1e-6;
      }
      const flow = charge - fromBattery;
      for (const b of batteries) {
        const sp = BUILDINGS[b.kind];
        let share = 0;
        if (flow > 0) {
          const room = maxStored - stored;
          share = room > 0 ? (flow * (sp.storage! - b.charge)) / room : 0;
        } else if (flow < 0) share = stored > 0 ? (flow * b.charge) / stored : 0;
        b.charge = Math.min(sp.storage!, Math.max(0, b.charge + share * DT));
        b.load = share;
        b.active = Math.abs(share) > 1e-6;
      }
      // cắt điện theo ưu tiên
      let avail = use - rest;
      const frac = [1, 1, 1, 1];
      for (let t = 1; t <= 3; t++) {
        const got = Math.min(tier[t], avail);
        avail -= got;
        frac[t] = tier[t] > 0 ? got / tier[t] : 1;
      }
      for (const b of this.buildings) {
        if (b.side !== s || !b.built || b.hp <= 0) continue;
        const spec = BUILDINGS[b.kind];
        if (spec.power >= 0) continue;
        b.powerFrac = frac[spec.priority ?? 3];
        b.active = spec.radarSight ? b.powerFrac >= P.radarMin : b.powerFrac > 0;
      }
      st.powerCap = hqCap + plantCap;
      st.powerUse = use;
      st.powerPending = pending;
      st.eff = use > 0 ? (use - rest) / use : 1;
      st.battery = batteries.reduce((a, b) => a + b.charge, 0);
      st.batteryMax = maxStored;
      st.batteryFlow = flow;
      st.oilBurn = (plantLoad * oilPerMwTick) / DT;
      // cảnh báo sớm cho Tư lệnh
      const hq = this.hqOf(s);
      const ax = hq ? hq.x : 0;
      const az = hq ? hq.z : 0;
      if (rest > 0) this.alert(s, "powerShort", ax, az, Math.ceil(rest));
      if (fromPlants > 1e-6 && hqCap + disCap < use) {
        const secs = st.oil / ((fromPlants * oilPerMwTick) / DT);
        if (secs < P.warnOilSeconds) this.alert(s, "oilLow", ax, az, Math.max(1, Math.floor(secs)));
      }
      if (fromBattery > 1e-6) {
        const secs = stored / fromBattery;
        if (secs < P.warnBatterySeconds) this.alert(s, "batteryLow", ax, az, Math.max(1, Math.floor(secs)));
      }
    }
  }

  private updateBuildings(): void {
    this.computePower();
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      const spec = BUILDINGS[b.kind];
      if (b.cooldown > 0) b.cooldown--;
      if (!b.built) {
        const total = sec(spec.buildTime ?? 1);
        // thiếu điện thì xây chậm (trừ chính Nhà Máy Điện và Cột Điện, để luôn gỡ được thế thiếu điện)
        const k = spec.power > 0 || b.kind === "power-pylon" || spec.storage ? 1 : this.sides[b.side].eff;
        b.progress += k / total;
        b.hp = Math.min(b.maxHp, b.hp + (k * b.maxHp * 0.9) / total);
        if (b.progress >= 1 - 1e-9) {
          b.progress = 1;
          b.built = true;
          this.sides[b.side].stats.buildingsBuilt++;
          this.events.push({ t: "built", id: b.id, kind: b.kind, side: b.side });
        }
        continue;
      }
      if (b.queue.length) this.produce(b);
      if (spec.weapon) {
        if (spec.power < 0 && b.powerFrac < RULES.power.turretMin) {
          b.targetId = 0;
          continue;
        }
        const t = this.acquireFrom(b, b.side, b.x, b.z, spec.weapon, spec.weapon.range, b.targetId);
        b.targetId = t ? t.id : 0;
        this.aim(b, spec.weapon, t ? t.x : null, t ? t.z : 0);
        if (t) this.tryFire(b, spec.weapon, t);
      }
    }
  }

  private produce(b: Building): void {
    const kind = b.queue[0];
    const us = UNITS[kind];
    let live = 0;
    for (const u of this.units) if (u.side === b.side && u.kind !== "commander") live++;
    if (live + us.batch > RULES.unitCap) return;
    // máy bay mới cần chỗ đậu cho cả lô: không đủ bãi trống thì nhà máy tạm dừng
    if (us.domain === "air" && this.freePads(b.side) < us.batch) return;
    // thiếu điện thì đúc chậm (Tổng Hành Dinh tự có điện nên không bị ảnh hưởng)
    b.prog += BUILDINGS[b.kind].power < 0 ? b.powerFrac : 1;
    if (b.prog < sec(lotTime(kind))) return;
    b.prog = 0;
    b.queue.shift();
    const lot = this.nextId++;
    const ids: number[] = [];
    for (let k = 0; k < us.batch; k++) {
    const offset = (k - (us.batch - 1) / 2) * (2 * us.radius + FORMATION_GAP);
    if (us.domain === "air") {
      // Nhà Máy Máy Bay: lăn ra cửa xưởng (phía cửa theo nấc xoay `doorDir`), cất cánh thẳng ra trước, rồi tự
      // bay về bãi trống gần nhất (giữ chỗ ngay từ lúc xuất xưởng để hai máy bay không tranh một bãi)
      const slot = this.nearestFreePad(b.side, b.x, b.z)!;
      const [ddx, ddz] = doorDir(b.rot);
      const reach = BUILDINGS[b.kind].half[1] + 1; // nửa chiều sâu theo khung mô hình (cửa ở +z của mô hình)
      const u = this.spawnUnit(kind, b.side, b.x + ddx * reach - ddz * offset, b.z + ddz * reach + ddx * offset);
      u.lot = lot;
      u.hx = u.phx = ddx;
      u.hz = u.phz = ddz;
      slot.b.pads[slot.i] = u.id;
      u.padB = slot.b.id;
      u.padI = slot.i;
      u.rtb = true;
      u.air = "takeoff";
      u.airT = 0;
    } else {
      // xe ra ở ô cửa ra (trước cửa, phía `doorDir`), cả lô xếp ngang theo bề rộng cửa; chỗ bị xe khác đứng thì lấy ô trống gần nhất
      const e = this.exitRect(b.kind, b.x, b.z, b.rot);
      const [ddx, ddz] = doorDir(b.rot);
      const out = BUILDINGS[b.kind].half[1] + 2.5;
      // mép ngoài ô cửa ra, cả lô xếp ngang (vuông góc hướng cửa)
      const [fx, fz] = e
        ? [e[0] + ddx * e[2] - ddz * offset, e[1] + ddz * e[3] + ddx * offset]
        : [b.x + ddx * out - ddz * offset, b.z + ddz * out + ddx * offset];
      const [sx, sz] = this.grid.nearestFree(fx, fz, 6) ?? [fx, fz];
      const u = this.spawnUnit(kind, b.side, sx, sz);
      u.hx = u.phx = ddx;
      u.hz = u.phz = ddz;
      u.lot = lot;
      ids.push(u.id);
    }
    this.sides[b.side].stats.unitsBuilt++;
    }
    if (ids.length && kind !== "hauler" && b.rallySet) this.orderMove(b.side, ids, b.rallyX, b.rallyZ, "move");
  }

  // ------------------------------------------------------------------ mỏ

  private updateMines(): void {
    for (const m of this.mines) {
      const prev = m.owner;
      const now = this.captureStep(m);
      if (now === null) continue;
      m.slots = [];
      if (now === -1) this.alert(prev as Side, "mineLost", m.x, m.z);
      this.events.push({ t: "captured", mine: m.id, res: m.res, side: now, prev: now === -1 ? prev : -1 });
    }
    for (const up of this.uplinks) {
      const prev = up.owner;
      // số liệu sau trận: thời gian giữ đài (tính theo chủ đầu tick)
      if (prev !== -1) this.sides[prev].stats.uplinkTime += DT;
      const now = this.captureStep(up);
      if (now === null) continue;
      if (now === -1) this.alert(prev as Side, "uplinkLost", up.x, up.z);
      this.events.push({ t: "uplink", id: up.id, side: now, prev, x: up.x, z: up.z });
    }
  }

  /**
   * Chiếm (mỏ, Đài Liên Lạc): xe mặt đất có sức chiếm trong bán kính đẩy tiến độ; hai phe cùng có mặt thì giằng co;
   * không ai thì chủ cũ tự hồi, chiếm dở thì phai dần. Trả về chủ mới khi đổi chủ (-1 = vừa bị giành thành trung lập), không đổi thì null.
   */
  private captureStep(m: { x: number; z: number; owner: Side | -1; cap: number; capSide: Side | -1 }): Side | -1 | null {
    const R2 = RULES.captureRadius * RULES.captureRadius;
    const step = 1 / sec(RULES.captureSeconds);
    let w0 = 0;
    let w1 = 0;
    for (const u of this.units) {
      if (u.air !== "none" || u.hp <= 0) continue;
      const cw = UNITS[u.kind].captureWeight;
      if (cw <= 0 || dist2(u.x, u.z, m.x, m.z) > R2) continue;
      if (u.side === 0) w0 += cw;
      else w1 += cw;
    }
    if (w0 > 0 && w1 > 0) return null;
    if (w0 === 0 && w1 === 0) {
      if (m.owner >= 0) m.cap = Math.min(1, m.cap + step * 0.25);
      else if (m.cap > 0) m.cap = Math.max(0, m.cap - step * 0.1);
      return null;
    }
    const s: Side = w0 > 0 ? 0 : 1;
    const rate = Math.min(RULES.captureMaxWeight, w0 + w1) * step;
    if (m.owner === s) m.cap = Math.min(1, m.cap + rate);
    else if (m.owner !== -1) {
      m.cap -= rate;
      if (m.cap <= 0) {
        m.owner = -1;
        m.cap = 0;
        m.capSide = s;
        return -1;
      }
    } else if (m.capSide !== s && m.cap > 0) {
      m.cap -= rate;
      if (m.cap <= 0) {
        m.cap = 0;
        m.capSide = s;
      }
    } else {
      m.capSide = s;
      m.cap += rate;
      if (m.cap >= 1) {
        m.cap = 1;
        m.owner = s;
        return s;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ quân mặt đất

  private setIdle(u: Unit): void {
    u.order = "idle";
    u.tx = u.x;
    u.tz = u.z;
    u.targetId = 0;
    u.path = [];
    u.pathI = 0;
    u.chasing = false;
  }

  private halt(u: Unit): void {
    u.path = [];
    u.pathI = 0;
  }

  private setPath(u: Unit, x: number, z: number): boolean {
    // tìm đường nhanh nhất theo kiểu xe (bánh / xích) và địa hình (B3b)
    const spec = UNITS[u.kind];
    const p = this.grid.findPath(u.x, u.z, x, z, this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist));
    u.path = p ?? [];
    u.pathI = 0;
    u.stuck = 0;
    return p !== null;
  }

  private tryMove(u: Unit, nx: number, nz: number): boolean {
    if (!this.grid.blockedAt(nx, nz)) {
      u.x = nx;
      u.z = nz;
      return true;
    }
    if (!this.grid.blockedAt(nx, u.z)) {
      u.x = nx;
      return true;
    }
    if (!this.grid.blockedAt(u.x, nz)) {
      u.z = nz;
      return true;
    }
    return false;
  }

  /** Độ cao mặt đất nội suy song tuyến giữa tâm các ô (mượt hơn heightAt). Chỉ + − × ÷ nên tất định. */
  heightSmooth(x: number, z: number): number {
    const g = this.grid;
    const fx = clamp((x + this.map.halfW) / CELL - 0.5, 0, g.cols - 1);
    const fz = clamp((z + this.map.halfH) / CELL - 0.5, 0, g.rows - 1);
    const ix = Math.min(Math.floor(fx), g.cols - 2);
    const iz = Math.min(Math.floor(fz), g.rows - 2);
    const tx = fx - ix;
    const tz = fz - iz;
    const H = this.cellH;
    const i = iz * g.cols + ix;
    const a = H[i] + (H[i + 1] - H[i]) * tx;
    const b = H[i + g.cols] + (H[i + g.cols + 1] - H[i + g.cols]) * tx;
    return a + (b - a) * tz;
  }

  /** Hệ số tốc độ do địa hình của xe mặt đất đang đứng tại (x, z): loại địa hình × kiểu xe (chưa tính độ dốc). */
  terrainFactor(u: Unit): number {
    const spec = UNITS[u.kind];
    return this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist).k[this.grid.index(u.x, u.z)];
  }

  /**
   * Hệ số tốc độ lúc này của xe mặt đất đi theo hướng (dx, dz) (vector đơn vị): loại địa hình dưới xe × độ dốc.
   * Lên dốc chậm dần (RULES.terrain.slopeSlow), xuống dốc không nhanh hơn.
   */
  private moveFactor(u: Unit, dx: number, dz: number): number {
    let k = this.terrainFactor(u);
    // phòng hờ: xe lỡ đứng trên ô không đi được thì vẫn bò ra được
    if (!(k > 0)) k = 0.3;
    const T = RULES.terrain;
    const L = T.slopeProbe;
    const grade = (this.heightSmooth(u.x + dx * L, u.z + dz * L) - this.heightSmooth(u.x, u.z)) / L;
    if (grade > 0) k *= Math.max(T.slopeMin, 1 - T.slopeSlow * grade);
    return k;
  }

  /** Đi theo đường; trả về true khi đã tới nơi (hoặc bỏ cuộc vì kẹt quá lâu). */
  private follow(u: Unit): boolean {
    if (u.pathI * 2 >= u.path.length) return true;
    const spec = UNITS[u.kind];
    // Quân cố định (deploy): thu bệ xong mới chạy được, mất đúng ngần ấy thời gian đã hạ bệ (tối đa deploy.time)
    const dep = spec.weapon?.deploy;
    if (dep && u.still > 0) {
      u.still = Math.min(u.still, sec(dep.time)) - 1;
      u.packing = true;
      return false;
    }
    // tốc độ theo địa hình và độ dốc, đo theo hướng tới điểm kế tiếp trên đường
    const fdx = u.path[u.pathI * 2] - u.x;
    const fdz = u.path[u.pathI * 2 + 1] - u.z;
    const fd = Math.sqrt(fdx * fdx + fdz * fdz);
    // lệch hướng nhiều: đứng lại xoay tại chỗ (chưa chạy, không tính là kẹt)
    if (fd > 1e-6 && !this.turnHull(u, fdx / fd, fdz / fd)) return false;
    const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
    const full = this.speedOf(u) * DT * rally * (fd > 1e-6 ? this.moveFactor(u, fdx / fd, fdz / fd) : this.moveFactor(u, 0, 0));
    let step = full;
    const ox = u.x;
    const oz = u.z;
    while (step > 1e-9 && u.pathI * 2 < u.path.length) {
      const wx = u.path[u.pathI * 2];
      const wz = u.path[u.pathI * 2 + 1];
      const dx = wx - u.x;
      const dz = wz - u.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= step) {
        if (!this.tryMove(u, wx, wz)) break;
        step -= d;
        u.pathI++;
        continue;
      }
      this.tryMove(u, u.x + (dx / d) * step, u.z + (dz / d) * step);
      break;
    }
    const moved2 = dist2(ox, oz, u.x, u.z);
    u.moved = u.moved || moved2 > 1e-6;
    // "kẹt" so với tốc độ thực tế lúc này (lội bùn, leo dốc chậm không phải là kẹt)
    const expect = full * 0.2;
    if (moved2 < expect * expect) u.stuck++;
    else if (u.stuck > 0) u.stuck--;
    if (u.stuck >= 12 && u.path.length >= 2) {
      const ex = u.path[u.path.length - 2];
      const ez = u.path[u.path.length - 1];
      if (dist2(u.x, u.z, ex, ez) < 25 || u.stuck >= 40) {
        u.path = [];
        u.pathI = 0;
        u.stuck = 0;
        return true;
      }
      if (u.stuck % 12 === 0) {
        const s = u.stuck;
        this.setPath(u, ex, ez);
        u.stuck = s;
      }
    }
    return u.pathI * 2 >= u.path.length;
  }

  private chase(u: Unit, t: Target): void {
    // Đi hết đường mà chưa tới tầm thì tìm lại ngay. Tìm thất bại (đường rỗng) thì chờ hẹn lại, đừng thử lại
    // mỗi tick: mỗi lần thất bại A* quét gần cả bản đồ (~10 ms), hai xe là đủ làm trận chậm hẳn.
    const done = u.pathI * 2 >= u.path.length;
    if (!u.chasing || this.tick >= u.repathAt || (done && u.path.length > 0)) {
      let gx = t.x;
      let gz = t.z;
      // công trình chiếm chỗ ô ở tâm: nhắm ô trống gần nhất cạnh nó
      if (t.cat === "building") {
        const f = this.grid.nearestFree(t.x, t.z, 10);
        if (f) [gx, gz] = f;
      }
      this.setPath(u, gx, gz);
      u.repathAt = this.tick + sec(1);
      u.chasing = true;
    }
    this.follow(u);
  }

  private inRange(x: number, z: number, w: WeaponSpec, t: Target, range = w.range): boolean {
    const reach = range + this.radiusOf(t) * (t.cat === "building" ? 1 : 0.5);
    const d2 = dist2(x, z, t.x, t.z);
    if (w.minRange && d2 < w.minRange * w.minRange) return false;
    return d2 <= reach * reach;
  }

  /** Đã triển khai xong (Lockdown) chưa: đứng yên đủ lâu. */
  private deployed(src: Unit | Building, w: WeaponSpec): boolean {
    return !!w.deploy && src.cat === "unit" && src.still >= sec(w.deploy.time);
  }

  /** Tầm bắn thực tế: cộng thêm khi đã triển khai, và khi đứng trên cao (quân mặt đất, công trình; Pháo được nhân `heightBonus`). */
  reach(src: Unit | Building, w: WeaponSpec): number {
    let r = this.deployed(src, w) ? w.range * (1 + w.deploy!.range) : w.range;
    if (src.cat === "building" || src.air === "none") {
      const T = RULES.terrain;
      const k = w.heightBonus ?? 1;
      r *= 1 + clamp(this.heightAt(src.x, src.z) * T.rangePerM * k, 0, T.rangeMax * k);
    }
    return r;
  }

  /** Độ cao mặt đất (m) tại ô chứa điểm (x, z). */
  heightAt(x: number, z: number): number {
    return this.cellH[this.grid.index(x, z)];
  }

  /** Tầm nhìn thực tế: đứng cao nhìn xa hơn, đứng trong rừng / tuyết nhìn gần hơn (không áp cho máy bay). */
  private sightOf(base: number, x: number, z: number, air: boolean): number {
    if (air) return base;
    const T = RULES.terrain;
    return base * (1 + clamp(this.heightAt(x, z) * T.sightPerM, 0, T.sightMax)) * TERRAIN[this.grid.kindAt(x, z)].sight;
  }

  /** Chọn mục tiêu: giữ mục tiêu cũ nếu còn hợp lệ, nếu không thì chọn gần nhất (ưu tiên quân có vũ khí, rồi mới tới công trình). */
  private acquireFrom(self: Target, side: Side, x: number, z: number, w: WeaponSpec, range: number, current: number): Target | null {
    const cur = this.target(current);
    if (cur && cur.side !== side && this.canHit(w, cur) && this.visibleTo(side, cur)) {
      const r = range + this.radiusOf(cur) + 3;
      if (dist2(x, z, cur.x, cur.z) <= r * r) return cur;
    }
    let best: Target | null = null;
    let bestScore = Infinity;
    for (const e of this.units) {
      if (e.side === side || e.hp <= 0 || e === self || !this.canHit(w, e)) continue;
      const r = range + UNITS[e.kind].radius * 0.5;
      const d2 = dist2(x, z, e.x, e.z);
      if (d2 > r * r || (w.minRange && d2 < w.minRange * w.minRange) || !this.visibleTo(side, e)) continue;
      // vũ khí tản (rải thảm) nhắm vào chỗ quân địch đứng dày nhất, không phải chiếc gần nhất
      const cluster = w.scatter ? this.clusterValue(side, e.x, e.z, w.scatter + w.splash) * 2 : 0;
      const score = d2 + (UNITS[e.kind].weapon ? 0 : 60) - cluster;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    for (const b of this.buildings) {
      if (b.side === side || b.hp <= 0 || !this.canHit(w, b)) continue;
      const r = range + Math.max(BUILDINGS[b.kind].half[0], BUILDINGS[b.kind].half[1]);
      const d2 = dist2(x, z, b.x, b.z);
      if (d2 > r * r || (w.minRange && d2 < w.minRange * w.minRange) || !this.visibleTo(side, b)) continue;
      const score = d2 + 400 - (w.scatter ? valueOf(b.kind) : 0);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  private acquire(u: Unit, w: WeaponSpec, range: number): Target | null {
    const t = this.acquireFrom(u, u.side, u.x, u.z, w, range, u.autoTarget);
    u.autoTarget = t ? t.id : 0;
    return t;
  }

  private updateGround(u: Unit): void {
    if (u.cooldown > 0) u.cooldown--;
    if (u.kind === "hauler") {
      this.updateHauler(u);
      return;
    }
    const w = UNITS[u.kind].weapon;
    const range = w ? this.reach(u, w) : 0;
    let fireAt: Target | null = null;
    if (u.squad) fireAt = this.squadMember(u, w, range);
    else
    switch (u.order) {
      case "attack": {
        const t = this.target(u.targetId);
        if (!t || t.side === u.side || !w || !this.canHit(w, t) || !this.visibleTo(u.side, t)) {
          this.setIdle(u);
          break;
        }
        fireAt = t;
        if (this.inRange(u.x, u.z, w, t, range)) this.halt(u);
        else this.chase(u, t);
        break;
      }
      case "amove": {
        const t = w ? this.acquire(u, w, range + IDLE_ACQUIRE_BONUS) : null;
        // quân cố định không rẽ đường đuổi mục tiêu ngoài tầm: chỉ dừng lại bắn khi mục tiêu đã trong tầm
        const anchored = !!w?.deploy;
        if (t && w && (!anchored || this.inRange(u.x, u.z, w, t, range))) {
          fireAt = t;
          if (this.inRange(u.x, u.z, w, t, range)) this.halt(u);
          else this.chase(u, t);
        } else {
          if (u.chasing || u.path.length === 0) {
            u.chasing = false;
            this.setPath(u, u.tx, u.tz);
          }
          if (this.follow(u)) this.arrive(u);
        }
        break;
      }
      case "move": {
        if (this.follow(u)) this.arrive(u);
        if (w) fireAt = this.acquire(u, w, range);
        break;
      }
      case "strike": {
        if (!w) {
          this.setIdle(u);
          break;
        }
        const d2 = dist2(u.x, u.z, u.tx, u.tz);
        const min = w.minRange ?? 0;
        if (d2 <= range * range && d2 >= min * min) {
          // trong tầm: dừng lại, dựng dàn (đứng yên đủ lâu), xả hết loạt rồi nghỉ tại chỗ
          this.halt(u);
          if (this.tryFireGround(u, w, u.tx, u.tz) && u.burst === 0) this.setIdle(u);
        } else if (u.pathI * 2 >= u.path.length) {
          // chưa tới tầm (hoặc đứng quá gần): tìm chỗ đứng bắn, tối đa mỗi giây một lần (tìm đường thất bại rất tốn)
          if (this.tick < u.repathAt) break;
          u.repathAt = this.tick + sec(1);
          if (!this.strikeApproach(u, w, range)) this.setIdle(u);
        } else this.follow(u);
        break;
      }
      case "idle": {
        const t = w ? this.acquire(u, w, range + IDLE_ACQUIRE_BONUS) : null;
        if (t && w) {
          fireAt = t;
          if (this.inRange(u.x, u.z, w, t, range)) this.halt(u);
          // quân cố định (SkyGuard, Pháo, Tên Lửa Loạt) giữ chỗ đứng: không tự bỏ vị trí đuổi theo mục tiêu
          else if (!w.deploy && dist2(u.x, u.z, u.tx, u.tz) < LEASH * LEASH) this.chase(u, t);
          else this.halt(u);
        } else if (dist2(u.x, u.z, u.tx, u.tz) > 16) {
          if (u.chasing || u.path.length === 0) {
            u.chasing = false;
            this.setPath(u, u.tx, u.tz);
          }
          if (this.follow(u)) {
            u.tx = u.x;
            u.tz = u.z;
            u.path = [];
          }
        } else if (u.chasing) {
          u.chasing = false;
          this.halt(u);
        }
        break;
      }
    }
    if (w) {
      // mâm xoay quay về mục tiêu (lệnh rải thảm: về điểm bắn); rảnh thì về hướng thân
      if (fireAt) this.aim(u, w, fireAt.x, fireAt.z);
      else if (u.order === "strike") this.aim(u, w, u.tx, u.tz);
      else this.aim(u, w, null, 0);
    }
    if (fireAt && w) this.tryFire(u, w, fireAt);
    // đứng chờ: thân xoay dần về hướng được giao (hướng đội hình khi tới nơi); đang bắn thì thôi
    if (u.order === "idle" && !u.squad && !u.moved && !fireAt && (u.faceX !== 0 || u.faceZ !== 0) && u.hx * u.faceX + u.hz * u.faceZ < ALIGNED_COS)
      this.turnHull(u, u.faceX, u.faceZ);
    // Lockdown: đếm thời gian đứng yên (chạy là mất triển khai; đang thu bệ thì follow() đã trừ dần)
    if (!u.packing) u.still = u.moved ? 0 : Math.min(u.still + 1, 100000);
    this.rechargePd(u);
  }

  /**
   * Mâm xoay quay về điểm (tx, tz) với tốc độ giới hạn `traverse` độ/giây (người dùng chốt 06/11/2026: mọi mâm xoay đều
   * mất thời gian, để chỉ huy sai thì phải trả giá). tx = null: quân về hướng thân, công trình giữ hướng cũ.
   */
  private aim(src: Unit | Building, w: WeaponSpec, tx: number | null, tz: number): void {
    if (!w.traverse) {
      if (src.cat === "unit") {
        src.aimX = src.hx;
        src.aimZ = src.hz;
      }
      return;
    }
    let dx: number;
    let dz: number;
    const l = tx === null ? 0 : Math.sqrt(dist2(src.x, src.z, tx, tz));
    if (tx !== null && l > 1e-6) {
      dx = (tx - src.x) / l;
      dz = (tz - src.z) / l;
    } else if (src.cat === "unit") {
      dx = src.hx;
      dz = src.hz;
    } else return;
    turnToward(src.aimX, src.aimZ, dx, dz, traverseStep(w.traverse), TMP);
    src.aimX = TMP.x;
    src.aimZ = TMP.z;
  }

  private rechargePd(u: Unit): void {
    const pd = UNITS[u.kind].pointDefense;
    if (!pd || u.pd >= pd.charges) return;
    if (++u.pdT >= sec(pd.recharge)) {
      u.pd++;
      u.pdT = 0;
    }
  }

  /** Điểm ngẫu nhiên (có seed) trong hình tròn đơn vị: lấy mẫu loại bỏ, không dùng lượng giác. */
  private randDisc(): [number, number] {
    for (let i = 0; i < 16; i++) {
      const x = this.rng.next() * 2 - 1;
      const z = this.rng.next() * 2 - 1;
      if (x * x + z * z <= 1) return [x, z];
    }
    return [0, 0];
  }

  /** Nhịp bắn: hết loạt thì nạp lại `cooldown`, đang giữa loạt thì chờ `burst.interval`. */
  private nextCooldown(src: Unit | Building, w: WeaponSpec): number {
    if (!w.burst) return w.cooldown;
    if (src.burst <= 0) src.burst = w.burst.shots;
    src.burst--;
    if (src.burst <= 0) return w.cooldown;
    if (!w.burst.even) return w.burst.interval;
    // nhịp lẻ so với tick: quả thứ k bắn ở tick round(k × interval), cả loạt đi đúng tổng thời gian mong muốn
    const k = w.burst.shots - src.burst;
    return (Math.round(k * w.burst.interval * TICK_RATE) - Math.round((k - 1) * w.burst.interval * TICK_RATE)) / TICK_RATE;
  }

  private auraFactor(u: Unit): number {
    const c = this.commanders[u.side];
    if (!c || c.hp <= 0) return 1;
    const aura = UNITS.commander.aura!;
    const near = c === u || dist2(u.x, u.z, c.x, c.z) <= aura.radius * aura.radius;
    let k = near && c !== u ? aura.fireRate : 1;
    if (near && this.sides[u.side].mobilizeUntil > this.tick) k *= 1 + RULES.abilities.mobilize.fireRate;
    return k;
  }

  /** Quân đang được Tổng động viên (trong bán kính hào quang của Xe Tư Lệnh khi kỹ năng còn hiệu lực). */
  mobilized(u: Unit): boolean {
    if (this.sides[u.side].mobilizeUntil <= this.tick) return false;
    const c = this.commanders[u.side];
    if (!c || c.hp <= 0) return false;
    const r = UNITS.commander.aura!.radius;
    return c === u || dist2(u.x, u.z, c.x, c.z) <= r * r;
  }

  private tryFire(src: Unit | Building, w: WeaponSpec, t: Target): boolean {
    if (src.cooldown > 0 || !this.inRange(src.x, src.z, w, t, this.reach(src, w))) return false;
    if (this.sandbox?.hold[src.side]) return false;
    const air = this.isAirborne(t);
    let dmg = air ? w.dmgAir : w.dmgGround;
    if (dmg <= 0) return false;
    const ground = src.cat === "unit" && src.air === "none";
    const d = Math.sqrt(dist2(src.x, src.z, t.x, t.z));
    // Mâm xoay: nòng chưa về đúng hướng thì chưa bắn (quân mặt đất và công trình; máy bay ngắm bằng cả thân, fireArc)
    if (w.traverse && (ground || src.cat === "building") && d > 1e-6 && (src.aimX * (t.x - src.x) + src.aimZ * (t.z - src.z)) / d < AIM_COS) return false;
    const deployed = this.deployed(src, w);
    if (w.deploy?.required && !deployed) return false;
    if (deployed) dmg *= 1 + w.deploy!.dmg;
    let miss = false;
    if (w.movePenalty && ground && src.moved) {
      dmg *= 1 - w.movePenalty.dmg;
      miss = this.rng.next() < w.movePenalty.miss;
    }
    this.salvoStart(src, w, t.x, t.z);
    let cd = this.nextCooldown(src, w);
    if (src.cat === "unit") cd /= this.auraFactor(src);
    else if (BUILDINGS[src.kind].power < 0) cd /= Math.max(0.1, src.powerFrac);
    src.cooldown = Math.max(1, Math.round(cd * TICK_RATE));
    src.lastShot = this.tick;
    const talt = t.cat === "unit" ? t.alt : 0;
    const ticks = Math.max(1, Math.ceil((d / (w.shotSpeed ?? SHOT_SPEED[w.visual])) * TICK_RATE));
    // Nhiều nòng: các viên bắn song song, xuất phát lệch sang hai bên theo hướng vuông góc với đường ngắm
    const n = w.barrels ?? 1;
    // trục đặt nòng: máy bay thì theo trục cánh (vuông góc hướng bay), còn lại vuông góc đường ngắm
    const wing = src.cat === "unit" && src.air !== "none";
    const px = wing ? -src.hz : d > 1e-6 ? -(t.z - src.z) / d : 0;
    const pz = wing ? src.hx : d > 1e-6 ? (t.x - src.x) / d : 0;
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * BARREL_GAP;
      // Điểm rơi: bám mục tiêu, trừ khi bắn trượt hoặc vũ khí có độ tản
      let target = t.id;
      let tx = t.x;
      let tz = t.z;
      if (miss) {
        const [ox, oz] = this.randDisc();
        const l = Math.sqrt(ox * ox + oz * oz) || 1;
        const off = this.radiusOf(t) + 2.5;
        tx += (ox / l) * off;
        tz += (oz / l) * off;
        target = 0;
      } else if (w.scatter) {
        const [ox, oz] = this.randDisc();
        tx += ox * w.scatter;
        tz += oz * w.scatter;
        target = 0;
      }
      this.pushShot(src, w, target, tx, tz, talt, dmg, air, ticks, px * side, pz * side);
    }
    if (ground && !w.traverse && !w.deploy) {
      // quay thân về phía mục tiêu khi đứng bắn. Giữ nguyên thân, chỉ mâm / nòng quay: xe có tháp pháo xoay chậm,
      // và quân cố định (deploy: đế đã hạ chân chống thì không xoay theo mục tiêu, kể cả máy bay)
      if (src.path.length === 0) {
        const l = d || 1;
        src.hx = (t.x - src.x) / l;
        src.hz = (t.z - src.z) / l;
      }
    }
    return true;
  }

  private pushShot(src: Unit | Building, w: WeaponSpec, target: number, tx: number, tz: number, talt: number, dmg: number, air: boolean, ticks: number, ox = 0, oz = 0): void {
    // cựu binh: mỗi cấp bắn mạnh hơn
    if (src.cat === "unit" && src.rank > 0) dmg *= 1 + src.rank * RULES.veterancy.dmgPerRank;
    this.shots.push({
      side: src.side,
      src: src.id,
      target,
      tx,
      tz,
      dmg,
      dmgType: w.dmgType,
      sx: src.x + ox,
      sz: src.z + oz,
      talt,
      interceptable: !!w.interceptable,
      splash: w.splash,
      hitAir: air,
      impact: this.tick + ticks,
      visual: w.visual
    });
    this.events.push({
      t: "shot",
      src: src.id,
      side: src.side,
      visual: w.visual,
      x: src.x + ox,
      z: src.z + oz,
      alt: src.cat === "unit" ? src.alt : 0,
      target,
      tx,
      tz,
      talt,
      ticks,
      ox,
      oz
    });
  }

  /** Vũ khí phụ (tên lửa dưới cánh): mỗi lần một quả, luân phiên hai bên cánh, trừ cơ số đạn của lần xuất kích. */
  private fireSecondary(u: Unit, w: WeaponSpec & { ammo: number }, t: Target, d: number): void {
    if (this.sandbox?.hold[u.side]) return;
    const air = this.isAirborne(t);
    const dmg = air ? w.dmgAir : w.dmgGround;
    u.ammo2--;
    u.cd2 = Math.max(1, Math.round(w.cooldown * TICK_RATE));
    const side = (u.ammo2 % 2 === 0 ? 1 : -1) * MISSILE_PYLON;
    const ticks = Math.max(1, Math.ceil((d / (w.shotSpeed ?? SHOT_SPEED[w.visual])) * TICK_RATE));
    this.pushShot(u, w, t.id, t.x, t.z, t.cat === "unit" ? t.alt : 0, dmg, air, ticks, -u.hz * side, u.hx * side);
  }

  /** Ném bom rải thảm: bom trôi theo đà máy bay, rơi xuống điểm phía trước đường bay, không bám mục tiêu. */
  private dropBomb(u: Unit, w: WeaponSpec): void {
    if (this.sandbox?.hold[u.side]) return;
    const lead = u.speed * BOMB_FALL;
    const tx = u.x + u.hx * lead;
    const tz = u.z + u.hz * lead;
    u.cooldown = Math.max(1, Math.round(this.nextCooldown(u, w) * TICK_RATE));
    u.lastShot = this.tick;
    this.pushShot(u, w, 0, tx, tz, 0, w.dmgGround, false, sec(BOMB_FALL));
  }

  // ------------------------------------------------------------------ Xe Vận Tải

  private mineOf(u: Unit): Mine | null {
    const e = this.byId.get(u.mineId);
    return e && e.cat === "mine" && e.owner === u.side && e.amount > 0 ? e : null;
  }

  private releaseMine(u: Unit): void {
    if (!u.mineId) return;
    const e = this.byId.get(u.mineId);
    if (e && e.cat === "mine") {
      const i = e.slots.indexOf(u.id);
      if (i >= 0) e.slots.splice(i, 1);
    }
    u.mineId = 0;
  }

  private assignMine(u: Unit, preferred: number): boolean {
    const st = this.sides[u.side];
    let best: Mine | null = null;
    const pref = this.byId.get(preferred);
    if (pref && pref.cat === "mine" && pref.owner === u.side && pref.amount > 0 && (pref.slots.length < RULES.mineSlots || pref.slots.includes(u.id))) best = pref;
    else if (preferred) return false;
    else {
      let bestD = Infinity;
      for (const m of this.mines) {
        if (m.owner !== u.side || m.amount <= 0) continue;
        if (m.slots.length >= RULES.mineSlots && !m.slots.includes(u.id)) continue;
        let d = dist2(u.x, u.z, m.x, m.z);
        // thiếu Dầu thì ưu tiên giàn Dầu
        if (m.res === "oil" && st.oil < 150) d *= 0.35;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
    }
    if (!best) return false;
    if (u.mineId !== best.id) {
      this.releaseMine(u);
      best.slots.push(u.id);
      u.mineId = best.id;
    }
    if (u.cargo > 0 && u.cargoRes !== best.res) this.toDock(u);
    else this.goMine(u, best);
    return true;
  }

  private slotPos(m: Mine, u: Unit): [number, number] {
    const i = Math.max(0, m.slots.indexOf(u.id)) % SLOT_OFFSETS.length;
    const [ox, oz] = SLOT_OFFSETS[i];
    return this.grid.nearestFree(m.x + ox, m.z + oz, 4) ?? [m.x + ox, m.z + oz];
  }

  private goMine(u: Unit, m: Mine): void {
    u.hState = "toMine";
    const [x, z] = this.slotPos(m, u);
    this.setPath(u, x, z);
  }

  /**
   * Ô đỗ dỡ hàng quanh Tổng Hành Dinh (người dùng 10/11/2026: xe tải hay chụm đầu vào một chỗ). Mỗi cạnh `DOCK_PER_SIDE` ô
   * cách nhau `DOCK_GAP` m (rộng hơn bề ngang xe), xe đỗ đầu hướng vào nhà nên các thùng nằm song song, không chồng nhau.
   * Trả về [dx, dz, nx, nz] so với tâm nhà cho phe Lam; phe Đỏ đảo dấu cả bốn số để chọn ô đối xứng tuyệt đối.
   */
  private dockSlots(): readonly (readonly [number, number, number, number])[] {
    if (this.docks) return this.docks;
    const r = BUILDINGS.hq.half[0] + DOCK_OUT;
    const out: [number, number, number, number][] = [];
    for (const [nx, nz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const)
      for (let k = 0; k < DOCK_PER_SIDE; k++) {
        const t = (k - (DOCK_PER_SIDE - 1) / 2) * DOCK_GAP;
        out.push([nx * r - nz * t, nz * r + nx * t, nx, nz]);
      }
    return (this.docks = out);
  }

  private toDock(u: Unit): void {
    const hq = this.hqOf(u.side);
    if (!hq) {
      u.hState = "idle";
      return;
    }
    // chọn ô đỗ còn trống gần xe nhất; ô đã có xe khác đang tới / đang dỡ thì coi như rất xa (hết ô trống thì chen ô gần nhất)
    const sg = u.side === 0 ? 1 : -1;
    let best = -1;
    let bestD = Infinity;
    const slots = this.dockSlots();
    for (let i = 0; i < slots.length; i++) {
      const sx = hq.x + sg * slots[i][0];
      const sz = hq.z + sg * slots[i][1];
      if (this.grid.blockedAt(sx, sz)) continue;
      let d = dist2(u.x, u.z, sx, sz);
      for (const o of this.units)
        if (o !== u && o.kind === "hauler" && o.side === u.side && (o.hState === "toDock" || o.hState === "unloading") && dist2(o.tx, o.tz, sx, sz) < 0.25) {
          d += 1e6;
          break;
        }
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      const sl = slots[best];
      u.tx = hq.x + sg * sl[0];
      u.tz = hq.z + sg * sl[1];
      u.faceX = -sg * sl[2];
      u.faceZ = -sg * sl[3];
    } else {
      // mọi ô đều bị công trình chắn (hiếm): dỡ ở cạnh nhà gần phía xe đang tới như cũ
      const dx = u.x - hq.x;
      const dz = u.z - hq.z;
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      const r = BUILDINGS.hq.half[0] + DOCK_OUT;
      const f = this.grid.nearestFree(hq.x + (dx / l) * r, hq.z + (dz / l) * r, 5) ?? [hq.x + r, hq.z];
      u.tx = f[0];
      u.tz = f[1];
      u.faceX = -dx / l;
      u.faceZ = -dz / l;
    }
    u.hState = "toDock";
    this.setPath(u, u.tx, u.tz);
  }

  private nearHq(u: Unit, hq: Building, margin: number): boolean {
    const h = BUILDINGS.hq.half[0] + margin;
    return Math.abs(u.x - hq.x) <= h && Math.abs(u.z - hq.z) <= h;
  }

  // ------------------------------------------------------------------ Xe Vận Tải: trục vớt xác

  /** Xác mà xe đang được giao kéo (còn nằm đó và vẫn do xe này giữ chỗ). */
  private wreckOf(u: Unit): Wreck | null {
    if (!u.wreckId) return null;
    for (const wr of this.wrecks) if (wr.id === u.wreckId) return wr.claim[u.side] === u.id ? wr : null;
    return null;
  }

  /** Bỏ việc kéo xác (xe nhận lệnh khác): trả chỗ để hậu cần điều xe khác. */
  private releaseWreck(u: Unit): void {
    if (!u.wreckId) return;
    for (const wr of this.wrecks) if (wr.id === u.wreckId && wr.claim[u.side] === u.id) wr.claim[u.side] = 0;
    u.wreckId = 0;
  }

  /** Giao xe đi kéo một xác (giữ chỗ của phe mình trên xác). Không tìm được đường tới xác thì thôi. */
  private startSalvage(u: Unit, wr: Wreck): void {
    this.releaseWreck(u);
    wr.claim[u.side] = u.id;
    u.wreckId = wr.id;
    u.hState = "toWreck";
    u.hTimer = 0;
    if (!this.setPath(u, wr.x, wr.z)) this.giveUpWreck(u);
  }

  /**
   * Không tới được xác (tìm đường thất bại / bị chắn mãi): đánh dấu xác "không tới được" với phe này (claim = −1) để
   * hậu cần không giao lại. Tìm đường thất bại rất tốn (A* quét gần cả bản đồ), thử lại mãi là trận chậm hẳn.
   */
  private giveUpWreck(u: Unit): void {
    const wr = this.wreckOf(u);
    if (wr) wr.claim[u.side] = -1;
    u.wreckId = 0;
    this.endSalvage(u);
  }

  /** Xong (hoặc bỏ) việc kéo xác: có hàng thì chở về, không thì quay lại mỏ cũ, hết việc thì chờ hậu cần giao việc. */
  private endSalvage(u: Unit): void {
    this.releaseWreck(u);
    if (u.cargo > 0 || u.scrap > 0) {
      this.toDock(u);
      return;
    }
    const m = this.mineOf(u);
    if (m) this.goMine(u, m);
    else u.hState = "idle";
  }

  /** Vùng hậu cần của phe: vùng xây dựng quanh công trình phe mình, hoặc quanh mỏ phe mình đang giữ. */
  private inLogistics(side: Side, x: number, z: number): boolean {
    for (const b of this.buildings) {
      if (b.side !== side || !b.built || b.hp <= 0) continue;
      const zone = BUILDINGS[b.kind].zone;
      if (zone && dist2(b.x, b.z, x, z) <= zone * zone) return true;
    }
    const r = RULES.salvage.mineArea;
    for (const m of this.mines) if (m.owner === side && dist2(m.x, m.z, x, z) <= r * r) return true;
    return false;
  }

  /** Phe `side` có đang thấy quân địch có vũ khí trong bán kính r quanh (x, z) không. */
  private threatened(side: Side, x: number, z: number, r: number): boolean {
    for (const e of this.units) {
      if (e.side === side || e.hp <= 0 || !UNITS[e.kind].weapon) continue;
      if (dist2(e.x, e.z, x, z) <= r * r && this.visibleTo(side, e)) return true;
    }
    return false;
  }

  /**
   * Bộ phận hậu cần tự điều xe trục vớt (Tư lệnh không phải ra lệnh từng xe): xe đang trống thùng, không theo lệnh tay,
   * được giao xác gần nhất mà phe mình đang thấy, nằm trong vùng hậu cần, không có địch quanh đó và chưa có xe phe mình nhận.
   * Mỗi phe tối đa `autoMax` xe đi kéo xác cùng lúc để việc khai thác mỏ không bị bỏ bê.
   */
  private autoSalvage(u: Unit): boolean {
    if (u.manual || u.cargo > 0 || u.scrap > 0 || this.wrecks.length === 0) return false;
    const S = RULES.salvage;
    let busy = 0;
    for (const h of this.units) if (h !== u && h.side === u.side && h.wreckId) busy++;
    if (busy >= S.autoMax) return false;
    let best: Wreck | null = null;
    let bestD = Infinity;
    for (const wr of this.wrecks) {
      if (wr.claim[u.side]) continue;
      const d = dist2(u.x, u.z, wr.x, wr.z);
      if (d >= bestD || !this.cellVisible(u.side, wr.x, wr.z) || !this.inLogistics(u.side, wr.x, wr.z) || this.threatened(u.side, wr.x, wr.z, S.threat)) continue;
      bestD = d;
      best = wr;
    }
    if (!best) return false;
    this.startSalvage(u, best);
    return u.wreckId !== 0;
  }

  private updateHauler(u: Unit): void {
    switch (u.hState) {
      case "idle": {
        if (u.order === "move") {
          if (this.follow(u)) this.setIdle(u);
          return;
        }
        if (!u.manual && (this.tick + u.id) % 10 === 0) {
          if ((u.cargo > 0 || u.scrap > 0) && this.hqOf(u.side)) this.toDock(u);
          else if (!this.autoSalvage(u)) this.assignMine(u, 0);
        }
        return;
      }
      case "toWreck": {
        const wr = this.wreckOf(u);
        if (!wr) {
          this.endSalvage(u);
          return;
        }
        const R = RULES.salvage.reach;
        if (dist2(u.x, u.z, wr.x, wr.z) <= R * R) {
          u.hState = "salvaging";
          u.hTimer = sec(RULES.salvage.load);
          this.halt(u);
          return;
        }
        // hết đường mà chưa tới (bị xe khác chắn): tìm đường lại vài lần rồi bỏ, đừng tìm lại mãi mỗi tick
        if (this.follow(u) && (++u.hTimer > SALVAGE_RETRIES || !this.setPath(u, wr.x, wr.z))) this.giveUpWreck(u);
        return;
      }
      case "salvaging": {
        const wr = this.wreckOf(u);
        if (!wr) {
          this.endSalvage(u);
          return;
        }
        if (--u.hTimer > 0) return;
        // cẩu xong: xác lên xe, biến khỏi chiến trường; chở về mới thành Sắt
        u.scrap += wr.value;
        this.wrecks.splice(this.wrecks.indexOf(wr), 1);
        u.wreckId = 0;
        this.toDock(u);
        return;
      }
      case "toMine": {
        const m = this.mineOf(u);
        if (!m) {
          this.releaseMine(u);
          u.hState = "idle";
          return;
        }
        if (dist2(u.x, u.z, m.x, m.z) <= 4.8 * 4.8) {
          u.hState = "mining";
          this.halt(u);
          return;
        }
        if (this.follow(u)) {
          if (dist2(u.x, u.z, m.x, m.z) <= 7 * 7) {
            u.hState = "mining";
            this.halt(u);
          } else this.goMine(u, m);
        }
        return;
      }
      case "mining": {
        const m = this.mineOf(u);
        if (!m) {
          this.releaseMine(u);
          u.hState = "idle";
          if (u.cargo > 0) this.toDock(u);
          return;
        }
        const cap = UNITS.hauler.cargo ?? 100;
        const take = Math.min(RULES.haulerMineRate * DT, m.amount, cap - u.cargo);
        m.amount -= take;
        u.cargo += take;
        u.cargoRes = m.res;
        if (u.cargo >= cap - 1e-6 || m.amount <= 1e-6) this.toDock(u);
        return;
      }
      case "toDock": {
        const hq = this.hqOf(u.side);
        if (!hq) {
          u.hState = "idle";
          return;
        }
        // chỉ dừng khi tới đúng ô đỗ của mình (trước đây chạm mép nhà là dừng nên cả đoàn chụm vào một góc)
        if (dist2(u.x, u.z, u.tx, u.tz) <= 2) {
          u.hState = "unloading";
          u.hTimer = sec(RULES.haulerUnload);
          this.halt(u);
          return;
        }
        if (this.follow(u)) {
          if (this.nearHq(u, hq, 4.5)) {
            u.hState = "unloading";
            u.hTimer = sec(RULES.haulerUnload);
          } else this.toDock(u);
        }
        return;
      }
      case "unloading": {
        this.turnHull(u, u.faceX, u.faceZ); // vừa dỡ vừa xoay thân cho ngay ô đỗ (đầu hướng vào nhà)
        if (--u.hTimer > 0) return;
        const st = this.sides[u.side];
        st[u.cargoRes] += u.cargo;
        if (u.cargoRes === "iron") st.stats.ironMined += u.cargo;
        else st.stats.oilMined += u.cargo;
        u.cargo = 0;
        if (u.scrap > 0) {
          st.iron += u.scrap;
          st.stats.salvaged += u.scrap;
          this.events.push({ t: "salvage", side: u.side, value: u.scrap, x: u.x, z: u.z });
          u.scrap = 0;
        }
        // thùng trống: hậu cần xem có xác nào trong vùng an toàn cần kéo không, không thì về mỏ
        if (this.autoSalvage(u)) return;
        const m = this.mineOf(u);
        if (m) this.goMine(u, m);
        else {
          this.releaseMine(u);
          u.hState = "idle";
          this.assignMine(u, 0);
        }
        return;
      }
    }
  }

  // ------------------------------------------------------------------ không quân

  private padPosOf(u: Unit): [number, number] | null {
    if (!u.padB) return null;
    const b = this.byId.get(u.padB);
    if (!b || b.cat !== "building" || b.hp <= 0 || !b.built) {
      u.padB = 0;
      u.padI = -1;
      return null;
    }
    return this.padPos(b, u.padI);
  }

  /** Sân Đáp (đã xây xong) còn bãi trống gần (x, z) nhất của một phe, kèm số thứ tự bãi trống đầu tiên. */
  private nearestFreePad(side: Side, x: number, z: number): { b: Building; i: number } | null {
    let best: Building | null = null;
    let bi = -1;
    let bd = Infinity;
    for (const b of this.buildings) {
      if (b.side !== side || b.kind !== "airfield" || !b.built || b.hp <= 0) continue;
      const i = b.pads.indexOf(0);
      if (i < 0) continue;
      const d = dist2(x, z, b.x, b.z);
      if (d < bd) {
        bd = d;
        best = b;
        bi = i;
      }
    }
    return best ? { b: best, i: bi } : null;
  }

  /** Phe này còn bãi đậu trống không (Nhà Máy Máy Bay chỉ đúc khi có; HUD và AI cũng hỏi). */
  /** Số bãi đậu còn trống của phe trên các Sân Đáp đã xây xong. */
  freePads(side: Side): number {
    let n = 0;
    for (const b of this.buildings) if (b.side === side && b.kind === "airfield" && b.built && b.hp > 0) for (const p of b.pads) if (p === 0) n++;
    return n;
  }

  hasFreePad(side: Side): boolean {
    return this.nearestFreePad(side, 0, 0) !== null;
  }

  private ensurePad(u: Unit): [number, number] | null {
    const p = this.padPosOf(u);
    if (p) return p;
    const slot = this.nearestFreePad(u.side, u.x, u.z);
    if (!slot) return null;
    slot.b.pads[slot.i] = u.id;
    u.padB = slot.b.id;
    u.padI = slot.i;
    return this.padPos(slot.b, slot.i);
  }

  private releasePad(u: Unit): void {
    if (!u.padB) return;
    const b = this.byId.get(u.padB);
    if (b && b.cat === "building") {
      const i = b.pads.indexOf(u.id);
      if (i >= 0) b.pads[i] = 0;
    }
    u.padB = 0;
    u.padI = -1;
  }

  /** Khoảng cách tới bãi đậu của mình (hoặc sân còn bãi trống gần nhất, không giữ chỗ). null = không còn sân nào. */
  private homeDistance(u: Unit): number | null {
    const p = this.padPosOf(u);
    if (p) return Math.sqrt(dist2(u.x, u.z, p[0], p[1]));
    let best = Infinity;
    for (const b of this.buildings) {
      if (b.side !== u.side || b.kind !== "airfield" || !b.built || b.hp <= 0 || b.pads.indexOf(0) < 0) continue;
      best = Math.min(best, dist2(u.x, u.z, b.x, b.z));
    }
    return best === Infinity ? null : Math.sqrt(best);
  }

  /** Lượng dầu cần để bay về và hạ cánh, cộng 25% dự phòng. */
  private fuelToReturn(u: Unit, spec: UnitSpec): number {
    const d = this.homeDistance(u);
    if (d === null) return 0;
    return (d / spec.speed + 3) * spec.fuel!.burn * 1.25;
  }

  /**
   * Đốt dầu. Máy bay luôn giữ một phần "dầu dự trữ" đủ bay về: khi cạn mà vẫn còn sân để về
   * thì không rơi mà bay về hạ cánh. Chỉ rơi khi không còn Sân Đáp nào của phe mình.
   * Trả về false nếu vừa rơi.
   */
  private burn(u: Unit, spec: UnitSpec): boolean {
    if (!this.sandbox?.infiniteFuel) u.fuel -= spec.fuel!.burn * DT;
    if (u.fuel > 0) return true;
    u.fuel = 0;
    if (this.homeDistance(u) !== null || u.air === "landing") {
      if (u.air === "flying" || u.air === "takeoff") {
        u.rtb = true;
        u.air = "returning";
      }
      return true;
    }
    u.hp = 0;
    u.crashed = true;
    return false;
  }

  private takeoff(u: Unit): void {
    let tx = u.mx;
    let tz = u.mz;
    const t = this.target(u.targetId);
    if (u.mission === "attack" && t) {
      tx = t.x;
      tz = t.z;
    }
    const dx = tx - u.x;
    const dz = tz - u.z;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l > 1) {
      u.hx = dx / l;
      u.hz = dz / l;
    }
    u.air = "takeoff";
    u.airT = 0;
  }

  private updateAir(u: Unit): void {
    const spec = UNITS[u.kind];
    const fuel = spec.fuel!;
    const A = RULES.air;
    if (u.cooldown > 0) u.cooldown--;
    if (u.cd2 > 0) u.cd2--;
    switch (u.air) {
      case "parked": {
        u.alt = 0;
        u.speed = 0;
        const pad = this.padPosOf(u);
        if (pad) {
          u.x = pad[0];
          u.z = pad[1];
          const st = this.sides[u.side];
          const field = this.byId.get(u.padB);
          const pw = field && field.cat === "building" ? field.powerFrac : 1;
          if (u.fuel < fuel.tank) {
            // thiếu điện thì bơm dầu chậm
            const want = Math.min(A.refuelRate * DT * pw, fuel.tank - u.fuel);
            const got = Math.min(want, st.oil / A.oilPerLiter);
            if (got > 1e-9) {
              u.fuel += got;
              st.oil -= got * A.oilPerLiter;
            } else if (pw > 0) this.alert(u.side, "nooil", u.x, u.z);
          }
          if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + A.repairRate * DT * pw);
          // nạp lại vũ khí phụ (tên lửa) khi đậu
          if (spec.secondary) u.ammo2 = spec.secondary.ammo;
        }
        if (u.mission !== "none" && u.fuel >= fuel.tank * A.takeoffMin) this.takeoff(u);
        return;
      }
      case "takeoff": {
        u.airT++;
        const T = sec(1.6);
        const k = u.airT / T;
        u.speed = spec.speed * Math.min(1, 0.2 + k);
        u.alt = A.cruiseAlt * k * k;
        u.x += u.hx * u.speed * DT;
        u.z += u.hz * u.speed * DT;
        if (!this.burn(u, spec)) return;
        if (u.airT >= T) {
          u.air = "flying";
          u.alt = A.cruiseAlt;
        }
        return;
      }
      case "flying":
      case "returning":
        this.fly(u, spec);
        return;
      case "landing": {
        const pad = this.padPosOf(u);
        if (!pad) {
          u.air = "returning";
          u.alt = Math.max(u.alt, 4);
          return;
        }
        u.airT++;
        const T = sec(1.6);
        const k = Math.min(1, u.airT / T);
        u.x = u.ax + (pad[0] - u.ax) * k;
        u.z = u.az + (pad[1] - u.az) * k;
        u.alt = A.cruiseAlt * (1 - k) * (1 - k);
        u.speed = spec.speed * (1 - k);
        if (k >= 1) {
          u.air = "parked";
          u.alt = 0;
          u.speed = 0;
          u.mission = "none";
          u.rtb = false;
          u.targetId = 0;
          u.autoTarget = 0;
          // đậu quay mũi theo hướng Sân Đáp (mô hình: +z), xoay theo nấc xoay của công trình
          const ab = this.byId.get(u.padB);
          const [phx, phz] = doorDir(ab && ab.cat === "building" ? ab.rot : 0);
          u.hx = phx;
          u.hz = phz;
          u.yawRate = 0;
        }
        return;
      }
      default:
        return;
    }
  }

  private fly(u: Unit, spec: UnitSpec): void {
    if (!this.burn(u, spec)) return;
    const fuel = spec.fuel!;
    const A = RULES.air;
    const w = spec.weapon!;
    // Mức Bingo động: 24% bình, hoặc lượng dầu đủ bay về sân nếu sân ở xa hơn
    if (u.air === "flying" && (u.rtb || u.fuel <= Math.max(fuel.tank * A.bingo, this.fuelToReturn(u, spec)))) {
      if (!u.rtb) this.alert(u.side, "lowfuel", u.x, u.z);
      u.rtb = true;
      u.air = "returning";
    }
    let dx = 0;
    let dz = 0;
    let tgt: Target | null = null;
    let wantAlt: number = A.cruiseAlt;
    if (u.air === "returning") {
      const pad = this.ensurePad(u);
      if (pad) {
        dx = pad[0] - u.x;
        dz = pad[1] - u.z;
        if (dx * dx + dz * dz < 100) {
          u.air = "landing";
          u.airT = 0;
          u.ax = u.x;
          u.az = u.z;
          return;
        }
      } else {
        const hq = this.hqOf(u.side);
        [dx, dz] = this.loiter(u, hq ? hq.x : 0, hq ? hq.z : 0);
      }
    } else {
      if (u.mission === "attack") {
        const t = this.target(u.targetId);
        if (t && t.side !== u.side && this.canHit(w, t) && this.visibleTo(u.side, t)) tgt = t;
        else {
          u.mission = "move";
          u.mx = clamp(u.x, -this.map.airX, this.map.airX);
          u.mz = clamp(u.z, -this.map.airZ, this.map.airZ);
          u.targetId = 0;
        }
      }
      if (!tgt) {
        tgt = this.acquireFrom(u, u.side, u.mx, u.mz, w, 26, u.autoTarget);
        u.autoTarget = tgt ? tgt.id : 0;
      }
      if (tgt) {
        dx = tgt.x - u.x;
        dz = tgt.z - u.z;
        // Lượt bổ nhào: bay qua mục tiêu thì giữ thẳng hướng lấy khoảng cách rồi mới quay lại.
        // Nếu cứ quay mũi về mục tiêu với bán kính ngoặt giới hạn, máy bay sẽ bay vòng tròn quanh nó mãi
        // mà không chĩa được mũi vào để bắn.
        const d = Math.sqrt(dx * dx + dz * dz);
        const turnR = spec.speed / (fuel.turnRate * DEG);
        const facing = d > 1e-6 ? (u.hx * dx + u.hz * dz) / d : 1;
        if (!u.ext && d < turnR * 1.5 && facing < 0.3) u.ext = true;
        // chỉ kéo ra đủ để lúc quay lại mục tiêu nằm ngoài vòng ngoặt (không rơi vào bay vòng tròn), không hơn
        if (u.ext && d >= Math.max(turnR * 1.8, 8)) u.ext = false;
        if (u.ext) {
          dx = u.hx;
          dz = u.hz;
        }
        // Bổ nhào: đang lao vào mục tiêu mặt đất (mũi hướng về nó, đã gần) thì hạ độ cao; kéo ra thì lên lại
        if (spec.diveAlt && !u.ext && !this.isAirborne(tgt) && facing >= 0.5 && d <= w.range + 12) wantAlt = spec.diveAlt;
      } else {
        u.ext = false;
        [dx, dz] = this.loiter(u, u.mx, u.mz);
      }
    }
    if (Math.abs(u.x) > this.map.airX || Math.abs(u.z) > this.map.airZ) {
      dx = -u.x;
      dz = -u.z;
    }
    this.steerAir(u, dx, dz, fuel.turnRate);
    u.speed = spec.speed;
    // máy bay không bay ra ngoài bản đồ (cách mép 2 m)
    u.x = clamp(u.x + u.hx * u.speed * DT, -this.map.halfW + 2, this.map.halfW - 2);
    u.z = clamp(u.z + u.hz * u.speed * DT, -this.map.halfH + 2, this.map.halfH - 2);
    const climb = A.climbRate * DT;
    u.alt += clamp(wantAlt - u.alt, -climb, climb);
    if (w.carpet) {
      // Rải thảm: đã bắt đầu loạt thì thả nốt dọc đường bay; loạt mới chỉ bắt đầu khi bom sẽ rơi trúng mục tiêu
      if (u.cooldown === 0) {
        if (u.burst > 0) this.dropBomb(u, w);
        else if (tgt && !this.isAirborne(tgt)) {
          const lead = u.speed * BOMB_FALL;
          const r = w.splash + this.radiusOf(tgt);
          if (dist2(u.x + u.hx * lead, u.z + u.hz * lead, tgt.x, tgt.z) <= r * r) this.dropBomb(u, w);
        }
      }
    } else if (tgt) {
      const tx = tgt.x - u.x;
      const tz = tgt.z - u.z;
      const d = Math.sqrt(tx * tx + tz * tz);
      // chỉ bắn khi mũi máy bay hướng về mục tiêu (lượt bổ nhào)
      if (d <= w.range + this.radiusOf(tgt) && u.hx * tx + u.hz * tz >= cosDeg(w.fireArc ?? 37) * d) this.tryFire(u, w, tgt);
    }
    const w2 = spec.secondary;
    if (w2 && tgt && u.ammo2 > 0 && u.cd2 === 0 && this.canHit(w2, tgt)) {
      const tx = tgt.x - u.x;
      const tz = tgt.z - u.z;
      const d = Math.sqrt(tx * tx + tz * tz);
      if (d <= w2.range + this.radiusOf(tgt) && u.hx * tx + u.hz * tz >= cosDeg(w2.fireArc ?? 37) * d) this.fireSecondary(u, w2, tgt, d);
    }
  }

  /**
   * Lái máy bay về hướng (dx, dz) cho mượt: tốc độ ngoặt tăng giảm dần (gia tốc góc), như phải nghiêng cánh
   * dần mới vào vòng được. Lệch nhiều thì ngoặt hết cỡ, gần đúng hướng thì nắn nhẹ theo độ lệch.
   * Không dùng góc: độ lệch lấy từ tích vô hướng / tích có hướng, xoay bằng dsin/dcos tự viết (tất định).
   */
  private steerAir(u: Unit, dx: number, dz: number, turnRateDeg: number): void {
    const l = Math.sqrt(dx * dx + dz * dz);
    const maxR = turnRateDeg * DEG * DT;
    let want = 0;
    if (l > 1e-6) {
      const nx = dx / l;
      const nz = dz / l;
      const dot = u.hx * nx + u.hz * nz;
      const cross = u.hx * nz - u.hz * nx;
      const dir = cross >= 0 ? 1 : -1;
      // trong vùng ±30° thì sin(lệch) = cross, ngoặt tỉ lệ theo độ lệch; ngoài vùng thì ngoặt hết cỡ
      want = dot >= STEER_SOFT_COS ? clamp(cross / STEER_SOFT_SIN, -1, 1) * maxR : dir * maxR;
    }
    const acc = maxR / (STEER_RAMP * TICK_RATE);
    u.yawRate += clamp(want - u.yawRate, -acc, acc);
    const c = dcos(u.yawRate);
    const s = dsin(u.yawRate);
    const hx = u.hx * c - u.hz * s;
    const hz = u.hx * s + u.hz * c;
    const hl = Math.sqrt(hx * hx + hz * hz) || 1;
    u.hx = hx / hl;
    u.hz = hz / hl;
  }

  /** Hướng bay vòng chờ quanh (cx, cz): xa thì bay thẳng tới, gần thì bay tiếp tuyến bán kính ~11 m. */
  private loiter(u: Unit, cx: number, cz: number): [number, number] {
    const dx = cx - u.x;
    const dz = cz - u.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 16 || d < 1e-6) return [dx, dz];
    const k = (d - 11) / 11;
    return [-dz / d + (dx / d) * k, dx / d + (dz / d) * k];
  }

  // ------------------------------------------------------------------ va chạm, đạn, dọn xác

  private separate(): void {
    const g: Unit[] = [];
    for (const u of this.units) if (u.air === "none" && u.hp > 0) g.push(u);
    for (let i = 0; i < g.length; i++) {
      const a = g[i];
      const ra = UNITS[a.kind].radius;
      for (let j = i + 1; j < g.length; j++) {
        const b = g[j];
        const min = (ra + UNITS[b.kind].radius) * 0.8;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (dx >= min || dx <= -min || dz >= min || dz <= -min) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        let nx: number;
        let nz: number;
        if (d < 1e-6) {
          nx = (a.id + b.id) % 2 === 0 ? 1 : -1;
          nz = 0;
          d = 0;
        } else {
          nx = dx / d;
          nz = dz / d;
        }
        // xe đang chạy nhường xe đã đứng yên: xe chạy chịu phần lớn lực đẩy (lách qua), xe đã vào hàng chỉ xê dịch chút ít
        // (vẫn nhường một chút để khe hẹp nới dần, xe chạy không kẹt mãi). Hai xe cùng chạy hoặc cùng đứng thì chia đều.
        // Quân ĐÃ HẠ BỆ (chân chống cắm đất) thì không bị xô chút nào: xe kia chịu trọn; hai quân cùng hạ bệ thì không ai nhích.
        const pa = this.anchored(a);
        const pb = this.anchored(b);
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : a.moved === b.moved ? 0.5 : a.moved ? MOVER_SHARE : 1 - MOVER_SHARE;
        const over = min - d;
        // xe chạy gặp xe đứng: ngoài đẩy ra còn LÁCH SANG BÊN (vuông góc hướng chạy, phía xa vật cản), không thì đâm
        // thẳng vào nhau sẽ bị đẩy lùi đúng ngược hướng mỗi tick và kẹt mãi
        let sx = 0;
        let sz = 0;
        const aMoves = a.moved && !b.moved;
        if (a.moved !== b.moved) {
          const m = aMoves ? a : b;
          const ox = aMoves ? dx : -dx; // từ xe chạy tới xe đứng
          const oz = aMoves ? dz : -dz;
          const lo = ox * m.hz - oz * m.hx; // vật cản lệch về bên phải (+) hay trái (−) hướng chạy
          const sg = lo > 1e-9 ? -1 : lo < -1e-9 ? 1 : m.id % 2 === 0 ? 1 : -1;
          sx = m.hz * sg * over;
          sz = -m.hx * sg * over;
        }
        const ax = a.x - nx * over * wa + (aMoves ? sx : 0);
        const az = a.z - nz * over * wa + (aMoves ? sz : 0);
        if (!this.grid.blockedAt(ax, az)) {
          a.x = ax;
          a.z = az;
        }
        const bMoves = b.moved && !a.moved;
        const bx = b.x + nx * over * (1 - wa) + (bMoves ? sx : 0);
        const bz = b.z + nz * over * (1 - wa) + (bMoves ? sz : 0);
        if (!this.grid.blockedAt(bx, bz)) {
          b.x = bx;
          b.z = bz;
        }
      }
    }
  }

  /** Quân đã hạ bệ xong (chân chống cắm đất): đứng chết tại chỗ, xe khác tông vào không xô được. */
  private anchored(u: Unit): boolean {
    const dep = UNITS[u.kind].weapon?.deploy;
    return !!dep && u.still >= sec(dep.time);
  }

  private alert(side: Side, what: AlertKind, x: number, z: number, n?: number): void {
    const st = this.sides[side];
    const gap = what === "powerShort" || what === "oilLow" || what === "batteryLow" ? sec(15) : what === "powerForecast" ? 0 : sec(8);
    if (this.tick - st.alerts[what] < gap) return;
    st.alerts[what] = this.tick;
    this.events.push({ t: "alert", side, what, x, z, n });
  }

  /** Sát thương gốc nhân hệ số Giáp × Đạn (RULES.damageMatrix). Không rẽ nhánh theo tên quân: mọi thứ là dữ liệu. */
  private damage(e: Target, s: Shot): void {
    if (e.hp <= 0) return;
    const by = s.side;
    let amount = s.dmg;
    if (e.cat === "unit") {
      const spec = UNITS[e.kind];
      // Phòng thủ điểm: bắn chặn đạn pháo bay cầu vồng
      if (s.interceptable && e.pd > 0) {
        e.pd--;
        e.pdT = 0;
        this.events.push({ t: "hit", side: e.side, visual: "pulse", x: e.x, z: e.z, alt: e.alt + 3, splash: 0 });
        return;
      }
      // Giáp mặt trước: đạn tới từ phía trước thân xe
      const fa = spec.frontArmor;
      if (fa) {
        const dx = s.sx - e.x;
        const dz = s.sz - e.z;
        const l = Math.sqrt(dx * dx + dz * dz);
        if (l > 1e-6 && (e.hx * dx + e.hz * dz) / l >= cosDeg(fa.arc)) amount *= 1 - fa.reduce;
      }
      // Che chắn của địa hình (rừng) cho quân mặt đất; đạn Nổ không bị che (RULES.terrain.coverBy)
      if (e.air === "none") {
        const cover = TERRAIN[this.grid.kindAt(e.x, e.z)].cover * RULES.terrain.coverBy[s.dmgType];
        if (cover > 0) amount *= 1 - cover;
      }
    }
    const armor = e.cat === "unit" ? UNITS[e.kind].armorClass : BUILDINGS[e.kind].armorClass;
    const dealt = amount * RULES.damageMatrix[armor][s.dmgType];
    const real = Math.min(dealt, e.hp);
    this.sides[by].stats.damageDealt += real;
    e.hp -= dealt;
    if (e.cat === "unit") e.lastHit = this.tick;
    if (real > 0 && e.side !== by) this.gainXp(s.src, (real / e.maxHp) * valueOf(e.kind));
    if (e.cat === "unit") {
      if (e.kind === "commander") this.alert(e.side, "commander", e.x, e.z);
      else if (e.kind === "hauler") this.alert(e.side, "hauler", e.x, e.z);
    } else this.alert(e.side, "base", e.x, e.z);
    if (e.hp <= 0) this.sides[by].stats.kills++;
  }

  // ------------------------------------------------------------------ kỹ năng của binh chủng: rải thảm, tổng động viên

  /** null = ra lệnh rải thảm được; ngược lại là lý do (tiếng Việt) để giao diện hiện cho người chơi. */
  strikeError(side: Side, ids: readonly number[], x: number, z: number): string | null {
    if (!this.ownUnits(side, ids).some((u) => canStrike(u.kind))) return "Cần Xe Tên Lửa Loạt (đúc ở Xưởng Xe Chuyên Dụng)";
    if (!this.map.fits(x, z, 0, 0)) return "Ngoài bản đồ";
    return null;
  }

  /** Lệnh rải thảm: mỗi xe rải thảm được trong `ids` nhận điểm bắn (xe khác trong nhóm bỏ qua lệnh này). */
  private orderStrike(side: Side, ids: readonly number[], x: number, z: number): void {
    if (this.strikeError(side, ids, x, z)) return;
    for (const u of this.ownUnits(side, ids)) {
      if (!canStrike(u.kind)) continue;
      u.order = "strike";
      u.tx = x;
      u.tz = z;
      u.targetId = 0;
      u.autoTarget = 0;
      u.chasing = false;
      u.path = [];
      u.pathI = 0;
      u.repathAt = 0;
    }
  }

  /** Chỗ đứng bắn cho lệnh rải thảm: trên đường thẳng từ điểm bắn về phía xe, vừa trong tầm (hoặc lùi ra nếu đứng quá gần). */
  private strikeApproach(u: Unit, w: WeaponSpec, range: number): boolean {
    const dx = u.x - u.tx;
    const dz = u.z - u.tz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const min = w.minRange ?? 0;
    const want = d > range ? Math.max(range - 2, (range + min) / 2) : min + 3;
    const ux = d > 1e-6 ? dx / d : 1;
    const uz = d > 1e-6 ? dz / d : 0;
    const f = this.grid.nearestFree(u.tx + ux * want, u.tz + uz * want, 8);
    return !!f && this.setPath(u, f[0], f[1]);
  }

  /**
   * Rải thảm vào một điểm trên mặt đất: không cần mục tiêu, không cần nhìn thấy điểm bắn; mỗi quả rơi lệch ngẫu nhiên
   * (RNG có seed) trong vòng `scatter` quanh điểm. Vẫn theo luật chung của vũ khí: dựng dàn xong mới bắn, nhịp loạt, hào quang.
   * Người gọi đã kiểm tầm và tầm tối thiểu.
   */
  private tryFireGround(u: Unit, w: WeaponSpec, x: number, z: number): boolean {
    if (u.cooldown > 0 || this.sandbox?.hold[u.side]) return false;
    const deployed = this.deployed(u, w);
    if (w.deploy?.required && !deployed) return false;
    const d = Math.sqrt(dist2(u.x, u.z, x, z));
    // mâm phóng chưa quay tới hướng điểm bắn thì chưa bắn
    if (w.traverse && d > 1e-6 && (u.aimX * (x - u.x) + u.aimZ * (z - u.z)) / d < AIM_COS) return false;
    this.salvoStart(u, w, x, z);
    u.cooldown = Math.max(1, Math.round((this.nextCooldown(u, w) / this.auraFactor(u)) * TICK_RATE));
    u.lastShot = this.tick;
    const s = w.scatter ?? 0;
    const ticks = Math.max(1, Math.ceil((d / (w.shotSpeed ?? SHOT_SPEED[w.visual])) * TICK_RATE));
    // mỗi nhịp bắn ra `barrels` viên cùng lúc, mỗi viên tản riêng
    for (let i = 0, n = w.barrels ?? 1; i < n; i++) {
      const [ox, oz] = this.randDisc();
      this.pushShot(u, w, 0, x + ox * s, z + oz * s, 0, deployed ? w.dmgGround * (1 + w.deploy!.dmg) : w.dmgGround, false, ticks);
    }
    // quân cố định giữ nguyên thân, chỉ mâm phóng quay về điểm bắn
    if (d > 1e-6 && !w.deploy) {
      u.hx = (x - u.x) / d;
      u.hz = (z - u.z) / d;
    }
    return true;
  }

  /** Vũ khí rải thảm bắt đầu một loạt mới: đếm số liệu, báo cho phần vẽ / âm thanh (tiếng rít ở chỗ đạn sắp rơi). */
  private salvoStart(src: Unit | Building, w: WeaponSpec, tx: number, tz: number): void {
    if (!w.scatter || !w.burst || src.burst > 0 || src.cat !== "unit") return;
    this.sides[src.side].stats.salvos++;
    this.events.push({ t: "salvo", id: src.id, side: src.side, x: src.x, z: src.z, tx, tz });
  }

  /** Tổng giá trị quân địch mặt đất (phe `side` đang thấy) trong bán kính r quanh (x, z): vũ khí tản nhắm vào chỗ đông nhất. */
  private clusterValue(side: Side, x: number, z: number, r: number): number {
    let v = 0;
    for (const e of this.units) {
      if (e.side === side || e.hp <= 0 || e.alt > AIRBORNE_ALT) continue;
      if (dist2(x, z, e.x, e.z) <= r * r && this.visibleTo(side, e)) v += valueOf(e.kind);
    }
    return v;
  }

  /** null = Tổng động viên được; ngược lại là lý do. */
  mobilizeError(side: Side): string | null {
    const c = this.commanders[side];
    if (!c || c.hp <= 0) return "Cần Xe Tư Lệnh";
    const st = this.sides[side];
    if (this.tick < st.mobilizeReady) return `Còn ${Math.ceil((st.mobilizeReady - this.tick) / TICK_RATE)} giây`;
    return null;
  }

  private mobilize(side: Side): void {
    if (this.mobilizeError(side)) return;
    const M = RULES.abilities.mobilize;
    const st = this.sides[side];
    st.mobilizeUntil = this.tick + sec(M.duration);
    st.mobilizeReady = this.tick + sec(M.cooldown);
    const c = this.commanders[side]!;
    this.events.push({ t: "mobilize", side, x: c.x, z: c.z, r: UNITS.commander.aura!.radius });
  }

  /** Cựu binh: cộng kinh nghiệm cho xe đã bắn (nếu còn sống), lên cấp khi đủ ngưỡng. */
  private gainXp(srcId: number, xp: number): void {
    const u = this.byId.get(srcId);
    if (!u || u.cat !== "unit" || u.hp <= 0) return;
    const V = RULES.veterancy;
    u.xp += xp;
    const own = valueOf(u.kind);
    let rank = 0;
    // sai số nhỏ: kinh nghiệm cộng từ nhiều phần lẻ (hạ trọn một xe có thể ra 149,99999999 thay vì 150)
    while (rank < V.ranks.length && u.xp >= V.ranks[rank] * own - 1e-6) rank++;
    if (rank > u.rank) {
      const st = this.sides[u.side].stats;
      st.promotions += rank - u.rank;
      st.topRank = Math.max(st.topRank, rank);
      u.rank = rank;
      this.events.push({ t: "rank", id: u.id, kind: u.kind, side: u.side, rank, x: u.x, z: u.z });
    }
  }

  /** Cựu binh cấp cao tự hồi máu khi đã lâu không trúng đạn. */
  private veteranRegen(): void {
    const V = RULES.veterancy;
    const delay = sec(V.regenDelay);
    for (const u of this.units)
      if (u.rank >= V.regenRank && u.hp > 0 && u.hp < u.maxHp && this.tick - u.lastHit >= delay) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * V.regenPerSec * DT);
  }

  private resolveShots(): void {
    if (this.shots.length === 0) return;
    const keep: Shot[] = [];
    for (const s of this.shots) {
      if (s.impact > this.tick) {
        keep.push(s);
        continue;
      }
      const t = this.target(s.target);
      let x = s.tx;
      let z = s.tz;
      let alt = s.target === 0 ? s.talt : 0;
      if (t) {
        x = t.x;
        z = t.z;
        alt = t.cat === "unit" ? t.alt : 0;
      }
      if (s.splash > 0) {
        for (const u of this.units) {
          if (u.side === s.side || u.hp <= 0 || (u.alt > AIRBORNE_ALT) !== s.hitAir) continue;
          const r = s.splash + UNITS[u.kind].radius * 0.5;
          if (dist2(x, z, u.x, u.z) <= r * r) this.damage(u, s);
        }
        if (!s.hitAir)
          for (const b of this.buildings) {
            if (b.side === s.side || b.hp <= 0) continue;
            const r = s.splash + Math.max(BUILDINGS[b.kind].half[0], BUILDINGS[b.kind].half[1]);
            if (dist2(x, z, b.x, b.z) <= r * r) this.damage(b, s);
          }
      } else if (t) this.damage(t, s);
      this.events.push({ t: "hit", side: s.side, visual: s.visual, x, z, alt, splash: s.splash });
    }
    this.shots = keep;
  }

  /** Xác quân: để lại xác chứa Sắt (trừ khi rơi xuống chỗ xe không tới được: sông, đá). */
  private leaveWreck(u: Unit): void {
    if (this.sold.delete(u.id) || this.grid.blockedAt(u.x, u.z)) return;
    const S = RULES.salvage;
    // Xe Vận Tải bị hạ khi đang chở xác: phần xác đang chở rơi lại cùng xác xe, ai tới kéo trước thì được
    const value = Math.round(valueOf(u.kind) * S.share) + u.scrap;
    if (value <= 0) return;
    this.wrecks.push({ id: this.nextId++, kind: u.kind, side: u.side, x: u.x, z: u.z, hx: u.hx, hz: u.hz, value, until: this.tick + sec(S.seconds), claim: [0, 0] });
  }

  /**
   * Xác quân hết hạn thì biến mất, trừ khi đang có Xe Vận Tải tới kéo. Chỗ giữ của xe đã bị hạ / đổi việc thì trả lại.
   * Xác KHÔNG tự cộng tài nguyên: chỉ Xe Vận Tải cẩu lên và chở về mới thành Sắt (updateHauler).
   */
  private updateWrecks(): void {
    if (this.wrecks.length === 0) return;
    const keep: Wreck[] = [];
    for (const wr of this.wrecks) {
      let towing = false;
      for (const s of [0, 1] as Side[]) {
        const id = wr.claim[s];
        if (id <= 0) continue;
        const h = this.byId.get(id);
        if (h && h.cat === "unit" && h.hp > 0 && h.wreckId === wr.id) towing = true;
        else wr.claim[s] = 0;
      }
      if (towing || this.tick < wr.until) keep.push(wr);
    }
    this.wrecks = keep;
  }

  private cleanup(): void {
    let deadUnits = false;
    for (const u of this.units) if (u.hp <= 0) deadUnits = true;
    if (deadUnits) {
      const alive: Unit[] = [];
      for (const u of this.units) {
        if (u.hp > 0) {
          alive.push(u);
          continue;
        }
        this.byId.delete(u.id);
        this.releaseMine(u);
        this.releasePad(u);
        this.sides[u.side].stats.unitsLost++;
        if (this.commanders[u.side] === u) this.commanders[u.side] = null;
        this.events.push({ t: "death", id: u.id, kind: u.kind, side: u.side, x: u.x, z: u.z, alt: u.alt, building: false, crash: u.crashed, sold: false });
        this.leaveWreck(u);
      }
      this.units = alive;
    }
    let deadBuildings = false;
    for (const b of this.buildings) if (b.hp <= 0) deadBuildings = true;
    if (deadBuildings) {
      const alive: Building[] = [];
      for (const b of this.buildings) {
        if (b.hp > 0) {
          alive.push(b);
          continue;
        }
        this.byId.delete(b.id);
        this.grid.block(b.cells, -1);
        for (const st of this.sides) st.known.delete(b.id);
        if (b.kind === "airfield")
          for (const u of this.units)
            if (u.padB === b.id) {
              u.padB = 0;
              u.padI = -1;
            }
        const sold = this.sold.delete(b.id);
        this.events.push({ t: "death", id: b.id, kind: b.kind, side: b.side, x: b.x, z: b.z, alt: 0, building: true, crash: false, sold });
      }
      this.buildings = alive;
    }
  }

  // ------------------------------------------------------------------ sương mù & thắng thua

  private stamp(st: SideState, x: number, z: number, sight: number): void {
    const r = Math.round(sight / CELL);
    const cx = this.grid.colOf(x, z);
    const cz = this.grid.rowOf(x, z);
    const d = disc(r);
    const C = this.grid.cols;
    const R = this.grid.rows;
    for (let k = 0; k < d.length; k += 2) {
      const nx = cx + d[k];
      const nz = cz + d[k + 1];
      if (nx < 0 || nz < 0 || nx >= C || nz >= R) continue;
      const i = nz * C + nx;
      st.vis[i] = 1;
      st.explored[i] = 1;
    }
  }

  /**
   * Tầm nhìn có che khuất (thuật toán đường chân trời): bắn tia từ mắt ra từng ô biên của vùng nhìn; đi dọc tia,
   * giữ "góc ngẩng" lớn nhất của mặt đất đã gặp. Ô nào mà điểm nhìn thấy được của nó (mặt đất + targetHeight)
   * thấp hơn góc đó thì bị đồi / đá che. Tốn ~8r × r phép tính mỗi quân thay vì r³ (mỗi ô một tia).
   * Chỉ dùng + − × ÷ và Math.round / sqrt nên tất định.
   *
   * Rừng (cellLos) che tầm nhìn như vật cao 4 m đứng trên mặt đất: ô rừng đầu tiên vẫn thấy (bìa rừng), các ô sau nó
   * bị che. Đứng TRONG rừng thì tia nhìn bỏ qua các ô rừng liền với chỗ mình đứng cho tới khi ra khỏi rừng:
   * người trong rừng nhìn ra được, người ngoài không nhìn sâu vào được (như bụi rậm). Máy bay, Radar không bị che.
   */
  private stampLos(st: SideState, x: number, z: number, sight: number, eye: number): void {
    const r = Math.round(sight / CELL);
    const cx = this.grid.colOf(x, z);
    const cz = this.grid.rowOf(x, z);
    const C = this.grid.cols;
    const R = this.grid.rows;
    const c0 = cz * C + cx;
    st.vis[c0] = 1;
    st.explored[c0] = 1;
    const th = RULES.terrain.targetHeight;
    const { off, inv, start } = rays(r);
    const H = this.cellH;
    const L = this.cellLos;
    const inForest = L[c0] > 0;
    for (let k = 0; k + 1 < start.length; k++) {
      let maxSlope = -Infinity;
      let inside = inForest;
      for (let j = start[k]; j < start[k + 1]; j++) {
        const nx = cx + off[j * 2];
        const nz = cz + off[j * 2 + 1];
        if (nx < 0 || nz < 0 || nx >= C || nz >= R) break;
        const idx = nz * C + nx;
        const h = H[idx] - eye;
        if ((h + th) * inv[j] >= maxSlope) {
          st.vis[idx] = 1;
          st.explored[idx] = 1;
        }
        // ô này che các ô phía sau bằng mặt đất + vật che (rừng), trừ rừng liền với chỗ đứng
        const add = L[idx];
        if (inside && add === 0) inside = false;
        const g = (inside ? h : h + add) * inv[j];
        if (g > maxSlope) maxSlope = g;
      }
    }
  }

  private updateFog(): void {
    for (const s of [0, 1] as Side[]) {
      const st = this.sides[s];
      st.vis.fill(0);
      const T = RULES.terrain;
      for (const u of this.units) {
        if (u.side !== s) continue;
        const air = u.alt > AIRBORNE_ALT;
        const sight = this.sightOf(UNITS[u.kind].sight, u.x, u.z, air);
        // máy bay ở trên cao hơn mọi đồi: không bị che
        if (air) this.stamp(st, u.x, u.z, sight);
        else this.stampLos(st, u.x, u.z, sight, this.heightAt(u.x, u.z) + T.eyeUnit);
      }
      for (const b of this.buildings) {
        if (b.side !== s) continue;
        const spec = BUILDINGS[b.kind];
        // Trạm Radar có điện: nhìn xuyên sương mù (và xuyên đồi) cả vùng rộng
        if (spec.radarSight && b.active) this.stamp(st, b.x, b.z, spec.radarSight);
        else this.stampLos(st, b.x, b.z, this.sightOf(spec.sight, b.x, b.z, false) * (b.built ? 1 : 0.6), this.heightAt(b.x, b.z) + T.eyeBuilding);
      }
      // Đài Liên Lạc của mình: nhìn xa quanh đài (cột ăng-ten cao, không bị đồi che)
      for (const up of this.uplinks) if (up.owner === s) this.stamp(st, up.x, up.z, RULES.uplink.sight);
      for (const b of this.buildings) if (b.side !== s && !st.known.has(b.id) && this.visibleTo(s, b)) st.known.add(b.id);
    }
  }

  private checkVictory(): void {
    const lost: [WinReason | null, WinReason | null] = [null, null];
    for (const s of [0, 1] as Side[]) {
      if (!this.commanderOf(s)) lost[s] = "commander";
      else if (!this.buildings.some((b) => b.side === s && b.hp > 0)) lost[s] = "buildings";
    }
    const monoWinners: Side[] = [];
    for (const s of [0, 1] as Side[]) {
      const st = this.sides[s];
      let res: Res | null = null;
      for (const r of ["iron", "oil"] as Res[]) {
        let all = true;
        for (const m of this.mines) if (m.res === r && m.owner !== s) all = false;
        if (all) {
          res = r;
          break;
        }
      }
      if (res) {
        if (st.monoRes !== res) {
          st.mono = 0;
          st.monoRes = res;
          this.events.push({ t: "monopoly", side: s, res });
        }
        st.mono++;
        if (st.mono >= sec(RULES.monopolySeconds)) monoWinners.push(s);
      } else {
        st.mono = 0;
        st.monoRes = null;
      }
    }
    let winner: Side | 2 | -1 = -1;
    let reason: WinReason | null = null;
    if (lost[0] && lost[1]) {
      winner = 2;
      reason = lost[0];
    } else if (lost[0]) {
      winner = 1;
      reason = lost[0];
    } else if (lost[1]) {
      winner = 0;
      reason = lost[1];
    } else if (monoWinners.length === 2) {
      winner = 2;
      reason = "monopoly";
    } else if (monoWinners.length === 1) {
      winner = monoWinners[0];
      reason = "monopoly";
    } else if (this.maxTicks > 0 && this.tick + 1 >= this.maxTicks) {
      winner = 2;
      reason = "timeout";
    }
    if (winner !== -1 && reason) {
      this.winner = winner;
      this.winReason = reason;
      this.events.push({ t: "end", winner, reason });
    }
  }
}

/** Mã băm trạng thái trận (FNV-1a trên từng bit của các số): hai máy chạy cùng lệnh phải ra cùng mã. */
export function hashWorld(w: World): number {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  const mix = (n: number): void => {
    h = Math.imul(h ^ n, 16777619);
  };
  const num = (v: number): void => {
    f64[0] = v;
    mix(u32[0]);
    mix(u32[1]);
  };
  num(w.tick);
  for (const s of w.sides) {
    num(s.mobilizeUntil);
    num(s.iron);
    num(s.oil);
    num(s.mono);
    num(s.eff);
    num(s.battery);
  }
  for (const u of w.units) {
    num(u.id);
    num(u.x);
    num(u.z);
    num(u.hp);
    num(u.alt);
    num(u.fuel);
    num(u.cargo);
    num(u.cooldown);
    num(u.burst);
    num(u.still);
    num(u.faceX);
    num(u.faceZ);
    num(u.squad);
    num(u.lot);
    num(u.formation === null ? -1 : Object.keys(FORMATIONS).indexOf(u.formation));
    num(u.aimX);
    num(u.aimZ);
    num(u.pd);
    num(u.yawRate);
    num(u.ammo2);
    num(u.cd2);
    num(u.xp);
    num(u.rank);
    num(u.wreckId);
    num(u.scrap);
  }
  for (const sq of w.squads) {
    num(sq.id);
    num(sq.ids.length);
    num(sq.cols);
    num(sq.x);
    num(sq.z);
    num(sq.hx);
    num(sq.hz);
    num(sq.s);
    num(sq.phaseT);
    num(sq.rolling ? 1 : 0);
  }
  for (const b of w.buildings) {
    num(b.id);
    num(b.rot);
    num(b.hp);
    num(b.progress);
    num(b.queue.length);
    num(b.prog);
    num(b.aimX);
    num(b.aimZ);
  }
  for (const wr of w.wrecks) {
    num(wr.id);
    num(wr.until);
    num(wr.claim[0]);
    num(wr.claim[1]);
  }
  for (const up of w.uplinks) {
    num(up.owner);
    num(up.cap);
  }
  for (const m of w.mines) {
    num(m.amount);
    num(m.owner);
    num(m.cap);
  }
  num(w.shots.length);
  return h >>> 0;
}
