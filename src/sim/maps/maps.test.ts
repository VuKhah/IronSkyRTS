/**
 * Kiểm thử chung cho MỌI bản đồ (Docs/design/MAPS_PLAN.md): bản đồ mới thêm vào MAP_DEFS là tự được kiểm.
 * - Công bằng: đối xứng xoay 180° quanh tâm (căn cứ, mỏ, độ cao, chỗ đi được).
 * - Chơi được: căn cứ không bị chặn, mọi mỏ đi tới được từ cả hai nhà.
 */
import { describe, expect, it } from "vitest";
import { CELL, DEV_MAP_DEFS, getMap, MAP_DEFS } from "./index";

describe.each([...MAP_DEFS, ...DEV_MAP_DEFS].map((d) => [d.id]))("bản đồ %s", (id) => {
  const m = getMap(id);
  const cx = (c: number): number => -m.halfW + (c + 0.5) * CELL;
  const cz = (r: number): number => -m.halfH + (r + 0.5) * CELL;

  it("có 2 căn cứ và kích thước chia hết cho ô lưới", () => {
    expect(m.bases.length).toBeGreaterThanOrEqual(2);
    expect(m.cols * CELL).toBeCloseTo(m.w, 9);
    expect(m.rows * CELL).toBeCloseTo(m.h, 9);
  });

  it("đối xứng xoay 180°: căn cứ, mỏ, độ cao, chỗ đi được, loại địa hình", () => {
    const [a, b] = m.bases;
    expect(b[0]).toBeCloseTo(-a[0], 6);
    expect(b[1]).toBeCloseTo(-a[1], 6);
    const swap = (o: number): number => (o === 0 ? 1 : o === 1 ? 0 : -1);
    for (const mine of m.mines) {
      const twin = m.mines.find(
        (t) => t.res === mine.res && Math.abs(t.x + mine.x) < 1e-6 && Math.abs(t.z + mine.z) < 1e-6 && t.owner === swap(mine.owner) && t.amount === mine.amount
      );
      expect(twin, `mỏ ${mine.res} (${mine.x}, ${mine.z}) thiếu mỏ đối xứng`).toBeDefined();
    }
    for (let r = 0; r < m.rows; r++)
      for (let c = 0; c < m.cols; c++) {
        const x = cx(c);
        const z = cz(r);
        expect(Math.abs(m.terrainHeight(x, z) - m.terrainHeight(-x, -z)), `độ cao (${x}, ${z})`).toBeLessThan(1e-9);
        expect(m.staticBlocked(x, z), `chỗ đi được (${x}, ${z})`).toBe(m.staticBlocked(-x, -z));
        expect(m.terrainAt(x, z), `loại địa hình (${x}, ${z})`).toBe(m.terrainAt(-x, -z));
      }
  });

  it("căn cứ không bị chặn, mọi mỏ đi tới được từ cả hai nhà", () => {
    const cell = (x: number, z: number): number => {
      const c = Math.min(m.cols - 1, Math.max(0, Math.floor((x + m.halfW) / CELL)));
      const r = Math.min(m.rows - 1, Math.max(0, Math.floor((z + m.halfH) / CELL)));
      return r * m.cols + c;
    };
    const open = new Uint8Array(m.cols * m.rows);
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) open[r * m.cols + c] = m.staticBlocked(cx(c), cz(r)) ? 0 : 1;
    for (const [bx, bz] of m.bases) {
      // căn cứ chiếm vài ô; xét ô trống gần nhất quanh tâm căn cứ
      let start = cell(bx, bz);
      if (!open[start]) start = cell(bx + 6, bz);
      expect(open[start], `căn cứ (${bx}, ${bz}) bị chặn`).toBe(1);
      // loang 4 hướng từ căn cứ
      const seen = new Uint8Array(open.length);
      const q = [start];
      seen[start] = 1;
      while (q.length) {
        const i = q.pop()!;
        const c = i % m.cols;
        const r = (i - c) / m.cols;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= m.cols || nr >= m.rows) continue;
          const j = nr * m.cols + nc;
          if (open[j] && !seen[j]) {
            seen[j] = 1;
            q.push(j);
          }
        }
      }
      for (const mine of m.mines) expect(seen[cell(mine.x, mine.z)], `mỏ (${mine.x}, ${mine.z}) không đi tới được từ (${bx}, ${bz})`).toBe(1);
    }
  });
});
