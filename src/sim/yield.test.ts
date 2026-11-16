/**
 * NHƯỜNG ĐƯỜNG CHỦ ĐỘNG (T2 kế hoạch A1 làm lại, người dùng duyệt 16/11/2026; Docs/plans/2026-11-16-A1-tuong-su-doan-ke-hoach.md):
 * xe đứng cùng phe nằm trên đường sắp đi của xe khác thì tự dạt ra vừa đủ (chạy theo trục xích: tiến / lùi, xoay ít, KHÔNG trượt
 * ngang), xe kia qua rồi thì về ô. Quân cố định (đã hạ bệ) không nhường: xe kia đi vòng. Chỉ kiểm HÀNH VI, cả hai phe (bản đồ
 * đối xứng (x, z) → (−x, −z)).
 */
import { describe, expect, it } from "vitest";
import { UNITS, type Side, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";
import { bodyRadius } from "./world/shared";

const gap = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

function arena(side: Side) {
  const w = new World(1, { sandbox: true });
  const [cx, cz] = arenaPoint(0);
  const sg = side === 0 ? 1 : -1;
  const at = (dx: number, dz: number) => ({ x: (cx + dx) * sg, z: (cz + dz) * sg });
  const spawn = (kind: UnitId, dx: number, dz: number): Unit => {
    const p = at(dx, dz);
    w.step([{ side, order: { t: "sbSpawn", kind, side, x: p.x, z: p.z } }]);
    return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
  };
  /** Đặt hướng thân theo khung bãi thử (phe 1 tự soi gương). */
  const face = (u: Unit, fx: number, fz: number): void => {
    const l = Math.sqrt(fx * fx + fz * fz);
    u.hx = u.phx = (fx / l) * sg;
    u.hz = u.phz = (fz / l) * sg;
    u.faceX = u.hx;
    u.faceZ = u.hz;
  };
  const move = (u: Unit, dx: number, dz: number): void => {
    const p = at(dx, dz);
    w.step([{ side, order: { t: "move", ids: [u.id], x: p.x, z: p.z } }]);
  };
  /** Toạ độ trong khung bãi thử (bỏ soi gương). */
  const local = (u: { x: number; z: number }) => ({ dx: u.x * sg - cx, dz: u.z * sg - cz });
  return { w, at, spawn, face, move, local };
}

/** Theo dõi: thân chồng nhau (giây), xe nào trượt ngang (bước lệch trục xích), xe đứng bị xô xa nhất khỏi ô. */
function watch(w: World, ticks: number, stand: Unit[], all: Unit[], cross?: { u: Unit; local: (u: Unit) => { dx: number; dz: number } }) {
  const home = stand.map((u) => ({ x: u.x, z: u.z }));
  let overlap = 0;
  let sideSlip = 0;
  let worstSlip = 0;
  let farthest = 0;
  /** Chỗ (ngang) xe đi băng qua đường thẳng của hàng (dz = 0); NaN = chưa băng qua. */
  let crossAt = NaN;
  for (let t = 0; t < ticks; t++) {
    const before = cross ? cross.local(cross.u).dz : 0;
    const prev = all.map((u) => ({ x: u.x, z: u.z }));
    w.step([]);
    let lap = false;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) if (gap(all[i], all[j]) < bodyRadius(all[i].kind) + bodyRadius(all[j].kind) - 0.3) lap = true;
    if (lap) overlap++;
    // trượt ngang: thành phần bước đi vuông góc trục thân (xe đứng nhường phải chạy theo xích)
    stand.forEach((u) => {
      const k = all.indexOf(u);
      const dx = u.x - prev[k].x;
      const dz = u.z - prev[k].z;
      const lat = Math.abs(dx * u.hz - dz * u.hx);
      worstSlip = Math.max(worstSlip, lat);
      if (lat > 0.03) sideSlip++;
    });
    stand.forEach((u, i) => (farthest = Math.max(farthest, gap(u, home[i]))));
    if (cross && Number.isNaN(crossAt) && before < 0 && cross.local(cross.u).dz >= 0) crossAt = cross.local(cross.u).dx;
  }
  const back = Math.max(...stand.map((u, i) => gap(u, home[i])));
  return { overlap: overlap / 10, sideSlip, worstSlip, farthest, back, crossAt };
}

describe("nhường đường chủ động", () => {
  for (const side of [0, 1] as const) {
    it(`Titan đi xuyên hàng 3 Titan đứng: hàng dạt ra theo xích rồi về ô, không chồng thân (phe ${side})`, () => {
      const { w, spawn, face, move, local } = arena(side);
      const sp = 2 * bodyRadius("titan") + 0.8;
      const row = [-1, 0, 1].map((k) => spawn("titan", k * sp, 0));
      row.forEach((u) => face(u, 0, 1));
      const mover = spawn("titan", 0.5, -16);
      face(mover, 0, 1);
      for (let t = 0; t < sec(2); t++) w.step([]);
      move(mover, 0.5, 16);
      const r = watch(w, sec(30), row, [...row, mover], { u: mover, local });
      expect(Math.abs(r.crossAt), "đi xuyên giữa hàng, không vòng qua đầu hàng").toBeLessThan(sp);
      expect(mover.order, "xe đi phải tới nơi").toBe("idle");
      expect(gap(mover, arena(side).at(0.5, 16))).toBeLessThan(2);
      expect(r.overlap, "giây chồng thân").toBeLessThan(1);
      expect(r.sideSlip, "số tick xe đứng trượt ngang").toBe(0);
      expect(r.farthest, "xe nhường không dạt quá xa").toBeLessThan(4);
      expect(r.back, "xe nhường về lại ô").toBeLessThan(0.6);
    });

    it(`Lynx đi xuyên hàng 3 Titan đứng song song đường đi (phải xoay chéo mới dạt được) (phe ${side})`, () => {
      const { w, spawn, face, move, local } = arena(side);
      const sp = 2 * bodyRadius("titan") + 0.8;
      const row = [-1, 0, 1].map((k) => spawn("titan", k * sp, 0));
      row.forEach((u) => face(u, 0, 1));
      const ly = spawn("lynx", sp / 2, -14);
      for (let t = 0; t < sec(2); t++) w.step([]);
      move(ly, sp / 2, 14);
      const r = watch(w, sec(30), row, [...row, ly], { u: ly, local });
      expect(Math.abs(r.crossAt), "đi xuyên giữa hàng").toBeLessThan(sp);
      expect(ly.order).toBe("idle");
      expect(r.overlap).toBeLessThan(1);
      expect(r.sideSlip).toBe(0);
      expect(r.back).toBeLessThan(0.6);
      // không đi vòng qua đầu hàng: Lynx phải đi qua giữa hàng (chậm nhất là thời gian chờ hàng dạt)
      expect(r.farthest).toBeGreaterThan(0.3);
    });

    it(`Lynx vào giữa lưới 3×3 Titan: các Titan quanh đích dạt cho Lynx đứng, không ai chồng thân (phe ${side})`, () => {
      const { w, spawn, face, move, at } = arena(side);
      const sp = 2 * bodyRadius("titan") + 0.8;
      const grid: Unit[] = [];
      for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) grid.push(spawn("titan", c * sp, r * sp));
      grid.forEach((u) => face(u, 0, 1));
      const ly = spawn("lynx", -14, sp / 2);
      for (let t = 0; t < sec(2); t++) w.step([]);
      move(ly, -sp / 2, sp / 2);
      const r = watch(w, sec(35), grid, [...grid, ly]);
      expect(ly.order).toBe("idle");
      expect(gap(ly, at(-sp / 2, sp / 2)), "Lynx tới gần ô giữa").toBeLessThan(1.5);
      expect(r.overlap).toBeLessThan(1);
      expect(r.sideSlip).toBe(0);
      // cuối cùng không cặp nào chồng thân
      const all = [...grid, ly];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) expect(gap(all[i], all[j])).toBeGreaterThan(bodyRadius(all[i].kind) + bodyRadius(all[j].kind) - 0.15);
    });

    it(`hai Pháo đã hạ bệ không nhường: Titan đi vòng, Pháo không xê dịch (phe ${side})`, () => {
      const { w, spawn, face, move, at } = arena(side);
      const sp = 2 * bodyRadius("artillery") + 0.8;
      const arts = [-0.5, 0.5].map((k) => spawn("artillery", k * sp, 0));
      arts.forEach((u) => face(u, 0, 1));
      const ti = spawn("titan", 0, -16);
      for (let t = 0; t < sec(UNITS.artillery.weapon!.deploy!.time + 1.5); t++) w.step([]);
      expect(w.anchored(arts[0]) && w.anchored(arts[1])).toBe(true);
      move(ti, 0, 16);
      const r = watch(w, sec(40), arts, [...arts, ti]);
      expect(ti.order).toBe("idle");
      expect(gap(ti, at(0, 16))).toBeLessThan(2);
      expect(r.farthest, "Pháo hạ bệ không bị xô").toBeLessThan(0.05);
      expect(r.overlap).toBeLessThan(0.5);
    });
  }
});
