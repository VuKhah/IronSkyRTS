import { describe, expect, it } from "vitest";
import { BUILDINGS, UNITS, getSpec, type EntityId } from "./content";

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
      expect(u.armor).toBeGreaterThanOrEqual(0);
      expect(u.armor).toBeLessThan(1);
      expect(u.weapon.cooldown).toBeGreaterThan(0);
      if (u.domain === "air") expect(u.fuel, `${u.id} là máy bay nên phải có bình dầu`).toBeDefined();
    }
  });
});
