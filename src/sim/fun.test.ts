/**
 * Kiểm thử "Bản cập nhật vui" (Docs/design/FEATURE_FRAMEWORK.md mục Độ vui):
 * - Cựu binh: kinh nghiệm theo giá trị sát thương gây ra, lên cấp, bắn mạnh hơn, cấp cao tự hồi máu.
 *
 * Chạy trong Phòng Thử Nghiệm (World { sandbox: true }) trên bãi thử của kịch bản thiết kế.
 * Hệ số lấy từ RULES (không khóa con số cân bằng).
 */
import { describe, expect, it } from "vitest";
import { RULES, valueOf, type Side, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { sec, World } from "./world";

function spawn(w: World, kind: UnitId, side: Side, v: number): Unit {
  const [x, z] = arenaPoint(v);
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}
const hold = (w: World, side: Side): void => w.step([{ side, order: { t: "sbHold", side, on: true } }]);
const run = (w: World, s: number, until?: () => boolean): void => {
  for (let i = 0; i < sec(s); i++) {
    w.step([]);
    if (until?.()) return;
  }
};

describe("Cựu binh", () => {
  it("hạ một chiếc Lynx địch thì Lynx lên cấp 1 (kinh nghiệm = giá trị quân đã hạ)", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const me = spawn(w, "lynx", 0, -6);
    const foe = spawn(w, "lynx", 1, 6);
    run(w, 30, () => foe.hp <= 0);
    expect(foe.hp).toBeLessThanOrEqual(0);
    expect(me.xp).toBeCloseTo(valueOf("lynx"), 6);
    expect(me.rank).toBe(1);
    expect(w.events.some((e) => e.t === "rank") || me.rank === 1).toBe(true);
  });

  it("kinh nghiệm chia theo phần sát thương khi nhiều xe cùng bắn", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const a = spawn(w, "lynx", 0, -7);
    const b = spawn(w, "lynx", 0, -5);
    const foe = spawn(w, "titan", 1, 6);
    run(w, 60, () => foe.hp <= 0);
    expect(foe.hp).toBeLessThanOrEqual(0);
    expect(a.xp + b.xp).toBeCloseTo(valueOf("titan"), 6);
    expect(a.xp).toBeGreaterThan(0);
    expect(b.xp).toBeGreaterThan(0);
  });

  /** Sát thương phát đầu tiên của một Lynx có `rank` lên một Xe Vận Tải đứng yên. */
  function firstHit(rank: number): number {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const target = spawn(w, "hauler", 1, 6);
    const me = spawn(w, "lynx", 0, -4);
    me.rank = rank;
    run(w, 10, () => target.hp < target.maxHp);
    return target.maxHp - target.hp;
  }

  it("mỗi cấp bắn mạnh hơn đúng hệ số", () => {
    const base = firstHit(0);
    expect(base).toBeGreaterThan(0);
    for (const r of [1, 2, 3]) expect(firstHit(r) / base).toBeCloseTo(1 + r * RULES.veterancy.dmgPerRank, 6);
  });

  it("cựu binh cấp cao tự hồi máu khi đã lâu không trúng đạn; cấp thấp thì không", () => {
    const V = RULES.veterancy;
    const w = new World(1, { sandbox: true });
    const vet = spawn(w, "titan", 0, -20);
    const green = spawn(w, "titan", 0, 20);
    vet.rank = V.regenRank;
    for (const u of [vet, green]) {
      u.hp = u.maxHp * 0.5;
      u.lastHit = w.tick;
    }
    // chưa đủ thời gian chờ: chưa hồi
    run(w, V.regenDelay - 1);
    expect(vet.hp).toBeCloseTo(vet.maxHp * 0.5, 6);
    run(w, 4);
    expect(vet.hp).toBeGreaterThan(vet.maxHp * 0.5);
    expect(green.hp).toBeCloseTo(green.maxHp * 0.5, 6);
  });
});

describe("Xác quân", () => {
  /** Hạ một chiếc Lynx của phe 1 bằng Lynx phe 0, trả về thế giới sau khi xác vừa xuất hiện. */
  function killed(): { w: World; me: Unit } {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const me = spawn(w, "lynx", 0, -8);
    const foe = spawn(w, "lynx", 1, 8);
    run(w, 30, () => foe.hp <= 0 && w.wrecks.length > 0);
    return { w, me };
  }

  it("xe bị hạ để lại xác chứa Sắt = phần trăm giá trị", () => {
    const { w } = killed();
    expect(w.wrecks.length).toBe(1);
    const wr = w.wrecks[0];
    expect(wr.kind).toBe("lynx");
    expect(wr.value).toBe(Math.round(valueOf("lynx") * RULES.salvage.share));
  });

  it("xe mặt đất phe nào chạm vào trước thì nhặt được (kể cả xác của địch)", () => {
    const { w, me } = killed();
    const wr = w.wrecks[0];
    const before = w.sides[0].stats.salvaged;
    w.step([{ side: 0, order: { t: "move", ids: [me.id], x: wr.x, z: wr.z } }]);
    run(w, 20, () => w.wrecks.length === 0);
    expect(w.wrecks.length).toBe(0);
    expect(w.sides[0].stats.salvaged - before).toBe(wr.value);
  });

  it("xác biến mất sau một thời gian nếu không ai nhặt", () => {
    const { w } = killed();
    run(w, RULES.salvage.seconds - 2);
    expect(w.wrecks.length).toBe(1);
    run(w, 3);
    expect(w.wrecks.length).toBe(0);
  });

  it("xóa quân bằng công cụ Phòng Thử Nghiệm thì không để lại xác", () => {
    const w = new World(1, { sandbox: true });
    const u = spawn(w, "titan", 0, 0);
    w.step([{ side: 0, order: { t: "sbRemove", ids: [u.id] } }]);
    w.step([]);
    expect(w.wrecks.length).toBe(0);
  });
});
