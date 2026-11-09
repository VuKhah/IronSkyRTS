/**
 * Kiểm thử đội hình (người dùng 06/11/2026: "dàn quân thông minh: xếp hàng ngay ngắn, không dính cục"):
 * hàng ngang quay theo hướng hành quân, khoảng cách theo kích cỡ xe, hàng đầu / giữa / sau theo vai trò,
 * tới nơi quay cùng một hướng; xe đang chạy nhường xe đã đứng yên (lách qua, không xô lệch hàng).
 * Chỉ kiểm HÀNH VI, không khóa con số (khe hở, tỉ lệ bề ngang có thể chỉnh).
 */
import { describe, expect, it } from "vitest";
import { FORMATIONS, UNITS, type UnitId } from "./content";
import { assignMin } from "./assign";
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
    const of = (rank: number): number[] => us.filter((u) => FORMATIONS.attack.rank[UNITS[u.kind].group] === rank).map(fwd);
    for (const rank of [0, 1, 2]) expect(of(rank).length, String(rank)).toBeGreaterThan(0);
    expect(Math.min(...of(0))).toBeGreaterThan(Math.max(...of(1)));
    expect(Math.min(...of(1))).toBeGreaterThan(Math.max(...of(2)));
  });

  it("hành quân: cả khối đi cùng tốc độ khối, vào hàng xong thì mọi xe bám sát ô của mình suốt đường", () => {
    const w = new World(1, { sandbox: true });
    const rng = new Rng(3);
    const [ax, az] = arenaPoint(-24);
    for (const k of ["lynx", "lynx", "titan", "titan", "artillery"] as UnitId[]) spawn(w, k, ax + (rng.next() - 0.5) * 10, az + (rng.next() - 0.5) * 10);
    const us = w.units.filter((u) => u.side === 0);
    const [tx, tz] = arenaPoint(30);
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: tx, z: tz } }]);
    const sq = w.squads[0];
    let marched = 0;
    let worst = 0;
    for (let i = 0; i < sec(60) && w.squads.includes(sq); i++) {
      const s0 = sq.s;
      w.step([]);
      if (sq.phase !== "march") continue;
      marched++;
      expect(sq.s - s0).toBeLessThanOrEqual(sq.speed * 0.1 + 1e-9);
      // quân lộn xộn tự vào hàng trên đường đi: chỉ đo sau khi đã có thời gian vào hàng
      if (i < sec(8)) continue;
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

  it("lệnh quãng ngắn: đội đã vào hàng dịch nguyên khối (mọi xe cùng một vector), tới nơi quay mặt về hướng vừa đi", () => {
    const { w, us, tx, tz } = march(Array<UnitId>(6).fill("titan"));
    const fx = us[0].faceX;
    const fz = us[0].faceZ;
    const back = new Set(us.filter((u) => (u.x - tx) * fx + (u.z - tz) * fz < 0).map((u) => u.id));
    const start = new Map(us.map((u) => [u.id, [u.x, u.z]]));
    const [bx, bz] = arenaPoint(2); // lùi lại khoảng 20 m
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: bx, z: bz } }]);
    expect(w.squads[0].phase, "quãng ngắn: đi thẳng tới ô").toBe("direct");
    for (let i = 0; i < sec(40) && w.squads.length; i++) w.step([]);
    for (let i = 0; i < sec(5); i++) w.step([]); // thân xe xoay nốt về hướng mới
    const d = us.map((u) => [u.x - start.get(u.id)![0], u.z - start.get(u.id)![1]]);
    for (const v of d) expect(Math.sqrt((v[0] - d[0][0]) ** 2 + (v[1] - d[0][1]) ** 2), "mọi xe cùng một vector dịch chuyển").toBeLessThan(0.8);
    const gx = us[0].faceX;
    const gz = us[0].faceZ;
    expect(gx * fx + gz * fz, "quay mặt về hướng vừa đi (ngược lại)").toBeLessThan(-0.7);
    for (const u of us) expect(u.hx * gx + u.hz * gz, "thân xe đã quay theo hướng mới").toBeGreaterThan(0.99);
    // không ai đổi chỗ: hàng sau cũ thành hàng đầu theo hướng mới
    const cx = us.reduce((a, u) => a + u.x, 0) / us.length;
    const cz = us.reduce((a, u) => a + u.z, 0) / us.length;
    const front = new Set(us.filter((u) => (u.x - cx) * gx + (u.z - cz) * gz > 0).map((u) => u.id));
    expect([...front].sort()).toEqual([...back].sort());
  });

  it("quay đầu quãng dài: cả đội xoay tại chỗ, đồng bộ, không ai đổi chỗ, rồi mới hành quân", () => {
    const { w, us } = march(Array<UnitId>(6).fill("titan"));
    const fx = us[0].faceX;
    const fz = us[0].faceZ;
    const [bx, bz] = arenaPoint(-34); // lùi xa hơn quãng "đi thẳng tới ô"
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: bx, z: bz } }]);
    const sq = w.squads[0];
    expect(sq.phase, "đội đã vào hàng, quãng dài: xoay tại chỗ").toBe("pivot");
    const start = new Map(us.map((u) => [u.id, [u.x, u.z]]));
    let pivotTicks = 0;
    for (let i = 0; i < sec(90) && w.squads.includes(sq); i++) {
      w.step([]);
      if (sq.phase !== "pivot") continue;
      pivotTicks++;
      for (const u of us) {
        const [x0, z0] = start.get(u.id)!;
        expect(Math.sqrt((u.x - x0) ** 2 + (u.z - z0) ** 2), "xoay tại chỗ: không xe nào di chuyển").toBeLessThan(0.3);
      }
    }
    expect(pivotTicks).toBeGreaterThanOrEqual(sec(150 / UNITS.titan.turnRate!));
    expect(us[0].faceX * fx + us[0].faceZ * fz, "đã quay ngược hướng").toBeLessThan(-0.7);
  });

  it("phân công tối ưu: không hai đường đi nào cắt nhau", () => {
    const rng = new Rng(9);
    for (let trial = 0; trial < 20; trial++) {
      const n = 8;
      const a = Array.from({ length: n }, () => [rng.next() * 40, rng.next() * 40]);
      const b = Array.from({ length: n }, () => [rng.next() * 40 + 30, rng.next() * 40]);
      const cost = b.map((p) => a.map((q) => Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)));
      const pick = assignMin(cost);
      expect(new Set(pick).size).toBe(n);
      const cross = (p1: number[], p2: number[], p3: number[], p4: number[]): boolean => {
        const d = (p: number[], q: number[], r: number[]): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
      };
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(cross(a[pick[i]], b[i], a[pick[j]], b[j])).toBe(false);
    }
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

describe("xoay thân xe tại chỗ (turnRate)", () => {
  it("xe đổi hướng nhiều thì đứng lại xoay tại chỗ, mất thời gian theo tốc độ quay thân, rồi mới chạy", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const t = spawn(w, "titan", x, z);
    // ra lệnh đi về phía sau lưng
    w.step([{ side: 0, order: { t: "move", ids: [t.id], x: x - t.hx * 20, z: z - t.hz * 20 } }]);
    let still = 0;
    for (let i = 0; i < sec(10) && t.x === x && t.z === z; i++) {
      w.step([]);
      if (t.x === x && t.z === z) still++;
    }
    // phải xoay ít nhất ~150° (lệch ≤ 30° thì được lăn bánh) trước khi nhúc nhích
    expect(still).toBeGreaterThanOrEqual(sec(150 / UNITS.titan.turnRate!) - 1);
  });

  it("quân cố định đang hạ bệ thì phải thu bệ trước rồi mới xoay", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(-10);
    const a = spawn(w, "artillery", x, z);
    const T = sec(UNITS.artillery.weapon!.deploy!.time);
    for (let i = 0; i < T + 5; i++) w.step([]);
    const hx = a.hx;
    const hz = a.hz;
    w.step([{ side: 0, order: { t: "move", ids: [a.id], x: x - hx * 20, z: z - hz * 20 } }]);
    for (let i = 0; i < T - 2; i++) {
      w.step([]);
      expect(a.hx, "chưa thu bệ xong thì thân chưa quay").toBe(hx);
    }
  });
});
