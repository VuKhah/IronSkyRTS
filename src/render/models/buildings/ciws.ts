/**
 * Pháo Phòng Không CIWS, bản 2 (09/11/2026), chân đế 4 × 4 m, công sự.
 * Nét riêng: vòm radar trắng cao trên đỉnh, dưới là pháo 6 nòng xoay nòng khi bắn, trống đạn bên hông.
 * Bộ phận động: tháp, cụm nòng ngóc, chùm 6 nòng quay.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { approach, box, cyl, facets, group, muzzleFlash, part, sphere, tubeZ, type Palette, type Rig } from "../kit";
import { AIM, FIRE, rig, turretUpdate, fortBase, oct, BASE_Y, type AimRef } from "./shared";

const COLLAR = 2.3;

export function buildCIWS(p: Palette): Rig {
  const root = group(fortBase(p));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  add(part("Bệ bê tông", facets([...oct(1.5, 1.5, 0.45, BASE_Y), ...oct(1.2, 1.2, 0.36, 1.25)], p.concrete)));
  add(part("Viền bệ (màu phe)", facets([...oct(1.28, 1.28, 0.38, 1.25), ...oct(1.28, 1.28, 0.38, 1.4)], p.team)));
  add(part("Trụ thép", cyl(0.62, 0.78, COLLAR - 1.4, p.hull, 12, 0, (COLLAR + 1.4) / 2, 0)));
  add(part("Hộp điều khiển", box(0.9, 0.8, 0.3, p.hullDark, 0, 0.9, -1.33)));

  const turret = part(
    "Tháp pháo",
    group(
      part("Vành tháp", cyl(0.8, 0.86, 0.16, p.hullDark, 14, 0, 0.08, 0)),
      part("Thân tháp", facets([[0.68, 0.16, 0.6], [0.68, 0.16, -0.7], [0.56, 1.0, 0.5], [0.56, 1.0, -0.7]], p.hull, true)),
      part("Đai tháp (màu phe)", cyl(0.66, 0.66, 0.14, p.team, 16, 0, 1.08, -0.1)),
      part("Trống đạn", cyl(0.42, 0.42, 0.42, p.hullDark, 12, 0.9, 0.56, -0.2).rotateZ(Math.PI / 2)),
      part("Ống dẫn đạn", box(0.22, 0.14, 0.5, p.metal, 0.62, 0.72, 0.15))
    )
  );
  const dome = part("Vòm radar", sphere(0.68, p.white, 0, 1.78, -0.1, 16));
  dome.scale.set(1, 1.3, 1);
  turret.add(dome, part("Đỉnh vòm", cyl(0.1, 0.14, 0.14, p.hullDark, 8, 0, 2.68, -0.1)));
  turret.position.y = COLLAR;
  const gun = part("Cụm nòng", group());
  gun.position.set(0, 0.56, 0.65);
  const spin = part("Chùm 6 nòng", group());
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = part("Nòng pháo", tubeZ(0.045, 0.045, 1.8, p.metal, 5));
    b.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.9);
    spin.add(b);
  }
  spin.add(part("Vành giữ nòng", group(cyl(0.22, 0.22, 0.14, p.hullDark, 10, 0, 0, 1.45).rotateX(Math.PI / 2), cyl(0.22, 0.22, 0.14, p.hullDark, 10, 0, 0, 0.35).rotateX(Math.PI / 2))));
  const f = muzzleFlash(0.6, p.flash);
  f.position.z = 2.05;
  gun.add(spin, f);
  turret.add(gun);
  add(turret);
  const w = BUILDINGS["aa-ciws"].weapon!;
  const aim: AimRef = { yaw: null };
  let spinRate = 0;
  return rig(
    root,
    [AIM, FIRE],
    3.8,
    [
      turretUpdate(turret, gun, [f], w.cooldown, 0.7, 1.2, aim),
      (dt, _t, a) => {
        spinRate = approach(spinRate, a.has("fire") ? 30 : 0, 3, dt);
        spin.rotation.z += spinRate * dt;
      }
    ],
    [],
    aim
  );
}
