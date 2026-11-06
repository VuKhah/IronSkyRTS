import { describe, expect, it } from "vitest";
import { ARMOR_NAME, BUILDINGS, DMG_NAME, PAD_OFFSETS, RULES, UNITS, getSpec, type ArmorClass, type DmgType, type EntityId } from "./content";

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

  it("chỉ số hợp lệ", () => {
    for (const u of Object.values(UNITS)) {
      expect(u.hp).toBeGreaterThan(0);
      if (u.weapon) expect(u.weapon.cooldown).toBeGreaterThan(0);
      if (u.domain === "air") expect(u.fuel, `${u.id} là máy bay nên phải có bình dầu`).toBeDefined();
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

  it("quân MVP đúc được thì phải có nơi đúc, và nơi đó liệt kê nó", () => {
    for (const u of Object.values(UNITS)) {
      if (!u.mvp || !u.cost) continue;
      expect(u.builtAt, u.id).toBeDefined();
      expect(BUILDINGS[u.builtAt!].produces, u.id).toContain(u.id);
    }
  });
  it("Sân Đáp: số vị trí bãi đậu khớp RULES.air.pads, bãi nằm trọn trong sân và không chồng nhau", () => {
    expect(PAD_OFFSETS.length).toBe(RULES.air.pads);
    const [hx, hz] = BUILDINGS.airfield.half;
    const PAD = [2.8, 2.6]; // nửa kích thước một ô đáp (5,6 × 5,2 m, vừa Falcon sải cánh 5,1 m)
    for (const [x, z] of PAD_OFFSETS) {
      expect(Math.abs(x) + PAD[0]).toBeLessThanOrEqual(hx);
      expect(Math.abs(z) + PAD[1]).toBeLessThanOrEqual(hz);
    }
    for (let i = 0; i < PAD_OFFSETS.length; i++)
      for (let j = i + 1; j < PAD_OFFSETS.length; j++) {
        const [ax, az] = PAD_OFFSETS[i];
        const [bx, bz] = PAD_OFFSETS[j];
        expect(Math.abs(ax - bx) >= PAD[0] * 2 || Math.abs(az - bz) >= PAD[1] * 2, `bãi ${i} và ${j}`).toBe(true);
      }
  });
});
