/** Nhận lệnh của người chơi / AI (applyOrder) và các lệnh đơn: tấn công, dừng, xây. */
import { BUILDINGS, lotCost, RULES, UNITS, type BuildingId, type Side } from "../content";
import { clamp, dist2 } from "../fmath";
import type { Building, Order, Target, Unit, Wreck } from "../types";
import { AIRBORNE_ALT, SALVAGE_POOL } from "./shared";
import { World } from "./core";


// ------------------------------------------------------------------ lệnh

function ownUnits(this: World, side: Side, ids: readonly number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) {
    const e = this.byId.get(id);
    if (e && e.cat === "unit" && e.side === side && e.hp > 0 && !out.includes(e)) out.push(e);
  }
  return out.sort((a, b) => a.id - b.id);
}

function ownBuilding(this: World, side: Side, id: number): Building | null {
  const e = this.byId.get(id);
  return e && e.cat === "building" && e.side === side && e.hp > 0 ? e : null;
}

function applyOrder(this: World, side: Side, o: Order): void {
  // lệnh mới cho xe nào thì xe đó rời đội hình cũ (lệnh di chuyển nhóm sẽ lập đội hình mới)
  if ("ids" in o)
    for (const id of o.ids) {
      const u = this.byId.get(id);
      if (u && u.cat === "unit" && u.side === side && u.squad) this.leaveSquad(u);
    }
  // sư đoàn: lệnh đi tự lập / giữ sư đoàn (`orderMove`); lệnh khác cho một phần sư đoàn thì phần đó rời sư đoàn
  if (o.t === "attack" || o.t === "stop" || o.t === "harvest" || o.t === "salvage" || o.t === "rtb") this.divisionOrder(side, o.ids);
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
        if (u.air === "flying" || u.air === "takeoff" || u.air === "launch") u.rtb = true;
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

function cancelRtbIfFuel(this: World, u: Unit): void {
  const spec = UNITS[u.kind];
  const fuel = spec.fuel;
  if (!fuel) return;
  if (u.fuel > Math.max(fuel.tank * RULES.air.bingo, this.fuelToReturn(u, spec)) + 2) {
    u.rtb = false;
    if (u.air === "returning") u.air = "flying";
  }
}

function orderAttack(this: World, u: Unit, t: Target): void {
  const w = UNITS[u.kind].weapon;
  if (UNITS[u.kind].kamikaze) {
    // drone cảm tử: chỉ lao vào mục tiêu mặt đất (xe, công trình), không đâm máy bay; tường thì không đáng một chiếc drone
    if (t.cat === "unit" ? t.alt > AIRBORNE_ALT : BUILDINGS[t.kind].tile) return;
    u.mission = "attack";
    u.targetId = t.id;
    u.rtb = false;
    return;
  }
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

function orderStop(this: World, u: Unit): void {
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

function orderBuild(this: World, side: Side, kind: BuildingId, rx: number, rz: number, rot?: number): void {
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

const methods = { ownUnits, ownBuilding, applyOrder, cancelRtbIfFuel, orderAttack, orderStop, orderBuild };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
