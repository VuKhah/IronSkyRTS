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

  it("đi theo nhóm: không xe nào chạy nhanh hơn xe chậm nhất trong lúc hành quân", () => {
    const w = new World(1, { sandbox: true });
    const [ax, az] = arenaPoint(-22);
    const lynx = spawn(w, "lynx", ax, az);
    const arty = spawn(w, "artillery", ax + 6, az);
    const [tx, tz] = arenaPoint(22);
    w.step([{ side: 0, order: { t: "move", ids: [lynx.id, arty.id], x: tx, z: tz } }]);
    const slow = Math.min(UNITS.lynx.speed, UNITS.artillery.speed);
    for (let i = 0; i < sec(4); i++) {
      const x0 = lynx.x;
      const z0 = lynx.z;
      w.step([]);
      expect(Math.sqrt((lynx.x - x0) ** 2 + (lynx.z - z0) ** 2)).toBeLessThanOrEqual(slow * 0.1 * 1.3 + 1e-9);
    }
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
