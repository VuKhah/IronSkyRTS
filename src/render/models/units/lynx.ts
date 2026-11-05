/** Mô hình Lynx (`lynx`). */
import * as THREE from "three";
import { box, cyl, group, muzzleFlash, part, wheel, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel } from "./ground";

export function buildLynx(p: Palette): Rig {
  const body = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of [1.05, -1.05]) {
      const w = wheel(0.42, 0.34, p.rubber, p.metal);
      w.position.set(side * 0.95, 0.42, z);
      body.add(w);
      wheels.push({ g: w, r: 0.42 });
    }
  const nose = part("Mũi vát", box(1.6, 0.4, 0.9, p.hull, 0, 0.78, 1.55));
  nose.rotation.x = 0.35;
  body.add(
    box(1.7, 0.6, 2.8, p.hull, 0, 0.8, -0.1),
    nose,
    part("Sọc màu phe", box(1.74, 0.1, 1.6, p.team, 0, 1.12, -0.5)),
    part("Đèn pha", group(box(0.25, 0.12, 0.05, p.glass, -0.55, 0.85, 1.95), box(0.25, 0.12, 0.05, p.glass, 0.55, 0.85, 1.95)))
  );
  const turret = part("Tháp súng máy 20mm", group(box(0.85, 0.34, 1.0, p.hullDark, 0, 0.17, 0), box(0.5, 0.1, 0.5, p.team, 0, 0.38, -0.15)));
  turret.position.set(0, 1.12, -0.2);
  const gun = group();
  gun.position.set(0, 0.2, 0.45);
  const b = barrel(1.05, 0.045, p.metal);
  const f = muzzleFlash(0.35, p.flash);
  f.position.z = 1.2;
  b.add(f);
  gun.add(b);
  turret.add(gun, part("Ăng-ten", cyl(0.015, 0.015, 1.0, p.metal, 4, -0.32, 0.65, -0.4)));
  body.add(turret);
  return vehicleRig("lynx", p, { body, wheels, turret, gun, barrels: [b], muzzles: [b], flashes: [f], spinners: [], aimPitch: 0.08, recoil: 0.08 }, 2.6);
}
