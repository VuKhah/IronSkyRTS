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
import type { MapDef } from "./types";

export const STANDARD: MapDef = {
  id: "standard",
  name: "Bản Đồ Chuẩn",
  blurb: "Bản đồ chính thức đang dựng: mặt đất 436 × 270 m.",
  size: { w: 436, h: 270 },
  roundTop: 12,
  ruler: { cell: 30, minor: 10, guideX: [-52, 52] },
  symmetric: true,
  bases: [[-180, 0]],
  mines: [],
  rocks: [],
  rivers: [],
  biome: "temperate"
};
