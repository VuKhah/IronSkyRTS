/**
 * Nhà Máy Máy Bay phóng thẳng đứng từ giếng (10/11/2026): cả lô ra đời cùng một tick và giữ chỗ bãi đậu ngay, chiếc thứ k dùng
 * giếng k mod số giếng, chiếc dùng chung giếng chờ dưới giếng tới lượt (được che chắn), rồi bay thẳng lên.
 */
import { describe, expect, it } from "vitest";
import { BUILDINGS, RULES, UNITS, rotOffset, type BuildingId } from "./content";
import type { Building, Unit } from "./types";
import { hashWorld, sec, World } from "./world";

/** Đặt công trình (đã xây xong) bằng công cụ Phòng Thử Nghiệm ở chỗ trống đầu tiên quanh Tổng Hành Dinh phe 0. */
function place(w: World, kind: BuildingId): Building {
  const hq = w.buildings.find((b) => b.side === 0 && b.kind === "hq")!;
  for (let r = 16; r < 120; r += 4)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = hq.x + dx * r;
      const z = hq.z + dz * r;
      if (w.sandboxPlaceError(kind, x, z) !== null) continue;
      const n = w.buildings.length;
      w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x, z } }]);
      if (w.buildings.length > n) return w.buildings[w.buildings.length - 1];
    }
  throw new Error(`không còn chỗ đặt ${kind}`);
}

/** Một thế giới có Nhà Máy Máy Bay + Sân Đáp, nhiều tiền; trả về xưởng và hàm đúc một lô Falcon rồi chờ ra máy bay. */
function setup() {
  const w = new World(1, { sandbox: true });
  const f = place(w, "aircraft-factory");
  place(w, "airfield");
  w.sides[0].iron = 99999;
  w.sides[0].oil = 99999;
  const lot = (): Unit[] => {
    const before = new Set(w.units.map((u) => u.id));
    w.step([{ side: 0, order: { t: "produce", building: f.id, kind: "falcon" } }]);
    for (let i = 0; i < sec(120) && f.queue.length; i++) w.step([]);
    return w.units.filter((u) => !before.has(u.id) && u.kind === "falcon");
  };
  return { w, f, lot };
}

const padCenter = (f: Building, k: number): [number, number] => {
  const r = BUILDINGS[f.kind].pads![k];
  const [ox, oz] = rotOffset((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, f.rot);
  return [f.x + ox, f.z + oz];
};

describe("Nhà Máy Máy Bay phóng thẳng đứng từ giếng", () => {
  it("lô 2 Falcon: mỗi chiếc một giếng (chiếc đầu ở giếng lớn), giữ 2 bãi đậu khác nhau, chờ dưới giếng thì không bị nhắm", () => {
    const { w, f, lot } = setup();
    const made = lot();
    expect(made.length).toBe(UNITS.falcon.batch);
    made.forEach((u, k) => {
      const [px, pz] = padCenter(f, k);
      expect(Math.abs(u.x - px) + Math.abs(u.z - pz)).toBeLessThan(1e-6);
      expect(u.air).toBe("launch");
      expect(World.sheltered(u)).toBe(true);
      expect(w.canHit({ dmgAir: 10, dmgGround: 10 } as never, u)).toBe(false);
    });
    expect(new Set(made.map((u) => `${u.padB}:${u.padI}`)).size).toBe(made.length);
  });

  it("bay thẳng lên khỏi giếng rồi mới bay ra trước, cuối cùng lên độ bay và về bãi đậu", () => {
    const { w, lot } = setup();
    const [u] = lot();
    const x0 = u.x;
    const z0 = u.z;
    const L = RULES.air.launch;
    // hết thời gian chờ + bay thẳng lên: đã cao hơn sàn phóng mà chưa dịch ngang
    while (u.airT < sec(L.rise)) w.step([]);
    expect(u.air).toBe("launch");
    expect(u.alt).toBeGreaterThan(BUILDINGS["aircraft-factory"].launch!.deck);
    expect(Math.abs(u.x - x0) + Math.abs(u.z - z0)).toBeLessThan(1e-6);
    for (let i = 0; i < sec(L.climbOut) + 2; i++) w.step([]);
    // phóng xong là bay về bãi đậu đã giữ (máy bay mới xuất xưởng mang cờ về sân, như cất cánh kiểu cũ)
    expect(["flying", "returning"]).toContain(u.air);
    expect(u.alt).toBeCloseTo(RULES.air.cruiseAlt, 0);
  });

  it("lô lớn hơn số giếng (ví dụ trực thăng lô 3 sau này): chiếc dùng chung giếng chờ thêm một lượt", () => {
    const spec = UNITS.falcon as { batch: number };
    const keep = spec.batch;
    spec.batch = 3;
    try {
      const { f, lot } = setup();
      const made = lot();
      expect(made.length).toBe(3);
      const [ax, az] = padCenter(f, 0);
      expect(Math.abs(made[2].x - ax) + Math.abs(made[2].z - az)).toBeLessThan(1e-6);
      expect(made[2].airT).toBe(made[0].airT - sec(RULES.air.launch.gap));
    } finally {
      spec.batch = keep;
    }
  });

  it("không có lô nào lớn hơn 2 lần số giếng của xưởng đúc nó (không ai phải chờ quá lâu dưới giếng)", () => {
    for (const b of Object.values(BUILDINGS)) {
      if (!b.launch) continue;
      for (const k of b.produces ?? []) expect(UNITS[k].batch, `${k} ở ${b.id}`).toBeLessThanOrEqual(2 * b.pads!.length);
    }
  });

  it("tất định: cùng lệnh chạy hai lần ra cùng mã băm", () => {
    const run = () => {
      const { w, lot } = setup();
      lot();
      for (let i = 0; i < sec(10); i++) w.step([]);
      return hashWorld(w);
    };
    expect(run()).toBe(run());
  });
});
