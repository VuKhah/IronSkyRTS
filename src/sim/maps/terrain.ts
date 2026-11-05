/**
 * HIỆU ỨNG ĐỊA HÌNH — file chung cho mọi bản đồ (Docs/design/MAPS_PLAN.md mục 3.3).
 *
 * Bản đồ chỉ "tô" vùng nào là loại địa hình gì (`MapDef.regions`). Còn MỌI con số của từng loại
 * (tốc độ, tầm nhìn, che chắn, màu vẽ) chỉ nằm ở đây: muốn chỉnh hiệu ứng địa hình thì chỉ sửa file này.
 *
 * Dữ liệu thuần, không import Three.js hay DOM. ⚠️ Số tạm, chờ buổi cân bằng.
 * Trạng thái: B3a (05/11/2026) áp hệ số tốc độ theo kiểu xe (bánh / xích) và độ dốc (RULES.terrain).
 */
import type { Mobility } from "../content";

export type TerrainKind = "grass" | "road" | "sand" | "mud" | "snow" | "forest" | "shallow" | "deep" | "cliff";

/** Thứ tự cố định để lưu loại địa hình từng ô thành số (Grid.kind). Thêm loại mới thì thêm vào CUỐI. */
export const TERRAIN_KINDS: readonly TerrainKind[] = ["grass", "road", "sand", "mud", "snow", "forest", "shallow", "deep", "cliff"];

export interface TerrainSpec {
  name: string;
  /**
   * Hệ số tốc độ xe mặt đất theo kiểu di chuyển (0 = không đi được; phải bằng 0 cho mọi kiểu cùng lúc).
   * Xe bánh nhanh trên đường, sa lầy trong bùn; xe xích đều hơn trên mọi loại đất. Máy bay không chịu.
   */
  speed: Record<Mobility, number>;
  /** Hệ số tầm nhìn của quân đang đứng trong vùng này. */
  sight: number;
  /** Đứng trong vùng này được giảm sát thương nhận vào (tỉ lệ, 0 = không che chắn). */
  cover: number;
  /** Che tầm nhìn như vật cản cao chừng này (m) trên mặt đất (rừng). 0 = không che. */
  losHeight: number;
  /** Xe có `slowResist` (Xe Tư Lệnh) bỏ qua phần làm chậm của loại địa hình này (vẫn được hưởng phần nhanh). */
  resistible: boolean;
  /** Màu tô cho phần vẽ / minimap (0xRRGGBB). */
  color: number;
}

export const TERRAIN: Record<TerrainKind, TerrainSpec> = {
  grass: { name: "Cỏ / đất", speed: { wheel: 1, track: 1 }, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x6f8f4e },
  road: { name: "Đường", speed: { wheel: 1.3, track: 1.1 }, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x8a8070 },
  sand: { name: "Cát", speed: { wheel: 0.75, track: 0.9 }, sight: 1, cover: 0, losHeight: 0, resistible: true, color: 0xc9b27a },
  mud: { name: "Bùn", speed: { wheel: 0.5, track: 0.8 }, sight: 1, cover: 0, losHeight: 0, resistible: true, color: 0x5d4b36 },
  snow: { name: "Tuyết", speed: { wheel: 0.65, track: 0.85 }, sight: 0.85, cover: 0, losHeight: 0, resistible: true, color: 0xe6edf2 },
  forest: { name: "Rừng", speed: { wheel: 0.7, track: 0.85 }, sight: 0.8, cover: 0.2, losHeight: 4, resistible: true, color: 0x3f6b35 },
  shallow: { name: "Nước nông / bãi cạn", speed: { wheel: 0.6, track: 0.75 }, sight: 1, cover: 0, losHeight: 0, resistible: true, color: 0x8c8064 },
  deep: { name: "Nước sâu", speed: { wheel: 0, track: 0 }, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x2c628c },
  cliff: { name: "Vách núi", speed: { wheel: 0, track: 0 }, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x6b6258 }
};

/** Hệ số tốc độ của một loại địa hình cho một kiểu xe; xe kháng làm chậm bỏ qua phần < 1 của loại `resistible`. */
export function terrainSpeed(kind: TerrainKind, mob: Mobility, slowResist: boolean): number {
  const t = TERRAIN[kind];
  const k = t.speed[mob];
  return slowResist && t.resistible && k < 1 ? 1 : k;
}

/** Loại mặc định của mọi ô chưa được bản đồ tô. */
export const DEFAULT_TERRAIN: TerrainKind = "grass";
