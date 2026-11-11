/**
 * THƯỚC ĐO của bản đồ: lưới ô đặt tên (A1, B2…) dùng chung cho bàn tác chiến trong game, ô ly trên mặt sân 3D và ảnh xem
 * trước `npm run map-preview`, để người dùng ước lượng và góp ý theo ô. Chỉ là phần vẽ / công cụ, không ảnh hưởng luật.
 *
 * - Bản đồ có `MapDef.ruler`: lưới CĂN GIỮA tâm (ô giữa nằm đúng tâm, ô ngoài cùng có thể hụt), nên ô của Lam và ô của Đỏ
 *   soi gương qua tâm (A1 ↔ ô cuối). Có thêm ô ly nhỏ và đường dẫn (ví dụ đường chia tỉ lệ vàng).
 * - Không có: ô 20 m tính từ góc Tây Bắc (cách cũ của các bản đồ kiểm thử).
 */
import type { GameMap } from "./game-map";

export interface Ruler {
  /** Cạnh ô lớn (m). */
  cell: number;
  /** Cạnh ô ly (m), 0 = không có. */
  minor: number;
  /** Đường biên các cột (x, từ Tây sang Đông, gồm cả hai mép) và các hàng (z, từ Bắc xuống Nam). */
  colEdges: number[];
  rowEdges: number[];
  /** Đường ô ly (x / z), không gồm đường trùng ô lớn. */
  minorX: number[];
  minorZ: number[];
  /** Đường dẫn (x / z). */
  guideX: readonly number[];
  guideZ: readonly number[];
}

export const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(39 + i)}`);

/** Các đường cách nhau `step`, căn sao cho có một ô `step` nằm đúng giữa tâm, cắt trong (−half, half), thêm hai mép. */
function centered(half: number, step: number): number[] {
  const out = [-half, half];
  for (let v = step / 2; v < half - 1e-6; v += step) out.push(v, -v);
  return out.sort((a, b) => a - b);
}

function fromEdge(half: number, step: number): number[] {
  const out: number[] = [];
  for (let v = -half; v < half - 1e-6; v += step) out.push(v);
  out.push(half);
  return out;
}

export function mapRuler(map: GameMap): Ruler {
  const r = map.def.ruler;
  if (!r) {
    return { cell: 20, minor: 0, colEdges: fromEdge(map.halfW, 20), rowEdges: fromEdge(map.halfH, 20), minorX: [], minorZ: [], guideX: [], guideZ: [] };
  }
  const colEdges = centered(map.halfW, r.cell);
  const rowEdges = centered(map.halfH, r.cell);
  const minor = r.minor ?? 0;
  const notMajor = (edges: number[]) => (v: number): boolean => edges.every((e) => Math.abs(e - v) > 1e-6);
  return {
    cell: r.cell,
    minor,
    colEdges,
    rowEdges,
    minorX: minor ? centered(map.halfW, minor).filter(notMajor(colEdges)) : [],
    minorZ: minor ? centered(map.halfH, minor).filter(notMajor(rowEdges)) : [],
    guideX: r.guideX ?? [],
    guideZ: r.guideZ ?? []
  };
}

/** Tên ô chứa điểm (x, z), ví dụ "C5". */
export function cellName(ruler: Ruler, x: number, z: number): string {
  const idx = (edges: number[], v: number): number => {
    let i = 0;
    while (i < edges.length - 2 && v >= edges[i + 1]) i++;
    return i;
  };
  return `${colName(idx(ruler.colEdges, x))}${idx(ruler.rowEdges, z) + 1}`;
}
