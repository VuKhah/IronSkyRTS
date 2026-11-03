import { UNITS, type EntityId, type Faction, type UnitId, type BuildingId } from "../../sim/content";
import { buildBuilding } from "./buildings";
import { buildUnit } from "./units";
import type { Rig } from "./kit";

export type { Rig, RigAction } from "./kit";
export { disposeRig } from "./kit";

/** Một điểm vào duy nhất: chiến trường và Xưởng Mô Hình đều gọi hàm này. */
export function buildModel(id: EntityId, faction: Faction): Rig {
  return id in UNITS ? buildUnit(id as UnitId, faction) : buildBuilding(id as BuildingId, faction);
}
