/**
 * Kiểm thử ĐỊA HÌNH BẬC THANG (người dùng chốt 11/11/2026, game-map.ts):
 * - mặt đất là các tầng phẳng 0 / 1 / 2, nối nhau bằng khối dốc; hai tầng kề nhau không qua dốc là vách, không leo được;
 * - quân mặt đất không nhìn thấy tầng cao hơn tầng mình đứng, đứng cao thì nhìn xuống được; máy bay không bị tầng che;
 * - công trình chỉ xây trên nền phẳng;
 * - khối dốc khai báo sai (không nối hai tầng liền nhau) thì dựng bản đồ báo lỗi ngay.
 */
import { describe, expect, it } from "vitest";
import { UNITS, type Side, type UnitId } from "./content";
import { DEV_MAP_DEFS, GameMap, MAP_DEFS, RAMP_LEN, TIER_H, type MapDef } from "./maps";
import type { Unit } from "./types";
import { sec, World } from "./world";

const square = (r: number): [number, number][] => [
  [-r, -r],
  [r, -r],
  [r, r],
  [-r, r]
];

/** Khối tầng 1 vuông ±30 m, đỉnh tầng 2 vuông ±14 m; hai dốc ở phía Tây leo về Đông, trên trục z = 0. */
const MESA: MapDef = {
  id: "test-mesa",
  name: "Thử: khối bậc thang",
  blurb: "",
  size: { w: 160, h: 160 },
  bases: [
    [-62, 62],
    [62, -62]
  ],
  mines: [],
  tiers: [
    { tier: 1, poly: square(30) },
    { tier: 2, poly: square(14) }
  ],
  ramps: [
    { x: -30, z: 0, dir: "E", width: 10 },
    { x: -14, z: 0, dir: "E", width: 10 }
  ],
  rocks: [],
  rivers: []
};

const map = new GameMap(MESA);
const world = (): World => new World(1, { sandbox: true, map: new GameMap(MESA) });

function spawn(w: World, kind: UnitId, x: number, z: number, side: Side = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}

describe("địa hình bậc thang: độ cao", () => {
  it("mặt mỗi tầng phẳng tuyệt đối, mặt dốc lên đều từ tầng dưới tới tầng trên", () => {
    expect(map.terrainHeight(-50, 20)).toBe(0);
    expect(map.terrainHeight(-22, 20)).toBe(TIER_H);
    expect(map.terrainHeight(-21.3, 25.7)).toBe(TIER_H);
    expect(map.terrainHeight(0, 0)).toBe(2 * TIER_H);
    const r = map.ramps[0];
    expect(r.x1 - r.x0).toBe(RAMP_LEN);
    const mz = (r.z0 + r.z1) / 2;
    expect(map.terrainHeight(r.x0, mz)).toBe(0);
    expect(map.terrainHeight((r.x0 + r.x1) / 2, mz)).toBe(TIER_H / 2);
    expect(map.terrainHeight(r.x1 - 0.001, mz)).toBeCloseTo(TIER_H, 2);
    expect(map.tierAt((r.x0 + r.x1) / 2, mz), "trên dốc tính theo tầng chân dốc").toBe(0);
  });
});

describe("địa hình bậc thang: đi lại", () => {
  it("mép tầng cao sát vách bị chặn, giữa tầng và mặt dốc thì đi được", () => {
    expect(map.staticBlocked(-29, 20), "mép vách tầng 1").toBe(true);
    expect(map.terrainAt(-29, 20)).toBe("cliff");
    expect(map.staticBlocked(-31, 20), "chân vách tầng 0").toBe(false);
    expect(map.staticBlocked(-25, 20)).toBe(false);
    const r = map.ramps[0];
    for (let x = r.x0 + 1; x < r.x1; x += 2) expect(map.staticBlocked(x, (r.z0 + r.z1) / 2), `dốc (${x})`).toBe(false);
  });

  it("xe lên tầng 2 bằng đường dốc, không lần nào nhảy vách", () => {
    const w = world();
    const u = spawn(w, "lynx", -50, 20);
    w.step([{ side: 0, order: { t: "move", ids: [u.id], x: 0, z: -4 } }]);
    let y = w.map.groundY(u.x, u.z);
    let maxJump = 0;
    for (let i = 0; i < sec(40); i++) {
      w.step([]);
      expect(w.map.staticBlocked(u.x, u.z), `xe đứng trên ô bị chặn (${u.x.toFixed(1)}, ${u.z.toFixed(1)})`).toBe(false);
      const ny = w.map.groundY(u.x, u.z);
      maxJump = Math.max(maxJump, Math.abs(ny - y));
      y = ny;
    }
    expect(Math.hypot(u.x - 0, u.z + 4)).toBeLessThan(2);
    expect(w.map.tierAt(u.x, u.z)).toBe(2);
    // một tick xe chạy chưa tới 1 m, dốc 0,5 → độ cao đổi < 0,5 m; nhảy vách sẽ là 4 m
    expect(maxJump).toBeLessThan(0.6);
  });
});

describe("địa hình bậc thang: tầm nhìn", () => {
  it("quân dưới thấp không thấy quân trên tầng cao; quân trên cao thấy quân dưới thấp", () => {
    const w = world();
    const low = spawn(w, "lynx", -44, 20, 0);
    const high = spawn(w, "lynx", -24, 20, 1);
    w.step([{ side: 1, order: { t: "sbHold", side: 1, on: true } }]);
    w.step([{ side: 0, order: { t: "sbHold", side: 0, on: true } }]);
    expect(Math.abs(low.x - high.x)).toBeLessThan(UNITS.lynx.sight * 0.9);
    expect(w.visibleTo(0, high), "tầng 0 nhìn lên tầng 1").toBe(false);
    expect(w.cellVisible(0, -24, 20)).toBe(false);
    expect(w.cellVisible(0, -40, 26), "cùng tầng 0 thì thấy").toBe(true);
    expect(w.visibleTo(1, low), "tầng 1 nhìn xuống tầng 0").toBe(true);
  });

  it("tầng cao chặn tầm nhìn phía sau nó: đứng tầng 0 không nhìn xuyên khối tầng sang phía bên kia", () => {
    // (-12, 34) là ô tầng 0 ngay phía Nam khối, cách chỗ đứng 23 m (trong tầm 28 m); tia nhìn cắt qua góc khối tầng 1
    const see = (def: MapDef): boolean => {
      const w = new World(1, { sandbox: true, map: new GameMap(def) });
      spawn(w, "lynx", -34, 26, 0);
      w.step([]);
      return w.cellVisible(0, -12, 34);
    };
    expect(see({ ...MESA, id: "flat", tiers: [], ramps: [] }), "bản đồ phẳng: thấy").toBe(true);
    expect(see(MESA), "ô tầng 0 bị khối tầng 1 che").toBe(false);
  });

  it("máy bay bay trên tầng cao vẫn bị quân dưới thấp nhìn thấy (tầng chỉ che mặt đất)", () => {
    const w = world();
    spawn(w, "lynx", -44, 20, 0);
    const f = spawn(w, "falcon", -24, 20, 1);
    w.step([]);
    expect(f.alt).toBeGreaterThan(2);
    expect(w.visibleTo(0, f)).toBe(true);
  });
});

describe("địa hình bậc thang: xây dựng", () => {
  it("chỉ xây được trên nền phẳng: không trên dốc, không vắt qua vách", () => {
    const w = world();
    const r = w.map.ramps[0];
    const mz = (r.z0 + r.z1) / 2;
    expect(w.sandboxPlaceError("wall", r.x0 + 3, mz)).not.toBeNull();
    expect(w.sandboxPlaceError("wall", -22, 20)).toBeNull();
    expect(w.sandboxPlaceError("wall", -50, 20)).toBeNull();
    expect(w.sandboxPlaceError("power-pylon", -30, 20)).not.toBeNull();
  });

  it("Tổng Hành Dinh của mọi bản đồ nằm trọn trên một mặt phẳng", () => {
    for (const def of [...MAP_DEFS, ...DEV_MAP_DEFS]) {
      const w = new World(1, { map: def.id });
      for (const hq of w.buildings.filter((b) => b.kind === "hq")) {
        const ys = new Set(hq.cells.map((i) => w.map.cellY[i]));
        expect(ys.size, `${def.id}: nền Tổng Hành Dinh phe ${hq.side}`).toBe(1);
        for (const i of hq.cells) expect(w.map.visTier[i], `${def.id}: ô dốc dưới Tổng Hành Dinh`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("địa hình bậc thang: dựng bản đồ", () => {
  it("khối dốc không nối hai tầng liền nhau thì báo lỗi ngay khi dựng", () => {
    expect(() => new GameMap({ ...MESA, id: "bad-flat", ramps: [{ x: -50, z: 40, dir: "E", width: 8 }] })).toThrow(/khối dốc/);
    // từ tầng 0 leo thẳng lên tầng 2 (bỏ qua tầng 1): không hợp lệ
    const two: MapDef = { ...MESA, id: "bad-two", tiers: [{ tier: 2, poly: square(20) }], ramps: [{ x: -20, z: 0, dir: "E", width: 8 }] };
    expect(() => new GameMap(two)).toThrow(/khối dốc/);
  });

  it("bản đồ đối xứng: khối dốc được soi gương (đổi hướng leo) và lưới ô đối xứng", () => {
    for (const def of [...MAP_DEFS, ...DEV_MAP_DEFS]) {
      if (!def.symmetric) continue;
      const m = new GameMap(def);
      expect(m.ramps.length).toBe((def.ramps ?? []).length * 2);
      for (let i = 0; i < m.cellY.length; i++) {
        const j = m.cellY.length - 1 - i;
        expect(m.cellY[i], `${def.id}: độ cao ô ${i}`).toBe(m.cellY[j]);
        expect(m.visTier[i], `${def.id}: tầng ô ${i}`).toBe(m.visTier[j]);
      }
    }
  });
});
