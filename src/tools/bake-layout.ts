/**
 * "Nướng" bản vẽ địa hình thành dữ liệu bản đồ cho game:
 *   npx tsx src/tools/bake-layout.ts <mã bản vẽ = standard> <file ra = src/sim/maps/data/<mã>.json>
 *
 * Đọc Docs/maps/<mã>/layout.json (Bản Vẽ Địa Hình), kiểm LUẬT DỐC và luật địa chất mỏ (cùng code với trang vẽ), tính các khối
 * dốc thành RampDef, lấy mốc mỏ thành MineDef, rồi ghi một file JSON nằm trong mã nguồn (Docs/ không lên git, game đăng web
 * phải đọc được). Bản đồ đối xứng: chỉ ghi dốc / mỏ của nửa thứ nhất, GameMap tự thêm bản xoay 180°.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { rampBlocks, rampRule } from "../map-editor/layout";

const ID = process.argv[2] ?? "standard";
const OUT = process.argv[3] ?? `src/sim/maps/data/${ID}.json`;
interface Ref {
  k: string;
  x: number;
  z: number;
  own?: number;
}
const src = JSON.parse(readFileSync(`Docs/maps/${ID}/layout.json`, "utf8")) as { w: number; h: number; rows: string[]; surf?: string[]; refs?: Ref[] };
const grid = src.rows.map((r) => r.split("").map((v) => ("nesw".includes(v) ? "d" : v)));
const R = grid.length;
const C = grid[0].length;
const halfW = src.w / 2;
const halfH = src.h / 2;

// ---- dốc
const { blocks, bad } = rampBlocks(grid);
if (bad.length) throw new Error(`${bad.length} khối dốc không suy được hướng`);
const ramps: { x: number; z: number; dir: "N" | "E" | "S" | "W"; width: number }[] = [];
const seen = new Uint8Array(R * C);
const errors: string[] = [];
for (const b of blocks) {
  let n = 0;
  for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) if (grid[r][c] === "d" && !seen[r * C + c]) (seen[r * C + c] = 1), n++;
  const { error } = rampRule(grid, b, n);
  const x = -halfW + (b.c0 + b.c1 + 1); // tâm khung (m): mỗi ô 2 m
  const z = -halfH + (b.r0 + b.r1 + 1);
  if (error) errors.push(`dốc (${x}, ${z}): ${error}`);
  // nửa thứ nhất của GameMap: z > 0, hoặc z = 0 và x < 0
  if (z > 0 || (z === 0 && x < 0)) {
    const ns = b.dir === "n" || b.dir === "s";
    ramps.push({ x, z, dir: b.dir.toUpperCase() as "N" | "E" | "S" | "W", width: (ns ? b.c1 - b.c0 + 1 : b.r1 - b.r0 + 1) * 2 });
  }
}
if (errors.length) throw new Error(`Bản vẽ còn dốc sai luật:\n${errors.join("\n")}`);

// ---- mỏ: phía Lam (x < 0) và mỏ nằm đúng trục giữa ở nửa z > 0; GameMap thêm bản xoay (đổi chủ Lam ↔ Đỏ)
const mines = (src.refs ?? [])
  .filter((f) => (f.k === "oil" || f.k === "iron") && (f.x < 0 || (f.x === 0 && f.z > 0)))
  .map((f) => ({ res: f.k as "oil" | "iron", x: f.x, z: f.z, owner: (f.own ?? -1) as 0 | 1 | -1 }));

mkdirSync(dirname(OUT), { recursive: true });
const out = { w: src.w, h: src.h, rows: src.rows.map((r) => r.replace(/[nesw]/g, "d")), surf: src.surf ?? null, ramps, mines };
writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/","/g, '",\n"').replace(/\],"/g, '],\n"'));
console.log(`Đã ghi ${OUT}: ${blocks.length} khối dốc (${ramps.length} khai báo nửa thứ nhất), ${mines.length} mỏ nửa Lam`);
