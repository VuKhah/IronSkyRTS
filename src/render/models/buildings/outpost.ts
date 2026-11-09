/**
 * Tiền Đồn, bản 2 (09/11/2026), chân đế cỡ vừa 4,8 × 6,4 m, theo phong cách của Tổng Hành Dinh.
 * Căn cứ tiền tuyến để chiếm: hầm bê tông thấp, pháo tự động trên mái nhìn về trước, tháp canh cao có đài kính ở sau, cờ lớn màu phe.
 * Bộ phận động: tháp pháo, nòng, lá cờ.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, group, muzzleFlash, part, tubeZ, type Palette, type Rig } from "../kit";
import { WORK, AIM, FIRE, rig, foundation, groundRing, turretUpdate, oct, strut, BASE_Y, type AimRef } from "./shared";

const ROOF = 2.5;
const TOWER_Z = -1.9;

export function buildOutpost(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS.outpost.half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);

  // ================================================================ 1. HẦM BÊ TÔNG
  add(part("Hầm bê tông", facets([...oct(2.2, 3.0, 0.5, BASE_Y), ...oct(1.85, 2.65, 0.42, ROOF - 0.2)], p.concrete)));
  add(part("Viền mái (màu phe)", facets([...oct(1.98, 2.78, 0.45, ROOF - 0.2), ...oct(1.98, 2.78, 0.45, ROOF)], p.team)));
  add(part("Mái hầm", facets([...oct(1.75, 2.55, 0.36, ROOF), ...oct(1.75, 2.55, 0.36, ROOF + 0.06)], p.concreteDark)));
  for (const sx of [-1, 1])
    for (const z of [-1.3, 0.3, 1.8]) {
      const slit = part("Lỗ châu mai", box(0.06, 0.26, 0.9, p.hullDark, sx * 1.96, 1.8, z));
      slit.rotation.z = sx * 0.17;
      add(slit);
    }
  add(part("Cửa hầm", box(1.3, 1.6, 0.06, p.hullDark, 0, BASE_Y + 0.8, 2.96)));
  for (let i = 0; i < 5; i++) add(part("Sọc cảnh báo", box(0.32, 0.16, 0.05, i % 2 ? p.hullDark : p.warning, -0.64 + i * 0.32, BASE_Y + 1.72, 2.96)));

  // ================================================================ 2. THÁP CANH + CỜ
  add(part("Tháp canh", facets([...oct(0.8, 0.8, 0.2, ROOF, TOWER_Z), ...oct(0.62, 0.62, 0.16, 5.0, TOWER_Z)], p.hull)));
  add(part("Sàn đài canh", facets([...oct(0.95, 0.95, 0.24, 5.0, TOWER_Z), ...oct(0.95, 0.95, 0.24, 5.12, TOWER_Z)], p.hullDark)));
  const low = oct(0.75, 0.75, 0.18, 5.12, TOWER_Z);
  const high = oct(1.0, 1.0, 0.26, 5.85, TOWER_Z);
  add(part("Đài kính canh", facets([...low, ...high], p.glass)));
  low.forEach((a, i) => add(part("Khung kính", strut(a, high[i]!, 0.03, p.metal))));
  add(part("Nóc đài (màu phe)", facets([...oct(1.08, 1.08, 0.28, 5.85, TOWER_Z), ...oct(1.08, 1.08, 0.28, 6.0, TOWER_Z)], p.team)));
  const POLE: [number, number] = [0, TOWER_Z];
  const FLAG_Y = 7.7;
  add(part("Cột cờ", cyl(0.04, 0.06, 2.2, p.metal, 6, POLE[0], 7.05, POLE[1])));
  const flag = part("Lá cờ (màu phe)", group(box(1.5, 0.8, 0.04, p.team, 0.75, 0, 0), box(0.5, 0.12, 0.045, p.white, 0.75, 0, 0)));
  flag.position.set(POLE[0], FLAG_Y, POLE[1]);
  add(flag);

  // ================================================================ 3. PHÁO TRÊN MÁI
  const turret = part(
    "Tháp pháo",
    group(
      part("Vành tháp", cyl(0.8, 0.9, 0.2, p.hullDark, 12, 0, 0.1, 0)),
      part("Thân tháp", facets([[0.68, 0.2, 0.75], [0.68, 0.2, -0.75], [0.52, 0.85, 0.5], [0.52, 0.85, -0.7]], p.hull, true)),
      part("Nóc tháp (màu phe)", box(0.9, 0.04, 1.0, p.team, 0, 0.87, -0.1))
    )
  );
  turret.position.set(0, ROOF + 0.06, 0.9);
  const gun = part("Cụm nòng", group(part("Bệ nòng", box(0.6, 0.4, 0.24, p.hullDark, 0, 0, 0))));
  gun.position.set(0, 0.5, 0.72);
  const b = part("Nòng pháo", tubeZ(0.1, 0.12, 1.5, p.metal, 8));
  b.position.z = 0.75;
  const f = muzzleFlash(0.6, p.flash);
  f.position.z = 1.7;
  gun.add(b, f);
  turret.add(gun);
  add(turret);

  const ring = groundRing(p, 4.2, "capture");
  add(ring.mesh);
  const aim: AimRef = { yaw: null };
  return rig(
    root,
    [WORK, AIM, FIRE, { id: "capture", label: "Vùng chiếm đóng" }],
    6.2,
    [(_dt, t, a) => (flag.rotation.y = a.has("work") ? Math.sin(t * 3) * 0.35 : 0), turretUpdate(turret, gun, [f], BUILDINGS.outpost.weapon!.cooldown, 0.08, 2.5, aim), ring.update],
    ["work"],
    aim
  );
}
