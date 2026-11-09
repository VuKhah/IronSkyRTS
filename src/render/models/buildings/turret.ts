/**
 * Tháp Phòng Thủ, bản 2 (09/11/2026), chân đế 4 × 4 m, công sự: nhiều tháp đặt sát nhau thì nền liền thành một tuyến.
 * Tháp bê tông vát có lỗ châu mai, trên là tháp thép xoay 360° với pháo kép 30mm; nóc màu phe.
 * Bộ phận động: tháp pháo, cụm nòng.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, group, muzzleFlash, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { AIM, FIRE, rig, turretUpdate, fortBase, oct, BASE_Y, type AimRef } from "./shared";

const TOP = 2.9;
const RING_Y = 3.05;

export function buildTurret(p: Palette): Rig {
  const root = group(fortBase(p));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  add(part("Tháp bê tông", facets([...oct(1.72, 1.72, 0.5, BASE_Y), ...oct(1.38, 1.38, 0.42, TOP)], p.concrete)));
  add(part("Viền tháp (màu phe)", facets([...oct(1.5, 1.5, 0.45, TOP), ...oct(1.5, 1.5, 0.45, RING_Y)], p.team)));
  // vách vát 0,128 rad: lỗ châu mai nghiêng theo vách
  for (const sx of [-1, 1]) {
    const side = part("Lỗ châu mai", box(0.06, 0.3, 1.2, p.hullDark, sx * 1.46, 2.2, 0));
    side.rotation.z = sx * 0.128;
    const face = part("Lỗ châu mai", box(1.2, 0.3, 0.06, p.hullDark, 0, 2.2, sx * 1.46));
    face.rotation.x = -sx * 0.128;
    add(side, face);
  }
  add(part("Cửa thép", box(0.8, 1.5, 0.06, p.hullDark, 0, BASE_Y + 0.75, -1.67)));
  add(part("Khung cửa", box(1.0, 0.1, 0.1, p.warning, 0, BASE_Y + 1.56, -1.66)));

  const turret = part(
    "Tháp pháo",
    group(
      part("Vành tháp", cyl(1.0, 1.1, 0.2, p.hullDark, 14, 0, 0.1, 0)),
      part("Thân tháp", facets([[0.88, 0.2, 0.95], [0.88, 0.2, -1.0], [0.68, 1.0, 0.6], [0.68, 1.0, -0.9]], p.hull, true)),
      part("Nóc tháp (màu phe)", box(1.2, 0.05, 1.3, p.team, 0, 1.02, -0.15)),
      part("Hộp đạn", box(1.3, 0.55, 0.42, p.hullDark, 0, 0.55, -1.1)),
      part("Kính ngắm", group(box(0.3, 0.26, 0.3, p.hullDark, 0.42, 1.16, -0.35), box(0.24, 0.12, 0.02, p.glass, 0.42, 1.18, -0.19))),
      part("Ăng-ten", cyl(0.02, 0.03, 1.1, p.metal, 5, -0.5, 1.56, -0.7)),
      part("Đèn hiệu", sphere(0.07, p.teamGlow, -0.5, 2.14, -0.7, 6))
    )
  );
  turret.position.y = RING_Y;
  const gun = part("Cụm nòng", group(part("Bệ nòng", box(1.0, 0.46, 0.3, p.hullDark, 0, 0, 0))));
  gun.position.set(0, 0.56, 0.95);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.28, 0.28]) {
    const b = part("Nòng pháo", tubeZ(0.08, 0.1, 1.5, p.metal, 8));
    b.position.set(x, 0, 0.75);
    const brake = part("Đầu hãm nòng", tubeZ(0.12, 0.12, 0.26, p.hullDark, 8));
    brake.position.set(x, 0, 1.5);
    const f = muzzleFlash(0.55, p.flash);
    f.position.set(x, 0, 1.78);
    gun.add(b, brake, f);
    flashes.push(f);
  }
  turret.add(gun);
  add(turret);
  const w = BUILDINGS.turret.weapon!;
  const aim: AimRef = { yaw: null };
  return rig(root, [AIM, FIRE], 3.8, [turretUpdate(turret, gun, flashes, w.cooldown, 0.12, 1.4, aim)], [], aim);
}
