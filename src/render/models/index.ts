import { getSpec, isUnitId, type BuildingId, type EntityId, type Faction } from "../../sim/content";
import { partIfUnnamed } from "./kit";
import { buildBuilding } from "./buildings";
import { buildUnit } from "./units";
import type { Rig } from "./kit";

export type { Rig, RigAction } from "./kit";
export { disposeRig } from "./kit";
export { buildNode, type NodeRig } from "./nodes";

/**
 * Một điểm vào duy nhất: chiến trường và Xưởng Mô Hình đều gọi hàm này.
 * showcase = true cho Xưởng Mô Hình (có đồ trang trí), false cho chiến trường.
 */
export function buildModel(id: EntityId, faction: Faction, showcase = true): Rig {
  const rig = isUnitId(id) ? buildUnit(id, faction) : buildBuilding(id as BuildingId, faction, showcase);
  // bộ phận chưa đặt tên riêng thì Xưởng Mô Hình hiện tên của cả mô hình
  partIfUnnamed(getSpec(id).name, rig.root);
  return rig;
}
