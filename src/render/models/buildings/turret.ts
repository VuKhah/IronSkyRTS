import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, group, muzzleFlash, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { AIM, FIRE, rig, turretUpdate, type AimRef } from "./shared";

/** Tháp Phòng Thủ: bệ bê tông, tháp bọc giáp xoay 360° với pháo kép tự động. */
export function buildTurret(p: Palette): Rig {
  const root = group(cyl(1.55, 1.7, 0.4, p.concrete, 8, 0, 0.2, 0), cyl(1.0, 1.2, 1.1, p.hullDark, 8, 0, 0.95, 0), cyl(1.05, 1.05, 0.14, p.team, 8, 0, 1.45, 0));
  const turret = group(box(1.3, 0.65, 1.5, p.hull, 0, 0.35, -0.1), box(1.32, 0.12, 1.52, p.team, 0, 0.7, -0.1), box(0.4, 0.3, 0.4, p.hullDark, 0.45, 0.85, -0.45));
  const front = box(1.1, 0.5, 0.4, p.hullDark, 0, 0.32, 0.72);
  front.rotation.x = -0.35;
  turret.add(front, cyl(0.03, 0.03, 0.7, p.metal, 4, -0.45, 1.0, -0.5), sphere(0.06, p.teamGlow, -0.45, 1.36, -0.5, 6));
  turret.position.y = 1.5;
  const gun = group();
  gun.position.set(0, 0.42, 0.75);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.22, 0.22]) {
    const b = tubeZ(0.065, 0.075, 1.25, p.metal, 8);
    b.position.set(x, 0, 0.6);
    const f = muzzleFlash(0.45, p.flash);
    f.position.set(x, 0, 1.45);
    gun.add(b, f);
    flashes.push(f);
  }
  turret.add(gun);
  root.add(turret);
  const w = BUILDINGS.turret.weapon!;
  const aim: AimRef = { yaw: null };
  return rig(root, [AIM, FIRE], 2.2, [turretUpdate(turret, gun, flashes, w.cooldown, 0.12, 1.4, aim)], [], aim);
}
