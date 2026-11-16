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
  commander: GROUND_UNITS.commander,
  hauler: GROUND_UNITS.hauler,
  lynx: GROUND_UNITS.lynx,
  titan: GROUND_UNITS.titan,
  skyguard: GROUND_UNITS.skyguard,
  rocket: GROUND_UNITS.rocket,
  scout: DRONE_UNITS.scout,
  shield: DRONE_UNITS.shield,
  repair: DRONE_UNITS.repair,
  falcon: AIR_UNITS.falcon,
  artillery: GROUND_UNITS.artillery,
  valkyrie: AIR_UNITS.valkyrie,
  sniper: INFANTRY_UNITS.sniper
};
