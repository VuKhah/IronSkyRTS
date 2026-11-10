/** Luật đặt công trình lên lưới ô vuông: nằm chính giữa khối ô, được đặt sát nhau nhưng không vây kín cửa ra, công bằng giữa hai phe. */
import { describe, expect, it } from "vitest";
import { BUILDINGS, type BuildingId } from "./content";
import { CELL } from "./maps";
import { World } from "./world";

const cellsOf = (half: number): number => Math.ceil((half * 2) / CELL - 1e-9);
const KINDS = Object.keys(BUILDINGS) as BuildingId[];

describe("Đặt công trình lên lưới", () => {
  it("Tổng Hành Dinh và các xưởng 8 × 8 m chiếm đúng 4 × 4 ô, Sân Đáp 6 × 8 ô, Nhà Máy Điện 3 × 4 ô", () => {
    expect(BUILDINGS.hq.half.map(cellsOf)).toEqual([4, 4]);
    expect(BUILDINGS.factory.half.map(cellsOf)).toEqual([4, 4]);
    expect(BUILDINGS["special-factory"].half.map(cellsOf)).toEqual([4, 4]);
    expect(BUILDINGS["aircraft-factory"].half.map(cellsOf)).toEqual([4, 4]);
    expect(BUILDINGS.airfield.half.map(cellsOf)).toEqual([6, 8]);
    expect(BUILDINGS["power-plant"].half.map(cellsOf)).toEqual([3, 4]);
  });

  it("công trình chỉ có 3 cỡ chuẩn ngoài Sân Đáp: 8 × 8 m, 4,8 × 6,4 m và 4 × 4 m", () => {
    const sizes = new Set(KINDS.filter((k) => k !== "airfield").map((k) => BUILDINGS[k].half.join("x")));
    expect([...sizes].sort()).toEqual(["2.4x3.2", "2x2", "4x4"]);
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

  /** Thả một công trình bằng công cụ Phòng Thử Nghiệm (đi qua đúng luật đặt nhà); trả về lý do nếu không đặt được. */
  const put = (w: World, side: 0 | 1, kind: BuildingId, x: number, z: number): string | null => {
    const err = w.sandboxPlaceError(kind, x, z);
    if (err === null) w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } } as never]);
    return err;
  };

  it("nhà được đặt sát nhau (người dùng 10/11/2026: miễn là xe vẫn ra được)", () => {
    const w = new World(1, { sandbox: true });
    const hq = w.buildings.find((b) => b.kind === "hq" && b.side === 0)!;
    const [hw] = BUILDINGS.hq.half;
    const dir = hq.x > 0 ? -1 : 1;
    // Trạm Radar sát cạnh hông Tổng Hành Dinh (không phải phía cửa), rồi tháp sát Radar
    const [rx] = w.blockCells("radar");
    const x1 = hq.x + dir * (hw + (rx * CELL) / 2);
    expect(put(w, 0, "radar", x1, hq.z)).toBeNull();
    expect(put(w, 0, "turret", x1 + dir * rx * CELL, hq.z)).toBeNull();
  });

  it("không được đè lên ô cửa ra; cửa ra của Tổng Hành Dinh và xưởng quay về phía giữa bản đồ", () => {
    const w = new World(1, { sandbox: true });
    for (const side of [0, 1] as const) {
      const hq = w.buildings.find((b) => b.kind === "hq" && b.side === side)!;
      const e = w.exitRect("hq", hq.x, hq.z)!;
      expect(Math.sign(e[1] - hq.z)).toBe(Math.sign(-hq.z)); // cửa nhìn về phía z = 0
      expect(put(w, side, "power-pylon", e[0], e[1] + Math.sign(e[1] - hq.z) * 1)).toMatch(/^Không được chắn cửa ra/);
    }
  });

  for (const side of [0, 1] as const)
    it(`không được vây kín cửa ra của xưởng: viên tháp cuối cùng bịt lối bị từ chối (phe ${side})`, () => {
      const w = new World(1, { sandbox: true });
      const sg = side === 0 ? 1 : -1;
      // xưởng ở chỗ đất trống, soi gương cho phe Đỏ
      const fx = sg * -20;
      const fz = sg * 20;
      expect(put(w, side, "factory", fx, fz)).toBeNull();
      const e = w.exitRect("factory", fx, fz)!;
      const door = Math.sign(e[1] - fz);
      const [, fd] = BUILDINGS.factory.half;
      const ez = fz + door * (fd + 2); // tâm hàng tháp hai bên cửa (tháp 4 × 4 m)
      expect(put(w, side, "turret", fx - 4, ez)).toBeNull();
      expect(put(w, side, "turret", fx + 4, ez)).toBeNull();
      // tháp chắn ngay trước ô cửa: cửa chỉ còn 2 ô bị vây bốn phía
      expect(put(w, side, "turret", fx, fz + door * (fd + 2 + 4))).toMatch(/^Sẽ vây kín cửa ra/);
      // lùi ra một ô thì vẫn còn lối hai bên: được
      expect(put(w, side, "turret", fx, fz + door * (fd + 2 + 6))).toBeNull();
    });
});
