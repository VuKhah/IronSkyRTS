/**
 * "The Two Crossings" (tên tạm của người dùng): bản đồ chính thức đầu tiên, dựng từ phác thảo 4
 * (`Docs/maps/the-two-crossings/`). 240 × 240 m, đối xứng xoay 180°, khai báo nửa phía Lam.
 *
 * Lối chơi: sông lớn uốn lượn chảy chéo qua tâm, 3 cây cầu (cầu lớn ở giữa). Căn cứ nằm trên **cao nguyên tầng 2** ở góc;
 * **Sắt trên đồi** (gần nhà, an toàn), **Dầu ở đồng bằng** giữa đồi và sông (lộ, phải ra giữ). Mép đồi nhìn xuống
 * đồng bằng là chỗ đặt công sự: đứng cao được cộng tầm nhìn, tầm bắn; quân dưới thấp không nhìn thấy lên. Lên xuống bằng 5 dốc. Hai góc bị nhánh sông tách riêng là rừng kín.
 */
import { blobPoly, rampOnEdge, smoothPath, symmetricRiver, wobblePoly } from "./shapes";
import type { MapDef, RampDir, RegionDef } from "./types";

const forest = (cx: number, cz: number, rx: number, rz: number, seed: number): RegionDef => ({ kind: "forest", poly: blobPoly(cx, cz, rx, rz, seed, 0.3, 14) });

// Cao nguyên tầng 1 (vòng ngoài) và tầng 2 (khu căn cứ). Trước 11/11/2026 là đồi thoải 3 bậc; giờ là bậc thang theo ô.
export const PLATEAU_1 = wobblePoly([
  [-130, -48],
  [-93.6, -50.4],
  [-74.4, -40.8],
  [-60, -16.8],
  [-55.2, 14.4],
  [-60, 48],
  [-62.4, 84],
  [-66, 130],
  [-130, 130]
], 3, 21);
export const PLATEAU_2 = wobblePoly([
  [-115.2, -31.2],
  [-91.2, -33.6],
  [-75.6, -19.2],
  [-68.4, 9.6],
  [-72, 48],
  [-75.6, 91.2],
  [-81.6, 115.2],
  [-115.2, 115.2]
], 2.5, 22);

/**
 * Khối dốc (điểm gần mép + hướng leo; `rampOnEdge` tự dời tâm lên đúng mép). Tầng 0 → 1: ba dốc ra đồng bằng (Bắc, giữa,
 * Nam). Tầng 1 → 2: hai dốc vào khu căn cứ (cửa Đông nhìn ra mỏ Dầu, cửa Bắc nhìn ra nhánh sông). big-test dùng lại.
 */
export const RAMPS: readonly { tier: 1 | 2; x: number; z: number; dir: RampDir; width: number }[] = [
  { tier: 1, x: -57, z: 0, dir: "W", width: 10 },
  { tier: 1, x: -64, z: 100, dir: "W", width: 10 },
  { tier: 1, x: -85, z: -46, dir: "S", width: 10 },
  { tier: 2, x: -74, z: 70, dir: "W", width: 10 },
  { tier: 2, x: -100, z: -32, dir: "S", width: 8 }
];

export const TWO_CROSSINGS: MapDef = {
  id: "two-crossings",
  name: "The Two Crossings",
  blurb: "Sông lớn uốn lượn, 3 cây cầu. Sắt trên đồi cao quanh căn cứ, Dầu ở đồng bằng ven sông: giữ đồng bằng bằng công sự trên mép đồi.",
  size: { w: 240, h: 240 },
  symmetric: true,
  bases: [[-97, 88]],
  mines: [
    // Sắt trên đồi
    { res: "iron", x: -100.8, z: 62.4, owner: 0 },
    { res: "iron", x: -79.2, z: 48, owner: -1 },
    { res: "iron", x: -93.6, z: 4.8, owner: -1 },
    // Dầu ở đồng bằng
    { res: "oil", x: -26.4, z: 86.4, owner: 0, amount: 1200 },
    { res: "oil", x: -21.6, z: 28.8, owner: -1 },
    { res: "oil", x: 9.6, z: 62.4, owner: -1 },
    { res: "oil", x: 24, z: 96, owner: -1 }
  ],
  tiers: [
    { tier: 1, poly: PLATEAU_1 },
    { tier: 2, poly: PLATEAU_2 }
  ],
  ramps: RAMPS.map((r) => rampOnEdge(r.tier === 1 ? PLATEAU_1 : PLATEAU_2, r.x, r.z, r.dir, r.width)),
  rocks: [
    { x: -84, z: 14.4, r: 5, h: 4 },
    { x: -97.2, z: 45.6, r: 3.9, h: 3.5 },
    { x: -66, z: 33.6, r: 4.4, h: 3.5 },
    { x: -75.6, z: -27.6, r: 4.1, h: 3.5 },
    { x: -40.8, z: 48, r: 3.3, h: 3 },
    { x: -7.2, z: 48, r: 2.8, h: 2.5 },
    { x: -57.6, z: 91.2, r: 4.1, h: 3.5 },
    { x: -19.2, z: 113, r: 3.3, h: 3 },
    { x: -91.2, z: -60, r: 3.9, h: 3.5 }
  ],
  rivers: [
    {
      // sông chính: từ mép trên xuống, lượn chéo qua tâm, xuống mép dưới (tự đối xứng)
      path: symmetricRiver(
        [
          [-74.9, -130],
          [-73, -110.4],
          [-77.3, -97.9],
          [-73, -86.4],
          [-64.3, -77.3],
          [-59.5, -65.8],
          [-48, -61],
          [-38.9, -56.2],
          [-36, -45.1],
          [-25.9, -35.5],
          [-13, -31.7],
          [-7.2, -19.2],
          [-4.3, -7.7],
          [0, 0]
        ],
        5
      ),
      half: 7.5,
      bank: 11.5,
      depth: 2.6,
      fordDepth: 0.3,
      crossings: [
        { x: -61.9, z: -71.5, half: 4.5, kind: "bridge" },
        { x: 0, z: 0, half: 7, kind: "bridge" }
      ]
    },
    {
      // nhánh phụ chảy ra mép trái (máy tự thêm nhánh đối xứng ra mép phải), không có lối qua
      path: smoothPath(
        [
          [-70, -85],
          [-81.6, -77.8],
          [-91.7, -79.7],
          [-100.8, -74.4],
          [-111.4, -76.3],
          [-130, -73]
        ],
        4
      ),
      half: 4.3,
      bank: 7,
      depth: 1.8,
      fordDepth: 0.3,
      crossings: []
    }
  ],
  regions: [
    // góc bị nhánh sông tách riêng: rừng kín
    {
      kind: "forest",
      poly: [
        [-125, -125],
        [-70, -125],
        [-70, -71],
        [-125, -71]
      ]
    },
    forest(-113.3, -7.2, 9.6, 20.4, 1),
    forest(-70.8, -4.8, 13.2, 10.1, 2),
    forest(38.4, 113.3, 24, 11, 3),
    forest(-43.2, 14.4, 8.2, 5.8, 4),
    forest(-24, -12, 7.2, 4.8, 5),
    forest(29, 27, 7.5, 5, 6),
    forest(-84, 110.4, 14.4, 7.2, 7),
    forest(-40.8, 105.6, 10.1, 6.2, 8),
    forest(-52.8, -40.8, 9.6, 6.2, 9)
  ],
  biome: "temperate"
};
