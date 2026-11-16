/**
 * Mã phân nhóm cho đội hình: MUI mũi nhanh · GIAP xung kích giáp · HL hỏa lực trực tiếp tầm trung · PK phòng không ·
 * RT rải thảm tầm trung (pháo phản lực) · XA hỏa lực gián tiếp tầm xa (pháo nòng) · DAN đạn đạo · HC hậu cần · TL chỉ huy ·
 * KQ máy bay cánh bằng (không vào đội hình mặt đất). RT và XA là hai tầng riêng (người dùng 16/11/2026): Pháo đứng sau Tên Lửa Loạt.
 * Trực thăng và tàu dùng cùng các mã này, phân biệt bằng `domain`.
 */
export type GroupCode = "MUI" | "GIAP" | "HL" | "PK" | "RT" | "XA" | "DAN" | "HC" | "TL" | "KQ" | "BB";

export type FormationId = "hold" | "march" | "attack" | "escort" | "pin";

/** Một kiểu đội hình, hoàn toàn là dữ liệu: thêm kiểu mới không phải sửa luật. */
export interface FormationDef {
  name: string;
  /** Bề ngang ≈ √(số xe × wide) xe mỗi hàng: nhỏ là cột dọc, lớn là tuyến mỏng. */
  wide: number;
  /** Tuyến của từng mã: số nhỏ đứng trước; mỗi tuyến bắt đầu hàng mới. */
  rank: Record<GroupCode, number>;
  /** Một phần ba xe GIAP phía sau tách ra làm tuyến đoạn hậu. */
  rearGuard?: boolean;
  /** Mã này đứng dọc hai bên tuyến giữa thay vì xếp hàng (khi đội đang giãn hết cỡ). */
  flank?: GroupCode;
}

/** Tuyến cuối cùng, dành cho đoạn hậu của các đội hình có `rearGuard`. */
export const REAR_RANK = 9;

const ATTACK_RANK: Record<GroupCode, number> = { MUI: 0, GIAP: 0, HL: 1, TL: 1, PK: 1, KQ: 1, BB: 1, RT: 2, XA: 3, HC: 3, DAN: 4 };

export const FORMATIONS: Record<FormationId, FormationDef> = {
  // giữ trận địa: giáp đứng trước, xe nhanh làm lực lượng dự phòng ngay sau giáp, hỏa lực phía sau, phòng không hai cánh
  hold: { name: "Giữ", wide: 3, rank: { GIAP: 0, MUI: 1, HL: 1, TL: 1, PK: 1, KQ: 1, BB: 1, RT: 2, XA: 3, HC: 3, DAN: 4 }, flank: "PK" },
  march: { name: "Hành quân", wide: 0.8, rank: { MUI: 0, GIAP: 1, HL: 2, TL: 2, PK: 2, KQ: 2, BB: 2, RT: 3, XA: 4, HC: 4, DAN: 5 }, rearGuard: true },
  attack: { name: "Xung kích", wide: 2.5, rank: ATTACK_RANK },
  // hộ tống Pháo: Pháo (XA) nằm giữa khối giữa và đoạn hậu, phòng không hai cánh: được che kín bốn phía
  escort: { name: "Hộ tống Pháo", wide: 1.5, rank: { MUI: 0, GIAP: 0, HL: 1, TL: 1, PK: 1, KQ: 1, BB: 1, RT: 1, XA: 2, HC: 2, DAN: 2 }, rearGuard: true, flank: "PK" },
  pin: { name: "Kìm chân", wide: 8, rank: ATTACK_RANK }
};

/** Đội hình của xe chưa từng được Tư lệnh chọn kiểu nào (người dùng chốt 09/11/2026). */
export const DEFAULT_FORMATION: FormationId = "hold";
