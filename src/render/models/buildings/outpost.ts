import { BUILDINGS } from "../../../sim/content";
import { box, cyl, group, muzzleFlash, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, AIM, FIRE, rig, groundRing, turretUpdate, type AimRef } from "./shared";

export function buildOutpost(p: Palette): Rig {
  const root = group(cyl(2.6, 2.8, 0.3, p.concrete, 6, 0, 0.15, 0));
  root.add(cyl(1.9, 2.2, 1.3, p.hull, 6, 0, 0.95, 0), cyl(1.95, 1.95, 0.18, p.team, 6, 0, 1.55, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const slit = box(0.6, 0.12, 0.1, p.metal, Math.sin(a) * 2.02, 1.1, Math.cos(a) * 2.02);
    slit.rotation.y = a;
    root.add(slit);
  }
  const pole = cyl(0.04, 0.05, 2.6, p.metal, 5, -1.3, 2.9, -1.0);
  const flag = group(box(0.9, 0.5, 0.03, p.team, 0.45, 0, 0));
  flag.position.set(-1.3, 3.95, -1.0);
  root.add(pole, flag);
  const turret = group(cyl(0.6, 0.7, 0.35, p.hullDark, 8, 0, 0.18, 0), box(0.7, 0.35, 0.8, p.hull, 0, 0.5, 0));
  turret.position.y = 1.65;
  const gun = group();
  gun.position.set(0, 0.5, 0.35);
  const b = tubeZ(0.08, 0.08, 1.2, p.metal, 8);
  b.position.z = 0.6;
  const f = muzzleFlash(0.5, p.flash);
  f.position.z = 1.45;
  gun.add(b, f);
  turret.add(gun);
  root.add(turret);
  const ring = groundRing(p, 4.2, "capture");
  root.add(ring.mesh);
  const aim: AimRef = { yaw: null };
  return rig(
    root,
    [WORK, AIM, FIRE, { id: "capture", label: "Vùng chiếm đóng" }],
    3.4,
    [(_dt, t, a) => (flag.rotation.y = a.has("work") ? Math.sin(t * 3) * 0.35 : 0), turretUpdate(turret, gun, [f], BUILDINGS.outpost.weapon!.cooldown, 0.08, 2.5, aim), ring.update],
    ["work"],
    aim
  );
}
