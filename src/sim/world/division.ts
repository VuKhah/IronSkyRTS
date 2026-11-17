/**
 * SƯ ĐOÀN BỀN VỮNG (A2 bước D1, thiết kế `Docs/plans/2026-11-17-A2-tuong-su-doan-thiet-ke.md`, người dùng duyệt 17/11/2026).
 *
 * `Squad` chỉ sống trong lúc hành quân và tan khi tới nơi; sau đó không còn ai "chỉ huy" các xe nữa (gốc của lỗi 8: bị đánh
 * sườn thì chỉ xe bị bắn bắn trả). Sư đoàn là lớp bền hơn đặt trên đó: nhớ quân, chế độ (tự chủ / trực tiếp), chỉ thị, và
 * chỗ đóng quân khi tới nơi. Bước D1 chỉ dựng vòng đời; chưa luật nào đọc sư đoàn nên đường đi của xe giữ nguyên.
 *
 * Luật vòng đời:
 *  - lệnh đi / tấn công-di chuyển cho từ `DIV_MIN` xe mặt đất chiến đấu trở lên (không tính Xe Vận Tải) lập một sư đoàn;
 *    Drone Khiên đi cùng lệnh thì vào theo (nó bay theo quân mặt đất), drone khác và máy bay thì không;
 *  - lệnh mới cho cả sư đoàn (hoặc sư đoàn cộng thêm xe) giữ nguyên sư đoàn đó: cùng mã, cùng chế độ;
 *  - lệnh riêng cho một phần sư đoàn: phần đó rời sư đoàn;
 *  - sư đoàn còn một xe mặt đất thì tan (ngưỡng 3 chỉ áp khi lập: đang đánh mất xe còn 2 thì vẫn giữ tướng);
 *  - mọi xe mặt đất đã đứng (hết đội hình hành quân) thì sư đoàn đóng quân: ghi tâm, hướng mặt, ô từng xe.
 */
import { RULES, UNITS, type Side } from "../content";
import { assignMin } from "../assign";
import { dist2 } from "../fmath";
import type { Division, Unit } from "../types";
import { bodyRadius, sec } from "./shared";
import { World } from "./core";

/** Số xe mặt đất tối thiểu để lập sư đoàn (người dùng chốt 17/11/2026). */
export const DIV_MIN = 3;
/** Vùng phản công quanh tâm sư đoàn lúc đóng quân (m, số tạm người dùng duyệt 17/11/2026). */
export const DIV_ZONE = 20;
/** Hết báo động sau chừng này không thấy địch gần / không bị bắn. */
const ALARM_HOLD = sec(6);
/** Địch lệch hướng mặt sư đoàn quá 60° (cos 60° = 0,5) thì cả sư đoàn xoay; xoay xong chờ PIVOT_COOL mới xoay tiếp. */
const PIVOT_COS = 0.5;
const PIVOT_COOL = sec(3);
/** Sau khi xoay, xe đi về ô mới (vừa đi vừa bắn, không dừng lại đánh) tối đa chừng này. */
const REFORM_MAX = sec(10);
/** Quân đã hạ bệ mà ô mới cách chỗ đứng không quá chừng này (m) thì đứng nguyên, chỉ quay mâm (người dùng chốt 17/11/2026). */
const DEPLOY_STAY = 10;

/** Xe được tính là quân mặt đất của sư đoàn. */
function isDivGround(u: Unit): boolean {
  return u.air === "none" && u.kind !== "hauler";
}

/** Drone Khiên: đi theo sư đoàn mặt đất nên thuộc sư đoàn, nhưng không tính vào ngưỡng và không có ô mặt đất. */
function isDivEscort(u: Unit): boolean {
  return u.air !== "none" && !!UNITS[u.kind].shield;
}

function divisionById(this: World, id: number): Division | undefined {
  if (!id) return undefined;
  for (const d of this.divisions) if (d.id === id) return d;
  return undefined;
}

function divGroundCount(this: World, d: Division): number {
  let n = 0;
  for (const id of d.ids) {
    const u = this.byId.get(id);
    if (u && u.cat === "unit" && isDivGround(u)) n++;
  }
  return n;
}

/** Tan sư đoàn: mọi xe thành xe lẻ. Dọn khỏi danh sách ở `updateDivisions`. */
function dissolveDivision(this: World, d: Division): void {
  for (const id of d.ids) {
    const u = this.byId.get(id);
    if (u && u.cat === "unit" && u.division === d.id) u.division = 0;
  }
  d.ids = [];
}

function leaveDivision(this: World, u: Unit): void {
  const d = this.divisionById(u.division);
  u.division = 0;
  if (!d) return;
  const i = d.ids.indexOf(u.id);
  if (i >= 0) d.ids.splice(i, 1);
  delete d.homeX[u.id];
  delete d.homeZ[u.id];
  if (this.divGroundCount(d) <= 1) this.dissolveDivision(d);
}

/**
 * Lệnh đi / tấn công-di chuyển: lập (hoặc giữ) sư đoàn cho nhóm xe được lệnh. Gọi từ `orderMove`.
 * Xe trong lệnh mà không vào sư đoàn mới (nhóm dưới 3 xe, Xe Vận Tải, máy bay) thì rời sư đoàn cũ.
 */
function formDivision(this: World, side: Side, units: readonly Unit[], kind: "move" | "amove"): void {
  const ground = units.filter(isDivGround);
  const members = ground.length >= DIV_MIN ? units.filter((u) => isDivGround(u) || isDivEscort(u)) : [];
  const inNew = new Set(members.map((u) => u.id));
  for (const u of units) if (u.division && !inNew.has(u.id)) this.leaveDivision(u);
  if (!members.length) return;
  // giữ sư đoàn cũ lớn nhất mà mọi xe của nó đều có trong lệnh (cùng cỡ thì sư đoàn lập trước: thứ tự mảng, tất định)
  let keep: Division | null = null;
  for (const d of this.divisions)
    if (d.side === side && d.ids.length && d.ids.every((id) => inNew.has(id)) && (!keep || d.ids.length > keep.ids.length)) keep = d;
  // sư đoàn mới ghép từ nhiều nguồn: theo chế độ của phần đông xe mặt đất (hòa thì tự chủ)
  let direct = 0;
  for (const u of ground) if (this.divisionById(u.division)?.mode === "direct") direct++;
  const mode = keep ? keep.mode : direct * 2 > ground.length ? "direct" : "auto";
  for (const u of members) if (u.division && u.division !== keep?.id) this.leaveDivision(u);
  let d = keep;
  if (!d) {
    d = {
      id: this.nextDivId++,
      side,
      ids: [],
      mode,
      directive: kind,
      cx: 0,
      cz: 0,
      hx: 0,
      hz: 1,
      homeX: {},
      homeZ: {},
      alarm: "none",
      alarmUntil: 0,
      threatX: 0,
      threatZ: 0,
      fx: 0,
      fz: 1,
      pivotAt: 0,
      reformUntil: 0,
      reach: 0
    };
    this.divisions.push(d);
  }
  d.ids = members.map((u) => u.id);
  d.mode = mode;
  d.directive = kind;
  d.homeX = {};
  d.homeZ = {};
  d.alarm = "none";
  d.reformUntil = 0;
  for (const u of members) u.division = d.id;
}

/**
 * Lệnh khác có danh sách xe (tấn công, dừng, khai thác, trục vớt, về căn cứ): lệnh cho cả sư đoàn thì sư đoàn còn nguyên;
 * lệnh cho một phần thì phần đó rời sư đoàn (Tư lệnh tách xe ra dùng riêng).
 */
function divisionOrder(this: World, side: Side, ids: readonly number[]): void {
  const units = this.ownUnits(side, ids);
  const inOrder = new Set(units.map((u) => u.id));
  for (const u of units) {
    const d = this.divisionById(u.division);
    if (d && !d.ids.every((id) => inOrder.has(id))) this.leaveDivision(u);
  }
}

/** Ghi chỗ đóng quân: tâm, hướng mặt chung, ô của từng xe là chỗ nó đang đứng. */
function stationDivision(this: World, d: Division): void {
  let n = 0;
  let cx = 0;
  let cz = 0;
  let fx = 0;
  let fz = 0;
  let bx = 0;
  let bz = 0;
  d.homeX = {};
  d.homeZ = {};
  for (const id of d.ids) {
    const u = this.byId.get(id) as Unit;
    d.homeX[id] = u.x;
    d.homeZ[id] = u.z;
    if (!isDivGround(u)) continue;
    n++;
    cx += u.x;
    cz += u.z;
    fx += u.faceX;
    fz += u.faceZ;
    bx += u.hx;
    bz += u.hz;
  }
  d.cx = cx / n;
  d.cz = cz / n;
  // hướng đội: hướng mặt `disbandSquad` đặt cho từng xe; không có thì hướng thân trung bình
  let l = Math.sqrt(fx * fx + fz * fz);
  if (l < 1e-6) {
    fx = bx;
    fz = bz;
    l = Math.sqrt(fx * fx + fz * fz);
  }
  if (l < 1e-6) {
    fx = 0;
    fz = 1;
    l = 1;
  }
  d.hx = fx / l;
  d.hz = fz / l;
  d.fx = d.hx;
  d.fz = d.hz;
  d.directive = "station";
  // tầm với: vùng phản công + tầm bắn trực tiếp xa nhất (vũ khí không có tầm tối thiểu: không tính Pháo, Tên Lửa Loạt)
  let direct = 0;
  for (const id of d.ids) {
    const w = UNITS[(this.byId.get(id) as Unit).kind].weapon;
    if (w && !w.minRange && w.dmgGround > 0) direct = Math.max(direct, w.range);
  }
  d.reach = DIV_ZONE + direct;
}

/**
 * BỘ NÃO TƯỚNG (D3): báo động và quay mặt. Chỉ khi tự chủ và đang đóng quân (đang đi thì `Squad` lo: tấn công-di chuyển đã
 * dừng lại bắn, lệnh đi thì không dừng). Chỉ dùng thông tin phe mình thấy (`visibleTo`, luật bắt buộc số 2).
 */
function divisionBrain(this: World, d: Division): void {
  if (d.mode !== "auto" || d.directive !== "station") return;
  const tick = this.tick;
  const ground: Unit[] = [];
  let cx = 0;
  let cz = 0;
  let far = 0;
  for (const id of d.ids) {
    const u = this.byId.get(id) as Unit;
    if (!isDivGround(u)) continue;
    ground.push(u);
    cx += u.x;
    cz += u.z;
    const w = UNITS[u.kind].weapon;
    if (w && w.dmgGround > 0) far = Math.max(far, this.reach(u, w));
  }
  cx /= ground.length;
  cz /= ground.length;
  // bị bắn trong tick vừa rồi: biết đạn tới từ đâu
  let hit = false;
  let sx = 0;
  let sz = 0;
  let k = 0;
  for (const u of ground) {
    if (u.lastHit !== tick - 1) continue;
    hit = true;
    if (dist2(u.hitX, u.hitZ, cx, cz) <= d.reach * d.reach) {
      sx += 2 * u.hitX;
      sz += 2 * u.hitZ;
      k += 2;
    }
  }
  // quét địch mỗi 3 tick, lệch pha theo mã sư đoàn (không dồn mọi sư đoàn vào một tick)
  let seenFar = false;
  if ((tick + d.id) % 3 === 0) {
    for (const e of this.units) {
      if (e.side === d.side || e.hp <= 0 || e.air !== "none") continue;
      const d2 = dist2(e.x, e.z, cx, cz);
      if (d2 > far * far && d2 > d.reach * d.reach) continue;
      if (!this.visibleTo(d.side, e)) continue;
      if (d2 <= d.reach * d.reach) {
        sx += e.x;
        sz += e.z;
        k++;
      } else seenFar = true;
    }
  }
  if (k > 0) {
    d.alarm = "near";
    d.alarmUntil = tick + ALARM_HOLD;
    d.threatX = sx / k;
    d.threatZ = sz / k;
  } else if ((hit || seenFar) && d.alarm !== "near") {
    d.alarm = "far";
    d.alarmUntil = tick + ALARM_HOLD;
  }
  if (d.alarm !== "none" && tick >= d.alarmUntil) {
    const was = d.alarm;
    d.alarm = "none";
    // hết báo động: đội hình về hướng cũ, mọi xe về đúng ô cũ (kể cả xe chỉ tiến lên đánh trong vùng, chưa xoay)
    if (was === "near") {
      for (const u of ground) u.divTarget = 0;
      this.divisionFace(d, d.hx, d.hz);
    }
    return;
  }
  if (d.alarm === "near" && (tick + d.id) % 3 === 0) this.divisionTargets(d, ground);
  if (d.alarm !== "near" || tick < d.pivotAt) return;
  const ex = d.threatX - cx;
  const ez = d.threatZ - cz;
  const l = Math.sqrt(ex * ex + ez * ez);
  if (l < 1) return;
  const ux = ex / l;
  const uz = ez / l;
  if (ux * d.fx + uz * d.fz >= PIVOT_COS) return;
  this.divisionFace(d, ux, uz);
  d.pivotAt = tick + PIVOT_COOL;
}

/**
 * Xoay cả sư đoàn về hướng (fx, fz): xoay hình ô lúc đóng quân quanh tâm, rồi chia ô mới bằng phân công tối ưu (bình phương
 * quãng, chỉ đổi giữa xe cùng mã phân nhóm) để xe đi ít nhất và không cắt đường nhau. Giáp vẫn ra trước về phía địch vì ô của
 * hàng đầu xoay theo. Quân đã hạ bệ mà ô mới cách không quá DEPLOY_STAY thì đứng nguyên (quay mâm), xa hơn thì thu bệ đi theo.
 */
function divisionFace(this: World, d: Division, fx: number, fz: number): void {
  const c = d.hx * fx + d.hz * fz;
  const s = d.hx * fz - d.hz * fx;
  const ground: Unit[] = [];
  for (const id of d.ids) {
    const u = this.byId.get(id) as Unit;
    if (isDivGround(u) && d.homeX[id] !== undefined) ground.push(u);
  }
  const slots = ground.map((g): [number, number] => {
    const ox = d.homeX[g.id] - d.cx;
    const oz = d.homeZ[g.id] - d.cz;
    return [d.cx + c * ox - s * oz, d.cz + s * ox + c * oz];
  });
  const cost = slots.map(([px, pz], k) => ground.map((u) => (UNITS[u.kind].group === UNITS[ground[k].kind].group ? dist2(u.x, u.z, px, pz) : 1e9)));
  const a = assignMin(cost);
  for (let k = 0; k < slots.length; k++) {
    const u = ground[a[k]];
    let [px, pz] = slots[k];
    const r = bodyRadius(u.kind);
    if (this.grid.blockedAt(px, pz) || this.grid.clearanceAt(px, pz) < r * 0.95)
      [px, pz] = this.grid.nearestFree(px, pz, 6, (x, z) => this.grid.clearanceAt(x, z) >= r * 0.95) ?? [u.x, u.z];
    if (this.anchored(u) && dist2(u.x, u.z, px, pz) <= DEPLOY_STAY * DEPLOY_STAY) {
      px = u.x;
      pz = u.z;
    }
    u.tx = px;
    u.tz = pz;
    u.faceX = fx;
    u.faceZ = fz;
    u.path = [];
    u.pathI = 0;
  }
  d.fx = fx;
  d.fz = fz;
  d.reformUntil = this.tick + REFORM_MAX;
}

/** Hỏa lực dồn vào một mục tiêu đủ hạ nó trong chừng này giây thì xe khác chọn mục tiêu kế (người dùng duyệt 17/11/2026). */
const KILL_WINDOW = 2;

/**
 * CÙNG BẮN (D4): giao mục tiêu cho từng xe theo thứ tự trong sư đoàn. Mục tiêu: địch thấy được trong tầm với của sư đoàn mà xe
 * bắn tới được (đã trong tầm, hoặc xe chạy được mà địch nằm trong vùng phản công + tầm bắn; quân cố định chỉ bắn trong tầm). Ưu
 * tiên (1) kẻ đang bắn sư đoàn, (2) mục tiêu đồng đội đang đánh mà chưa đủ hỏa lực (dồn hỏa lực), (3) gần nhất; mục tiêu đã đủ
 * hỏa lực hạ trong KILL_WINDOW giây thì chỉ chọn khi không còn gì khác (không bắn quá tay).
 */
function divisionTargets(this: World, d: Division, ground: readonly Unit[]): void {
  const member = new Set(d.ids);
  const foes: Unit[] = [];
  const lim = d.reach + 5;
  for (const e of this.units)
    if (e.side !== d.side && e.hp > 0 && dist2(e.x, e.z, d.cx, d.cz) <= lim * lim && this.visibleTo(d.side, e)) foes.push(e);
  const committed = new Map<number, number>();
  for (const m of ground) {
    m.divTarget = 0;
    const w = UNITS[m.kind].weapon;
    if (!w || !foes.length) continue;
    const r = this.reach(m, w);
    const fixed = !!w.deploy;
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const e of foes) {
      if (!this.canHit(w, e)) continue;
      const d2 = dist2(m.x, m.z, e.x, e.z);
      const rr = r + UNITS[e.kind].radius * 0.5;
      const inR = d2 <= rr * rr && (!w.minRange || d2 >= w.minRange * w.minRange);
      if (!inR && (fixed || dist2(e.x, e.z, d.cx, d.cz) > (DIV_ZONE + r) * (DIV_ZONE + r))) continue;
      const c = committed.get(e.id) ?? 0;
      const over = c >= e.hp;
      const shooting = member.has(e.autoTarget) || member.has(e.targetId);
      const score = d2 + (inR ? 0 : 2500) + (shooting ? -1e4 : 0) + (c > 0 && !over ? -5e3 : 0) + (over ? 1e7 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) continue;
    m.divTarget = best.id;
    const dmg = (best.air !== "none" ? w.dmgAir : w.dmgGround) * RULES.damageMatrix[UNITS[best.kind].armorClass][w.dmgType];
    committed.set(best.id, (committed.get(best.id) ?? 0) + (dmg / w.cooldown) * KILL_WINDOW);
  }
}

/** Mục tiêu tướng giao cho xe, nếu còn hợp lệ (sư đoàn tự chủ, đang báo động gần, địch còn sống và thấy được). */
function divisionTargetOf(this: World, u: Unit): Unit | null {
  if (!u.divTarget || !u.division) return null;
  const d = this.divisionById(u.division);
  if (!d || d.alarm !== "near" || d.mode !== "auto") return null;
  const e = this.byId.get(u.divTarget);
  const w = UNITS[u.kind].weapon;
  if (!e || e.cat !== "unit" || e.hp <= 0 || e.side === u.side || !w || !this.canHit(w, e) || !this.visibleTo(u.side, e)) return null;
  return e;
}

/** Xe còn trong vùng phản công của sư đoàn (được tiến lên đánh); ra tới mép thì dừng. */
function divisionInZone(this: World, u: Unit): boolean {
  const d = this.divisionById(u.division);
  const z = DIV_ZONE - 0.5;
  return !!d && dist2(u.x, u.z, d.cx, d.cz) < z * z;
}

/** Xe của sư đoàn đang đi về ô mới sau khi xoay (vừa đi vừa bắn). */
function divisionReform(this: World, u: Unit): boolean {
  const d = u.division ? this.divisionById(u.division) : undefined;
  return !!d && this.tick < d.reformUntil && dist2(u.x, u.z, u.tx, u.tz) > 1;
}

/** Sư đoàn của xe đang báo động gần (xe đứng bắn vẫn quay thân về hướng sư đoàn: giáp trước ra đón). */
function divisionAlert(this: World, u: Unit): boolean {
  return !!u.division && this.divisionById(u.division)?.alarm === "near";
}

/** Mỗi tick, sau `updateSquads`: dọn xe đã mất, tan sư đoàn còn một xe, đóng quân khi mọi xe mặt đất đã đứng. */
function updateDivisions(this: World): void {
  if (!this.divisions.length) return;
  for (const d of this.divisions) {
    if (!d.ids.length) continue;
    d.ids = d.ids.filter((id) => {
      const u = this.byId.get(id);
      return !!u && u.cat === "unit" && u.hp > 0 && u.division === d.id;
    });
    if (this.divGroundCount(d) <= 1) {
      this.dissolveDivision(d);
      continue;
    }
    if (d.directive !== "station") {
      let settled = true;
      for (const id of d.ids) {
        const u = this.byId.get(id) as Unit;
        if (isDivGround(u) && (u.order !== "idle" || u.squad !== 0)) {
          settled = false;
          break;
        }
      }
      if (settled) this.stationDivision(d);
    }
    this.divisionBrain(d);
    // Drone Khiên bay theo tâm quân mặt đất của sư đoàn (mỗi giây, lệch pha theo mã)
    if ((this.tick + d.id) % 10 === 0) this.divisionEscort(d);
  }
  this.divisions = this.divisions.filter((d) => d.ids.length > 0);
}

function divisionEscort(this: World, d: Division): void {
  let n = 0;
  let cx = 0;
  let cz = 0;
  for (const id of d.ids) {
    const u = this.byId.get(id) as Unit;
    if (!isDivGround(u)) continue;
    n++;
    cx += u.x;
    cz += u.z;
  }
  cx /= n;
  cz /= n;
  for (const id of d.ids) {
    const u = this.byId.get(id) as Unit;
    if (!isDivEscort(u) || u.rtb || (u.mission !== "none" && u.mission !== "move")) continue;
    if (dist2(u.x, u.z, cx, cz) <= 16 && u.mission === "none") continue;
    u.mission = "move";
    u.mx = cx;
    u.mz = cz;
  }
}

const methods = { divisionTargets, divisionTargetOf, divisionInZone, divisionBrain, divisionFace, divisionReform, divisionAlert, divisionEscort, divisionById, divGroundCount, dissolveDivision, leaveDivision, formDivision, divisionOrder, stationDivision, updateDivisions };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
