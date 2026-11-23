/**
 * LÕI DI CHUYỂN MỚI (20/11/2026, `Docs/plans/2026-11-20-loi-di-chuyen-moi-thiet-ke.md`): kiểm CẢM GIÁC và HÀNH VI, không khóa luật
 * vá. Thay cho yield.test.ts / standgap.test.ts / standing.test.ts (nhường đường có kế hoạch, lớp xe đứng: đã bỏ).
 *  - bàn đo (`bench.ts`): các cảnh nhanh phải xong, không chồng thân lâu, không kẹt, xếp đúng ô, soi gương hai phe khớp tuyệt đối;
 *  - quán tính: xe tăng tốc / hãm dần, dừng đúng đích không vượt; xe tự chạy không trượt ngang;
 *  - xe đứng (B1–B3, 23/11/2026, kế hoạch "di chuyển như mọi người" người dùng duyệt 20/11): tìm đường không xét xe đứng; xe đi qua
 *    hàng xe đứng thì xe đứng dạt sang vừa đủ rồi tự về ô (thay luật "hàng ngắn thì đi vòng" 18/11); quân hạ bệ không bị xô, xe đi vòng.
 * Cả hai phe (bản đồ đối xứng (x, z) → (−x, −z)).
 */
import { describe, expect, it } from "vitest";
import { UNITS, type Side, type UnitId } from "./content";
import { BENCH_MAP, runBench } from "./bench";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";
import { bodyRadius } from "./world/shared";

const gap = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

describe("bàn đo di chuyển (cảnh nhanh, cả hai phe)", () => {
  for (const id of ["mv-s1-le", "mv-s2-doi-dau", "mv-s3-xuyen-doi", "mv-s6-vao-hang", "mv-s12-dich-khoi"])
    it(id, () => {
      const a = runBench(id, 0, () => new World(1, { sandbox: true, map: BENCH_MAP }));
      const b = runBench(id, 1, () => new World(1, { sandbox: true, map: BENCH_MAP }));
      expect(a.warnings, "cảnh dựng đúng chỗ").toEqual([]);
      expect(a.time, "xong trước khi hết giờ").toBeLessThan(Infinity);
      expect(a.overlap, "chồng thân lớn nhất").toBeLessThan(0.2);
      expect(a.overlapTicks, "số tick chồng quá 15%").toBeLessThan(10);
      expect(a.stuck, "kẹt lâu nhất (giây)").toBeLessThan(6);
      expect(a.slotErr, "lệch ô lúc xong (m)").toBeLessThan(1);
      expect(a.slip, "trượt ngang lớn nhất (m/s)").toBeLessThan(3.5);
      // soi gương: hai phe chạy cùng cảnh ra đúng ảnh gương của nhau
      expect(b.trace.length).toBe(a.trace.length);
      let worst = 0;
      for (let i = 0; i < a.trace.length; i++) worst = Math.max(worst, Math.abs(a.trace[i] - b.trace[i]));
      expect(worst, "lệch gương").toBeLessThan(1e-6);
    });
});

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
  return { w, at, spawn, face, move };
}

/** Theo dõi `ticks` tick: giây có cặp thân lồng nhau quá 0,3 m, xe đứng bị dời xa nhất khỏi chỗ cũ, còn lệch bao nhiêu lúc cuối. */
function watch(w: World, ticks: number, stand: Unit[], all: Unit[]) {
  const home = stand.map((u) => ({ x: u.x, z: u.z }));
  let overlap = 0;
  let farthest = 0;
  for (let t = 0; t < ticks; t++) {
    w.step([]);
    let lap = false;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) if (gap(all[i], all[j]) < bodyRadius(all[i].kind) + bodyRadius(all[j].kind) - 0.3) lap = true;
    if (lap) overlap++;
    stand.forEach((u, i) => (farthest = Math.max(farthest, gap(u, home[i]))));
  }
  const back = Math.max(...stand.map((u, i) => gap(u, home[i])));
  return { overlap: overlap / 10, farthest, back };
}

describe("xe đi qua xe đang đứng", () => {
  for (const side of [0, 1] as const) {
    // B3 (23/11/2026): tìm đường không còn đi vòng xe đứng (luật "vòng < 1,75 lần" 18/11 đã thay): xe đi thẳng, xe đứng dạt vừa đủ
    it(`hàng ngắn 3 Titan đứng: Titan đi qua, xe đứng dạt vừa đủ rồi về ô (phe ${side})`, () => {
      const { w, spawn, face, move, at } = arena(side);
      const sp = 2 * bodyRadius("titan") + 0.8;
      const row = [-1, 0, 1].map((k) => spawn("titan", k * sp, 0));
      row.forEach((u) => face(u, 0, 1));
      const mover = spawn("titan", 0.5, -16);
      face(mover, 0, 1);
      for (let t = 0; t < sec(2); t++) w.step([]);
      move(mover, 0.5, 16);
      const r = watch(w, sec(40), row, [...row, mover]);
      expect(mover.order, "xe đi phải tới nơi").toBe("idle");
      expect(gap(mover, at(0.5, 16))).toBeLessThan(2);
      expect(r.farthest, "xe đứng dạt vừa đủ").toBeLessThan(4.5);
      expect(r.back, "xe đứng về lại ô").toBeLessThan(1.2);
      expect(r.overlap, "giây chồng thân").toBeLessThan(1);
    });

    it(`hàng dài 9 Titan đứng (vòng quá xa): Titan đi xuyên, xe đứng bị đẩy nhẹ rồi tự về ô (phe ${side})`, () => {
      const { w, spawn, face, move, at } = arena(side);
      const sp = 2 * bodyRadius("titan") + 0.8;
      const row = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => spawn("titan", k * sp, 0));
      row.forEach((u) => face(u, 0, 1));
      const mover = spawn("titan", 0.5, -9);
      face(mover, 0, 1);
      for (let t = 0; t < sec(2); t++) w.step([]);
      move(mover, 0.5, 9);
      const r = watch(w, sec(40), row, [...row, mover]);
      expect(mover.order, "xe đi phải tới nơi").toBe("idle");
      expect(gap(mover, at(0.5, 9))).toBeLessThan(2.5);
      expect(r.overlap, "giây chồng thân").toBeLessThan(2);
      expect(r.farthest, "xe đứng bị đẩy không quá xa").toBeLessThan(4.5);
      expect(r.back, "xe đứng về lại ô").toBeLessThan(1.2);
    });

    it(`hai Pháo đã hạ bệ: Titan đi vòng, Pháo không xê dịch (phe ${side})`, () => {
      const { w, spawn, move, at } = arena(side);
      const arts = [spawn("artillery", -4, 0), spawn("artillery", 4, 0)];
      for (let t = 0; t < sec(UNITS.artillery.weapon!.deploy!.time + 1); t++) w.step([]);
      expect(arts.every((a) => w.anchored(a))).toBe(true);
      const mover = spawn("titan", 0, -14);
      const home = arts.map((a) => ({ x: a.x, z: a.z }));
      move(mover, 0, 14);
      for (let t = 0; t < sec(40) && mover.order !== "idle"; t++) w.step([]);
      expect(mover.order).toBe("idle");
      expect(gap(mover, at(0, 14))).toBeLessThan(2.5);
      arts.forEach((a, i) => expect(gap(a, home[i]), "Pháo không xê dịch").toBe(0));
    });
  }
});

describe("quán tính và chạy theo thân (xe nặng)", () => {
  it("Titan tăng tốc dần, hãm dần, dừng đúng đích không vượt", () => {
    const { w, spawn, face, move, at } = arena(0);
    const t = spawn("titan", 0, -20);
    face(t, 0, 1);
    move(t, 0, 20);
    const speeds: number[] = [];
    let passed = 0;
    const goal = at(0, 20);
    for (let k = 0; k < sec(30) && t.order !== "idle"; k++) {
      w.step([]);
      speeds.push(t.speed);
      // vượt đích = đi quá điểm đích theo hướng chạy
      const along = (t.x - goal.x) * t.hx + (t.z - goal.z) * t.hz;
      passed = Math.max(passed, along);
    }
    const vmax = UNITS.titan.speed;
    expect(speeds[4], "nửa giây đầu chưa đủ tốc").toBeLessThan(vmax * 0.5);
    expect(Math.max(...speeds), "lên hết tốc độ").toBeGreaterThan(vmax * 0.98);
    // tốc độ mỗi tick không đổi quá gia tốc / hãm cho phép
    for (let k = 1; k < speeds.length; k++) expect(Math.abs(speeds[k] - speeds[k - 1])).toBeLessThanOrEqual(Math.max(UNITS.titan.accel!, UNITS.titan.brake!) * 0.1 + 1e-9);
    expect(t.order).toBe("idle");
    expect(gap(t, goal)).toBeLessThan(0.35);
    expect(passed, "không vượt đích").toBeLessThan(0.1);
  });

  it("xe tự chạy (không bị chạm) không trượt ngang: bước đi luôn dọc trục thân", () => {
    const { w, spawn, move } = arena(0);
    const l = spawn("lynx", -10, -10);
    move(l, 15, 12);
    let worst = 0;
    for (let k = 0; k < sec(20) && l.order !== "idle"; k++) {
      const x0 = l.x;
      const z0 = l.z;
      w.step([]);
      worst = Math.max(worst, Math.abs((l.x - x0) * l.hz - (l.z - z0) * l.hx));
    }
    expect(l.order).toBe("idle");
    // thân quay trong lúc chạy nên bước tick sau lệch trục mới một chút (≤ vài cm), không có trượt ngang thật
    expect(worst).toBeLessThan(0.05);
  });
});
