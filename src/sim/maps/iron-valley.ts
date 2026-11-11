/**
 * "Thung Lũng Sông Sắt": 160 × 160 m, đối xứng xoay 180° quanh tâm (x, z) → (-x, -z).
 * Sông chảy chéo từ góc trên trái xuống góc dưới phải (đường x = z), chia đất Lam (góc dưới trái)
 * và đất Đỏ (góc trên phải). 3 lối qua: cầu cánh Nam, bãi cạn rộng ở giữa, cầu cánh Bắc.
 *
 * Khai báo MỘT NỬA (`symmetric`): mỗi mục dưới đây được GameMap tự thêm bản xoay 180° (mỏ đổi chủ Lam ↔ Đỏ).
 */
import { blobPoly, rampOnEdge } from "./shapes";
import type { MapDef, RampDir, Vec2 } from "./types";

const S = 0.7071067811865476; // 1/√2: điểm trên dòng sông cách tâm v mét nằm ở (v·S, v·S)

/** Ba gò cao (trước 11/11/2026 là đồi tròn thoải): vùng tầng 1 và điểm gần mép để đặt dốc, hướng leo. */
const HILLS: { poly: Vec2[]; ramp: Vec2; dir: RampDir }[] = [
  { poly: blobPoly(-28, 66, 13, 13, 11, 0.12, 16), ramp: [-41, 66], dir: "E" },
  { poly: blobPoly(-70, 0, 12, 12, 12, 0.12, 16), ramp: [-70, 12], dir: "N" },
  { poly: blobPoly(40, 62, 12, 12, 13, 0.12, 16), ramp: [28, 62], dir: "E" }
];

export const IRON_VALLEY: MapDef = {
  id: "iron-valley",
  name: "Thung Lũng Sông Sắt",
  blurb: "Sông chảy chéo chia đôi chiến trường, 3 lối qua: 2 cây cầu ở hai cánh và bãi cạn rộng ở giữa. Giành được lối qua là giành thế trận.",
  size: { w: 160, h: 160 },
  symmetric: true,
  bases: [[-58, 58]],
  mines: [
    // Sắt: mỏ nhà + mỏ tiền tuyến
    { res: "iron", x: -66, z: 30, owner: 0 },
    { res: "iron", x: -2, z: 34, owner: -1 },
    // giàn Dầu giữa sông (đúng tâm nên chỉ có một) + giàn đầu cầu cánh
    { res: "oil", x: 0, z: 0, owner: -1 },
    { res: "oil", x: -44.5, z: -20.5, owner: -1 },
    // giàn Dầu nhà: đủ khởi động điện và máy bay, cạn sớm nên vẫn phải ra tranh giàn giữa bản đồ
    { res: "oil", x: -42, z: 68, owner: 0, amount: 1200 }
  ],
  // Đài Liên Lạc trên cây cầu cánh Nam (máy tự thêm đài trên cầu cánh Bắc): hai cầu nằm đúng trung trực
  // giữa hai căn cứ nên cách đều hai nhà; giữ cầu là giữ đài
  points: [[-56 * S, -56 * S]],
  // gò cao tầng 1 (bậc thang, mỗi gò một dốc): đứng trên gò được cộng tầm nhìn / tầm bắn, quân dưới thấp không thấy lên
  tiers: HILLS.map((h) => ({ tier: 1 as const, poly: h.poly })),
  ramps: HILLS.map((h) => rampOnEdge(h.poly, h.ramp[0], h.ramp[1], h.dir, 8)),
  // mỏm đá: chặn đường xe, tạo lối đi hẹp gần bờ sông
  rocks: [
    { x: -29.7, z: -9.9, r: 6, h: 4.5 },
    { x: 9.9, z: 29.7, r: 5.5, h: 4 }
  ],
  rivers: [
    {
      // sông chảy qua tâm, tự đối xứng: khai báo đủ dòng, chỉ lối qua được nhân đôi
      path: [
        [-100, -100],
        [100, 100]
      ],
      half: 7.5,
      bank: 11.5,
      depth: 2.6,
      fordDepth: 0.3,
      crossings: [
        { x: -56 * S, z: -56 * S, half: 4.5, kind: "bridge" },
        { x: 0, z: 0, half: 11, kind: "ford" }
      ]
    }
  ],
  biome: "temperate"
};
