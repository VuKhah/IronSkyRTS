/**
 * Tới gần là tới (T1 kế hoạch A1 làm lại, 16/11/2026: Docs/plans/2026-11-16-A1-tuong-su-doan-ke-hoach.md).
 * Lỗi người dùng quay video 16/11: Lynx được chỉ tới chỗ mà Titan SẮP đứng (lệnh ra lúc Titan còn đang đi). Lúc ra lệnh chỗ đó
 * trống nên đích không bị dời; Titan tới, đứng yên thành vật cản không đẩy được; Lynx bám đích nằm trong thân Titan → trượt vòng
 * quanh mãi, lún vào thân. Chỉ kiểm HÀNH VI, cả hai phe (soi gương qua tâm bản đồ).
 */
import { describe, expect, it } from "vitest";
import { UNITS, type Side, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";

const gap = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

/** Bãi thử: phe 0 đặt quanh arenaPoint(0), phe 1 là ảnh gương qua tâm bản đồ (bản đồ đối xứng (x, z) → (−x, −z)). */
function setup(side: Side) {
  const w = new World(1, { sandbox: true });
  const [cx, cz] = arenaPoint(0);
  const sg = side === 0 ? 1 : -1;
  const at = (dx: number, dz: number) => ({ x: (cx + dx) * sg, z: (cz + dz) * sg });
  const spawn = (kind: UnitId, dx: number, dz: number): Unit => {
    const p = at(dx, dz);
    w.step([{ side, order: { t: "sbSpawn", kind, side, x: p.x, z: p.z } }]);
    return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
  };
  const ts = [-1, 0, 1].map((k) => spawn("titan", k * 8, -30));
  const goal = at(0, 0);
  w.step([{ side, order: { t: "move", ids: ts.map((u) => u.id), x: goal.x, z: goal.z } }]);
  return { w, ts, spawn, at };
}

describe("đường đi không xuyên qua quân đứng", () => {
  // Thí nghiệm người dùng 16/11: 1 Titan đứng; Lynx đậu bên trái, mũi quay vào Titan; lệnh qua bên phải cách 4 m. Trước khi sửa:
  // A* miễn trừ vùng 4 m quanh chỗ đứng cả với quân đứng → đường xuyên tâm Titan → Lynx trượt vòng quanh Titan mãi (12/108 ca).
  for (const side of [0, 1] as const)
    for (const along of [-2, 0, 2])
      it(`Lynx bên trái Titan đứng, lệnh sang phải 4 m (dọc ${along}): tới nơi, không lún vào Titan (phe ${side})`, () => {
        const w = new World(1, { sandbox: true });
        const [cx0, cz0] = arenaPoint(0);
        const sg = side === 0 ? 1 : -1;
        const spawn = (kind: UnitId, x: number, z: number): Unit => {
          w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
          return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
        };
        const ti = spawn("titan", cx0 * sg, cz0 * sg);
        for (let t = 0; t < sec(2); t++) w.step([]);
        const fx = ti.hx, fz = ti.hz, lx = -fz, lz = fx;
        const ly = spawn("lynx", ti.x + lx * 5 + fx * along, ti.z + lz * 5 + fz * along);
        // mũi Lynx quay vào Titan (đặt thẳng trạng thái: lệnh thả quân không có hướng)
        const dx = ti.x - ly.x, dz = ti.z - ly.z, d = Math.sqrt(dx * dx + dz * dz);
        ly.hx = ly.phx = dx / d;
        ly.hz = ly.phz = dz / d;
        for (let t = 0; t < sec(1.5); t++) w.step([]);
        const g = { x: ti.x - lx * 4 + fx * along, z: ti.z - lz * 4 + fz * along };
        w.step([{ side, order: { t: "move", ids: [ly.id], x: g.x, z: g.z } }]);
        const touch = UNITS.titan.bodyR! + UNITS.lynx.bodyR!;
        let overlap = 0;
        for (let t = 0; t < sec(20); t++) {
          w.step([]);
          if (gap(ti, ly) < touch - 0.3) overlap++;
        }
        expect(ly.order, "Lynx phải dừng").toBe("idle");
        expect(overlap / 10, "giây lún vào thân Titan").toBeLessThan(0.5);
        // tới bên phải Titan (không đứng lại bên trái)
        expect((ly.x - ti.x) * lx + (ly.z - ti.z) * lz).toBeLessThan(-2);
      });
});

describe("tới gần là tới", () => {
  for (const side of [0, 1] as const) {
    it(`Lynx chỉ tới chỗ Titan sắp đứng (lệnh lúc Titan còn đi): dừng được, không lún vào thân Titan (phe ${side})`, () => {
      // chỗ Titan giữa đứng xong
      const ref = setup(side);
      for (let t = 0; t < sec(30); t++) ref.w.step([]);
      const spot = { x: ref.ts[1].x, z: ref.ts[1].z };

      const { w, ts, spawn } = setup(side);
      const lx = spawn("lynx", 3, -45);
      for (let t = 0; t < sec(3); t++) w.step([]);
      w.step([{ side, order: { t: "move", ids: [lx.id], x: spot.x, z: spot.z } }]);
      const touch = UNITS.titan.bodyR! + UNITS.lynx.bodyR!;
      let overlap = 0;
      for (let t = 0; t < sec(25); t++) {
        w.step([]);
        if (ts.some((u) => gap(u, lx) < touch - 0.3)) overlap++;
      }
      expect(lx.order, "Lynx phải dừng").toBe("idle");
      expect(overlap / 10, "giây lún vào thân Titan").toBeLessThan(1);
      // dừng gần đích (sát Titan đang chiếm chỗ), không bỏ cuộc ở xa
      expect(gap(lx, spot)).toBeLessThan(UNITS.titan.spaceR! + UNITS.lynx.spaceR! + 2);
    });

    it(`chiều ngược: Lynx tới đứng vào ô của Titan trước, Titan trong đội hình tới sau không lún vào Lynx, đội tới nơi (phe ${side})`, () => {
      const ref = setup(side);
      for (let t = 0; t < sec(30); t++) ref.w.step([]);
      const spot = { x: ref.ts[1].x, z: ref.ts[1].z };

      const { w, ts, spawn, at } = setup(side);
      const near = at(0, -6);
      const lx = spawn("lynx", 0, -6);
      w.step([{ side, order: { t: "move", ids: [lx.id], x: spot.x, z: spot.z } }]);
      expect(gap(lx, near)).toBeLessThan(1);
      const touch = UNITS.titan.bodyR! + UNITS.lynx.bodyR!;
      let overlap = 0;
      for (let t = 0; t < sec(30); t++) {
        w.step([]);
        if (ts.some((u) => gap(u, lx) < touch - 0.3)) overlap++;
      }
      expect(overlap / 10, "giây Titan lún vào Lynx").toBeLessThan(1);
      for (const u of ts) expect(u.order, `Titan ${u.id} phải tới nơi`).toBe("idle");
    });
  }
});
