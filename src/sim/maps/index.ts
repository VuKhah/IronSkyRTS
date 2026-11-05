/**
 * Danh sách bản đồ. Thêm bản đồ mới: tạo một file dữ liệu `MapDef` trong thư mục này rồi thêm vào MAP_DEFS.
 * Hiệu ứng của từng loại địa hình nằm ở `terrain.ts` (dùng chung cho mọi bản đồ).
 */
import { GameMap } from "./game-map";
import { IRON_VALLEY } from "./iron-valley";
import { PROVING_GROUND } from "./proving-ground";
import type { MapDef } from "./types";

/** Bản đồ chơi được (hiện ở menu chọn bản đồ). */
export const MAP_DEFS: readonly MapDef[] = [IRON_VALLEY];
/** Bản đồ kiểm thử: không hiện ở menu, mở bằng `?map=<mã>`, vẫn được maps.test.ts kiểm như mọi bản đồ. */
export const DEV_MAP_DEFS: readonly MapDef[] = [PROVING_GROUND];
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

export { CELL, GameMap } from "./game-map";
export { DEFAULT_TERRAIN, TERRAIN, TERRAIN_KINDS, terrainSpeed, type TerrainKind, type TerrainSpec } from "./terrain";
export type { Blob, CrossingDef, MapDef, MineDef, RegionDef, RiverDef, Vec2 } from "./types";
