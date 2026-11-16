import { BUILDINGS } from "./buildings";
import type { BuildingId, UnitId } from "./types";
import { UNITS } from "./units";
/** Hình học đặt nhà: ô đáp Sân Đáp, hướng cửa, xoay công trình. Sim và phần vẽ dùng chung. */

/**
 * Ô đáp chữ V của Sân Đáp bản 3 (16/11/2026, dùng chung cho sim và mô hình `buildAirfield`), chưa xoay: mũi ở +z, hai đầu
 * cánh ở đuôi, khấc giữa đuôi. Mỗi ô nghiêng `yaw` ra phía ngoài sân; sim không được gọi sin / cos nên ghi sẵn `sin`, `cos`.
 */
export const PAD_SHAPE = { halfSpan: 2.5, halfLen: 2.7, notch: 1.5, yaw: Math.PI / 6, sin: 0.5, cos: 0.8660254037844386 } as const;

/**
 * 5 bãi đậu `[x, z, bên]` so với tâm Sân Đáp: bố cục xương cá 3 hàng × 2 cột hai bên hành lang giữa, soi gương qua x = 0.
 * `bên` = ±1: ô nghiêng ra phía đó, máy bay đậu quay mũi theo (bên × sin, cos) (`padHeading`). Ô thứ sáu (hàng đuôi, bên trái)
 * là ô điều khiển (`CONTROL_CELL`). Số phần tử = `RULES.air.pads`.
 */
export const PAD_OFFSETS: readonly (readonly [number, number, 1 | -1])[] = [
  [4.0, 6.3, 1],
  [-4.0, 6.3, -1],
  [4.0, 0.1, 1],
  [-4.0, 0.1, -1],
  [4.0, -6.1, 1]
];

/** Hướng mũi máy bay đậu ở ô `i`, trong khung chưa xoay của Sân Đáp (mũi sân ở +z). */
export function padHeading(i: number): [number, number] {
  return [PAD_OFFSETS[i][2] * PAD_SHAPE.sin, PAD_SHAPE.cos];
}

/** Ô điều khiển của Sân Đáp (tháp + nhà điều hành), hàng đuôi: tháp không bao giờ nằm trên đường bay. */
export const CONTROL_CELL: readonly [number, number] = [-3.2, -6.1];

/**
 * Máy bay đậu trên Sân Đáp thu nhỏ cho thân (vòng `bodyR`) lọt trong chữ V (chỉ phần vẽ; người dùng 15/11/2026: hạ cánh thu
 * nhỏ, cất cánh phóng to về nguyên mẫu). Mỗi loại thu riêng: k = 90% nửa sải chữ V / bodyR, không phóng to quá nguyên mẫu.
 */
export function parkScale(kind: UnitId): number {
  const r = UNITS[kind].bodyR;
  return r ? Math.min(1, (PAD_SHAPE.halfSpan * 0.9) / r) : 1;
}
/** Hạ cánh / cất cánh: dưới độ cao này (m) máy bay đổi cỡ dần giữa cỡ đậu (chạm đất) và nguyên mẫu. */
export const PARK_GROW_ALT = 4;

/**
 * Tổng Hành Dinh và nhà xưởng quay cửa (phía +z của mô hình) về phía giữa bản đồ theo trục z: xưởng nằm ở nửa +z thì xoay 180°.
 * Quay đúng nửa vòng nên nền móng không đổi. Sim (máy bay cất cánh ra cửa) và phần vẽ cùng dùng hàm này.
 */
const DOOR_FACING: ReadonlySet<BuildingId> = new Set<BuildingId>(["hq", "factory", "special-factory", "aircraft-factory"]);
export function doorSign(kind: BuildingId, z: number): 1 | -1 {
  return DOOR_FACING.has(kind) && z > 0 ? -1 : 1;
}

/**
 * Nấc xoay công trình (người dùng 10/11/2026: "thêm cơ chế xoay tòa nhà"): 0..3, mỗi nấc 90°. Nấc là hướng CỬA quay về:
 * 0 = +z, 1 = +x, 2 = −z, 3 = −x. Mô hình quay `rotation.y = rot · 90°` (Three.js quay +z sang +x khi góc dương).
 */
export function doorDir(rot: number): [number, number] {
  switch (rot & 3) {
    case 1:
      return [1, 0];
    case 2:
      return [0, -1];
    case 3:
      return [-1, 0];
    default:
      return [0, 1];
  }
}
/** Nấc xoay mặc định: cửa quay về phía giữa bản đồ theo trục z (như trước khi có xoay). */
export function defaultRot(kind: BuildingId, z: number): number {
  return doorSign(kind, z) < 0 ? 2 : 0;
}
/** Nửa kích thước nền móng sau khi xoay (nấc lẻ thì đổi chiều rộng với chiều sâu). */
export function rotHalf(kind: BuildingId, rot: number): [number, number] {
  const [a, b] = BUILDINGS[kind].half;
  return rot & 1 ? [b, a] : [a, b];
}
/** Độ lệch (ox, oz) trong khung mô hình đổi sang khung thế giới theo nấc xoay (khớp `rotation.y` của Three.js). */
export function rotOffset(ox: number, oz: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1:
      return [oz, -ox];
    case 2:
      return [-ox, -oz];
    case 3:
      return [-oz, ox];
    default:
      return [ox, oz];
  }
}
/** Chuẩn hóa nấc xoay nhận từ lệnh (có thể là số bất kỳ) về 0..3; không có thì undefined. */
export function normRot(rot: number | undefined): number | undefined {
  return rot === undefined || !Number.isFinite(rot) ? undefined : ((Math.round(rot) % 4) + 4) % 4;
}
