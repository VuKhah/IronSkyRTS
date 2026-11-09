import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, group, muzzleFlash, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, AIM, FIRE, POWER, rig, foundation, groundRing, blinker, turretUpdate, type AimRef } from "./shared";

export function buildHQ(p: Palette): Rig {
  const root = group(foundation(p, 6.6, 6.6));
  root.add(
    box(4.6, 2.2, 4.6, p.hull, 0, 1.35, 0),
    box(4.64, 0.3, 4.64, p.team, 0, 2.3, 0),
    box(2.4, 1.6, 2.4, p.hullDark, -0.6, 3.25, -0.6),
    box(2.44, 0.25, 0.08, p.glass, -0.6, 3.5, 0.62),
    box(0.08, 0.25, 2.44, p.glass, 0.62, 3.5, -0.6),
    box(1.4, 1.0, 0.1, p.metal, 0, 0.75, 2.33),
    box(1.5, 0.12, 0.2, p.warning, 0, 1.32, 2.36)
  );
  const lamp = (p.teamGlow.clone() as THREE.MeshStandardMaterial);
  root.add(cyl(0.05, 0.05, 1.8, p.metal, 4, -1.5, 4.9, -1.5), sphere(0.12, lamp, -1.5, 5.85, -1.5));
  const dish = group(cyl(0.1, 0.1, 0.4, p.metal, 6, 0, 0.2, 0), box(1.6, 0.08, 0.7, p.hullDark, 0, 0.45, 0), box(0.2, 0.25, 0.2, p.teamGlow, 0, 0.6, 0.1));
  dish.position.set(-0.6, 4.05, -0.6);
  root.add(dish);
  // pháo kép tự vệ ở góc trước
  const turret = group(cyl(0.55, 0.65, 0.4, p.hullDark, 10, 0, 0.2, 0), box(0.8, 0.4, 0.9, p.hull, 0, 0.55, 0));
  turret.position.set(1.3, 2.45, 1.3);
  const gun = group();
  gun.position.set(0, 0.55, 0.4);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.18, 0.18]) {
    const b = tubeZ(0.07, 0.07, 1.1, p.metal, 8);
    b.position.set(x, 0, 0.55);
    const f = muzzleFlash(0.5, p.flash);
    f.position.set(x, 0, 1.35);
    gun.add(b, f);
    flashes.push(f);
  }
  turret.add(gun);
  root.add(turret);
  const ring = groundRing(p, 6.2, "power");
  root.add(ring.mesh);
  const w = BUILDINGS.hq.weapon!;
  const aim: AimRef = { yaw: null };
  return rig(
    root,
    [WORK, AIM, FIRE, POWER],
    4.6,
    [(dt, _t, a) => a.has("work") && (dish.rotation.y += dt * 1.4), blinker(lamp, 5), turretUpdate(turret, gun, flashes, w.cooldown, 0.1, 1.2, aim), ring.update],
    ["work"],
    aim
  );
}
