/**
 * LỚP TƯƠNG THÍCH (bước B0 của Docs/design/MAPS_PLAN.md). Bản đồ thật nằm ở `src/sim/maps/` (MapDef + GameMap).
 *
 * File này xuất lại các hằng số và hàm cũ, lấy từ bản đồ MẶC ĐỊNH, để các nơi chưa chuyển vẫn chạy.
 * Bước B1 sẽ chuyển từng nơi sang đọc thẳng `GameMap` (truyền theo trận), rồi xóa file này.
 * Đừng thêm thứ mới vào đây: thêm vào `src/sim/maps/`.
 *
 * Riêng toU / toV / fromUV là hệ trục dọc theo dòng sông của "Thung Lũng Sông Sắt" (sông theo đường x = z):
 *   u = (x - z)/√2: khoảng cách có dấu tới dòng sông (u < 0 là đất Lam), v = (x + z)/√2: vị trí dọc sông.
 */
import { CELL as MAP_CELL, getMap, type Blob, type MineDef } from "./maps";

const M = getMap();
const RIVER = M.def.rivers[0];

export type { Blob, MineDef };
export const MAP_HALF = M.halfW;
export const CELL = MAP_CELL;
export const GRID = M.cols;
export const INV_SQRT2 = 0.7071067811865476;
/** Nửa bề rộng lòng sông có nước (m). */
export const RIVER_HALF = RIVER.half;
/** Nửa bề rộng cả bờ dốc hai bên (m). */
export const BANK_HALF = RIVER.bank;
/** Ngoài khung này là vách núi bao quanh bản đồ. */
export const EDGE = M.halfW - 4;

export const toU = (x: number, z: number): number => (x - z) * INV_SQRT2;
export const toV = (x: number, z: number): number => (x + z) * INV_SQRT2;
export function fromUV(u: number, v: number): [number, number] {
  return [(u + v) * INV_SQRT2, (v - u) * INV_SQRT2];
}

export interface Crossing {
  v: number;
  half: number;
  kind: "bridge" | "ford";
}

/** Lối qua sông theo vị trí dọc sông v (cho phần vẽ cũ). */
export const CROSSINGS: readonly Crossing[] = RIVER.crossings.map((c) => ({ v: toV(c.x, c.z), half: c.half, kind: c.kind }));

export function crossingAt(v: number): Crossing | null {
  for (const c of CROSSINGS) if (Math.abs(v - c.v) < c.half) return c;
  return null;
}

export const ROCKS: readonly Blob[] = M.rocks;
export const HILLS: readonly Blob[] = M.hills;
export const MINES: readonly MineDef[] = M.mines;
export const HQ_POS: readonly (readonly [number, number])[] = M.bases;

export const staticBlocked = (x: number, z: number): boolean => M.staticBlocked(x, z);
export const terrainHeight = (x: number, z: number): number => M.terrainHeight(x, z);
export const deckHeight = (x: number, z: number): number | null => M.deckHeight(x, z);
export const groundY = (x: number, z: number): number => M.groundY(x, z);
