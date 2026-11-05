/**
 * LÕI MÔ PHỎNG — World.
 *
 * Mỗi lần gọi step(lệnh) là trận đấu tiến thêm đúng 1 tick (0.1 giây). Thứ tự trong một tick luôn cố định:
 *   1. lưu vị trí cũ (để phần vẽ nội suy)   2. áp dụng lệnh   3. kinh tế   4. công trình (xây, đúc quân, tháp bắn)
 *   5. chiếm mỏ   6. quân (đi, nhắm, bắn; máy bay bay và đốt dầu)   7. đẩy xe không chồng lên nhau
 *   8. đạn tới đích → trừ máu   9. dọn xác   10. sương mù   11. kiểm tra thắng thua
 * Không có gì phụ thuộc thời gian thật hay số ngẫu nhiên không seed, nên cùng seed + cùng lệnh thì ra cùng trận.
 */
import { BUILDINGS, RULES, UNITS, valueOf, type BuildingId, type Res, type Side, type UnitId, type UnitSpec, type WeaponSpec, type WeaponVisual } from "./content";
import { clamp, dcos, DEG, dist2, dsin, Rng, turnStep, turnToward, type TurnStep } from "./fmath";
import { Grid } from "./grid";
import { CELL, GameMap, getMap, TERRAIN, TERRAIN_KINDS } from "./maps";
import type { AlertKind, Building, Command, Entity, Mine, Order, Shot, SideState, SimEvent, Target, Unit, WinReason, Wreck } from "./types";

export const TICK_RATE = RULES.tickRate;
export const DT = 1 / TICK_RATE;
/** Đổi giây sang số tick. */
export const sec = (s: number): number => Math.round(s * TICK_RATE);

/** Cao hơn mức này thì máy bay là mục tiêu "trên không". */
export const AIRBORNE_ALT = 2;
const SHOT_SPEED: Record<WeaponVisual, number> = { bullet: 90, cannon: 60, missile: 40, bomb: 25, pulse: 120 };
/** Vị trí 4 bãi đậu so với tâm Sân Đáp (khớp với mô hình). */
export const PAD_OFFSETS: readonly (readonly [number, number])[] = [
  [-2.4, -1.8],
  [2.4, -1.8],
  [-2.4, 1.8],
  [2.4, 1.8]
];
/** 3 chỗ đứng đào quanh một mỏ. */
const SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [3.9, 0],
  [-1.95, 3.38],
  [-1.95, -3.38]
];
const IDLE_ACQUIRE_BONUS = 4;
const LEASH = 12;

/** Đội hình khi ra lệnh cho cả nhóm: các điểm lưới 3.6 m quanh đích, gần nhất trước. */
const FORMATION: readonly (readonly [number, number])[] = (() => {
  const pts: [number, number][] = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) pts.push([i, j]);
  pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  return pts.map(([i, j]) => [i * 3.6, j * 3.6] as const);
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
    alerts: { commander: -1000, base: -1000, hauler: -1000, lowfuel: -1000, nooil: -1000, mineLost: -1000, powerShort: -1000, powerForecast: -1000, oilLow: -1000, batteryLow: -1000 },
    stats: { unitsBuilt: 0, unitsLost: 0, kills: 0, ironMined: 0, oilMined: 0, buildingsBuilt: 0, damageDealt: 0, salvaged: 0 }
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
  /** Độ cao mặt đất ở tâm từng ô lưới (m), tính một lần lúc tạo trận (địa hình không đổi). */
  readonly cellH: Float64Array;
  /** Vật che tầm nhìn đứng trên mặt đất từng ô (m): rừng cao 4 m, còn lại 0 (TERRAIN.losHeight). */
  readonly cellLos: Float64Array;
  units: Unit[] = [];
  buildings: Building[] = [];
  readonly mines: Mine[] = [];
  shots: Shot[] = [];
  /** Xác quân còn nằm trên chiến trường. */
  wrecks: Wreck[] = [];
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
    for (const b of this.buildings) if (b.side === side) n += b.queue.length;
    return n;
  }

  canHit(w: WeaponSpec, t: Target): boolean {
    return this.isAirborne(t) ? w.dmgAir > 0 : w.dmgGround > 0;
  }

  padPos(b: Building, i: number): [number, number] {
    const [ox, oz] = PAD_OFFSETS[i];
    return [b.x + ox, b.z + oz];
  }

  /** null = được phép xây; ngược lại là lý do (tiếng Việt) để hiện cho người chơi. */
  canPlace(side: Side, kind: BuildingId, x: number, z: number): string | null {
    const spec = BUILDINGS[kind];
    const [hw, hd] = spec.half;
    if (!this.map.fits(x, z, hw, hd)) return "Ngoài bản đồ";
    for (const i of this.grid.cellsInRect(x, z, hw, hd)) if (this.grid.blockedIdx(i)) return "Vướng sông, đá hoặc công trình";
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
      chasing: false,
      hState: "idle",
      mineId: 0,
      manual: false,
      cargo: 0,
      cargoRes: "iron",
      hTimer: 0,
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

  private addBuilding(kind: BuildingId, side: Side, x: number, z: number, built: boolean): Building {
    const spec = BUILDINGS[kind];
    const cells = this.grid.cellsInRect(x, z, spec.half[0], spec.half[1]);
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
      hp: built ? spec.hp : spec.hp * 0.1,
      maxHp: spec.hp,
      progress: built ? 1 : 0,
      built,
      queue: [],
      prog: 0,
      rallyX: x + dx * reach,
      rallyZ: z + dz * reach,
      rallySet: false,
      cooldown: 0,
      lastShot: -1000,
      burst: 0,
      targetId: 0,
      cells,
      pads: kind === "airfield" ? [0, 0, 0, 0] : [],
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
    switch (o.t) {
      case "move":
      case "amove":
        this.orderMove(side, o.ids, o.x, o.z, o.t);
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
      case "rtb":
        for (const u of this.ownUnits(side, o.ids)) {
          if (u.air === "flying" || u.air === "takeoff") u.rtb = true;
          if (u.air === "parked") u.mission = "none";
        }
        break;
      case "build":
        this.orderBuild(side, o.kind, o.x, o.z);
        break;
      case "produce": {
        const b = this.ownBuilding(side, o.building);
        if (!b || !b.built || !BUILDINGS[b.kind].produces?.includes(o.kind)) break;
        const us = UNITS[o.kind];
        const cost = us.cost;
        if (!cost || !us.mvp || b.queue.length >= RULES.queueMax || this.unitCount(side) >= RULES.unitCap) break;
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
        const cost = UNITS[k].cost!;
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
          const c = UNITS[q].cost!;
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
  sandboxPlaceError(kind: BuildingId, x: number, z: number): string | null {
    const [hw, hd] = BUILDINGS[kind].half;
    if (!this.map.fits(x, z, hw, hd)) return "Ngoài bản đồ";
    for (const i of this.grid.cellsInRect(x, z, hw, hd)) if (this.grid.blockedIdx(i)) return "Vướng sông, đá, mỏ hoặc công trình";
    return null;
  }

  private applySandbox(sb: SandboxState, o: Order): void {
    switch (o.t) {
      case "sbSpawn": {
        if (o.kind in BUILDINGS) {
          const kind = o.kind as BuildingId;
          const x = Math.round(o.x);
          const z = Math.round(o.z);
          if (this.sandboxPlaceError(kind, x, z) === null) this.addBuilding(kind, o.side, x, z, true);
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
      case "sbFuel":
        sb.infiniteFuel = o.on;
        break;
      default:
        break;
    }
  }

  private orderMove(side: Side, ids: readonly number[], x: number, z: number, kind: "move" | "amove"): void {
    const units = this.ownUnits(side, ids);
    const groundCount = units.filter((u) => u.air === "none").length;
    let k = 0;
    for (const u of units) {
      if (u.air !== "none") {
        u.mission = "move";
        u.mx = clamp(x, -this.map.airX, this.map.airX);
        u.mz = clamp(z, -this.map.airZ, this.map.airZ);
        u.targetId = 0;
        u.autoTarget = 0;
        this.cancelRtbIfFuel(u);
        continue;
      }
      const off = groundCount > 1 ? FORMATION[Math.min(k++, FORMATION.length - 1)] : ([0, 0] as const);
      if (u.kind === "hauler") {
        this.releaseMine(u);
        u.manual = true;
        u.hState = "idle";
      }
      const f = this.grid.nearestFree(x + off[0], z + off[1], 8) ?? [x, z];
      u.order = kind;
      u.targetId = 0;
      u.autoTarget = 0;
      u.chasing = false;
      u.tx = f[0];
      u.tz = f[1];
      this.setPath(u, f[0], f[1]);
    }
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

  private orderBuild(side: Side, kind: BuildingId, rx: number, rz: number): void {
    const spec = BUILDINGS[kind];
    const cost = spec.cost;
    if (!spec.mvp || !cost || kind === "hq") return;
    const x = Math.round(rx);
    const z = Math.round(rz);
    if (this.canPlace(side, kind, x, z) !== null) return;
    const st = this.sides[side];
    if (st.iron < cost.iron || st.oil < cost.oil) return;
    st.iron -= cost.iron;
    st.oil -= cost.oil;
    const b = this.addBuilding(kind, side, x, z, false);
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
        if (t) this.tryFire(b, spec.weapon, t);
      }
    }
  }

  private produce(b: Building): void {
    const kind = b.queue[0];
    const us = UNITS[kind];
    let live = 0;
    for (const u of this.units) if (u.side === b.side && u.kind !== "commander") live++;
    if (live >= RULES.unitCap) return;
    if (us.domain === "air" && b.pads.indexOf(0) < 0) return;
    // thiếu điện thì đúc chậm (Tổng Hành Dinh tự có điện nên không bị ảnh hưởng)
    b.prog += BUILDINGS[b.kind].power < 0 ? b.powerFrac : 1;
    if (b.prog < sec(us.buildTime ?? 5)) return;
    b.prog = 0;
    b.queue.shift();
    if (us.domain === "air") {
      const pad = b.pads.indexOf(0);
      const [x, z] = this.padPos(b, pad);
      const u = this.spawnUnit(kind, b.side, x, z);
      u.hx = u.phx = 0;
      u.hz = u.phz = 1;
      b.pads[pad] = u.id;
      u.padB = b.id;
      u.padI = pad;
    } else {
      const spec = BUILDINGS[b.kind];
      const [dx, dz] = dirToCenter(b.x, b.z);
      const reach = Math.max(spec.half[0], spec.half[1]) + 2.5;
      const u = this.spawnUnit(kind, b.side, b.x + dx * reach, b.z + dz * reach);
      if (kind !== "hauler" && b.rallySet) this.orderMove(b.side, [u.id], b.rallyX, b.rallyZ, "move");
    }
    this.sides[b.side].stats.unitsBuilt++;
  }

  // ------------------------------------------------------------------ mỏ

  private updateMines(): void {
    const R2 = RULES.captureRadius * RULES.captureRadius;
    const step = 1 / sec(RULES.captureSeconds);
    for (const m of this.mines) {
      let w0 = 0;
      let w1 = 0;
      for (const u of this.units) {
        if (u.air !== "none" || u.hp <= 0) continue;
        const cw = UNITS[u.kind].captureWeight;
        if (cw <= 0 || dist2(u.x, u.z, m.x, m.z) > R2) continue;
        if (u.side === 0) w0 += cw;
        else w1 += cw;
      }
      const prev = m.owner;
      if (w0 > 0 && w1 > 0) continue;
      if (w0 === 0 && w1 === 0) {
        if (m.owner >= 0) m.cap = Math.min(1, m.cap + step * 0.25);
        else if (m.cap > 0) m.cap = Math.max(0, m.cap - step * 0.1);
        continue;
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
          m.slots = [];
          this.alert(prev as Side, "mineLost", m.x, m.z);
          this.events.push({ t: "captured", mine: m.id, res: m.res, side: -1, prev });
        }
      } else {
        if (m.capSide !== s && m.cap > 0) {
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
            m.slots = [];
            this.events.push({ t: "captured", mine: m.id, res: m.res, side: s, prev: -1 });
          }
        }
      }
    }
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
    // tốc độ theo địa hình và độ dốc, đo theo hướng tới điểm kế tiếp trên đường
    const fdx = u.path[u.pathI * 2] - u.x;
    const fdz = u.path[u.pathI * 2 + 1] - u.z;
    const fd = Math.sqrt(fdx * fdx + fdz * fdz);
    const full = spec.speed * DT * (fd > 1e-6 ? this.moveFactor(u, fdx / fd, fdz / fd) : this.moveFactor(u, 0, 0));
    let step = full;
    const ox = u.x;
    const oz = u.z;
    while (step > 1e-9 && u.pathI * 2 < u.path.length) {
      const wx = u.path[u.pathI * 2];
      const wz = u.path[u.pathI * 2 + 1];
      const dx = wx - u.x;
      const dz = wz - u.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-6) {
        u.hx = dx / d;
        u.hz = dz / d;
      }
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
    u.moved = moved2 > 1e-6;
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

  /** Tầm bắn thực tế: cộng thêm khi đã triển khai, và khi đứng trên cao (quân mặt đất, công trình). */
  private reach(src: Unit | Building, w: WeaponSpec): number {
    let r = this.deployed(src, w) ? w.range * (1 + w.deploy!.range) : w.range;
    if (src.cat === "building" || src.air === "none") {
      const T = RULES.terrain;
      r *= 1 + clamp(this.heightAt(src.x, src.z) * T.rangePerM, 0, T.rangeMax);
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
      const score = d2 + (UNITS[e.kind].weapon ? 0 : 60);
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
      const score = d2 + 400;
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
        if (t && w) {
          fireAt = t;
          if (this.inRange(u.x, u.z, w, t, range)) this.halt(u);
          else this.chase(u, t);
        } else {
          if (u.chasing || u.path.length === 0) {
            u.chasing = false;
            this.setPath(u, u.tx, u.tz);
          }
          if (this.follow(u)) this.setIdle(u);
        }
        break;
      }
      case "move": {
        if (this.follow(u)) this.setIdle(u);
        if (w) fireAt = this.acquire(u, w, range);
        break;
      }
      case "idle": {
        const t = w ? this.acquire(u, w, range + IDLE_ACQUIRE_BONUS) : null;
        if (t && w) {
          fireAt = t;
          if (this.inRange(u.x, u.z, w, t, range)) this.halt(u);
          else if (dist2(u.x, u.z, u.tx, u.tz) < LEASH * LEASH) this.chase(u, t);
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
    if (w) this.aim(u, w, fireAt);
    if (fireAt && w) this.tryFire(u, w, fireAt);
    // Lockdown: đếm thời gian đứng yên (chạy là mất triển khai)
    u.still = u.moved ? 0 : Math.min(u.still + 1, 100000);
    this.rechargePd(u);
  }

  /** Tháp pháo xoay về mục tiêu (hoặc về hướng thân khi rảnh) với tốc độ giới hạn. */
  private aim(u: Unit, w: WeaponSpec, t: Target | null): void {
    if (!w.traverse) {
      u.aimX = u.hx;
      u.aimZ = u.hz;
      return;
    }
    let dx = u.hx;
    let dz = u.hz;
    if (t) {
      const l = Math.sqrt(dist2(u.x, u.z, t.x, t.z));
      if (l > 1e-6) {
        dx = (t.x - u.x) / l;
        dz = (t.z - u.z) / l;
      }
    }
    turnToward(u.aimX, u.aimZ, dx, dz, traverseStep(w.traverse), TMP);
    u.aimX = TMP.x;
    u.aimZ = TMP.z;
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
    return src.burst > 0 ? w.burst.interval : w.cooldown;
  }

  private auraFactor(u: Unit): number {
    const c = this.commanders[u.side];
    if (!c || c === u || c.hp <= 0) return 1;
    const aura = UNITS.commander.aura!;
    return dist2(u.x, u.z, c.x, c.z) <= aura.radius * aura.radius ? aura.fireRate : 1;
  }

  private tryFire(src: Unit | Building, w: WeaponSpec, t: Target): boolean {
    if (src.cooldown > 0 || !this.inRange(src.x, src.z, w, t, this.reach(src, w))) return false;
    if (this.sandbox?.hold[src.side]) return false;
    const air = this.isAirborne(t);
    let dmg = air ? w.dmgAir : w.dmgGround;
    if (dmg <= 0) return false;
    const ground = src.cat === "unit" && src.air === "none";
    const d = Math.sqrt(dist2(src.x, src.z, t.x, t.z));
    // Tháp pháo xoay chậm: nòng chưa về đúng hướng thì chưa bắn
    if (w.traverse && ground && d > 1e-6 && (src.aimX * (t.x - src.x) + src.aimZ * (t.z - src.z)) / d < AIM_COS) return false;
    const deployed = this.deployed(src, w);
    if (w.deploy?.required && !deployed) return false;
    if (deployed) dmg *= 1 + w.deploy!.dmg;
    let miss = false;
    if (w.movePenalty && ground && src.moved) {
      dmg *= 1 - w.movePenalty.dmg;
      miss = this.rng.next() < w.movePenalty.miss;
    }
    let cd = this.nextCooldown(src, w);
    if (src.cat === "unit") cd /= this.auraFactor(src);
    else if (BUILDINGS[src.kind].power < 0) cd /= Math.max(0.1, src.powerFrac);
    src.cooldown = Math.max(1, Math.round(cd * TICK_RATE));
    src.lastShot = this.tick;
    const talt = t.cat === "unit" ? t.alt : 0;
    const ticks = Math.max(1, Math.ceil((d / SHOT_SPEED[w.visual]) * TICK_RATE));
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
    if (ground && !w.traverse) {
      // quay thân về phía mục tiêu khi đứng bắn (xe có tháp pháo xoay thì thân giữ nguyên, chỉ nòng quay)
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
    const ticks = Math.max(1, Math.ceil((d / SHOT_SPEED[w.visual]) * TICK_RATE));
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

  private toDock(u: Unit): void {
    const hq = this.hqOf(u.side);
    if (!hq) {
      u.hState = "idle";
      return;
    }
    // dỡ hàng ở cạnh Tổng Hành Dinh gần phía xe đang tới
    const dx = u.x - hq.x;
    const dz = u.z - hq.z;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    const r = BUILDINGS.hq.half[0] + 2.6;
    const f = this.grid.nearestFree(hq.x + (dx / l) * r, hq.z + (dz / l) * r, 5) ?? [hq.x + r, hq.z];
    u.tx = f[0];
    u.tz = f[1];
    u.hState = "toDock";
    this.setPath(u, f[0], f[1]);
  }

  private nearHq(u: Unit, hq: Building, margin: number): boolean {
    const h = BUILDINGS.hq.half[0] + margin;
    return Math.abs(u.x - hq.x) <= h && Math.abs(u.z - hq.z) <= h;
  }

  private updateHauler(u: Unit): void {
    switch (u.hState) {
      case "idle": {
        if (u.order === "move") {
          if (this.follow(u)) this.setIdle(u);
          return;
        }
        if (!u.manual && (this.tick + u.id) % 10 === 0) {
          if (u.cargo > 0 && this.hqOf(u.side)) this.toDock(u);
          else this.assignMine(u, 0);
        }
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
        if (this.nearHq(u, hq, 2.4) || dist2(u.x, u.z, u.tx, u.tz) <= 2) {
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
        if (--u.hTimer > 0) return;
        const st = this.sides[u.side];
        st[u.cargoRes] += u.cargo;
        if (u.cargoRes === "iron") st.stats.ironMined += u.cargo;
        else st.stats.oilMined += u.cargo;
        u.cargo = 0;
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

  private ensurePad(u: Unit): [number, number] | null {
    const p = this.padPosOf(u);
    if (p) return p;
    let best: Building | null = null;
    let bi = -1;
    let bd = Infinity;
    for (const b of this.buildings) {
      if (b.side !== u.side || b.kind !== "airfield" || !b.built || b.hp <= 0) continue;
      const i = b.pads.indexOf(0);
      if (i < 0) continue;
      const d = dist2(u.x, u.z, b.x, b.z);
      if (d < bd) {
        bd = d;
        best = b;
        bi = i;
      }
    }
    if (!best) return null;
    best.pads[bi] = u.id;
    u.padB = best.id;
    u.padI = bi;
    return this.padPos(best, bi);
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
          u.hx = 0;
          u.hz = 1;
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
        const push = (min - d) * 0.5;
        const ax = a.x - nx * push;
        const az = a.z - nz * push;
        if (!this.grid.blockedAt(ax, az)) {
          a.x = ax;
          a.z = az;
        }
        const bx = b.x + nx * push;
        const bz = b.z + nz * push;
        if (!this.grid.blockedAt(bx, bz)) {
          b.x = bx;
          b.z = bz;
        }
      }
    }
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
    const value = Math.round(valueOf(u.kind) * S.share);
    if (value <= 0) return;
    this.wrecks.push({ id: this.nextId++, kind: u.kind, side: u.side, x: u.x, z: u.z, hx: u.hx, hz: u.hz, value, until: this.tick + sec(S.seconds) });
  }

  /** Xác quân hết hạn thì biến mất; xe mặt đất gần nhất trong bán kính nhặt (tự động, bất kể phe). */
  private updateWrecks(): void {
    if (this.wrecks.length === 0) return;
    const r2 = RULES.salvage.radius * RULES.salvage.radius;
    const keep: Wreck[] = [];
    for (const wr of this.wrecks) {
      if (this.tick >= wr.until) continue;
      let best: Unit | null = null;
      let bestD = r2;
      for (const u of this.units) {
        if (u.air !== "none" || u.hp <= 0) continue;
        const d = dist2(u.x, u.z, wr.x, wr.z);
        if (d <= bestD) {
          bestD = d;
          best = u;
        }
      }
      if (!best) {
        keep.push(wr);
        continue;
      }
      const st = this.sides[best.side];
      st.iron += wr.value;
      st.stats.salvaged += wr.value;
      this.events.push({ t: "salvage", wreck: wr.id, side: best.side, value: wr.value, x: wr.x, z: wr.z });
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
    num(u.aimX);
    num(u.aimZ);
    num(u.pd);
    num(u.yawRate);
    num(u.ammo2);
    num(u.cd2);
    num(u.xp);
    num(u.rank);
  }
  for (const b of w.buildings) {
    num(b.id);
    num(b.hp);
    num(b.progress);
    num(b.queue.length);
    num(b.prog);
  }
  for (const wr of w.wrecks) {
    num(wr.id);
    num(wr.until);
  }
  for (const m of w.mines) {
    num(m.amount);
    num(m.owner);
    num(m.cap);
  }
  num(w.shots.length);
  return h >>> 0;
}
