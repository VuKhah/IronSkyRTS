/**
 * Danh sách bản đồ. Thêm bản đồ mới: tạo một file dữ liệu `MapDef` trong thư mục này rồi thêm vào MAP_DEFS.
 * Hiệu ứng của từng loại địa hình nằm ở `terrain.ts` (dùng chung cho mọi bản đồ).
 */
import { BIG_TEST } from "./big-test";
import { GameMap } from "./game-map";
import { IRON_VALLEY } from "./iron-valley";
import { PROVING_GROUND } from "./proving-ground";
import { TWO_CROSSINGS } from "./two-crossings";
import type { MapDef } from "./types";

/** Bản đồ chơi được (hiện ở menu chọn bản đồ). */
export const MAP_DEFS: readonly MapDef[] = [IRON_VALLEY, TWO_CROSSINGS];
/** Bản đồ kiểm thử: không hiện ở menu, mở bằng `?map=<mã>`, vẫn được maps.test.ts kiểm như mọi bản đồ. */
export const DEV_MAP_DEFS: readonly MapDef[] = [PROVING_GROUND, BIG_TEST];
export const DEFAULT_MAP_ID = IRON_VALLEY.id;

const CACHE = new Map<string, GameMap>();

/** Bản đồ theo mã (dựng một lần rồi dùng lại; GameMap không đổi trong trận). */
export function getMap(id: string = DEFAULT_MAP_ID): GameMap {
  let m = CACHE.get(id);
  if (!m) {
    const def = MAP_DEFS.find((d) => d.id === id) ?? DEV_MAP_DEFS.find((d) => d.id === id);
    if (!def) throw new Error(`Không có bản đồ "${id}"`);
    m = new GameMap(def);
    CACHE.set(id, m);
  }
  return m;
}

export { CELL, GameMap, MAX_TIER, RAMP_LEN, TIER_H, rampY, type Ramp } from "./game-map";
export { DEFAULT_TERRAIN, TERRAIN, TERRAIN_KINDS, terrainSpeed, type TerrainKind, type TerrainSpec } from "./terrain";
export type { Blob, CrossingDef, MapDef, MineDef, RampDef, RampDir, RegionDef, RiverDef, TierDef, Vec2 } from "./types";
