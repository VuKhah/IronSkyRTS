/**
 * Nội dung game: chỉ số của mọi binh chủng, công trình và luật chơi.
 *
 * Đây là DỮ LIỆU THUẦN: không import Three.js hay DOM. Lõi mô phỏng (sim), AI và giao diện
 * đều đọc chung một nguồn này, nên con số trên Xưởng Mô Hình không bao giờ lệch với trận đấu.
 *
 * ⚠️ Mọi con số hiện là SỐ TẠM cho bản demo MVP (xem Docs/design/MVP_DESIGN.md). Sẽ bàn kỹ lại sau bản demo.
 * Đơn vị: mét, giây, m/s. Bản đồ MVP rộng 160 × 160 m.
  *
 * Chia theo nhóm (16/11/2026): types · formations · rules · units/ (mỗi nhóm quân một file) · buildings · placement.
 * Mọi nơi vẫn import từ "content" như trước: file này gom lại tất cả.
 */

import { BUILDINGS } from "./buildings";
import { RULES } from "./rules";
import type { BuildingId, Cost, EntityId, EntitySpec, TargetMask, UnitId, WeaponSpec } from "./types";
import { UNITS } from "./units";

export * from "./types";
export * from "./formations";
export * from "./rules";
export * from "./units";
export * from "./buildings";
export * from "./placement";

/** Công trình người chơi được xây trong bản MVP, theo thứ tự trên thanh xây. */
export const MVP_BUILDABLE: readonly BuildingId[] = ["factory", "special-factory", "aircraft-factory", "airfield", "power-plant", "battery", "power-pylon", "turret", "wall", "radar"];

export function isUnitId(id: string): id is UnitId {
  return id in UNITS;
}

/**
 * Rải thảm được không: xe mặt đất có vũ khí bắn đất có độ tản (Xe Tên Lửa Loạt). Đọc từ dữ liệu vũ khí, không theo tên quân,
 * để sau này quân khác có vũ khí tản (pháo phản lực, dàn mìn…) tự có kỹ năng này.
 */
export function canStrike(id: UnitId): boolean {
  const u = UNITS[id];
  return u.domain === "ground" && !!u.weapon && !!u.weapon.scatter && u.weapon.dmgGround > 0;
}

/** Giá trị của một loại quân / công trình (cho kinh nghiệm cựu binh, xác quân, AI chọn chỗ bắn): Sắt + Dầu × trọng số. */
export function valueOf(id: EntityId): number {
  const spec = getSpec(id);
  const V = RULES.veterancy;
  return spec.cost ? spec.cost.iron + spec.cost.oil * V.oilWeight : V.noCostValue;
}

export function getSpec(id: EntityId): EntitySpec {
  return isUnitId(id) ? UNITS[id] : BUILDINGS[id as BuildingId];
}

export function targetsOf(w: WeaponSpec | undefined): TargetMask {
  if (!w) return "none";
  if (w.dmgGround > 0 && w.dmgAir > 0) return "both";
  if (w.dmgGround > 0) return "ground";
  if (w.dmgAir > 0) return "air";
  return "none";
}

/** Binh chủng đã có trong Khung Tính Năng nhưng chưa thiết kế mô hình. */
export const PLANNED_UNITS: { name: string; group: string }[] = [
  { name: "Pháo Tự Hành", group: "Mặt đất" },
  { name: "Xe Công Binh", group: "Mặt đất" },
  { name: "Trực Thăng Tấn Công", group: "Trên không" },
  { name: "Trực Thăng Vận Tải", group: "Trên không" },
  { name: "Drone Sửa Chữa", group: "Trên không" },
  { name: "Tiểu Đội Súng Trường", group: "Bộ binh" },
  { name: "Tiểu Đội Tên Lửa", group: "Bộ binh" },
  { name: "Tổ Bắn Tỉa", group: "Bộ binh" },
  { name: "Pháo Đài Di Động", group: "Siêu cỗ máy" }
];

export const PLANNED_BUILDINGS: string[] = ["Trại Bộ Binh", "Trung Tâm Nghiên Cứu"];

/** Giá của cả lô (một lần bấm đúc). */
export function lotCost(kind: UnitId): Cost {
  const u = UNITS[kind];
  return { iron: (u.cost?.iron ?? 0) * u.batch, oil: (u.cost?.oil ?? 0) * u.batch };
}

/** Thời gian đúc cả lô (giây). Đúc cùng lúc nên rẻ hơn đúc lần lượt từng chiếc. */
export function lotTime(kind: UnitId): number {
  const u = UNITS[kind];
  return (u.buildTime ?? 5) * (1 + RULES.lotTimeExtra * (u.batch - 1));
}
