/** Luật đặt công trình lên lưới ô vuông: nằm chính giữa khối ô, cách nhau ít nhất 1 ô, không vây kín cửa ra, công bằng giữa hai phe. */
import { describe, expect, it } from "vitest";
import { BUILDINGS, doorDir, RULES, type BuildingId } from "./content";
import { CELL } from "./maps";
import { sec, World } from "./world";

const cellsOf = (half: number): number => Math.ceil((half * 2) / CELL - 1e-9);
const KINDS = Object.keys(BUILDINGS) as BuildingId[];

/** Thả một công trình bằng công cụ Phòng Thử Nghiệm (đi qua đúng luật đặt nhà); trả về lý do nếu không đặt được. */
const put = (w: World, side: 0 | 1, kind: BuildingId, x: number, z: number): string | null => {
  const err = w.sandboxPlaceError(kind, x, z);
  if (err === null) w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } } as never]);
  return err;
};

describe("Đặt công trình lên lưới", () => {
  it("Tổng Hành Dinh 4 × 4 ô, ba xưởng 9 × 9 ô (Xưởng Xe Tăng 3 sân ráp, Xưởng Xe Chuyên Dụng 2 bệ, Nhà Máy Máy Bay 2 giếng phóng), Sân Đáp 6 × 8 ô, Nhà Máy Điện 3 × 4 ô", () => {
    expect(BUILDINGS.hq.half.map(cellsOf)).toEqual([4, 4]);
    for (const k of ["factory", "special-factory", "aircraft-factory"] as const) {
      expect(BUILDINGS[k].half.map(cellsOf), k).toEqual([9, 9]);
      expect(BUILDINGS[k].doors ?? BUILDINGS[k].pads?.length, k).toBe(k === "factory" ? 3 : 2);
    }
    expect(BUILDINGS.airfield.half.map(cellsOf)).toEqual([6, 8]);
    expect(BUILDINGS["power-plant"].half.map(cellsOf)).toEqual([3, 4]);
  });

  it("công trình chỉ có 5 cỡ chuẩn ngoài Sân Đáp: xưởng 18 × 18 m, 8 × 8 m, 4,8 × 6,4 m, 4 × 4 m và tường 1 ô 2 × 2 m", () => {
    const sizes = new Set(KINDS.filter((k) => k !== "airfield").map((k) => BUILDINGS[k].half.join("x")));
    expect([...sizes].sort()).toEqual(["1x1", "2.4x3.2", "2x2", "4x4", "9x9"]);
  });

  it("mọi kích cỡ công trình là bội số của 4 dm", () => {
    for (const k of KINDS)
      for (const h of BUILDINGS[k].half) {
        const n = (h * 2) / 0.4;
        expect(Math.abs(n - Math.round(n)), k).toBeLessThan(1e-9);
      }
  });

  it("tâm công trình nằm đúng tâm khối ô: số ô chẵn thì trên đường lưới, số ô lẻ thì giữa ô", () => {
    const w = new World(1, { sandbox: true });
    for (const k of KINDS) {
      const [hw, hd] = BUILDINGS[k].half;
      for (const [x, z] of [[3.3, -7.9], [-12.6, 21.2], [0.4, 0.6]] as const) {
        const [sx, sz] = w.snapBuilding(k, x, z);
        const fx = ((sx + w.map.halfW) / CELL + (cellsOf(hw) % 2 ? 0.5 : 0)) % 1;
        const fz = ((sz + w.map.halfH) / CELL + (cellsOf(hd) % 2 ? 0.5 : 0)) % 1;
        expect(Math.min(fx, 1 - fx), `${k} x`).toBeLessThan(1e-9);
        expect(Math.min(fz, 1 - fz), `${k} z`).toBeLessThan(1e-9);
      }
    }
  });

  it("căn cứ đầu trận cũng nằm trên lưới", () => {
    const w = new World(1, {});
    for (const b of w.buildings.filter((e) => e.kind === "hq")) expect([b.x, b.z]).toEqual(w.snapBuilding("hq", b.x, b.z));
  });

  it("làm tròn đối xứng qua tâm bản đồ, kể cả điểm rơi đúng giữa hai vị trí", () => {
    const w = new World(1, { sandbox: true });
    for (const k of KINDS)
      for (let x = -30; x <= 30; x += 0.5)
        for (const z of [-17, -1, 0, 1, 2.5, 9]) {
          if (x === 0 && z === 0) continue; // đúng tâm bản đồ là điểm tự soi gương, không có phía nào để chọn
          const [ax, az] = w.snapBuilding(k, x, z);
          const [bx, bz] = w.snapBuilding(k, -x, -z);
          expect(Math.abs(ax + bx), `${k} (${x}, ${z})`).toBeLessThan(1e-9);
          expect(Math.abs(az + bz), `${k} (${x}, ${z})`).toBeLessThan(1e-9);
        }
  });

  it("hai thân nhà cách nhau ít nhất viền + ô cấm xây + viền = 3 ô (người dùng 10/11/2026, bản vẽ xưởng)", () => {
    const w = new World(1, { sandbox: true });
    expect([RULES.buildMarginCells, RULES.buildPadCells]).toEqual([1, 1]);
    expect(put(w, 0, "factory", -25, 25)).toBeNull();
    const f = w.buildings.find((b) => b.kind === "factory")!;
    const [fw] = w.blockHalf("factory", f.rot);
    const [rx] = w.blockCells("radar");
    const at = (gap: number): number => f.x + fw + gap + (rx * CELL) / 2;
    expect(put(w, 0, "radar", at(2 * CELL), f.z - 4)).toBe("Phải cách Xưởng Xe Tăng ít nhất 3 ô");
    expect(put(w, 0, "radar", at(3 * CELL), f.z - 4)).toBeNull();
    // tháp cũng vậy (không còn ngoại lệ công sự đứng sát nhau)
    const r = w.buildings.find((b) => b.kind === "radar")!;
    expect(put(w, 0, "turret", r.x + rx * CELL + 2 * CELL, r.z)).toMatch(/^Phải cách Trạm Radar ít nhất 3 ô/);
    expect(put(w, 0, "turret", r.x + rx * CELL + 3 * CELL, r.z)).toBeNull();
  });

  it("Tổng Hành Dinh vẫn phải có đệm 2 ô quanh mình cho xe vận tải ra vào", () => {
    const w = new World(1, { sandbox: true });
    expect(BUILDINGS.hq.clearCells).toBe(2);
    const hq = w.buildings.find((b) => b.kind === "hq" && b.side === 0)!;
    const [hw] = BUILDINGS.hq.half;
    const [rx] = w.blockCells("radar");
    const dir = hq.x > 0 ? -1 : 1;
    const at = (gap: number): number => hq.x + dir * (hw + gap + (rx * CELL) / 2);
    // viền Tổng Hành Dinh 2 ô + cấm xây 1 + viền Radar 1 = 4 ô
    expect(put(w, 0, "radar", at(3 * CELL), hq.z)).toBe("Phải cách Tổng Hành Dinh ít nhất 4 ô");
    expect(put(w, 0, "radar", at(4 * CELL), hq.z)).toBeNull();
  });

  it("cửa ra của Tổng Hành Dinh quay về giữa bản đồ; xưởng có 3 cửa ở góc trước bên phải, ô cửa không bị chặn", () => {
    const w = new World(1, { sandbox: true });
    for (const side of [0, 1] as const) {
      const hq = w.buildings.find((b) => b.kind === "hq" && b.side === side)!;
      const e = w.exitRect("hq", hq.x, hq.z, hq.rot)!;
      expect(Math.sign(e[1] - hq.z)).toBe(Math.sign(-hq.z)); // cửa nhìn về phía z = 0
    }
    expect(put(w, 0, "factory", -25, 25)).toBeNull();
    const f = w.buildings.find((b) => b.kind === "factory")!;
    const e = w.exitRect("factory", f.x, f.z, f.rot)!;
    // khu ráp xe + dải đường 6 × 4 ô nằm trong thân nhà, các ô của nó xe đi được, phần còn lại của thân thì chặn
    expect([e[2] * 2, e[3] * 2]).toEqual([12, 8]);
    for (const i of w.grid.cellsInRect(e[0], e[1], e[2], e[3])) expect(w.grid.blockedIdx(i)).toBe(false);
    expect(w.grid.blockedAt(f.x, f.z)).toBe(true);
    // không đặt được gì lên lối ra
    expect(put(w, 0, "power-pylon", e[0], e[1])).not.toBeNull();
  });

  it("lô 3 Lynx ra 3 cửa khác nhau, đứng trên ô đi được trong lối ra", () => {
    const w = new World(1, { sandbox: true });
    expect(put(w, 0, "factory", -25, 25)).toBeNull();
    const f = w.buildings.find((b) => b.kind === "factory")!;
    const e = w.exitRect("factory", f.x, f.z, f.rot)!;
    const before = new Set(w.units.map((u) => u.id));
    w.step([{ side: 0, order: { t: "produce", building: f.id, kind: "lynx" } }]);
    for (let t = 0; t < sec(60) && w.units.filter((u) => !before.has(u.id)).length < 3; t++) w.step([]);
    const lynx = w.units.filter((u) => !before.has(u.id) && u.kind === "lynx");
    expect(lynx.length).toBe(3);
    const xs = lynx.map((u) => Math.round(u.x));
    expect(new Set(xs).size).toBe(3);
    for (const u of lynx) {
      expect(Math.abs(u.x - e[0]), "trong lối ra").toBeLessThanOrEqual(e[2]);
      expect(Math.abs(u.z - e[1]), "trong lối ra").toBeLessThanOrEqual(e[3]);
      expect(w.grid.blockedAt(u.x, u.z)).toBe(false);
    }
  });
});

describe("Xoay công trình (người dùng 10/11/2026)", () => {
  it("Sân Đáp xoay 90°: nền móng đổi chiều, ô đáp nằm trong nền móng, máy bay đậu quay theo nhà", () => {
    const w = new World(1, { sandbox: true });
    const [nx, nz] = w.blockCells("airfield", 0);
    expect(w.blockCells("airfield", 1)).toEqual([nz, nx]);
    w.step([{ side: 0, order: { t: "sbSpawn", kind: "airfield", side: 0, x: -24, z: 24, rot: 1 } } as never]);
    const af = w.buildings.find((b) => b.kind === "airfield")!;
    expect(af.rot).toBe(1);
    const [hw, hd] = w.blockHalf("airfield", 1);
    expect(af.cells.length).toBe(nx * nz);
    for (let i = 0; i < af.pads.length; i++) {
      const [px, pz] = w.padPos(af, i);
      expect(Math.abs(px - af.x), `ô đáp ${i}`).toBeLessThan(hw);
      expect(Math.abs(pz - af.z), `ô đáp ${i}`).toBeLessThan(hd);
    }
  });

  it("cửa ra quay theo nấc xoay; lệnh xây mang theo nấc xoay", () => {
    const w = new World(1, { sandbox: true });
    for (const rot of [0, 1, 2, 3]) {
      // tâm lối ra nằm về phía cửa: tích vô hướng với hướng cửa dương
      const e = w.exitRect("factory", 0, 0, rot)!;
      const [dx, dz] = doorDir(rot);
      expect(e[0] * dx + e[1] * dz, `nấc ${rot}`).toBeGreaterThan(0);
    }
    expect(put(w, 0, "factory", -20, 20)).toBeNull();
    const w2 = new World(1, { sandbox: true });
    expect(w2.sandboxPlaceError("factory", -20, 20, 1)).toBeNull();
    w2.step([{ side: 0, order: { t: "sbSpawn", kind: "factory", side: 0, x: -20, z: 20, rot: 1 } } as never]);
    expect(w2.buildings.find((b) => b.kind === "factory")!.rot).toBe(1);
  });
  it("Tường Thành 1 ô: đặt liền nhau thành dải, sát mép nền móng nhà khác, không chắn cửa ra, ô có tường thì chặn xe", () => {
    const w = new World(1, { sandbox: true });
    expect(put(w, 0, "factory", -25, 25)).toBeNull();
    const f = w.buildings.find((b) => b.kind === "factory")!;
    const [, bd] = w.blockHalf("factory", f.rot);
    const m = w.marginOf("factory");
    // dải 4 ô tường liền nhau ngay ngoài mép sau nền móng xưởng (phía không có cửa)
    const dz = f.rot === 2 ? 1 : -1; // phía sau xưởng (ngược hướng cửa)
    const z = f.z + dz * (bd + m + CELL / 2);
    for (let k = -2; k < 2; k++) expect(put(w, 0, "wall", f.x + (k + 0.5) * CELL, z), `ô ${k}`).toBeNull();
    const walls = w.buildings.filter((b) => b.kind === "wall");
    expect(walls.length).toBe(4);
    for (const b of walls) expect(w.grid.blockedAt(b.x, b.z)).toBe(true);
    // lấn vào viền trong mô hình của xưởng thì không được
    expect(put(w, 0, "wall", f.x + 2.5 * CELL, f.z + dz * (bd + m - CELL / 2))).not.toBeNull();
    // không đặt lên lối ra của xưởng
    const e = w.exitRect("factory", f.x, f.z, f.rot)!;
    expect(put(w, 0, "wall", e[0] + 1, e[1] + 1)).not.toBeNull();
  });
});
