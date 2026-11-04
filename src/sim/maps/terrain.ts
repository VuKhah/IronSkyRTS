/**
 * HIỆU ỨNG ĐỊA HÌNH — file chung cho mọi bản đồ (Docs/MAPS_PLAN.md mục 3.3).
 *
 * Bản đồ chỉ "tô" vùng nào là loại địa hình gì (`MapDef.regions`). Còn MỌI con số của từng loại
 * (tốc độ, tầm nhìn, che chắn, màu vẽ) chỉ nằm ở đây: muốn chỉnh hiệu ứng địa hình thì chỉ sửa file này.
 *
 * Dữ liệu thuần, không import Three.js hay DOM. ⚠️ Số tạm, chờ buổi cân bằng.
 * Trạng thái (05/11/2026): bảng đã có, lõi sim CHƯA áp các hiệu ứng (bước B3 của kế hoạch bản đồ).
 */

export type TerrainKind = "grass" | "road" | "sand" | "mud" | "snow" | "forest" | "shallow" | "deep" | "cliff";

export interface TerrainSpec {
  name: string;
  /** Hệ số tốc độ xe mặt đất (0 = không đi được). Máy bay không chịu. */
  speed: number;
  /** Hệ số tầm nhìn của quân đang đứng trong vùng này. */
  sight: number;
  /** Đứng trong vùng này được giảm sát thương nhận vào (tỉ lệ, 0 = không che chắn). */
  cover: number;
  /** Che tầm nhìn như vật cản cao chừng này (m) trên mặt đất (rừng). 0 = không che. */
  losHeight: number;
  /** Quân có `slowResist` (Xe Tư Lệnh) bỏ qua phần làm chậm của loại địa hình này. */
  resistible: boolean;
  /** Màu tô cho phần vẽ / minimap (0xRRGGBB). */
  color: number;
}

export const TERRAIN: Record<TerrainKind, TerrainSpec> = {
  grass: { name: "Cỏ / đất", speed: 1, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x6f8f4e },
  road: { name: "Đường", speed: 1.25, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x8a8070 },
  sand: { name: "Cát", speed: 0.85, sight: 1, cover: 0, losHeight: 0, resistible: true, color: 0xc9b27a },
  mud: { name: "Bùn", speed: 0.6, sight: 1, cover: 0, losHeight: 0, resistible: true, color: 0x5d4b36 },
  snow: { name: "Tuyết", speed: 0.75, sight: 0.85, cover: 0, losHeight: 0, resistible: true, color: 0xe6edf2 },
  forest: { name: "Rừng", speed: 0.8, sight: 0.8, cover: 0.2, losHeight: 4, resistible: true, color: 0x3f6b35 },
  shallow: { name: "Nước nông / bãi cạn", speed: 0.7, sight: 1, cover: 0, losHeight: 0, resistible: true, color: 0x8c8064 },
  deep: { name: "Nước sâu", speed: 0, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x2c628c },
  cliff: { name: "Vách núi", speed: 0, sight: 1, cover: 0, losHeight: 0, resistible: false, color: 0x6b6258 }
};

/** Loại mặc định của mọi ô chưa được bản đồ tô. */
export const DEFAULT_TERRAIN: TerrainKind = "grass";
