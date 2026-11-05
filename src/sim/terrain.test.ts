/**
 * Kiểm thử hiệu ứng địa hình (Docs/design/MAPS_PLAN.md mục 8, bước B3):
 * - B3a: tốc độ theo loại địa hình × kiểu xe (bánh / xích), Xe Tư Lệnh kháng làm chậm, lên dốc chậm hơn xuống dốc.
 *
 * Mỗi phép thử dựng một bản đồ thử nhỏ ngay trong file (GameMap từ MapDef) và chạy World { sandbox: true }.
 * Hệ số lấy từ bảng TERRAIN / RULES (không khóa con số cân bằng): đổi số trong terrain.ts thì kiểm thử vẫn đúng.
 */
import { describe, expect, it } from "vitest";
import { RULES, UNITS, type Side, type UnitId } from "./content";
import { GameMap, TERRAIN, type MapDef } from "./maps";
import type { Unit } from "./types";
import { DT, sec, World } from "./world";

/** Bản đồ thử 160 × 160 m phẳng: nửa trái là bùn, góc trên phải là đường, góc dưới phải là cỏ. */
const PATCHES: MapDef = {
  id: "test-patches",
  name: "Thử: các mảng địa hình",
  blurb: "",
  size: { w: 160, h: 160 },
  bases: [
    [-62, 62],
    [62, -62]
  ],
  mines: [],
  hills: [],
  rocks: [],
  rivers: [],
  regions: [
    {
      kind: "mud",
      poly: [
        [-80, -80],
        [0, -80],
        [0, 80],
        [-80, 80]
      ]
    },
    {
      kind: "road",
      poly: [
        [0, -80],
        [80, -80],
        [80, 0],
        [0, 0]
      ]
    }
  ]
};

/** Bản đồ thử có một quả đồi lớn ở giữa (dốc tối đa ~0,46). */
const HILL: MapDef = {
  id: "test-hill",
  name: "Thử: đồi",
  blurb: "",
  size: { w: 160, h: 160 },
  bases: [
    [-62, 62],
    [62, -62]
  ],
  mines: [],
  hills: [{ x: 0, z: 0, r: 40, h: 12 }],
  rocks: [],
  rivers: []
};

const world = (def: MapDef): World => new World(1, { sandbox: true, map: new GameMap(def) });

function spawn(w: World, kind: UnitId, x: number, z: number, side: Side = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}

/** Quãng đường xe đi được trong `ticks` tick khi được lệnh chạy thẳng về (tx, tz). */
function distanceIn(w: World, u: Unit, tx: number, tz: number, ticks: number): number {
  w.step([{ side: u.side, order: { t: "move", ids: [u.id], x: tx, z: tz } }]);
  const x0 = u.x;
  const z0 = u.z;
  for (let i = 0; i < ticks; i++) w.step([]);
  return Math.sqrt((u.x - x0) * (u.x - x0) + (u.z - z0) * (u.z - z0));
}

/** Số tick để xe đi từ chỗ đang đứng tới gần (tx, tz) (trong 0,5 m). */
function ticksTo(w: World, u: Unit, tx: number, tz: number): number {
  w.step([{ side: u.side, order: { t: "move", ids: [u.id], x: tx, z: tz } }]);
  for (let i = 1; i < sec(60); i++) {
    w.step([]);
    if ((u.x - tx) * (u.x - tx) + (u.z - tz) * (u.z - tz) < 0.25) return i;
  }
  return Infinity;
}

describe("B3a: tốc độ theo địa hình", () => {
  const T = 10;
  const expected = (kind: UnitId, k: number): number => UNITS[kind].speed * DT * T * k;

  it("xe bánh sa lầy trong bùn nặng hơn xe xích, đúng hệ số trong bảng", () => {
    const w = world(PATCHES);
    const lynx = spawn(w, "lynx", -50, -40);
    const titan = spawn(w, "titan", -50, 40);
    expect(w.grid.kindAt(lynx.x, lynx.z)).toBe("mud");
    const dl = distanceIn(w, lynx, -20, -40, T);
    expect(dl).toBeCloseTo(expected("lynx", TERRAIN.mud.speed.wheel), 6);
    const w2 = world(PATCHES);
    const t2 = spawn(w2, "titan", -50, 40);
    expect(distanceIn(w2, t2, -20, 40, T)).toBeCloseTo(expected("titan", TERRAIN.mud.speed.track), 6);
    // xe xích mất ít tốc độ hơn trong bùn
    expect(TERRAIN.mud.speed.track).toBeGreaterThan(TERRAIN.mud.speed.wheel);
    expect(titan).toBeDefined();
  });

  it("đường giúp xe bánh chạy nhanh hơn trên cỏ", () => {
    const w = world(PATCHES);
    const onRoad = spawn(w, "lynx", 20, -40);
    expect(w.grid.kindAt(onRoad.x, onRoad.z)).toBe("road");
    const dRoad = distanceIn(w, onRoad, 60, -40, T);
    const w2 = world(PATCHES);
    const onGrass = spawn(w2, "lynx", 20, 40);
    expect(w2.grid.kindAt(onGrass.x, onGrass.z)).toBe("grass");
    const dGrass = distanceIn(w2, onGrass, 60, 40, T);
    expect(dGrass).toBeCloseTo(expected("lynx", 1), 6);
    expect(dRoad).toBeCloseTo(expected("lynx", TERRAIN.road.speed.wheel), 6);
  });

  it("Xe Tư Lệnh kháng làm chậm: đi bùn như đi cỏ, vẫn được hưởng đường", () => {
    const w = world(PATCHES);
    const c = spawn(w, "commander", -50, -40);
    expect(UNITS.commander.slowResist).toBe(true);
    expect(distanceIn(w, c, -20, -40, T)).toBeCloseTo(expected("commander", 1), 6);
    const w2 = world(PATCHES);
    const c2 = spawn(w2, "commander", 20, -40);
    expect(distanceIn(w2, c2, 60, -40, T)).toBeCloseTo(expected("commander", TERRAIN.road.speed.wheel), 6);
  });

  it("lên dốc chậm hơn xuống dốc; xuống dốc không nhanh hơn đất bằng", () => {
    const up = world(HILL);
    const a = spawn(up, "lynx", -36, 0);
    const tUp = ticksTo(up, a, -4, 0);
    const down = world(HILL);
    const b = spawn(down, "lynx", 4, 0);
    const tDown = ticksTo(down, b, 36, 0);
    const flat = (32 / UNITS.lynx.speed) * 10;
    expect(tUp).toBeGreaterThan(tDown * 1.15);
    expect(tDown).toBeLessThanOrEqual(Math.ceil(flat) + 1);
    // dốc nhất của đồi ~0,46 → chậm nhất ~×0,68: lên dốc không chậm quá mức sàn
    expect(tUp).toBeLessThan(flat / RULES.terrain.slopeMin);
  });

  it("bảng địa hình hợp lệ: cỏ = 1, loại không đi được thì không đi được với mọi kiểu xe", () => {
    expect(TERRAIN.grass.speed).toEqual({ wheel: 1, track: 1 });
    for (const [kind, t] of Object.entries(TERRAIN)) {
      expect(t.speed.wheel === 0, `${kind}: bánh và xích phải cùng đi được hoặc cùng không`).toBe(t.speed.track === 0);
      expect(t.speed.wheel).toBeGreaterThanOrEqual(0);
    }
    for (const spec of Object.values(UNITS)) if (spec.domain === "ground") expect(spec.mobility, `${spec.id} thiếu kiểu di chuyển`).toBeDefined();
  });
});

/** Bản đồ thử: vũng bùn tròn chắn giữa, và một con đường thẳng chạy ngang phía dưới. */
const DETOUR: MapDef = {
  id: "test-detour",
  name: "Thử: đường vòng",
  blurb: "",
  size: { w: 160, h: 160 },
  bases: [
    [-70, 70],
    [70, -70]
  ],
  mines: [],
  hills: [],
  rocks: [],
  rivers: [],
  regions: [
    { kind: "mud", circle: { x: 0, z: -30, r: 12 } },
    {
      kind: "road",
      poly: [
        [-66, 27],
        [66, 27],
        [66, 33],
        [-66, 33]
      ]
    }
  ]
};

/** Các điểm xe thật sự đi qua (lấy mẫu mỗi tick) cho tới khi tới (tx, tz). */
function drive(w: World, u: Unit, tx: number, tz: number): { ticks: number; trail: [number, number][] } {
  w.step([{ side: u.side, order: { t: "move", ids: [u.id], x: tx, z: tz } }]);
  const trail: [number, number][] = [];
  for (let i = 1; i < sec(60); i++) {
    w.step([]);
    trail.push([u.x, u.z]);
    if ((u.x - tx) * (u.x - tx) + (u.z - tz) * (u.z - tz) < 0.25) return { ticks: i, trail };
  }
  return { ticks: Infinity, trail };
}

describe("B3b: tìm đường nhanh nhất theo địa hình", () => {
  it("xe bánh tự vòng quanh vũng bùn và tới sớm hơn lội thẳng", () => {
    const w = world(DETOUR);
    const u = spawn(w, "lynx", -24, -30);
    const { ticks, trail } = drive(w, u, 24, -30);
    // không bánh xe nào lăn vào bùn
    for (const [x, z] of trail) expect(w.grid.kindAt(x, z), `(${x.toFixed(1)}, ${z.toFixed(1)})`).not.toBe("mud");
    // lội thẳng: 24 m bùn + 24 m cỏ
    const straight = ((24 / TERRAIN.mud.speed.wheel + 24) / UNITS.lynx.speed) * 10;
    expect(ticks).toBeLessThan(straight * 0.9);
  });

  it("có đường cái song song thì xe bánh tự lên đường, tới sớm hơn đi thẳng trên cỏ", () => {
    const w = world(DETOUR);
    const u = spawn(w, "lynx", -54, 22);
    const { ticks, trail } = drive(w, u, 54, 22);
    const straight = (108 / UNITS.lynx.speed) * 10;
    expect(ticks).toBeLessThan(straight * 0.95);
    // phần lớn thời gian chạy trên đường (còn lại là lúc chạy chéo lên và xuống đường)
    const onRoad = trail.filter(([x, z]) => w.grid.kindAt(x, z) === "road").length;
    expect(onRoad / trail.length).toBeGreaterThan(0.5);
  });

  it("đi thẳng trên cỏ không vướng gì vẫn là một đoạn thẳng (không tốn A*)", () => {
    const w = world(DETOUR);
    const f = w.grid.field("track", false);
    const p = w.grid.findPath(-40, -60, 40, -60, f);
    expect(p).toEqual([40, -60]);
  });
});
