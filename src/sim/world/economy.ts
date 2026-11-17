/** Kinh tế: điện, công trình (xây, đúc quân), mỏ và chiếm mỏ. */
import { BUILDINGS, doorDir, lotTime, RULES, UNITS, type Side, type UnitId } from "../content";
import { dist2 } from "../fmath";
import type { Building } from "../types";
import { DT, sec, FORMATION_GAP, spaceRadius } from "./shared";
import { World } from "./core";


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
function computePower(this: World): void {
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
    // drone đang sạc trong vùng lưới điện (pin chưa đầy hoặc khiên chưa sạc xong): ưu tiên thấp nhất, cùng mức xưởng xe
    for (const u of this.units) {
      const H = UNITS[u.kind].hover;
      if (!H || !H.draw || u.side !== s || u.hp <= 0 || !this.droneNeedsCharge(u) || !this.inGrid(s, u.x, u.z)) continue;
      tier[3] += H.draw;
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
    st.droneFrac = frac[3];
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

function updateBuildings(this: World): void {
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

function produce(this: World, b: Building): void {
  const kind = b.queue[0];
  const us = UNITS[kind];
  let live = 0;
  for (const u of this.units) if (u.side === b.side && u.kind !== "commander") live++;
  if (live + us.batch > RULES.unitCap) return;
  // máy bay mới cần chỗ đậu cho cả lô: không đủ bãi trống thì nhà máy tạm dừng
  if (us.domain === "air" && !us.hover && this.freePads(b.side) < us.batch) return;
  // thiếu điện thì đúc chậm (Tổng Hành Dinh tự có điện nên không bị ảnh hưởng)
  b.prog += BUILDINGS[b.kind].power < 0 ? b.powerFrac : 1;
  if (b.prog < sec(lotTime(kind))) return;
  b.prog = 0;
  b.queue.shift();
  const lot = this.nextId++;
  const ids: number[] = [];
  for (let k = 0; k < us.batch; k++) {
  const offset = (k - (us.batch - 1) / 2) * (2 * (us.domain === "air" ? us.radius : spaceRadius(kind)) + FORMATION_GAP);
  if (us.domain === "air" && !us.hover) {
    // Nhà Máy Máy Bay: cả lô ra đời trong cùng tick này và giữ chỗ bãi đậu ngay (đã kiểm đủ bãi cho cả lô ở trên), nên hai
    // xưởng không bao giờ tranh một bãi. Có giếng phóng (`pads` + `launch`): chiếc k dùng giếng k mod số giếng, chiếc dùng
    // chung giếng chờ dưới giếng thêm `gap` giây mỗi lượt, rồi bay thẳng lên. Không có giếng: cất cánh thẳng ra trước cửa.
    const bs = BUILDINGS[b.kind];
    const slot = this.nearestFreePad(b.side, b.x, b.z)!;
    const [ddx, ddz] = doorDir(b.rot);
    const reach = bs.half[1] + 1; // nửa chiều sâu theo khung mô hình (cửa ở +z của mô hình)
    const [ax, az] = bs.bay || bs.pads ? this.doorPos(b, k) : [b.x + ddx * reach - ddz * offset, b.z + ddz * reach + ddx * offset];
    const u = this.spawnUnit(kind, b.side, ax, az);
    u.lot = lot;
    u.hx = u.phx = ddx;
    u.hz = u.phz = ddz;
    slot.b.pads[slot.i] = u.id;
    u.padB = slot.b.id;
    u.padI = slot.i;
    u.rtb = true;
    if (bs.launch && bs.pads) {
      const L = RULES.air.launch;
      u.air = "launch";
      u.airT = -sec(L.hatch + Math.floor(k / bs.pads.length) * L.gap);
      u.alt = u.palt = bs.launch.deck - bs.launch.shaft; // đáy giếng
      u.ax = bs.launch.shaft + L.clear; // lúc phóng, `ax` giữ quãng bay thẳng lên (m); hạ cánh mới dùng ax làm điểm đầu
    } else {
      u.air = "takeoff";
      u.airT = 0;
    }
  } else {
    // xe ra ở ô cửa ra (trước cửa, phía `doorDir`), cả lô xếp ngang theo bề rộng cửa; chỗ bị xe khác đứng thì lấy ô trống gần nhất
    const e = this.exitRect(b.kind, b.x, b.z, b.rot);
    const [ddx, ddz] = doorDir(b.rot);
    const out = BUILDINGS[b.kind].half[1] + 2.5;
    // mép ngoài ô cửa ra, cả lô xếp ngang (vuông góc hướng cửa)
    const [fx, fz] = BUILDINGS[b.kind].bay
      ? this.doorPos(b, k) // mỗi xe của lô ra một cửa (xưởng 3 cửa, lô tối đa 3)
      : e
        ? [e[0] + ddx * e[2] - ddz * offset, e[1] + ddz * e[3] + ddx * offset]
        : [b.x + ddx * out - ddz * offset, b.z + ddz * out + ddx * offset];
    const [sx, sz] = this.grid.nearestFree(fx, fz, 6) ?? [fx, fz];
    const u = this.spawnUnit(kind, b.side, sx, sz);
    // xe trên bệ ráp quay đầu theo `padFace` (khung mô hình), xoay cùng nhà
    const [fhx, fhz] = BUILDINGS[b.kind].pads ? doorDir(b.rot + (BUILDINGS[b.kind].padFace ?? 0)) : [ddx, ddz];
    u.hx = u.phx = fhx;
    u.hz = u.phz = fhz;
    u.lot = lot;
    // drone ráp xong ở bệ thì cất cánh tại chỗ, lơ lửng chờ lệnh
    if (us.hover) {
      u.air = "flying";
      u.alt = u.palt = us.hover.alt;
    }
    ids.push(u.id);
  }
  this.sides[b.side].stats.unitsBuilt++;
  }
  if (ids.length && kind !== "hauler") {
    // chưa đặt điểm tập kết: hậu cần tự đưa lô mới ra chỗ trống trước cửa (lỗi 6, 17/11/2026: không có lệnh thì xe đứng lại trên
    // bệ ráp, chiếc sau chồng lên chiếc trước, drone lơ lửng che kín xưởng, bấm vào xưởng trúng drone)
    const [rx, rz] = b.rallySet ? [b.rallyX, b.rallyZ] : this.exitSpot(b, kind, ids.length);
    this.orderMove(b.side, ids, rx, rz, "move");
  }
}

/** Ngoài mép nền móng phía cửa chừng này (m): qua hết ô cửa ra cấm xây, xe mới ra không chắn lối xe sau. */
const EXIT_SPOT_CLEAR = 6;

/**
 * Chỗ đứng chờ mặc định cho lô `n` chiếc `kind` vừa ra xưởng `b` (khi chưa đặt điểm tập kết): trước cửa, ngoài nền móng, thẳng
 * hàng với ô cửa ra; chỗ đã có quân cùng phe cùng tầng (mặt đất / bay) đứng thì lấy chỗ kế bên (giữa, phải, trái, rồi lùi xa
 * thêm một hàng). Không chỗ nào trống thì lấy chỗ đầu.
 */
function exitSpot(this: World, b: Building, kind: UnitId, n: number): [number, number] {
  const [ddx, ddz] = doorDir(b.rot);
  const [bw, bd] = this.blockHalf(b.kind, b.rot);
  const e = this.exitRect(b.kind, b.x, b.z, b.rot);
  const air = UNITS[kind].domain === "air";
  const r = n * spaceRadius(kind) + 0.5;
  const step = 2 * r + 1;
  const bx = ddz !== 0 ? (e ? e[0] : b.x) : b.x + ddx * (bw + EXIT_SPOT_CLEAR + r);
  const bz = ddz !== 0 ? b.z + ddz * (bd + EXIT_SPOT_CLEAR + r) : e ? e[1] : b.z;
  // hướng ngang: bên phải người đứng trong cửa nhìn ra (xoay nhà thì xoay theo, hai phe đối xứng)
  const lx = -ddz;
  const lz = ddx;
  for (let row = 0; row < 4; row++)
    for (const col of [0, 1, -1, 2, -2]) {
      const x = bx + ddx * row * step + lx * col * step;
      const z = bz + ddz * row * step + lz * col * step;
      if (this.grid.blockedAt(x, z) || this.map.inset(x, z) < 2) continue;
      let taken = false;
      for (const o of this.units) {
        if (o.side !== b.side || o.hp <= 0 || (o.air !== "none") !== air) continue;
        const lim = r + spaceRadius(o.kind);
        if (dist2(o.x, o.z, x, z) < lim * lim) {
          taken = true;
          break;
        }
      }
      if (!taken) return [x, z];
    }
  return [bx, bz];
}

// ------------------------------------------------------------------ mỏ

function updateMines(this: World): void {
  for (const m of this.mines) {
    const prev = m.owner;
    // bãi rộng hơn mỏ khối cũ: vòng chiếm phủ tới chỗ đỗ của bãi
    const now = this.captureStep(m, Math.max(RULES.captureRadius, m.radius - 1));
    if (now === null) continue;
    m.slots.fill(0);
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
function captureStep(this: World, m: { x: number; z: number; owner: Side | -1; cap: number; capSide: Side | -1 }, radius: number = RULES.captureRadius): Side | -1 | null {
  const R2 = radius * radius;
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

const methods = { computePower, updateBuildings, produce, exitSpot, updateMines, captureStep };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
