/**
 * Đọc bản vẽ địa hình (Docs/maps/<mã>/layout.json, xem map-editor/main.ts): dùng chung cho Bản Vẽ Địa Hình và trang xem 3D,
 * để hai nơi hiểu tầng và dốc giống hệt nhau. Lưới `grid[r][c]`: ô 2 m, hàng đầu là phía Bắc.
 */

export type Dir = "n" | "e" | "s" | "w";

export interface RampBlock {
  /** Khung ô (gồm cả hai mép). */
  c0: number;
  r0: number;
  c1: number;
  r1: number;
  dir: Dir;
  /** Hai đầu chênh đúng 1 tầng. */
  ok: boolean;
  /** Tầng chân dốc. */
  low: number;
}

/** Tầng của ô; ô dốc trả −1; ngoài lưới trả 0. */
export function cellTier(grid: string[][], c: number, r: number): number {
  const v = grid[r]?.[c];
  if (v === undefined || v === "0" || v === "r") return 0;
  if (v === "1" || v === "2" || v === "3") return Number(v);
  return -1;
}

/**
 * Hướng đi LÊN của khối dốc chiếm khung ô [c0, c1] × [r0, r1]: so tầng trung bình của dải ô ngay ngoài bốn cạnh, trục nào
 * hai đầu chênh tầng thì leo theo trục đó về phía cao hơn; cả hai trục đều chênh thì leo theo cạnh ngắn. Không chênh: null.
 * `ok`: hai đầu chênh đúng 1 tầng (luật: dốc chỉ lên một tầng, không vượt tầng). `low`: tầng phía chân dốc.
 */
export function rampDirOf(grid: string[][], c0: number, r0: number, c1: number, r1: number): { dir: Dir; ok: boolean; low: number } | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const avg = (cells: [number, number][]): number => {
    let s = 0,
      n = 0;
    for (const [c, r] of cells) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const t = cellTier(grid, c, r);
      if (t < 0) continue;
      s += t;
      n++;
    }
    return n ? s / n : NaN;
  };
  const span = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const N = avg(span(c0, c1).map((c) => [c, r0 - 1]));
  const S = avg(span(c0, c1).map((c) => [c, r1 + 1]));
  const W = avg(span(r0, r1).map((r) => [c0 - 1, r]));
  const E = avg(span(r0, r1).map((r) => [c1 + 1, r]));
  const ns = isNaN(N) || isNaN(S) ? 0 : N - S;
  const ew = isNaN(E) || isNaN(W) ? 0 : E - W;
  const okNS = Math.abs(ns) >= 0.25;
  const okEW = Math.abs(ew) >= 0.25;
  if (!okNS && !okEW) return null;
  const useNS = okNS && okEW ? r1 - r0 <= c1 - c0 : okNS;
  const dir: Dir = useNS ? (ns > 0 ? "n" : "s") : ew > 0 ? "e" : "w";
  const diff = Math.abs(useNS ? ns : ew);
  const low = Math.round(useNS ? Math.min(N, S) : Math.min(E, W));
  return { dir, ok: Math.abs(diff - 1) < 1e-6, low };
}

/** Mọi khối dốc (các ô "d" liền nhau theo 4 hướng) cùng hướng leo; khối không suy được hướng bị bỏ qua. */
export function rampBlocks(grid: string[][]): { blocks: RampBlock[]; owner: Int32Array; bad: { c0: number; r0: number; c1: number; r1: number }[] } {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const owner = new Int32Array(rows * cols).fill(-1);
  const seen = new Uint8Array(rows * cols);
  const blocks: RampBlock[] = [];
  const bad: { c0: number; r0: number; c1: number; r1: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== "d" || seen[r * cols + c]) continue;
      let c0 = c,
        c1 = c,
        r0 = r,
        r1 = r;
      const q = [r * cols + c];
      const cells: number[] = [];
      seen[r * cols + c] = 1;
      while (q.length) {
        const i = q.pop()!;
        cells.push(i);
        const cc = i % cols;
        const rr = (i - cc) / cols;
        c0 = Math.min(c0, cc);
        c1 = Math.max(c1, cc);
        r0 = Math.min(r0, rr);
        r1 = Math.max(r1, rr);
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nc = cc + dc,
            nr = rr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nr * cols + nc] || grid[nr][nc] !== "d") continue;
          seen[nr * cols + nc] = 1;
          q.push(nr * cols + nc);
        }
      }
      const rd = rampDirOf(grid, c0, r0, c1, r1);
      if (!rd) {
        bad.push({ c0, r0, c1, r1 });
        continue;
      }
      for (const i of cells) owner[i] = blocks.length;
      blocks.push({ c0, r0, c1, r1, ...rd });
    }
  return { blocks, owner, bad };
}

/** Một khối dốc chuẩn: 5 × 5 ô (10 × 10 m), lên đúng 1 bậc (người dùng chốt 11/11/2026). */
export const RAMP_CELLS = 5;

/**
 * LUẬT DỐC (người dùng chốt 11/11/2026), trả lý do sai đầu tiên hoặc null nếu đúng:
 * 1. Khối dốc là hình chữ nhật, lên đúng 1 tầng.
 * 2. Dài đúng 10 m theo hướng leo; rộng là bội số 10 m (ghép nhiều khối 10 × 10 cạnh nhau theo bề ngang).
 * 3. Không nối dốc theo chiều leo: ngay trên đỉnh có chiếu nghỉ phẳng sâu 10 m, ngang bề rộng dốc, cùng tầng đỉnh dốc.
 * 4. Dốc không lộ thiên: ít nhất một bên hông dựa trọn vào khối cao (≥ tầng đỉnh dốc) hoặc đá.
 * `landing`: khung ô chiếu nghỉ (để vẽ).
 */
export function rampRule(
  grid: string[][],
  b: { c0: number; r0: number; c1: number; r1: number },
  count: number
): { error: string | null; landing: [number, number, number, number] | null } {
  const rd = rampDirOf(grid, b.c0, b.r0, b.c1, b.r1);
  if (!rd) return { error: "hai đầu dốc cùng tầng", landing: null };
  const { c0, r0, c1, r1 } = b;
  const ns = rd.dir === "n" || rd.dir === "s";
  const len = ns ? r1 - r0 + 1 : c1 - c0 + 1;
  const wid = ns ? c1 - c0 + 1 : r1 - r0 + 1;
  const high = rd.low + 1;
  const L = RAMP_CELLS;
  const landing: [number, number, number, number] =
    rd.dir === "e" ? [c1 + 1, r0, c1 + L, r1] : rd.dir === "w" ? [c0 - L, r0, c0 - 1, r1] : rd.dir === "s" ? [c0, r1 + 1, c1, r1 + L] : [c0, r0 - L, c1, r0 - 1];
  if (!rd.ok) return { error: "dốc phải lên đúng 1 tầng", landing };
  if (count !== (r1 - r0 + 1) * (c1 - c0 + 1)) return { error: "khối dốc phải là hình chữ nhật", landing };
  if (len !== L) return { error: `dốc phải dài 10 m (đang ${len * 2} m)`, landing };
  if (wid % L !== 0) return { error: `bề rộng phải là bội số 10 m (đang ${wid * 2} m)`, landing };
  for (let r = landing[1]; r <= landing[3]; r++)
    for (let c = landing[0]; c <= landing[2]; c++)
      if (cellTier(grid, c, r) !== high || grid[r]?.[c] === "r") return { error: "trên đỉnh dốc phải có chiếu nghỉ phẳng 10 m", landing };
  const solid = (c: number, r: number): boolean => grid[r]?.[c] === "r" || cellTier(grid, c, r) >= high;
  const side = (cells: [number, number][]): boolean => cells.every(([c, r]) => solid(c, r));
  const span = (a: number, z: number): number[] => Array.from({ length: z - a + 1 }, (_, i) => a + i);
  const sideA = ns ? span(r0, r1).map((r): [number, number] => [c0 - 1, r]) : span(c0, c1).map((c): [number, number] => [c, r0 - 1]);
  const sideB = ns ? span(r0, r1).map((r): [number, number] => [c1 + 1, r]) : span(c0, c1).map((c): [number, number] => [c, r1 + 1]);
  if (!side(sideA) && !side(sideB)) return { error: "dốc lộ thiên: một bên hông phải dựa vào khối cao hoặc đá", landing };
  return { error: null, landing };
}
