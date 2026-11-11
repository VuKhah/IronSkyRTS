/**
 * Kiểm bản vẽ địa hình theo LUẬT DỐC (src/map-editor/layout.ts, cùng code với Bản Vẽ Địa Hình):
 *   npx tsx src/tools/check-layout.ts [mã = standard]
 * In từng khối dốc sai (ô, khung, hướng, lý do). Không sửa file.
 */
import { readFileSync } from "node:fs";
import { cellLabelOf } from "./layout-names";
import { rampRule } from "../map-editor/layout";

const ID = process.argv[2] ?? "standard";
const data = JSON.parse(readFileSync(`Docs/maps/${ID}/layout.json`, "utf8")) as { w: number; h: number; rows: string[] };
const grid = data.rows.map((r) => r.split("").map((v) => ("nesw".includes(v) ? "d" : v)));
const R = grid.length;
const C = grid[0].length;
const seen = new Uint8Array(R * C);
let bad = 0;
let total = 0;
for (let r = 0; r < R; r++)
  for (let c = 0; c < C; c++) {
    if (grid[r][c] !== "d" || seen[r * C + c]) continue;
    let c0 = c, c1 = c, r0 = r, r1 = r, n = 0;
    const q = [r * C + c];
    seen[r * C + c] = 1;
    while (q.length) {
      const i = q.pop()!;
      n++;
      const cc = i % C, rr = (i - cc) / C;
      c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); r0 = Math.min(r0, rr); r1 = Math.max(r1, rr);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = cc + dc, nr = rr + dr;
        if (nc < 0 || nr < 0 || nc >= C || nr >= R || seen[nr * C + nc] || grid[nr][nc] !== "d") continue;
        seen[nr * C + nc] = 1;
        q.push(nr * C + nc);
      }
    }
    total++;
    const { error } = rampRule(grid, { c0, r0, c1, r1 }, n);
    if (!error) continue;
    bad++;
    const x = -data.w / 2 + c0 * 2, z = -data.h / 2 + r0 * 2;
    console.log(`${cellLabelOf(data.w, data.h, x + 1, z + 1)} (x ${x}, z ${z}, ${(c1 - c0 + 1) * 2}×${(r1 - r0 + 1) * 2} m): ${error}`);
  }
console.log(`${total} khối dốc, ${bad} sai luật`);
