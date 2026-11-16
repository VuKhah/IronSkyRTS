/**
 * Tới nơi khi đích bị quân cùng phe chiếm (kế hoạch A1 làm lại, 16/11/2026: Docs/plans/2026-11-16-A1-tuong-su-doan-ke-hoach.md).
 * Lỗi người dùng quay video 16/11: Lynx được chỉ tới chỗ mà Titan SẮP đứng (lệnh ra lúc Titan còn đang đi). Lúc ra lệnh chỗ đó
 * trống nên đích không bị dời; Titan tới, đứng yên thành vật cản không đẩy được; Lynx bám đích nằm trong thân Titan → trượt vòng
 * quanh mãi, lún vào thân. Chỉ kiểm HÀNH VI.
 */
import { describe, expect, it } from "vitest";
import { UNITS, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";

function spawn(w: World, kind: UnitId, x: number, z: number): Unit {
  w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x, z } }]);
  return w.units.filter((u) => u.side === 0 && u.kind === kind).pop()!;
}
const gap = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

/** 3 Titan lệnh nhóm tới (cx, cz); trả về World và các xe sau `after` tick. */
function titans(after: number): { w: World; ts: Unit[]; cx: number; cz: number } {
  const w = new World(1, { sandbox: true });
  const [cx, cz] = arenaPoint(0);
  const ts = [-1, 0, 1].map((k) => spawn(w, "titan", cx + k * 8, cz - 30));
  w.step([{ side: 0, order: { t: "move", ids: ts.map((u) => u.id), x: cx, z: cz } }]);
  for (let t = 0; t < after; t++) w.step([]);
  return { w, ts, cx, cz };
}

describe("tới nơi khi đích bị quân cùng phe chiếm", () => {
  // TODO(T1 "tới gần là tới"): bỏ .fails khi luật xong
  it.fails("Lynx chỉ tới chỗ Titan sắp đứng (lệnh lúc Titan còn đi): dừng được, không lún vào thân Titan", () => {
    // chỗ Titan giữa đứng xong
    const ref = titans(sec(30));
    const spot = { x: ref.ts[1].x, z: ref.ts[1].z };

    const { w, ts, cx, cz } = titans(0);
    const lx = spawn(w, "lynx", cx + 3, cz - 45);
    for (let t = 0; t < sec(3); t++) w.step([]);
    w.step([{ side: 0, order: { t: "move", ids: [lx.id], x: spot.x, z: spot.z } }]);
    const touch = UNITS.titan.bodyR! + UNITS.lynx.bodyR!;
    let overlap = 0;
    for (let t = 0; t < sec(25); t++) {
      w.step([]);
      if (ts.some((u) => gap(u, lx) < touch - 0.3)) overlap++;
    }
    expect(lx.order, "Lynx phải dừng").toBe("idle");
    expect(overlap / 10, "giây lún vào thân Titan").toBeLessThan(1);
  });
});
