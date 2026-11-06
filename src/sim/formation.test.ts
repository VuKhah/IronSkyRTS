/**
 * Kiểm thử đội hình (người dùng 06/11/2026: "dàn quân thông minh: xếp hàng ngay ngắn, không dính cục"):
 * hàng ngang quay theo hướng hành quân, khoảng cách theo kích cỡ xe, hàng đầu / giữa / sau theo vai trò,
 * tới nơi quay cùng một hướng; xe đang chạy nhường xe đã đứng yên (lách qua, không xô lệch hàng).
 * Chỉ kiểm HÀNH VI, không khóa con số (khe hở, tỉ lệ bề ngang có thể chỉnh).
 */
import { describe, expect, it } from "vitest";
import { UNITS, type UnitId } from "./content";
import { Rng } from "./fmath";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}

/** Thả một nhóm lộn xộn quanh arenaPoint(-22), ra lệnh đi tới arenaPoint(22), chờ cả nhóm tới nơi. */
function march(kinds: UnitId[]): { w: World; us: Unit[]; tx: number; tz: number } {
  const w = new World(1, { sandbox: true });
  const rng = new Rng(5);
  const [ax, az] = arenaPoint(-22);
  for (const k of kinds) spawn(w, k, ax + (rng.next() - 0.5) * 14, az + (rng.next() - 0.5) * 14);
  const us = w.units.filter((u) => u.side === 0);
  const [tx, tz] = arenaPoint(22);
  w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: tx, z: tz } }]);
  for (let t = 0; t < sec(60) && us.some((u) => u.order !== "idle"); t++) w.step([]);
  return { w, us, tx, tz };
}

describe("đội hình khi ra lệnh cho cả nhóm", () => {
  it("10 Titan: hàng ngang ngay ngắn quanh điểm đích, không xe nào chạm nhau, cùng quay một hướng", () => {
    const { us, tx, tz } = march(Array<UnitId>(10).fill("titan"));
    expect(us.every((u) => u.order === "idle")).toBe(true);
    const fx = us[0].faceX;
    const fz = us[0].faceZ;
    // không chạm nhau: tâm cách nhau ít nhất 2 bán kính
    const r = UNITS.titan.radius;
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) expect(Math.sqrt((us[i].x - us[j].x) ** 2 + (us[i].z - us[j].z) ** 2)).toBeGreaterThanOrEqual(2 * r);
    // cùng hướng = hướng hành quân
    for (const u of us) expect(u.hx * fx + u.hz * fz).toBeGreaterThan(0.999);
    // hàng ngang: vị trí theo chiều sâu chỉ có vài mức (mỗi hàng một mức), bề ngang rộng hơn bề sâu
    const fwd = us.map((u) => (u.x - tx) * fx + (u.z - tz) * fz);
    const lat = us.map((u) => (u.x - tx) * fz - (u.z - tz) * fx);
    const rows = new Set(fwd.map((v) => Math.round(v)));
    expect(rows.size).toBeLessThanOrEqual(3);
    expect(Math.max(...lat) - Math.min(...lat)).toBeGreaterThan(Math.max(...fwd) - Math.min(...fwd));
    // tâm khối ở điểm đích
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length;
    const cz = us.reduce((s, u) => s + u.z, 0) / us.length;
    expect(Math.sqrt((cx - tx) ** 2 + (cz - tz) ** 2)).toBeLessThan(2);
  });

  it("đội hỗn hợp: xe giáp hàng đầu, hỏa lực tầm xa phía sau", () => {
    const { us, tx, tz } = march(["artillery", "rocket", "titan", "skyguard", "titan", "lynx", "skyguard", "titan"]);
    const fx = us[0].faceX;
    const fz = us[0].faceZ;
    const fwd = (u: Unit): number => (u.x - tx) * fx + (u.z - tz) * fz;
    const of = (f: "front" | "mid" | "back"): number[] => us.filter((u) => UNITS[u.kind].formation === f).map(fwd);
    for (const f of ["front", "mid", "back"] as const) expect(of(f).length, f).toBeGreaterThan(0);
    expect(Math.min(...of("front"))).toBeGreaterThan(Math.max(...of("mid")));
    expect(Math.min(...of("mid"))).toBeGreaterThan(Math.max(...of("back")));
  });

  it("hành quân: cả khối đi theo tốc độ xe chậm nhất, mọi xe bám sát ô của mình suốt đường", () => {
    const w = new World(1, { sandbox: true });
    const rng = new Rng(3);
    const [ax, az] = arenaPoint(-24);
    for (const k of ["lynx", "lynx", "titan", "titan", "artillery"] as UnitId[]) spawn(w, k, ax + (rng.next() - 0.5) * 10, az + (rng.next() - 0.5) * 10);
    const us = w.units.filter((u) => u.side === 0);
    const [tx, tz] = arenaPoint(30);
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: tx, z: tz } }]);
    const sq = w.squads[0];
    const slow = Math.min(...us.map((u) => UNITS[u.kind].speed));
    let marched = 0;
    let worst = 0;
    for (let i = 0; i < sec(60) && w.squads.includes(sq); i++) {
      const s0 = sq.s;
      w.step([]);
      if (sq.phase !== "march") continue;
      marched++;
      expect(sq.s - s0).toBeLessThanOrEqual(slow * 0.1 + 1e-9);
      for (const u of us) {
        const k = sq.ids.indexOf(u.id);
        const [sx, sz] = (w as unknown as { squadSlot(q: unknown, i: number): number[] }).squadSlot(sq, k);
        worst = Math.max(worst, Math.sqrt((u.x - sx) ** 2 + (u.z - sz) ** 2));
      }
    }
    expect(marched, "có hành quân").toBeGreaterThan(sec(5));
    expect(worst, "không xe nào tụt khỏi ô quá 2,5 m").toBeLessThan(2.5);
    expect(us.every((u) => u.order === "idle")).toBe(true);
  });

  it("quay đầu 180°: cả khối xoay như cánh cửa, hàng đầu vẫn là hàng đầu", () => {
    const { w, us, tx, tz } = march(Array<UnitId>(6).fill("titan"));
    const fx = us[0].hx;
    const fz = us[0].hz;
    const front = new Set(us.filter((u) => (u.x - tx) * fx + (u.z - tz) * fz > 0).map((u) => u.id));
    const [bx, bz] = arenaPoint(-6);
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: bx, z: bz } }]);
    expect(w.squads[0].phase, "đội đã vào hàng: xoay chứ không tập hợp lại").toBe("wheel");
    for (let i = 0; i < sec(90) && w.squads.length; i++) w.step([]);
    const gx = us[0].hx;
    const gz = us[0].hz;
    expect(gx * fx + gz * fz, "đã quay ngược hướng").toBeLessThan(-0.5);
    const front2 = new Set(us.filter((u) => (u.x - bx) * gx + (u.z - bz) * gz > 0).map((u) => u.id));
    expect([...front2].sort()).toEqual([...front].sort());
  });

  it("qua cầu hẹp: đội hình co thành hàng một / hàng đôi, qua hết rồi giãn lại ở đích", () => {
    // cầu trên Thung Lũng Sông Sắt: rộng 9 m, vuông góc dòng sông chạy chéo bản đồ
    const S = Math.SQRT1_2;
    const bx = -56 * S;
    const bz = -56 * S;
    const w = new World(1, { sandbox: true });
    for (let i = 0; i < 10; i++) spawn(w, "titan", bx - S * 28 + ((i % 5) - 2) * 5 * S, bz + S * 28 + ((i % 5) - 2) * 5 * S + Math.floor(i / 5) * 5);
    const us = w.units.filter((u) => u.side === 0);
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: bx + S * 30, z: bz - S * 30 } }]);
    const sq = w.squads[0];
    let narrowest = sq.cols;
    for (let i = 0; i < sec(90) && w.squads.includes(sq); i++) {
      w.step([]);
      narrowest = Math.min(narrowest, sq.cols);
    }
    expect(narrowest, "phải co hàng để qua cầu").toBeLessThanOrEqual(2);
    // mọi xe đã sang bờ bên kia và dàn lại thành hàng ngang (vài mức theo chiều sâu)
    for (const u of us) expect((u.x - bx) * -S + (u.z - bz) * S, `xe #${u.id} đã qua sông`).toBeLessThan(-5);
    expect(sq.cols).toBe(sq.colsMax);
  });

  it("đi-và-đánh: gặp địch trong tầm thì cả khối dừng lại bắn, không xe nào bỏ hàng đi đuổi", () => {
    const w = new World(1, { sandbox: true });
    const [ax, az] = arenaPoint(-26);
    const us = [spawn(w, "titan", ax, az), spawn(w, "titan", ax + 5, az), spawn(w, "titan", ax, az + 5)];
    const [ex, ez] = arenaPoint(10);
    spawn(w, "power-pylon" as UnitId, ex, ez, 1);
    w.step([{ side: 1, order: { t: "sbHold", side: 1, on: true } }]);
    const [tx, tz] = arenaPoint(30);
    w.step([{ side: 0, order: { t: "amove", ids: us.map((u) => u.id), x: tx, z: tz } }]);
    const sq = w.squads[0];
    let held = false;
    for (let i = 0; i < sec(40) && w.squads.includes(sq); i++) {
      const s0 = sq.s;
      w.step([]);
      if (sq.phase === "march" && sq.s === s0 && w.buildings.some((b) => b.side === 1 && b.hp > 0)) held = true;
    }
    expect(held, "có lúc cả khối đứng lại bắn").toBe(true);
    expect(w.buildings.some((b) => b.side === 1 && b.kind === "power-pylon" && b.hp > 0), "đã diệt mục tiêu").toBe(false);
  });

  it("xe đang chạy lách qua xe đã đứng yên, không xô lệch nó khỏi chỗ", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const still = spawn(w, "titan", x, z);
    for (let i = 0; i < 5; i++) w.step([]);
    const [ax, az] = arenaPoint(-14);
    const [bx, bz] = arenaPoint(14);
    const mover = spawn(w, "titan", ax, az);
    w.step([{ side: 0, order: { t: "move", ids: [mover.id], x: bx, z: bz } }]);
    let maxShift = 0;
    for (let i = 0; i < sec(20) && mover.order !== "idle"; i++) {
      w.step([]);
      maxShift = Math.max(maxShift, Math.sqrt((still.x - x) ** 2 + (still.z - z) ** 2));
    }
    expect(mover.order, "xe chạy tới được đích").toBe("idle");
    expect(Math.sqrt((mover.x - bx) ** 2 + (mover.z - bz) ** 2)).toBeLessThan(2.5);
    expect(maxShift, "xe đứng chỉ xê dịch chút ít").toBeLessThan(1.5);
  });
});
