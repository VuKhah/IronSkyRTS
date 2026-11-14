/** Mô hình phải nằm gọn trong đế thân `bodyR` ở mọi góc xoay tháp, kể cả nòng (Docs/design/UNIT_BASES_PLAN.md). */
import { describe, expect, it } from "vitest";
import { UNITS, type UnitId } from "../../sim/content";
import { reachXZ } from "../../models-page/stage";
import { buildModel } from ".";

const withBase = (Object.keys(UNITS) as UnitId[]).filter((id) => UNITS[id].bodyR !== undefined);

describe("mô hình lọt đế", () => {
  it("có ít nhất một quân đã khai báo bodyR", () => expect(withBase.length).toBeGreaterThan(0));
  for (const id of withBase)
    it(id, () => {
      const reach = reachXZ(buildModel(id, "lam", true));
      expect(reach.r, `${reach.part} thò ra ở góc tháp ${Math.round((reach.yaw * 180) / Math.PI)}°`).toBeLessThanOrEqual(UNITS[id].bodyR!);
    });
});
