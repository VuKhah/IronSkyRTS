/**
 * Báo cáo một mô hình 3D bằng chữ, chạy trong Node, để kiểm kích thước và lỗi hình học mà không cần chụp ảnh.
 *
 *   npm run model-report -- <mã> [--act deploy,aim] [--t 3] [--do] [--all]
 *
 * --act  hoạt ảnh bật khi đo (mặc định: hoạt ảnh bật sẵn của mô hình).
 * --t    cho hoạt ảnh chạy chừng này giây trước khi đo (đo trạng thái cuối của hoạt ảnh dài).
 * --do   dựng phe Đỏ. --all  liệt kê đầy đủ, không cắt bớt danh sách.
 */
import * as THREE from "three";
import { getSpec, type EntityId } from "../sim/content";
import { buildModel } from "../render/models";
import { bakeStatic } from "../render/models/bake";
import { isEffect, localBox, partOf, shownIn } from "../models-page/stage";

const args = process.argv.slice(2);
const id = args[0] as EntityId | undefined;
if (!id || id.startsWith("--")) throw new Error("Cách dùng: npm run model-report -- <mã> [--act a,b] [--t giây] [--do] [--all]");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const faction = args.includes("--do") ? "do" : "lam";
const showAll = args.includes("--all");
const LIMIT = showAll ? Infinity : 12;
const TOUCH = 0.06; // hai khối cách nhau dưới chừng này (m) coi như chạm nhau
const MIRROR = 0.08; // sai số khi so đối xứng trái / phải (m)

const f = (n: number): string => n.toFixed(2);
const size = (b: THREE.Box3): string => {
  const s = b.getSize(new THREE.Vector3());
  return `rộng ${f(s.x)} · dài ${f(s.z)} · cao ${f(s.y)}`;
};

const rig = buildModel(id, faction, true);
const actArg = opt("act");
const active = new Set(actArg ? actArg.split(",") : rig.defaultOn);
const seconds = Number(opt("t") ?? 0.05);
for (let t = 0; t < seconds; t += 0.05) rig.update(0.05, t, active);
rig.root.updateMatrixWorld(true);

interface Item {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  name: string;
}
const inv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert();
const items: Item[] = [];
const mats = new Set<THREE.Material>();
let tris = 0;
let hidden = 0;
let effects = 0;
rig.root.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  if (!shownIn(o, rig.root)) return void hidden++;
  if (isEffect(o)) return void effects++;
  const g = o.geometry as THREE.BufferGeometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const box = g.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
  items.push({ mesh: o, box, name: String(partOf(o, rig.root)?.userData.part ?? "(không tên)") });
  tris += (g.index ? g.index.count : g.getAttribute("position").count) / 3;
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
});

const baked = bakeStatic(buildModel(id, faction, false));
const whole = localBox(rig.root, rig.root);
const spec = getSpec(id);

console.log(`== ${spec.name} (${id}), hoạt ảnh: ${[...active].join(", ") || "không"}, sau ${f(seconds)} giây`);
console.log(`Kích thước: ${size(whole)} m`);
console.log(`Thấp nhất y = ${f(whole.min.y)} · cao nhất y = ${f(whole.max.y)} · x ${f(whole.min.x)}..${f(whole.max.x)} · z ${f(whole.min.z)}..${f(whole.max.z)} (mũi là +z)`);
console.log(`Bán kính khung hình rig: ${f(rig.radius)}${"radius" in spec ? ` · bán kính sim: ${f(spec.radius as number)}` : ""}`);
console.log(`Khối: ${items.length} (ẩn ${hidden}, hiệu ứng ${effects}) · tam giác: ${Math.round(tris)} · vật liệu: ${mats.size} · lệnh vẽ sau khi gộp: ${baked.before} → ${baked.after}`);
console.log(`Hoạt ảnh có: ${rig.actions.map((a) => a.id).join(", ") || "không"}`);

// Bộ phận có tên
const groups = new Map<THREE.Object3D, number>();
rig.root.traverse((o) => {
  if (o.userData.part) groups.set(o, 0);
});
for (const it of items) {
  const p = partOf(it.mesh, rig.root);
  if (p) groups.set(p, (groups.get(p) ?? 0) + 1);
}
console.log(`\nBộ phận có tên (${groups.size}):`);
const rows = [...groups.entries()]
  .map(([o, n]) => ({ name: String(o.userData.part), n, b: localBox(o, rig.root, true) }))
  .filter((r) => !r.b.isEmpty() && r.n > 0);
// Mặc định gộp các bộ phận cùng tên và cùng cỡ (4 bánh xe in một dòng) để báo cáo ngắn; --all in từng cái kèm tâm.
const line = (r: (typeof rows)[number]): string => {
  const c = r.b.getCenter(new THREE.Vector3());
  return `  ${r.name}: ${size(r.b)} · tâm (${f(c.x)}, ${f(c.y)}, ${f(c.z)}) · ${r.n} khối`;
};
if (showAll) rows.forEach((r) => console.log(line(r)));
else {
  const same = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    const key = `${r.name}|${size(r.b)}`;
    same.set(key, [...(same.get(key) ?? []), r]);
  }
  const lines = [...same.values()];
  lines.slice(0, 30).forEach((g) => console.log(g.length > 1 ? `  ${g[0].name} ×${g.length}: ${size(g[0].b)}` : line(g[0])));
  if (lines.length > 30) console.log(`  … còn ${lines.length - 30} loại bộ phận, thêm --all để xem hết`);
}

// Chi tiết lơ lửng: gom các khối chạm nhau thành cụm, cụm nhỏ tách khỏi cụm lớn nhất là nghi lơ lửng.
const parent = items.map((_, i) => i);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const grown = items.map((it) => it.box.clone().expandByScalar(TOUCH));
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (grown[i].intersectsBox(items[j].box)) parent[find(i)] = find(j);
const clusters = new Map<number, Item[]>();
items.forEach((it, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), it]));
const sorted = [...clusters.values()].sort((a, b) => b.length - a.length);
const floating = sorted.slice(1);
console.log(`\nCụm khối tách rời: ${floating.length}${floating.length ? " (hộp bao không chạm cụm chính, có thể cố ý với bộ phận bay hoặc khớp ẩn)" : ""}`);
floating.slice(0, LIMIT).forEach((c) => {
  const b = c.reduce((a, it) => a.union(it.box), new THREE.Box3());
  console.log(`  ${[...new Set(c.map((it) => it.name))].join(", ")}: ${c.length} khối, tâm y = ${f(b.getCenter(new THREE.Vector3()).y)}, ${size(b)}`);
});

// Đối xứng trái / phải: khối lệch tâm phải có một khối soi gương qua mặt x = 0.
const center = (b: THREE.Box3): THREE.Vector3 => b.getCenter(new THREE.Vector3());
const dims = (b: THREE.Box3): THREE.Vector3 => b.getSize(new THREE.Vector3());
const unmatched = items.filter((a) => {
  const ca = center(a.box);
  if (Math.abs(ca.x) < MIRROR) return false;
  const da = dims(a.box);
  return !items.some((b) => {
    const cb = center(b.box);
    const db = dims(b.box);
    return Math.abs(ca.x + cb.x) < MIRROR && Math.abs(ca.y - cb.y) < MIRROR && Math.abs(ca.z - cb.z) < MIRROR && da.distanceTo(db) < MIRROR * 2;
  });
});
const names = new Map<string, number>();
for (const it of unmatched) names.set(it.name, (names.get(it.name) ?? 0) + 1);
console.log(`\nKhối không có khối đối xứng trái / phải: ${unmatched.length}${unmatched.length ? " (bộ phận đang xoay theo hoạt ảnh cũng tính vào đây)" : ""}`);
[...names.entries()].slice(0, LIMIT).forEach(([n, c]) => console.log(`  ${n}: ${c} khối`));

// Dưới mặt đất và bộ phận chưa đặt tên
const under = items.filter((it) => it.box.min.y < -0.05);
if (under.length) console.log(`\nKhối chui xuống dưới mặt đất (y < -0,05): ${[...new Set(under.map((it) => it.name))].slice(0, LIMIT).join(", ")}`);
const root = String(rig.root.userData.part);
const generic = items.filter((it) => it.name === root).length;
console.log(`\nKhối chưa có tên riêng (rê chuột chỉ hiện tên cả mô hình): ${generic}`);
