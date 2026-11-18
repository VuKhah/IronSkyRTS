/** Không quân và drone: sân bay, nhiên liệu, pin, bay, bổ nhào, Drone Khiên, sửa chữa, cảm tử. */
import { BUILDINGS, PAD_OFFSETS, RULES, UNITS, type Side, type UnitSpec } from "../content";
import { clamp, dcos, DEG, dist2, dsin, turnToward } from "../fmath";
import type { Building, Target, Unit } from "../types";
import { TICK_RATE, DT, sec, AIRBORNE_ALT, STEER_SOFT_COS, STEER_SOFT_SIN, STEER_RAMP, BOMB_FALL, cosDeg, TMP, traverseStep } from "./shared";
import { World } from "./core";
import { TIER_H } from "../maps";


// ------------------------------------------------------------------ không quân

function padPosOf(this: World, u: Unit): [number, number] | null {
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
function nearestFreePad(this: World, side: Side, x: number, z: number): { b: Building; i: number } | null {
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
function freePads(this: World, side: Side): number {
  let n = 0;
  for (const b of this.buildings) if (b.side === side && b.kind === "airfield" && b.built && b.hp > 0) for (const p of b.pads) if (p === 0) n++;
  return n;
}

function hasFreePad(this: World, side: Side): boolean {
  return this.nearestFreePad(side, 0, 0) !== null;
}

function ensurePad(this: World, u: Unit): [number, number] | null {
  const p = this.padPosOf(u);
  if (p) return p;
  const slot = this.nearestFreePad(u.side, u.x, u.z);
  if (!slot) return null;
  slot.b.pads[slot.i] = u.id;
  u.padB = slot.b.id;
  u.padI = slot.i;
  return this.padPos(slot.b, slot.i);
}

function releasePad(this: World, u: Unit): void {
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
function homeDistance(this: World, u: Unit): number | null {
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
function fuelToReturn(this: World, u: Unit, spec: UnitSpec): number {
  const d = this.homeDistance(u);
  if (d === null) return 0;
  return (d / spec.speed + 3) * spec.fuel!.burn * 1.25;
}

/**
 * Đốt dầu. Máy bay luôn giữ một phần "dầu dự trữ" đủ bay về: khi cạn mà vẫn còn sân để về
 * thì không rơi mà bay về hạ cánh. Chỉ rơi khi không còn Sân Đáp nào của phe mình.
 * Trả về false nếu vừa rơi.
 */
function burn(this: World, u: Unit, spec: UnitSpec): boolean {
  if (!this.sandbox?.infiniteFuel) u.fuel -= spec.fuel!.burn * DT;
  if (u.fuel > 0) return true;
  u.fuel = 0;
  if (this.homeDistance(u) !== null || u.air === "landing") {
    if (u.air === "flying" || u.air === "takeoff" || u.air === "launch") {
      u.rtb = true;
      u.air = "returning";
    }
    return true;
  }
  u.hp = 0;
  u.crashed = true;
  return false;
}

function takeoff(this: World, u: Unit): void {
  let tx = u.mx;
  let tz = u.mz;
  const t = this.target(u.targetId);
  if (u.mission === "attack" && t) {
    tx = t.x;
    tz = t.z;
  }
  // lúc cất cánh, `ax` / `az` giữ hướng bay ra (vector đơn vị); mũi xoay dần từ hướng ô đáp sang đó trong lúc bốc lên
  const dx = tx - u.x;
  const dz = tz - u.z;
  const l = Math.sqrt(dx * dx + dz * dz);
  u.ax = l > 1 ? dx / l : u.hx;
  u.az = l > 1 ? dz / l : u.hz;
  u.air = "takeoff";
  u.airT = 0;
}

/** 0 → 1 mượt hai đầu (smoothstep), không dùng lượng giác. */
function smooth(k: number): number {
  const t = k <= 0 ? 0 : k >= 1 ? 1 : k;
  return t * t * (3 - 2 * t);
}

/**
 * Xoay hướng mũi (hx, hz) về (tx, tz) thêm một phần `f` (1 = tới hẳn), giữ vector đơn vị. Hai hướng gần ngược nhau thì quay
 * về phía ô đáp nghiêng ra (`side`), để hai phe soi gương xoay đối xứng.
 */
function turnHead(u: Unit, tx: number, tz: number, f: number, side: number): void {
  if (f >= 1) {
    u.hx = tx;
    u.hz = tz;
    return;
  }
  let gx = tx;
  let gz = tz;
  if (u.hx * tx + u.hz * tz < -0.9) {
    gx = side * u.hz;
    gz = -side * u.hx;
  }
  const nx = u.hx + (gx - u.hx) * f;
  const nz = u.hz + (gz - u.hz) * f;
  const l = Math.sqrt(nx * nx + nz * nz);
  if (l > 1e-6) {
    u.hx = nx / l;
    u.hz = nz / l;
  }
}

/** Bên ô đáp nghiêng ra (±1) của máy bay, để chọn chiều xoay đối xứng. */
function padSide(u: Unit): number {
  return u.padI >= 0 ? PAD_OFFSETS[u.padI][2] : 1;
}

// ------------------------------------------------------------------ drone (bay lơ lửng, chạy pin)

/** Điểm (x, z) có nằm trong vùng lưới điện của phe không (vùng `zone` của công trình phe mình đã xây xong). */
function inGrid(this: World, side: Side, x: number, z: number): boolean {
  for (const b of this.buildings) {
    const zone = BUILDINGS[b.kind].zone;
    if (!zone || b.side !== side || !b.built || b.hp <= 0) continue;
    if (dist2(b.x, b.z, x, z) <= zone * zone) return true;
  }
  return false;
}

/** Chỗ gần nhất trong vùng lưới điện để drone về sạc: lùi vào trong vùng của công trình có vùng gần nhất 4 m. */
function nearestGrid(this: World, side: Side, x: number, z: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const b of this.buildings) {
    const zone = BUILDINGS[b.kind].zone;
    if (!zone || b.side !== side || !b.built || b.hp <= 0) continue;
    const d = Math.sqrt(dist2(b.x, b.z, x, z));
    const edge = Math.max(0, d - (zone - 4));
    if (edge < bestD) {
      bestD = edge;
      const k = d > 1e-6 ? Math.min(1, (zone - 4) / d) : 0;
      best = [b.x + (x - b.x) * k, b.z + (z - b.z) * k];
    }
  }
  return best;
}

/** Drone hỗ trợ còn cần nạp năng lượng (kho chưa đầy). */
function droneNeedsCharge(this: World, u: Unit): boolean {
  const E = UNITS[u.kind].energy;
  return !!E && u.fuel < E.max;
}

/**
 * Drone (`spec.hover`): bay lơ lửng thẳng tới đích; không cất / hạ cánh, không Sân Đáp, không Dầu, bay không giới hạn.
 * Drone hỗ trợ (`spec.energy`) giữ năng lượng trong `fuel`: nạp trong vùng lưới điện (nhanh chậm theo điện hậu cần cấp,
 * ưu tiên thấp nhất), không tự bay về nạp vì phải ở lại tiền tuyến; sắp cạn thì báo trước cho Tư lệnh. Lệnh B (về sân) =
 * bay về vùng lưới điện gần nhất. Cảm tử (`spec.kamikaze`): nhiệm vụ "attack" = lao vào mục tiêu mặt đất rồi nổ.
 */
function updateDrone(this: World, u: Unit): void {
  const spec = UNITS[u.kind];
  const home = this.inGrid(u.side, u.x, u.z);
  const E = spec.energy;
  if (E) {
    const before = u.fuel;
    if (home) u.fuel = Math.min(E.max, u.fuel + E.charge * DT * this.sides[u.side].droneFrac);
    if (spec.shield) this.updateShield(u);
    if (spec.repair) this.updateRepair(u);
    if (u.fuel < E.max * E.low && before >= E.max * E.low) this.alert(u.side, "droneLow", u.x, u.z);
  }
  if (u.rtb && home && !this.droneNeedsCharge(u)) u.rtb = false;

  let gx = u.x;
  let gz = u.z;
  if (u.mission === "attack" && spec.kamikaze) {
    const t = this.target(u.targetId);
    if (!t || t.side === u.side || t.hp <= 0 || (t.cat === "unit" && t.alt > AIRBORNE_ALT) || !this.visibleTo(u.side, t)) {
      u.mission = "none";
      u.targetId = 0;
    } else {
      gx = t.x;
      gz = t.z;
      const reach = (t.cat === "unit" ? UNITS[t.kind].radius : Math.max(...BUILDINGS[t.kind].half)) + 1;
      if (dist2(u.x, u.z, gx, gz) <= reach * reach) {
        this.detonate(u);
        return;
      }
    }
  } else if (u.rtb) {
    const g = this.nearestGrid(u.side, u.x, u.z);
    if (g && !home) [gx, gz] = g;
  } else if (u.mission === "move") {
    gx = u.mx;
    gz = u.mz;
    if (dist2(u.x, u.z, gx, gz) < 0.25) u.mission = "none";
  }
  const dx = gx - u.x;
  const dz = gz - u.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  // lao cảm tử nhanh hơn bay thường
  const v = spec.speed * (u.mission === "attack" ? 1.4 : 1) * (this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1);
  const H = RULES.air.hover;
  // ĐI NGANG CÓ QUÁN TÍNH (17/11/2026; trước đó đổi hướng 172° và 0 ↔ 15 m/s trong một tick): mũi quay dần về phía đích, tốc độ
  // muốn = min(tốc độ, tốc độ còn hãm kịp trước đích) × độ thẳng mũi (đích ở sau lưng thì hãm lại, quay rồi mới đi)
  let want = 0;
  if (d > 1e-6) {
    turnToward(u.hx, u.hz, dx / d, dz / d, traverseStep(H.turnRate), TMP);
    u.hx = TMP.x;
    u.hz = TMP.z;
    const facing = (u.hx * dx + u.hz * dz) / d;
    want = Math.min(v, Math.sqrt(2 * H.accel * d)) * Math.max(0, facing);
  }
  u.speed += clamp(want - u.speed, -H.accel * DT, H.accel * DT);
  if (u.speed < 1e-3) u.speed = 0;
  const g0 = this.map.groundY(u.x, u.z);
  if (u.speed > 0) {
    // đi theo mũi; sắp tới đích thì không vượt quá đích
    const step = d > 1e-6 && d < u.speed * DT ? d : u.speed * DT;
    u.x = clamp(u.x + u.hx * step, -this.map.airX, this.map.airX);
    u.z = clamp(u.z + u.hz * step, -this.map.airZ, this.map.airZ);
    u.moved = true;
  }
  // LÊN XUỐNG MƯỢT, vẫn theo mặt đất dưới thân: giữ độ cao tuyệt đối khi mặt đất đổi, rồi tiến dần về mặt đất + hover.alt; lấy mặt
  // đất cao hơn giữa chỗ đang đứng và chỗ sắp tới (`look` giây) để lên sớm trước vách, xuống sau khi đã qua mép
  const g1 = this.map.groundY(u.x, u.z);
  u.alt += g0 - g1;
  const ahead = this.map.groundY(u.x + u.hx * u.speed * H.look, u.z + u.hz * u.speed * H.look);
  const wantY = Math.max(g1, ahead) + spec.hover!.alt;
  const vWant = clamp((wantY - (g1 + u.alt)) * H.climbGain, -H.climbRate, H.climbRate);
  u.vy += clamp(vWant - u.vy, -H.climbAcc * DT, H.climbAcc * DT);
  // không bao giờ tụt dưới ngưỡng "đang bay" (luật bắn / sương mù theo độ cao)
  u.alt = Math.max(AIRBORNE_ALT + 0.5, u.alt + u.vy * DT);
}

/**
 * Drone Khiên: mức nguy hiểm (`threat`, sát thương danh nghĩa phe mình hứng trong vùng, cộng ở `damage`) phai một nửa sau
 * mỗi `fade` giây. Tắt mà nguy hiểm vượt `trigger` và còn đủ `minStart` năng lượng thì bật; đang bật thì tốn `drain` mỗi
 * giây, không hứng phát nào trong `idleOff` giây hoặc hết năng lượng thì tắt (giữ phần còn lại).
 */
function updateShield(this: World, u: Unit): void {
  const S = UNITS[u.kind].shield!;
  u.threat *= Math.pow(0.5, DT / S.fade);
  if (u.threat < 1e-3) u.threat = 0;
  if (u.shieldOn) {
    u.fuel = Math.max(0, u.fuel - S.drain * DT);
    u.shieldIdle++;
    if (u.fuel <= 0 || u.shieldIdle >= sec(S.idleOff)) this.shieldOff(u);
  } else if (u.threat >= S.trigger && u.fuel >= S.minStart) {
    u.shieldOn = 1;
    u.shieldIdle = 0;
    u.threat = 0;
    this.events.push({ t: "shield", id: u.id, side: u.side, on: true, x: u.x, z: u.z });
  }
}

function shieldOff(this: World, u: Unit): void {
  u.shieldOn = 0;
  u.shieldIdle = 0;
  this.events.push({ t: "shield", id: u.id, side: u.side, on: false, x: u.x, z: u.z });
}

/**
 * Drone Sửa Chữa: chọn một mục tiêu phe mình trong vùng (Xe Tư Lệnh trước, rồi quân hỏng nặng nhất theo tỉ lệ, cuối cùng
 * công trình), hàn `rate` máu mỗi giây, tốn `perHp` năng lượng mỗi điểm máu. `targetId` giữ mục tiêu đang hàn (phần vẽ tia).
 */
function updateRepair(this: World, u: Unit): void {
  const R = UNITS[u.kind].repair!;
  const r2 = R.radius * R.radius;
  let best: Target | null = null;
  let bestScore = Infinity;
  if (u.fuel >= R.perHp) {
    for (const o of this.units) {
      if (o.side !== u.side || o === u || o.hp <= 0 || o.hp >= o.maxHp || dist2(o.x, o.z, u.x, u.z) > r2) continue;
      if (o.air === "parked" || World.sheltered(o)) continue;
      const score = (o.kind === "commander" ? -1 : 0) + o.hp / o.maxHp;
      if (score < bestScore || (score === bestScore && best && o.id < best.id)) {
        bestScore = score;
        best = o;
      }
    }
    if (!best)
      for (const b of this.buildings) {
        if (b.side !== u.side || !b.built || b.hp <= 0 || b.hp >= b.maxHp) continue;
        const reach = R.radius + Math.max(...BUILDINGS[b.kind].half);
        if (dist2(b.x, b.z, u.x, u.z) > reach * reach) continue;
        const score = 1 + b.hp / b.maxHp;
        if (score < bestScore || (score === bestScore && best && b.id < best.id)) {
          bestScore = score;
          best = b;
        }
      }
  }
  if (!best) {
    u.targetId = 0;
    return;
  }
  const heal = Math.min(R.rate * DT, best.maxHp - best.hp, u.fuel / R.perHp);
  best.hp += heal;
  u.fuel -= heal * R.perHp;
  u.targetId = best.id;
}

/** Drone cảm tử nổ tại chỗ: một phát nổ lan mặt đất (giải quyết ngay trong tick này), drone mất. */
function detonate(this: World, u: Unit): void {
  const k = UNITS[u.kind].kamikaze!;
  this.shots.push({
    side: u.side,
    src: u.id,
    target: 0,
    tx: u.x,
    tz: u.z,
    dmg: k.dmg,
    dmgType: k.dmgType,
    sx: u.x,
    sz: u.z,
    talt: 0,
    interceptable: false,
    splash: k.splash,
    hitAir: false,
    impact: this.tick,
    visual: "bomb"
  });
  u.hp = 0;
  u.mission = "none";
}

function updateAir(this: World, u: Unit): void {
  const spec = UNITS[u.kind];
  if (spec.hover) {
    this.updateDrone(u);
    return;
  }
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
      // 1) bốc thẳng lên `hoverAlt`, mũi xoay dần về hướng bay ra · 2) lao ra trước, lên độ bay
      const V = A.vtol;
      u.airT++;
      const rise = sec(V.rise);
      const out = sec(V.climbOut);
      if (u.airT <= rise) {
        u.speed = 0;
        u.alt = V.hoverAlt * smooth(u.airT / rise);
        turnHead(u, u.ax, u.az, 1 / Math.max(1, rise - u.airT + 1), padSide(u));
      } else {
        const k = (u.airT - rise) / out;
        u.speed = spec.speed * Math.min(1, 0.15 + 0.85 * k);
        this.airMove(u);
        // lên tầng bay theo đường cong êm hai đầu: hết quãng thì tốc độ dọc về 0, chuyển sang bay bằng không giật
        u.alt = easeToward(u.alt, this.cruiseAltAt(u.x, u.z), (u.airT - rise - 1) / out, k);
      }
      if (!this.burn(u, spec)) return;
      if (u.airT >= rise + out) {
        u.air = "flying";
        u.alt = this.cruiseAltAt(u.x, u.z);
        u.vy = 0;
      }
      return;
    }
    case "launch": {
      // 1) chờ dưới giếng (airT < 0) · 2) bay thẳng lên tới cao hơn sàn `clear` · 3) tăng tốc ra trước, lên độ bay
      const L = A.launch;
      u.airT++;
      if (u.airT <= 0) {
        u.speed = 0;
        return;
      }
      const rise = sec(L.rise);
      const out = sec(L.climbOut);
      if (u.airT <= rise) {
        u.speed = 0;
        u.alt += u.ax / rise; // ax = quãng bay thẳng lên, đặt lúc xuất xưởng
      } else {
        const k = (u.airT - rise) / out;
        u.speed = spec.speed * Math.min(1, 0.15 + 0.85 * k);
        this.airMove(u);
        u.alt = easeToward(u.alt, this.cruiseAltAt(u.x, u.z), (u.airT - rise - 1) / out, k);
      }
      if (!this.burn(u, spec)) return;
      if (u.airT >= rise + out) {
        u.air = "flying";
        u.alt = this.cruiseAltAt(u.x, u.z);
        u.vy = 0;
      }
      return;
    }
    case "flying":
    case "returning":
      this.fly(u, spec);
      return;
    case "landing": {
      // 1) lượn từ điểm bắt đầu (ax, az) tới lơ lửng trên ô ở `hoverAlt`, mũi theo hướng bay vào
      // 2) hạ thẳng xuống ô, mũi xoay dần về hướng ô đáp (chữ V nghiêng ra ngoài)
      const pad = this.padPosOf(u);
      const ab = this.byId.get(u.padB);
      if (!pad || !ab || ab.cat !== "building") {
        u.air = "returning";
        u.alt = Math.max(u.alt, 4);
        return;
      }
      const V = A.vtol;
      u.airT++;
      const glide = sec(V.glide);
      const down = sec(V.descend);
      if (u.airT <= glide) {
        const k = u.airT / glide;
        const e = smooth(k);
        const nx = u.ax + (pad[0] - u.ax) * e;
        const nz = u.az + (pad[1] - u.az) * e;
        const mx = nx - u.x;
        const mz = nz - u.z;
        const ml = Math.sqrt(mx * mx + mz * mz);
        if (ml > 1e-3) {
          u.hx = mx / ml;
          u.hz = mz / ml;
        }
        u.x = nx;
        u.z = nz;
        u.alt = u.alt + (V.hoverAlt - u.alt) / Math.max(1, glide - u.airT + 1);
        u.speed = ml / DT;
        return;
      }
      const t = u.airT - glide;
      const [phx, phz] = this.padHead(ab, u.padI);
      u.x = pad[0];
      u.z = pad[1];
      u.speed = 0;
      u.alt = V.hoverAlt * (1 - smooth(t / down));
      // xoay mũi trong 70% đầu quãng hạ, rồi hạ nốt cho cân
      turnHead(u, phx, phz, 1 / Math.max(1, Math.ceil(down * 0.7) - t + 1), padSide(u));
      if (t >= down) {
        u.air = "parked";
        u.alt = 0;
        u.mission = "none";
        u.rtb = false;
        u.targetId = 0;
        u.autoTarget = 0;
        u.hx = phx;
        u.hz = phz;
        u.yawRate = 0;
        u.vy = 0;
      }
      return;
    }
    default:
      return;
  }
}

function fly(this: World, u: Unit, spec: UnitSpec): void {
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
  /** Hệ số tốc độ (giữ đội hình phi đội: chiếc tụt sau bay nhanh hơn chút, chiếc vượt lên bay chậm lại). */
  let speedK = 1;
  let tgt: Target | null = null;
  // độ cao muốn, TÍNH TỪ NỀN (tầng 0): tầng bay cố định, bổ nhào thì theo mặt đất chỗ mục tiêu
  const cruiseY = A.cruiseTier * TIER_H;
  let wantY = cruiseY;
  if (u.air === "returning") {
    const pad = this.ensurePad(u);
    if (pad) {
      dx = pad[0] - u.x;
      dz = pad[1] - u.z;
      // hạ dần theo dốc lượn để tới gần ô đã ở thấp, pha lượn vào ô (`landing`) không phải tụt độ cao gấp
      wantY = Math.min(cruiseY, this.map.groundY(pad[0], pad[1]) + A.vtol.hoverAlt + Math.sqrt(dx * dx + dz * dz) * A.glideSlope);
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
      if (t && t.side !== u.side && this.canHit(w, t) && this.visibleTo(u.side, t)) {
        tgt = t;
        // nhớ chỗ mục tiêu: mất mục tiêu thì tìm mục tiêu mới quanh đó
        u.mx = clamp(t.x, -this.map.airX, this.map.airX);
        u.mz = clamp(t.z, -this.map.airZ, this.map.airZ);
      } else {
        // mục tiêu mất: tìm mục tiêu mới quanh chỗ mục tiêu cũ (HUNT, `mx`, `mz`), không thấy trong `huntTime` giây thì về sân.
        // Trước 17/11/2026 chuyển sang "đi tới chỗ máy bay đang bay" và lượn vòng ở đó tới khi cạn dầu (lỗi 7)
        u.mission = "hunt";
        u.huntUntil = this.tick + sec(A.huntTime);
        u.targetId = 0;
      }
    }
    if (!tgt) {
      // phi đội: mục tiêu chung do trưởng phi đội giao (`updateWings`); không có thì tự tìm quanh điểm của mình như bay lẻ
      tgt = this.wingTargetOf(u) ?? this.acquireFrom(u, u.side, u.mx, u.mz, w, 26, u.autoTarget);
      u.autoTarget = tgt ? tgt.id : 0;
      if (u.mission === "hunt") {
        if (tgt) u.huntUntil = this.tick + sec(A.huntTime);
        else if (this.tick >= u.huntUntil) u.rtb = true;
      }
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
      // Bổ nhào theo đường dốc: mũi hướng về mục tiêu mặt đất thì độ cao muốn hạ dần theo quãng còn lại (`diveSlope`)
      if (spec.diveAlt && !u.ext && !this.isAirborne(tgt) && facing >= 0.5)
        wantY = Math.min(cruiseY, this.map.groundY(tgt.x, tgt.z) + spec.diveAlt + Math.max(0, d - w.range * A.diveFlat) * A.diveSlope);
    } else {
      u.ext = false;
      const slot = this.wingSlot(u);
      if (slot) [dx, dz, speedK] = slot;
      else [dx, dz] = this.loiter(u, u.mx, u.mz);
    }
  }
  if (Math.abs(u.x) > this.map.airX || Math.abs(u.z) > this.map.airZ) {
    dx = -u.x;
    dz = -u.z;
  }
  this.steerAir(u, dx, dz, fuel.turnRate);
  u.speed = spec.speed * speedK;
  this.airMove(u);
  // LÊN XUỐNG MƯỢT (17/11/2026): tốc độ dọc muốn tỉ lệ độ lệch (chậm dần khi gần), kẹp climbRate; tốc độ dọc thật đổi dần theo
  // climbAcc. Trước đó lên xuống đều 5 m/s rồi dừng phắt, và độ cao bám mặt đất nên qua vách nhảy 5 m trong một tick
  const y = this.map.groundY(u.x, u.z) + u.alt;
  const vWant = clamp((wantY - y) * A.climbGain, -A.climbRate, A.climbRate);
  u.vy += clamp(vWant - u.vy, -A.climbAcc * DT, A.climbAcc * DT);
  u.alt = Math.max(AIRBORNE_ALT + 1, u.alt + u.vy * DT);
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
function steerAir(this: World, u: Unit, dx: number, dz: number, turnRateDeg: number): void {
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

/** Độ cao trên mặt đất tại (x, z) của tầng bay cố định (tính từ nền, `RULES.air.cruiseTier`). */
function cruiseAltAt(this: World, x: number, z: number): number {
  return RULES.air.cruiseTier * TIER_H - this.map.groundY(x, z);
}

/**
 * Máy bay tiến một tick theo mũi và tốc độ, GIỮ ĐỘ CAO TUYỆT ĐỐI: `alt` là độ cao trên mặt đất nên qua vách / dốc phải bù phần
 * mặt đất đổi (mặt đất cao lên 5 m thì `alt` bớt 5 m). Không bay ra ngoài bản đồ (cách mép 2 m).
 */
function airMove(this: World, u: Unit): void {
  const g0 = this.map.groundY(u.x, u.z);
  u.x = clamp(u.x + u.hx * u.speed * DT, -this.map.halfW + 2, this.map.halfW - 2);
  u.z = clamp(u.z + u.hz * u.speed * DT, -this.map.halfH + 2, this.map.halfH - 2);
  u.alt += g0 - this.map.groundY(u.x, u.z);
}

/** Đi tiếp từ `cur` về `target` theo đường cong êm hai đầu (smoothstep), từ tiến độ k0 tới k1 (0 → 1): phần còn lại chia đều. */
function easeToward(cur: number, target: number, k0: number, k1: number): number {
  const s0 = smooth(Math.max(0, k0));
  const s1 = smooth(Math.min(1, k1));
  return s0 >= 1 - 1e-9 ? target : cur + ((target - cur) * (s1 - s0)) / (1 - s0);
}

/** Hướng bay vòng chờ quanh (cx, cz): xa thì bay thẳng tới, gần thì bay tiếp tuyến bán kính ~11 m. */
function loiter(this: World, u: Unit, cx: number, cz: number): [number, number] {
  const dx = cx - u.x;
  const dz = cz - u.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 16 || d < 1e-6) return [dx, dz];
  const k = (d - 11) / 11;
  return [-dz / d + (dx / d) * k, dx / d + (dz / d) * k];
}

// ------------------------------------------------------------------ phi đội (người dùng duyệt 18/11/2026)

/** Phi đội quét địch quanh điểm tìm chung trong chừng này m (cộng độ xòe của đội), bằng tầm tìm mục tiêu của một chiếc. */
const WING_SCAN = 26;
/** Hỏa lực đã giao cho một mục tiêu tính theo chừng này giây bắn; đủ hạ thì chiếc sau nhận mục tiêu khác (không bắn quá tay). */
const WING_KILL_WINDOW = 2;
/** Chia lại mục tiêu mỗi chừng này tick. */
const WING_EVERY = 3;

/**
 * "Trưởng phi đội": máy bay cùng lệnh (`wing`) đánh CHUNG mục tiêu thay vì mỗi chiếc tự chọn quanh điểm riêng (đo 18/11: 6 Falcon
 * đánh đội 5 Titan thì đội bay rộng 90–110 m, trung bình 1,7 mục tiêu, chiếc ở cánh lượn không đánh). Như tướng sư đoàn mặt đất
 * (`divisionTargets`): ưu tiên kẻ đang bắn phi đội, dồn vào mục tiêu đã có hỏa lực chưa đủ hạ, đủ hạ trong WING_KILL_WINDOW giây thì
 * chiếc sau nhận mục tiêu kế. Chỉ giao cho chiếc đang bay tìm mục tiêu (lệnh bay / săn); chiếc có lệnh tấn công thẳng giữ mục tiêu
 * của nó nhưng vẫn tính vào hỏa lực đã giao. Ghi vào `divTarget`; `fly` dùng khi còn hợp lệ.
 */
function updateWings(this: World): void {
  if (this.tick % WING_EVERY !== 0) return;
  const wings = new Map<number, Unit[]>();
  for (const u of this.units) {
    if (u.cat !== "unit" || !u.wing || u.hp <= 0 || u.air !== "flying" || u.rtb) continue;
    const list = wings.get(u.wing);
    if (list) list.push(u);
    else wings.set(u.wing, [u]);
  }
  for (const list of wings.values()) {
    let sx = 0;
    let sz = 0;
    for (const m of list) {
      sx += m.mx / list.length;
      sz += m.mz / list.length;
    }
    let spread = 0;
    for (const m of list) spread = Math.max(spread, Math.sqrt(dist2(m.mx, m.mz, sx, sz)));
    const lim = WING_SCAN + spread;
    const side = list[0].side;
    const member = new Set(list.map((m) => m.id));
    const foes: Target[] = [];
    for (const e of this.units) if (e.side !== side && e.hp > 0 && dist2(e.x, e.z, sx, sz) <= lim * lim && this.visibleTo(side, e)) foes.push(e);
    for (const b of this.buildings)
      if (b.side !== side && b.hp > 0 && !BUILDINGS[b.kind].tile && dist2(b.x, b.z, sx, sz) <= lim * lim && this.visibleTo(side, b)) foes.push(b);
    const committed = new Map<number, number>();
    const add = (m: Unit, t: Target): void => {
      const w = UNITS[m.kind].weapon!;
      const armor = t.cat === "unit" ? UNITS[t.kind].armorClass : BUILDINGS[t.kind].armorClass;
      const dmg = (t.cat === "unit" && t.air !== "none" ? w.dmgAir : w.dmgGround) * RULES.damageMatrix[armor][w.dmgType];
      committed.set(t.id, (committed.get(t.id) ?? 0) + (dmg / w.cooldown) * WING_KILL_WINDOW);
    };
    // chiếc có lệnh tấn công thẳng: mục tiêu của nó đã có hỏa lực
    for (const m of list) {
      if (m.mission !== "attack") continue;
      const t = this.target(m.targetId);
      if (t && UNITS[m.kind].weapon) add(m, t);
    }
    for (const m of list) {
      if (m.mission === "attack") continue;
      m.divTarget = 0;
      const w = UNITS[m.kind].weapon;
      if (!w) continue;
      let best: Target | null = null;
      let bestScore = Infinity;
      for (const e of foes) {
        if (!this.canHit(w, e)) continue;
        const c = committed.get(e.id) ?? 0;
        const over = c >= e.hp;
        const isUnit = e.cat === "unit";
        const shooting = isUnit && (member.has(e.autoTarget) || member.has(e.targetId));
        const armed = isUnit ? !!UNITS[e.kind].weapon : !!BUILDINGS[e.kind].weapon;
        const score =
          dist2(e.x, e.z, sx, sz) + (isUnit ? 0 : 400) + (armed ? 0 : 60) + (shooting ? -1e4 : 0) + (c > 0 && !over ? -5e3 : 0) + (over ? 1e7 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (!best) continue;
      m.divTarget = best.id;
      add(m, best);
    }
  }
}

/** Nhìn trước chỗ trong đội hình chừng này m theo hướng bay của chiếc dẫn đầu (lái bám điểm phía trước, không bám đuôi). */
const WING_LEAD = 10;
/** Giữ đội hình: tốc độ đổi tối đa ±chừng này (tỉ lệ) để về đúng chỗ, và đổi theo mỗi mét lệch dọc. */
const WING_SPEED_SPAN = 0.15;
const WING_SPEED_GAIN = 0.03;

/**
 * BAY ĐỘI HÌNH (người dùng duyệt 18/11/2026: cả phi đội lượn quanh tâm chung): chiếc dẫn đầu lượn quanh điểm đến của nó; chiếc
 * khác không đánh thì giữ đúng chỗ trong mũi tên so với chiếc dẫn đầu (`wingLat`, `wingBack`), lái bám điểm phía trước chỗ đó và
 * đổi tốc độ ±15% để bắt kịp. Trước đó mỗi chiếc lượn vòng 11 m quanh điểm riêng, lệch pha nhau nên đội xòe rộng. Trả về hướng bay
 * và hệ số tốc độ, hoặc null nếu không giữ đội hình (là chiếc dẫn đầu, bay lẻ, chiếc dẫn đầu đang đánh / đã về sân).
 */
function wingSlot(this: World, u: Unit): [number, number, number] | null {
  if (!u.wing || u.wing === u.id) return null;
  const L = this.byId.get(u.wing);
  if (!L || L.cat !== "unit" || L.hp <= 0 || L.air !== "flying" || L.rtb || L.wing !== u.wing) return null;
  // chiếc dẫn đầu đang bổ nhào thì cả đội đang đánh: mỗi chiếc tự lượt của mình
  if (L.targetId || L.autoTarget) return null;
  const lat = u.wingLat - L.wingLat;
  const back = u.wingBack - L.wingBack;
  const sx = L.x + L.hz * lat - L.hx * back;
  const sz = L.z - L.hx * lat - L.hz * back;
  const along = (sx - u.x) * L.hx + (sz - u.z) * L.hz;
  const k = 1 + clamp(along * WING_SPEED_GAIN, -WING_SPEED_SPAN, WING_SPEED_SPAN);
  return [sx + L.hx * WING_LEAD - u.x, sz + L.hz * WING_LEAD - u.z, k];
}

/** Mục tiêu trưởng phi đội giao cho máy bay, nếu còn hợp lệ. */
function wingTargetOf(this: World, u: Unit): Target | null {
  if (!u.wing || !u.divTarget) return null;
  const t = this.target(u.divTarget);
  const w = UNITS[u.kind].weapon;
  if (!t || t.hp <= 0 || t.side === u.side || !w || !this.canHit(w, t) || !this.visibleTo(u.side, t)) return null;
  return t;
}

const methods = { updateWings, wingTargetOf, wingSlot, padPosOf, nearestFreePad, freePads, hasFreePad, ensurePad, releasePad, homeDistance, fuelToReturn, burn, takeoff, inGrid, nearestGrid, droneNeedsCharge, updateDrone, updateShield, shieldOff, updateRepair, detonate, updateAir, fly, steerAir, loiter, cruiseAltAt, airMove };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
