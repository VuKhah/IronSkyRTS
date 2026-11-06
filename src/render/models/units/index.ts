/**
 * Mô hình các binh chủng (BẢN NHẸ): khối hình đơn giản nhưng có khớp động thật
 * (tháp pháo xoay, nòng giật, bánh lăn, cánh nghiêng, càng thu, cửa khoang bom).
 * Sau này thay bằng bản chi tiết: chỉ cần giữ nguyên giao diện Rig.
 *
 * Quy ước: mặt trước là +Z, mặt đất là y = 0, 1 đơn vị ≈ 1 mét (đã thu nhỏ để dễ nhìn).
 */

import type { Faction, UnitId } from "../../../sim/content";
import { palette, type Palette, type Rig } from "../kit";
import { buildCommander } from "./commander";
import { buildLynx } from "./lynx";
import { buildArtillery } from "./artillery";
import { buildTitan } from "./titan";
import { buildSkyguard } from "./skyguard";
import { buildRocket } from "./rocket";
import { buildFalcon } from "./falcon";
import { buildValkyrie } from "./valkyrie";
import { buildHauler } from "./hauler";

/** Thêm binh chủng mới: tạo file `<mã>.ts` có hàm build…, rồi thêm một dòng vào bảng này. */
const BUILDERS: Record<UnitId, (p: Palette) => Rig> = {
  commander: buildCommander,
  lynx: buildLynx,
  titan: buildTitan,
  skyguard: buildSkyguard,
  rocket: buildRocket,
  artillery: buildArtillery,
  falcon: buildFalcon,
  valkyrie: buildValkyrie,
  hauler: buildHauler
};

export function buildUnit(id: UnitId, faction: Faction): Rig {
  return BUILDERS[id](palette(faction));
}
