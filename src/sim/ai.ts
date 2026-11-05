/**
 * AI Tư Lệnh (1 độ khó).
 *
 * Luật công bằng: AI chỉ tạo LỆNH (giống người chơi bấm nút) và chỉ đọc những gì phe nó được thấy:
 * quân mình, công trình mình, quân địch đang trong tầm nhìn, công trình địch đã từng phát hiện,
 * chủ sở hữu các mỏ (thông tin công khai trên HUD) và vị trí 2 Tổng Hành Dinh (bản đồ cố định).
 * AI chạy bên trong vòng tick nên cũng phải tất định: không Math.random, không thời gian thật.
 */
import { BUILDINGS, UNITS, valueOf, type BuildingId, type Side, type UnitId } from "./content";
import { dcos, dist2, dsin, Rng, TAU } from "./fmath";
import type { Building, Mine, Order, Unit, Uplink } from "./types";
import { dirToCenter, sec, type World } from "./world";

const DIRS: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, i) => [dcos((i * TAU) / 16), dsin((i * TAU) / 16)] as const);

export class Ai {
  private wave = 0;
  private lastWave = -10000;
  private waveIds = new Set<number>();
  private capIds = new Set<number>();
  private waveTarget: [number, number] | null = null;
  private seenAir = 0;
  /** Mỗi AI có bộ số ngẫu nhiên riêng theo seed trận: tất định nhưng mỗi trận một khác. */
  private rng: Rng;
  private waveBonus = 0;
  private capChoice = 0;

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
    for (const f of myB) {
      if (f.kind !== "factory" || !f.built || f.queue.length >= 2) continue;
      const k = this.pickGround(mine, oil);
      const c = UNITS[k].cost!;
      if (iron - reserve >= c.iron && oil >= c.oil) {
        out.push({ t: "produce", building: f.id, kind: k });
        iron -= c.iron;
        oil -= c.oil;
      }
    }
    for (const a of myB) {
      if (a.kind !== "airfield" || !a.built || a.queue.length > 0 || !a.pads.includes(0)) continue;
      const c = UNITS.falcon.cost!;
      if (iron - reserve >= c.iron && oil >= c.oil + 60) {
        out.push({ t: "produce", building: a.id, kind: "falcon" });
        iron -= c.iron;
        oil -= c.oil;
      }
    }

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
      out.push({ t: "amove", ids: free.map((u) => u.id), x: t[0], z: t[1] });
      this.wave++;
      this.waveBonus = this.rng.int(3);
      this.lastWave = w.tick;
      this.waveTarget = t;
    }
    const waveIdle = army.filter((u) => this.waveIds.has(u.id) && !busy.has(u.id) && u.order === "idle");
    if (waveIdle.length && w.tick % sec(3) < 5) {
      const t = this.attackTarget(w, base, enemyBuildings);
      this.waveTarget = t;
      out.push({ t: "amove", ids: waveIdle.map((u) => u.id), x: t[0], z: t[1] });
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
    if (myB.some((b) => !b.built)) return null;
    const count = (k: BuildingId): number => myB.filter((b) => b.kind === k).length;
    const t = w.tick;
    const st = w.sides[this.side];
    // Điện: thiếu thì xây Nhà Máy Điện trước (nếu còn Dầu để đốt)
    const canPower = st.oil > 60;
    if (st.eff < 1 && canPower) return "power-plant";
    if (count("battery") === 0 && count("power-plant") > 0 && t > sec(240) && st.iron > 300) return "battery";
    let want: BuildingId | null = null;
    const turrets = count("turret");
    if (count("factory") === 0) want = "factory";
    else if (count("airfield") === 0 && t > sec(70)) want = "airfield";
    else if (t > sec(110) && turrets < Math.min(3, 1 + Math.floor(t / sec(200)))) want = "turret";
    else if (count("factory") < 2 && t > sec(280) && st.iron > 450) want = "factory";
    else if (count("radar") === 0 && t > sec(300) && st.iron > 350) want = "radar";
    else if (count("airfield") < 2 && t > sec(420) && st.oil > 250) want = "airfield";
    else if (turrets < 5 && t > sec(480) && st.iron > 700) want = "turret";
    if (!want) return null;
    const draw = -Math.min(0, BUILDINGS[want].power);
    if (draw > 0 && st.powerUse + st.powerPending + draw > st.powerCap && canPower) return "power-plant";
    return want;
  }

  /** Tìm chỗ đặt công trình quanh căn cứ: công trình chiến đấu hướng ra sông, Sân Đáp lùi về sau. */
  private findSpot(w: World, kind: BuildingId, base: Building): [number, number] | null {
    const [cx, cz] = dirToCenter(base.x, base.z);
    const back = kind === "airfield" || kind === "power-plant" || kind === "radar" || kind === "battery";
    const cands: { x: number; z: number; score: number }[] = [];
    for (const r of [13, 17, 21, 25, 29]) {
      for (const [dx, dz] of DIRS) {
        const dot = dx * cx + dz * cz;
        const score = r + (back ? dot * 10 : -dot * 10);
        cands.push({ x: Math.round(base.x + dx * r), z: Math.round(base.z + dz * r), score });
      }
    }
    cands.sort((a, b) => a.score - b.score || a.x - b.x || a.z - b.z);
    for (const c of cands) if (w.canPlace(this.side, kind, c.x, c.z) === null) return [c.x, c.z];
    return null;
  }

  private pickGround(mine: Unit[], oil: number): UnitId {
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
    // Xe Tên Lửa Loạt: khoảng 1 chiếc cho mỗi 4 xe chiến đấu, chỉ khi còn dư Dầu (giữ Dầu cho máy bay, nhà máy điện)
    if (r < 0.4 && n("rocket") * 4 < lynx + titan && oil >= UNITS.rocket.cost!.oil + 80) return "rocket";
    if (titan <= lynx) return "titan";
    if (sky * 4 < lynx + titan) return "skyguard";
    return "lynx";
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

  private attackTarget(w: World, base: Building, known: Building[]): [number, number] {
    const b = this.nearest(known, base.x, base.z);
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
