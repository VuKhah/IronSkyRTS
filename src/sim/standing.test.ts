/**
 * Tìm đường vòng qua xe đứng KHÔNG NHƯỜNG ĐƯỢC (bước 2 kế hoạch đế 16/11/2026; từ T2 cùng ngày xe đứng thường tự nhường đường,
 * `yield.test.ts`, nên lớp xe đứng chỉ còn quân cố định đã hạ bệ, tiểu đội bộ binh và xe trong đội hình đang chốt). Xe chạy đi
 * vòng, không lao vào đẩy; đích bị vây kín thì vẫn có đường (tìm lại không có lớp xe đứng). Chỉ kiểm HÀNH VI.
 */
import { describe, expect, it } from "vitest";
import { UNITS, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";
import { bodyRadius, wallRadius } from "./world/shared";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}
const gap = (a: Unit, b: Unit): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

describe("tìm đường vòng qua xe đứng không nhường được", () => {
  for (const side of [0, 1] as const)
    it(`hàng 5 SkyGuard đã hạ bệ chắn ngang: Lynx đi vòng qua đầu hàng, không xô xe nào, tới nơi (phe ${side})`, () => {
      const w = new World(1, { sandbox: true });
      const [cx0, cz0] = arenaPoint(0);
      const sg = side === 0 ? 1 : -1;
      const cx = cx0 * sg;
      const cz = cz0 * sg;
      // hàng ngang theo trục x, sát nhau (khe hẹp hơn thân Lynx); Lynx đi theo trục z xuyên qua giữa hàng
      const sp = 2 * bodyRadius("skyguard") + 0.8;
      const wall = [-2, -1, 0, 1, 2].map((k) => spawn(w, "skyguard", cx + k * sp * sg, cz, side));
      for (let t = 0; t < sec(UNITS.skyguard.weapon!.deploy!.time + 1); t++) w.step([]);
      expect(wall.every((u) => w.anchored(u))).toBe(true);
      const at = wall.map((u) => [u.x, u.z]);
      const lx = spawn(w, "lynx", cx, cz - 14 * sg, side);
      w.step([{ side, order: { t: "move", ids: [lx.id], x: cx, z: cz + 14 * sg } }]);
      let closest = Infinity;
      for (let t = 0; t < sec(30) && lx.order !== "idle"; t++) {
        w.step([]);
        for (const u of wall) closest = Math.min(closest, gap(lx, u));
      }
      expect(lx.order).toBe("idle");
      expect(Math.sqrt((lx.x - cx) ** 2 + (lx.z - cz - 14 * sg) ** 2)).toBeLessThan(3);
      // không chen vào hàng: luôn cách mọi SkyGuard ít nhất tổng hai vòng thân (trừ sai số lưới)
      expect(closest).toBeGreaterThan(bodyRadius("skyguard") + bodyRadius("lynx") - 0.4);
      wall.forEach((u, i) => {
        expect(Math.abs(u.x - at[i][0]) + Math.abs(u.z - at[i][1]), `SkyGuard ${i} bị xô`).toBeLessThan(0.05);
      });
    });

  it("đích nằm giữa vòng xe đứng kín: vẫn có đường (tìm lại không tính xe đứng), không treo", () => {
    const w = new World(1, { sandbox: true });
    const [cx, cz] = arenaPoint(0);
    const R = 2 * bodyRadius("skyguard") + 0.4;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) spawn(w, "skyguard", cx + dx * R, cz + dz * R);
    for (let t = 0; t < sec(UNITS.skyguard.weapon!.deploy!.time + 1); t++) w.step([]);
    const lx = spawn(w, "lynx", cx + 30, cz);
    expect(w.setPath(lx, cx, cz)).toBe(true);
    expect(lx.path.length).toBeGreaterThan(0);
  });

  it("đường A* có lớp xe đứng đi vòng, không có lớp thì đi thẳng xuyên qua", () => {
    const w = new World(1, { sandbox: true });
    const [cx, cz] = arenaPoint(0);
    const t0 = spawn(w, "artillery", cx, cz);
    for (let t = 0; t < sec(UNITS.artillery.weapon!.deploy!.time + 1); t++) w.step([]);
    expect(w.anchored(t0)).toBe(true);
    const lx = spawn(w, "lynx", cx - 20, cz);
    const f = w.grid.field("wheel", false);
    const plain = w.grid.findPath(lx.x, lx.z, cx + 20, cz, f, 2)!;
    const around = w.grid.findPath(lx.x, lx.z, cx + 20, cz, f, 2, w.standFor(lx)!)!;
    expect(plain.length).toBe(2); // đi thẳng một đoạn
    expect(around.length).toBeGreaterThan(2);
    // mọi đoạn của đường vòng cách tâm Pháo đủ xa: lấy mẫu dọc đường
    let px = lx.x;
    let pz = lx.z;
    let near = Infinity;
    for (let i = 0; i < around.length; i += 2) {
      for (let k = 0; k <= 20; k++) {
        const x = px + ((around[i] - px) * k) / 20;
        const z = pz + ((around[i + 1] - pz) * k) / 20;
        near = Math.min(near, Math.hypot(x - t0.x, z - t0.z));
      }
      px = around[i];
      pz = around[i + 1];
    }
    // đường giữ cách vòng thân Pháo ít nhất bán kính dò vách của Lynx (trừ sai số lưới)
    expect(near).toBeGreaterThan(bodyRadius("artillery") + wallRadius("lynx") - 0.3);
  });
});
