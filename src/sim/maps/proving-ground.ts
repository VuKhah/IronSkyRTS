/**
 * "Bãi Thử Hình Dáng": bản đồ KIỂM THỬ, không hiện ở menu (mở bằng `?map=proving-ground`).
 *
 * Cố tình khác "Thung Lũng Sông Sắt" ở mọi chỗ có thể làm lộ giả định viết cứng:
 * hình chữ nhật 224 × 144 m (không vuông), vùng chơi hình lục giác (`bounds`), sông gấp khúc chảy theo hướng Bắc Nam,
 * khai báo một nửa (`symmetric`). Kiểm thử chạy AI đấu AI trên bản đồ này: nếu đổi kích thước / hình dáng mà game
 * không chạy đúng thì `npm test` báo (tiêu chí của bước B1, Docs/design/MAPS_PLAN.md).
 */
import type { MapDef } from "./types";

export const PROVING_GROUND: MapDef = {
  id: "proving-ground",
  name: "Bãi Thử Hình Dáng",
  blurb: "Bản đồ kiểm thử: chữ nhật, viền lục giác, sông gấp khúc.",
  size: { w: 224, h: 144 },
  bounds: [
    [-112, 0],
    [-72, -72],
    [72, -72],
    [112, 0],
    [72, 72],
    [-72, 72]
  ],
  symmetric: true,
  bases: [[-60, 46]],
  mines: [
    { res: "iron", x: -82, z: 18, owner: 0 },
    { res: "oil", x: -36, z: 58, owner: 0, amount: 1200 },
    { res: "iron", x: -40, z: -30, owner: -1 },
    { res: "oil", x: 0, z: 0, owner: -1 }
  ],
  hills: [
    { x: -84, z: -18, r: 12, h: 3.5 },
    { x: -26, z: 48, r: 10, h: 3 }
  ],
  rocks: [{ x: -50, z: -6, r: 5, h: 4 }],
  rivers: [
    {
      // gấp khúc qua tâm, tự đối xứng: (x, z) → (-x, -z) rồi đảo chiều thì trùng chính nó
      path: [
        [-30, -100],
        [-10, -20],
        [10, 20],
        [30, 100]
      ],
      half: 6.5,
      bank: 10,
      depth: 2.4,
      fordDepth: 0.3,
      crossings: [
        { x: 20, z: 55, half: 4.5, kind: "bridge" },
        { x: 0, z: 0, half: 10, kind: "ford" }
      ]
    }
  ],
  regions: [{ kind: "mud", circle: { x: -20, z: -50, r: 9 } }],
  biome: "temperate"
};
