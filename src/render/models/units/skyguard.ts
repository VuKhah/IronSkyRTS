/** Mô hình SkyGuard (`skyguard`). */
import * as THREE from "three";
import { box, cyl, group, part, type Palette, type Rig } from "../kit";
import { vehicleRig, tracks } from "./ground";

export function buildSkyguard(p: Palette): Rig {
  const body = group();
  const tr = tracks(p, 0.95, 3.8, 0.28, 4);
  body.add(tr.g, box(1.5, 0.55, 3.5, p.hull, 0, 0.9, 0), part("Sọc màu phe", box(1.52, 0.1, 2.0, p.team, 0, 1.2, -0.5)));
  const turret = part("Mâm xoay", group(cyl(0.55, 0.65, 0.4, p.hullDark, 10, 0, 0.2, 0)));
  turret.position.set(0, 1.18, -0.2);
  const gun = group();
  gun.position.set(0, 0.6, 0);
  const muzzles: THREE.Object3D[] = [];
  const barrels: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pod = part(side < 0 ? "Hộp tên lửa trái (4 ống)" : "Hộp tên lửa phải (4 ống)", group(box(0.5, 0.5, 1.2, p.hull), box(0.52, 0.08, 1.22, p.team, 0, 0.27, 0)));
    pod.position.set(side * 0.62, 0, 0.1);
    for (const [dx, dy] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
      const hole = cyl(0.08, 0.08, 0.05, p.metal, 8, dx, dy, 0.6);
      hole.rotation.x = Math.PI / 2;
      pod.add(hole);
      const m = group();
      m.position.set(dx, dy, 0.65);
      pod.add(m);
      muzzles.push(m);
    }
    pod.userData.z0 = 0.1;
    barrels.push(pod);
    gun.add(pod);
  }
  // radar dò tìm phía sau tháp
  const radar = part("Radar dò tìm", group(box(0.9, 0.5, 0.06, p.hullDark), box(0.7, 0.35, 0.07, p.teamGlow, 0, 0, 0.01)));
  radar.position.set(0, 0.95, -0.45);
  turret.add(gun, part("Cột radar", cyl(0.05, 0.05, 0.5, p.metal, 6, 0, 0.65, -0.45)), radar);
  body.add(turret);
  return vehicleRig("skyguard", p, { body, wheels: tr.wheels, turret, gun, barrels, muzzles, flashes: [], spinners: [radar], aimPitch: 0.6, recoil: 0.05, missiles: true }, 3.2);
}
