/**
 * Kiểm thử lõi mô phỏng: tất định, tìm đường qua cầu, và một trận AI đấu AI chạy trọn vẹn.
 */
import { describe, expect, it } from "vitest";
import { Ai } from "./ai";
import { dcos, dsin } from "./fmath";
import { HQ_POS, MINES } from "./map";
import type { Command } from "./types";
import { hashWorld, sec, World } from "./world";

/** Chạy một trận AI đấu AI, trả về chuỗi mã băm lấy mẫu và trận đã chạy. */
function runMatch(seed: number, ticks: number, sampleEvery = 200): { hashes: number[]; world: World } {
  const w = new World(seed, { maxTicks: ticks });
  const ais = [new Ai(0, seed), new Ai(1, seed)];
  const hashes: number[] = [];
  while (w.winner === -1 && w.tick < ticks) {
    const cmds: Command[] = [];
    for (const ai of ais) for (const order of ai.think(w)) cmds.push({ side: ai.side, order });
    w.step(cmds);
    if (w.tick % sampleEvery === 0) hashes.push(hashWorld(w));
  }
  hashes.push(hashWorld(w));
  return { hashes, world: w };
}

describe("toán tất định", () => {
  it("dsin/dcos đủ chính xác", () => {
    for (let x = -10; x <= 10; x += 0.37) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-6);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-6);
    }
  });
});

describe("bản đồ & tìm đường", () => {
  it("xe từ căn cứ Lam tìm được đường sang căn cứ Đỏ (phải qua cầu)", () => {
    const w = new World(1);
    const [ax, az] = HQ_POS[0];
    const [bx, bz] = HQ_POS[1];
    const p = w.grid.findPath(ax + 8, az - 8, bx - 8, bz + 8);
    expect(p).not.toBeNull();
    // mọi điểm trên đường đều đi được
    for (let i = 0; i < p!.length; i += 2) expect(w.grid.blockedAt(p![i], p![i + 1])).toBe(false);
  });

  it("mọi mỏ đều có chỗ đứng đào xe tới được", () => {
    const w = new World(1);
    const [ax, az] = HQ_POS[0];
    for (const m of MINES) {
      const p = w.grid.findPath(ax + 8, az - 8, m.x + 4, m.z);
      expect(p, `mỏ ở (${m.x}, ${m.z})`).not.toBeNull();
    }
  });
});

describe("lõi mô phỏng", () => {
  it("TẤT ĐỊNH: cùng seed + cùng lệnh thì ra cùng mã băm ở mọi thời điểm", () => {
    const a = runMatch(42, sec(240));
    const b = runMatch(42, sec(240));
    expect(a.hashes.length).toBeGreaterThan(5);
    expect(a.hashes).toEqual(b.hashes);
  });

  it("kinh tế chạy: Xe Vận Tải chở Sắt về kho", () => {
    const w = new World(3);
    for (let i = 0; i < sec(60); i++) w.step([]);
    expect(w.sides[0].stats.ironMined).toBeGreaterThan(0);
    expect(w.sides[1].stats.ironMined).toBeGreaterThan(0);
  });

  it("AI đấu AI chơi trọn một trận (≤ 25 phút) mà không có giá trị hỏng", () => {
    const { world } = runMatch(7, sec(25 * 60), 1000);
    for (const u of world.units) {
      expect(Number.isFinite(u.x) && Number.isFinite(u.z), `${u.kind} #${u.id}`).toBe(true);
      expect(Math.abs(u.x)).toBeLessThanOrEqual(80);
      expect(Math.abs(u.z)).toBeLessThanOrEqual(80);
    }
    for (const s of world.sides) {
      expect(s.iron).toBeGreaterThanOrEqual(0);
      expect(s.oil).toBeGreaterThanOrEqual(0);
    }
    // hai AI phải thực sự đánh nhau và xây dựng
    const built = world.sides[0].stats.unitsBuilt + world.sides[1].stats.unitsBuilt;
    expect(built).toBeGreaterThan(10);
    console.log(
      `Trận seed 7: ${world.winner === 2 ? "hòa" : world.winner === -1 ? "chưa xong" : `phe ${world.winner} thắng`} (${world.winReason}) sau ${(world.tick / 600).toFixed(1)} phút; ` +
        `quân đúc ${world.sides[0].stats.unitsBuilt}/${world.sides[1].stats.unitsBuilt}, hạ ${world.sides[0].stats.kills}/${world.sides[1].stats.kills}`
    );
  });
});
