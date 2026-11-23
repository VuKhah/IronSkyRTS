/**
 * Va chạm theo ĐẾ TRÒN (bước 1 kế hoạch đế, 16/11/2026; Docs/design/UNIT_BASES_PLAN.md): mô hình nằm gọn trong vòng `bodyR`,
 * hai quân mặt đất giữ tâm cách nhau ≥ tổng hai vòng thân (từ T2 16/11/2026 vòng giãn = vòng thân); quân đã hạ bệ là lục giác tĩnh (trung đoạn = vòng giãn,
 * một cạnh phẳng quay về mũi lúc hạ bệ); thân tròn chạm vách như nhau ở mọi hướng mũi. Chỉ kiểm HÀNH VI.
 */
import { describe, expect, it } from "vitest";
import { UNITS, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";
import { spaceRadius } from "./world/shared";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}
const gap = (a: Unit, b: Unit): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
/** Vòng giãn: quân mặt đất từ T2 (16/11/2026) chỉ còn một vòng = vòng thân. */
const space = (k: UnitId): number => spaceRadius(k);

describe("va chạm theo đế tròn", () => {
  it("mọi quân mặt đất đã khai đế, chỉ một vòng: vòng giãn = vòng thân (bỏ vòng giãn 16/11/2026)", () => {
    for (const k of ["hauler", "lynx", "titan", "skyguard", "rocket", "artillery", "sniper"] as UnitId[]) {
      expect(UNITS[k].bodyR, k).toBeGreaterThan(0);
      expect(UNITS[k].spaceR, k).toBeUndefined();
      expect(space(k), k).toBe(UNITS[k].bodyR);
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

  it("quân hạ bệ ở chỗ đóng quân không bị xô: xe đè lên bị đẩy ra ngoài vòng thân, Pháo đứng nguyên (lõi mới 20/11/2026)", () => {
    const w = new World(1, { sandbox: true });
    const [x, z] = arenaPoint(0);
    const art = spawn(w, "artillery", x, z);
    for (let t = 0; t < sec(UNITS.artillery.weapon!.deploy!.time + 1); t++) w.step([]);
    expect(w.anchored(art)).toBe(true);
    const ax = art.x;
    const az = art.z;
    const t0 = spawn(w, "titan", x + art.hz * 3, z - art.hx * 3);
    for (let t = 0; t < sec(3); t++) w.step([]);
    expect(art.x).toBe(ax);
    expect(art.z).toBe(az);
    expect(gap(art, t0)).toBeGreaterThanOrEqual(space("artillery") + space("titan") - 0.05);
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
  const S = (): number => spaceRadius("sniper");
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
    // hai tiểu đội cách nhau 7 m: Titan đi thẳng giữa (B3 23/11/2026: tìm đường không xét xe đứng, chỉ quân hạ bệ)
    expect(w.setPath(t, x + 20, z)).toBe(true);
    expect(Math.max(...t.path.filter((_, i) => i % 2 === 1).map((v) => Math.abs(v - z)))).toBeLessThan(3);
  });
});
