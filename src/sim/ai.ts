/**
 * AI Tư Lệnh (1 độ khó).
 *
 * Luật công bằng: AI chỉ tạo LỆNH (giống người chơi bấm nút) và chỉ đọc những gì phe nó được thấy:
 * quân mình, công trình mình, quân địch đang trong tầm nhìn, công trình địch đã từng phát hiện,
 * chủ sở hữu các mỏ (thông tin công khai trên HUD) và vị trí 2 Tổng Hành Dinh (bản đồ cố định).
 * AI chạy bên trong vòng tick nên cũng phải tất định: không Math.random, không thời gian thật.
 */
import { BUILDINGS, lotCost, UNITS, valueOf, type BuildingId, type Side, type UnitId } from "./content";
import { dist2, Rng } from "./fmath";
import type { Building, Mine, Order, Unit, Uplink } from "./types";
import { dirToCenter, sec, type World } from "./world";

/** Giữ lựa chọn xe mặt đất để dành tiền tối đa chừng này (quá lâu thì chọn lại, ví dụ địch vừa đổi sang máy bay). */
const SAVE_FOR = sec(30);
/** Bước lưới (m) khi dò chỗ đặt công trình, và thời gian bỏ qua một loại công trình vừa tìm không ra chỗ. */
const SPOT_STEP = 4;
const NO_ROOM_RETRY = sec(20);
/**
 * Tường Thành (số tạm): bắt đầu tính vòng tường từ giây này (và khi đã có tháp), giữ lại chừng này Sắt, bán kính tối thiểu,
 * nửa bề rộng cửa ngõ (m).
 */
const WALL_FROM = sec(150);
const WALL_KEEP = 200;
const WALL_MIN_R = 36;
const GAP_HALF = 5;
/** Hai cửa ngõ gần nhau hơn chừng này (m) thì gộp làm một. */
const GAP_MERGE = 20;
/** Đường tới đích dài hơn đường thẳng chừng này lần (cộng 20 m) thì đợt tấn công phá tường mở lối thay vì đi vòng. */
const BREACH_DETOUR = 1.8;
interface WallPlan {
  r: number;
  tiles: [number, number][];
  gaps: [number, number][];
}

export class Ai {
  private wave = 0;
  private lastWave = -10000;
  private waveIds = new Set<number>();
  private capIds = new Set<number>();
  private waveTarget: [number, number] | null = null;
  private seenAir = 0;
  /** Nhớ số mục tiêu giáp dày (tháp phòng thủ đã biết + Titan đang thấy), phai dần: lý do để đúc Pháo Tự Hành. */
  private seenArmor = 0;
  /**
   * Xe đã chọn đúc mà chưa đủ tiền, mỗi loại xưởng một lựa chọn: giữ lựa chọn và để dành (tối đa `SAVE_FOR` tick) thay vì
   * bốc thăm lại mỗi lượt. Không giữ thì quân đắt (Titan, Pháo) hầu như không bao giờ được đúc: lần nào thiếu tiền cũng bị
   * Lynx rẻ chen ngang. Xưởng nào giữ lựa chọn lâu hơn được tiêu tiền trước (không xưởng nào bị bỏ đói).
   */
  private plans: Partial<Record<BuildingId, { k: UnitId; at: number }>> = {};
  /** Mỗi AI có bộ số ngẫu nhiên riêng theo seed trận: tất định nhưng mỗi trận một khác. */
  private rng: Rng;
  private waveBonus = 0;
  private capChoice = 0;
  /** Tick gần nhất mỗi loại công trình tìm không ra chỗ đặt: tạm bỏ qua loại đó để kế hoạch xây không kẹt. */
  private noSpotAt: Partial<Record<BuildingId, number>> = {};
  /** Kế hoạch vòng tường (tính một lần): bán kính, các ô tường theo thứ tự xây, các điểm cửa ngõ (cửa đầu = hướng địch tới). */
  private wall: WallPlan | null = null;

  constructor(
    readonly side: Side,
    seed = 1
  ) {
    this.rng = new Rng(seed * 7919 + side * 104729 + 17);
    this.waveBonus = this.rng.int(3);
  }

  think(w: World): Order[] {
    if (w.winner !== -1 || (w.tick + this.side * 2) % 5 !== 0) return [];
    const me = this.side;
    const foe = (1 - me) as Side;
    const st = w.sides[me];
    const out: Order[] = [];
    const mine = w.units.filter((u) => u.side === me);
    const myB = w.buildings.filter((b) => b.side === me);
    const hq = w.hqOf(me);
    const base = hq ?? myB[0];
    if (!base) return out;
    const enemyUnits = w.units.filter((u) => u.side === foe && w.visibleTo(me, u));
    const enemyBuildings = w.buildings.filter((b) => b.side === foe && st.known.has(b.id));
    const airNow = enemyUnits.filter((u) => UNITS[u.kind].domain === "air").length;
    this.seenAir = Math.max(this.seenAir * 0.99, airNow);
    for (const id of [...this.waveIds]) if (!w.byId.has(id)) this.waveIds.delete(id);
    for (const id of [...this.capIds]) if (!w.byId.has(id)) this.capIds.delete(id);

    let iron = st.iron;
    let oil = st.oil;

    // 1. Xây công trình theo thứ tự ưu tiên (mỗi lúc chỉ xây 1 cái)
    let reserve = 0;
    const plan = this.nextBuilding(w, myB);
    if (plan) {
      const c = BUILDINGS[plan].cost!;
      if (iron >= c.iron && oil >= c.oil) {
        const spot = this.findSpot(w, plan, base);
        if (spot) {
          out.push({ t: "build", kind: plan, x: spot[0], z: spot[1] });
          iron -= c.iron;
          oil -= c.oil;
        }
      } else reserve = c.iron;
    }

    // 2. Đủ Xe Vận Tải cho số mỏ đang giữ
    if (hq && hq.built) {
      const haulers = mine.filter((u) => u.kind === "hauler").length + hq.queue.filter((k) => k === "hauler").length;
      const owned = w.mines.filter((m) => m.owner === me && m.amount > 0).length;
      const want = Math.min(9, 2 + owned * 2);
      if (haulers < want && hq.queue.length < 2 && iron - reserve * 0.5 >= 150) {
        out.push({ t: "produce", building: hq.id, kind: "hauler" });
        iron -= 150;
      }
    }

    // 3. Đúc quân
    const armorNow =
      enemyBuildings.filter((b) => b.kind === "turret").length + enemyUnits.filter((u) => u.kind === "titan").length;
    this.seenArmor = Math.max(this.seenArmor * 0.999, armorNow); // think() 2 lần mỗi giây: nhớ chừng 6 phút
    const shops = myB.filter((b) => (b.kind === "factory" || b.kind === "special-factory") && b.built && b.queue.length < 2);
    for (const f of shops) {
      const plan = this.plans[f.kind];
      if (plan && w.tick - plan.at <= SAVE_FOR) continue;
      const k = f.kind === "factory" ? this.pickTank(mine) : this.pickSpecial(mine, oil, this.seenArmor);
      if (k) this.plans[f.kind] = { k, at: w.tick };
      else delete this.plans[f.kind];
    }
    shops.sort((a, b) => (this.plans[a.kind]?.at ?? Infinity) - (this.plans[b.kind]?.at ?? Infinity) || a.id - b.id);
    for (const f of shops) {
      const plan = this.plans[f.kind];
      if (!plan) continue;
      const c = lotCost(plan.k);
      if (iron - reserve < c.iron || oil < c.oil) break; // để dành cho đúng xe đã chọn
      out.push({ t: "produce", building: f.id, kind: plan.k });
      iron -= c.iron;
      oil -= c.oil;
      delete this.plans[f.kind];
    }
    // máy bay: chỉ đúc khi còn bãi đậu trống (máy bay mới phải có chỗ đậu)
    for (const a of myB) {
      if (a.kind !== "aircraft-factory" || !a.built || a.queue.length > 0 || w.freePads(me) < UNITS.falcon.batch) continue;
      const c = lotCost("falcon");
      if (iron - reserve >= c.iron && oil >= c.oil + 60) {
        out.push({ t: "produce", building: a.id, kind: "falcon" });
        iron -= c.iron;
        oil -= c.oil;
      }
    }

    // 3b. Tường Thành: vòng tường quanh căn cứ chừa cửa ngõ, chỉ xây bằng Sắt dư
    if (hq) iron -= this.buildWalls(w, hq, myB, iron - reserve, out);

    // 4. Quân đội
    const army = mine.filter((u) => u.air === "none" && u.kind !== "hauler" && u.kind !== "commander");
    const threats = enemyUnits.filter(
      (e) =>
        UNITS[e.kind].domain === "ground" &&
        (myB.some((b) => dist2(b.x, b.z, e.x, e.z) < 32 * 32) || w.mines.some((m) => m.owner === me && dist2(m.x, m.z, e.x, e.z) < 22 * 22))
    );
    const busy = new Set<number>();

    // 4a. Phòng thủ: kéo quân gần nhất về chặn
    if (threats.length) {
      const t = this.nearest(threats, base.x, base.z)!;
      const nearHq = dist2(t.x, t.z, base.x, base.z) < 40 * 40;
      const defenders = army.filter((u) => (nearHq || !this.waveIds.has(u.id)) && u.order !== "attack" && dist2(u.x, u.z, t.x, t.z) < 70 * 70);
      const send = defenders.filter((u) => u.order === "idle" || dist2(u.tx, u.tz, t.x, t.z) > 15 * 15);
      if (send.length) out.push({ t: "amove", ids: send.map((u) => u.id), x: t.x, z: t.z });
      for (const u of defenders) busy.add(u.id);
    }

    // 4b. Phá thế độc quyền của đối phương
    const foeSt = w.sides[foe];
    if (foeSt.mono > 0 && foeSt.monoRes) {
      const targets = w.mines.filter((m) => m.res === foeSt.monoRes && m.owner === foe);
      const m = this.nearestMine(targets, base.x, base.z);
      if (m) {
        const go = army.filter((u) => !busy.has(u.id) && (u.order === "idle" || dist2(u.tx, u.tz, m.x, m.z) > 10 * 10));
        if (go.length) out.push({ t: "amove", ids: go.map((u) => u.id), x: m.x, z: m.z });
        for (const u of army) busy.add(u.id);
      }
    }

    // 4c. Đội chiếm mỏ (ưu tiên Lynx) đi chiếm mỏ chưa thuộc phe mình.
    //     Nếu đối phương đã giữ gần trọn một loại mỏ, mỏ còn lại thành mục tiêu số một (chặn độc quyền từ sớm).
    const danger = this.monopolyDanger(w);
    const targetMine = danger ?? this.captureTarget(w, base);
    if (targetMine) {
      const squad = army.filter((u) => this.capIds.has(u.id));
      const squadSize = danger ? 4 : 2;
      if (squad.length < squadSize) {
        const pool = army
          .filter((u) => !busy.has(u.id) && !this.waveIds.has(u.id) && !this.capIds.has(u.id) && u.order === "idle")
          .sort((a, b) => (a.kind === "lynx" ? 0 : 1) - (b.kind === "lynx" ? 0 : 1) || a.id - b.id);
        for (const u of pool.slice(0, squadSize - squad.length)) {
          this.capIds.add(u.id);
          squad.push(u);
        }
      }
      const go = squad.filter((u) => !busy.has(u.id) && u.order !== "attack" && dist2(u.tx, u.tz, targetMine.x, targetMine.z) > 5 * 5);
      if (go.length) out.push({ t: "amove", ids: go.map((u) => u.id), x: targetMine.x, z: targetMine.z });
      for (const u of squad) busy.add(u.id);
    } else this.capIds.clear();

    // 4d. Tấn công theo đợt
    const free = army.filter((u) => !busy.has(u.id) && !this.waveIds.has(u.id) && !this.capIds.has(u.id) && u.order === "idle");
    const waveSize = Math.min(14, 4 + this.waveBonus + this.wave * 2);
    if (free.length >= waveSize && w.tick - this.lastWave > sec(20)) {
      const t = this.attackTarget(w, base, enemyBuildings);
      for (const u of free) this.waveIds.add(u.id);
      const wall = this.breach(w, free, t, enemyBuildings);
      if (wall) out.push({ t: "attack", ids: free.map((u) => u.id), target: wall.id });
      else out.push({ t: "amove", ids: free.map((u) => u.id), x: t[0], z: t[1], formation: "attack" });
      this.wave++;
      this.waveBonus = this.rng.int(3);
      this.lastWave = w.tick;
      this.waveTarget = t;
    }
    const waveIdle = army.filter((u) => this.waveIds.has(u.id) && !busy.has(u.id) && u.order === "idle");
    if (waveIdle.length && w.tick % sec(3) < 5) {
      const t = this.attackTarget(w, base, enemyBuildings);
      this.waveTarget = t;
      const wall = this.breach(w, waveIdle, t, enemyBuildings);
      if (wall) out.push({ t: "attack", ids: waveIdle.map((u) => u.id), target: wall.id });
      else out.push({ t: "amove", ids: waveIdle.map((u) => u.id), x: t[0], z: t[1] });
    }

    // 4e. Xe Tư Lệnh: ở gần nhà, ra trận cùng quân khi căn cứ bị đánh
    const cmd = w.commanderOf(me);
    if (cmd && hq && cmd.order === "idle" && !threats.length && dist2(cmd.x, cmd.z, hq.x, hq.z) > 22 * 22) {
      const [dx, dz] = dirToCenter(hq.x, hq.z);
      out.push({ t: "move", ids: [cmd.id], x: hq.x + dx * 10, z: hq.z + dz * 10 });
    }

    // 6. Kỹ năng của binh chủng (chỉ dùng thông tin phe mình có, ra lệnh như người chơi)
    this.useRockets(mine, enemyUnits, enemyBuildings, out);
    this.useAbilities(w, mine, enemyUnits, out);

    // 5. Falcon: xuất kích khi đủ dầu, ưu tiên săn Xe Vận Tải, rồi quân đang đánh vào nhà, rồi quân địch thấy được
    for (const f of mine) {
      if (f.kind !== "falcon" || f.air !== "parked" || f.mission !== "none") continue;
      if (f.fuel < UNITS.falcon.fuel!.tank * 0.75) continue;
      const haulers = enemyUnits.filter((e) => e.kind === "hauler");
      const t = this.nearest(threats, f.x, f.z) ?? this.nearest(haulers, f.x, f.z) ?? this.nearest(enemyUnits.filter((e) => e.kind !== "skyguard"), base.x, base.z);
      if (t) out.push({ t: "attack", ids: [f.id], target: t.id });
      else if (this.waveTarget) out.push({ t: "move", ids: [f.id], x: this.waveTarget[0], z: this.waveTarget[1] });
    }
    return out;
  }

  private nextBuilding(w: World, myB: Building[]): BuildingId | null {
    if (myB.some((b) => !b.built && !BUILDINGS[b.kind].tile)) return null;
    const count = (k: BuildingId): number => myB.filter((b) => b.kind === k).length;
    const t = w.tick;
    const st = w.sides[this.side];
    // Điện: thiếu thì xây Nhà Máy Điện trước (nếu còn Dầu để đốt)
    const canPower = st.oil > 60;
    if (st.eff < 1 && canPower && !this.noRoom(w, "power-plant")) return "power-plant";
    if (count("battery") === 0 && count("power-plant") > 0 && t > sec(240) && st.iron > 300 && !this.noRoom(w, "battery")) return "battery";
    const turrets = count("turret");
    // Danh sách theo thứ tự ưu tiên; loại vừa tìm không ra chỗ đặt thì tạm bỏ qua, xét loại kế tiếp
    // (trước đây một kế hoạch không có chỗ, ví dụ Nhà Máy Máy Bay, chặn mọi công trình sau nó cả trận).
    const wants: [boolean, BuildingId][] = [
      [count("factory") === 0, "factory"],
      [count("airfield") === 0 && t > sec(70), "airfield"],
      [count("aircraft-factory") === 0 && t > sec(90), "aircraft-factory"],
      [t > sec(110) && turrets < Math.min(3, 1 + Math.floor(t / sec(200))), "turret"],
      [count("special-factory") === 0 && t > sec(200), "special-factory"], // không đòi dư Sắt: kế hoạch xây tự giữ tiền (reserve)
      [count("factory") < 2 && t > sec(280) && st.iron > 450, "factory"],
      [count("radar") === 0 && t > sec(300) && st.iron > 350, "radar"],
      [count("airfield") < 2 && t > sec(420) && st.oil > 250, "airfield"],
      [turrets < 5 && t > sec(480) && st.iron > 700, "turret"],
    ];
    let want: BuildingId | null = null;
    for (const [ok, k] of wants) if (ok && !this.noRoom(w, k)) { want = k; break; }
    if (!want) return null;
    const draw = -Math.min(0, BUILDINGS[want].power);
    if (draw > 0 && st.powerUse + st.powerPending + draw > st.powerCap && canPower && !this.noRoom(w, "power-plant")) return "power-plant";
    return want;
  }

  /** Loại công trình vừa tìm không ra chỗ đặt (trong `NO_ROOM_RETRY` tick gần đây). */
  private noRoom(w: World, kind: BuildingId): boolean {
    const at = this.noSpotAt[kind];
    return at !== undefined && w.tick - at < NO_ROOM_RETRY;
  }

  /**
   * Tìm chỗ đặt công trình trong vùng xây quanh căn cứ: công trình chiến đấu hướng ra giữa bản đồ, công trình hậu cần lùi về sau.
   * Quét lưới 4 m quanh Tổng Hành Dinh (không chỉ vài tia cố định: căn cứ ở góc bản đồ thì phần lớn tia rơi ra ngoài, còn xưởng
   * 11 × 11 ô không lọt vào tia nào). Điểm bằng nhau thì xét theo tọa độ tương đối đã soi gương theo phe để hai phe chọn đối xứng.
   */
  private findSpot(w: World, kind: BuildingId, base: Building): [number, number] | null {
    const [cx, cz] = dirToCenter(base.x, base.z);
    const back = kind === "airfield" || kind === "aircraft-factory" || kind === "power-plant" || kind === "radar" || kind === "battery";
    const flip = this.side === 0 ? 1 : -1;
    const reach = BUILDINGS.hq.zone ?? 24;
    const ring = this.wall;
    const [bw, bd] = w.blockHalf(kind);
    const big = Math.max(bw, bd) + w.marginOf(kind);
    // tháp đứng sau cửa ngõ chính (phía địch tới) để khe hẹp nằm gọn trong tầm bắn
    const gate = kind === "turret" && ring && ring.gaps.length ? ring.gaps[0] : null;
    const k = ring ? (ring.r - 10) / ring.r : 0;
    const gx = gate ? base.x + (gate[0] - base.x) * k : 0;
    const gz = gate ? base.z + (gate[1] - base.z) * k : 0;
    const keep = big + GAP_HALF + 4;
    const cands: { ox: number; oz: number; score: number; inside: boolean }[] = [];
    for (let ox = -reach; ox <= reach; ox += SPOT_STEP) {
      for (let oz = -reach; oz <= reach; oz += SPOT_STEP) {
        const d2 = ox * ox + oz * oz;
        if (d2 < 10 * 10 || d2 > reach * reach) continue;
        const r = Math.sqrt(d2);
        // tọa độ tương đối soi gương theo phe: hai phe xét cùng một tập điểm đối xứng
        const x = base.x + ox * flip;
        const z = base.z + oz * flip;
        // không bao giờ lấp cửa ngõ: lấp là tự nhốt quân mình trong vòng tường
        if (ring && ring.gaps.some(([px, pz]) => dist2(px, pz, x, z) < keep * keep)) continue;
        const dot = (ox * flip * cx + oz * flip * cz) / r;
        const score = gate ? Math.sqrt(dist2(x, z, gx, gz)) : r + (back ? dot * 10 : -dot * 10);
        cands.push({ ox, oz, score, inside: !ring || r + big + 2 < ring.r });
      }
    }
    cands.sort((a, b) => a.score - b.score || a.ox - b.ox || a.oz - b.oz);
    // có vòng tường thì ưu tiên chỗ bên trong; hết chỗ mới ra ngoài
    for (const pass of ring ? [true, false] : [false]) {
      for (const c of cands) {
        if (pass && !c.inside) continue;
        const x = base.x + c.ox * flip;
        const z = base.z + c.oz * flip;
        if (w.canPlace(this.side, kind, x, z) === null) return [x, z];
      }
    }
    this.noSpotAt[kind] = w.tick;
    return null;
  }

  /**
   * Tường Thành: vòng tường quanh căn cứ, ngay ngoài công trình xa nhất, chừa cửa ngõ đúng chỗ đường tự nhiên cắt qua vòng
   * (đường sang Tổng Hành Dinh địch, đường tới từng mỏ ngoài vòng). Quân ta và Xe Vận Tải vẫn ra vào qua cửa ngõ; quân mặt
   * đất địch bị dồn vào vài khe hẹp thay vì tràn vào từ mọi phía. Xây dần từ cửa ngõ chính ra hai bên, mỗi lượt 1 ô, chỉ
   * bằng Sắt dư; ô bị phá thì xây lại. Trả về số Sắt đã dùng.
   */
  private buildWalls(w: World, hq: Building, myB: Building[], spare: number, out: Order[]): number {
    if (!hq.built || w.tick < WALL_FROM) return 0;
    if (!this.wall) {
      if (!myB.some((b) => b.kind === "turret" && b.built)) return 0;
      this.wall = this.planWall(w, hq, myB);
    }
    const cost = BUILDINGS.wall.cost!.iron;
    if (spare - cost < WALL_KEEP) return 0;
    for (const [x, z] of this.wall.tiles) {
      if (w.canPlace(this.side, "wall", x, z) !== null) continue;
      out.push({ t: "build", kind: "wall", x, z });
      return cost;
    }
    return 0;
  }

  /** Tính vòng tường một lần: bán kính, cửa ngõ, các ô tường theo thứ tự xây. */
  private planWall(w: World, hq: Building, myB: Building[]): WallPlan {
    // bán kính: ngay ngoài nền móng xa nhất, trong vùng xây của Tổng Hành Dinh
    let far = 0;
    for (const b of myB) {
      if (BUILDINGS[b.kind].tile) continue;
      const [hw, hd] = w.blockHalf(b.kind, b.rot);
      far = Math.max(far, Math.sqrt(dist2(b.x, b.z, hq.x, hq.z)) + Math.max(hw, hd) + w.marginOf(b.kind));
    }
    const zone = BUILDINGS.hq.zone ?? 24;
    const r = Math.max(WALL_MIN_R, Math.min(zone - 6, far + 8));
    const outside = (x: number, z: number): boolean => dist2(x, z, hq.x, hq.z) >= r * r;
    // cửa ngõ: chỗ đường từ cửa Tổng Hành Dinh tới đích cắt qua vòng tròn bán kính r
    const ex = w.exitRect("hq", hq.x, hq.z, hq.rot);
    const sx = ex ? ex[0] : hq.x;
    const sz = ex ? ex[1] : hq.z;
    const foe = w.hqOf((1 - this.side) as Side);
    const goals: [number, number][] = [];
    if (foe) goals.push([foe.x, foe.z]);
    for (const m of w.mines) if (outside(m.x, m.z)) goals.push([m.x, m.z]);
    const field = w.grid.field("wheel", false);
    const gaps: [number, number][] = [];
    for (const [tx, tz] of goals) {
      const path = w.grid.findPath(sx, sz, tx, tz, field);
      if (!path) continue;
      let px = sx;
      let pz = sz;
      for (let i = 0; i < path.length; i += 2) {
        const nx = path[i];
        const nz = path[i + 1];
        if (!outside(px, pz) && outside(nx, nz)) {
          // chia đôi đoạn để tìm đúng chỗ cắt vòng tròn
          let lo = 0;
          let hi = 1;
          for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2;
            if (outside(px + (nx - px) * mid, pz + (nz - pz) * mid)) hi = mid;
            else lo = mid;
          }
          // cửa gần cửa đã có thì gộp làm một (xe đi vòng thêm một chút), để vòng tường không vụn thành nhiều đoạn ngắn
          const qx = px + (nx - px) * hi;
          const qz = pz + (nz - pz) * hi;
          if (!gaps.some(([gx, gz]) => dist2(gx, gz, qx, qz) < GAP_MERGE * GAP_MERGE)) gaps.push([qx, qz]);
          break;
        }
        px = nx;
        pz = nz;
      }
    }
    // ô tường: ô 2 m nằm trong vòng tròn mà có ô lân cận (8 hướng) nằm ngoài, nên dải tường liền 4 hướng (hình nối liền)
    const flip = this.side === 0 ? 1 : -1;
    const [c0x, c0z] = w.snapBuilding("wall", hq.x, hq.z);
    const n = Math.ceil(r / 2) + 2;
    const main = gaps[0] ?? [hq.x, hq.z];
    const cells: { x: number; z: number; i: number; j: number; score: number }[] = [];
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const x = c0x + i * 2 * flip;
        const z = c0z + j * 2 * flip;
        if (outside(x, z)) continue;
        let edge = false;
        for (let a = -1; a <= 1 && !edge; a++) for (let b = -1; b <= 1 && !edge; b++) if ((a || b) && outside(x + a * 2, z + b * 2)) edge = true;
        if (!edge) continue;
        if (gaps.some(([gx, gz]) => dist2(gx, gz, x, z) < GAP_HALF * GAP_HALF)) continue;
        cells.push({ x, z, i, j, score: dist2(x, z, main[0], main[1]) });
      }
    }
    // xây từ cửa ngõ chính ra hai bên; điểm bằng nhau xét theo chỉ số ô tương đối (đã soi gương theo phe)
    cells.sort((a, b) => a.score - b.score || a.i - b.i || a.j - b.j);
    return { r, tiles: cells.map((c) => [c.x, c.z]), gaps };
  }

  /** Xưởng Xe Tăng: Lynx, Titan, SkyGuard. */
  private pickTank(mine: Unit[]): UnitId {
    const n = (k: UnitId): number => mine.filter((u) => u.kind === k).length;
    const lynx = n("lynx");
    const titan = n("titan");
    const sky = n("skyguard");
    if (sky < Math.ceil(this.seenAir * 1.3)) return "skyguard";
    if (lynx < 2) return "lynx";
    // thỉnh thoảng đổi ý cho đội hình bớt đoán trước được
    const r = this.rng.next();
    if (r < 0.15) return "titan";
    if (r < 0.22) return "skyguard";
    if (titan <= lynx) return "titan";
    if (sky * 4 < lynx + titan) return "skyguard";
    return "lynx";
  }

  /**
   * Xưởng Xe Chuyên Dụng: Xe Tên Lửa Loạt (khoảng 1 chiếc mỗi 4 xe chiến đấu) và Pháo Tự Hành (khi đã gặp mục tiêu giáp dày:
   * tháp / Titan, khoảng 1 khẩu mỗi 5 xe chiến đấu). Chỉ đúc khi còn dư Dầu (giữ Dầu cho máy bay, nhà máy điện).
   * null = chưa cần, xưởng nghỉ.
   */
  private pickSpecial(mine: Unit[], oil: number, armored: number): UnitId | null {
    const n = (k: UnitId): number => mine.filter((u) => u.kind === k).length;
    const combat = n("lynx") + n("titan");
    const rocket = n("rocket") * 4 < combat && oil >= lotCost("rocket").oil + 80;
    const arty = armored >= 0.5 && n("artillery") * 5 < combat && oil >= lotCost("artillery").oil + 80;
    if (rocket && arty) return this.rng.next() < 0.5 ? "rocket" : "artillery";
    return rocket ? "rocket" : arty ? "artillery" : null;
  }

  /** Đối phương giữ trọn trừ một mỏ của một loại tài nguyên → trả về mỏ cần chiếm / giữ gấp. */
  private monopolyDanger(w: World): Mine | null {
    const foe = 1 - this.side;
    for (const res of ["oil", "iron"] as const) {
      const all = w.mines.filter((m) => m.res === res);
      const foeOwned = all.filter((m) => m.owner === foe).length;
      if (foeOwned === all.length - 1) {
        const rest = all.find((m) => m.owner !== foe)!;
        if (rest.owner !== this.side) return rest;
      }
    }
    return null;
  }

  /** Mục tiêu chiếm: mỏ hoặc Đài Liên Lạc chưa thuộc phe mình (gần nhà trước, Dầu và Đài được ưu tiên hơn). */
  private captureTarget(w: World, base: Building): Mine | Uplink | null {
    const cur = w.mines.find((m) => m.id === this.capChoice) ?? w.uplinks.find((u) => u.id === this.capChoice);
    if (cur && cur.owner !== this.side) return cur;
    let best: Mine | Uplink | null = null;
    let bestD = Infinity;
    for (const m of w.mines) {
      if (m.owner === this.side) continue;
      let d = dist2(m.x, m.z, base.x, base.z) * (0.8 + this.rng.next() * 0.4);
      if (m.res === "oil") d *= 0.7;
      if (m.owner !== -1) d *= 1.6;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    for (const up of w.uplinks) {
      if (up.owner === this.side) continue;
      let d = dist2(up.x, up.z, base.x, base.z) * (0.8 + this.rng.next() * 0.4) * 0.6;
      if (up.owner !== -1) d *= 1.6;
      if (d < bestD) {
        bestD = d;
        best = up;
      }
    }
    this.capChoice = best ? best.id : 0;
    return best;
  }

  /**
   * Phá tường: đợt quân không có đường tới đích (bị tường vây kín) hoặc đường vòng dài gần gấp đôi đường thẳng thì đánh ô
   * tường đã thấy nằm gần đường thẳng nhất (quân → tường → đích ngắn nhất). Tường vỡ, quân rảnh tay, lượt sau tiến tiếp.
   * Chỉ xét tường phe mình đã phát hiện (không nhìn xuyên sương mù); chưa thấy tường nào thì cứ tiến lại gần cho thấy.
   */
  private breach(w: World, group: Unit[], t: [number, number], known: Building[]): Building | null {
    const walls = known.filter((b) => BUILDINGS[b.kind].tile && b.hp > 0);
    if (!walls.length) return null;
    const lead = group.find((u) => UNITS[u.kind].domain === "ground");
    if (!lead) return null;
    const spec = UNITS[lead.kind];
    const path = w.grid.findPath(lead.x, lead.z, t[0], t[1], w.grid.field(spec.mobility ?? "wheel", !!spec.slowResist));
    const straight = Math.sqrt(dist2(lead.x, lead.z, t[0], t[1]));
    if (path) {
      let len = 0;
      let px = lead.x;
      let pz = lead.z;
      for (let i = 0; i < path.length; i += 2) {
        len += Math.sqrt(dist2(px, pz, path[i], path[i + 1]));
        px = path[i];
        pz = path[i + 1];
      }
      // đích là công trình nên A* dừng ở ô trống gần nó nhất: còn xa đích thì coi như bị chặn
      const reached = dist2(px, pz, t[0], t[1]) < 16 * 16;
      if (reached && len < straight * BREACH_DETOUR + 20) return null;
    }
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of walls) {
      const d = Math.sqrt(dist2(lead.x, lead.z, b.x, b.z)) + Math.sqrt(dist2(b.x, b.z, t[0], t[1]));
      if (d < bestD || (d === bestD && best && b.id < best.id)) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** Đích của đợt tấn công: công trình thật gần nhất đã biết (không tính ô tường: tường chỉ phá khi bị chặn, xem `breach`). */
  private attackTarget(w: World, base: Building, known: Building[]): [number, number] {
    const b = this.nearest(
      known.filter((k) => !BUILDINGS[k.kind].tile),
      base.x,
      base.z
    );
    if (b) return [b.x, b.z];
    const m = this.nearestMine(
      w.mines.filter((x) => x.owner === 1 - this.side),
      base.x,
      base.z
    );
    if (m) return [m.x, m.z];
    const [x, z] = w.map.bases[1 - this.side];
    return [x, z];
  }

  /**
   * Xe Tên Lửa Loạt: xe nào đã nạp xong (không đang nạp, không dở loạt, chưa có lệnh rải thảm) thì tìm chỗ đáng bắn nhất
   * trong tầm với (tầm + 12 m đường chạy): cụm quân địch mặt đất đang thấy (tổng giá trị trong vùng rơi ≥ 300, ví dụ hai
   * Lynx), hoặc công trình địch đã phát hiện (bắn được cả khi đang khuất sương mù, như người chơi nhớ chỗ công trình).
   */
  private useRockets(mine: Unit[], enemyUnits: Unit[], enemyBuildings: Building[], out: Order[]): void {
    const w = UNITS.rocket.weapon!;
    const reach = w.range + 12;
    const min = w.minRange ?? 0;
    const r2 = (w.scatter! + w.splash) ** 2;
    const ground = enemyUnits.filter((e) => e.air === "none");
    for (const u of mine) {
      if (u.kind !== "rocket" || u.order === "strike" || u.cooldown > 0 || u.burst > 0) continue;
      let best: [number, number] | null = null;
      let bestScore = 299;
      const inReach = (x: number, z: number): boolean => {
        const d2 = dist2(u.x, u.z, x, z);
        return d2 <= reach * reach && d2 >= min * min;
      };
      for (const c of ground) {
        if (!inReach(c.x, c.z)) continue;
        let score = 0;
        for (const e of ground) if (dist2(c.x, c.z, e.x, e.z) <= r2) score += valueOf(e.kind);
        if (score > bestScore) {
          bestScore = score;
          best = [c.x, c.z];
        }
      }
      for (const b of enemyBuildings) {
        if (!inReach(b.x, b.z)) continue;
        let score = valueOf(b.kind);
        for (const o of enemyBuildings) if (o !== b && dist2(b.x, b.z, o.x, o.z) <= r2 * 2) score += valueOf(o.kind) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = [b.x, b.z];
        }
      }
      if (best) out.push({ t: "barrage", ids: [u.id], x: best[0], z: best[1] });
    }
  }

  /** Tổng động viên: khi địch đã ở gần Xe Tư Lệnh (≤ 30 m) và có ít nhất 2 xe chiến đấu mình quanh xe. */
  private useAbilities(w: World, mine: Unit[], enemyUnits: Unit[], out: Order[]): void {
    const me = this.side;
    const ground = enemyUnits.filter((u) => u.air === "none" && u.hp > 0);
    const cmd = mine.find((u) => u.kind === "commander");
    if (cmd && w.mobilizeError(me) === null) {
      const r2 = UNITS.commander.aura!.radius ** 2;
      const allies = mine.filter((u) => u !== cmd && UNITS[u.kind].weapon && u.air === "none" && dist2(u.x, u.z, cmd.x, cmd.z) <= r2).length;
      const threat = ground.some((e) => dist2(e.x, e.z, cmd.x, cmd.z) <= 30 * 30);
      if (allies >= 2 && threat) out.push({ t: "mobilize" });
    }
  }

  private nearest<T extends { x: number; z: number; id: number }>(list: readonly T[], x: number, z: number): T | null {
    let best: T | null = null;
    let bestD = Infinity;
    for (const e of list) {
      const d = dist2(e.x, e.z, x, z);
      if (d < bestD || (d === bestD && best && e.id < best.id)) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private nearestMine(list: readonly Mine[], x: number, z: number): Mine | null {
    return this.nearest(list, x, z);
  }
}
