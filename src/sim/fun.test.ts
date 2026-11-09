/**
 * Kiểm thử "Bản cập nhật vui" (Docs/design/FEATURE_FRAMEWORK.md mục Độ vui):
 * - Cựu binh: kinh nghiệm theo giá trị sát thương gây ra, lên cấp, bắn mạnh hơn, cấp cao tự hồi máu.
 *
 * Chạy trong Phòng Thử Nghiệm (World { sandbox: true }) trên bãi thử của kịch bản thiết kế.
 * Hệ số lấy từ RULES (không khóa con số cân bằng).
 */
import { describe, expect, it } from "vitest";
import { RULES, UNITS, valueOf, type Side, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit, Wreck } from "./types";
import { dirToCenter, sec, World } from "./world";

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

  it("xe chiến đấu chạy qua xác thì không được gì: trục vớt là việc của Xe Vận Tải", () => {
    const { w, me } = killed();
    const wr = w.wrecks[0];
    w.step([{ side: 0, order: { t: "move", ids: [me.id], x: wr.x, z: wr.z } }]);
    run(w, 10);
    expect(w.wrecks.length).toBe(1);
    expect(w.sides[0].stats.salvaged).toBe(0);
  });

  it("Xe Vận Tải được giao: tới xác, cẩu lên xe, chở về Tổng Hành Dinh; dỡ hàng xong mới cộng Sắt (kể cả xác của địch)", () => {
    const { w } = killed();
    const wr = w.wrecks[0];
    const h = spawn(w, "hauler", 0, -16);
    w.step([{ side: 0, order: { t: "salvage", ids: [h.id], wreck: wr.id } }]);
    expect(h.hState).toBe("toWreck");
    run(w, 30, () => h.scrap > 0);
    // xác đã lên xe, biến khỏi chiến trường, nhưng chưa về tới nhà thì chưa có Sắt
    expect(h.scrap).toBe(wr.value);
    expect(w.wrecks.length).toBe(0);
    expect(w.sides[0].stats.salvaged).toBe(0);
    run(w, 120, () => w.sides[0].stats.salvaged > 0);
    expect(w.sides[0].stats.salvaged).toBe(wr.value);
    expect(h.scrap).toBe(0);
  });

  it("hậu cần tự điều xe rảnh kéo xác trong vùng căn cứ; xác giữa chiến trường thì để Tư lệnh quyết", () => {
    const w = new World(1);
    w.step([]);
    const hq = w.hqOf(0)!;
    const [dx, dz] = dirToCenter(hq.x, hq.z);
    const at = (x: number, z: number): Wreck => {
      const [fx, fz] = w.grid.nearestFree(x, z, 6)!;
      return { id: 900000 + w.wrecks.length, kind: "lynx", side: 1, x: fx, z: fz, hx: 1, hz: 0, value: 45, until: w.tick + sec(RULES.salvage.seconds), claim: [0, 0] };
    };
    const near = at(hq.x + dx * 12 - dz * 6, hq.z + dz * 12 + dx * 6);
    const far = at(0, 0);
    w.wrecks.push(near, far);
    run(w, 90, () => w.sides[0].stats.salvaged > 0);
    expect(w.sides[0].stats.salvaged).toBe(near.value);
    expect(w.wrecks.includes(far)).toBe(true);
    expect(far.claim[0]).toBe(0);
  });

  it("có quân địch đứng gần xác thì hậu cần không đẩy xe vào; địch đi rồi mới kéo", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 0);
    hold(w, 1);
    const hq = w.hqOf(0)!;
    const [dx, dz] = dirToCenter(hq.x, hq.z);
    const [x, z] = w.grid.nearestFree(hq.x + dx * 12, hq.z + dz * 12, 6)!;
    const wr: Wreck = { id: 900000, kind: "titan", side: 1, x, z, hx: 1, hz: 0, value: 105, until: w.tick + sec(600), claim: [0, 0] };
    w.wrecks.push(wr);
    w.step([{ side: 1, order: { t: "sbSpawn", kind: "titan", side: 1, x: x + dz * 6, z: z - dx * 6 } }]);
    const foe = w.units.find((u) => u.side === 1)!;
    w.step([{ side: 0, order: { t: "sbSpawn", kind: "hauler", side: 0, x: hq.x - dz * 8, z: hq.z + dx * 8 } }]);
    run(w, 8);
    expect(wr.claim[0]).toBe(0);
    w.step([{ side: 1, order: { t: "sbRemove", ids: [foe.id] } }]);
    run(w, 60, () => w.sides[0].stats.salvaged > 0);
    expect(w.sides[0].stats.salvaged).toBe(wr.value);
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

describe("Kỹ năng của binh chủng (không có điểm chỉ huy: kỹ năng nào cũng thuộc về một xe có thật)", () => {
  /** Chạy tới khi xe rải thảm xả xong loạt (hoặc hết giờ); đếm số quả đã phóng, số loạt, độ đứng yên lúc quả đầu rời dàn. */
  function strike(w: World, rk: Unit, x: number, z: number, maxSec = 40): { shots: number; salvos: number; stillAtFirst: number } {
    w.step([{ side: rk.side, order: { t: "barrage", ids: [rk.id], x, z } }]);
    expect(rk.order).toBe("strike");
    let shots = 0;
    let salvos = 0;
    let stillAtFirst = -1;
    for (let i = 0; i < sec(maxSec); i++) {
      w.step([]);
      for (const e of w.events) {
        if (e.t === "shot" && e.src === rk.id) {
          if (shots === 0) stillAtFirst = rk.still;
          shots++;
        }
        if (e.t === "salvo" && e.id === rk.id) salvos++;
      }
      if (shots > 0 && rk.order === "idle") break;
    }
    return { shots, salvos, stillAtFirst };
  }

  it("Xe Tên Lửa Loạt rải thảm: tự chạy tới tầm, dựng dàn đủ lâu mới bắn, xả hết loạt rồi nạp lại; trúng cả cụm địch", () => {
    const W = UNITS.rocket.weapon!;
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const foes = [spawn(w, "lynx", 1, 0), spawn(w, "lynx", 1, 2.5), spawn(w, "lynx", 1, -2.5)];
    const rk = spawn(w, "rocket", 0, -34);
    const [x, z] = arenaPoint(0);
    const r = strike(w, rk, x, z);
    expect(r.shots).toBe(W.burst!.shots * (W.barrels ?? 1));
    expect(r.salvos).toBe(1);
    expect(w.sides[0].stats.salvos).toBe(1);
    // đã chạy vào tầm, và đứng yên đủ thời gian dựng dàn trước quả đầu tiên
    expect(Math.sqrt((rk.x - x) ** 2 + (rk.z - z) ** 2)).toBeLessThanOrEqual(W.range + 0.01);
    expect(r.stillAtFirst).toBeGreaterThanOrEqual(sec(W.deploy!.time));
    // xả xong loạt: về nghỉ, đang nạp lại
    expect(rk.order).toBe("idle");
    expect(rk.burst).toBe(0);
    expect(rk.cooldown).toBeGreaterThan(sec(W.cooldown) * 0.8);
    run(w, 3);
    expect(foes.filter((f) => f.hp < f.maxHp).length).toBeGreaterThanOrEqual(2);
  });

  it("rải thảm bắn được vào chỗ đang khuất sương mù; đứng quá gần thì lùi ra ngoài tầm tối thiểu rồi mới bắn", () => {
    const W = UNITS.rocket.weapon!;
    const w = new World(1, { sandbox: true });
    const rk = spawn(w, "rocket", 0, -34);
    const far = arenaPoint(-34 + W.range - 1);
    expect(w.cellVisible(0, far[0], far[1])).toBe(false);
    expect(w.strikeError(0, [rk.id], far[0], far[1])).toBeNull();
    expect(strike(w, rk, far[0], far[1]).shots).toBe(W.burst!.shots * (W.barrels ?? 1));
    // điểm bắn sát bên cạnh xe: phải lùi ra
    run(w, W.cooldown + 1);
    const near: [number, number] = [rk.x + 3, rk.z];
    expect(strike(w, rk, near[0], near[1]).shots).toBeGreaterThan(0);
    expect(Math.sqrt((rk.x - near[0]) ** 2 + (rk.z - near[1]) ** 2)).toBeGreaterThanOrEqual(W.minRange! - 0.01);
  });

  it("không có Xe Tên Lửa Loạt thì không rải thảm được (không còn đòn gọi từ trên trời)", () => {
    const w = new World(1, { sandbox: true });
    const lynx = spawn(w, "lynx", 0, -10);
    const [x, z] = arenaPoint(0);
    expect(w.strikeError(0, [lynx.id], x, z)).toMatch(/Xe Tên Lửa Loạt/);
    w.step([{ side: 0, order: { t: "barrage", ids: [lynx.id], x, z } }]);
    expect(lynx.order).not.toBe("strike");
  });

  it("Tổng động viên: quân quanh Xe Tư Lệnh chạy nhanh hơn đúng hệ số, rồi phải chờ hồi", () => {
    const M = RULES.abilities.mobilize;
    const speedOver = (on: boolean): number => {
      const w = new World(1, { sandbox: true });
      spawn(w, "commander", 0, -2);
      const u = spawn(w, "lynx", 0, 2);
      if (on) w.step([{ side: 0, order: { t: "mobilize" } }]);
      w.step([{ side: 0, order: { t: "move", ids: [u.id], x: u.x + 30, z: u.z } }]);
      const x0 = u.x;
      const z0 = u.z;
      run(w, 1);
      if (on) expect(w.mobilizeError(0)).toMatch(/giây/);
      return Math.sqrt((u.x - x0) ** 2 + (u.z - z0) ** 2);
    };
    expect(speedOver(true) / speedOver(false)).toBeCloseTo(1 + M.speed, 2);
  });
});

describe("Đài Liên Lạc (điểm chiếm)", () => {
  it("Thung Lũng Sông Sắt có 2 đài trên hai cây cầu, cách đều hai căn cứ", () => {
    const w = new World(1);
    expect(w.uplinks.length).toBe(2);
    const [a, b] = w.map.bases;
    for (const up of w.uplinks) {
      const da = Math.hypot(up.x - a[0], up.z - a[1]);
      const db = Math.hypot(up.x - b[0], up.z - b[1]);
      expect(da).toBeCloseTo(db, 6);
    }
  });

  it("đứng gần thì chiếm được như mỏ; hai phe cùng có mặt thì giằng co", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 0);
    hold(w, 1);
    const up = w.uplinks[0];
    w.step([{ side: 0, order: { t: "sbSpawn", kind: "lynx", side: 0, x: up.x + 2, z: up.z } }]);
    run(w, RULES.captureSeconds + 3, () => up.owner === 0);
    expect(up.owner).toBe(0);
    // địch tới cùng lúc với quân mình: tiến độ không đổi
    w.step([{ side: 1, order: { t: "sbSpawn", kind: "lynx", side: 1, x: up.x - 2, z: up.z } }]);
    const cap = up.cap;
    run(w, 3);
    expect(up.owner).toBe(0);
    expect(up.cap).toBeCloseTo(cap, 6);
  });

  it("phe giữ đài nhìn thấy quanh đài (không cần quân ở đó) và được tính giờ giữ đài cho số liệu sau trận", () => {
    const U = RULES.uplink;
    const a = new World(1);
    const b = new World(1);
    b.uplinks[0].owner = 0;
    b.uplinks[0].cap = 1;
    run(a, 10);
    run(b, 10);
    expect(b.sides[0].stats.uplinkTime).toBeCloseTo(10, 1);
    expect(a.sides[0].stats.uplinkTime).toBe(0);
    const up = b.uplinks[0];
    expect(b.cellVisible(0, up.x + U.sight * 0.8, up.z)).toBe(true);
    expect(a.cellVisible(0, up.x + U.sight * 0.8, up.z)).toBe(false);
  });
});
