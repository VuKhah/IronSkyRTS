import { UNIT_SCALE } from "../rules";
import type { UnitId, UnitSpec } from "../types";
import { AIR_UNITS } from "./air";
import { DRONE_UNITS } from "./drones";
import { GROUND_UNITS } from "./ground";
import { INFANTRY_UNITS } from "./infantry";

/**
 * Bảng mọi binh chủng. Thứ tự khóa giữ đúng như bảng cũ (vòng lặp theo UNITS, danh sách đúc và mã băm trận phụ thuộc thứ tự này).
 * Thêm quân mới: viết vào file nhóm của nó rồi thêm một dòng ở đây.
 */
export const UNITS: Record<UnitId, UnitSpec> = {
  commander: sized(GROUND_UNITS.commander),
  hauler: sized(GROUND_UNITS.hauler),
  lynx: sized(GROUND_UNITS.lynx),
  titan: sized(GROUND_UNITS.titan),
  skyguard: sized(GROUND_UNITS.skyguard),
  rocket: sized(GROUND_UNITS.rocket),
  scout: sized(DRONE_UNITS.scout),
  shield: sized(DRONE_UNITS.shield),
  repair: sized(DRONE_UNITS.repair),
  falcon: sized(AIR_UNITS.falcon),
  artillery: sized(GROUND_UNITS.artillery),
  valkyrie: sized(AIR_UNITS.valkyrie),
  sniper: sized(INFANTRY_UNITS.sniper)
};

/** Nhân kích thước thân và đế với `UNIT_SCALE` (rules.ts). Thu một chỗ ở đây để mọi nơi đọc UNITS đều cùng một cỡ. */
function sized(s: UnitSpec): UnitSpec {
  if (UNIT_SCALE === 1) return s;
  const k = UNIT_SCALE;
  return {
    ...s,
    radius: s.radius * k,
    ...(s.halfLen !== undefined && { halfLen: s.halfLen * k }),
    ...(s.bodyR !== undefined && { bodyR: s.bodyR * k }),
    ...(s.spaceR !== undefined && { spaceR: s.spaceR * k })
  };
}
