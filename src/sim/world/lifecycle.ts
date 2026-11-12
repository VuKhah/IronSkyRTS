/** Xác quân, dọn thực thể chết, sương mù, thắng thua. */
import { BUILDINGS, RULES, UNITS, valueOf, type Res, type Side } from "../content";
import { CELL } from "../maps";
import type { Building, SideState, Unit, WinReason, Wreck } from "../types";
import { sec, AIRBORNE_ALT, rays, disc } from "./shared";
import { World } from "./core";


/** Xác quân: để lại xác chứa Sắt (trừ khi rơi xuống chỗ xe không tới được: sông, đá). */
function leaveWreck(this: World, u: Unit): void {
  if (this.sold.delete(u.id) || this.grid.blockedAt(u.x, u.z)) return;
  const S = RULES.salvage;
  // Xe Vận Tải bị hạ khi đang chở xác: phần xác đang chở rơi lại cùng xác xe, ai tới kéo trước thì được
  const value = Math.round(valueOf(u.kind) * S.share) + u.scrap;
  if (value <= 0) return;
  this.wrecks.push({ id: this.nextId++, kind: u.kind, side: u.side, x: u.x, z: u.z, hx: u.hx, hz: u.hz, value, until: this.tick + sec(S.seconds), claim: [0, 0] });
}

/**
 * Xác quân hết hạn thì biến mất, trừ khi đang có Xe Vận Tải tới kéo. Chỗ giữ của xe đã bị hạ / đổi việc thì trả lại.
 * Xác KHÔNG tự cộng tài nguyên: chỉ Xe Vận Tải cẩu lên và chở về mới thành Sắt (updateHauler).
 */
function updateWrecks(this: World): void {
  if (this.wrecks.length === 0) return;
  const keep: Wreck[] = [];
  for (const wr of this.wrecks) {
    let towing = false;
    for (const s of [0, 1] as Side[]) {
      const id = wr.claim[s];
      if (id <= 0) continue;
      const h = this.byId.get(id);
      if (h && h.cat === "unit" && h.hp > 0 && h.wreckId === wr.id) towing = true;
      else wr.claim[s] = 0;
    }
    if (towing || this.tick < wr.until) keep.push(wr);
  }
  this.wrecks = keep;
}

function cleanup(this: World): void {
  let deadUnits = false;
  for (const u of this.units) if (u.hp <= 0) deadUnits = true;
  if (deadUnits) {
    const alive: Unit[] = [];
    for (const u of this.units) {
      if (u.hp > 0) {
        alive.push(u);
        continue;
      }
      this.byId.delete(u.id);
      this.releaseMine(u);
      this.releasePad(u);
      this.sides[u.side].stats.unitsLost++;
      if (this.commanders[u.side] === u) this.commanders[u.side] = null;
      this.events.push({ t: "death", id: u.id, kind: u.kind, side: u.side, x: u.x, z: u.z, alt: u.alt, building: false, crash: u.crashed, sold: false });
      this.leaveWreck(u);
    }
    this.units = alive;
  }
  let deadBuildings = false;
  for (const b of this.buildings) if (b.hp <= 0) deadBuildings = true;
  if (deadBuildings) {
    const alive: Building[] = [];
    for (const b of this.buildings) {
      if (b.hp > 0) {
        alive.push(b);
        continue;
      }
      this.byId.delete(b.id);
      this.grid.block(b.cells, -1);
      for (const st of this.sides) st.known.delete(b.id);
      if (b.kind === "airfield")
        for (const u of this.units)
          if (u.padB === b.id) {
            u.padB = 0;
            u.padI = -1;
          }
      const sold = this.sold.delete(b.id);
      this.events.push({ t: "death", id: b.id, kind: b.kind, side: b.side, x: b.x, z: b.z, alt: 0, building: true, crash: false, sold });
    }
    this.buildings = alive;
  }
}

// ------------------------------------------------------------------ sương mù & thắng thua

/** Đánh dấu cả vòng tròn tầm nhìn là thấy (máy bay, Radar, Đài Liên Lạc: không bị tầng hay rừng che). */
function stamp(this: World, st: SideState, x: number, z: number, sight: number): void {
  this.stampDisc(st.vis, st, x, z, sight);
  this.stampDisc(st.visAir, null, x, z, sight);
}

/** Đánh dấu vòng tròn tầm nhìn vào lưới `grid` (và vào ô đã khám phá nếu có `st`). */
function stampDisc(this: World, grid: Uint8Array, st: SideState | null, x: number, z: number, sight: number): void {
  const r = Math.round(sight / CELL);
  const cx = this.grid.colOf(x, z);
  const cz = this.grid.rowOf(x, z);
  const d = disc(r);
  const C = this.grid.cols;
  const R = this.grid.rows;
  for (let k = 0; k < d.length; k += 2) {
    const nx = cx + d[k];
    const nz = cz + d[k + 1];
    if (nx < 0 || nz < 0 || nx >= C || nz >= R) continue;
    const i = nz * C + nx;
    grid[i] = 1;
    if (st) st.explored[i] = 1;
  }
}

/**
 * Tầm nhìn của quân mặt đất / công trình theo ĐỊA HÌNH BẬC THANG (người dùng chốt 11/11/2026): bắn tia từ chỗ đứng ra
 * từng ô biên của vùng nhìn, đi dọc tia:
 * - ô ở tầng CAO HƠN tầng mình đứng thì không thấy, và che hết phần tia phía sau nó (vách, mỏm đá, vách rìa cũng vậy);
 * - ô ở tầng bằng hoặc thấp hơn thì thấy: đứng trên cao nhìn xuống được hết.
 * Rừng (cellLos) cùng tầng hoặc cao hơn chỗ đứng thì che: ô rừng đầu tiên vẫn thấy (bìa rừng), các ô sau nó bị che. Đứng
 * TRONG rừng thì tia nhìn bỏ qua các ô rừng liền với chỗ mình đứng cho tới khi ra khỏi rừng (như bụi rậm). Rừng ở tầng
 * thấp hơn không che người đứng trên cao. Chỉ có phép so sánh số nguyên nên tất định.
 * Mọi ô trên tia, kể cả phần bị che, được đánh dấu vào `visAir` (máy bay trên trời thì thấy được, không bị che).
 */
function stampLos(this: World, st: SideState, x: number, z: number, sight: number): void {
  const r = Math.round(sight / CELL);
  const cx = this.grid.colOf(x, z);
  const cz = this.grid.rowOf(x, z);
  const C = this.grid.cols;
  const R = this.grid.rows;
  const c0 = cz * C + cx;
  st.vis[c0] = 1;
  st.visAir[c0] = 1;
  st.explored[c0] = 1;
  const { off, start } = rays(r);
  const A = st.visAir;
  const V = this.map.visTier;
  const L = this.cellLos;
  const vt = V[c0];
  const inForest = L[c0] > 0;
  for (let k = 0; k + 1 < start.length; k++) {
    let inside = inForest;
    // tia đã bị che thì vẫn đi tiếp tới hết tầm, chỉ đánh dấu cho máy bay (một lượt thay cho tô thêm cả vòng tròn)
    let hidden = false;
    for (let j = start[k]; j < start[k + 1]; j++) {
      const nx = cx + off[j * 2];
      const nz = cz + off[j * 2 + 1];
      if (nx < 0 || nz < 0 || nx >= C || nz >= R) break;
      const idx = nz * C + nx;
      A[idx] = 1;
      if (hidden) continue;
      const t = V[idx];
      if (t > vt) {
        hidden = true;
        continue;
      }
      st.vis[idx] = 1;
      st.explored[idx] = 1;
      if (L[idx] > 0 && t >= vt) {
        if (!inside) hidden = true;
      } else inside = false;
    }
  }
}

function updateFog(this: World): void {
  for (const s of [0, 1] as Side[]) {
    const st = this.sides[s];
    st.vis.fill(0);
    st.visAir.fill(0);
    for (const u of this.units) {
      if (u.side !== s) continue;
      const air = u.alt > AIRBORNE_ALT;
      const sight = this.sightOf(UNITS[u.kind].sight, u.x, u.z, air);
      // máy bay ở trên cao hơn mọi tầng: không bị che
      if (air) this.stamp(st, u.x, u.z, sight);
      else this.stampLos(st, u.x, u.z, sight);
    }
    for (const b of this.buildings) {
      if (b.side !== s) continue;
      const spec = BUILDINGS[b.kind];
      // Trạm Radar có điện: nhìn xuyên sương mù (và xuyên tầng) cả vùng rộng
      if (spec.radarSight && b.active) this.stamp(st, b.x, b.z, spec.radarSight);
      else this.stampLos(st, b.x, b.z, this.sightOf(spec.sight, b.x, b.z, false) * (b.built ? 1 : 0.6));
    }
    // Đài Liên Lạc của mình: nhìn xa quanh đài (cột ăng-ten cao, không bị tầng che)
    for (const up of this.uplinks) if (up.owner === s) this.stamp(st, up.x, up.z, RULES.uplink.sight);
    for (const b of this.buildings) if (b.side !== s && !st.known.has(b.id) && this.visibleTo(s, b)) st.known.add(b.id);
  }
}

function checkVictory(this: World): void {
  const lost: [WinReason | null, WinReason | null] = [null, null];
  for (const s of [0, 1] as Side[]) {
    if (!this.commanderOf(s)) lost[s] = "commander";
    else if (!this.buildings.some((b) => b.side === s && b.hp > 0)) lost[s] = "buildings";
  }
  const monoWinners: Side[] = [];
  for (const s of [0, 1] as Side[]) {
    const st = this.sides[s];
    let res: Res | null = null;
    for (const r of ["iron", "oil"] as Res[]) {
      let all = true;
      for (const m of this.mines) if (m.res === r && m.owner !== s) all = false;
      if (all) {
        res = r;
        break;
      }
    }
    if (res) {
      if (st.monoRes !== res) {
        st.mono = 0;
        st.monoRes = res;
        this.events.push({ t: "monopoly", side: s, res });
      }
      st.mono++;
      if (st.mono >= sec(RULES.monopolySeconds)) monoWinners.push(s);
    } else {
      st.mono = 0;
      st.monoRes = null;
    }
  }
  let winner: Side | 2 | -1 = -1;
  let reason: WinReason | null = null;
  if (lost[0] && lost[1]) {
    winner = 2;
    reason = lost[0];
  } else if (lost[0]) {
    winner = 1;
    reason = lost[0];
  } else if (lost[1]) {
    winner = 0;
    reason = lost[1];
  } else if (monoWinners.length === 2) {
    winner = 2;
    reason = "monopoly";
  } else if (monoWinners.length === 1) {
    winner = monoWinners[0];
    reason = "monopoly";
  } else if (this.maxTicks > 0 && this.tick + 1 >= this.maxTicks) {
    winner = 2;
    reason = "timeout";
  }
  if (winner !== -1 && reason) {
    this.winner = winner;
    this.winReason = reason;
    this.events.push({ t: "end", winner, reason });
  }
}

const methods = { leaveWreck, updateWrecks, cleanup, stamp, stampDisc, stampLos, updateFog, checkVictory };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
