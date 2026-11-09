/** Luật đặt công trình lên lưới ô vuông: nằm chính giữa khối ô, luôn chừa lối đi, công bằng giữa hai phe. */
import { describe, expect, it } from "vitest";
import { BUILDINGS, RULES, type BuildingId } from "./content";
import { CELL } from "./maps";
import { World } from "./world";

const LANE = "Phải chừa lối đi cho xe giữa các công trình";
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

  it("công sự được đặt sát nhau để khép tuyến, nhưng cạnh công trình khác vẫn phải chừa lối đi", () => {
    const w = new World(1, { sandbox: true });
    const hq = w.buildings.find((b) => b.kind === "hq" && b.side === 0)!;
    const [hw] = BUILDINGS.hq.half;
    const lane = RULES.buildGapCells * CELL;
    const [nx] = w.blockCells("turret");
    const blockW = nx * CELL;
    // tháp đầu tiên đứng cách Tổng Hành Dinh đúng một lối đi về phía có đất trống
    const dir = hq.x > 0 ? -1 : 1;
    const x1 = hq.x + dir * (hw + lane + blockW / 2);
    const z1 = hq.z;
    expect(w.sandboxPlaceError("turret", x1, z1)).toBeNull();
    w.step([{ side: 0, order: { t: "sbSpawn", kind: "turret", side: 0, x: x1, z: z1 } } as never]);
    // tháp thứ hai sát ngay tháp đầu: không chừa ô nào
    expect(w.sandboxPlaceError("turret", x1 + dir * blockW, z1)).toBeNull();
    // nhà thường sát tháp thì phải chừa lối đi
    expect(w.sandboxPlaceError("radar", x1 + dir * blockW, z1)).toBe(LANE);
    // tháp sát Tổng Hành Dinh cũng phải chừa lối đi
    expect(w.sandboxPlaceError("turret", hq.x + dir * (hw + blockW / 2), z1)).toBe(LANE);
  });

  it("giữa hai công trình phải đủ lối đi", () => {
    const w = new World(1, { sandbox: true });
    const hq = w.buildings.find((b) => b.kind === "hq" && b.side === 0)!;
    const [hw] = BUILDINGS.hq.half;
    const [fw] = BUILDINGS.factory.half;
    const lane = RULES.buildGapCells * CELL;
    for (const dir of [-1, 1]) {
      expect(w.sandboxPlaceError("factory", hq.x + dir * (hw + fw + lane - CELL), hq.z)).toBe(LANE);
      expect(w.sandboxPlaceError("factory", hq.x + dir * (hw + fw + lane), hq.z)).not.toBe(LANE);
    }
    expect(lane).toBeGreaterThanOrEqual(3.58);
  });
});
