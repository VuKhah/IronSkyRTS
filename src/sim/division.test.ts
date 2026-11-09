/**
 * Kiểm thử quy mô sư đoàn (người dùng 09/11/2026): đúc và điều theo lô, đội hình chỉ đọc mã phân nhóm,
 * cả khối đi cùng một tốc độ nhưng không phải tốc độ xe chậm nhất. Chỉ kiểm HÀNH VI, không khóa số tạm.
 */
import { describe, expect, it } from "vitest";
import { FORMATIONS, lotCost, RULES, UNITS, type FormationId, type GroupCode, type UnitId } from "./content";
import { Rng } from "./fmath";
import { arenaPoint } from "./scenarios";
import type { Building, Squad, Unit } from "./types";
import { hashWorld, sec, World } from "./world";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}

function group(w: World, kinds: UnitId[], seed = 5): Unit[] {
  const rng = new Rng(seed);
  const [ax, az] = arenaPoint(-20);
  const before = new Set(w.units.map((u) => u.id));
  for (const k of kinds) spawn(w, k, ax + (rng.next() - 0.5) * 18, az + (rng.next() - 0.5) * 18);
  return w.units.filter((u) => !before.has(u.id));
}

function go(w: World, us: Unit[], v: number, t: "move" | "amove" = "move", formation?: FormationId): void {
  const [x, z] = arenaPoint(v);
  w.step([{ side: 0, order: { t, ids: us.map((u) => u.id), x, z, formation } }]);
}

function finish(w: World, us: Unit[], seconds = 90): void {
  for (let i = 0; i < sec(seconds) && us.some((u) => u.order !== "idle"); i++) w.step([]);
}

/** Vị trí theo hướng đội hình: f = phía trước, l = lệch ngang. */
function frame(us: Unit[]): (u: Unit) => { f: number; l: number } {
  const hx = us[0].faceX;
  const hz = us[0].faceZ;
  const cx = us.reduce((s, u) => s + u.x, 0) / us.length;
  const cz = us.reduce((s, u) => s + u.z, 0) / us.length;
  return (u) => ({ f: (u.x - cx) * hx + (u.z - cz) * hz, l: (u.x - cx) * hz - (u.z - cz) * hx });
}

describe("đúc và điều theo lô", () => {
  function shop(): { w: World; b: Building } {
    const w = new World(1);
    w.sides[0].iron = 50000;
    w.sides[0].oil = 50000;
    const base = w.hqOf(0)!;
    let spot: [number, number] | null = null;
    for (let r = 12; r < 40 && !spot; r += 2)
      for (const [dx, dz] of [[1, 0], [0, -1], [1, -1], [-1, 0], [0, 1]])
        if (!spot && w.canPlace(0, "factory", base.x + dx * r, base.z + dz * r) === null) spot = [base.x + dx * r, base.z + dz * r];
    w.step([{ side: 0, order: { t: "build", kind: "factory", x: spot![0], z: spot![1] } }]);
    const b = w.buildings.find((x) => x.side === 0 && x.kind === "factory")!;
    for (let i = 0; i < sec(40) && !b.built; i++) w.step([]);
    expect(b.built).toBe(true);
    return { w, b };
  }

  it("một lần bấm đúc ra cả lô: trả tiền cả lô, các xe cùng số lô", () => {
    const { w, b } = shop();
    const iron = w.sides[0].iron;
    const before = new Set(w.units.map((u) => u.id));
    w.step([{ side: 0, order: { t: "produce", building: b.id, kind: "lynx" } }]);
    expect(iron - w.sides[0].iron).toBeGreaterThanOrEqual(lotCost("lynx").iron - 1e-6 - 50);
    for (let i = 0; i < sec(60) && b.queue.length; i++) w.step([]);
    const made = w.units.filter((u) => !before.has(u.id) && u.kind === "lynx");
    expect(made.length).toBe(UNITS.lynx.batch);
    expect(made[0].lot).toBeGreaterThan(0);
    expect(new Set(made.map((u) => u.lot)).size).toBe(1);
  });

  it("hủy đúc hoàn lại cả lô", () => {
    const { w, b } = shop();
    w.step([{ side: 0, order: { t: "produce", building: b.id, kind: "titan" } }]);
    const after = w.sides[0].iron;
    w.step([{ side: 0, order: { t: "cancel", building: b.id } }]);
    expect(w.sides[0].iron - after).toBeGreaterThanOrEqual(lotCost("titan").iron - 1);
  });

  it("không đủ chỗ trong giới hạn quân cho cả lô thì không nhận lệnh đúc", () => {
    const { w, b } = shop();
    const cap = RULES.unitCap;
    (RULES as { unitCap: number }).unitCap = w.unitCount(0) + UNITS.lynx.batch - 1;
    try {
      w.step([{ side: 0, order: { t: "produce", building: b.id, kind: "lynx" } }]);
      expect(b.queue.length).toBe(0);
    } finally {
      (RULES as { unitCap: number }).unitCap = cap;
    }
  });

  it("xe cùng lô đứng liền nhau trong đội hình", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, Array<UnitId>(9).fill("lynx"));
    us.forEach((u, i) => (u.lot = 1000 + Math.floor(i / 3)));
    go(w, us, 30);
    const sq: Squad = w.squads[0];
    // mỗi xe có ít nhất một xe cùng lô ngay bên cạnh (kể cả lô vắt qua hai hàng)
    const reach = (2 * UNITS.lynx.radius + 1.4) * 1.5;
    sq.ids.forEach((id, i) => {
      const lot = (w.byId.get(id) as Unit).lot;
      const near = sq.ids.some((o, j) => j !== i && (w.byId.get(o) as Unit).lot === lot && Math.sqrt((sq.offLat[i] - sq.offLat[j]) ** 2 + (sq.offBack[i] - sq.offBack[j]) ** 2) <= reach);
      expect(near, `xe ${id} lô ${lot}`).toBe(true);
    });
  });
});

describe("đội hình chỉ đọc mã phân nhóm", () => {
  it("đổi mã của một quân là đổi chỗ đứng của nó, không cần sửa luật", () => {
    const place = (): { titan: number; lynx: number } => {
      const w = new World(1, { sandbox: true });
      const us = group(w, ["titan", "titan", "titan", "lynx", "lynx", "lynx"]);
      go(w, us, 22);
      finish(w, us);
      const at = frame(us);
      const avg = (k: UnitId): number => {
        const v = us.filter((u) => u.kind === k).map((u) => at(u).f);
        return v.reduce((a, b) => a + b, 0) / v.length;
      };
      return { titan: avg("titan"), lynx: avg("lynx") };
    };
    const old: GroupCode = UNITS.titan.group;
    try {
      UNITS.titan.group = "DAN";
      const p = place();
      expect(p.titan, "mã đạn đạo đứng sau mã mũi nhanh").toBeLessThan(p.lynx);
    } finally {
      UNITS.titan.group = old;
    }
  });

  it("hộ tống Pháo: giáp phía trước và đoạn hậu, Pháo ở giữa, phòng không hai bên", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "titan", "titan", "titan", "titan", "artillery", "artillery", "skyguard", "skyguard"]);
    go(w, us, 18, "move", "escort"); // quãng ngắn, đích trống: đội giãn hết cỡ
    finish(w, us);
    const at = frame(us);
    const of = (k: UnitId): { f: number; l: number }[] => us.filter((u) => u.kind === k).map(at);
    const titanF = of("titan").map((p) => p.f);
    const artF = of("artillery").map((p) => p.f);
    expect(Math.max(...titanF)).toBeGreaterThan(Math.max(...artF));
    expect(Math.min(...titanF)).toBeLessThan(Math.min(...artF));
    const artL = Math.max(...of("artillery").map((p) => Math.abs(p.l)));
    const sky = of("skyguard");
    for (const p of sky) expect(Math.abs(p.l)).toBeGreaterThan(artL);
    expect(sky[0].l * sky[1].l, "mỗi bên một xe").toBeLessThan(0);
  });

  it("kiểu đội hình quyết định hình dạng: kìm chân rộng hơn hành quân", () => {
    const widthOf = (f: FormationId): number => {
      const w = new World(1, { sandbox: true });
      const us = group(w, Array<UnitId>(12).fill("lynx"));
      go(w, us, 22, "move", f);
      return w.squads[0].colsMax;
    };
    expect(FORMATIONS.pin.wide).toBeGreaterThan(FORMATIONS.march.wide);
    expect(widthOf("pin")).toBeGreaterThan(widthOf("march"));
  });

  it("lệnh tấn công phải quay đầu thì giáp ra trước; lệnh đi thường giữ nguyên chỗ", () => {
    const run = (t: "move" | "amove"): number => {
      const w = new World(1, { sandbox: true });
      const us = group(w, ["titan", "titan", "titan", "artillery", "artillery"]);
      go(w, us, 16);
      finish(w, us);
      go(w, us, -8, t);
      finish(w, us);
      const at = frame(us);
      const avg = (k: UnitId): number => {
        const v = us.filter((u) => u.kind === k).map((u) => at(u).f);
        return v.reduce((a, b) => a + b, 0) / v.length;
      };
      return avg("titan") - avg("artillery");
    };
    expect(run("amove"), "tấn công: giáp ở trước Pháo").toBeGreaterThan(0);
    expect(run("move"), "đi thường: giữ chỗ, Pháo thành hàng đầu").toBeLessThan(0);
  });

  it("chọn đội hình vẫn tất định", () => {
    const hash = (): number => {
      const w = new World(1, { sandbox: true });
      const us = group(w, ["titan", "titan", "lynx", "lynx", "skyguard", "artillery"]);
      go(w, us, 25, "amove", "escort");
      for (let i = 0; i < sec(20); i++) w.step([]);
      return hashWorld(w);
    };
    expect(hash()).toBe(hash());
  });
});

describe("tốc độ chung của khối", () => {
  const speedOf = (kinds: UnitId[]): number => {
    const w = new World(1, { sandbox: true });
    go(w, group(w, kinds), 30);
    return w.squads[0].speed;
  };

  it("xe chậm được hộ tống thì cả khối đi nhanh hơn xe chậm nhất, nhưng có trần", () => {
    const slow = UNITS.artillery.speed;
    const v = speedOf(["lynx", "lynx", "lynx", "lynx", "artillery"]);
    expect(v).toBeGreaterThan(slow);
    expect(v).toBeLessThanOrEqual(slow * RULES.escortBoost + 1e-9);
  });

  it("toàn xe chậm thì không được cộng gì", () => {
    expect(speedOf(["artillery", "artillery", "artillery"])).toBeCloseTo(UNITS.artillery.speed, 6);
  });

  it("xe chậm thật sự chạy theo kịp khối khi hành quân", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["lynx", "lynx", "lynx", "lynx", "artillery"]);
    go(w, us, 30);
    const a = us.find((u) => u.kind === "artillery")!;
    let best = 0;
    for (let i = 0; i < sec(25) && us.some((u) => u.order !== "idle"); i++) {
      const [x, z] = [a.x, a.z];
      w.step([]);
      best = Math.max(best, Math.sqrt((a.x - x) ** 2 + (a.z - z) ** 2) * 10);
    }
    expect(best).toBeGreaterThan(UNITS.artillery.speed);
  });
});
