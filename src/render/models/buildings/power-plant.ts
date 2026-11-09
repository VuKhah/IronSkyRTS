/**
 * Nhà Máy Điện, bản 2 (09/11/2026), theo phong cách của Tổng Hành Dinh.
 * Đốt Dầu phát điện: tháp giải nhiệt tròn lớn (nhìn từ trên là vòng màu phe, khác hẳn các nhà hình hộp), nhà tua-bin,
 * bồn Dầu và ống dẫn, cuộn cảm sáng theo tải, cột điện đưa điện đi. Bộ phận động: 2 quạt, hơi nước.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, POWER, rig, foundation, groundRing, oct, strut, BASE_Y, type P3 } from "./shared";

const TOWER_X = -1.4;
const TOWER_Y0 = 0.72;
const TOWER_H = 5.9;
const HALL_X = 1.55;
const ROOF_Y = 3.92;

export function buildPowerPlant(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["power-plant"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);

  // ================================================================ 1. THÁP GIẢI NHIỆT (LatheGeometry: xoay một đường cong quanh trục Y)
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const k = i / 18;
    const r = k < 0.72 ? 0.95 + 0.65 * (1 - k / 0.72) ** 2 : 0.95 + 0.45 * ((k - 0.72) / 0.28) ** 2;
    profile.push(new THREE.Vector2(r, k * TOWER_H));
  }
  const tower = part("Tháp giải nhiệt", new THREE.Mesh(new THREE.LatheGeometry(profile, 22), p.concrete));
  tower.castShadow = tower.receiveShadow = true;
  tower.position.set(TOWER_X, TOWER_Y0, 0);
  add(tower);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const b = ((i + 1) * Math.PI) / 6;
    const foot: P3 = [TOWER_X + Math.sin(a) * 1.58, BASE_Y, Math.cos(a) * 1.58];
    const top: P3 = [TOWER_X + Math.sin(b) * 1.56, TOWER_Y0 + 0.03, Math.cos(b) * 1.56];
    add(part("Chân tháp", strut(foot, top, 0.06, p.hullDark)));
  }
  const topY = TOWER_Y0 + TOWER_H;
  add(part("Vành miệng tháp (màu phe)", cyl(1.5, 1.45, 0.16, p.team, 22, TOWER_X, topY, 0)));
  add(part("Lòng tháp", cyl(1.24, 1.24, 0.04, p.hullDark, 22, TOWER_X, topY + 0.08, 0)));

  // ================================================================ 2. NHÀ TUA-BIN
  add(part("Bệ nhà tua-bin", facets([...oct(1.4, 2.05, 0.3, BASE_Y, 0, HALL_X), ...oct(1.35, 2.0, 0.3, 1.2, 0, HALL_X)], p.concrete)));
  add(part("Nhà tua-bin", facets([...oct(1.3, 1.95, 0.3, 1.2, 0, HALL_X), ...oct(1.25, 1.9, 0.3, 3.7, 0, HALL_X)], p.hull)));
  add(part("Viền mái (màu phe)", facets([...oct(1.4, 2.05, 0.32, 3.7, 0, HALL_X), ...oct(1.4, 2.05, 0.32, 3.86, 0, HALL_X)], p.team)));
  add(part("Mái nhà tua-bin", facets([...oct(1.15, 1.8, 0.26, 3.86, 0, HALL_X), ...oct(1.15, 1.8, 0.26, ROOF_Y, 0, HALL_X)], p.concreteDark)));
  add(part("Dải cửa sổ", box(0.04, 0.5, 2.6, p.glass, HALL_X + 1.29, 2.9, 0)));
  for (const x of [HALL_X - 0.7, HALL_X, HALL_X + 0.7]) add(part("Cửa sổ", box(0.5, 0.5, 0.04, p.glass, x, 3.0, 1.94)));
  add(part("Cửa nhà máy", box(1.0, 1.9, 0.06, p.hullDark, HALL_X, BASE_Y + 0.95, 2.06)));
  for (let i = 0; i < 3; i++) add(part("Sọc cảnh báo", box(0.34, 0.14, 0.05, i % 2 ? p.hullDark : p.warning, HALL_X - 0.34 + i * 0.34, BASE_Y + 2.0, 2.08)));

  // vỏ tua-bin nằm dọc trên mái + ống xả đốt Dầu
  const HUMP_X = 1.0;
  add(part("Vỏ tua-bin", cyl(0.5, 0.5, 2.6, p.hull, 14, HUMP_X, ROOF_Y + 0.05, -0.2).rotateX(Math.PI / 2)));
  for (const z of [-1.05, -0.2, 0.65]) add(part("Đai tua-bin (màu phe)", cyl(0.52, 0.52, 0.1, p.team, 14, HUMP_X, ROOF_Y + 0.05, z).rotateX(Math.PI / 2)));
  add(part("Ống xả đốt Dầu", cyl(0.16, 0.2, 1.6, p.hullDark, 10, HUMP_X, ROOF_Y + 0.8, -1.72)));
  add(part("Miệng ống xả", cyl(0.2, 0.18, 0.1, p.metal, 10, HUMP_X, ROOF_Y + 1.62, -1.72)));

  // cuộn cảm sáng theo tải, sứ cách điện phía trên
  const LANE_X = 2.15;
  const coil = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const z of [1.3, 0.8, 0.3]) {
    add(part("Cuộn cảm", cyl(0.2, 0.2, 0.6, coil, 8, LANE_X, ROOF_Y + 0.3, z)));
    add(part("Sứ cách điện", group(cyl(0.05, 0.08, 0.34, p.white, 8, LANE_X, ROOF_Y + 0.77, z), sphere(0.06, p.metal, LANE_X, ROOF_Y + 0.97, z, 6))));
  }
  const fans: THREE.Group[] = [];
  for (const z of [-0.45, -1.25]) {
    add(part("Vỏ quạt", cyl(0.42, 0.42, 0.14, p.hullDark, 16, LANE_X, ROOF_Y + 0.07, z)));
    const fan = part("Cánh quạt", group(box(0.74, 0.04, 0.14, p.metal), box(0.14, 0.04, 0.74, p.metal)));
    fan.position.set(LANE_X, ROOF_Y + 0.17, z);
    fans.push(fan);
    add(fan);
  }

  // ================================================================ 3. BỒN DẦU VÀ ỐNG DẪN, CỘT ĐIỆN Ở CÁC GÓC QUANH THÁP
  const TANK: [number, number] = [-2.5, -1.72];
  add(part("Bồn Dầu", cyl(0.5, 0.5, 1.9, p.hull, 14, TANK[0], BASE_Y + 0.95, TANK[1])));
  add(part("Nắp bồn (màu phe)", cyl(0.52, 0.46, 0.12, p.team, 14, TANK[0], BASE_Y + 1.96, TANK[1])));
  add(part("Đai bồn", cyl(0.52, 0.52, 0.1, p.hullDark, 14, TANK[0], BASE_Y + 1.2, TANK[1])));
  add(part("Ống dẫn Dầu", strut([TANK[0] + 0.45, 0.72, -2.1], [0.3, 0.72, -2.1], 0.07, p.metal)));
  for (const x of [-1.5, -0.4]) add(part("Giá ống", box(0.1, 0.46, 0.1, p.hullDark, x, 0.48, -2.1)));
  const PY: [number, number] = [-2.55, 1.75];
  const PY_TOP = 4.6;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(part("Cột điện ra", strut([PY[0] + sx * 0.32, BASE_Y, PY[1] + sz * 0.32], [PY[0] + sx * 0.08, PY_TOP, PY[1] + sz * 0.08], 0.04, p.metal)));
  add(part("Xà cột điện", box(1.1, 0.08, 0.08, p.hullDark, PY[0], PY_TOP - 0.1, PY[1])));
  for (const sx of [-1, 1]) add(part("Sứ cách điện", cyl(0.04, 0.07, 0.24, p.white, 8, PY[0] + sx * 0.5, PY_TOP + 0.05, PY[1])));

  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const s = sphere(0.45, p.smoke, TOWER_X, topY + 0.2, 0, 8);
    s.castShadow = false;
    s.userData.phase = i / 6;
    puffs.push(s);
    add(s);
  }
  const ring = groundRing(p, 5.5, "power");
  add(ring.mesh);
  return rig(root, [WORK, POWER], 5.8, [
    (dt, t, a) => {
      const on = a.has("work");
      if (on) for (const f of fans) f.rotation.y += dt * 9;
      coil.emissiveIntensity = on ? 1.2 + Math.sin(t * 6) * 0.6 : 0.3;
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.25 + (s.userData.phase as number)) % 1;
        s.position.set(TOWER_X + k * 0.6, topY + 0.2 + k * 2.6, k * 0.3);
        s.scale.setScalar(0.6 + k * 1.5);
      }
    },
    ring.update
  ]);
}
