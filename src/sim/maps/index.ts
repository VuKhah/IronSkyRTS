/**
 * Danh sách bản đồ. Thêm bản đồ mới: tạo một file dữ liệu `MapDef` trong thư mục này rồi thêm vào MAP_DEFS.
 * Hiệu ứng của từng loại địa hình nằm ở `terrain.ts` (dùng chung cho mọi bản đồ).
 */
import { BIG_TEST } from "./big-test";
import { GameMap } from "./game-map";
import { IRON_VALLEY } from "./iron-valley";
import { PROVING_GROUND } from "./proving-ground";
import { STANDARD } from "./standard";
import { TWO_CROSSINGS } from "./two-crossings";
import type { MapDef } from "./types";

/** Bản đồ chơi được (hiện ở menu chọn bản đồ). Từ 11/11/2026 chỉ còn Bản Đồ Chuẩn; bản đầu danh sách là mặc định của menu. */
export const MAP_DEFS: readonly MapDef[] = [STANDARD];
/**
 * Bản đồ kiểm thử: không hiện ở menu, mở bằng `?map=<mã>`, vẫn được maps.test.ts kiểm như mọi bản đồ.
 * Iron Valley và Two Crossings rời menu 11/11/2026 (người dùng: "các bản đồ trước bỏ tất") nhưng còn ở đây vì hàng trăm
 * kiểm thử dựng trận trên tọa độ của chúng; xóa hẳn khi kiểm thử đã chuyển sang bản đồ chuẩn.
 */
export const DEV_MAP_DEFS: readonly MapDef[] = [IRON_VALLEY, TWO_CROSSINGS, PROVING_GROUND, BIG_TEST];
/** Bản đồ mặc định của SIM khi không truyền `map` (kiểm thử, công cụ Node). Menu dùng `MENU_MAP_ID`. */
export const DEFAULT_MAP_ID = IRON_VALLEY.id;
/** Bản đồ mặc định của menu chọn bản đồ. */
export const MENU_MAP_ID = MAP_DEFS[0].id;

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
