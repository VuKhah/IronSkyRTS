/**
 * Mô hình các binh chủng (BẢN NHẸ): khối hình đơn giản nhưng có khớp động thật
 * (tháp pháo xoay, nòng giật, bánh lăn, cánh nghiêng, càng thu, cửa khoang bom).
 * Sau này thay bằng bản chi tiết: chỉ cần giữ nguyên giao diện Rig.
 *
 * Quy ước: mặt trước là +Z, mặt đất là y = 0, 1 đơn vị ≈ 1 mét (đã thu nhỏ để dễ nhìn).
 */

import { UNIT_SCALE, UNITS, type Faction, type UnitId } from "../../../sim/content";
import { group, palette, type Palette, type Rig } from "../kit";
import { buildCommander } from "./commander";
import { buildLynx } from "./lynx";
import { buildArtillery } from "./artillery";
import { buildTitan } from "./titan";
import { buildSkyguard } from "./skyguard";
import { buildRocket } from "./rocket";
import { buildFalcon } from "./falcon";
import { buildValkyrie } from "./valkyrie";
import { buildHauler } from "./hauler";
import { buildScoutDrone } from "./scout-drone";
import { buildShieldDrone } from "./shield-drone";
import { buildRepairDrone } from "./repair-drone";
import { buildSniper } from "./sniper";

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
  hauler: buildHauler,
  scout: buildScoutDrone,
  shield: buildShieldDrone,
  repair: buildRepairDrone,
  sniper: buildSniper
};

export function buildUnit(id: UnitId, faction: Faction): Rig {
  const rig = BUILDERS[id](palette(faction));
  // thu / phóng đồng bộ theo UNIT_SCALE (rules.ts). Quân mặt đất: bọc cả mô hình trong một khung tỉ lệ, gốc vẫn để phần
  // chiến trường đặt vị trí / thu nhỏ khi đậu. Drone và máy bay tự thu THÂN BAY trong droneRig / aircraftRig, vì độ cao bay
  // và vật bám đất (vùng khiên) là số của sim, không được thu theo.
  if (UNIT_SCALE !== 1 && UNITS[id].domain === "ground") {
    const inner = group(...[...rig.root.children]);
    inner.scale.setScalar(UNIT_SCALE);
    rig.root.add(inner);
  }
  rig.radius *= UNIT_SCALE;
  return rig;
}
