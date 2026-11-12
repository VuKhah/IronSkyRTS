/** Kỹ năng của binh chủng: rải thảm, pháo phóng loạt, tổng động viên. */
import { canStrike, RULES, UNITS, valueOf, type Side, type WeaponSpec } from "../content";
import { dist2 } from "../fmath";
import type { Building, Unit } from "../types";
import { TICK_RATE, sec, AIRBORNE_ALT, SHOT_SPEED, APPROACH_DIRS, AIM_COS } from "./shared";
import { World } from "./core";


// ------------------------------------------------------------------ kỹ năng của binh chủng: rải thảm, tổng động viên

/** null = ra lệnh rải thảm được; ngược lại là lý do (tiếng Việt) để giao diện hiện cho người chơi. */
function strikeError(this: World, side: Side, ids: readonly number[], x: number, z: number): string | null {
  if (!this.ownUnits(side, ids).some((u) => canStrike(u.kind))) return "Cần Xe Tên Lửa Loạt (đúc ở Xưởng Xe Chuyên Dụng)";
  if (!this.map.fits(x, z, 0, 0)) return "Ngoài bản đồ";
  return null;
}

/** Lệnh rải thảm: mỗi xe rải thảm được trong `ids` nhận điểm bắn (xe khác trong nhóm bỏ qua lệnh này). */
function orderStrike(this: World, side: Side, ids: readonly number[], x: number, z: number): void {
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
function strikeApproach(this: World, u: Unit, w: WeaponSpec, range: number): boolean {
  const dx = u.x - u.tx;
  const dz = u.z - u.tz;
  const d = Math.sqrt(dx * dx + dz * dz);
  const min = w.minRange ?? 0;
  const want = d > range ? Math.max(range - 2, (range + min) / 2) : min + 3;
  const ux = d > 1e-6 ? dx / d : 1;
  const uz = d > 1e-6 ? dz / d : 0;
  // thử hướng lùi thẳng trước, rồi lệch dần ±22,5°, ±45°…: chỗ đứng phải vừa thân xe (sát vách thì clearGoal dời ra) mà
  // vẫn nằm trong [tầm tối thiểu, tầm]; hướng xoay theo cùng một góc nên hai phe soi gương vẫn chọn đối xứng
  for (const [c, s] of APPROACH_DIRS) {
    const vx = ux * c - uz * s;
    const vz = uz * c + ux * s;
    const f = this.grid.nearestFree(u.tx + vx * want, u.tz + vz * want, 8);
    if (!f) continue;
    const [gx, gz] = this.clearGoal(u, f[0], f[1]);
    const g2 = dist2(gx, gz, u.tx, u.tz);
    if (g2 < min * min || g2 > range * range) continue;
    if (this.setPath(u, gx, gz)) return true;
  }
  return false;
}

/**
 * Rải thảm vào một điểm trên mặt đất: không cần mục tiêu, không cần nhìn thấy điểm bắn; mỗi quả rơi lệch ngẫu nhiên
 * (RNG có seed) trong vòng `scatter` quanh điểm. Vẫn theo luật chung của vũ khí: dựng dàn xong mới bắn, nhịp loạt, hào quang.
 * Người gọi đã kiểm tầm và tầm tối thiểu.
 */
function tryFireGround(this: World, u: Unit, w: WeaponSpec, x: number, z: number): boolean {
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
function salvoStart(this: World, src: Unit | Building, w: WeaponSpec, tx: number, tz: number): void {
  if (!w.scatter || !w.burst || src.burst > 0 || src.cat !== "unit") return;
  this.sides[src.side].stats.salvos++;
  this.events.push({ t: "salvo", id: src.id, side: src.side, x: src.x, z: src.z, tx, tz });
}

/** Tổng giá trị quân địch mặt đất (phe `side` đang thấy) trong bán kính r quanh (x, z): vũ khí tản nhắm vào chỗ đông nhất. */
function clusterValue(this: World, side: Side, x: number, z: number, r: number): number {
  let v = 0;
  for (const e of this.units) {
    if (e.side === side || e.hp <= 0 || e.alt > AIRBORNE_ALT || World.sheltered(e)) continue;
    if (dist2(x, z, e.x, e.z) <= r * r && this.visibleTo(side, e)) v += valueOf(e.kind);
  }
  return v;
}

/** null = Tổng động viên được; ngược lại là lý do. */
function mobilizeError(this: World, side: Side): string | null {
  const c = this.commanders[side];
  if (!c || c.hp <= 0) return "Cần Xe Tư Lệnh";
  const st = this.sides[side];
  if (this.tick < st.mobilizeReady) return `Còn ${Math.ceil((st.mobilizeReady - this.tick) / TICK_RATE)} giây`;
  return null;
}

function mobilize(this: World, side: Side): void {
  if (this.mobilizeError(side)) return;
  const M = RULES.abilities.mobilize;
  const st = this.sides[side];
  st.mobilizeUntil = this.tick + sec(M.duration);
  st.mobilizeReady = this.tick + sec(M.cooldown);
  const c = this.commanders[side]!;
  this.events.push({ t: "mobilize", side, x: c.x, z: c.z, r: UNITS.commander.aura!.radius });
}

const methods = { strikeError, orderStrike, strikeApproach, tryFireGround, salvoStart, clusterValue, mobilizeError, mobilize };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
