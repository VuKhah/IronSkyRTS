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
import type { MapDef } from "./types";

/*
 * Bước 4: địa hình thử theo ý Claude (người dùng giao 11/11/2026, chỉ tầng + dốc, chưa tô):
 * - Cao nguyên giữa (tầng 1, G4–I6) có đỉnh tầng 2 ở tâm: tách 3 tuyến Bắc / giữa / Nam; dốc lên từ phía mỗi phe.
 * - Sống đá trên đường vàng x = −52 (tầng 1, F2–F4): đất cao tiền tuyến cánh Bắc của Lam (Đỏ có bản xoay ở cánh Nam,
 *   J6–J8). Hai lối vòng: khe hẹp sát mép Bắc và hành lang giữa sống đá với cao nguyên; dốc ở cả hai mặt.
 * - Gò canh nhà (tầng 1, C6–D7): điểm quan sát cánh Nam của căn cứ Lam, dốc mặt Bắc.
 */
const CENTER = blobPoly(0, 0, 66, 38, 11, 0.1, 18);
const CROWN = blobPoly(0, 0, 24, 14, 5, 0.08, 14);
const RIDGE = blobPoly(-52, -80, 13, 34, 23, 0.1, 14);
const HILL = blobPoly(-135, 80, 22, 18, 31, 0.12, 14);

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
    { tier: 1, poly: HILL }
  ],
  ramps: [
    rampOnEdge(CENTER, -66, 0, "E", 12),
    rampOnEdge(CROWN, -24, 0, "E", 8),
    rampOnEdge(RIDGE, -65, -70, "E", 10),
    rampOnEdge(RIDGE, -39, -95, "W", 10),
    rampOnEdge(HILL, -135, 62, "S", 10)
  ],
  symmetric: true,
  bases: [[-180, 0]],
  mines: [],
  rocks: [],
  rivers: [],
  biome: "temperate"
};
