/**
 * Va chạm theo ĐẾ TRÒN (bước 1 kế hoạch đế, 16/11/2026; Docs/design/UNIT_BASES_PLAN.md): mô hình nằm gọn trong vòng `bodyR`,
 * hai quân mặt đất giữ tâm cách nhau ≥ tổng hai vòng giãn `spaceR`; quân đã hạ bệ là lục giác tĩnh (trung đoạn = vòng giãn,
 * một cạnh phẳng quay về mũi lúc hạ bệ); thân tròn chạm vách như nhau ở mọi hướng mũi. Chỉ kiểm HÀNH VI.
 */
import { describe, expect, it } from "vitest";
import { UNITS, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}
const gap = (a: Unit, b: Unit): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
/** Khoảng cách có dấu từ điểm p tới lục giác của quân hạ bệ h (trung đoạn a, cạnh phẳng ở phía mũi). */
function hexDist(h: Unit, a: number, px: number, pz: number): number {
  const ox = px - h.x;
  const oz = pz - h.z;
  const f = ox * h.hx + oz * h.hz;
  const s = ox * h.hz - oz * h.hx;
  // 6 pháp tuyến cạnh theo (s, f): khoảng cách có dấu tới đa giác lồi = max các mặt khi ở trong; ngoài thì tính tới biên
  const ns: [number, number][] = [[0, 1], [0.8660254037844386, 0.5], [0.8660254037844386, -0.5], [0, -1], [-0.8660254037844386, -0.5], [-0.8660254037844386, 0.5]];
  const inside = Math.max(...ns.map(([a1, a2]) => s * a1 + f * a2 - a));
  if (inside <= 0) return inside;
  const R = a / 0.8660254037844386;
  const vs: [number, number][] = [[R / 2, a], [R, 0], [R / 2, -a], [-R / 2, -a], [-R, 0], [-R / 2, a]];
  let best = Infinity;
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = vs[i];
    const [x1, y1] = vs[(i + 1) % 6];
    const t = Math.max(0, Math.min(1, ((s - x0) * (x1 - x0) + (f - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2)));
    best = Math.min(best, Math.hypot(s - (x0 + (x1 - x0) * t), f - (y0 + (y1 - y0) * t)));
  }
  return best;
}
const space = (k: UnitId): number => UNITS[k].spaceR!;

describe("va chạm theo đế tròn", () => {
  it("mọi quân mặt đất đã khai đế: thân và vùng giãn (giãn = thân + 0,2 m)", () => {
    for (const k of ["hauler", "lynx", "titan", "skyguard", "rocket", "artillery"] as UnitId[]) {
      expect(UNITS[k].bodyR, k).toBeGreaterThan(0);
      expect(space(k), k).toBeCloseTo(UNITS[k].bodyR! + 0.2, 6);
    }
  });

  for (const [ka, kb] of [
    ["titan", "titan"],
    ["lynx", "artillery"],
    ["skyguard", "rocket"]
  ] as [UnitId, UnitId][]) {
    it(`${ka} đè lên ${kb}: bị đẩy ra tới đúng tổng hai vòng giãn, không bật xa`, () => {
      const w = new World(1, { sandbox: true });
      const [x, z] = arenaPoint(0);
      const a = spawn(w, ka, x, z);
      const b = spawn(w, kb, x + 1.2, z + 0.5);
      for (let t = 0; t < sec(3); t++) w.step([]);
      const want = space(ka) + space(kb);
      expect(gap(a, b)).toBeGreaterThanOrEqual(want - 0.05);
      expect(gap(a, b)).toBeLessThan(want + 0.6);
    });
  }

  it("quân hạ bệ là lục giác tĩnh: không bị xô; xe kia ra ngoài lục giác, sát cạnh phẳng thì gần hơn vòng ngoại tiếp", () => {
    const res: number[] = [];
    const a = space("artillery");
    const r = space("titan");
    for (const side of ["flat", "vertex"] as const) {
      const w = new World(1, { sandbox: true });
      const [x, z] = arenaPoint(0);
      const art = spawn(w, "artillery", x, z);
      for (let t = 0; t < sec(UNITS.artillery.weapon!.deploy!.time + 1); t++) w.step([]);
      expect(w.anchored(art)).toBe(true);
      const ax = art.x;
      const az = art.z;
      // cạnh phẳng ở phía mũi; đỉnh ở hai bên hông (vuông góc mũi)
      const [ox, oz] = side === "flat" ? [art.hx, art.hz] : [art.hz, -art.hx];
      const t0 = spawn(w, "titan", x + ox * 3, z + oz * 3);
      for (let t = 0; t < sec(3); t++) w.step([]);
      expect(art.x).toBe(ax);
      expect(art.z).toBe(az);
      // tâm xe cách biên lục giác ít nhất một vòng giãn của xe (sát đỉnh thì xe có thể trượt dọc cạnh, vẫn ở ngoài)
      expect(hexDist(art, a, t0.x, t0.z), side).toBeGreaterThanOrEqual(r - 0.05);
      res.push(gap(art, t0));
    }
    // cạnh phẳng: dừng ở trung đoạn + bán kính xe, gần hơn hẳn vòng ngoại tiếp lục giác (a / cos 30° + r): đúng là lục giác
    expect(res[0]).toBeLessThan(a + r + 0.3);
    expect(res[0]).toBeLessThan(a / 0.8660254037844386 + r - 0.3);
  });

  it("thân tròn: điểm chạm vách như nhau ở mọi hướng mũi (xoay tại chỗ không quệt)", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const u = spawn(w, "titan", x, z);
    // chặn một ô 2 m, đặt thân lấn vào ô đó 0,4 m
    const ci = w.grid.index(x + 6, z);
    w.grid.block([ci], 1);
    const edge = w.grid.centerX(ci % w.grid.cols) - 1;
    const px = edge - UNITS.titan.bodyR! * 0.95 + 0.4;
    const pz = w.grid.centerZ(Math.floor(ci / w.grid.cols));
    const hits = w.bodyContact(u, px, pz)[2];
    expect(hits).toBeGreaterThan(0);
    for (const [hx, hz] of [[1, 0], [0, 1], [0.6, 0.8], [-0.8, 0.6]]) expect(w.bodyContact(u, px, pz, hx, hz)[2]).toBe(hits);
    // lùi ra đúng vòng dò (95% bán kính thân, chừa sai số lưới 2 m) thì hết chạm
    expect(w.bodyContact(u, edge - UNITS.titan.bodyR! * 0.95 - 0.05, pz)[2]).toBe(0);
  });
});

describe("tiểu đội bộ binh chạm mềm (16/11/2026)", () => {
  const S = (): number => UNITS.sniper.spaceR!;
  it("tiểu đội đè lên Titan: chỉ bị đẩy tới mức chồng nửa đế, lính nhường xe (Titan gần như không nhích)", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const t = spawn(w, "titan", x, z);
    for (let k = 0; k < sec(1); k++) w.step([]);
    const [tx, tz] = [t.x, t.z];
    const s = spawn(w, "sniper", x + 0.8, z + 0.3);
    for (let k = 0; k < sec(3); k++) w.step([]);
    const want = S() + space("titan") - UNITS.sniper.bodyR!;
    expect(gap(s, t)).toBeGreaterThanOrEqual(want - 0.05);
    expect(gap(s, t)).toBeLessThan(want + 0.5);
    expect(Math.hypot(t.x - tx, t.z - tz)).toBeLessThan(gap(s, t) * 0.25);
  });

  it("hai tiểu đội với nhau là vòng giãn cứng", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const a = spawn(w, "sniper", x, z);
    const b = spawn(w, "sniper", x + 1, z);
    for (let k = 0; k < sec(3); k++) w.step([]);
    expect(gap(a, b)).toBeGreaterThanOrEqual(2 * S() - 0.05);
  });

  it("tiểu đội lọt qua khe giữa hai Titan đứng sát nhau, đi thẳng không vòng", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const gapX = 2 * space("titan") + 1.4; // khoảng cột đội hình
    const t1 = spawn(w, "titan", x - gapX / 2, z);
    const t2 = spawn(w, "titan", x + gapX / 2, z);
    for (let k = 0; k < sec(2); k++) w.step([]);
    const s = spawn(w, "sniper", x, z - 16);
    w.step([{ side: 0, order: { t: "move", ids: [s.id], x, z: z + 16 } }]);
    let maxLat = 0;
    for (let k = 0; k < sec(20) && s.order !== "idle"; k++) {
      w.step([]);
      maxLat = Math.max(maxLat, Math.abs(s.x - x));
    }
    expect(s.order).toBe("idle");
    expect(Math.hypot(s.x - x, s.z - z - 16)).toBeLessThan(3);
    expect(maxLat).toBeLessThan(1.5);
    for (const t of [t1, t2]) expect(gap(s, t)).toBeGreaterThan(2);
  });

  it("xe thấy tiểu đội đứng là vật cản mềm: có đường đi thẳng qua sát tiểu đội (không bị chặn như xe đứng)", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    spawn(w, "sniper", x, z + 3.5);
    spawn(w, "sniper", x, z - 3.5);
    for (let k = 0; k < sec(2); k++) w.step([]);
    const t = spawn(w, "titan", x - 20, z);
    const f = w.grid.field("track", false);
    // hai tiểu đội cách nhau 7 m: hai Titan đứng thế thì chặn, hai tiểu đội thì Titan lách được giữa
    const p = w.grid.findPath(t.x, t.z, x + 20, z, f, 2.14, w.standFor(t)!)!;
    expect(p).not.toBeNull();
    expect(Math.max(...p.filter((_, i) => i % 2 === 1).map((v) => Math.abs(v - z)))).toBeLessThan(3);
  });
});
