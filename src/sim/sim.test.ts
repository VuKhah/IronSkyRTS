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

  it("máy bay hết dầu tự bay về sân thay vì rơi (dầu dự trữ)", () => {
    const w = new World(11);
    const st = w.sides[0];
    st.iron = 5000;
    st.oil = 5000;
    const hq = w.hqOf(0)!;
    let spot: [number, number] | null = null;
    for (let r = 12; r <= 28 && !spot; r += 2)
      for (const [dx, dz] of [[1, 0], [0, -1], [1, -1], [-1, 0], [0, 1]] as const)
        if (!spot && w.canPlace(0, "airfield", Math.round(hq.x + dx * r), Math.round(hq.z + dz * r)) === null) spot = [Math.round(hq.x + dx * r), Math.round(hq.z + dz * r)];
    expect(spot, "tìm được chỗ đặt Sân Đáp").not.toBeNull();
    w.step([{ side: 0, order: { t: "build", kind: "airfield", x: spot![0], z: spot![1] } }]);
    const af = w.buildings.find((b) => b.kind === "airfield" && b.side === 0);
    expect(af, "đặt được Sân Đáp").toBeDefined();
    for (let i = 0; i < sec(13); i++) w.step([]);
    w.step([{ side: 0, order: { t: "produce", building: af!.id, kind: "falcon" } }]);
    for (let i = 0; i < sec(8); i++) w.step([]);
    const f = w.units.find((u) => u.kind === "falcon" && u.side === 0)!;
    expect(f).toBeDefined();
    // bay ra tận góc xa nhất bên kia bản đồ, rồi để mặc
    w.step([{ side: 0, order: { t: "move", ids: [f.id], x: 64, z: 64 } }]);
    let landed = false;
    for (let i = 0; i < sec(120); i++) {
      w.step([]);
      if (!w.byId.has(f.id)) break;
      if (i > sec(10) && f.air === "parked") landed = true;
    }
    expect(w.byId.has(f.id), "Falcon không được rơi").toBe(true);
    expect(landed, "Falcon phải tự hạ cánh về sân").toBe(true);
  });

  it("ĐIỆN: thiếu điện thì chậm lại, Nhà Máy Điện đốt Dầu, tắt máy thì ngừng phát", () => {
    const w = new World(5);
    const st = w.sides[0];
    st.iron = 9000;
    st.oil = 2000;
    const hq = w.hqOf(0)!;
    const place = (kind: "factory" | "airfield" | "power-plant" | "power-pylon" | "turret"): number => {
      for (let r = 10; r <= 30; r += 2)
        for (const [dx, dz] of [[1, 0], [0, -1], [1, -1], [-1, 0], [0, 1], [-1, -1], [1, 1]] as const) {
          const x = Math.round(hq.x + dx * r);
          const z = Math.round(hq.z + dz * r);
          if (w.canPlace(0, kind, x, z) === null) {
            w.step([{ side: 0, order: { t: "build", kind, x, z } }]);
            return w.buildings[w.buildings.length - 1].id;
          }
        }
      throw new Error(`không đặt được ${kind}`);
    };
    w.step([]);
    expect(st.powerGen).toBe(20);
    expect(st.eff).toBe(1);
    place("factory");
    for (let i = 0; i < sec(12); i++) w.step([]);
    place("airfield");
    for (let i = 0; i < sec(14); i++) w.step([]);
    // Xưởng 10 + Sân Đáp 15 = 25 MW > 20 MW của HQ → hiệu suất 80%
    expect(st.powerUse).toBe(25);
    expect(st.eff).toBeCloseTo(0.8, 5);
    const plant = place("power-plant");
    for (let i = 0; i < sec(9); i++) w.step([]);
    const oil0 = st.oil;
    for (let i = 0; i < sec(10); i++) w.step([]);
    expect(st.eff).toBe(1);
    expect(st.powerGen).toBe(60);
    expect(oil0 - st.oil).toBeCloseTo(4, 1); // 0.4 Dầu/s × 10 s
    w.step([{ side: 0, order: { t: "toggle", building: plant } }]);
    w.step([]);
    expect(st.powerGen).toBe(20);
  });

  it("ĐIỆN: chỉ xây được trong vùng của HQ / Nhà Máy Điện / Cột Điện; Cột Điện kéo vùng xây ra xa", () => {
    const w = new World(5);
    w.sides[0].iron = 9000;
    const hq = w.hqOf(0)!;
    const far: [number, number] = [hq.x + 46, hq.z - 6];
    expect(w.canPlace(0, "turret", far[0], far[1])).not.toBeNull();
    // chuỗi cột điện từ căn cứ hướng ra điểm xa
    let x = hq.x;
    for (let i = 0; i < 3; i++) {
      x += 14;
      expect(w.canPlace(0, "power-pylon", x, hq.z - 6), `cột thứ ${i + 1}`).toBeNull();
      w.step([{ side: 0, order: { t: "build", kind: "power-pylon", x, z: hq.z - 6 } }]);
      for (let k = 0; k < sec(4); k++) w.step([]);
    }
    expect(w.canPlace(0, "turret", far[0], far[1])).toBeNull();
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
