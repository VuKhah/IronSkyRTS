/**
 * Trạm Radar, bản 2 (09/11/2026), chân đế 4 × 4 m, theo phong cách của Tổng Hành Dinh.
 * Nhà máy tính bê tông nóc màu phe, tháp thép mang chảo radar lớn quay khi có điện: mất điện là chảo dừng, nhìn ra ngay.
 * Bộ phận động: chảo radar.
 */
import * as THREE from "three";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, rig, blinker, foundation, oct, strut, BASE_Y } from "./shared";

const ROOF = 2.2;
const PLATFORM = 6.2;

export function buildRadar(p: Palette): Rig {
  const root = group(foundation(p, 4, 4));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  add(part("Nhà máy tính", facets([...oct(1.75, 1.75, 0.4, BASE_Y), ...oct(1.5, 1.5, 0.34, ROOF - 0.14)], p.concrete)));
  add(part("Viền mái (màu phe)", facets([...oct(1.62, 1.62, 0.38, ROOF - 0.14), ...oct(1.62, 1.62, 0.38, ROOF)], p.team)));
  add(part("Cửa thép", box(0.8, 1.3, 0.05, p.hullDark, 0, BASE_Y + 0.65, 1.68)));
  for (const sx of [-1, 1]) add(part("Lưới tản nhiệt", box(0.05, 0.5, 1.5, p.hullDark, sx * 1.62, 1.5, 0)));

  // tháp thép 4 chân thu dần lên sàn đỡ chảo
  const FOOT = 1.15;
  const HEAD = 0.55;
  const widthAt = (y: number) => FOOT + ((HEAD - FOOT) * (y - ROOF)) / (PLATFORM - ROOF);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(part("Chân tháp", strut([sx * FOOT, ROOF, sz * FOOT], [sx * HEAD, PLATFORM, sz * HEAD], 0.07, p.metal)));
  const LEVELS = [ROOF, 3.5, 4.8, PLATFORM];
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const y0 = LEVELS[i]!;
    const y1 = LEVELS[i + 1]!;
    const a = widthAt(y0);
    const b = widthAt(y1);
    for (const s of [-1, 1]) {
      add(part("Thanh giằng", strut([-a, y0, s * a], [b, y1, s * b], 0.035, p.hullDark)));
      add(part("Thanh giằng", strut([s * a, y0, -a], [s * b, y1, b], 0.035, p.hullDark)));
    }
  }
  add(part("Sàn đỡ chảo", cyl(0.95, 0.8, 0.2, p.hullDark, 12, 0, PLATFORM + 0.1, 0)));

  // chảo: mặt trong và mặt ngoài đều thấy (chỏm cầu là mặt mỏng)
  const white = (p.white as THREE.MeshStandardMaterial).clone();
  white.side = THREE.DoubleSide;
  const head = part("Chảo radar", group(part("Trục chảo", cyl(0.16, 0.2, 0.9, p.metal, 8, 0, 0.45, 0))));
  const dish = part("Mặt chảo", new THREE.Mesh(new THREE.SphereGeometry(1.9, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), white));
  dish.rotation.x = -Math.PI / 2 - 0.4;
  dish.position.set(0, 1.45, 1.0);
  dish.castShadow = true;
  const feed = part("Cần thu sóng", cyl(0.05, 0.05, 1.4, p.metal, 5, 0, 1.2, 0.75));
  feed.rotation.x = 1.17;
  head.add(dish, feed, part("Đầu thu (màu phe)", sphere(0.15, p.teamGlow, 0, 1.5, 1.4, 8)));
  head.position.y = PLATFORM + 0.2;
  add(head);

  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const sx of [-1, 1]) add(part("Đèn báo", sphere(0.12, lamp, sx * 1.35, ROOF + 0.14, 1.35, 6)));
  let spin = 0;
  return rig(root, [WORK], 6.6, [
    (dt, _t, a) => {
      spin = approach(spin, a.has("work") ? 1.4 : 0, 2, dt);
      head.rotation.y += spin * dt;
    },
    blinker(lamp, 3)
  ]);
}
