/** Tác chiến mặt đất: tầm, tìm mục tiêu, nhắm, bắn, đạn bay, sát thương, cấp bậc. */
import { BUILDINGS, RULES, UNITS, valueOf, type Side, type WeaponSpec } from "../content";
import { clamp, dist2, turnToward } from "../fmath";
import { MAX_TIER, TERRAIN } from "../maps";
import type { Building, Shot, Target, Unit } from "../types";
import { TICK_RATE, DT, sec, AIRBORNE_ALT, SHOT_SPEED, IDLE_ACQUIRE_BONUS, LEASH, ALIGNED_COS, TMP, traverseStep, AIM_COS, MISSILE_PYLON, BARREL_GAP, BOMB_FALL, cosDeg, dirToCenter } from "./shared";
import { World } from "./core";


function inRange(this: World, x: number, z: number, w: WeaponSpec, t: Target, range = w.range): boolean {
  const reach = range + this.radiusOf(t) * (t.cat === "building" ? 1 : 0.5);
  const d2 = dist2(x, z, t.x, t.z);
  if (w.minRange && d2 < w.minRange * w.minRange) return false;
  return d2 <= reach * reach;
}

/** Đã triển khai xong (Lockdown) chưa: đứng yên đủ lâu. */
function deployed(this: World, src: Unit | Building, w: WeaponSpec): boolean {
  return !!w.deploy && src.cat === "unit" && src.still >= sec(w.deploy.time);
}

/** Tầm bắn thực tế: cộng thêm khi đã triển khai, và khi đứng trên cao (quân mặt đất, công trình; Pháo được nhân `heightBonus`). */
function reach(this: World, src: Unit | Building, w: WeaponSpec): number {
  let r = this.deployed(src, w) ? w.range * (1 + w.deploy!.range) : w.range;
  if (src.cat === "building" || src.air === "none") {
    const T = RULES.terrain;
    const k = w.heightBonus ?? 1;
    r *= 1 + clamp(this.groundTier(src.x, src.z) * T.rangePerTier * k, 0, T.rangeMax * k);
  }
  return r;
}

/** Tầng mặt đất (0..MAX_TIER) tại ô chứa điểm (x, z); dốc tính theo tầng chân dốc. */
function groundTier(this: World, x: number, z: number): number {
  return Math.min(this.map.tierAt(x, z), MAX_TIER);
}

/** Tầm nhìn thực tế: đứng cao nhìn xa hơn, đứng trong rừng / tuyết nhìn gần hơn (không áp cho máy bay). */
function sightOf(this: World, base: number, x: number, z: number, air: boolean): number {
  if (air) return base;
  const T = RULES.terrain;
  return base * (1 + clamp(this.groundTier(x, z) * T.sightPerTier, 0, T.sightMax)) * TERRAIN[this.grid.kindAt(x, z)].sight;
}

/**
 * Chọn mục tiêu: giữ mục tiêu cũ nếu còn hợp lệ (kể cả ô tường được ra lệnh đánh), nếu không thì chọn gần nhất (ưu tiên
 * quân có vũ khí, rồi mới tới công trình; không tự chọn ô tường).
 */
function acquireFrom(this: World, self: Target, side: Side, x: number, z: number, w: WeaponSpec, range: number, current: number): Target | null {
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
    // tường không tự bắn: nó không bắn ai, tự nhắm vào thì quân tấn công-di chuyển dừng bắn từng ô (giáp Công sự, rất lâu)
    // dù lối đã mở; muốn phá tường thì ra lệnh tấn công thẳng vào ô đó (AI: `breach`)
    if (b.side === side || b.hp <= 0 || BUILDINGS[b.kind].tile || !this.canHit(w, b)) continue;
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

function acquire(this: World, u: Unit, w: WeaponSpec, range: number): Target | null {
  const t = this.acquireFrom(u, u.side, u.x, u.z, w, range, u.autoTarget);
  u.autoTarget = t ? t.id : 0;
  return t;
}

function updateGround(this: World, u: Unit): void {
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
function aim(this: World, src: Unit | Building, w: WeaponSpec, tx: number | null, tz: number): void {
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

function rechargePd(this: World, u: Unit): void {
  const pd = UNITS[u.kind].pointDefense;
  if (!pd || u.pd >= pd.charges) return;
  if (++u.pdT >= sec(pd.recharge)) {
    u.pd++;
    u.pdT = 0;
  }
}

/** Điểm ngẫu nhiên (có seed) trong hình tròn đơn vị: lấy mẫu loại bỏ, không dùng lượng giác. */
function randDisc(this: World): [number, number] {
  for (let i = 0; i < 16; i++) {
    const x = this.rng.next() * 2 - 1;
    const z = this.rng.next() * 2 - 1;
    if (x * x + z * z <= 1) return [x, z];
  }
  return [0, 0];
}

/** Nhịp bắn: hết loạt thì nạp lại `cooldown`, đang giữa loạt thì chờ `burst.interval`. */
function nextCooldown(this: World, src: Unit | Building, w: WeaponSpec): number {
  if (!w.burst) return w.cooldown;
  if (src.burst <= 0) src.burst = w.burst.shots;
  src.burst--;
  if (src.burst <= 0) return w.cooldown;
  if (!w.burst.even) return w.burst.interval;
  // nhịp lẻ so với tick: quả thứ k bắn ở tick round(k × interval), cả loạt đi đúng tổng thời gian mong muốn
  const k = w.burst.shots - src.burst;
  return (Math.round(k * w.burst.interval * TICK_RATE) - Math.round((k - 1) * w.burst.interval * TICK_RATE)) / TICK_RATE;
}

function auraFactor(this: World, u: Unit): number {
  const c = this.commanders[u.side];
  if (!c || c.hp <= 0) return 1;
  const aura = UNITS.commander.aura!;
  const near = c === u || dist2(u.x, u.z, c.x, c.z) <= aura.radius * aura.radius;
  let k = near && c !== u ? aura.fireRate : 1;
  if (near && this.sides[u.side].mobilizeUntil > this.tick) k *= 1 + RULES.abilities.mobilize.fireRate;
  return k;
}

/** Quân đang được Tổng động viên (trong bán kính hào quang của Xe Tư Lệnh khi kỹ năng còn hiệu lực). */
function mobilized(this: World, u: Unit): boolean {
  if (this.sides[u.side].mobilizeUntil <= this.tick) return false;
  const c = this.commanders[u.side];
  if (!c || c.hp <= 0) return false;
  const r = UNITS.commander.aura!.radius;
  return c === u || dist2(u.x, u.z, c.x, c.z) <= r * r;
}

function tryFire(this: World, src: Unit | Building, w: WeaponSpec, t: Target): boolean {
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

function pushShot(this: World, src: Unit | Building, w: WeaponSpec, target: number, tx: number, tz: number, talt: number, dmg: number, air: boolean, ticks: number, ox = 0, oz = 0): void {
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
function fireSecondary(this: World, u: Unit, w: WeaponSpec & { ammo: number }, t: Target, d: number): void {
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
function dropBomb(this: World, u: Unit, w: WeaponSpec): void {
  if (this.sandbox?.hold[u.side]) return;
  const lead = u.speed * BOMB_FALL;
  const tx = u.x + u.hx * lead;
  const tz = u.z + u.hz * lead;
  u.cooldown = Math.max(1, Math.round(this.nextCooldown(u, w) * TICK_RATE));
  u.lastShot = this.tick;
  this.pushShot(u, w, 0, tx, tz, 0, w.dmgGround, false, sec(BOMB_FALL));
}

/** Sát thương gốc nhân hệ số Giáp × Đạn (RULES.damageMatrix). Không rẽ nhánh theo tên quân: mọi thứ là dữ liệu. */
function damage(this: World, e: Target, s: Shot): void {
  if (e.hp <= 0) return;
  const by = s.side;
  let amount = s.dmg;
  // Drone Khiên phe bị bắn có vùng trùm lên chỗ này: đang bật thì hứng trước (theo sát thương danh nghĩa, chưa tính giáp),
  // hết năng lượng thì phần dư lọt qua; đang tắt thì cộng vào mức nguy hiểm (đủ lớn mới bật: một phát lẻ không câu được khiên)
  if (this.shields.length && by !== e.side) {
    for (const d of this.shields) {
      if (d.side !== e.side || d.hp <= 0) continue;
      const S = UNITS[d.kind].shield!;
      if (dist2(d.x, d.z, e.x, e.z) > S.radius * S.radius) continue;
      if (!d.shieldOn) {
        d.threat += amount;
        continue;
      }
      const take = Math.min(amount, d.fuel / S.perDmg);
      d.fuel -= take * S.perDmg;
      d.shieldIdle = 0;
      amount -= take;
      this.events.push({ t: "hit", side: e.side, visual: "pulse", x: e.x, z: e.z, alt: (e.cat === "unit" ? e.alt : 0) + 2, splash: 0 });
      if (d.fuel <= 1e-9) this.shieldOff(d);
      if (amount <= 1e-9) return;
    }
  }
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

/**
 * Xe Tư Lệnh tự rút khi máu thấp (`RULES.commanderRetreat`): mất xe là thua trận, nên "bộ phận hậu cần" tự kéo xe về sau
 * Tổng Hành Dinh khi xe đang bị bắn mà máu tụt qua một mốc. Chỉ ra lệnh một lần mỗi mốc: người chơi muốn đưa xe ra lại
 * thì xe nghe theo, không bị giành quyền lái mỗi tick.
 */
function commanderRetreat(this: World): void {
  const R = RULES.commanderRetreat;
  for (const side of [0, 1] as Side[]) {
    const c = this.commanders[side];
    const st = this.sides[side];
    if (!c || c.hp <= 0) continue;
    const frac = c.hp / c.maxHp;
    // hồi máu qua mốc + rearm: mốc đó dùng lại được
    while (st.retreatLevel > 0 && frac > R.at[st.retreatLevel - 1] + R.rearm) st.retreatLevel--;
    if (st.retreatLevel >= R.at.length || frac >= R.at[st.retreatLevel]) continue;
    if (this.tick - c.lastHit > R.hitWithin * TICK_RATE) continue;
    while (st.retreatLevel < R.at.length && frac < R.at[st.retreatLevel]) st.retreatLevel++;
    // chỗ rút: sau Tổng Hành Dinh (phía xa giữa bản đồ); mất nhà rồi thì về góc căn cứ ban đầu
    const hq = this.hqOf(side);
    const [hx, hz] = hq ? [hq.x, hq.z] : this.map.bases[side];
    const [dx, dz] = dirToCenter(hx, hz);
    const back = hq ? Math.max(...this.blockHalf("hq", hq.rot)) + R.back : 0;
    const x = hx - dx * back;
    const z = hz - dz * back;
    if (dist2(c.x, c.z, hx, hz) < R.home * R.home) continue;
    this.orderMove(side, [c.id], x, z, "move");
    this.events.push({ t: "retreat", side, x, z });
  }
}

/** Cựu binh: cộng kinh nghiệm cho xe đã bắn (nếu còn sống), lên cấp khi đủ ngưỡng. */
function gainXp(this: World, srcId: number, xp: number): void {
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
function veteranRegen(this: World): void {
  const V = RULES.veterancy;
  const delay = sec(V.regenDelay);
  for (const u of this.units)
    if (u.rank >= V.regenRank && u.hp > 0 && u.hp < u.maxHp && this.tick - u.lastHit >= delay) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * V.regenPerSec * DT);
}

function resolveShots(this: World): void {
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
        if (u.side === s.side || u.hp <= 0 || (u.alt > AIRBORNE_ALT) !== s.hitAir || World.sheltered(u)) continue;
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

const methods = { inRange, deployed, reach, groundTier, sightOf, acquireFrom, acquire, updateGround, aim, rechargePd, randDisc, nextCooldown, auraFactor, mobilized, tryFire, pushShot, fireSecondary, dropBomb, damage, commanderRetreat, gainXp, veteranRegen, resolveShots };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
