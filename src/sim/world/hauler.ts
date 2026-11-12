/** Xe Vận Tải: chở quặng từ mỏ về Tổng Hành Dinh, ô đỗ dỡ hàng, trục vớt xác. */
import { BUILDINGS, RULES, UNITS, type Side } from "../content";
import { dist2 } from "../fmath";
import type { Building, Mine, Unit, Wreck } from "../types";
import { DT, sec, SALVAGE_RETRIES, DOCK_PER_SIDE, DOCK_GAP, DOCK_OUT } from "./shared";
import { World } from "./core";

/** Tới cách tâm chỗ đỗ chừng này (m) là bắt đầu khai thác; đi hết đường mà còn trong MINE_NEAR m cũng được. */
const MINE_ARRIVE = 1.2;
const MINE_NEAR = 3;
/** Tới nơi mà vẫn chưa vào được chỗ đỗ sau chừng này lần tìm đường lại thì nhả chỗ, chọn lại (không lặp mãi). */
const MINE_RETRIES = 5;


// ------------------------------------------------------------------ Xe Vận Tải

function mineOf(this: World, u: Unit): Mine | null {
  const e = this.byId.get(u.mineId);
  return e && e.cat === "mine" && e.owner === u.side && e.amount > 0 ? e : null;
}

function releaseMine(this: World, u: Unit): void {
  if (!u.mineId) return;
  const e = this.byId.get(u.mineId);
  if (e && e.cat === "mine") {
    const i = e.slots.indexOf(u.id);
    if (i >= 0) e.slots[i] = 0;
  }
  u.mineId = 0;
}

/** Bãi `m` còn chỗ cho xe `u` không (đã giữ chỗ, hoặc còn chỗ trống). */
function mineHasRoom(m: Mine, u: Unit): boolean {
  return m.slots.includes(u.id) || m.slots.includes(0);
}

function assignMine(this: World, u: Unit, preferred: number): boolean {
  const st = this.sides[u.side];
  let best: Mine | null = null;
  const pref = this.byId.get(preferred);
  if (pref && pref.cat === "mine" && pref.owner === u.side && pref.amount > 0 && mineHasRoom(pref, u)) best = pref;
  else if (preferred) return false;
  else {
    let bestD = Infinity;
    for (const m of this.mines) {
      if (m.owner !== u.side || m.amount <= 0 || !mineHasRoom(m, u)) continue;
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
    // nhận chỗ trống có chỗ đỗ gần xe nhất (hòa thì chỗ đánh số nhỏ hơn: thứ tự chỗ đã lật đối xứng theo nửa bản đồ)
    let pick = -1;
    let pd = Infinity;
    for (let i = 0; i < best.slots.length; i++) {
      if (best.slots[i] !== 0) continue;
      const d = dist2(u.x, u.z, best.spots[i].px, best.spots[i].pz);
      if (d < pd) {
        pd = d;
        pick = i;
      }
    }
    if (pick < 0) return false;
    best.slots[pick] = u.id;
    u.mineId = best.id;
    u.hTimer = 0;
  }
  if (u.cargo > 0 && u.cargoRes !== best.res) this.toDock(u);
  else this.goMine(u, best);
  return true;
}

/** Chỗ đỗ của xe `u` ở bãi `m` (chỗ nó đang giữ) và hướng đỗ: [x, z, hướng x, hướng z]. */
function slotPos(this: World, m: Mine, u: Unit): [number, number, number, number] {
  const i = m.slots.indexOf(u.id);
  const sp = m.spots[i >= 0 ? i : 0];
  if (!sp) return [m.x, m.z, u.hx, u.hz];
  return [sp.px, sp.pz, sp.fx, sp.fz];
}

function goMine(this: World, u: Unit, m: Mine): void {
  u.hState = "toMine";
  const [x, z, fx, fz] = this.slotPos(m, u);
  u.tx = x;
  u.tz = z;
  u.faceX = fx;
  u.faceZ = fz;
  this.setPath(u, x, z);
}

/**
 * Ô đỗ dỡ hàng quanh Tổng Hành Dinh (người dùng 10/11/2026: xe tải hay chụm đầu vào một chỗ). Mỗi cạnh `DOCK_PER_SIDE` ô
 * cách nhau `DOCK_GAP` m (rộng hơn bề ngang xe), xe đỗ đầu hướng vào nhà nên các thùng nằm song song, không chồng nhau.
 * Trả về [dx, dz, nx, nz] so với tâm nhà cho phe Lam; phe Đỏ đảo dấu cả bốn số để chọn ô đối xứng tuyệt đối.
 */
function dockSlots(this: World): readonly (readonly [number, number, number, number])[] {
  if (this.docks) return this.docks;
  const r = BUILDINGS.hq.half[0] + DOCK_OUT;
  const out: [number, number, number, number][] = [];
  for (const [nx, nz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const)
    for (let k = 0; k < DOCK_PER_SIDE; k++) {
      const t = (k - (DOCK_PER_SIDE - 1) / 2) * DOCK_GAP;
      out.push([nx * r - nz * t, nz * r + nx * t, nx, nz]);
    }
  return (this.docks = out);
}

function toDock(this: World, u: Unit): void {
  const hq = this.hqOf(u.side);
  if (!hq) {
    u.hState = "idle";
    return;
  }
  // chọn ô đỗ còn trống gần xe nhất; ô đã có xe khác đang tới / đang dỡ thì coi như rất xa (hết ô trống thì chen ô gần nhất)
  const sg = u.side === 0 ? 1 : -1;
  let best = -1;
  let bestD = Infinity;
  const slots = this.dockSlots();
  for (let i = 0; i < slots.length; i++) {
    const sx = hq.x + sg * slots[i][0];
    const sz = hq.z + sg * slots[i][1];
    if (this.grid.blockedAt(sx, sz)) continue;
    let d = dist2(u.x, u.z, sx, sz);
    for (const o of this.units)
      if (o !== u && o.kind === "hauler" && o.side === u.side && (o.hState === "toDock" || o.hState === "unloading") && dist2(o.tx, o.tz, sx, sz) < 0.25) {
        d += 1e6;
        break;
      }
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    const sl = slots[best];
    u.tx = hq.x + sg * sl[0];
    u.tz = hq.z + sg * sl[1];
    u.faceX = -sg * sl[2];
    u.faceZ = -sg * sl[3];
  } else {
    // mọi ô đều bị công trình chắn (hiếm): dỡ ở cạnh nhà gần phía xe đang tới như cũ
    const dx = u.x - hq.x;
    const dz = u.z - hq.z;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    const r = BUILDINGS.hq.half[0] + DOCK_OUT;
    const f = this.grid.nearestFree(hq.x + (dx / l) * r, hq.z + (dz / l) * r, 5) ?? [hq.x + r, hq.z];
    u.tx = f[0];
    u.tz = f[1];
    u.faceX = -dx / l;
    u.faceZ = -dz / l;
  }
  u.hState = "toDock";
  this.setPath(u, u.tx, u.tz);
}

function nearHq(this: World, u: Unit, hq: Building, margin: number): boolean {
  const h = BUILDINGS.hq.half[0] + margin;
  return Math.abs(u.x - hq.x) <= h && Math.abs(u.z - hq.z) <= h;
}

// ------------------------------------------------------------------ Xe Vận Tải: trục vớt xác

/** Xác mà xe đang được giao kéo (còn nằm đó và vẫn do xe này giữ chỗ). */
function wreckOf(this: World, u: Unit): Wreck | null {
  if (!u.wreckId) return null;
  for (const wr of this.wrecks) if (wr.id === u.wreckId) return wr.claim[u.side] === u.id ? wr : null;
  return null;
}

/** Bỏ việc kéo xác (xe nhận lệnh khác): trả chỗ để hậu cần điều xe khác. */
function releaseWreck(this: World, u: Unit): void {
  if (!u.wreckId) return;
  for (const wr of this.wrecks) if (wr.id === u.wreckId && wr.claim[u.side] === u.id) wr.claim[u.side] = 0;
  u.wreckId = 0;
}

/** Giao xe đi kéo một xác (giữ chỗ của phe mình trên xác). Không tìm được đường tới xác thì thôi. */
function startSalvage(this: World, u: Unit, wr: Wreck): void {
  this.releaseWreck(u);
  wr.claim[u.side] = u.id;
  u.wreckId = wr.id;
  u.hState = "toWreck";
  u.hTimer = 0;
  if (!this.setPath(u, wr.x, wr.z)) this.giveUpWreck(u);
}

/**
 * Không tới được xác (tìm đường thất bại / bị chắn mãi): đánh dấu xác "không tới được" với phe này (claim = −1) để
 * hậu cần không giao lại. Tìm đường thất bại rất tốn (A* quét gần cả bản đồ), thử lại mãi là trận chậm hẳn.
 */
function giveUpWreck(this: World, u: Unit): void {
  const wr = this.wreckOf(u);
  if (wr) wr.claim[u.side] = -1;
  u.wreckId = 0;
  this.endSalvage(u);
}

/** Xong (hoặc bỏ) việc kéo xác: có hàng thì chở về, không thì quay lại mỏ cũ, hết việc thì chờ hậu cần giao việc. */
function endSalvage(this: World, u: Unit): void {
  this.releaseWreck(u);
  if (u.cargo > 0 || u.scrap > 0) {
    this.toDock(u);
    return;
  }
  const m = this.mineOf(u);
  if (m) this.goMine(u, m);
  else u.hState = "idle";
}

/** Vùng hậu cần của phe: vùng xây dựng quanh công trình phe mình, hoặc quanh mỏ phe mình đang giữ. */
function inLogistics(this: World, side: Side, x: number, z: number): boolean {
  for (const b of this.buildings) {
    if (b.side !== side || !b.built || b.hp <= 0) continue;
    const zone = BUILDINGS[b.kind].zone;
    if (zone && dist2(b.x, b.z, x, z) <= zone * zone) return true;
  }
  const r = RULES.salvage.mineArea;
  for (const m of this.mines) if (m.owner === side && dist2(m.x, m.z, x, z) <= r * r) return true;
  return false;
}

/** Phe `side` có đang thấy quân địch có vũ khí trong bán kính r quanh (x, z) không. */
function threatened(this: World, side: Side, x: number, z: number, r: number): boolean {
  for (const e of this.units) {
    if (e.side === side || e.hp <= 0 || !UNITS[e.kind].weapon) continue;
    if (dist2(e.x, e.z, x, z) <= r * r && this.visibleTo(side, e)) return true;
  }
  return false;
}

/**
 * Bộ phận hậu cần tự điều xe trục vớt (Tư lệnh không phải ra lệnh từng xe): xe đang trống thùng, không theo lệnh tay,
 * được giao xác gần nhất mà phe mình đang thấy, nằm trong vùng hậu cần, không có địch quanh đó và chưa có xe phe mình nhận.
 * Mỗi phe tối đa `autoMax` xe đi kéo xác cùng lúc để việc khai thác mỏ không bị bỏ bê.
 */
function autoSalvage(this: World, u: Unit): boolean {
  if (u.manual || u.cargo > 0 || u.scrap > 0 || this.wrecks.length === 0) return false;
  const S = RULES.salvage;
  let busy = 0;
  for (const h of this.units) if (h !== u && h.side === u.side && h.wreckId) busy++;
  if (busy >= S.autoMax) return false;
  let best: Wreck | null = null;
  let bestD = Infinity;
  for (const wr of this.wrecks) {
    if (wr.claim[u.side]) continue;
    const d = dist2(u.x, u.z, wr.x, wr.z);
    if (d >= bestD || !this.cellVisible(u.side, wr.x, wr.z) || !this.inLogistics(u.side, wr.x, wr.z) || this.threatened(u.side, wr.x, wr.z, S.threat)) continue;
    bestD = d;
    best = wr;
  }
  if (!best) return false;
  this.startSalvage(u, best);
  return u.wreckId !== 0;
}

function updateHauler(this: World, u: Unit): void {
  switch (u.hState) {
    case "idle": {
      if (u.order === "move") {
        if (this.follow(u)) this.setIdle(u);
        return;
      }
      if (!u.manual && (this.tick + u.id) % 10 === 0) {
        if ((u.cargo > 0 || u.scrap > 0) && this.hqOf(u.side)) this.toDock(u);
        else if (!this.autoSalvage(u)) this.assignMine(u, 0);
      }
      return;
    }
    case "toWreck": {
      const wr = this.wreckOf(u);
      if (!wr) {
        this.endSalvage(u);
        return;
      }
      const R = RULES.salvage.reach;
      if (dist2(u.x, u.z, wr.x, wr.z) <= R * R) {
        u.hState = "salvaging";
        u.hTimer = sec(RULES.salvage.load);
        this.halt(u);
        return;
      }
      // hết đường mà chưa tới (bị xe khác chắn): tìm đường lại vài lần rồi bỏ, đừng tìm lại mãi mỗi tick
      if (this.follow(u) && (++u.hTimer > SALVAGE_RETRIES || !this.setPath(u, wr.x, wr.z))) this.giveUpWreck(u);
      return;
    }
    case "salvaging": {
      const wr = this.wreckOf(u);
      if (!wr) {
        this.endSalvage(u);
        return;
      }
      if (--u.hTimer > 0) return;
      // cẩu xong: xác lên xe, biến khỏi chiến trường; chở về mới thành Sắt
      u.scrap += wr.value;
      this.wrecks.splice(this.wrecks.indexOf(wr), 1);
      u.wreckId = 0;
      this.toDock(u);
      return;
    }
    case "toMine": {
      const m = this.mineOf(u);
      if (!m) {
        this.releaseMine(u);
        u.hState = "idle";
        return;
      }
      // tới đúng chỗ đỗ của mình thì khai thác
      if (dist2(u.x, u.z, u.tx, u.tz) <= MINE_ARRIVE * MINE_ARRIVE) {
        u.hState = "mining";
        this.halt(u);
        return;
      }
      if (this.follow(u)) {
        if (dist2(u.x, u.z, u.tx, u.tz) <= MINE_NEAR * MINE_NEAR) {
          u.hState = "mining";
          this.halt(u);
        } else if (++u.hTimer > MINE_RETRIES) {
          // chỗ này không vào được (bị chắn): nhả chỗ, hậu cần chọn lại bãi / chỗ khác
          this.releaseMine(u);
          u.hState = "idle";
        } else this.goMine(u, m);
      }
      return;
    }
    case "mining": {
      this.turnHull(u, u.faceX, u.faceZ); // vừa khai thác vừa xoay thân cho mũi vào khối quặng / giếng
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
      // chỉ dừng khi tới đúng ô đỗ của mình (trước đây chạm mép nhà là dừng nên cả đoàn chụm vào một góc)
      if (dist2(u.x, u.z, u.tx, u.tz) <= 2) {
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
      this.turnHull(u, u.faceX, u.faceZ); // vừa dỡ vừa xoay thân cho ngay ô đỗ (đầu hướng vào nhà)
      if (--u.hTimer > 0) return;
      const st = this.sides[u.side];
      st[u.cargoRes] += u.cargo;
      if (u.cargoRes === "iron") st.stats.ironMined += u.cargo;
      else st.stats.oilMined += u.cargo;
      u.cargo = 0;
      if (u.scrap > 0) {
        st.iron += u.scrap;
        st.stats.salvaged += u.scrap;
        this.events.push({ t: "salvage", side: u.side, value: u.scrap, x: u.x, z: u.z });
        u.scrap = 0;
      }
      // thùng trống: hậu cần xem có xác nào trong vùng an toàn cần kéo không, không thì về mỏ
      if (this.autoSalvage(u)) return;
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

const methods = { mineOf, releaseMine, assignMine, slotPos, goMine, dockSlots, toDock, nearHq, wreckOf, releaseWreck, startSalvage, giveUpWreck, endSalvage, inLogistics, threatened, autoSalvage, updateHauler };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
