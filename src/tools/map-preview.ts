/**
 * Vẽ bản đồ nhìn từ trên xuống, có lưới ô đặt tên (A1, B2…), để góp ý bằng lời: "đưa đồi từ C5 sang D6".
 * Đồng thời in vị trí căn cứ, mỏ, lối qua theo ô. Vẽ từ chính GameMap nên khớp luật chơi.
 *
 *   npm run map-preview -- <mã bản đồ> [file ra = Docs/maps/_xem-truoc/<mã>.svg] [cỡ ô lưới = 20 m]
 *
 * Mở file .svg bằng trình duyệt là xem được.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getMap, TERRAIN } from "../sim/maps";

const ID = process.argv[2];
if (!ID) throw new Error("Cách dùng: npm run map-preview -- <mã bản đồ> [file ra] [cỡ ô lưới]");
const OUT = process.argv[3] ?? `Docs/maps/_xem-truoc/${ID}.svg`;
const CELL_M = Number(process.argv[4] ?? 20);
const map = getMap(ID);

const SAMPLE = 2; // lấy mẫu địa hình mỗi 2 m, trùng cỡ ô sim
const PAD = 26; // lề cho chữ A, B, C / 1, 2, 3
const sx = (x: number): number => x + map.halfW + PAD;
const sy = (z: number): number => z + map.halfH + PAD;

const cols = Math.ceil(map.w / CELL_M);
const rows = Math.ceil(map.h / CELL_M);
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(39 + i)}`);
const cellOf = (x: number, z: number): string => {
  const c = Math.max(0, Math.min(cols - 1, Math.floor((x + map.halfW) / CELL_M)));
  const r = Math.max(0, Math.min(rows - 1, Math.floor((z + map.halfH) / CELL_M)));
  return `${colName(c)}${r + 1}`;
};

/** Màu từng mẫu: theo loại địa hình, tối hơn ở chỗ thấp và sáng hơn ở chỗ cao để thấy đồi. */
function colorAt(x: number, z: number): string {
  const kind = map.terrainAt(x, z);
  const blocked = map.staticBlocked(x, z) && kind !== "deep" && kind !== "cliff";
  const base = blocked ? 0x3d3a36 : TERRAIN[kind].color;
  const k = kind === "deep" ? 1 : Math.max(0.6, Math.min(1.5, 1 + map.terrainHeight(x, z) * 0.07));
  const ch = (shift: number): number => Math.min(255, Math.round(((base >> shift) & 255) * k));
  // làm tròn màu để gộp được nhiều mẫu liền nhau, file nhỏ hơn
  const q = (v: number): string => (v & 0xf8).toString(16).padStart(2, "0");
  return `#${q(ch(16))}${q(ch(8))}${q(ch(0))}`;
}

const out: string[] = [];
const W = map.w + PAD * 2;
const H = map.h + PAD * 2;
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" font-family="Arial, sans-serif" shape-rendering="crispEdges">`);
out.push(`<rect width="${W}" height="${H}" fill="#141a24"/>`);

// Địa hình: gộp các mẫu cùng màu liền nhau trên một hàng thành một hình chữ nhật.
for (let z = -map.halfH; z < map.halfH; z += SAMPLE) {
  let start = -map.halfW;
  let color = colorAt(start + SAMPLE / 2, z + SAMPLE / 2);
  for (let x = -map.halfW + SAMPLE; x <= map.halfW; x += SAMPLE) {
    const c = x < map.halfW ? colorAt(x + SAMPLE / 2, z + SAMPLE / 2) : "";
    if (c === color) continue;
    out.push(`<rect x="${sx(start)}" y="${sy(z)}" width="${x - start}" height="${SAMPLE}" fill="${color}"/>`);
    start = x;
    color = c;
  }
}

out.push(`<clipPath id="trong-ban-do"><rect x="${PAD}" y="${PAD}" width="${map.w}" height="${map.h}"/></clipPath>`);
out.push(`<g shape-rendering="auto">`);
// Viền cao nguyên (đa giác thường kéo quá mép bản đồ nên phải cắt, không thì đè lên số hàng)
out.push(`<g clip-path="url(#trong-ban-do)">`);
for (const p of map.plateaus) {
  const pts = p.poly.map(([x, z]) => `${sx(x).toFixed(1)},${sy(z).toFixed(1)}`).join(" ");
  out.push(`<polygon points="${pts}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="4 3"/>`);
}
for (const h of map.hills) out.push(`<circle cx="${sx(h.x)}" cy="${sy(h.z)}" r="${h.r}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="4 3"/>`);
out.push(`</g>`);

// Lối qua sông
for (const c of map.crossings()) {
  const { x, z, half, kind } = c.def;
  const bridge = kind === "bridge";
  out.push(`<line x1="${sx(x - c.dirX * half)}" y1="${sy(z - c.dirZ * half)}" x2="${sx(x + c.dirX * half)}" y2="${sy(z + c.dirZ * half)}" stroke="${bridge ? "#f4f4f0" : "#e8d39a"}" stroke-width="5"/>`);
}

// Lưới ô
for (let i = 0; i <= cols; i++) {
  const x = Math.min(PAD + i * CELL_M, PAD + map.w);
  out.push(`<line x1="${x}" y1="${PAD}" x2="${x}" y2="${PAD + map.h}" stroke="#000" stroke-opacity="0.4" stroke-width="0.6"/>`);
  if (i < cols) out.push(`<text x="${PAD + (i + 0.5) * CELL_M}" y="18" text-anchor="middle" font-size="12" fill="#e6edf2">${colName(i)}</text>`);
}
for (let i = 0; i <= rows; i++) {
  const y = Math.min(PAD + i * CELL_M, PAD + map.h);
  out.push(`<line x1="${PAD}" y1="${y}" x2="${PAD + map.w}" y2="${y}" stroke="#000" stroke-opacity="0.4" stroke-width="0.6"/>`);
  if (i < rows) out.push(`<text x="13" y="${PAD + (i + 0.5) * CELL_M + 4}" text-anchor="middle" font-size="12" fill="#e6edf2">${i + 1}</text>`);
}

// Ký hiệu
const OWNER = (o: number): string => (o === 0 ? "#2e9eff" : o === 1 ? "#f23d3d" : "#ffffff");
for (const m of map.mines) {
  out.push(`<circle cx="${sx(m.x)}" cy="${sy(m.z)}" r="5" fill="${m.res === "oil" ? "#8a4fd0" : "#7fd0d8"}" stroke="${OWNER(m.owner)}" stroke-width="1.6"/>`);
  out.push(`<text x="${sx(m.x)}" y="${sy(m.z) + 3}" text-anchor="middle" font-size="8" font-weight="bold" fill="#111">${m.res === "oil" ? "D" : "S"}</text>`);
}
for (const [x, z] of map.points) out.push(`<rect x="${sx(x) - 5}" y="${sy(z) - 5}" width="10" height="10" transform="rotate(45 ${sx(x)} ${sy(z)})" fill="#ffb547" stroke="#111"/>`);
map.bases.forEach(([x, z], i) => {
  out.push(`<rect x="${sx(x) - 8}" y="${sy(z) - 8}" width="16" height="16" fill="${OWNER(i)}" stroke="#fff" stroke-width="1.5"/>`);
  out.push(`<text x="${sx(x)}" y="${sy(z) + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">HQ</text>`);
});
out.push(`</g></svg>`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out.join("\n"));

const res = { iron: "Sắt", oil: "Dầu" } as Record<string, string>;
const side = (o: number): string => (o === 0 ? "Lam" : o === 1 ? "Đỏ" : "trung lập");
console.log(`${map.def.name} (${ID}): ${map.w} × ${map.h} m, lưới ${cols} × ${rows} ô ${CELL_M} m. Hàng 1 là phía Bắc, cột A là phía Tây.`);
console.log(`Căn cứ: ${map.bases.map(([x, z], i) => `${i === 0 ? "Lam" : "Đỏ"} ${cellOf(x, z)}`).join(" · ")}`);
console.log(`Mỏ: ${map.mines.map((m) => `${res[m.res]} ${cellOf(m.x, m.z)} (${side(m.owner)})`).join(" · ")}`);
console.log(`Lối qua: ${map.crossings().map((c) => `${c.def.kind === "bridge" ? "Cầu" : "Bãi cạn"} ${cellOf(c.def.x, c.def.z)}`).join(" · ") || "không có"}`);
if (map.points.length) console.log(`Đài Liên Lạc: ${map.points.map(([x, z]) => cellOf(x, z)).join(" · ")}`);
console.log(`Đã ghi ${OUT}`);
