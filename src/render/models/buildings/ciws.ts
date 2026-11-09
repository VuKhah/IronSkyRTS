import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, group, muzzleFlash, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { AIM, FIRE, rig, turretUpdate } from "./shared";

export function buildCIWS(p: Palette): Rig {
  const root = group(cyl(1.3, 1.5, 0.35, p.concrete, 10, 0, 0.17, 0), cyl(0.7, 0.85, 0.9, p.hullDark, 10, 0, 0.8, 0));
  const turret = group(box(1.1, 0.8, 1.2, p.hull, 0, 0.45, -0.1), box(1.12, 0.12, 1.22, p.team, 0, 0.88, -0.1));
  const dome = sphere(0.5, p.white, 0, 1.1, -0.1, 12);
  dome.scale.set(1, 1.2, 1);
  turret.add(dome, box(0.35, 0.5, 0.5, p.hullDark, 0.7, 0.45, -0.2));
  turret.position.y = 1.25;
  const gun = group();
  gun.position.set(0, 0.4, 0.5);
  const spin = group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = tubeZ(0.035, 0.035, 1.3, p.metal, 5);
    b.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.65);
    spin.add(b);
  }
  spin.add(cyl(0.16, 0.16, 0.12, p.hullDark, 8, 0, 0, 0.8).rotateX(Math.PI / 2), cyl(0.16, 0.16, 0.12, p.hullDark, 8, 0, 0, 0.2).rotateX(Math.PI / 2));
  const f = muzzleFlash(0.45, p.flash);
  f.position.z = 1.5;
  gun.add(spin, f);
  turret.add(gun);
  root.add(turret);
  const w = BUILDINGS["aa-ciws"].weapon!;
  let spinRate = 0;
  return rig(root, [AIM, FIRE], 2.2, [
    turretUpdate(turret, gun, [f], w.cooldown, 0.7),
    (dt, _t, a) => {
      spinRate = approach(spinRate, a.has("fire") ? 30 : 0, 3, dt);
      spin.rotation.z += spinRate * dt;
    }
  ], []);
}
