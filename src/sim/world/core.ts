/**
 * LÕI MÔ PHỎNG — World (phần lõi: trạng thái, hàm tạo, vòng tick, truy vấn công khai).
 *
 * Các luật nằm ở các file cùng thư mục, gắn vào World.prototype (xem src/sim/world.ts).
 *
 * Mỗi lần gọi step(lệnh) là trận đấu tiến thêm đúng 1 tick (0.1 giây). Thứ tự trong một tick luôn cố định:
 *   1. lưu vị trí cũ (để phần vẽ nội suy)   2. áp dụng lệnh   3. kinh tế   4. công trình (xây, đúc quân, tháp bắn)
 *   5. chiếm mỏ   6. quân (đi, nhắm, bắn; máy bay bay và đốt dầu)   7. đẩy xe không chồng lên nhau
 *   8. đạn tới đích → trừ máu   9. dọn xác   10. sương mù   11. kiểm tra thắng thua
 * Không có gì phụ thuộc thời gian thật hay số ngẫu nhiên không seed, nên cùng seed + cùng lệnh thì ra cùng trận.
 */
import { BUILDINGS, RULES, UNITS, type Side, type WeaponSpec } from "../content";
import { Rng } from "../fmath";
import { Grid } from "../grid";
import { GameMap, getMap, TERRAIN, TERRAIN_KINDS } from "../maps";
import type { Squad, AlertKind, Building, Command, Entity, Mine, Shot, SideState, SimEvent, Target, Unit, Uplink, WinReason, Wreck } from "../types";
import { DT, sec, AIRBORNE_ALT, dirToCenter, newSide, type WorldOptions, type SandboxState, SANDBOX_RES } from "./shared";


export class World {
  tick = 0;
  readonly rng: Rng;
  /** Bản đồ của trận (không đổi trong trận). Trận được xác định bởi bản đồ + seed + danh sách lệnh. */
  readonly map: GameMap;
  readonly grid: Grid;
  /** Bảng ô đỗ dỡ hàng quanh Tổng Hành Dinh (tính một lần, xem `dockSlots`). */
  docks: (readonly [number, number, number, number])[] | null = null;
  /**
   * Lớp xe đứng (xem `standLayer`), dựng lười: chỉ số = phe × 2 + (người tìm đường là tiểu đội bộ binh ? 1 : 0). Tick dựng gần
   * nhất và hai mảng của mỗi lớp.
   */
  standTick: number[] = [-1, -1, -1, -1];
  standClear: (Float32Array | null)[] = [null, null, null, null];
  standOwner: (Int32Array | null)[] = [null, null, null, null];
  /** Vòng in của từng xe đứng [x, z, r, mã] theo lớp (xem `StandLayer.discs`), dựng cùng lúc với `standClear`. */
  standDiscs: Float64Array[] = [new Float64Array(0), new Float64Array(0), new Float64Array(0), new Float64Array(0)];
  /** Độ cao mặt đất ở tâm từng ô lưới (m), tính một lần lúc tạo trận (địa hình không đổi). */
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
  nextId = 1;
  commanders: [Unit | null, Unit | null] = [null, null];
  /** Mọi Drone Khiên còn sống (làm mới đầu mỗi tick): đang bật thì hứng đạn, đang tắt thì đo mức nguy hiểm. */
  shields: Unit[] = [];
  sold = new Set<number>();

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
        spots: [],
        cells: [],
        radius: 0
      };
      // bãi tài nguyên: khối quặng / giếng và chỗ đỗ quanh tâm (world/field.ts)
      this.layoutField(mine);
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
      // xe vận tải đứng giữa nhà và mỏ nhà; bản đồ chưa có mỏ nhà (đang dựng) thì đứng sau nhà, phía xa tiền tuyến
      const home = this.mines.find((m) => m.owner === s);
      const [mx, mz] = home ? [(hx + home.x) / 2, (hz + home.z) / 2] : [hx - dx * 9, hz - dz * 9];
      for (let i = 0; i < 2; i++) this.spawnUnit("hauler", s, mx + px * (i * 3.5 - 1.75), mz + pz * (i * 3.5 - 1.75));
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
    // máy bay ở trên cao: thấy được từ mọi tầng (tầng cao chỉ che mặt đất)
    if (e.cat === "unit" && e.alt > AIRBORNE_ALT) return this.sides[side].visAir[this.grid.index(e.x, e.z)] === 1;
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
    if (t.cat === "unit" && World.sheltered(t)) return false;
    return this.isAirborne(t) ? w.dmgAir > 0 : w.dmgGround > 0;
  }

  /** Máy bay còn chờ dưới giếng phóng: đang ở trong nhà, không bị nhắm bắn, không dính sát thương lan. */
  static sheltered(u: Unit): boolean {
    return u.air === "launch" && u.airT < 0;
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
      u.prefX = 0;
      u.prefZ = 0;
      u.slotOff = 0;
      u.packing = false;
    }
    if (this.sandbox)
      for (const st of this.sides) {
        st.iron = SANDBOX_RES;
        st.oil = SANDBOX_RES;
      }
    for (const c of cmds) this.applyOrder(c.side, c.order);
    this.shields = this.units.filter((u) => UNITS[u.kind].shield && u.hp > 0);
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
    this.keepOffWalls();
    // nhường đường: đọc đường đi / vận tốc thật của tick này, xe đứng dạt từ tick sau (`world/yield.ts`)
    this.yieldPass();
    this.resolveShots();
    this.veteranRegen();
    this.commanderRetreat();
    this.cleanup();
    this.updateWrecks();
    this.updateFog();
    if (!this.sandbox) this.checkVictory();
    this.tick++;
  }

  alert(side: Side, what: AlertKind, x: number, z: number, n?: number): void {
    const st = this.sides[side];
    const gap = what === "powerShort" || what === "oilLow" || what === "batteryLow" ? sec(15) : what === "powerForecast" ? 0 : sec(8);
    if (this.tick - st.alerts[what] < gap) return;
    st.alerts[what] = this.tick;
    this.events.push({ t: "alert", side, what, x, z, n });
  }
}
