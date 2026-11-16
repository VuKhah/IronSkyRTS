/**
 * Xe đi qua chỗ có xe đứng (thay `softpass.test.ts` của luật lách mềm A1a, bỏ ngày 16/11/2026 khi có nhường đường chủ động,
 * `yield.test.ts`): xe KHÔNG nhường được (quân địch, quân cố định đã hạ bệ) thì xe đi lách / đi vòng và không xô chúng; lệnh dừng
 * giữa khe hai xe đứng cùng phe thì hai xe dạt cho chỗ đứng; hai xe cùng đứng chồng thân thì xe dừng sau nhường. Chỉ kiểm HÀNH VI.
 */
import { describe, expect, it } from "vitest";
import { type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";
import { bodyRadius, spaceRadius, wallRadius } from "./world/shared";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}
const dist = (a: Unit, x: number, z: number): number => Math.sqrt((a.x - x) ** 2 + (a.z - z) ** 2);
const gap = (a: Unit, b: Unit): number => dist(a, b.x, b.z);

/** Hai quân `post` đứng thành khe rộng `g` (tâm tới tâm) theo trục x quanh tâm bãi thử. */
function gate(post: UnitId, g: number, side: 0 | 1 = 0, wait = 3) {
  const w = new World(1, { sandbox: true });
  const [cx, cz] = arenaPoint(0);
  const posts = [spawn(w, post, cx - g / 2, cz, side), spawn(w, post, cx + g / 2, cz, side)];
  for (let t = 0; t < sec(wait); t++) w.step([]);
  const at = posts.map((u) => [u.x, u.z]);
  const moved = (): number => Math.max(...posts.map((p, i) => dist(p, at[i][0], at[i][1])));
  return { w, posts, cx, cz, moved };
}

/** Cho `u` đi tới (x, z); trả về hoành độ lúc cắt đường z = cz và khoảng gần nhất tới các quân đứng. */
function drive(w: World, posts: Unit[], cz: number, u: Unit, x: number, z: number, seconds = 25): { crossX: number; closest: number } {
  w.step([{ side: u.side, order: { t: "move", ids: [u.id], x, z } }]);
  let crossX = NaN;
  let closest = Infinity;
  let pz = u.z;
  for (let t = 0; t < sec(seconds); t++) {
    w.step([]);
    if ((pz - cz) * (u.z - cz) <= 0 && pz !== u.z && Number.isNaN(crossX)) crossX = u.x;
    pz = u.z;
    for (const p of posts) closest = Math.min(closest, gap(u, p));
  }
  return { crossX, closest };
}

describe("xe đứng không nhường được", () => {
  it("SkyGuard hạ bệ làm khe vừa thân Lynx: Lynx đi qua khe, SkyGuard không xê dịch", () => {
    const g = 2 * bodyRadius("skyguard") + 2 * wallRadius("lynx") + 0.6;
    const G = gate("skyguard", g, 0, 5);
    expect(G.posts.every((p) => G.w.anchored(p))).toBe(true);
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10);
    const r = drive(G.w, G.posts, G.cz, lx, G.cx, G.cz + 10);
    expect(dist(lx, G.cx, G.cz + 10)).toBeLessThan(1.5);
    expect(G.moved()).toBeLessThan(1e-6);
    expect(Math.abs(r.crossX - G.cx)).toBeLessThan(0.8);
  });

  it("SkyGuard hạ bệ đứng sát (khe hẹp hơn thân): Lynx đi vòng, SkyGuard không xê dịch", () => {
    const g = 2 * bodyRadius("skyguard") + 0.8;
    const G = gate("skyguard", g, 0, 5);
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10);
    const r = drive(G.w, G.posts, G.cz, lx, G.cx, G.cz + 10, 35);
    expect(dist(lx, G.cx, G.cz + 10)).toBeLessThan(2);
    expect(G.moved()).toBeLessThan(1e-6);
    expect(Math.abs(r.crossX - G.cx)).toBeGreaterThan(g / 2);
  });

  it("xe địch đứng làm khe vừa thân Lynx: địch không dạt nhường, Lynx đi qua giữ đúng vòng thân, địch gần như không nhích", () => {
    const g = 2 * bodyRadius("titan") + 2 * bodyRadius("lynx") + 0.4;
    const G = gate("titan", g, 1);
    G.w.step([{ side: 1, order: { t: "sbHold", side: 1, on: true } }]);
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10, 0);
    G.w.step([{ side: 0, order: { t: "sbHold", side: 0, on: true } }]);
    const r = drive(G.w, G.posts, G.cz, lx, G.cx, G.cz + 10);
    expect(r.closest).toBeGreaterThan(bodyRadius("titan") + bodyRadius("lynx") - 0.3);
    expect(G.moved(), "địch không dạt nhường").toBeLessThan(0.3);
  });
});

describe("xe đứng cùng phe", () => {
  it("lệnh dừng đúng giữa khe hai Titan đứng: hai Titan dạt cho Lynx đứng, cuối cùng không ai chồng thân", () => {
    const g = 2 * bodyRadius("titan") + 0.8;
    const G = gate("titan", g);
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10);
    drive(G.w, G.posts, G.cz, lx, G.cx, G.cz, 25);
    expect(dist(lx, G.cx, G.cz)).toBeLessThan(1.2);
    for (const p of G.posts) expect(gap(lx, p)).toBeGreaterThan(bodyRadius("lynx") + bodyRadius("titan") - 0.15);
    expect(G.moved()).toBeLessThan(3);
  });

  for (const side of [0, 1] as const)
    it(`hai quân cùng đứng chồng thân: quân dừng sau nhường trọn (phe ${side})`, () => {
      const w = new World(1, { sandbox: true });
      const [cx, cz] = arenaPoint(0);
      const sg = side === 0 ? 1 : -1;
      const a = spawn(w, "titan", cx, cz, side);
      for (let t = 0; t < sec(3); t++) w.step([]);
      const ax = a.x;
      const az = a.z;
      const b = spawn(w, "titan", cx + 3 * sg, cz + 1 * sg, side);
      for (let t = 0; t < sec(5); t++) w.step([]);
      expect(dist(a, ax, az)).toBeLessThan(1e-6);
      expect(gap(a, b)).toBeGreaterThan(2 * spaceRadius("titan") - 0.05);
    });

  it("hai quân cùng đứng chồng thân: kết quả soi gương hai phe như nhau", () => {
    const end = (side: 0 | 1): [number, number] => {
      const w = new World(1, { sandbox: true });
      const [cx, cz] = arenaPoint(0);
      const sg = side === 0 ? 1 : -1;
      spawn(w, "titan", cx * sg, cz * sg, side);
      for (let t = 0; t < sec(3); t++) w.step([]);
      const b = spawn(w, "titan", (cx + 3) * sg, (cz + 1) * sg, side);
      for (let t = 0; t < sec(5); t++) w.step([]);
      return [b.x * sg, b.z * sg];
    };
    const [x0, z0] = end(0);
    const [x1, z1] = end(1);
    expect(Math.abs(x0 - x1) + Math.abs(z0 - z1)).toBeLessThan(1e-9);
  });
});
