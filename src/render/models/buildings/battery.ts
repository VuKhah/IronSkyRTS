/**
 * Trạm Tích Điện, bản 2 (09/11/2026), chân đế 4 × 4 m, theo phong cách của Tổng Hành Dinh.
 * 6 khoang pin lớn nắp màu phe, cột chỉ báo cao ở phía trước sáng theo % pin (nhìn từ xa biết còn bao nhiêu điện),
 * tia điện chạy trên nóc khi nạp hoặc xả. Bộ phận động: mức pin, tia điện.
 */
import * as THREE from "three";
import { box, cyl, group, part, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, strut, BASE_Y } from "./shared";

const CELL_H = 2.1;
const GAUGE_Z = 1.3;
const GAUGE_H = 3.3;

export function buildBattery(p: Palette): Rig {
  const root = group(foundation(p, 4, 4));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  const COLS = [-1.22, 0, 1.22];
  const ROWS = [-1.3, -0.1];
  for (const x of COLS)
    for (const z of ROWS) {
      add(part("Khoang pin", box(1.08, CELL_H, 1.08, p.hullDark, x, BASE_Y + CELL_H / 2, z)));
      add(part("Nắp khoang (màu phe)", box(1.12, 0.14, 1.12, p.team, x, BASE_Y + CELL_H + 0.07, z)));
      add(part("Vạch khoang", box(0.8, 0.08, 0.03, p.warning, x, BASE_Y + 1.5, z + 0.55)));
      for (const sx of [-1, 1]) add(part("Cực pin", cyl(0.09, 0.11, 0.26, p.metal, 8, x + sx * 0.26, BASE_Y + CELL_H + 0.27, z)));
    }
  // thanh nối các khoang theo từng hàng
  for (const z of ROWS) add(part("Thanh nối", box(3.3, 0.06, 0.1, p.metal, 0, BASE_Y + CELL_H + 0.3, z)));

  // cột chỉ báo: khung thép 4 trụ, lõi sáng cao dần theo % pin
  const G = 0.42;
  add(part("Đế cột chỉ báo", box(1.3, 0.3, 1.0, p.hull, 0, BASE_Y + 0.15, GAUGE_Z)));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(part("Khung cột chỉ báo", strut([sx * G, BASE_Y + 0.3, GAUGE_Z + sz * G * 0.7], [sx * G, BASE_Y + GAUGE_H, GAUGE_Z + sz * G * 0.7], 0.05, p.metal)));
  // đỉnh cột để hở (chỉ có khung màu phe): nhìn từ trên cao vẫn thấy lõi sáng
  for (const sz of [-1, 1]) add(part("Khung đỉnh cột (màu phe)", box(1.08, 0.1, 0.12, p.team, 0, BASE_Y + GAUGE_H + 0.05, GAUGE_Z + sz * G * 0.7)));
  for (const sx of [-1, 1]) add(part("Khung đỉnh cột (màu phe)", box(0.12, 0.1, 0.7, p.team, sx * G, BASE_Y + GAUGE_H + 0.05, GAUGE_Z)));
  const level = part("Mức pin", box(0.56, GAUGE_H - 0.4, 0.42, glow, 0, 0, GAUGE_Z));
  level.geometry.translate(0, (GAUGE_H - 0.4) / 2, 0);
  level.position.y = BASE_Y + 0.35;
  add(level);
  for (const sx of [-1, 1]) add(part("Tủ điều khiển", box(0.5, 1.2, 0.8, p.hull, sx * 1.42, BASE_Y + 0.6, GAUGE_Z)));

  const sparks = part("Tia điện", group());
  for (const x of COLS) sparks.add(box(0.06, 0.06, 2.0, glow, x, BASE_Y + CELL_H + 0.45, -0.7));
  add(sparks);

  let lv = 0;
  let target = 0;
  const r = rig(root, [WORK], 4, [
    (_dt, t, a) => {
      lv += (target - lv) * 0.1;
      level.scale.y = Math.max(0.03, lv);
      sparks.visible = a.has("work") && Math.sin(t * 18) > -0.2;
      glow.emissiveIntensity = 0.6 + lv * 1.6;
    }
  ]);
  r.setLevel = (k) => (target = Math.max(0, Math.min(1, k)));
  r.setLevel(0.7);
  return r;
}
