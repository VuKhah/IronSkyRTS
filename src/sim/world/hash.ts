/** Băm trạng thái trận (cùng seed + cùng lệnh phải ra cùng mã băm). */
import { FORMATIONS } from "../content";
import type { World } from "./core";


/** Mã băm trạng thái trận (FNV-1a trên từng bit của các số): hai máy chạy cùng lệnh phải ra cùng mã. */
export function hashWorld(w: World): number {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  const mix = (n: number): void => {
    h = Math.imul(h ^ n, 16777619);
  };
  const num = (v: number): void => {
    f64[0] = v;
    mix(u32[0]);
    mix(u32[1]);
  };
  num(w.tick);
  for (const s of w.sides) {
    num(s.mobilizeUntil);
    num(s.retreatLevel);
    num(s.droneFrac);
    num(s.iron);
    num(s.oil);
    num(s.mono);
    num(s.eff);
    num(s.battery);
  }
  for (const u of w.units) {
    num(u.id);
    num(u.x);
    num(u.z);
    num(u.hp);
    num(u.alt);
    num(u.fuel);
    num(u.cargo);
    num(u.cooldown);
    num(u.burst);
    num(u.still);
    num(u.faceX);
    num(u.faceZ);
    num(u.squad);
    num(u.lot);
    num(u.formation === null ? -1 : Object.keys(FORMATIONS).indexOf(u.formation));
    num(u.aimX);
    num(u.aimZ);
    num(u.pd);
    num(u.yawRate);
    num(u.shieldOn);
    num(u.shieldIdle);
    num(u.threat);
    num(u.ammo2);
    num(u.cd2);
    num(u.xp);
    num(u.rank);
    num(u.wreckId);
    num(u.scrap);
  }
  for (const sq of w.squads) {
    num(sq.id);
    num(sq.ids.length);
    num(sq.cols);
    num(sq.x);
    num(sq.z);
    num(sq.hx);
    num(sq.hz);
    num(sq.s);
    num(sq.phaseT);
    num(sq.rolling ? 1 : 0);
  }
  for (const b of w.buildings) {
    num(b.id);
    num(b.rot);
    num(b.hp);
    num(b.progress);
    num(b.queue.length);
    num(b.prog);
    num(b.aimX);
    num(b.aimZ);
  }
  for (const wr of w.wrecks) {
    num(wr.id);
    num(wr.until);
    num(wr.claim[0]);
    num(wr.claim[1]);
  }
  for (const up of w.uplinks) {
    num(up.owner);
    num(up.cap);
  }
  for (const m of w.mines) {
    num(m.amount);
    num(m.owner);
    num(m.cap);
  }
  num(w.shots.length);
  return h >>> 0;
}
