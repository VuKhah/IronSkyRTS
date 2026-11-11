/**
 * BẢN ĐỒ CHUẨN (người dùng chốt 11/11/2026): bản đồ chính thức thứ nhất, các bản đồ trước rời menu (chỉ còn làm bản đồ
 * kiểm thử). Chữ nhật nằm ngang 436 m (Đông – Tây) × 270 m (Bắc – Nam): người dùng đưa 437 × 270 (tỉ lệ ≈ 1,62 như bản
 * 777 × 480 bàn trước), 437 không chia hết cho ô 2 m nên lấy 436.
 *
 * Đang dựng cùng người dùng từng bước nhỏ. Bước 1: chỉ có mặt đất phẳng; căn cứ đặt TẠM ở giữa mép Tây / Đông
 * (cần cho kiểm thử và để vào chơi thử), chưa có mỏ, tầng cao, sông. Bước 2: không có thành, ngoài mép không có gì;
 * hình chữ nhật bo nhẹ hai góc phía Bắc (`roundTop`, chỉ ở phần vẽ).
 * Bước 3: thước đo theo ý người dùng (tỉ lệ vàng + bội số của 9): ô lớn 30 m (cạnh Bắc – Nam 270 = 9 hàng), ô ly 10 m
 * (27 hàng), căn giữa tâm; hai đường vàng x = ±52 là mép hình vuông 270 × 270 tính từ mỗi đầu (436 = 270 + 166, 270 / 166 ≈ φ).
 *
 * Khai báo MỘT NỬA (`symmetric`): GameMap tự thêm bản xoay 180° quanh tâm cho phía Đỏ.
 */
import { blobPoly, rampOnEdge } from "./shapes";
import type { MapDef, Vec2 } from "./types";

/*
 * Bước 4: địa hình thử theo ý Claude (người dùng giao 11/11/2026, chỉ tầng + dốc, chưa tô):
 * - Cao nguyên giữa (tầng 1, G4–I6) có đỉnh tầng 2 ở tâm: tách 3 tuyến Bắc / giữa / Nam; dốc lên từ phía mỗi phe.
 * - Sống đá trên đường vàng x = −52 (tầng 1, F2–F4): đất cao tiền tuyến cánh Bắc của Lam (Đỏ có bản xoay ở cánh Nam,
 *   J6–J8). Hai lối vòng: khe hẹp sát mép Bắc và hành lang giữa sống đá với cao nguyên; dốc ở cả hai mặt.
 * - Bước 5 (người dùng): cả cụm HQ nằm trên nền tầng 1 từ A3 tới D7 (bỏ gò canh nhà); 3 dốc xuống: Đông (rộng 16 m, ra
 *   tiền tuyến), Bắc và Nam (12 m, ra hai cánh).
 */
const CENTER = blobPoly(0, 0, 66, 38, 11, 0.1, 18);
const CROWN = blobPoly(0, 0, 24, 14, 5, 0.08, 14);
const RIDGE = blobPoly(-52, -80, 13, 34, 23, 0.1, 14);
/** Nền HQ tầng 1, A3–D7: x từ mép Tây tới −105, z từ −75 tới 75; vát hai góc phía Đông. */
const BASE: Vec2[] = [
  [-230, -75],
  [-117, -75],
  [-105, -63],
  [-105, 63],
  [-117, 75],
  [-230, 75]
];

export const STANDARD: MapDef = {
  id: "standard",
  name: "Bản Đồ Chuẩn",
  blurb: "Bản đồ chính thức đang dựng: mặt đất 436 × 270 m.",
  size: { w: 436, h: 270 },
  roundTop: 12,
  ruler: { cell: 30, minor: 10, guideX: [-52, 52] },
  tiers: [
    { tier: 1, poly: CENTER },
    { tier: 2, poly: CROWN },
    { tier: 1, poly: RIDGE },
    { tier: 1, poly: BASE }
  ],
  ramps: [
    rampOnEdge(CENTER, -66, 0, "E", 12),
    rampOnEdge(CROWN, -24, 0, "E", 8),
    rampOnEdge(RIDGE, -65, -70, "E", 10),
    rampOnEdge(RIDGE, -39, -95, "W", 10),
    rampOnEdge(BASE, -105, 0, "W", 16),
    rampOnEdge(BASE, -150, -75, "S", 12),
    rampOnEdge(BASE, -150, 75, "N", 12)
  ],
  symmetric: true,
  bases: [[-180, 0]],
  mines: [],
  rocks: [],
  rivers: [],
  biome: "temperate"
};
