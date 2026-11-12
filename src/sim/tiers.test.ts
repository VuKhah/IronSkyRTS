/**
 * Kiểm thử ĐỊA HÌNH BẬC THANG (người dùng chốt 11/11/2026, game-map.ts):
 * - mặt đất là các tầng phẳng 0 / 1 / 2, nối nhau bằng khối dốc; hai tầng kề nhau không qua dốc là vách, không leo được;
 * - quân mặt đất không nhìn thấy tầng cao hơn tầng mình đứng, đứng cao thì nhìn xuống được; máy bay không bị tầng che;
 * - công trình chỉ xây trên nền phẳng;
 * - khối dốc khai báo sai (không nối hai tầng liền nhau) thì dựng bản đồ báo lỗi ngay.
 */
import { describe, expect, it } from "vitest";
import { RULES, UNITS, type Side, type UnitId } from "./content";
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

describe("địa hình bậc thang: thân xe không lấn vào vách", () => {
  /** Khoảng cách từ (x, z) tới ô bị chặn cố định gần nhất (dò 32 hướng, bước 5 cm). */
  const gap = (w: World, x: number, z: number): number => {
    let best = 9;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      for (let d = 0; d < 9; d += 0.05)
        if (w.map.staticBlocked(x + Math.cos(a) * d, z + Math.sin(a) * d)) {
          best = Math.min(best, d);
          break;
        }
    }
    return best;
  };

  it("chạy dọc chân vách (đích sát vách 1 m) mà thân xe vẫn cách vách gần đủ bán kính, và vẫn tới nơi", () => {
    for (const kind of ["lynx", "titan"] as UnitId[]) {
      const w = world();
      const u = spawn(w, kind, -34, -40);
      w.step([{ side: 0, order: { t: "move", ids: [u.id], x: -31, z: 40 } }]);
      let min = 9;
      for (let i = 0; i < sec(30); i++) {
        w.step([]);
        min = Math.min(min, gap(w, u.x, u.z));
      }
      // trước khi sửa (11/11/2026): Titan bán kính 1,9 m sát vách còn 1,0 m (thân lấn vào vách gần nửa)
      expect(min, `${kind}: khoảng hở nhỏ nhất`).toBeGreaterThan(UNITS[kind].radius * 0.75);
      expect(Math.abs(u.z - 40), `${kind} tới nơi`).toBeLessThan(2.5);
    }
  });
});

describe("địa hình bậc thang: mũi xe và mặt cầu", () => {
  it("xe chạy thẳng mũi vào chân vách: mũi xe (nửa thân dài) không chui vào vách", () => {
    for (const kind of ["lynx", "titan", "hauler"] as UnitId[]) {
      const w = world();
      const u = spawn(w, kind, -46, 20);
      // đích ngay chân vách (vách ở x = -30), xe đi về hướng Đông nên mũi chĩa thẳng vào vách
      w.step([{ side: 0, order: { t: "move", ids: [u.id], x: -30.5, z: 20 } }]);
      let worst = -Infinity;
      for (let i = 0; i < sec(15); i++) {
        w.step([]);
        const half = UNITS[kind].halfLen ?? UNITS[kind].radius;
        worst = Math.max(worst, u.x + Math.abs(u.hx) * half);
      }
      // trước khi sửa (11/11/2026): mũi Titan chui vào vách ~1,7 m (giữ cách theo bán kính 1,9 × 0,85 thay vì nửa thân 3,1)
      expect(worst, `${kind}: mũi xe lấn vào vách`).toBeLessThan(-30 + 0.6);
    }
  });

  it("mọi điểm xe đứng được (kể cả mép cầu) đều cao hơn đáy sông: không xe nào tụt xuống sông", () => {
    for (const def of [...MAP_DEFS, ...DEV_MAP_DEFS]) {
      if (def.id === "big-test") continue;
      const m = new GameMap(def);
      for (let r = 0; r < m.rows; r++)
        for (let c = 0; c < m.cols; c++)
          for (const [fx, fz] of [
            [0.1, 0.1],
            [0.9, 0.1],
            [0.5, 0.5],
            [0.1, 0.9],
            [0.9, 0.9]
          ]) {
            const x = -m.halfW + (c + fx) * 2;
            const z = -m.halfH + (r + fz) * 2;
            if (m.staticBlocked(x, z)) continue;
            // bãi cạn sâu nhất 0,3 m; đáy sông sâu ≥ 1,8 m
            expect(m.groundY(x, z), `${def.id}: (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeGreaterThan(-0.5);
          }
    }
  });
});

describe("xe ngược chiều qua nhau (12/11/2026)", () => {
  /**
   * Trước khi sửa: hai Xe Vận Tải đi đúng thẳng hàng ngược chiều (chung một đường A*, chuyện thường giữa mỏ và nhà) chỉ
   * bị đẩy dọc đường nối tâm, triệt tiêu với lực tiến: kẹt mãi giữa đồng và trong lối dốc 10 m. Giờ cả hai lách sang bên
   * (thẳng hàng tuyệt đối thì cùng giữ bên phải), chạm nhau thì cú đẩy trượt dọc vách.
   */
  const cases: [string, [number, number], [number, number]][] = [
    ["đất bằng, thẳng hàng", [-70, -50], [-30, -50]],
    ["xuyên lối dốc, thẳng hàng", [-50, 0], [-20, 0]],
    ["lối dốc, sát mép dốc", [-50, 3.2], [-20, 3.2]]
  ];
  for (const [name, p, q] of cases)
    it(name, () => {
      const w = world();
      const a = spawn(w, "hauler", p[0], p[1]);
      const b = spawn(w, "hauler", q[0], q[1]);
      a.manual = b.manual = true;
      w.step([
        { side: 0, order: { t: "move", ids: [a.id], x: q[0], z: q[1] } },
        { side: 0, order: { t: "move", ids: [b.id], x: p[0], z: p[1] } }
      ]);
      for (let t = 0; t < sec(30); t++) w.step([]);
      expect(Math.hypot(a.x - q[0], a.z - q[1]), "A tới nơi").toBeLessThan(2.5);
      expect(Math.hypot(b.x - p[0], b.z - p[1]), "B tới nơi").toBeLessThan(2.5);
    });
});

describe("bãi tài nguyên (12/11/2026)", () => {
  // Người dùng 12/11: mỏ không còn là một khối mà là một bãi, nhiều điểm tiếp xúc hơn. Lỗi cũ 11/11: mỏ Dầu sát chân vách nhận
  // chỗ đứng trên đỉnh vách, xe đứng mãi phía trên mỏ. Giờ mỗi khối quặng / giếng có một chỗ đỗ được kiểm vừa thân xe.
  const maps = [...MAP_DEFS, ...DEV_MAP_DEFS].filter((d) => d.id !== "big-test");
  for (const def of maps)
    it(`${def.id}: mọi bãi đủ khối, chỗ đỗ cùng tầng, vừa thân xe, không chồng nhau, hai bãi đối xứng bố trí đối xứng`, () => {
      const w = new World(1, { sandbox: true, map: def.id });
      const H = UNITS.hauler;
      for (const m of w.mines) {
        const at = `mỏ (${m.x}, ${m.z})`;
        expect(m.spots.length, `${at}: số khối`).toBeGreaterThanOrEqual(RULES.field.minDeposits);
        expect(m.slots.length).toBe(m.spots.length);
        for (const p of m.spots) {
          expect(w.map.tierAt(p.px, p.pz), `${at}: chỗ đỗ cùng tầng`).toBe(w.map.tierAt(m.x, m.z));
          expect(w.map.onRamp(p.px, p.pz)).toBe(false);
          expect(w.grid.blockedAt(p.x, p.z), `${at}: khối chặn đường`).toBe(true);
          const probe = { kind: "hauler", air: "none", hx: p.fx, hz: p.fz } as Unit;
          expect(w.bodyContact(probe, p.px, p.pz)[2], `${at}: xe đỗ không chạm vật cản`).toBe(0);
        }
        // hai xe đỗ cạnh nhau không chồng thân (tâm cách nhau ít nhất một bề ngang xe)
        for (let i = 0; i < m.spots.length; i++)
          for (let j = i + 1; j < m.spots.length; j++)
            expect(Math.hypot(m.spots[i].px - m.spots[j].px, m.spots[i].pz - m.spots[j].pz), at).toBeGreaterThan(2 * H.radius);
        // đối xứng qua tâm: tập chỗ đỗ của bãi đối xứng = tập chỗ đỗ của bãi này xoay 180° (bãi đúng tâm thì so với chính nó)
        const o = w.mines.find((k) => k.x === -m.x && k.z === -m.z);
        if (!o) continue;
        const key = (x: number, z: number): string => `${Math.round(x * 100)},${Math.round(z * 100)}`;
        const mine = m.spots.map((p) => key(-p.px, -p.pz)).sort();
        const twin = o.spots.map((p) => key(p.px, p.pz)).sort();
        expect(twin, `${at}: đối xứng`).toEqual(mine);
      }
    });

  it("Xe Vận Tải giữ đúng chỗ của mình: xe khác rời bãi thì không ai bị đổi chỗ", () => {
    const w = new World(1, { sandbox: true, map: "standard" });
    const m = w.mines.find((k) => k.owner === 0 && k.spots.length >= 3)!;
    const hs = [0, 1, 2].map((i) => spawn(w, "hauler", m.x + 18 + i * 4, m.z));
    for (const h of hs) w.step([{ side: 0, order: { t: "harvest", ids: [h.id], mine: m.id } }]);
    const before = hs.map((h) => m.slots.indexOf(h.id));
    expect(before.every((i) => i >= 0)).toBe(true);
    w.step([{ side: 0, order: { t: "sbRemove", ids: [hs[0].id] } }]);
    for (let t = 0; t < 5; t++) w.step([]);
    expect(m.slots.indexOf(hs[1].id)).toBe(before[1]);
    expect(m.slots.indexOf(hs[2].id)).toBe(before[2]);
  });
});

describe("xe cắt ngang nhau không lồng thân (12/11/2026)", () => {
  // Ảnh người dùng 12/11: hai Xe Vận Tải cắt ngang nhau trước Tổng Hành Dinh, mũi xe này chui vào hông xe kia gần 1 m
  // (va chạm theo hình tròn bán kính = nửa bề ngang). Giờ xe ngoài đội hình va chạm theo hình chữ nhật đúng thân.
  /** Hai Xe Vận Tải đi từ A tới A2 và từ B tới B2: độ lồng thân thật lớn nhất (m, âm = khe hở nhỏ nhất), cả hai có tới nơi. */
  const pass = (A: readonly [number, number], A2: readonly [number, number], B: readonly [number, number], B2: readonly [number, number]): number => {
    const w = world();
    const a = spawn(w, "hauler", A[0], A[1]);
    const b = spawn(w, "hauler", B[0], B[1]);
    a.manual = b.manual = true;
    w.step([
      { side: 0, order: { t: "move", ids: [a.id], x: A2[0], z: A2[1] } },
      { side: 0, order: { t: "move", ids: [b.id], x: B2[0], z: B2[1] } }
    ]);
    const H = UNITS.hauler;
    let worst = -Infinity;
    for (let t = 0; t < sec(30); t++) {
      w.step([]);
      // độ lồng của hai hình chữ nhật thân thật (bán kính × 1, halfLen × 1) theo trục tách tốt nhất
      let ov = Infinity;
      for (const u of [a, b])
        for (const [ux, uz] of [
          [u.hx, u.hz],
          [u.hz, -u.hx]
        ]) {
          const r = (v: Unit): number => (H.halfLen ?? H.radius) * Math.abs(v.hx * ux + v.hz * uz) + H.radius * Math.abs(v.hz * ux - v.hx * uz);
          ov = Math.min(ov, r(a) + r(b) - Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz));
        }
      worst = Math.max(worst, ov);
    }
    expect(Math.hypot(a.x - A2[0], a.z - A2[1]), "xe A tới nơi").toBeLessThan(2.5);
    expect(Math.hypot(b.x - B2[0], b.z - B2[1]), "xe B tới nơi").toBeLessThan(2.5);
    return worst;
  };
  it("hai Xe Vận Tải đi vuông góc qua cùng một điểm: thân thật lồng dưới 0,2 m, cả hai tới nơi", () => {
    // né xe chủ động (12/11/2026): tầm với tính theo thân thật (mũi xe này vào hông xe kia = nửa dài + nửa ngang), trước đó
    // tính theo bán kính nên chỉ thấy sắp va khi đã cách 2 m: lồng 0,47 m
    expect(pass([-70, -50], [-30, -50], [-50, -70], [-50, -30]), "thân lồng nhau").toBeLessThan(0.2);
  });
  it("hai Xe Vận Tải đối đầu lệch làn 1 m: lách sang bên từ xa, thân thật không chạm", () => {
    expect(pass([-70, -50], [-30, -50], [-30, -49], [-70, -49]), "thân chạm nhau").toBeLessThan(0);
  });
});

describe("xe không quẹt mép dốc khi lên / xuống chéo (12/11/2026)", () => {
  // Người dùng thấy ở dốc B7: xe quẹt mép khi lên / xuống dốc, trượt dọc mép rồi mũi quay vào vách. Gốc: đường nối tắt chỉ
  // chừa ±0,7 m quanh tâm xe và A* men sát vách. Đo trên Pháo (thân rộng nhất): trước khi sửa 374 tick chạm vách giữa đường.
  it("Pháo đi chéo qua mọi dốc nửa Tây của Cao Nguyên Ba Bậc: thân chạm vách giữa đường dưới 120 tick tổng cộng", () => {
    const w = new World(1, { sandbox: true, map: "standard" });
    let touch = 0;
    for (const r of w.map.ramps.filter((k) => k.x0 < 0)) {
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const along = r.dir === "N" || r.dir === "S";
      const lo = r.dir === "N" || r.dir === "W" ? 1 : -1;
      for (const sgn of [1, -1]) {
        const a: [number, number] = along ? [cx + 14 * sgn, cz + lo * 16] : [cx + lo * 16, cz + 14 * sgn];
        const b: [number, number] = along ? [cx - 14 * sgn, cz - lo * 16] : [cx - lo * 16, cz - 14 * sgn];
        for (const [p, q] of [
          [a, b],
          [b, a]
        ]) {
          if (w.grid.blockedAt(p[0], p[1]) || w.grid.blockedAt(q[0], q[1])) continue;
          w.step([{ side: 0, order: { t: "sbClear" } }]);
          const u = spawn(w, "artillery", p[0], p[1]);
          u.manual = true;
          w.step([{ side: 0, order: { t: "move", ids: [u.id], x: q[0], z: q[1] } }]);
          for (let t = 0; t < sec(40) && u.order !== "idle"; t++) {
            w.step([]);
            if (Math.hypot(u.x - p[0], u.z - p[1]) < 4 || Math.hypot(u.x - q[0], u.z - q[1]) < 4) continue;
            const [px, pz] = w.wallNormal(u, u.x, u.z);
            if (px !== 0 || pz !== 0) touch++;
          }
        }
      }
    }
    expect(touch).toBeLessThan(120);
  });
});
