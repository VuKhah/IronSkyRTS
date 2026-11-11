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

/** Mỏm đá: hình tròn, cao `h` mét (chỉ để vẽ và che tầm nhìn; các ô trong vòng tròn bị chặn). */
export interface Blob {
  x: number;
  z: number;
  r: number;
  h: number;
}

/**
 * ĐỊA HÌNH BẬC THANG (người dùng chốt 11/11/2026): mặt đất gồm các tầng phẳng, tầng 0 = bề mặt, 1 = cao một bậc,
 * 2 = cao hai bậc (mỗi bậc TIER_H mét, game-map.ts). Bản đồ vẽ theo ô lưới xây dựng 2 m: ô nào có TÂM nằm trong đa giác
 * thì mang tầng đó, nên viền tầng luôn là bậc thang theo ô. Vùng khai báo sau đè vùng trước.
 * Hai tầng cạnh nhau mặc định là VÁCH (không leo được); muốn lên xuống phải đặt khối dốc (`RampDef`).
 */
export interface TierDef {
  poly: readonly Vec2[];
  tier: 1 | 2;
}

/** Hướng đi LÊN của khối dốc: N = về phía Bắc (−z), E = Đông (+x), S = Nam (+z), W = Tây (−x). */
export type RampDir = "N" | "E" | "S" | "W";

/**
 * Khối dốc: một dạng duy nhất, dài cố định RAMP_LEN mét theo hướng leo, nối đúng hai tầng liền nhau. Ghép bề rộng tùy ý
 * (bội số 2 m). `x, z`: tâm khối dốc (tự bám lưới). Ô ngay sau chân dốc phải là tầng thấp, ô ngay sau đỉnh dốc là tầng
 * cao hơn một bậc (GameMap kiểm lúc dựng). Nên khoét dốc vào khối tầng cao để hai bên dốc là vách.
 */
export interface RampDef {
  x: number;
  z: number;
  dir: RampDir;
  /** Bề rộng (m), vuông góc với hướng leo. */
  width: number;
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
   * cho căn cứ, mỏ (đổi chủ Lam ↔ Đỏ), vùng tầng, khối dốc (đổi hướng), đá, vùng địa hình và lối qua sông. Thứ nằm đúng tâm không bị nhân đôi.
   * Sông: khai báo đủ dòng chảy; sông chảy qua tâm và tự đối xứng thì chỉ lối qua được nhân đôi, sông khác được nhân đôi cả dòng.
   * Bản đồ 1 đấu 1 nên bật cờ này: công bằng có sẵn (maps.test.ts vẫn kiểm).
   */
  symmetric?: boolean;
  /** Vị trí căn cứ theo phe: [0] = Lam (góc dưới trái), [1] = Đỏ (góc trên phải). Với `symmetric`: chỉ ghi căn cứ Lam. */
  bases: readonly Vec2[];
  mines: readonly MineDef[];
  /** Đài Liên Lạc (điểm chiếm): chiếm như mỏ; phe giữ được cộng điểm chỉ huy và nhìn xa quanh đài. Đặt chỗ cách đều hai nhà. */
  points?: readonly Vec2[];
  /** Vùng tầng cao (bậc thang theo ô). Bỏ trống = cả bản đồ ở tầng 0. */
  tiers?: readonly TierDef[];
  /** Khối dốc nối hai tầng. */
  ramps?: readonly RampDef[];
  /** Mỏm đá: chặn đường, che tầm nhìn. */
  rocks: readonly Blob[];
  rivers: readonly RiverDef[];
  /** Hiệu ứng địa hình theo vùng (luật của từng loại nằm ở terrain.ts). */
  regions?: readonly RegionDef[];
  /** Bộ màu / cảnh cho phần vẽ (không ảnh hưởng luật). */
  biome?: string;
}
