/**
 * Kiểm thử các cơ chế bắn (Docs/ARMY_DESIGN.md): bắn loạt, tầm tối thiểu, triển khai (Lockdown),
 * vừa chạy vừa bắn, tháp pháo xoay chậm, giáp mặt trước, phòng thủ điểm, lộ vị trí, rải thảm, độ tản.
 *
 * Mỗi phép thử chạy trong Phòng Thử Nghiệm (World { sandbox: true }). Cơ chế chưa có quân nào dùng thì
 * kiểm thử tạm gắn cho một quân có sẵn rồi trả lại như cũ (`patchWeapon`), vì cơ chế là dữ liệu dùng chung.
 * Chỉ kiểm HÀNH VI (có loạt, có chặn, có trượt…), không khóa con số cân bằng.
 */
import { describe, expect, it } from "vitest";
import { RULES, UNITS, type BuildingId, type Side, type UnitId, type WeaponSpec } from "./content";
import { fromUV } from "./map";
import { ARENA_U } from "./scenarios";
import type { Building, SimEvent, Unit } from "./types";
import { sec, World } from "./world";

const P = (v: number): [number, number] => fromUV(ARENA_U, v);

/** Tạm sửa vũ khí của một binh chủng; gọi hàm trả về để khôi phục. */
function patchWeapon(kind: UnitId, p: Partial<WeaponSpec>): () => void {
  const w = UNITS[kind].weapon!;
  const saved = { ...w };
  Object.assign(w, p);
  return () => {
    for (const k of Object.keys(w)) delete (w as unknown as Record<string, unknown>)[k];
    Object.assign(w, saved);
  };
}

function withPatch(kind: UnitId, p: Partial<WeaponSpec>, fn: () => void): void {
  const restore = patchWeapon(kind, p);
  try {
    fn();
  } finally {
    restore();
  }
}

function unit(w: World, side: Side, kind: UnitId, x: number, z: number, go?: { x: number; z: number; mode: "move" | "amove" }): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z, gx: go?.x, gz: go?.z, go: go?.mode } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}

function building(w: World, side: Side, kind: BuildingId, x: number, z: number): Building {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.buildings.filter((b) => b.side === side && b.kind === kind).pop()!;
}

/** Số phát bắn của `src` trong tick vừa chạy (mục tiêu thả ra là có thể bị bắn ngay trong tick đó). */
const shotsNow = (w: World, src: number): number => w.events.filter((e) => e.t === "shot" && e.src === src).length;

const hold = (w: World, side: Side): void => w.step([{ side, order: { t: "sbHold", side, on: true } }]);

/** Chạy n tick, gom sự kiện bắn của một thực thể. */
function run(w: World, ticks: number, src?: number): { tick: number; e: Extract<SimEvent, { t: "shot" }> }[] {
  const out: { tick: number; e: Extract<SimEvent, { t: "shot" }> }[] = [];
  for (let i = 0; i < ticks; i++) {
    w.step([]);
    for (const e of w.events) if (e.t === "shot" && (src === undefined || e.src === src)) out.push({ tick: w.tick, e });
  }
  return out;
}

const diffs = (ticks: number[]): number[] => ticks.slice(1).map((t, i) => t - ticks[i]);

describe("cơ chế bắn", () => {
  it("bắn loạt: các viên trong loạt sát nhau, hết loạt mới nạp lại", () => {
    withPatch("lynx", { burst: { shots: 3, interval: 0.1 }, cooldown: 2 }, () => {
      const w = new World(1, { sandbox: true });
      const [px, pz] = P(6);
      building(w, 1, "power-pylon", px, pz);
      const [lx, lz] = P(-6);
      const l = unit(w, 0, "lynx", lx, lz);
      const shots = run(w, sec(5), l.id).map((s) => s.tick);
      expect(diffs(shots).slice(0, 5)).toEqual([1, 1, sec(2), 1, 1]);
    });
  });

  it("tầm tối thiểu: mục tiêu quá gần thì không bắn", () => {
    withPatch("lynx", { minRange: 14 }, () => {
      const near = new World(1, { sandbox: true });
      building(near, 1, "power-pylon", ...P(5));
      const a = unit(near, 0, "lynx", ...P(-5));
      expect(run(near, sec(3), a.id)).toHaveLength(0);

      const far = new World(1, { sandbox: true });
      building(far, 1, "power-pylon", ...P(7.5));
      const b = unit(far, 0, "lynx", ...P(-7.5));
      expect(run(far, sec(3), b.id).length).toBeGreaterThan(0);
    });
  });

  it("triển khai bắt buộc: chưa dựng xong thì chưa bắn", () => {
    withPatch("lynx", { deploy: { time: 2, range: 0, dmg: 0, required: true } }, () => {
      const w = new World(1, { sandbox: true });
      building(w, 1, "power-pylon", ...P(6));
      const l = unit(w, 0, "lynx", ...P(-6));
      const t0 = w.tick;
      const shots = run(w, sec(4), l.id);
      expect(shots.length).toBeGreaterThan(0);
      expect(shots[0].tick - t0).toBeGreaterThanOrEqual(sec(2) - 1);
    });
  });

  it("Lockdown: đứng yên đủ lâu thì sát thương tăng", () => {
    withPatch("lynx", { deploy: { time: 1, range: 0, dmg: 1 } }, () => {
      const w = new World(1, { sandbox: true });
      const pylon = building(w, 1, "power-pylon", ...P(6));
      unit(w, 0, "lynx", ...P(-6));
      const drops: number[] = [];
      let hp = pylon.hp;
      for (let i = 0; i < sec(4) && pylon.hp > 0; i++) {
        w.step([]);
        if (pylon.hp < hp) drops.push(Math.round(hp - pylon.hp));
        hp = pylon.hp;
      }
      const base = UNITS.lynx.weapon!.dmgGround;
      expect(drops[0]).toBe(base);
      expect(drops).toContain(base * 2);
    });
  });

  it("vừa chạy vừa bắn: có xác suất trượt (trượt thì đạn không bám mục tiêu, không trúng)", () => {
    withPatch("lynx", { movePenalty: { dmg: 0.5, miss: 1 } }, () => {
      const w = new World(1, { sandbox: true });
      const [px, pz] = P(0);
      const pylon = building(w, 1, "power-pylon", px + 6, pz - 6);
      const [gx, gz] = P(30);
      const l = unit(w, 0, "lynx", ...P(-30), { x: gx, z: gz, mode: "move" });
      const shots = run(w, sec(10), l.id);
      expect(shots.length).toBeGreaterThan(0);
      for (const s of shots) expect(s.e.target).toBe(0);
      expect(pylon.hp).toBe(pylon.maxHp);
    });
  });

  it("tháp pháo xoay chậm: mục tiêu sau lưng thì bắn muộn hơn hẳn", () => {
    const firstShot = (behind: boolean): number => {
      const w = new World(1, { sandbox: true });
      const t = unit(w, 0, "titan", ...P(0));
      const s = behind ? -1 : 1;
      const t0 = w.tick;
      building(w, 1, "power-pylon", t.x + t.hx * 14 * s, t.z + t.hz * 14 * s);
      if (shotsNow(w, t.id)) return w.tick - t0;
      const shots = run(w, sec(6), t.id);
      expect(shots.length).toBeGreaterThan(0);
      return shots[0].tick - t0;
    };
    const turn180 = sec(180 / UNITS.titan.weapon!.traverse!);
    expect(firstShot(true) - firstShot(false)).toBeGreaterThanOrEqual(turn180 - 2);
  });

  it("giáp mặt trước: trúng đạn từ phía trước nhẹ hơn từ phía sau", () => {
    const firstHit = (front: boolean): number => {
      const w = new World(1, { sandbox: true });
      hold(w, 0);
      const t = unit(w, 0, "titan", ...P(0));
      const s = front ? 1 : -1;
      unit(w, 1, "lynx", t.x + t.hx * 12 * s, t.z + t.hz * 12 * s);
      for (let i = 0; i < sec(5) && t.hp === t.maxHp; i++) w.step([]);
      return t.maxHp - t.hp;
    };
    const fa = UNITS.titan.frontArmor!;
    expect(firstHit(false)).toBeGreaterThan(0);
    expect(firstHit(true)).toBeCloseTo(firstHit(false) * (1 - fa.reduce), 6);
  });

  it("phòng thủ điểm: chặn đúng số viên đạn pháo, rồi mới mất máu", () => {
    withPatch("titan", { interceptable: true }, () => {
      const w = new World(1, { sandbox: true });
      hold(w, 1);
      const t = unit(w, 0, "titan", ...P(0));
      const c = unit(w, 1, "commander", t.x + t.hx * 15, t.z + t.hz * 15);
      let drops = 0;
      let hp = c.hp;
      let shots = shotsNow(w, t.id);
      for (let i = 0; i < sec(12); i++) {
        w.step([]);
        for (const e of w.events) if (e.t === "shot" && e.src === t.id) shots++;
        if (c.hp < hp) drops++;
        hp = c.hp;
      }
      hold(w, 0);
      for (let i = 0; i < sec(1); i++) {
        w.step([]);
        if (c.hp < hp) drops++;
        hp = c.hp;
      }
      const charges = UNITS.commander.pointDefense!.charges;
      expect(shots).toBeGreaterThan(charges);
      expect(drops).toBe(shots - charges);
    });
  });

  it("lộ vị trí: vừa bắn thì đối phương thấy xuyên sương mù trong vài giây", () => {
    withPatch("lynx", { reveal: 2 }, () => {
      const w = new World(1, { sandbox: true });
      const l = unit(w, 0, "lynx", ...P(0));
      w.step([]);
      expect(w.visibleTo(1, l)).toBe(false);
      l.lastShot = w.tick;
      expect(w.visibleTo(1, l)).toBe(true);
      for (let i = 0; i < sec(2) + 1; i++) w.step([]);
      expect(w.visibleTo(1, l)).toBe(false);
    });
  });

  it("rải thảm: Valkyrie thả cả chuỗi bom dọc đường bay, không bám mục tiêu", () => {
    const w = new World(1, { sandbox: true });
    const hq = w.hqOf(1)!;
    const [sx, sz] = P(-30);
    const v = unit(w, 0, "valkyrie", sx, sz, { x: hq.x, z: hq.z, mode: "amove" });
    const bombs = run(w, sec(25), v.id);
    const n = UNITS.valkyrie.weapon!.burst!.shots;
    expect(bombs.length).toBeGreaterThanOrEqual(n);
    for (const b of bombs) expect(b.e.target).toBe(0);
    // các quả trong một chuỗi rơi cách nhau vài mét, nối thành một vệt
    for (let i = 1; i < n; i++) {
      const d = Math.sqrt((bombs[i].e.tx - bombs[i - 1].e.tx) ** 2 + (bombs[i].e.tz - bombs[i - 1].e.tz) ** 2);
      expect(d).toBeGreaterThan(1);
      expect(d).toBeLessThan(10);
    }
  });

  it("độ tản: đạn rơi lệch quanh mục tiêu, trong bán kính tản", () => {
    withPatch("titan", { scatter: 4 }, () => {
      const w = new World(1, { sandbox: true });
      const t = unit(w, 0, "titan", ...P(0));
      const p = building(w, 1, "power-pylon", t.x + t.hx * 14, t.z + t.hz * 14);
      const shots = run(w, sec(10), t.id);
      expect(shots.length).toBeGreaterThan(1);
      let off = 0;
      for (const s of shots) {
        expect(s.e.target).toBe(0);
        const d = Math.sqrt((s.e.tx - p.x) ** 2 + (s.e.tz - p.z) ** 2);
        expect(d).toBeLessThanOrEqual(4 + 1e-9);
        off += d;
      }
      expect(off).toBeGreaterThan(0);
    });
  });

  it("súng nhiều nòng: mỗi lần bắn ra các viên song song, xuất phát lệch hai bên", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const [tx, tz] = P(10);
    unit(w, 1, "titan", tx, tz);
    const f = unit(w, 0, "falcon", ...P(-40), { x: tx, z: tz, mode: "amove" });
    const shots = run(w, sec(8), f.id);
    const n = UNITS.falcon.weapon!.barrels!;
    expect(shots.length).toBeGreaterThan(0);
    const first = shots.filter((s) => s.tick === shots[0].tick);
    expect(first).toHaveLength(n);
    const gap = Math.sqrt((first[0].e.x - first[1].e.x) ** 2 + (first[0].e.z - first[1].e.z) ** 2);
    expect(gap).toBeGreaterThan(1);
  });

  it("lượt bổ nhào: máy bay không bay vòng tròn quanh mục tiêu, lượt nào cũng quay lại bắn được", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const [tx, tz] = P(10);
    unit(w, 1, "lynx", tx, tz);
    const f = unit(w, 0, "falcon", ...P(-40), { x: tx, z: tz, mode: "amove" });
    const ticks = run(w, sec(20), f.id).map((s) => s.tick);
    // các lượt bổ nhào: những cụm phát bắn cách nhau quá 0,5 giây
    const passes = ticks.filter((t, i) => i === 0 || t - ticks[i - 1] > 5).length;
    expect(passes).toBeGreaterThanOrEqual(3);
  });

  it("bổ nhào: lao xuống thấp khi bắn mục tiêu mặt đất, rồi kéo lên lại", () => {
    const w = new World(1, { sandbox: true });
    hold(w, 1);
    const [tx, tz] = P(10);
    unit(w, 1, "lynx", tx, tz);
    const f = unit(w, 0, "falcon", ...P(-40), { x: tx, z: tz, mode: "amove" });
    let low = Infinity;
    let climbedBack = false;
    for (let i = 0; i < sec(15); i++) {
      w.step([]);
      low = Math.min(low, f.alt);
      if (low <= UNITS.falcon.diveAlt! + 0.5 && f.alt >= RULES.air.cruiseAlt - 0.5) climbedBack = true;
    }
    expect(low).toBeLessThanOrEqual(UNITS.falcon.diveAlt! + 0.5);
    expect(climbedBack).toBe(true);
  });

  it("cơ chế bắn vẫn tất định: cùng lệnh, cùng mã băm", async () => {
    const { hashWorld } = await import("./world");
    const play = (): number => {
      const w = new World(3, { sandbox: true });
      const [a, b] = [P(-20), P(20)];
      w.step([
        { side: 0, order: { t: "sbSpawn", kind: "skyguard", side: 0, x: a[0], z: a[1] } },
        { side: 0, order: { t: "sbSpawn", kind: "titan", side: 0, x: a[0] + 3, z: a[1] - 3, gx: b[0], gz: b[1], go: "amove" } },
        { side: 1, order: { t: "sbSpawn", kind: "falcon", side: 1, x: b[0], z: b[1], gx: a[0], gz: a[1], go: "amove" } },
        { side: 1, order: { t: "sbSpawn", kind: "lynx", side: 1, x: b[0] - 3, z: b[1] + 3, gx: a[0], gz: a[1], go: "amove" } }
      ]);
      for (let i = 0; i < sec(30); i++) w.step([]);
      return hashWorld(w);
    };
    expect(play()).toBe(play());
  });
});
