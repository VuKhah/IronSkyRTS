import { describe, expect, it } from "vitest";
import { ARMOR_NAME, BUILDINGS, DMG_NAME, FORMATIONS, PAD_OFFSETS, PAD_SHAPE, padHeading, parkScale, RULES, UNITS, getSpec, type ArmorClass, type DmgType, type EntityId } from "./content";

const ALL = [...Object.keys(UNITS), ...Object.keys(BUILDINGS)] as EntityId[];

describe("content", () => {
  it("mỗi mục có id trùng với khóa của nó", () => {
    for (const id of ALL) expect(getSpec(id).id).toBe(id);
  });

  it("bảng khắc chế chỉ trỏ tới binh chủng / công trình có thật, không tự khắc chế chính mình", () => {
    for (const u of Object.values(UNITS)) {
      for (const ref of [...u.beats, ...u.fears]) {
        expect(ALL, `${u.id} → ${ref}`).toContain(ref);
        expect(ref).not.toBe(u.id);
      }
      expect(u.beats.filter((b) => u.fears.includes(b)), `${u.id} vừa khắc chế vừa sợ cùng một quân`).toEqual([]);
    }
  });

  it("mọi quân có mã phân nhóm được mọi kiểu đội hình biết tới và cỡ lô hợp lệ", () => {
    for (const u of Object.values(UNITS)) {
      expect(Number.isInteger(u.batch) && u.batch >= 1, `${u.id}: cỡ lô`).toBe(true);
      for (const f of Object.values(FORMATIONS)) expect(f.rank[u.group], `${u.id}: mã ${u.group} trong ${f.name}`).toBeTypeOf("number");
    }
  });

  it("chỉ số hợp lệ", () => {
    for (const u of Object.values(UNITS)) {
      expect(u.hp).toBeGreaterThan(0);
      if (u.weapon) expect(u.weapon.cooldown).toBeGreaterThan(0);
      // máy bay phản lực có bình dầu (Sân Đáp nạp); drone bay lơ lửng chạy pin (sạc trong vùng lưới điện): phải có đúng một thứ
      if (u.domain === "air") expect(!!u.fuel !== !!u.hover, `${u.id} là máy bay nên phải có bình dầu hoặc pin (không cả hai)`).toBe(true);
      if (u.kamikaze) expect(u.hover, `${u.id} cảm tử phải là drone`).toBeDefined();
    }
  });

  // Chỉ kiểm cấu trúc, không khóa con số: con số do kịch bản thiết kế chấm (npm run balance).
  it("ma trận Giáp × Đạn đủ mọi ô, hệ số dương", () => {
    const armors = Object.keys(ARMOR_NAME) as ArmorClass[];
    const types = Object.keys(DMG_NAME) as DmgType[];
    expect(Object.keys(RULES.damageMatrix).sort()).toEqual([...armors].sort());
    for (const a of armors) for (const t of types) expect(RULES.damageMatrix[a][t], `${a} × ${t}`).toBeGreaterThan(0);
  });

  it("mọi thực thể có lớp giáp, mọi vũ khí có loại đạn hợp lệ", () => {
    for (const id of ALL) {
      const s = getSpec(id);
      expect(ARMOR_NAME[s.armorClass], id).toBeDefined();
      if (s.weapon) {
        expect(DMG_NAME[s.weapon.dmgType], id).toBeDefined();
        expect(s.weapon.splash, id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("mọi mâm xoay đều mất thời gian: vũ khí của quân mặt đất và công trình phải có traverse, máy bay thì không", () => {
    for (const u of Object.values(UNITS)) {
      if (!u.weapon) continue;
      if (u.domain === "air") expect(u.weapon.traverse, u.id).toBeUndefined();
      else expect(u.weapon.traverse, `${u.id} thiếu traverse`).toBeGreaterThan(0);
    }
    for (const b of Object.values(BUILDINGS)) if (b.weapon) expect(b.weapon.traverse, `${b.id} thiếu traverse`).toBeGreaterThan(0);
  });

  it("mọi xe mặt đất có tốc độ quay thân (xoay tại chỗ), máy bay thì không", () => {
    for (const u of Object.values(UNITS)) {
      if (u.domain === "air") expect(u.turnRate, u.id).toBeUndefined();
      else expect(u.turnRate, `${u.id} thiếu turnRate`).toBeGreaterThan(0);
    }
  });

  it("quân MVP đúc được thì phải có nơi đúc, và nơi đó liệt kê nó", () => {
    for (const u of Object.values(UNITS)) {
      if (!u.mvp || !u.cost) continue;
      expect(u.builtAt, u.id).toBeDefined();
      expect(BUILDINGS[u.builtAt!].produces, u.id).toContain(u.id);
    }
  });
  it("Sân Đáp: số bãi khớp RULES.air.pads, ô chữ V nằm trọn trong sân, không chồng nhau, soi gương trái / phải", () => {
    expect(PAD_OFFSETS.length).toBe(RULES.air.pads);
    const [hx, hz] = BUILDINGS.airfield.half;
    const { halfSpan: S, halfLen: L, notch: N, yaw } = PAD_SHAPE;
    expect(PAD_SHAPE.sin).toBeCloseTo(Math.sin(yaw), 12);
    expect(PAD_SHAPE.cos).toBeCloseTo(Math.cos(yaw), 12);
    // chữ V = 2 tam giác lồi (mũi, đầu cánh, khấc), xoay theo hướng ô rồi dời tới tâm ô
    type P = [number, number];
    const tris = PAD_OFFSETS.map(([x, z], i): P[][] => {
      const [sx, cz] = padHeading(i); // hướng mũi = trục +z cục bộ của ô
      const w = (lx: number, lz: number): P => [x + lx * cz + lz * sx, z - lx * sx + lz * cz];
      const nose = w(0, L);
      const notch = w(0, -(L - N));
      return [[nose, w(S, -L), notch], [nose, notch, w(-S, -L)]];
    });
    for (const t of tris.flat(2)) {
      expect(Math.abs(t[0])).toBeLessThanOrEqual(hx);
      expect(Math.abs(t[1])).toBeLessThanOrEqual(hz);
    }
    // định lý trục tách cho hai tam giác lồi
    const apart = (a: P[], b: P[]): boolean =>
      [a, b].some((poly) =>
        poly.some((p, k) => {
          const q = poly[(k + 1) % 3];
          const n: P = [q[1] - p[1], p[0] - q[0]];
          const proj = (s: P[]) => s.map((v) => v[0] * n[0] + v[1] * n[1]);
          const pa = proj(a);
          const pb = proj(b);
          return Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9;
        })
      );
    for (let i = 0; i < tris.length; i++)
      for (let j = i + 1; j < tris.length; j++)
        for (const a of tris[i]) for (const b of tris[j]) expect(apart(a, b), `bãi ${i} và ${j}`).toBe(true);
    // soi gương: ô nào cũng có hướng nghiêng ra phía nó đứng; đôi ô cùng hàng đối xứng qua x = 0
    PAD_OFFSETS.forEach(([x, , side], i) => {
      expect(side).toBe(Math.sign(x));
      expect(Math.hypot(...padHeading(i))).toBeCloseTo(1, 12);
    });
    for (const [x, z, side] of PAD_OFFSETS) {
      const twin = PAD_OFFSETS.find(([x2, z2]) => x2 === -x && z2 === z);
      if (twin) expect(twin[2]).toBe(-side);
    }
  });
  it("máy bay đậu thu nhỏ cho thân lọt ô chữ V, không phóng to quá nguyên mẫu", () => {
    for (const u of Object.values(UNITS)) {
      if (!u.fuel || u.hover) continue;
      const k = parkScale(u.id);
      expect(k, u.id).toBeLessThanOrEqual(1);
      expect(u.bodyR! * k, u.id).toBeLessThanOrEqual(PAD_SHAPE.halfSpan * 0.9 + 1e-9);
    }
  });
});
