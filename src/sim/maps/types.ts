/**
 * MapDef: dữ liệu khai báo của một bản đồ (Docs/design/MAPS_PLAN.md mục 3.2).
 *
 * Mỗi bản đồ là một file dữ liệu trong `src/sim/maps/`. Mọi vị trí cố định (căn cứ, mỏ Sắt, giàn Dầu)
 * do người thiết kế đặt tay. Hệ tọa độ: tâm bản đồ ở (0, 0), x sang Đông, z sang Nam (Nam = cạnh dưới
 * màn hình khi camera nhìn hướng Bắc). Lam ở góc dưới trái (Tây Nam), Đỏ ở góc trên phải (Đông Bắc).
 */
import type { Res, Side } from "../content";
import type { TerrainKind } from "./terrain";

export type Vec2 = readonly [number, number];

/** Đồi hoặc mỏm đá: hình tròn, độ cao ở tâm (m). */
export interface Blob {
  x: number;
  z: number;
  r: number;
  h: number;
}

/**
 * Cao nguyên / đồi cao hình bất kỳ: đa giác cao `h` mét, sườn thoải rộng `edge` mét nằm vắt qua đường viền
 * (viền là giữa sườn). Chồng nhiều cao nguyên lên nhau để làm đồi nhiều bậc.
 */
export interface PlateauDef {
  poly: readonly Vec2[];
  h: number;
  edge: number;
}

/** Lối qua sông, đặt bằng một điểm nằm trên dòng sông. `half`: nửa bề rộng lối qua đo dọc theo sông (m). */
export interface CrossingDef {
  x: number;
  z: number;
  half: number;
  kind: "bridge" | "ford";
}

export interface RiverDef {
  /** Đường gấp khúc của dòng chảy (m). Nên kéo ra quá mép bản đồ để sông chảy hết bản đồ. */
  path: readonly Vec2[];
  /** Nửa bề rộng lòng sông có nước (m): xe không đi được, trừ ở lối qua. */
  half: number;
  /** Nửa bề rộng cả bờ dốc hai bên (m). */
  bank: number;
  /** Độ sâu lòng sông và độ sâu ở bãi cạn (m). */
  depth: number;
  fordDepth: number;
  crossings: readonly CrossingDef[];
}

export interface MineDef {
  res: Res;
  x: number;
  z: number;
  owner: Side | -1;
  /** Trữ lượng riêng (mặc định lấy theo RULES.mineAmount). */
  amount?: number;
}

/** Vùng tô loại địa hình: hình tròn hoặc đa giác. Vùng khai báo sau đè lên vùng trước. */
export interface RegionDef {
  kind: TerrainKind;
  circle?: { x: number; z: number; r: number };
  poly?: readonly Vec2[];
}

export interface MapDef {
  id: string;
  name: string;
  /** Mô tả đặc tính bản đồ (hiện ở menu chọn bản đồ). */
  blurb: string;
  /** Kích thước (m). Cho phép hình chữ nhật. */
  size: { w: number; h: number };
  /** Hình dáng vùng chơi (đa giác, theo chiều bất kỳ). Bỏ trống = cả hình chữ nhật. Ngoài vùng là vách núi. */
  bounds?: readonly Vec2[];
  /**
   * Bộ vẽ tự đối xứng: chỉ khai báo MỘT NỬA (phía Lam), GameMap tự thêm bản xoay 180° quanh tâm, (x, z) → (-x, -z),
   * cho căn cứ, mỏ (đổi chủ Lam ↔ Đỏ), đồi, cao nguyên, đá, vùng địa hình và lối qua sông. Thứ nằm đúng tâm không bị nhân đôi.
   * Sông: khai báo đủ dòng chảy; sông chảy qua tâm và tự đối xứng thì chỉ lối qua được nhân đôi, sông khác được nhân đôi cả dòng.
   * Bản đồ 1 đấu 1 nên bật cờ này: công bằng có sẵn (maps.test.ts vẫn kiểm).
   */
  symmetric?: boolean;
  /** Vị trí căn cứ theo phe: [0] = Lam (góc dưới trái), [1] = Đỏ (góc trên phải). Với `symmetric`: chỉ ghi căn cứ Lam. */
  bases: readonly Vec2[];
  mines: readonly MineDef[];
  /** Đài Liên Lạc (điểm chiếm): chiếm như mỏ; phe giữ được cộng điểm chỉ huy và nhìn xa quanh đài. Đặt chỗ cách đều hai nhà. */
  points?: readonly Vec2[];
  hills: readonly Blob[];
  /** Cao nguyên / đồi cao nhiều bậc (đa giác). */
  plateaus?: readonly PlateauDef[];
  /** Mỏm đá: chặn đường, che tầm nhìn. */
  rocks: readonly Blob[];
  rivers: readonly RiverDef[];
  /** Hiệu ứng địa hình theo vùng (luật của từng loại nằm ở terrain.ts). */
  regions?: readonly RegionDef[];
  /** Bộ màu / cảnh cho phần vẽ (không ảnh hưởng luật). */
  biome?: string;
}
