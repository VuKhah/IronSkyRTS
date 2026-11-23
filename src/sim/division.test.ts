/**
 * Kiểm thử quy mô sư đoàn (người dùng 09/11/2026): đúc và điều theo lô, đội hình chỉ đọc mã phân nhóm,
 * cả khối đi cùng một tốc độ nhưng không phải tốc độ xe chậm nhất. Chỉ kiểm HÀNH VI, không khóa số tạm.
 */
import { describe, expect, it } from "vitest";
import { FORMATIONS, lotCost, RULES, UNITS, type FormationId, type GroupCode, type Side, type UnitId } from "./content";
import { Rng } from "./fmath";
import { arenaPoint } from "./scenarios";
import type { Building, Group, Unit } from "./types";
import { hashWorld, sec, World } from "./world";
import { spaceRadius } from "./world/shared";
import { DIV_ZONE } from "./world/division";
import { BLOCK_K } from "./world/group";

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

/** Khối đang dịch nguyên khối (đội đã vào hàng, quãng ngắn): đi thẳng tới ô và không dựng mẫu mới. */
const shift = (g: Group): boolean => g.mode === "direct" && g.lat0.length === 0;

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

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("xe cùng lô đứng liền nhau trong đội hình", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, Array<UnitId>(9).fill("lynx"));
    us.forEach((u, i) => (u.lot = 1000 + Math.floor(i / 3)));
    go(w, us, 30);
    const sq: Group = w.groups[0];
    // mỗi xe có ít nhất một xe cùng lô ngay bên cạnh (kể cả lô vắt qua hai hàng)
    const reach = (2 * spaceRadius("lynx") + 1.4) * 1.5;
    sq.ids.forEach((id, i) => {
      const lot = (w.byId.get(id) as Unit).lot;
      const near = sq.ids.some((o, j) => j !== i && (w.byId.get(o) as Unit).lot === lot && Math.sqrt((sq.lat0[i] - sq.lat0[j]) ** 2 + (sq.back0[i] - sq.back0[j]) ** 2) <= reach);
      expect(near, `xe ${id} lô ${lot}`).toBe(true);
    });
  });
});

describe("Pháo và Tên Lửa Loạt là hai tầng khác nhau (người dùng 16/11/2026)", () => {
  for (const f of Object.keys(FORMATIONS) as FormationId[])
    it.skip(`đội hình ${FORMATIONS[f].name}: Pháo đứng hàng riêng, sau hàng Tên Lửa Loạt`, () => {
      const w = new World(1, { sandbox: true });
      const us = group(w, ["titan", "titan", "rocket", "rocket", "artillery", "artillery"]);
      go(w, us, 22, "move", f);
      const sq: Group = w.groups[0];
      const back = (k: UnitId): number[] => sq.ids.map((id, i) => ((w.byId.get(id) as Unit).kind === k ? sq.back0[i] : NaN)).filter((v) => !Number.isNaN(v));
      const rocketMax = Math.max(...back("rocket"));
      const artMin = Math.min(...back("artillery"));
      expect(artMin, "Pháo lùi sau Tên Lửa Loạt ít nhất một hàng").toBeGreaterThan(rocketMax + 1);
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

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("hộ tống Pháo: giáp phía trước và đoạn hậu, Pháo ở giữa, phòng không hai bên", () => {
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

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("kiểu đội hình quyết định hình dạng: kìm chân rộng hơn hành quân", () => {
    const widthOf = (f: FormationId): number => {
      const w = new World(1, { sandbox: true });
      const us = group(w, Array<UnitId>(12).fill("lynx"));
      go(w, us, 22, "move", f);
      return w.groups[0].colsMax;
    };
    expect(FORMATIONS.pin.wide).toBeGreaterThan(FORMATIONS.march.wide);
    expect(widthOf("pin")).toBeGreaterThan(widthOf("march"));
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("lệnh tấn công phải quay đầu thì giáp ra trước; lệnh đi thường giữ nguyên chỗ", () => {
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

  it("đội đã vào hàng quay về chỗ cũ: không xe nào bị xe nhanh hơn chắn đường bỏ lại", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "titan", "titan", "artillery", "artillery", "skyguard", "skyguard"]);
    go(w, us, 15);
    finish(w, us);
    go(w, us, -15);
    finish(w, us);
    for (const u of us) expect(Math.sqrt((u.x - u.tx) ** 2 + (u.z - u.tz) ** 2), `${u.kind} ${u.id}`).toBeLessThan(1.5);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("Tư lệnh không chọn thì mặc định Giữ; đã chọn thì lệnh sau không chọn vẫn giữ kiểu đó", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx", "lynx", "lynx"]);
    go(w, us, 12);
    expect(w.groups[0].formation, "chưa từng chọn").toBe("hold");
    expect(us[0].formation, "mặc định không ghi đè lựa chọn").toBeNull();
    finish(w, us);
    go(w, us, 30, "move", "attack");
    expect(us.every((u) => u.formation === "attack")).toBe(true);
    finish(w, us);
    go(w, us, 15);
    expect(w.groups[0].formation, "từ B sang C không chọn").toBe("attack");
    expect(us.every((u) => u.formation === "attack")).toBe(true);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("lệnh sau chọn kiểu khác thì đổi kiểu và dựng lại; chọn đúng kiểu đang dùng thì không xếp lại", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "titan", "lynx", "lynx", "lynx"]);
    go(w, us, 12, "move", "attack");
    finish(w, us);
    go(w, us, 24, "move", "attack");
    expect(shift(w.groups[0]), "cùng kiểu: dịch nguyên khối").toBe(true);
    finish(w, us);
    go(w, us, 8, "move", "pin");
    expect(w.groups[0].formation).toBe("pin");
    expect(shift(w.groups[0]), "đổi kiểu: dựng lại").toBe(false);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("ghép hai nhóm khác kiểu: cả nhóm theo kiểu của bên đông hơn", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["lynx", "lynx", "lynx", "titan", "titan"]);
    us.slice(0, 3).forEach((u) => (u.formation = "march"));
    us.slice(3).forEach((u) => (u.formation = "pin"));
    go(w, us, 15);
    expect(w.groups[0].formation).toBe("march");
    expect(us.every((u) => u.formation === "march")).toBe(true);
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

describe("đội bay", () => {
  // 18/11/2026: mũi tên chặt lại (cách 6 m thay vì 18 m, người dùng duyệt) để phi đội dồn được hỏa lực: không dồn cục nhưng cũng
  // không xòe rộng (trước đó 6 Falcon rộng 90–110 m)
  it("máy bay cùng một lệnh không dồn cục mà cũng không xòe rộng: mỗi chiếc một điểm đến, bay tới nơi vẫn tách nhau, đội gọn", () => {
    const w = new World(1, { sandbox: true });
    w.step([{ side: 0, order: { t: "sbFuel", on: true } }]);
    const [ax, az] = arenaPoint(-30);
    const [bx, bz] = arenaPoint(30);
    for (let i = 0; i < 6; i++) w.step([{ side: 0, order: { t: "sbSpawn", kind: "falcon", side: 0, x: ax + i * 2, z: az, gx: ax + i * 2, gz: az + 5, go: "move" } }]);
    const us = w.units.filter((u) => u.kind === "falcon");
    w.step([{ side: 0, order: { t: "move", ids: us.map((u) => u.id), x: bx, z: bz } }]);
    expect(new Set(us.map((u) => `${u.mx},${u.mz}`)).size).toBe(6);
    for (let i = 0; i < sec(12); i++) w.step([]);
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) {
        const d = Math.sqrt((us[i].x - us[j].x) ** 2 + (us[i].z - us[j].z) ** 2);
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
    expect(min, "không dồn cục").toBeGreaterThan(2);
    expect(max, "đội bay gọn").toBeLessThan(45);
  });
});

describe("phi đội (18/11/2026)", () => {
  for (const side of [0, 1] as const) {
    it(`6 Falcon đánh đội 5 Titan: chiếc nào cũng vào trận, dồn hỏa lực vào ít mục tiêu (phe ${side})`, () => {
      const w = new World(1, { sandbox: true });
      const foe = (1 - side) as 0 | 1;
      const sg = side === 0 ? 1 : -1;
      const [ax, az] = arenaPoint(-60 * sg);
      const [bx, bz] = arenaPoint(40 * sg);
      for (let i = 0; i < 5; i++) w.step([{ side: foe, order: { t: "sbSpawn", kind: "titan", side: foe, x: bx + (i - 2) * 5 * sg, z: bz } }]);
      for (let i = 0; i < 6; i++) w.step([{ side, order: { t: "sbSpawn", kind: "falcon", side, x: ax + (i - 3) * 4 * sg, z: az } }]);
      const air = w.units.filter((u) => u.side === side && u.kind === "falcon");
      w.step([{ side, order: { t: "move", ids: air.map((u) => u.id), x: bx, z: bz } }]);
      let sum = 0;
      let samples = 0;
      let idleWhileFight = 0;
      for (let t = 0; t < sec(14); t++) {
        w.step([]);
        if (t < sec(6) || t % 5) continue;
        const tg = air.map((u) => u.targetId || u.autoTarget);
        if (tg.some((x) => x)) {
          sum += new Set(tg.filter((x) => x)).size;
          samples++;
          idleWhileFight += tg.filter((x) => !x).length;
        }
      }
      expect(samples, "phi đội đã vào trận").toBeGreaterThan(0);
      expect(idleWhileFight, "không chiếc nào lượn ngoài cuộc khi cả đội đang đánh").toBe(0);
      expect(sum / samples, "trung bình số mục tiêu cùng lúc").toBeLessThanOrEqual(2);
    });
  }
});

describe("tốc độ chung của khối", () => {
  // tốc độ chuẩn của khối (trước hệ số BLOCK_K chừa sức cho xe đuổi ô, lõi di chuyển mới 20/11/2026)
  const speedOf = (kinds: UnitId[]): number => {
    const w = new World(1, { sandbox: true });
    go(w, group(w, kinds), 30);
    return w.groups[0].speed / BLOCK_K;
  };

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("xe chậm được hộ tống thì cả khối đi nhanh hơn xe chậm nhất, nhưng có trần", () => {
    const slow = UNITS.artillery.speed;
    const v = speedOf(["lynx", "lynx", "lynx", "lynx", "artillery"]);
    expect(v).toBeGreaterThan(slow);
    expect(v).toBeLessThanOrEqual(slow * RULES.escortBoost + 1e-9);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("toàn xe chậm thì không được cộng gì", () => {
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

describe("sư đoàn bền vững (A2 bước D1, người dùng duyệt 17/11/2026)", () => {
  const divOf = (w: World, u: Unit) => w.divisions.find((d) => d.id === u.division);

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("lệnh cho từ 3 xe mặt đất lập một sư đoàn; tới nơi không tan mà đóng quân", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx", "lynx"]);
    go(w, us, 10);
    const d = divOf(w, us[0])!;
    expect(d).toBeTruthy();
    expect(us.every((u) => u.division === d.id)).toBe(true);
    expect(d.directive).toBe("move");
    expect(d.mode).toBe("auto");
    finish(w, us);
    for (let i = 0; i < 5; i++) w.step([]);
    expect(us.every((u) => u.group === 0 && u.division === d.id)).toBe(true);
    expect(d.directive).toBe("station");
    // ô đóng quân là chỗ xe đứng khi tới nơi; hướng mặt là hướng đội
    for (const u of us) expect(Math.hypot(d.homeX[u.id] - u.x, d.homeZ[u.id] - u.z)).toBeLessThan(0.5);
    expect(Math.hypot(d.hx, d.hz)).toBeCloseTo(1, 5);
  });

  it("2 xe không lập sư đoàn", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "lynx"]);
    go(w, us, 10);
    expect(us.every((u) => u.division === 0)).toBe(true);
    expect(w.divisions.length).toBe(0);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("Drone Khiên đi cùng lệnh thì vào sư đoàn, Drone Sửa Chữa thì không; drone không tính vào ngưỡng 3 xe", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx", "shield", "repair"]);
    go(w, us, 10);
    const d = divOf(w, us[0])!;
    const shield = us.find((u) => u.kind === "shield")!;
    const repair = us.find((u) => u.kind === "repair")!;
    expect(shield.division).toBe(d.id);
    expect(repair.division).toBe(0);
    const w2 = new World(1, { sandbox: true });
    const us2 = group(w2, ["titan", "lynx", "shield"]);
    go(w2, us2, 10);
    expect(w2.divisions.length).toBe(0);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("ra lệnh riêng cho một xe thì xe đó rời sư đoàn; còn 2 xe vẫn giữ, còn 1 thì tan", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx"]);
    go(w, us, 10);
    finish(w, us);
    const d = divOf(w, us[0])!;
    go(w, [us[2]], 0);
    expect(us[2].division).toBe(0);
    expect(w.divisions).toContain(d);
    expect(d.ids.length).toBe(2);
    go(w, [us[1]], 0);
    w.step([]);
    expect(w.divisions).not.toContain(d);
    expect(us[0].division).toBe(0);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("ra lệnh lại cho cả sư đoàn thì giữ nguyên sư đoàn (mã, chế độ); xe bị hạ thì rời sư đoàn", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx", "lynx"]);
    go(w, us, 10);
    finish(w, us);
    const d = divOf(w, us[0])!;
    d.mode = "direct";
    go(w, us, -10, "amove");
    expect(divOf(w, us[0])).toBe(d);
    expect(d.mode).toBe("direct");
    expect(d.directive).toBe("amove");
    w.step([{ side: 0, order: { t: "sbRemove", ids: [us[3].id] } }]);
    w.step([]);
    expect(d.ids).not.toContain(us[3].id);
  });

  it("lệnh dừng cho cả sư đoàn không làm tan sư đoàn", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx"]);
    go(w, us, 10);
    const d = divOf(w, us[0])!;
    w.step([{ side: 0, order: { t: "stop", ids: us.map((u) => u.id) } }]);
    expect(divOf(w, us[0])).toBe(d);
  });
});

describe("tướng sư đoàn: báo động và quay mặt (A2 D3, người dùng duyệt 17/11/2026)", () => {
  /** Sư đoàn đóng quân ở arenaPoint(10), mặt quay theo hướng vừa đi (từ arenaPoint(-20) sang). */
  function stationed(kinds: UnitId[]): { w: World; us: Unit[]; d: World["divisions"][number] } {
    const w = new World(1, { sandbox: true });
    const us = group(w, kinds);
    go(w, us, 10);
    finish(w, us);
    for (let i = 0; i < 10; i++) w.step([]);
    const d = w.divisions.find((x) => x.id === us[0].division)!;
    return { w, us, d };
  }
  const center = (us: Unit[]): [number, number] => [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.z, 0) / us.length];

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("bị đánh sườn 90°: cả sư đoàn báo động trong 1 s, xoay về phía địch trong 4 s; xe quay thân về phía địch", () => {
    const { w, us, d } = stationed(Array<UnitId>(8).fill("titan"));
    expect(d.directive).toBe("station");
    const [cx, cz] = center(us);
    // sườn phải của hướng đội hình, cách tâm 24 m
    const sx = d.hz;
    const sz = -d.hx;
    const foes = [-4, 0, 4].map((k) => spawn(w, "lynx", cx + sx * 24 + d.hx * k, cz + sz * 24 + d.hz * k, 1));
    const keep = () => foes.forEach((f) => (f.hp = f.maxHp));
    let alarmAt = -1;
    let turnedAt = -1;
    for (let t = 0; t < sec(8); t++) {
      w.step([]);
      keep();
      if (alarmAt < 0 && d.alarm === "near") alarmAt = t;
      if (turnedAt < 0 && d.fx * sx + d.fz * sz > 0.87) turnedAt = t;
    }
    expect(alarmAt, "tick báo động").toBeGreaterThanOrEqual(0);
    expect(alarmAt).toBeLessThanOrEqual(sec(1));
    expect(turnedAt, "tick sư đoàn xoay hướng").toBeGreaterThanOrEqual(0);
    expect(turnedAt).toBeLessThanOrEqual(sec(4));
    // phần lớn Titan đã quay thân về phía địch (giáp trước ra đón)
    const facing = us.filter((u) => u.hx * sx + u.hz * sz > 0.7).length;
    expect(facing, "số Titan quay thân về phía địch").toBeGreaterThanOrEqual(6);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("địch xa (drone trinh sát thấy, chỉ Pháo bắn tới): quân khác đứng yên ở ô, sư đoàn không xoay", () => {
    const { w, us, d } = stationed(["titan", "titan", "titan", "titan", "artillery"]);
    const [cx, cz] = center(us);
    const fx0 = d.fx;
    const fz0 = d.fz;
    // địch ở sườn trái, cách 60 m: ngoài tầm với của Titan (vùng 20 m + tầm 19,5 m), trong tầm Pháo (90 m)
    const lx = -d.hz;
    const lz = d.hx;
    const foe = spawn(w, "titan", cx + lx * 60, cz + lz * 60, 1);
    w.step([{ side: 1, order: { t: "sbHold", side: 1, on: true } }]);
    spawn(w, "scout", cx + lx * 50, cz + lz * 50);
    const titans = us.filter((u) => u.kind === "titan");
    const home = titans.map((u) => [u.x, u.z]);
    let fired = false;
    for (let t = 0; t < sec(10); t++) {
      w.step([]);
      foe.hp = foe.maxHp;
      if (w.events.some((e) => e.t === "shot" && e.src === us.find((u) => u.kind === "artillery")!.id)) fired = true;
    }
    expect(d.alarm).not.toBe("near");
    expect(d.fx * fx0 + d.fz * fz0).toBeGreaterThan(0.99);
    titans.forEach((u, i) => expect(Math.hypot(u.x - home[i][0], u.z - home[i][1]), `Titan ${i} rời ô`).toBeLessThan(1));
    expect(fired, "Pháo bắn địch ở xa").toBe(true);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("sư đoàn xoay TẠI CHỖ (thiết kế 5.3, 20/11/2026): không xe nào đổi ô; xe quay thân về hướng mới; quân đã hạ bệ giữ thân, chỉ quay mâm", () => {
    const { w, us, d } = stationed(["titan", "titan", "titan", "titan", "artillery"]);
    const art = us.find((u) => u.kind === "artillery")!;
    // tới nơi Pháo còn xoay thân về hướng đội (~2,6 s) rồi mới hạ bệ (2 s)
    for (let i = 0; i < sec(6); i++) w.step([]);
    expect(w.anchored(art), "Pháo đã hạ bệ").toBe(true);
    const slots = us.map((u) => [u.tx, u.tz]);
    const artFace = [art.faceX, art.faceZ];
    // quay đầu 180°
    w.divisionFace(d, -d.hx, -d.hz);
    us.forEach((u, i) => expect(Math.hypot(u.tx - slots[i][0], u.tz - slots[i][1]), `${u.kind} ${u.id} giữ ô`).toBe(0));
    expect([art.faceX, art.faceZ], "Pháo hạ bệ giữ hướng thân").toEqual(artFace);
    for (let i = 0; i < sec(6); i++) w.step([]);
    expect(w.anchored(art), "Pháo vẫn hạ bệ").toBe(true);
    for (const u of us.filter((v) => v.kind === "titan")) expect(u.hx * -d.hx + u.hz * -d.hz, `Titan ${u.id} quay thân`).toBeGreaterThan(0.95);
  });

  it("Drone Khiên của sư đoàn bay theo tâm sư đoàn", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx", "shield"]);
    const ground = us.filter((u) => u.air === "none");
    go(w, us, 10);
    finish(w, ground);
    for (let i = 0; i < sec(6); i++) w.step([]);
    const [cx, cz] = center(ground);
    const sh = us.find((u) => u.kind === "shield")!;
    expect(Math.hypot(sh.x - cx, sh.z - cz)).toBeLessThan(8);
  });
});

describe("tướng sư đoàn: cùng bắn, vùng phản công, về ô (A2 D4)", () => {
  function stationed(kinds: UnitId[]): { w: World; us: Unit[]; d: World["divisions"][number] } {
    const w = new World(1, { sandbox: true });
    const us = group(w, kinds);
    go(w, us, 10);
    finish(w, us);
    for (let i = 0; i < 10; i++) w.step([]);
    return { w, us, d: w.divisions.find((x) => x.id === us[0].division)! };
  }

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("địch trước mặt trong tầm với: mọi Titan vào cuộc, không xe nào ra khỏi vùng 20 m; hết địch thì về ô lệch dưới 1 m", () => {
    const { w, us, d } = stationed(Array<UnitId>(8).fill("titan"));
    const home = new Map(us.map((u) => [u.id, [u.x, u.z] as const]));
    const foes = [-6, 0, 6].map((k) => spawn(w, "lynx", d.cx + d.hx * 23 + d.hz * k, d.cz + d.hz * 23 - d.hx * k, 1));
    const fired = new Set<number>();
    let out = 0;
    for (let t = 0; t < sec(12); t++) {
      w.step([]);
      foes.forEach((f) => (f.hp = f.maxHp));
      for (const e of w.events) if (e.t === "shot") fired.add(e.src);
      for (const u of us) out = Math.max(out, Math.hypot(u.x - d.cx, u.z - d.cz) - DIV_ZONE);
    }
    expect(us.filter((u) => fired.has(u.id)).length, "số Titan đã bắn").toBe(us.length);
    expect(out, "xa nhất ra ngoài vùng (m)").toBeLessThan(1);
    w.step([{ side: 1, order: { t: "sbRemove", ids: foes.map((f) => f.id) } }]);
    for (let t = 0; t < sec(18); t++) w.step([]);
    expect(d.alarm).toBe("none");
    for (const u of us) expect(Math.hypot(u.x - home.get(u.id)![0], u.z - home.get(u.id)![1]), `Titan #${u.id} cách ô`).toBeLessThan(1);
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("không bắn dồn quá tay: 10 Titan, hai Lynx trong tầm: sư đoàn chia hỏa lực cho cả hai (mỗi Lynx chỉ cần ~5 Titan trong 2 s)", () => {
    const { w, us, d } = stationed(Array<UnitId>(10).fill("titan"));
    const foes = [-5, 5].map((k) => spawn(w, "lynx", d.cx + d.hx * 18 + d.hz * k, d.cz + d.hz * 18 - d.hx * k, 1));
    w.step([{ side: 1, order: { t: "sbHold", side: 1, on: true } }]);
    for (let t = 0; t < sec(1); t++) {
      w.step([]);
      foes.forEach((f) => (f.hp = f.maxHp));
    }
    const on = foes.map((f) => us.filter((u) => u.divTarget === f.id).length);
    expect(Math.min(...on), `số Titan nhắm từng mục tiêu ${on.join("/")}`).toBeGreaterThanOrEqual(2);
  });
});


describe("chế độ trực tiếp (A2 D5)", () => {
  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("bị đánh sườn ở chế độ trực tiếp: không báo động chung, không xoay, không tiến; chỉ xe trong tầm bắn", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, Array<UnitId>(8).fill("titan"));
    go(w, us, 10);
    finish(w, us);
    for (let i = 0; i < 10; i++) w.step([]);
    const d = w.divisions.find((x) => x.id === us[0].division)!;
    w.step([{ side: 0, order: { t: "divMode", ids: [us[0].id], mode: "direct" } }]);
    expect(d.mode).toBe("direct");
    const home = us.map((u) => [u.x, u.z]);
    const sx = d.hz;
    const sz = -d.hx;
    const foes = [-4, 0, 4].map((k) => spawn(w, "lynx", d.cx + sx * 24 + d.hx * k, d.cz + sz * 24 + d.hz * k, 1));
    for (let t = 0; t < sec(8); t++) {
      w.step([]);
      foes.forEach((f) => (f.hp = f.maxHp));
      expect(d.alarm).toBe("none");
    }
    expect(d.fx * d.hx + d.fz * d.hz).toBeGreaterThan(0.99);
    // không tiến quá luật xích cũ của xe lẻ (12 m quanh ô)
    us.forEach((u, i) => expect(Math.hypot(u.x - home[i][0], u.z - home[i][1])).toBeLessThan(12.5));
    // về lại tự chủ: tướng nhận lại việc
    w.step([{ side: 0, order: { t: "divMode", ids: [us[0].id], mode: "auto" } }]);
    for (let t = 0; t < sec(2); t++) {
      w.step([]);
      foes.forEach((f) => (f.hp = f.maxHp));
    }
    expect(d.alarm).toBe("near");
  });

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("đổi chế độ lúc đang hành quân không làm xe rời đội hình; chế độ nhớ qua lệnh sau", () => {
    const w = new World(1, { sandbox: true });
    const us = group(w, ["titan", "titan", "lynx", "lynx"]);
    go(w, us, 10);
    const sq = us[0].group;
    w.step([{ side: 0, order: { t: "divMode", ids: us.map((u) => u.id), mode: "direct" } }]);
    expect(us.every((u) => u.group === sq)).toBe(true);
    go(w, us, -10);
    expect(w.divisions.find((x) => x.id === us[0].division)!.mode).toBe("direct");
  });
});

describe("tướng sư đoàn công bằng hai phe (A2 D6, soi gương qua tâm bản đồ)", () => {
  /** Sư đoàn 6 Titan + 1 Pháo của phe `side` đi tới đóng quân, rồi 3 Lynx địch đánh vào sườn; phe 1 là ảnh gương của phe 0. */
  function run(side: Side) {
    const w = new World(1, { sandbox: true });
    const sg = side === 0 ? 1 : -1;
    const foe = (1 - side) as Side;
    const rng = new Rng(5);
    const [ax, az] = arenaPoint(-20);
    const us: Unit[] = [];
    for (const k of ["titan", "titan", "titan", "titan", "titan", "titan", "artillery"] as const) {
      const x = (ax + (rng.next() - 0.5) * 18) * sg;
      const z = (az + (rng.next() - 0.5) * 18) * sg;
      us.push(spawn(w, k, x, z, side));
    }
    const [gx, gz] = arenaPoint(10);
    w.step([{ side, order: { t: "move", ids: us.map((u) => u.id), x: gx * sg, z: gz * sg } }]);
    for (let t = 0; t < sec(60) && us.some((u) => u.order !== "idle"); t++) w.step([]);
    for (let t = 0; t < sec(3); t++) w.step([]);
    const d = w.divisions.find((x) => x.id === us[0].division)!;
    const foes = [-4, 0, 4].map((k) => spawn(w, "lynx", d.cx + d.hz * 24 + d.hx * k, d.cz - d.hx * 24 + d.hz * k, foe));
    const trace: number[] = [];
    const alarms: string[] = [];
    for (let t = 0; t < sec(10); t++) {
      w.step([]);
      foes.forEach((f) => (f.hp = f.maxHp));
      alarms.push(d.alarm);
      for (const u of us) trace.push(u.x * sg, u.z * sg, u.hx * sg, u.hz * sg);
    }
    return { trace, alarms, fx: d.fx * sg, fz: d.fz * sg, targets: us.map((u) => foes.findIndex((f) => f.id === u.divTarget)) };
  }

  // TẠM TẮT 23/11/2026: di chuyển kiểu Battle Drones, khối hành quân / sư đoàn tắt (bản đầy đủ: nhánh `luu/quan-doi-nhom-2026-11-23`). Bật lại khi làm lại hệ thống nhóm.
  it.skip("cùng tình huống, hai phe soi gương: báo động, hướng xoay, mục tiêu giao, đường đi từng xe trùng khớp", () => {
    const a = run(0);
    const b = run(1);
    expect(b.alarms).toEqual(a.alarms);
    expect(a.alarms).toContain("near");
    expect(b.fx).toBeCloseTo(a.fx, 9);
    expect(b.fz).toBeCloseTo(a.fz, 9);
    expect(b.targets).toEqual(a.targets);
    let worst = 0;
    for (let i = 0; i < a.trace.length; i++) worst = Math.max(worst, Math.abs(a.trace[i] - b.trace[i]));
    expect(worst, "lệch lớn nhất giữa hai phe (m)").toBeLessThan(1e-6);
  });
});
