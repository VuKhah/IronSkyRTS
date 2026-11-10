/**
 * Mô hình các công trình (BẢN NHẸ). Mỗi công trình có hoạt ảnh "Vận hành" riêng
 * và các tháp có vũ khí thì có thêm "Ngắm" / "Khai hỏa".
 */
import { type BuildingId, type Faction } from "../../../sim/content";
import { palette, type Palette, type Rig } from "../kit";
import { buildHQ } from "./hq";
import { buildFactory } from "./factory";
import { buildSpecialFactory } from "./special-factory";
import { buildAircraftFactory } from "./aircraft-factory";
import { buildTurret } from "./turret";
import { buildOutpost } from "./outpost";
import { buildPowerPlant } from "./power-plant";
import { buildPowerPylon } from "./power-pylon";
import { buildOilExtractor } from "./oil-extractor";
import { buildAirfield } from "./airfield";
import { buildAmmoDepot } from "./ammo-depot";
import { buildCIWS } from "./ciws";
import { buildSAM } from "./sam";
import { buildEMP } from "./emp";
import { buildBattery } from "./battery";
import { buildRadar } from "./radar";
import { buildWall } from "./wall";

const BUILDERS: Record<BuildingId, (p: Palette, f: Faction, showcase: boolean) => Rig> = {
  radar: (p) => buildRadar(p),
  battery: (p) => buildBattery(p),
  hq: (p) => buildHQ(p),
  factory: (p, f) => buildFactory(p, f),
  "special-factory": (p, f) => buildSpecialFactory(p, f),
  "aircraft-factory": (p) => buildAircraftFactory(p),
  turret: (p) => buildTurret(p),
  outpost: (p) => buildOutpost(p),
  "power-plant": (p) => buildPowerPlant(p),
  "power-pylon": (p) => buildPowerPylon(p),
  "oil-extractor": (p) => buildOilExtractor(p),
  airfield: buildAirfield,
  "ammo-depot": (p) => buildAmmoDepot(p),
  "aa-ciws": (p) => buildCIWS(p),
  "aa-sam": (p) => buildSAM(p),
  "aa-emp": (p) => buildEMP(p),
  wall: (p) => buildWall(p)
};

/** showcase = true: bản trưng bày trên Xưởng Mô Hình (có thêm đồ trang trí, ví dụ máy bay đậu sẵn). */
export function buildBuilding(id: BuildingId, faction: Faction, showcase = true): Rig {
  return BUILDERS[id](palette(faction), faction, showcase);
}
